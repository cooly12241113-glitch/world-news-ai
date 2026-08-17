import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { IngestionPipeline } from "../../ingestion";
import { ProductionAcquisitionOrchestrator } from "../../acquisition-orchestration";
import type { RawArtifactCandidate } from "../../raw-persistence";
import type { SourceAcquisitionRequest } from "../../source-connector";
import {
  LiveWebSourceConnector,
  SafeNetworkAcquisitionRuntime,
  type PinnedResponseHeadTransport,
  type SafeResponseHead,
} from "../index";
import { FakeResolver, lifecyclePolicy } from "./lifecycle-test-helpers";

const html = `<!doctype html><html lang="en"><head><title>Live Web Vertical Slice</title></head><body><article><h1>Live Web Vertical Slice</h1><p>The exact validated HTML body reaches governed raw persistence and deterministic ingestion without any refetch or re-decode.</p></article></body></html>`;
const bytes = Buffer.from(html);
const hash = createHash("sha256").update(bytes).digest("hex");
const hints = {
  hints: {
    expectedDocumentType: "NewsArticle" as const,
    expectedLanguage: "en",
    sourceName: "Live Web Fixture",
  },
};
const request = (requestId = "live-web-vertical"): SourceAcquisitionRequest => ({
  requestId,
  connectorId: "web",
  locator: { kind: "web", url: "https://news.example/article" },
  requestedContentKind: "html",
  accessPolicy: { access: "public-only" },
});

interface Action { head: SafeResponseHead; body?: Buffer }
class BodyTransport implements PinnedResponseHeadTransport {
  constructor(readonly actions: Action[]) {}
  requestHead = vi.fn(async () => ({ statusCode: 500 }));
  requestResponse = vi.fn(async () => {
    const action = this.actions.shift();
    if (action === undefined) throw new Error("missing fixture response");
    const body = Readable.from(action.body === undefined ? [] : [action.body]);
    return { head: action.head, body, destroy: () => body.destroy() };
  });
}

const runtime = (
  transport: PinnedResponseHeadTransport,
  resolver = new FakeResolver().set("news.example", "8.8.8.8"),
  policy = lifecyclePolicy(),
) => new SafeNetworkAcquisitionRuntime({ resolver, transport, policy });

const execute = async (
  transport: PinnedResponseHeadTransport,
  acquisition = request(),
  resolver?: FakeResolver,
) => new ProductionAcquisitionOrchestrator(
  new LiveWebSourceConnector(
    runtime(transport, resolver),
    () => "2026-08-17T00:00:00.000Z",
  ),
).execute({ acquisition, bridgeOptions: hints });

describe("live Web HTML production vertical slice", () => {
  it.each([200, 206] as const)("accepts HTTP %i text/html", async (statusCode) => {
    const transport = new BodyTransport([{
      head: { statusCode, contentType: "Text/HTML; Charset=UTF-8" }, body: bytes,
    }]);
    const result = await execute(transport, request(`status-${statusCode}`));

    expect(result).toMatchObject({
      success: true,
      outcome: "ingested",
      acquisition: {
        connectorId: "web",
        acquisitionId: `safe-acquisition:status-${statusCode}`,
        rawArtifact: { mediaType: "text/html", contentHash: hash },
      },
      ingestion: { success: true, trace: { selectedCapability: "generic-html" } },
    });
    expect(transport.requestResponse).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["text/plain", "CONTENT_KIND_MISMATCH"],
    ["application/json", "CONTENT_KIND_MISMATCH"],
    ["application/xml", "CONTENT_KIND_MISMATCH"],
    [undefined, "CONTENT_TYPE_NOT_ALLOWED"],
    ["not a mime", "CONTENT_TYPE_NOT_ALLOWED"],
  ] as const)("rejects non-HTML or invalid MIME %s", async (contentType, reasonCode) => {
    const result = await execute(new BodyTransport([{
      head: { statusCode: 200, ...(contentType ? { contentType } : {}) }, body: bytes,
    }]));
    expect(result).toMatchObject({
      success: false,
      stage: "acquisition",
      acquisition: { reasonCode },
    });
  });

  it("rejects invalid UTF-8 before persistence or ingestion", async () => {
    const persist = vi.fn();
    const pipeline = new IngestionPipeline();
    const ingest = vi.spyOn(pipeline, "ingest");
    const connector = new LiveWebSourceConnector(runtime(new BodyTransport([{
      head: { statusCode: 200, contentType: "text/html" },
      body: Buffer.from([0xc3, 0x28]),
    }])));
    const result = await new ProductionAcquisitionOrchestrator(connector, { pipeline })
      .execute({
        acquisition: request("invalid-utf8"),
        bridgeOptions: hints,
        rawPersistence: {
          service: { persist },
          policy: {} as never,
          context: {} as never,
        },
      });
    expect(result).toMatchObject({
      success: false,
      stage: "acquisition",
      acquisition: { reasonCode: "CHARACTER_ENCODING_NOT_ALLOWED" },
    });
    expect(persist).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it.each([
    ["gzip", gzipSync(bytes)],
    ["deflate", deflateSync(bytes)],
    ["br", brotliCompressSync(bytes)],
  ] as const)("preserves decoded continuity for %s", async (encoding, encoded) => {
    const result = await execute(new BodyTransport([{
      head: {
        statusCode: 200,
        contentType: "text/html",
        contentEncoding: encoding,
      },
      body: encoded,
    }]), request(`encoding-${encoding}`));
    expect(result).toMatchObject({
      success: true,
      acquisition: { rawArtifact: { contentHash: hash, byteLength: bytes.byteLength } },
      ingestion: { document: { contentText: expect.stringContaining("exact validated HTML body") } },
    });
  });

  it("reauthorizes a redirect and still acquires only the terminal body", async () => {
    const transport = new BodyTransport([
      { head: { statusCode: 302, location: "https://final.example/story" } },
      { head: { statusCode: 200, contentType: "text/html" }, body: bytes },
    ]);
    const resolver = new FakeResolver()
      .set("news.example", "8.8.8.8")
      .set("final.example", "1.1.1.1");
    const result = await execute(transport, request("redirect"), resolver);
    expect(result).toMatchObject({ success: true });
    expect(resolver.resolve).toHaveBeenCalledTimes(2);
    expect(transport.requestResponse).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 404, 418] as const)(
    "blocks terminal HTTP %i before downstream",
    async (statusCode) => {
      const result = await execute(new BodyTransport([{
        head: { statusCode, contentType: "text/html" }, body: bytes,
      }]), request(`failure-${statusCode}`));
      expect(result).toMatchObject({ success: false, stage: "acquisition" });
    },
  );

  it("rejects mixed public/private DNS before transport", async () => {
    const transport = new BodyTransport([]);
    const resolver = new FakeResolver().set(
      "news.example",
      "8.8.8.8",
      "127.0.0.1",
    );
    const result = await execute(transport, request("mixed-dns"), resolver);
    expect(result).toMatchObject({
      success: false,
      stage: "acquisition",
      acquisition: { reasonCode: "DNS_MIXED_ADDRESS_SET" },
    });
    expect(transport.requestResponse).not.toHaveBeenCalled();
  });

  it("uses one acquisition for exact raw bytes, hash, identity, and SourceDocument", async () => {
    let candidate: RawArtifactCandidate | undefined;
    const persist = vi.fn((value: RawArtifactCandidate) => {
      candidate = value;
      return { success: true as const, outcome: "persisted" as const, artifactId: value.artifact.artifactId };
    });
    const transport = new BodyTransport([{
      head: { statusCode: 200, contentType: "text/html" }, body: bytes,
    }]);
    const connector = new LiveWebSourceConnector(runtime(transport));
    const acquireDetailed = vi.spyOn(connector, "acquireDetailed");
    const pipeline = new IngestionPipeline();
    const ingest = vi.spyOn(pipeline, "ingest");
    const result = await new ProductionAcquisitionOrchestrator(connector, {
      pipeline,
    }).execute({
      acquisition: request("continuity"),
      bridgeOptions: hints,
      rawPersistence: {
        service: { persist },
        policy: {
          policyId: "policy",
          semanticFingerprint: "f".repeat(64),
        } as never,
        context: {} as never,
      },
    });

    expect(result).toMatchObject({ success: true, outcome: "persisted-and-ingested" });
    expect(acquireDetailed).toHaveBeenCalledTimes(1);
    expect(transport.requestResponse).toHaveBeenCalledTimes(1);
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest).toHaveBeenCalledWith(expect.objectContaining({
      kind: "content",
      content: html,
      mediaType: "text/html",
    }));
    expect(Buffer.from(candidate?.bytes ?? []).equals(bytes)).toBe(true);
    expect(candidate?.artifact.contentHash).toBe(hash);
    if (result.success) {
      expect(candidate?.acquisitionId).toBe(result.acquisition.acquisitionId);
      expect(candidate?.artifact.sourceIdentity).toBe(result.acquisition.sourceIdentity);
      expect(result.ingestion.document.contentText).toContain("exact validated HTML body");
      expect(result.provenance.acquisitionId).toBe(result.acquisition.acquisitionId);
      expect(result.provenance.rawArtifactId).toBe(result.acquisition.rawArtifact.artifactId);
    }
  });

  it.each([
    ["RAW_PERSISTENCE_NOT_ALLOWED", "denial"],
    ["RAW_STORAGE_FAILED", "failure"],
  ] as const)("reports persistence %s as truthful partial success", async (reasonCode, id) => {
    const transport = new BodyTransport([{
      head: { statusCode: 200, contentType: "text/html" }, body: bytes,
    }]);
    const result = await new ProductionAcquisitionOrchestrator(
      new LiveWebSourceConnector(runtime(transport)),
    ).execute({
      acquisition: request(`persistence-${id}`),
      bridgeOptions: hints,
      rawPersistence: {
        service: { persist: () => ({ success: false, reasonCode }) },
        policy: {} as never,
        context: {} as never,
      },
    });
    expect(result).toMatchObject({
      success: false,
      stage: "persistence",
      persistence: { result: { reasonCode } },
      ingestion: { success: true },
    });
    expect(transport.requestResponse).toHaveBeenCalledTimes(1);
  });
});
