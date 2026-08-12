import { gzipSync } from "node:zlib";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  SafeNetworkAcquisitionRuntime,
  acquireBoundedBody,
  type AcquisitionAttemptAuditSink,
  type PinnedResponseHeadTransport,
  type SafeAcquisitionAttemptAudit,
} from "../index";
import {
  FakeResolver,
  lifecycleInput,
  lifecyclePolicy,
} from "./lifecycle-test-helpers";

const clock = { nowMs: () => performance.now() };

const acquire = (
  chunks: Buffer[],
  contentEncoding?: string,
) => acquireBoundedBody({
  stream: Readable.from(chunks),
  head: {
    statusCode: 200,
    contentType: "text/plain",
    ...(contentEncoding === undefined ? {} : { contentEncoding }),
  },
  request: lifecycleInput().request,
  policy: lifecyclePolicy(),
  overallDeadlineAtMs: clock.nowMs() + 2_000,
  clock,
});

describe("independent bounded-body security review", () => {
  it("accepts a valid UTF-8 code point split across stream chunks", async () => {
    const encoded = Buffer.from("A😀B", "utf8");
    const result = await acquire([
      encoded.subarray(0, 3),
      encoded.subarray(3, 5),
      encoded.subarray(5),
    ]);
    expect(result.text).toBe("A😀B");
  });

  it("rejects invalid UTF-8 late in the stream without a successful hash", async () => {
    const error = await acquire([
      Buffer.from("valid prefix", "utf8"),
      Buffer.from([0xff]),
    ]).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ reasonCode: "CHARACTER_ENCODING_NOT_ALLOWED" });
    expect(error).not.toHaveProperty("decodedSha256");
  });

  it("hashes equivalent identity and gzip bodies to the same decoded identity", async () => {
    const bytes = Buffer.from("same decoded content", "utf8");
    const identity = await acquire([bytes]);
    const gzip = await acquire([gzipSync(bytes)], "gzip");
    expect(gzip.decodedSha256).toBe(identity.decodedSha256);
    expect(gzip.text).toBe(identity.text);
  });

  it("does not emit an unvalidated Content-Type header into failure audit", async () => {
    const events: SafeAcquisitionAttemptAudit[] = [];
    const auditSink: AcquisitionAttemptAuditSink = {
      record: (event) => events.push(event),
    };
    const rawContentType = "text/plain; attacker-secret=reflected-value";
    const transport: PinnedResponseHeadTransport = {
      requestHead: vi.fn(),
      requestResponse: vi.fn(async () => {
        const body = Readable.from(["body"]);
        return {
          head: { statusCode: 200, contentType: rawContentType },
          body,
          destroy: () => body.destroy(),
        };
      }),
    };
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver: new FakeResolver().set("a.example", "8.8.8.8"),
      transport,
      auditSink,
      policy: lifecyclePolicy(),
    }).execute(lifecycleInput());

    expect(result).toMatchObject({
      success: false,
      reasonCode: "CONTENT_TYPE_NOT_ALLOWED",
    });
    expect(JSON.stringify(events)).not.toContain(rawContentType);
    expect(events[0]).not.toHaveProperty("contentType");
    expect(events[0]).not.toHaveProperty("contentHash");
  });
});
