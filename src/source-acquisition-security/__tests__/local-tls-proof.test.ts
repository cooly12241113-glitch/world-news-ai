import https from "node:https";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { afterEach, describe, expect, it } from "vitest";
import { TEST_CA, TEST_CERT, TEST_KEY } from "./tls-fixture";

const servers: https.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>(
    (resolve) => server.close(() => resolve()),
  )));
});

const startServer = async () => {
  let observedServername: string | undefined;
  const server = https.createServer({ cert: TEST_CERT, key: TEST_KEY },
    (_request, response) => {
      response.writeHead(204);
      response.end();
    });
  server.on("secureConnection", (socket) => {
    observedServername = socket.servername || undefined;
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    server,
    port: (server.address() as AddressInfo).port,
    getObservedServername: () => observedServername,
  };
};

const requestLocalTls = (
  hostname: string,
  port: number,
): Promise<{ remoteAddress?: string; statusCode?: number }> =>
  new Promise((resolve, reject) => {
    const request = https.request({
      hostname,
      port,
      method: "GET",
      path: "/",
      agent: false,
      servername: hostname,
      rejectUnauthorized: true,
      ca: TEST_CA,
      lookup: (lookupHostname, options, callback) => {
        expect(lookupHostname).toBe(hostname);
        if (typeof options === "object" && options.all === true) {
          (callback as unknown as (
            error: null,
            addresses: Array<{ address: string; family: number }>,
          ) => void)(null, [{ address: "127.0.0.1", family: 4 }]);
          return;
        }
        callback(null, "127.0.0.1", 4);
      },
    }, (response) => {
      const remoteAddress = response.socket.remoteAddress;
      response.resume();
      response.once("end", () => resolve({
        remoteAddress,
        statusCode: response.statusCode,
      }));
    });
    request.once("error", reject);
    request.end();
  });

describe("local Node HTTPS pinning feasibility", () => {
  it("connects only through custom lookup while preserving SNI and trust", async () => {
    const fixture = await startServer();
    await expect(requestLocalTls("proof.example.test", fixture.port))
      .resolves.toMatchObject({ remoteAddress: "127.0.0.1", statusCode: 204 });
    expect(fixture.getObservedServername()).toBe("proof.example.test");
  });

  it("rejects a trusted certificate whose hostname does not match", async () => {
    const fixture = await startServer();
    await expect(requestLocalTls("wrong.example.test", fixture.port))
      .rejects.toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });
  });
});
