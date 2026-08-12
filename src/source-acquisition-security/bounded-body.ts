import { createHash } from "node:crypto";
import { Transform, Writable, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type {
  MonotonicClock,
  SafeAcquiredBody,
  SafeLifecyclePolicy,
  SafeResponseHead,
} from "./lifecycle-models";
import { TargetSecurityError } from "./models";
import type { SourceAcquisitionRequest, SourceConnectorCancellation } from "../source-connector";

type SupportedEncoding = SafeAcquiredBody["contentEncoding"];

const MIME_KIND = new Map<string, "text" | "html">([
  ["text/html", "html"],
  ["text/plain", "text"],
  ["application/json", "text"],
  ["application/xml", "text"],
  ["text/xml", "text"],
  ["application/rss+xml", "text"],
  ["application/atom+xml", "text"],
]);

const parseMediaType = (value: string | undefined): {
  mediaType: string;
  contentKind: "text" | "html";
} => {
  if (value === undefined || /[\r\n]/u.test(value)) {
    throw new TargetSecurityError("CONTENT_TYPE_NOT_ALLOWED");
  }
  const parts = value.split(";").map((part) => part.trim());
  const mediaType = parts.shift()?.toLowerCase();
  if (mediaType === undefined || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(mediaType)) {
    throw new TargetSecurityError("CONTENT_TYPE_NOT_ALLOWED");
  }
  for (const parameter of parts) {
    const match = /^charset\s*=\s*"?([^";\s]+)"?$/iu.exec(parameter);
    if (match === null) throw new TargetSecurityError("CONTENT_TYPE_NOT_ALLOWED");
    if (!/^utf-8$/iu.test(match[1] ?? "")) {
      throw new TargetSecurityError("CHARACTER_ENCODING_NOT_ALLOWED");
    }
  }
  const contentKind = MIME_KIND.get(mediaType);
  if (contentKind === undefined) {
    throw new TargetSecurityError("CONTENT_TYPE_NOT_ALLOWED");
  }
  return { mediaType, contentKind };
};

const parseEncoding = (value: string | undefined): SupportedEncoding => {
  const normalized = (value ?? "identity").trim().toLowerCase();
  if (normalized.includes(",") ||
      !(["identity", "gzip", "deflate", "br"] as string[]).includes(normalized)) {
    throw new TargetSecurityError("CONTENT_ENCODING_NOT_ALLOWED");
  }
  return normalized as SupportedEncoding;
};

const decoderFor = (encoding: SupportedEncoding): Transform | undefined => {
  if (encoding === "gzip") return createGunzip();
  if (encoding === "deflate") return createInflate();
  if (encoding === "br") return createBrotliDecompress();
  return undefined;
};

export interface BoundedBodyInput {
  stream: Readable;
  head: SafeResponseHead;
  request: SourceAcquisitionRequest;
  policy: SafeLifecyclePolicy;
  cancellation?: SourceConnectorCancellation;
  overallDeadlineAtMs: number;
  clock: MonotonicClock;
}

export const acquireBoundedBody = async (
  input: BoundedBodyInput,
): Promise<SafeAcquiredBody> => {
  const { mediaType, contentKind } = parseMediaType(input.head.contentType);
  if (input.request.requestedContentKind !== undefined &&
      input.request.requestedContentKind !== contentKind) {
    throw new TargetSecurityError("CONTENT_KIND_MISMATCH");
  }
  const encoding = parseEncoding(input.head.contentEncoding);
  if (input.head.contentLength !== undefined &&
      input.head.contentLength > input.policy.maxEncodedBodyBytes) {
    throw new TargetSecurityError("ENCODED_BODY_TOO_LARGE");
  }

  let encodedBytes = 0;
  let decodedBytes = 0;
  let settled = false;
  let idleTimer: ReturnType<typeof setTimeout>;
  let deadlineTimer: ReturnType<typeof setTimeout>;
  let cancellationPoll: ReturnType<typeof setInterval>;
  const chunks: Buffer[] = [];
  const hash = createHash("sha256");
  const decompressor = decoderFor(encoding);
  const fail = (reasonCode: ConstructorParameters<typeof TargetSecurityError>[0]) => {
    if (settled) return;
    const error = new TargetSecurityError(reasonCode);
    input.stream.destroy(error);
    encodedCounter.destroy(error);
    decompressor?.destroy(error);
    collector.destroy(error);
  };
  const resetIdle = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => fail("BODY_IDLE_TIMEOUT"), input.policy.bodyIdleTimeoutMs);
  };
  const encodedCounter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      encodedBytes += chunk.byteLength;
      if (encodedBytes > input.policy.maxEncodedBodyBytes) {
        callback(new TargetSecurityError("ENCODED_BODY_TOO_LARGE"));
        return;
      }
      resetIdle();
      callback(null, chunk);
    },
  });
  const collector = new Writable({
    write(value: Buffer | Uint8Array, _encoding, callback) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      decodedBytes += chunk.byteLength;
      if (decodedBytes > input.policy.maxDecodedBodyBytes) {
        callback(new TargetSecurityError(
          encoding === "identity" ? "RESPONSE_BODY_TOO_LARGE" : "DECOMPRESSED_BODY_TOO_LARGE",
        ));
        return;
      }
      hash.update(chunk);
      chunks.push(chunk);
      callback();
    },
  });

  resetIdle();
  deadlineTimer = setTimeout(
    () => fail("OVERALL_DEADLINE_EXCEEDED"),
    Math.max(0, input.overallDeadlineAtMs - input.clock.nowMs()),
  );
  cancellationPoll = setInterval(() => {
    if (input.cancellation?.isCancellationRequested() === true) {
      fail("ACQUISITION_CANCELLED");
    }
  }, 10);

  try {
    if (decompressor === undefined) {
      await pipeline(input.stream, encodedCounter, collector);
    } else {
      await pipeline(input.stream, encodedCounter, decompressor, collector);
    }
    if (input.cancellation?.isCancellationRequested() === true) {
      throw new TargetSecurityError("ACQUISITION_CANCELLED");
    }
    if (input.clock.nowMs() >= input.overallDeadlineAtMs) {
      throw new TargetSecurityError("OVERALL_DEADLINE_EXCEEDED");
    }
    settled = true;
    const bytes = Buffer.concat(chunks, decodedBytes);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new TargetSecurityError("CHARACTER_ENCODING_NOT_ALLOWED");
    }
    return {
      bytes,
      text,
      mediaType,
      contentKind,
      contentEncoding: encoding,
      encodedBytesReceived: encodedBytes,
      decodedBytesProduced: decodedBytes,
      decodedSha256: hash.digest("hex"),
    };
  } catch (error) {
    input.stream.destroy();
    decompressor?.destroy();
    if (error instanceof TargetSecurityError) throw error;
    throw new TargetSecurityError(
      decompressor === undefined ? "RESPONSE_STREAM_FAILED" : "DECOMPRESSION_FAILED",
    );
  } finally {
    settled = true;
    clearTimeout(idleTimer!);
    clearTimeout(deadlineTimer!);
    clearInterval(cancellationPoll!);
  }
};
