import { isIP } from "node:net";
import { IngestionError } from "./error";

const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [number, number]> = [
  [ipToNumber("0.0.0.0"), ipToNumber("0.255.255.255")],
  [ipToNumber("10.0.0.0"), ipToNumber("10.255.255.255")],
  [ipToNumber("100.64.0.0"), ipToNumber("100.127.255.255")],
  [ipToNumber("127.0.0.0"), ipToNumber("127.255.255.255")],
  [ipToNumber("169.254.0.0"), ipToNumber("169.254.255.255")],
  [ipToNumber("172.16.0.0"), ipToNumber("172.31.255.255")],
  [ipToNumber("192.0.0.0"), ipToNumber("192.0.0.255")],
  [ipToNumber("192.168.0.0"), ipToNumber("192.168.255.255")],
  [ipToNumber("198.18.0.0"), ipToNumber("198.19.255.255")],
  [ipToNumber("224.0.0.0"), ipToNumber("255.255.255.255")],
];

function ipToNumber(ip: string): number {
  return ip
    .split(".")
    .map(Number)
    .reduce((value, octet) => value * 256 + octet, 0);
}

const isUnsafeIpv4 = (hostname: string): boolean => {
  const value = ipToNumber(hostname);
  return PRIVATE_IPV4_RANGES.some(([start, end]) => value >= start && value <= end);
};

const isUnsafeIpv6 = (hostname: string): boolean => {
  const value = hostname.toLowerCase();
  return (
    value === "::" ||
    value === "::1" ||
    value.startsWith("fc") ||
    value.startsWith("fd") ||
    /^fe[89ab]/.test(value) ||
    value.startsWith("ff")
  );
};

export const validatePublicUrl = (value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IngestionError("INVALID_URL", "URL is not valid", "input");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new IngestionError(
      "INVALID_URL",
      "Only HTTP and HTTPS URLs are supported",
      "input",
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new IngestionError(
      "UNSAFE_URL",
      "URLs containing credentials are not allowed",
      "input",
    );
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "metadata.google.internal" ||
    hostname === "169.254.169.254"
  ) {
    throw new IngestionError("UNSAFE_URL", "Local network URL rejected", "input");
  }

  const version = isIP(hostname);
  if (
    (version === 4 && isUnsafeIpv4(hostname)) ||
    (version === 6 && isUnsafeIpv6(hostname))
  ) {
    throw new IngestionError("UNSAFE_URL", "Private IP URL rejected", "input");
  }

  return url;
};

export const normalizeCanonicalUrl = (value: string, base?: string): string => {
  const url = new URL(value, base);
  url.hash = "";
  return url.toString();
};
