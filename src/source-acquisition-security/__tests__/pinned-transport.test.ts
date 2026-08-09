import { EventEmitter } from "node:events";
import http from "node:http";
import https from "node:https";
import { checkServerIdentity, type PeerCertificate } from "node:tls";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approveEgressTarget,
  createPinnedRequestOptions,
  NodePinnedTransport,
  verifyPinnedPeerAddress,
  type DnsResolver,
} from "../index";

afterEach(() => vi.restoreAllMocks());

const approved = async (scheme: "http" | "https" = "https") => {
  const resolver: DnsResolver = {
    resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
  };
  return approveEgressTarget(`${scheme}://example.com/proof`, resolver);
};

describe("Node pinned transport proof", () => {
  it("binds lookup to the original hostname and one approved IP", async () => {
    const target = await approved();
    const options = createPinnedRequestOptions(target);
    const lookup = options.lookup as unknown as (
      hostname: string,
      options: object,
      callback: (error: Error | null, address: string, family: number) => void,
    ) => void;
    const callback = vi.fn();
    lookup("example.com", {}, callback);
    expect(callback).toHaveBeenCalledWith(null, "8.8.8.8", 4);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("fails closed if lookup is requested for another hostname", async () => {
    const target = await approved();
    const lookup = createPinnedRequestOptions(target).lookup as unknown as (
      hostname: string,
      options: object,
      callback: (error: Error | null, address: string, family: number) => void,
    ) => void;
    const callback = vi.fn();
    lookup("attacker.example", {}, callback);
    expect(callback.mock.calls[0]?.[0]).toMatchObject({
      reasonCode: "EGRESS_TARGET_MISMATCH",
    });
  });

  it("returns only the pinned IP when Node requests an all-address result", async () => {
    const target = await approved();
    const lookup = createPinnedRequestOptions(target).lookup as unknown as (
      hostname: string,
      options: { all: true },
      callback: (
        error: Error | null,
        addresses: Array<{ address: string; family: number }>,
      ) => void,
    ) => void;
    const callback = vi.fn();
    lookup("example.com", { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [
      { address: "8.8.8.8", family: 4 },
    ]);
  });

  it("preserves HTTP authority and disables connection reuse", async () => {
    const target = await approved("http");
    expect(createPinnedRequestOptions(target)).toMatchObject({
      protocol: "http:",
      hostname: "example.com",
      port: 80,
      agent: false,
    });
  });

  it("preserves HTTPS SNI and mandatory certificate validation", async () => {
    const target = await approved("https");
    const options = createPinnedRequestOptions(target);
    expect(options).toMatchObject({
      protocol: "https:",
      hostname: "example.com",
      servername: "example.com",
      rejectUnauthorized: true,
      agent: false,
    });
    expect(options).not.toHaveProperty("checkServerIdentity");
    expect(checkServerIdentity("example.com", {
      subject: { CN: "wrong.example" },
      subjectaltname: "DNS:wrong.example",
    } as PeerCertificate)).toBeInstanceOf(Error);
  });

  it("accepts only the actual pinned peer address", async () => {
    const target = await approved();
    expect(verifyPinnedPeerAddress(target, "8.8.8.8")).toBe("8.8.8.8");
    expect(() => verifyPinnedPeerAddress(target, "1.1.1.1"))
      .toThrowError(expect.objectContaining({
        reasonCode: "EGRESS_TARGET_MISMATCH",
      }));
  });

  it("normalizes an IPv4-mapped peer before equality comparison", async () => {
    const target = await approved();
    expect(verifyPinnedPeerAddress(target, "::ffff:8.8.8.8"))
      .toBe("8.8.8.8");
  });

  it("rejects forged target objects", () => {
    expect(() => createPinnedRequestOptions({
      scheme: "https",
      originalHostname: "example.com",
      effectivePort: 443,
      pathAndQuery: "/",
      pinnedIp: "8.8.8.8",
      family: 4,
      approvalFingerprint: "a".repeat(64),
    } as never)).toThrowError(expect.objectContaining({
      reasonCode: "INVALID_NETWORK_TARGET",
    }));
  });

  it("completes an HTTP proof only after pinned peer verification", async () => {
    const target = await approved("http");
    let capturedOptions: http.RequestOptions | undefined;
    vi.spyOn(http, "request").mockImplementation(((options, callback) => {
      capturedOptions = options as http.RequestOptions;
      const responseCallback = typeof callback === "function"
        ? callback
        : undefined;
      const request = new EventEmitter() as http.ClientRequest;
      request.destroy = vi.fn() as typeof request.destroy;
      request.end = vi.fn(() => {
        const socket = new EventEmitter() as never;
        Object.defineProperty(socket, "remoteAddress", { value: "8.8.8.8" });
        request.emit("socket", socket);
        (socket as EventEmitter).emit("connect");
        responseCallback?.({ statusCode: 204, resume: vi.fn() } as never);
        return request;
      }) as typeof request.end;
      return request;
    }) as typeof http.request);
    await expect(new NodePinnedTransport().probe(target)).resolves.toMatchObject({
      hostname: "example.com",
      pinnedIp: "8.8.8.8",
      remoteAddress: "8.8.8.8",
      statusCode: 204,
    });
    expect(capturedOptions).toMatchObject({ hostname: "example.com", agent: false });
  });

  it("rejects the complete proof when the actual peer differs", async () => {
    const target = await approved("http");
    vi.spyOn(http, "request").mockImplementation(((_options, _callback) => {
      const request = new EventEmitter() as http.ClientRequest;
      request.destroy = vi.fn() as typeof request.destroy;
      request.end = vi.fn(() => {
        const socket = new EventEmitter() as never;
        Object.defineProperty(socket, "remoteAddress", { value: "1.1.1.1" });
        request.emit("socket", socket);
        (socket as EventEmitter).emit("connect");
        return request;
      }) as typeof request.end;
      return request;
    }) as typeof http.request);
    await expect(new NodePinnedTransport().probe(target)).rejects.toMatchObject({
      reasonCode: "EGRESS_TARGET_MISMATCH",
    });
  });

  it("maps a certificate failure without weakening HTTPS verification", async () => {
    const target = await approved("https");
    vi.spyOn(https, "request").mockImplementation(((_options, _callback) => {
      const request = new EventEmitter() as http.ClientRequest;
      request.destroy = vi.fn() as typeof request.destroy;
      request.end = vi.fn(() => {
        const error = Object.assign(new Error("certificate rejected"), {
          code: "ERR_TLS_CERT_ALTNAME_INVALID",
        });
        request.emit("error", error);
        return request;
      }) as typeof request.end;
      return request;
    }) as typeof https.request);
    await expect(new NodePinnedTransport().probe(target)).rejects.toMatchObject({
      reasonCode: "TLS_VALIDATION_FAILED",
    });
  });
});
