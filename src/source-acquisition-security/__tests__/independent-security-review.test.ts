import https from "node:https";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  approveEgressTarget,
  classifyIpAddress,
  createPinnedRequestOptions,
  verifyPinnedPeerAddress,
  type ApprovedEgressTarget,
  type DnsResolver,
} from "../index";
import { TEST_CERT, TEST_KEY } from "./tls-fixture";

const resolver = (...addresses: string[]): DnsResolver => ({
  resolve: vi.fn(async () => addresses.map((address) => ({
    address,
    family: classifyIpAddress(address).family,
  }))),
});

const forgedVariants = (target: ApprovedEgressTarget): unknown[] => [
  { ...target },
  { ...target, pinnedIp: "1.1.1.1" },
  { ...target, originalHostname: "attacker.example" },
  { ...target, effectivePort: 80 },
  { ...target, approvalFingerprint: "f".repeat(64) },
  JSON.parse(JSON.stringify(target)),
];

describe("independent capability forgery review", () => {
  it("rejects clones and every modified lookalike at runtime", async () => {
    const target = await approveEgressTarget(
      "https://example.com/review",
      resolver("8.8.8.8"),
    );
    for (const forged of forgedVariants(target)) {
      expect(() => createPinnedRequestOptions(forged as ApprovedEgressTarget))
        .toThrowError(expect.objectContaining({
          reasonCode: "INVALID_NETWORK_TARGET",
        }));
    }
  });

  it("cannot mutate a registered target", async () => {
    const target = await approveEgressTarget(
      "https://example.com/review",
      resolver("8.8.8.8"),
    );
    expect(Reflect.set(target, "pinnedIp", "1.1.1.1")).toBe(false);
    expect(target.pinnedIp).toBe("8.8.8.8");
    expect(() => createPinnedRequestOptions(target)).not.toThrow();
  });
});

describe("independent URL, IP, and DNS boundary review", () => {
  it("normalizes host identity while excluding fragments from transport", async () => {
    const fake = resolver("8.8.8.8");
    const target = await approveEgressTarget(
      "HTTPS://ExAmPlE.CoM.:443/a%20b?q=x#not-sent",
      fake,
    );
    expect(fake.resolve).toHaveBeenCalledWith("example.com");
    expect(target).toMatchObject({
      originalHostname: "example.com",
      effectivePort: 443,
      pathAndQuery: "/a%20b?q=x",
    });
  });

  it("denies localhost after canonical DNS resolution", async () => {
    await expect(approveEgressTarget(
      "http://LOCALHOST./",
      resolver("127.0.0.1", "::1"),
    )).rejects.toMatchObject({ reasonCode: "UNSAFE_IP_ADDRESS" });
  });

  it.each([
    "0.255.255.255", "10.255.255.255", "100.64.0.0", "100.127.255.255",
    "127.255.255.255", "169.254.0.0", "169.254.255.255",
    "172.16.0.0", "172.31.255.255", "192.168.0.0", "192.168.255.255",
    "198.18.0.0", "198.19.255.255",
    "224.0.0.0", "239.255.255.255", "240.0.0.0", "255.255.255.255",
    "2001:db8::", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
    "fc00::", "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "fe80::", "febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
    "ff00::", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff",
  ])("denies special-use range boundary %s", (address) => {
    expect(classifyIpAddress(address).allowed).toBe(false);
  });

  it.each([
    "1.0.0.0", "9.255.255.255", "11.0.0.0", "100.63.255.255",
    "100.128.0.0", "126.255.255.255", "128.0.0.0", "172.15.255.255",
    "172.32.0.0", "192.167.255.255", "192.169.0.0", "198.17.255.255",
    "198.20.0.0", "223.255.255.254", "223.255.255.255",
    "2001:4860:4860::8888",
  ])("allows adjacent public boundary %s", (address) => {
    expect(classifyIpAddress(address).allowed).toBe(true);
  });

  it("denies malformed and mixed DNS answers without selecting the safe member", async () => {
    await expect(approveEgressTarget(
      "https://example.com/",
      resolver("not-an-ip"),
    )).rejects.toMatchObject({ reasonCode: "UNSAFE_IP_ADDRESS" });
    await expect(approveEgressTarget(
      "https://example.com/",
      resolver("8.8.8.8", "not-an-ip"),
    )).rejects.toMatchObject({ reasonCode: "DNS_MIXED_ADDRESS_SET" });
  });
});

describe("independent lookup and peer review", () => {
  it("never exposes more than the pinned address for supported lookup shapes", async () => {
    const target = await approveEgressTarget(
      "https://example.com/",
      resolver("8.8.8.8"),
    );
    const lookup = createPinnedRequestOptions(target).lookup as unknown as (
      hostname: string,
      options: object | number,
      callback: (...values: unknown[]) => void,
    ) => void;
    for (const options of [{ all: false }, { all: true }, 4]) {
      const callback = vi.fn();
      lookup("example.com", options, callback);
      expect(JSON.stringify(callback.mock.calls).match(/8\.8\.8\.8/gu))
        .toHaveLength(1);
    }
  });

  it("normalizes equivalent IPv6 peers and rejects missing or different peers", async () => {
    const target = await approveEgressTarget(
      "https://example.com/",
      resolver("2001:4860:4860::8888"),
    );
    expect(verifyPinnedPeerAddress(
      target,
      "2001:4860:4860:0:0:0:0:8888",
    )).toBe("2001:4860:4860:0:0:0:0:8888");
    expect(() => verifyPinnedPeerAddress(target, undefined))
      .toThrowError(expect.objectContaining({ reasonCode: "EGRESS_TARGET_MISMATCH" }));
    expect(() => verifyPinnedPeerAddress(target, "2001:4860:4860::8844"))
      .toThrowError(expect.objectContaining({ reasonCode: "EGRESS_TARGET_MISMATCH" }));
  });
});

const servers: https.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>(
    (resolve) => server.close(() => resolve()),
  )));
});

describe("independent TLS trust review", () => {
  it("rejects the deterministic fixture when its test CA is not trusted", async () => {
    const server = https.createServer({ cert: TEST_CERT, key: TEST_KEY },
      (_request, response) => response.end());
    servers.push(server);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    await expect(new Promise<void>((resolve, reject) => {
      const request = https.request({
        hostname: "proof.example.test",
        port,
        servername: "proof.example.test",
        rejectUnauthorized: true,
        agent: false,
        lookup: (_hostname, options, callback) => {
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
        response.resume();
        response.once("end", resolve);
      });
      request.once("error", reject);
      request.end();
    })).rejects.toMatchObject({ code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" });
  });
});
