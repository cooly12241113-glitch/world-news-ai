import { describe, expect, it, vi } from "vitest";
import {
  approveEgressTarget,
  classifyIpAddress,
  TargetSecurityError,
  validateNetworkTarget,
  type DnsResolver,
} from "../index";

const resolver = (...addresses: string[]): DnsResolver => ({
  resolve: vi.fn(async () => addresses.map((address) => ({
    address,
    family: classifyIpAddress(address).family,
  }))),
});

const reason = (callback: () => unknown): string | undefined => {
  try {
    callback();
    return undefined;
  } catch (error) {
    return error instanceof TargetSecurityError ? error.reasonCode : "UNKNOWN";
  }
};

describe("network target validation", () => {
  it.each(["file:///etc/passwd", "ftp://example.com/a", "data:text/plain,x",
    "javascript:alert(1)", "gopher://example.com/"])(
    "rejects unsupported scheme %s",
    (url) => expect(reason(() => validateNetworkTarget(url)))
      .toBe("UNSUPPORTED_NETWORK_PROTOCOL"),
  );

  it("rejects URL userinfo, malformed targets, and custom ports", () => {
    expect(reason(() => validateNetworkTarget("https://user:pass@example.com")))
      .toBe("URL_USERINFO_NOT_ALLOWED");
    expect(reason(() => validateNetworkTarget("https://")))
      .toBe("INVALID_NETWORK_TARGET");
    expect(reason(() => validateNetworkTarget("https://example.com:8443")))
      .toBe("CUSTOM_PORT_NOT_ALLOWED");
  });

  it("rejects parser-tolerated whitespace, controls, and authority shorthand", () => {
    expect(reason(() => validateNetworkTarget(" https://example.com")))
      .toBe("INVALID_NETWORK_TARGET");
    expect(reason(() => validateNetworkTarget("https://example.com\n")))
      .toBe("INVALID_NETWORK_TARGET");
    expect(reason(() => validateNetworkTarget("https://exa\tmple.com")))
      .toBe("INVALID_NETWORK_TARGET");
    expect(reason(() => validateNetworkTarget("http:example.com")))
      .toBe("INVALID_NETWORK_TARGET");
  });

  it("normalizes runtime-supported alternate IPv4 forms before denial", () => {
    expect(reason(() => validateNetworkTarget("http://127.1")))
      .toBe("UNSAFE_IP_ADDRESS");
    expect(reason(() => validateNetworkTarget("http://0x7f000001")))
      .toBe("UNSAFE_IP_ADDRESS");
    expect(reason(() => validateNetworkTarget("http://0177.0.0.1")))
      .toBe("UNSAFE_IP_ADDRESS");
    expect(reason(() => validateNetworkTarget("http://[::ffff:127.0.0.1]")))
      .toBe("UNSAFE_IP_ADDRESS");
  });
});

describe("IP address classification", () => {
  it.each([
    "0.0.0.1", "10.0.0.1", "127.0.0.1", "169.254.1.1",
    "172.16.2.3", "192.168.1.1", "100.64.0.1", "224.0.0.1",
    "240.0.0.1", "192.0.2.1", "198.51.100.1", "203.0.113.1",
    "::", "::1", "fc00::1", "fd12::1", "fe80::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:10.0.0.1",
  ])("rejects non-global address %s", (address) => {
    expect(classifyIpAddress(address).allowed).toBe(false);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2001:4860:4860::8888"])(
    "allows global-unicast address %s",
    (address) => expect(classifyIpAddress(address)).toMatchObject({
      allowed: true,
      category: "global-unicast",
    }),
  );
});

describe("approved egress target", () => {
  it("allows a deterministic public-only DNS set", async () => {
    const target = await approveEgressTarget(
      "https://Example.COM/news?q=public",
      resolver("8.8.8.8", "2001:4860:4860::8888"),
    );
    expect(target).toMatchObject({
      scheme: "https",
      originalHostname: "example.com",
      effectivePort: 443,
      pinnedIp: "8.8.8.8",
      family: 4,
    });
    expect(target.approvalFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(Object.isFrozen(target)).toBe(true);
  });

  it("denies the entire mixed public/private DNS set", async () => {
    await expect(approveEgressTarget(
      "https://example.com/",
      resolver("8.8.8.8", "10.0.0.1"),
    )).rejects.toMatchObject({ reasonCode: "DNS_MIXED_ADDRESS_SET" });
  });

  it("denies an all-unsafe or empty DNS result", async () => {
    await expect(approveEgressTarget("https://example.com/", resolver("::1")))
      .rejects.toMatchObject({ reasonCode: "UNSAFE_IP_ADDRESS" });
    await expect(approveEgressTarget("https://example.com/", resolver()))
      .rejects.toMatchObject({ reasonCode: "DNS_RESOLUTION_FAILED" });
  });

  it("fails closed when the resolver fails", async () => {
    const failing: DnsResolver = {
      resolve: vi.fn(async () => Promise.reject(new Error("hidden"))),
    };
    await expect(approveEgressTarget("https://example.com/", failing))
      .rejects.toMatchObject({ reasonCode: "DNS_RESOLUTION_FAILED" });
  });

  it("does not invoke DNS for a safe direct IP literal", async () => {
    const fake = resolver("10.0.0.1");
    const target = await approveEgressTarget("https://8.8.8.8/", fake);
    expect(target.pinnedIp).toBe("8.8.8.8");
    expect(fake.resolve).not.toHaveBeenCalled();
  });
});
