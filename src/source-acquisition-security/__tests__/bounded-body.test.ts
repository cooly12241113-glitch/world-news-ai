import { PassThrough, Readable } from "node:stream";
import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  HARD_MAX_BODY_IDLE_TIMEOUT_MS,
  HARD_MAX_DECODED_BODY_BYTES,
  HARD_MAX_ENCODED_BODY_BYTES,
  SafeNetworkAcquisitionRuntime,
  acquireBoundedBody,
  type SafeLifecyclePolicy,
} from "../index";
import { lifecycleInput, lifecyclePolicy } from "./lifecycle-test-helpers";

const clock = { nowMs: () => performance.now() };
const acquire = (
  chunks: Array<Buffer | string>,
  options: {
    head?: { contentType?: string; contentLength?: number; contentEncoding?: string };
    policy?: Partial<SafeLifecyclePolicy>;
    requestedContentKind?: "text" | "html";
  } = {},
) => {
  const request = lifecycleInput().request;
  request.requestedContentKind = options.requestedContentKind;
  return acquireBoundedBody({
    stream: Readable.from(chunks),
    head: { statusCode: 200, contentType: "text/plain", ...options.head },
    request,
    policy: lifecyclePolicy(options.policy),
    overallDeadlineAtMs: clock.nowMs() + 2_000,
    clock,
  });
};

describe("bounded response body", () => {
  it("validates positive finite defaults against absolute security ceilings", () => {
    const dependencies = {
      resolver: { resolve: async () => [] },
      transport: { requestHead: async () => ({ statusCode: 200 }) },
    };
    expect(() => new SafeNetworkAcquisitionRuntime({
      ...dependencies,
      policy: lifecyclePolicy({
        maxEncodedBodyBytes: HARD_MAX_ENCODED_BODY_BYTES,
        maxDecodedBodyBytes: HARD_MAX_DECODED_BODY_BYTES,
        bodyIdleTimeoutMs: HARD_MAX_BODY_IDLE_TIMEOUT_MS,
      }),
    })).not.toThrow();
    for (const policy of [
      { maxEncodedBodyBytes: 0 },
      { maxDecodedBodyBytes: Number.POSITIVE_INFINITY },
      { bodyIdleTimeoutMs: HARD_MAX_BODY_IDLE_TIMEOUT_MS + 1 },
    ]) {
      expect(() => new SafeNetworkAcquisitionRuntime({
        ...dependencies,
        policy: lifecyclePolicy(policy),
      })).toThrow("INVALID_SAFE_LIFECYCLE_POLICY");
    }
  });

  it("accepts exactly the decoded limit and hashes incrementally", async () => {
    const result = await acquire(["ab", "cd"], {
      policy: { maxEncodedBodyBytes: 4, maxDecodedBodyBytes: 4 },
    });
    expect(result).toMatchObject({
      text: "abcd",
      encodedBytesReceived: 4,
      decodedBytesProduced: 4,
      decodedSha256: "88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589",
    });
  });

  it("rejects one byte above the actual limit with no Content-Length", async () => {
    await expect(acquire(["abcd", "e"], {
      policy: { maxEncodedBodyBytes: 5, maxDecodedBodyBytes: 4 },
    })).rejects.toMatchObject({ reasonCode: "RESPONSE_BODY_TOO_LARGE" });
  });

  it("rejects a declared encoded size before reading body", async () => {
    await expect(acquire(["never-read"], {
      head: { contentLength: 101 },
      policy: { maxEncodedBodyBytes: 100 },
    })).rejects.toMatchObject({ reasonCode: "ENCODED_BODY_TOO_LARGE" });
  });

  it("does not trust a false-small Content-Length", async () => {
    await expect(acquire(["12345"], {
      head: { contentLength: 1 },
      policy: { maxEncodedBodyBytes: 4, maxDecodedBodyBytes: 4 },
    })).rejects.toMatchObject({ reasonCode: "ENCODED_BODY_TOO_LARGE" });
  });

  it.each([
    ["gzip", gzipSync] as const,
    ["deflate", deflateSync] as const,
    ["br", brotliCompressSync] as const,
  ])("streams and hashes valid %s content", async (contentEncoding, compress) => {
    const result = await acquire([compress(Buffer.from("bounded text"))], {
      head: { contentEncoding },
    });
    expect(result).toMatchObject({ text: "bounded text", contentEncoding });
  });

  it("stops a highly compressible body at the decoded ceiling", async () => {
    const compressed = gzipSync(Buffer.from("x".repeat(10_000)));
    await expect(acquire([compressed], {
      head: { contentEncoding: "gzip" },
      policy: { maxEncodedBodyBytes: compressed.length, maxDecodedBodyBytes: 100 },
    })).rejects.toMatchObject({ reasonCode: "DECOMPRESSED_BODY_TOO_LARGE" });
  });

  it("stops compressed input at its independent encoded ceiling", async () => {
    const compressed = gzipSync(Buffer.from("content"));
    await expect(acquire([compressed], {
      head: { contentEncoding: "gzip" },
      policy: { maxEncodedBodyBytes: compressed.length - 1 },
    })).rejects.toMatchObject({ reasonCode: "ENCODED_BODY_TOO_LARGE" });
  });

  it.each(["gzip", "deflate", "br"])("sanitizes corrupt %s data", async (contentEncoding) => {
    await expect(acquire([Buffer.from("not-compressed")], {
      head: { contentEncoding },
    })).rejects.toMatchObject({ reasonCode: "DECOMPRESSION_FAILED" });
  });

  it.each(["zstd", "gzip, br"])("rejects unsupported encoding %s", async (contentEncoding) => {
    await expect(acquire(["body"], { head: { contentEncoding } }))
      .rejects.toMatchObject({ reasonCode: "CONTENT_ENCODING_NOT_ALLOWED" });
  });

  it.each([
    ["text/html; charset=UTF-8", "html"],
    ["TEXT/PLAIN", "text"],
    ["application/json", "text"],
    ["application/xml", "text"],
    ["text/xml", "text"],
    ["application/rss+xml", "text"],
    ["application/atom+xml", "text"],
  ] as const)("accepts MIME %s as %s", async (contentType, contentKind) => {
    await expect(acquire(["body"], { head: { contentType } }))
      .resolves.toMatchObject({ mediaType: contentType.split(";")[0]?.toLowerCase(), contentKind });
  });

  it.each([undefined, "application/octet-stream", "not a mime", "text/plain; boundary=x"])(
    "fails closed for missing/malformed/binary MIME %s",
    async (contentType) => {
      await expect(acquire(["body"], { head: { contentType } }))
        .rejects.toMatchObject({ reasonCode: "CONTENT_TYPE_NOT_ALLOWED" });
    },
  );

  it("rejects MIME and requested content-kind mismatch", async () => {
    await expect(acquire(["body"], {
      head: { contentType: "text/plain" },
      requestedContentKind: "html",
    })).rejects.toMatchObject({ reasonCode: "CONTENT_KIND_MISMATCH" });
  });

  it("rejects non-UTF-8 charset and invalid UTF-8 bytes", async () => {
    await expect(acquire(["body"], {
      head: { contentType: "text/plain; charset=iso-8859-1" },
    })).rejects.toMatchObject({ reasonCode: "CHARACTER_ENCODING_NOT_ALLOWED" });
    await expect(acquire([Buffer.from([0xff])]))
      .rejects.toMatchObject({ reasonCode: "CHARACTER_ENCODING_NOT_ALLOWED" });
  });

  it("times out an endless idle body", async () => {
    const stream = new PassThrough();
    const request = lifecycleInput().request;
    await expect(acquireBoundedBody({
      stream,
      head: { statusCode: 200, contentType: "text/plain" },
      request,
      policy: lifecyclePolicy({ bodyIdleTimeoutMs: 15 }),
      overallDeadlineAtMs: clock.nowMs() + 1_000,
      clock,
    })).rejects.toMatchObject({ reasonCode: "BODY_IDLE_TIMEOUT" });
    expect(stream.destroyed).toBe(true);
  });

  it("lets overall deadline dominate a slow trickle", async () => {
    const stream = new PassThrough();
    const interval = setInterval(() => stream.write("x"), 5);
    try {
      await expect(acquireBoundedBody({
        stream,
        head: { statusCode: 200, contentType: "text/plain" },
        request: lifecycleInput().request,
        policy: lifecyclePolicy({ bodyIdleTimeoutMs: 50 }),
        overallDeadlineAtMs: clock.nowMs() + 20,
        clock,
      })).rejects.toMatchObject({ reasonCode: "OVERALL_DEADLINE_EXCEEDED" });
    } finally {
      clearInterval(interval);
    }
  });

  it("cancels during body streaming and rejects late bytes", async () => {
    const stream = new PassThrough();
    let cancelled = false;
    setTimeout(() => { cancelled = true; }, 10);
    await expect(acquireBoundedBody({
      stream,
      head: { statusCode: 200, contentType: "text/plain" },
      request: lifecycleInput().request,
      policy: lifecyclePolicy({ bodyIdleTimeoutMs: 100 }),
      cancellation: { isCancellationRequested: () => cancelled },
      overallDeadlineAtMs: clock.nowMs() + 1_000,
      clock,
    })).rejects.toMatchObject({ reasonCode: "ACQUISITION_CANCELLED" });
    expect(stream.destroyed).toBe(true);
  });

  it("cancels while a gzip decompressor is active", async () => {
    const stream = new PassThrough();
    let cancelled = false;
    stream.write(gzipSync(Buffer.from("partial source")).subarray(0, 5));
    setTimeout(() => { cancelled = true; }, 10);
    await expect(acquireBoundedBody({
      stream,
      head: {
        statusCode: 200,
        contentType: "text/plain",
        contentEncoding: "gzip",
      },
      request: lifecycleInput().request,
      policy: lifecyclePolicy({ bodyIdleTimeoutMs: 100 }),
      cancellation: { isCancellationRequested: () => cancelled },
      overallDeadlineAtMs: clock.nowMs() + 1_000,
      clock,
    })).rejects.toMatchObject({ reasonCode: "ACQUISITION_CANCELLED" });
    expect(stream.destroyed).toBe(true);
  });
});
