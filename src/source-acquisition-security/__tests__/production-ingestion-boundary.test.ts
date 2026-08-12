import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { PassThrough, Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  SafeNetworkAcquisitionRuntime,
  SafeNetworkIngestionService,
  type PinnedResponseHeadTransport,
  type SafeResponseHead,
} from "../index";
import { IngestionPipeline } from "../../ingestion";
import {
  FakeClock,
  FakeResolver,
  lifecycleInput,
  lifecyclePolicy,
} from "./lifecycle-test-helpers";

interface BodyAction {
  head: SafeResponseHead;
  chunks?: Array<Buffer | string>;
}

class SequenceBodyTransport implements PinnedResponseHeadTransport {
  constructor(readonly actions: BodyAction[]) {}
  requestHead = vi.fn(async () => ({ statusCode: 500 }));
  requestResponse = vi.fn(async () => {
    const action = this.actions.shift();
    if (action === undefined) throw new Error("missing deterministic response");
    const body = Readable.from(action.chunks ?? []);
    return { head: action.head, body, destroy: () => body.destroy() };
  });
}

const article = "Security Boundary\n\nThe validated acquisition body is used exactly once for ingestion.";
const bridgeOptions = {
  hints: {
    expectedDocumentType: "NewsArticle" as const,
    expectedLanguage: "en",
    sourceName: "Safe Fixture",
  },
};
const request = (url = "https://a.example/article") => ({
  ...lifecycleInput(url).request,
  requestId: `request-${createHash("sha256").update(url).digest("hex").slice(0, 12)}`,
});
const service = (
  resolver: FakeResolver,
  transport: PinnedResponseHeadTransport,
  options: { policy?: ReturnType<typeof lifecyclePolicy>; clock?: FakeClock } = {},
) => new SafeNetworkIngestionService(new SafeNetworkAcquisitionRuntime({
  resolver,
  transport,
  policy: options.policy ?? lifecyclePolicy(),
  clock: options.clock,
}));

describe("production URL ingestion security boundary", () => {
  it("fails closed with zero network calls when URL-only pipeline has no safe runtime", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await new IngestionPipeline().ingest({
      kind: "url", url: "https://a.example/article",
    });
    expect(result).toMatchObject({
      success: false, error: { code: "SAFE_ACQUISITION_REQUIRED" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("keeps already-materialized text ingestion network-free", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await new IngestionPipeline().ingest({
      kind: "content",
      content: article,
      mediaType: "text/plain",
      sourceUrl: "https://a.example/article",
      retrievedAt: "2026-08-13T00:00:00.000Z",
      hints: bridgeOptions.hints,
    });
    expect(result.success).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("uses one safe acquisition and creates SourceDocument from the exact body", async () => {
    const transport = new SequenceBodyTransport([{
      head: { statusCode: 200, contentType: "text/plain" }, chunks: [article],
    }]);
    const result = await service(
      new FakeResolver().set("a.example", "8.8.8.8"), transport,
    ).ingest(request(), {}, bridgeOptions);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.ingestion.document.contentText)
        .toBe(article);
      expect(result.acquisition.content.text).toBe(article);
      expect(result.acquisition.rawArtifact.contentHash).toBe(
        createHash("sha256").update(article).digest("hex"),
      );
    }
    expect(transport.requestResponse).toHaveBeenCalledTimes(1);
  });

  it.each([
    "http://localhost/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://10.0.0.1/",
    "http://169.254.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::ffff:127.0.0.1]/",
  ])("denies unsafe target through the public ingestion service: %s", async (url) => {
    const resolver = new FakeResolver().set("localhost", "127.0.0.1");
    const transport = new SequenceBodyTransport([]);
    const result = await service(resolver, transport).ingest(request(url));
    expect(result).toMatchObject({ success: false, stage: "acquisition" });
    expect(transport.requestResponse).not.toHaveBeenCalled();
  });

  it("denies a mixed DNS answer through the public ingestion service", async () => {
    const transport = new SequenceBodyTransport([]);
    const result = await service(
      new FakeResolver().set("a.example", "8.8.8.8", "10.0.0.1"), transport,
    ).ingest(request());
    expect(result).toMatchObject({
      success: false,
      stage: "acquisition",
      acquisition: { reasonCode: "DNS_MIXED_ADDRESS_SET" },
    });
    expect(transport.requestResponse).not.toHaveBeenCalled();
  });

  it("reauthorizes and denies a redirect to a private target", async () => {
    const transport = new SequenceBodyTransport([{
      head: { statusCode: 302, location: "http://127.0.0.1/private" },
    }]);
    const result = await service(
      new FakeResolver().set("a.example", "8.8.8.8"), transport,
    ).ingest(request());
    expect(result).toMatchObject({
      success: false,
      stage: "acquisition",
      acquisition: { reasonCode: "UNSAFE_IP_ADDRESS" },
    });
    expect(transport.requestResponse).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized chunked body before ingestion", async () => {
    const transport = new SequenceBodyTransport([{
      head: { statusCode: 200, contentType: "text/plain" }, chunks: ["12345"],
    }]);
    const result = await service(
      new FakeResolver().set("a.example", "8.8.8.8"), transport,
      { policy: lifecyclePolicy({ maxEncodedBodyBytes: 4, maxDecodedBodyBytes: 4 }) },
    ).ingest(request(), {}, bridgeOptions);
    expect(result).toMatchObject({
      success: false,
      stage: "acquisition",
      acquisition: { reasonCode: "ENCODED_BODY_TOO_LARGE" },
    });
  });

  it("rejects a compression bomb before ingestion", async () => {
    const compressed = gzipSync(Buffer.from("x".repeat(10_000)));
    const transport = new SequenceBodyTransport([{
      head: { statusCode: 200, contentType: "text/plain", contentEncoding: "gzip" },
      chunks: [compressed],
    }]);
    const result = await service(
      new FakeResolver().set("a.example", "8.8.8.8"), transport,
      { policy: lifecyclePolicy({
        maxEncodedBodyBytes: compressed.byteLength,
        maxDecodedBodyBytes: 100,
      }) },
    ).ingest(request(), {}, bridgeOptions);
    expect(result).toMatchObject({
      success: false,
      stage: "acquisition",
      acquisition: { reasonCode: "DECOMPRESSED_BODY_TOO_LARGE" },
    });
  });

  it("preserves cancellation before DNS and never starts ingestion", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const transport = new SequenceBodyTransport([]);
    const result = await service(resolver, transport).ingest(request(), {
      cancellation: { isCancellationRequested: () => true },
    });
    expect(result).toMatchObject({
      success: false,
      stage: "acquisition",
      acquisition: { reasonCode: "ACQUISITION_CANCELLED" },
    });
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("preserves cancellation during body streaming through the public service", async () => {
    const body = new PassThrough();
    let cancelled = false;
    const transport: PinnedResponseHeadTransport = {
      requestHead: vi.fn(),
      requestResponse: vi.fn(async () => {
        setTimeout(() => { cancelled = true; }, 10);
        return {
          head: { statusCode: 200, contentType: "text/plain" },
          body,
          destroy: () => body.destroy(),
        };
      }),
    };
    const result = await service(
      new FakeResolver().set("a.example", "8.8.8.8"), transport,
      { policy: lifecyclePolicy({ bodyIdleTimeoutMs: 100 }) },
    ).ingest(request(), {
      cancellation: { isCancellationRequested: () => cancelled },
    }, bridgeOptions);
    expect(result).toMatchObject({
      success: false,
      stage: "acquisition",
      acquisition: { reasonCode: "ACQUISITION_CANCELLED" },
    });
    expect(body.destroyed).toBe(true);
  });

  it("preserves the overall deadline through the public service", async () => {
    const clock = new FakeClock();
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    resolver.onResolve = () => clock.advance(10_000);
    const result = await service(resolver, new SequenceBodyTransport([]), {
      clock, policy: lifecyclePolicy({ overallDeadlineMs: 10_000 }),
    }).ingest(request());
    expect(result).toMatchObject({
      success: false,
      stage: "acquisition",
      acquisition: { reasonCode: "OVERALL_DEADLINE_EXCEEDED" },
    });
  });

  it("preserves the body-idle timeout through the public service", async () => {
    const body = new PassThrough();
    const transport: PinnedResponseHeadTransport = {
      requestHead: vi.fn(),
      requestResponse: vi.fn(async () => ({
        head: { statusCode: 200, contentType: "text/plain" },
        body,
        destroy: () => body.destroy(),
      })),
    };
    const result = await service(
      new FakeResolver().set("a.example", "8.8.8.8"), transport,
      { policy: lifecyclePolicy({ bodyIdleTimeoutMs: 15 }) },
    ).ingest(request(), {}, bridgeOptions);
    expect(result).toMatchObject({
      success: false,
      stage: "acquisition",
      acquisition: { reasonCode: "BODY_IDLE_TIMEOUT" },
    });
    expect(body.destroyed).toBe(true);
  });

  it("requires no raw persistence dependency and keeps raw hash available", async () => {
    const result = await service(
      new FakeResolver().set("a.example", "8.8.8.8"),
      new SequenceBodyTransport([{
        head: { statusCode: 200, contentType: "text/plain" }, chunks: [article],
      }]),
    ).ingest(request(), {}, bridgeOptions);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.acquisition.rawArtifact.contentHash).toBeTruthy();
      expect(result.provenance.rawArtifactId)
        .toBe(result.acquisition.rawArtifact.artifactId);
    }
  });
});
