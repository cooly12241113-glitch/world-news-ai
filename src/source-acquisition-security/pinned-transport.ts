import http, { type RequestOptions } from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import type { Socket } from "node:net";
import type { TLSSocket } from "node:tls";
import { assertApprovedEgressTarget } from "./egress-target";
import { normalizeIpAddress } from "./ip-classifier";
import {
  TargetSecurityError,
  type ApprovedEgressTarget,
  type PinnedTransportProof,
} from "./models";

export type PinnedRequestOptions = RequestOptions & {
  agent: false;
  lookup: LookupFunction;
  servername?: string;
  rejectUnauthorized?: true;
};

export const createPinnedRequestOptions = (
  target: ApprovedEgressTarget,
): PinnedRequestOptions => {
  assertApprovedEgressTarget(target);
  const lookup: LookupFunction = ((hostname, options, callback) => {
    if (hostname !== target.originalHostname) {
      callback(new TargetSecurityError("EGRESS_TARGET_MISMATCH"), "", 4);
      return;
    }
    if (typeof options === "object" && options.all === true) {
      (callback as unknown as (
        error: null,
        addresses: Array<{ address: string; family: number }>,
      ) => void)(null, [{ address: target.pinnedIp, family: target.family }]);
      return;
    }
    callback(null, target.pinnedIp, target.family);
  }) as LookupFunction;
  return {
    protocol: `${target.scheme}:`,
    hostname: target.originalHostname,
    port: target.effectivePort,
    method: "GET",
    path: target.pathAndQuery,
    agent: false,
    family: target.family,
    lookup,
    ...(target.scheme === "https" ? {
      servername: target.originalHostname,
      rejectUnauthorized: true as const,
    } : {}),
  };
};

export const verifyPinnedPeerAddress = (
  target: ApprovedEgressTarget,
  remoteAddress: string | undefined,
): string => {
  assertApprovedEgressTarget(target);
  if (remoteAddress === undefined ||
      normalizeIpAddress(remoteAddress) !== normalizeIpAddress(target.pinnedIp)) {
    throw new TargetSecurityError("EGRESS_TARGET_MISMATCH");
  }
  return normalizeIpAddress(remoteAddress);
};

const isTlsValidationError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return code.includes("CERT") || code.startsWith("ERR_TLS") ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT";
};

export class NodePinnedTransport {
  probe(target: ApprovedEgressTarget): Promise<PinnedTransportProof> {
    const options = createPinnedRequestOptions(target);
    return new Promise((resolve, reject) => {
      let verifiedRemoteAddress: string | undefined;
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof TargetSecurityError
          ? error
          : new TargetSecurityError(isTlsValidationError(error)
            ? "TLS_VALIDATION_FAILED"
            : "PINNED_TRANSPORT_FAILED"));
      };
      const request = (target.scheme === "https" ? https.request : http.request)(
        options,
        (response) => {
          response.resume();
          if (settled) return;
          if (verifiedRemoteAddress === undefined) {
            fail(new TargetSecurityError("EGRESS_TARGET_MISMATCH"));
            request.destroy();
            return;
          }
          settled = true;
          resolve({
            scheme: target.scheme,
            hostname: target.originalHostname,
            port: target.effectivePort,
            pinnedIp: target.pinnedIp,
            remoteAddress: verifiedRemoteAddress,
            statusCode: response.statusCode ?? 0,
          });
        },
      );
      request.once("socket", (socket: Socket | TLSSocket) => {
        const event = target.scheme === "https" ? "secureConnect" : "connect";
        socket.once(event, () => {
          try {
            verifiedRemoteAddress = verifyPinnedPeerAddress(
              target,
              socket.remoteAddress,
            );
          } catch (error) {
            fail(error);
            request.destroy();
          }
        });
      });
      request.once("error", fail);
      request.end();
    });
  }
}
