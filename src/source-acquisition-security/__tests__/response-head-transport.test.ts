import { EventEmitter } from "node:events";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NodePinnedResponseHeadTransport,
  HARD_MAX_RESPONSE_HEADER_BYTES,
  SafeNetworkAcquisitionRuntime,
  approveEgressTarget,
  type DnsResolver,
} from "../index";
import { lifecyclePolicy } from "./lifecycle-test-helpers";

afterEach(() => vi.restoreAllMocks());

const approvedHttpTarget = async () => {
  const resolver: DnsResolver = {
    resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
  };
  return approveEgressTarget("http://example.com/proof", resolver);
};

const mockHttpResponse = (
  statusCode: number,
  headers: http.IncomingHttpHeaders = {},
) => {
  let capturedOptions: http.RequestOptions | undefined;
  const response = new EventEmitter() as http.IncomingMessage;
  response.statusCode = statusCode;
  response.headers = headers;
  response.destroy = vi.fn() as typeof response.destroy;
  vi.spyOn(http, "request").mockImplementation(((options, callback) => {
    capturedOptions = options as http.RequestOptions;
    const request = new EventEmitter() as http.ClientRequest;
    request.destroy = vi.fn() as typeof request.destroy;
    request.end = vi.fn(() => {
      const socket = new EventEmitter() as never;
      Object.defineProperty(socket, "remoteAddress", { value: "8.8.8.8" });
      request.emit("socket", socket);
      (socket as EventEmitter).emit("connect");
      if (typeof callback === "function") callback(response);
      return request;
    }) as typeof request.end;
    return request;
  }) as typeof http.request);
  return { response, options: () => capturedOptions };
};

describe("response-head-only pinned transport", () => {
  it("accepts policies at or below 16 KiB and rejects 16 KiB + 1", () => {
    const dependencies = {
      resolver: { resolve: vi.fn(async () => []) },
      transport: { requestHead: vi.fn() },
    };
    expect(() => new SafeNetworkAcquisitionRuntime({
      ...dependencies,
      policy: lifecyclePolicy({ maxHeaderSizeBytes: HARD_MAX_RESPONSE_HEADER_BYTES }),
    })).not.toThrow();
    expect(() => new SafeNetworkAcquisitionRuntime({
      ...dependencies,
      policy: lifecyclePolicy({ maxHeaderSizeBytes: 4_096 }),
    })).not.toThrow();
    expect(() => new SafeNetworkAcquisitionRuntime({
      ...dependencies,
      policy: lifecyclePolicy({
        maxHeaderSizeBytes: HARD_MAX_RESPONSE_HEADER_BYTES + 1,
      }),
    })).toThrow("INVALID_SAFE_LIFECYCLE_POLICY");
  });

  it("rejects a direct transport policy above the absolute hard cap", async () => {
    const target = await approvedHttpTarget();
    await expect(new NodePinnedResponseHeadTransport().requestHead(target, {
      timeoutMs: 1_000,
      maxHeaderSizeBytes: HARD_MAX_RESPONSE_HEADER_BYTES + 1,
    })).rejects.toMatchObject({ reasonCode: "RESPONSE_HEADERS_INVALID" });
  });

  it("returns only bounded decision headers and destroys the body stream", async () => {
    const target = await approvedHttpTarget();
    const mocked = mockHttpResponse(302, {
      location: "/next",
      "retry-after": "5",
      "content-type": "text/html",
      "content-length": "123",
      "set-cookie": ["secret=value"],
    });
    const head = await new NodePinnedResponseHeadTransport().requestHead(target, {
      timeoutMs: 1_000,
      maxHeaderSizeBytes: 4_096,
    });
    expect(head).toEqual({
      statusCode: 302,
      location: "/next",
      retryAfter: "5",
      contentType: "text/html",
      contentLength: 123,
    });
    expect(mocked.options()).toMatchObject({
      method: "GET", agent: false, maxHeaderSize: 4_096,
    });
    expect(mocked.response.destroy).toHaveBeenCalledTimes(1);
    expect(mocked.response.listenerCount("data")).toBe(0);
  });

  it.each([
    { location: "x".repeat(2_049) },
    { "content-length": "-1" },
    { "retry-after": ["1", "2"] },
  ])("rejects malformed or oversized decision headers", async (headers) => {
    const target = await approvedHttpTarget();
    const mocked = mockHttpResponse(302, headers as http.IncomingHttpHeaders);
    await expect(new NodePinnedResponseHeadTransport().requestHead(target, {
      timeoutMs: 1_000,
      maxHeaderSizeBytes: 4_096,
    })).rejects.toMatchObject({ reasonCode: "RESPONSE_HEADERS_INVALID" });
    expect(mocked.response.destroy).toHaveBeenCalledTimes(1);
  });

  it("fails closed before accepting a response from a different peer", async () => {
    const target = await approvedHttpTarget();
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
    await expect(new NodePinnedResponseHeadTransport().requestHead(target, {
      timeoutMs: 1_000,
      maxHeaderSizeBytes: 4_096,
    })).rejects.toMatchObject({ reasonCode: "EGRESS_TARGET_MISMATCH" });
  });

  it("destroys the request when cancellation already applies", async () => {
    const target = await approvedHttpTarget();
    let request: http.ClientRequest | undefined;
    vi.spyOn(http, "request").mockImplementation(((_options, _callback) => {
      request = new EventEmitter() as http.ClientRequest;
      request.destroy = vi.fn() as typeof request.destroy;
      request.end = vi.fn() as typeof request.end;
      return request;
    }) as typeof http.request);
    await expect(new NodePinnedResponseHeadTransport().requestHead(target, {
      timeoutMs: 1_000,
      maxHeaderSizeBytes: 4_096,
      cancellation: { isCancellationRequested: () => true },
    })).rejects.toMatchObject({ reasonCode: "ACQUISITION_CANCELLED" });
    expect(request?.destroy).toHaveBeenCalledTimes(1);
    expect(request?.end).not.toHaveBeenCalled();
  });

  it("maps Node parser overflow to a privacy-safe header failure", async () => {
    const target = await approvedHttpTarget();
    vi.spyOn(http, "request").mockImplementation(((_options, _callback) => {
      const request = new EventEmitter() as http.ClientRequest;
      request.destroy = vi.fn() as typeof request.destroy;
      request.end = vi.fn(() => {
        request.emit("error", Object.assign(
          new Error("attacker-controlled-header-value"),
          { code: "HPE_HEADER_OVERFLOW" },
        ));
        return request;
      }) as typeof request.end;
      return request;
    }) as typeof http.request);
    const failure = await new NodePinnedResponseHeadTransport().requestHead(target, {
      timeoutMs: 1_000,
      maxHeaderSizeBytes: 4_096,
    }).catch((error: unknown) => error);
    expect(failure).toMatchObject({ reasonCode: "RESPONSE_HEADERS_INVALID" });
    expect(JSON.stringify(failure)).not.toContain("attacker-controlled");
  });
});

const requestRawHeaderFixture = async (
  headerLines: string[],
  maxHeaderSize: number,
): Promise<unknown> => {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
    socket.end([
      "HTTP/1.1 200 OK",
      ...headerLines,
      "Content-Length: 0",
      "Connection: close",
      "",
      "",
    ].join("\r\n"));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  try {
    return await new Promise((resolve) => {
      const request = http.request({
        hostname: "127.0.0.1",
        port,
        method: "GET",
        agent: false,
        maxHeaderSize,
      }, (response) => {
        response.destroy();
        resolve({ statusCode: response.statusCode });
      });
      request.once("error", (error) => resolve(error));
      request.end();
    });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

describe("actual Node response-header parser bound", () => {
  it("rejects one header exceeding the configured parser bound", async () => {
    const result = await requestRawHeaderFixture([`X-Large: ${"s".repeat(2_000)}`], 1_024);
    expect(result).toMatchObject({ code: "HPE_HEADER_OVERFLOW" });
    expect(JSON.stringify({ reasonCode: "RESPONSE_HEADERS_INVALID" }))
      .not.toContain("ssss");
  });

  it("rejects many small headers whose aggregate exceeds the parser bound", async () => {
    const headers = Array.from({ length: 80 }, (_, index) =>
      `X-Small-${index}: ${"v".repeat(16)}`);
    const result = await requestRawHeaderFixture(headers, 1_024);
    expect(result).toMatchObject({ code: "HPE_HEADER_OVERFLOW" });
  });
});
