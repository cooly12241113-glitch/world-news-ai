import http from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import type { TLSSocket } from "node:tls";
import { createPinnedRequestOptions, verifyPinnedPeerAddress } from "./pinned-transport";
import {
  TargetSecurityError,
  type ApprovedEgressTarget,
} from "./models";
import type {
  PinnedResponseHeadTransport,
  ResponseHeadAttemptContext,
  SafePinnedResponse,
  SafeResponseHead,
} from "./lifecycle-models";
import { HARD_MAX_RESPONSE_HEADER_BYTES } from "./lifecycle-models";

const boundedHeader = (
  value: string | string[] | undefined,
  maximumLength: number,
): string | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value) || value.length > maximumLength) {
    throw new TargetSecurityError("RESPONSE_HEADERS_INVALID");
  }
  return value;
};

const parseContentLength = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  if (!/^\d{1,16}$/u.test(value)) {
    throw new TargetSecurityError("RESPONSE_HEADERS_INVALID");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new TargetSecurityError("RESPONSE_HEADERS_INVALID");
  }
  return parsed;
};

export class NodePinnedResponseHeadTransport
implements PinnedResponseHeadTransport {
  async requestHead(
    target: ApprovedEgressTarget,
    context: ResponseHeadAttemptContext,
  ): Promise<SafeResponseHead> {
    const response = await this.requestResponse(target, context);
    response.destroy();
    return response.head;
  }

  requestResponse(
    target: ApprovedEgressTarget,
    context: ResponseHeadAttemptContext,
  ): Promise<SafePinnedResponse> {
    if (!Number.isInteger(context.maxHeaderSizeBytes) ||
        context.maxHeaderSizeBytes <= 0 ||
        context.maxHeaderSizeBytes > HARD_MAX_RESPONSE_HEADER_BYTES) {
      return Promise.reject(new TargetSecurityError("RESPONSE_HEADERS_INVALID"));
    }
    const options = {
      ...createPinnedRequestOptions(target),
      maxHeaderSize: context.maxHeaderSizeBytes,
    };
    return new Promise((resolve, reject) => {
      let peerVerified = false;
      let settled = false;
      let request: http.ClientRequest;
      const finishFailure = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof TargetSecurityError
          ? error
          : new TargetSecurityError("PINNED_TRANSPORT_FAILED"));
      };
      const timeout = setTimeout(() => {
        finishFailure(new TargetSecurityError("ATTEMPT_TIMEOUT"));
        request?.destroy();
      }, context.timeoutMs);
      const cancellationPoll = setInterval(() => {
        if (context.cancellation?.isCancellationRequested() === true) {
          finishFailure(new TargetSecurityError("ACQUISITION_CANCELLED"));
          request?.destroy();
        }
      }, 10);
      const cleanup = () => {
        clearTimeout(timeout);
        clearInterval(cancellationPoll);
      };
      request = (target.scheme === "https" ? https.request : http.request)(
        options,
        (response) => {
          if (!peerVerified) {
            response.destroy();
            finishFailure(new TargetSecurityError("EGRESS_TARGET_MISMATCH"));
            return;
          }
          try {
            const location = boundedHeader(response.headers.location, 2_048);
            const retryAfter = boundedHeader(response.headers["retry-after"], 128);
            const contentType = boundedHeader(response.headers["content-type"], 256);
            const contentEncoding = boundedHeader(
              response.headers["content-encoding"],
              64,
            );
            const contentLength = parseContentLength(boundedHeader(
              response.headers["content-length"],
              32,
            ));
            const statusCode = response.statusCode;
            if (statusCode === undefined || statusCode < 100 || statusCode > 599) {
              throw new TargetSecurityError("RESPONSE_HEADERS_INVALID");
            }
            settled = true;
            cleanup();
            const head = {
              statusCode,
              ...(location === undefined ? {} : { location }),
              ...(retryAfter === undefined ? {} : { retryAfter }),
              ...(contentType === undefined ? {} : { contentType }),
              ...(contentLength === undefined ? {} : { contentLength }),
              ...(contentEncoding === undefined ? {} : { contentEncoding }),
            };
            resolve({
              head,
              body: response,
              destroy: () => response.destroy(),
            });
          } catch (error) {
            response.destroy();
            finishFailure(error);
          }
        },
      );
      request.once("socket", (socket: Socket | TLSSocket) => {
        socket.once(target.scheme === "https" ? "secureConnect" : "connect", () => {
          try {
            verifyPinnedPeerAddress(target, socket.remoteAddress);
            peerVerified = true;
          } catch (error) {
            finishFailure(error);
            request.destroy();
          }
        });
      });
      request.once("error", (error) => {
        if (settled) return;
        const code = "code" in error ? String(error.code) : "";
        finishFailure(code.startsWith("HPE_")
          ? new TargetSecurityError("RESPONSE_HEADERS_INVALID")
          : code.includes("CERT") || code.startsWith("ERR_TLS")
            ? new TargetSecurityError("TLS_VALIDATION_FAILED")
            : error);
      });
      if (context.cancellation?.isCancellationRequested() === true) {
        finishFailure(new TargetSecurityError("ACQUISITION_CANCELLED"));
        request.destroy();
        return;
      }
      request.end();
    });
  }
}
