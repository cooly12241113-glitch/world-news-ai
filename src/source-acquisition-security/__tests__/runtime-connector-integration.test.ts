import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  SafeNetworkAcquisitionRuntime,
  SafeRuntimeFixtureConnector,
  SafeRuntimeSourceConnector,
  type AcquisitionAttemptAuditSink,
  type PinnedResponseHeadTransport,
  type SafeAcquisitionAttemptAudit,
} from "../index";
import { SourceAcquisitionIngestionBridge } from "../../source-connector";
import { FakeResolver, lifecycleInput, lifecyclePolicy } from "./lifecycle-test-helpers";

const bodyTransport = (
  body: string,
  contentType = "text/plain",
): PinnedResponseHeadTransport => ({
  requestHead: vi.fn(),
  requestResponse: vi.fn(async () => {
    const stream = Readable.from([body]);
    return {
      head: { statusCode: 200, contentType },
      body: stream,
      destroy: () => stream.destroy(),
    };
  }),
});

describe("safe runtime connector integration", () => {
  it("projects one bounded acquisition through the existing ingestion bridge", async () => {
    const runtime = new SafeNetworkAcquisitionRuntime({
      resolver: new FakeResolver().set("a.example", "8.8.8.8"),
      transport: bodyTransport("bounded connector text"),
      policy: lifecyclePolicy(),
    });
    const connector = new SafeRuntimeFixtureConnector(runtime);
    const result = await connector.acquire(lifecycleInput().request);
    expect(result).toMatchObject({
      success: true,
      rawArtifact: {
        contentKind: "text",
        mediaType: "text/plain",
        byteLength: 22,
      },
      content: { text: "bounded connector text" },
    });
    const projection = new SourceAcquisitionIngestionBridge().project(result);
    expect(projection).toMatchObject({
      success: true,
      projection: {
        ingestionRequest: {
          kind: "content",
          content: "bounded connector text",
          mediaType: "text/plain",
        },
      },
    });
  });

  it("forwards safe runtime failures without creating a second taxonomy", async () => {
    const executor = {
      execute: vi.fn(async () => ({
        success: false as const,
        connectorId: "web" as const,
        locator: { kind: "web" as const, url: "https://a.example/" },
        requestId: "request-lifecycle",
        outcome: "unsupported" as const,
        retryable: false,
        reasonCode: "CONTENT_TYPE_NOT_ALLOWED",
      })),
    };
    await expect(new SafeRuntimeFixtureConnector(executor)
      .acquire(lifecycleInput().request)).resolves.toMatchObject({
      success: false,
      outcome: "unsupported",
      reasonCode: "CONTENT_TYPE_NOT_ALLOWED",
    });
  });

  it("supports a configurable RSS capability without adding network authority", async () => {
    const transport = bodyTransport(
      "<?xml version=\"1.0\"?><rss><channel><title>Feed</title></channel></rss>",
      "application/rss+xml",
    );
    const runtime = new SafeNetworkAcquisitionRuntime({
      resolver: new FakeResolver().set("a.example", "8.8.8.8"),
      transport,
      policy: lifecyclePolicy(),
    });
    const connector = new SafeRuntimeSourceConnector(runtime, {
      capability: {
        connectorId: "rss",
        connectorVersion: "contract-gate-1",
        supportedContentKinds: ["text"],
        credentialRequirement: { kind: "none" },
        paginationSupport: "none",
        incrementalFetchSupport: false,
        canonicalLocatorSupport: false,
        timestampSupport: true,
      },
      now: () => "2026-08-17T00:00:00.000Z",
    });
    const result = await connector.acquire({
      requestId: "rss-contract-gate",
      connectorId: "rss",
      locator: { kind: "web", url: "https://a.example/feed.xml" },
      requestedContentKind: "text",
      accessPolicy: { access: "public-only" },
    });

    expect(result).toMatchObject({
      success: true,
      connectorId: "rss",
      acquisitionId: "safe-acquisition:rss-contract-gate",
      rawArtifact: {
        contentKind: "text",
        mediaType: "application/rss+xml",
      },
      trace: { connectorVersion: "contract-gate-1" },
    });
    expect(transport.requestResponse).toHaveBeenCalledTimes(1);
  });

  it("rejects connector capability mismatch before executing the safe runtime", async () => {
    const executor = { execute: vi.fn() };
    const connector = new SafeRuntimeSourceConnector(executor, {
      capability: {
        connectorId: "rss",
        connectorVersion: "contract-gate-1",
        supportedContentKinds: ["text"],
        credentialRequirement: { kind: "none" },
        paginationSupport: "none",
        incrementalFetchSupport: false,
        canonicalLocatorSupport: false,
        timestampSupport: true,
      },
    });
    const result = await connector.acquire(lifecycleInput().request);

    expect(result).toMatchObject({
      success: false,
      connectorId: "rss",
      outcome: "unsupported",
      reasonCode: "TARGET_UNSUPPORTED",
    });
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("emits bounded privacy-minimized audit without query, body, or native errors", async () => {
    const events: SafeAcquisitionAttemptAudit[] = [];
    const auditSink: AcquisitionAttemptAuditSink = {
      record: (event) => events.push(event),
    };
    const input = lifecycleInput("https://a.example/path?secret=token#fragment");
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver: new FakeResolver().set("a.example", "8.8.8.8"),
      transport: bodyTransport("PRIVATE BODY"),
      auditSink,
      policy: lifecyclePolicy(),
    }).execute(input);
    expect(result.success).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      hostname: "a.example",
      contentType: "text/plain",
      encodedBytes: 12,
      decodedBytes: 12,
      outcome: "succeeded",
    });
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("PRIVATE BODY");
    expect(serialized).not.toContain("stack");
  });

  it("isolates an audit adapter failure from bounded acquisition", async () => {
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver: new FakeResolver().set("a.example", "8.8.8.8"),
      transport: bodyTransport("safe body"),
      auditSink: { record: () => { throw new Error("audit backend failed"); } },
      policy: lifecyclePolicy(),
    }).execute(lifecycleInput());
    expect(result).toMatchObject({ success: true, body: { text: "safe body" } });
  });

  it("audits only canonical MIME after successful validation", async () => {
    const events: SafeAcquisitionAttemptAudit[] = [];
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver: new FakeResolver().set("a.example", "8.8.8.8"),
      transport: bodyTransport("safe body", "Text/HTML; Charset=UTF-8"),
      auditSink: { record: (event) => events.push(event) },
      policy: lifecyclePolicy(),
    }).execute(lifecycleInput());
    expect(result.success).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.contentType).toBe("text/html");
    expect(JSON.stringify(events)).not.toContain("Charset");
  });

  it.each([
    "not a mime",
    "application/octet-stream",
    "text/plain; attacker-secret=reflected-value",
    `text/plain; charset=UTF-8; secret=${"x".repeat(200)}`,
  ])("never audits an unvalidated raw MIME value: %s", async (rawContentType) => {
    const events: SafeAcquisitionAttemptAudit[] = [];
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver: new FakeResolver().set("a.example", "8.8.8.8"),
      transport: bodyTransport("PRIVATE BODY", rawContentType),
      auditSink: { record: (event) => events.push(event) },
      policy: lifecyclePolicy(),
    }).execute(lifecycleInput("https://a.example/path?secret=query#fragment"));
    expect(result.success).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0]).not.toHaveProperty("contentType");
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain(rawContentType);
    expect(serialized).not.toContain("PRIVATE BODY");
    expect(serialized).not.toContain("secret=query");
    expect(serialized).not.toContain("Location");
    expect(serialized).not.toContain("native");
  });
});
