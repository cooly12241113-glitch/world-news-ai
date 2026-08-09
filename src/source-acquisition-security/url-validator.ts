import { isIP } from "node:net";
import { classifyIpAddress } from "./ip-classifier";
import {
  TargetSecurityError,
  type NetworkScheme,
  type ValidatedNetworkTarget,
} from "./models";

const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

const normalizeHostname = (hostname: string): string => {
  const unwrapped = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  if (isIP(unwrapped) !== 0) return unwrapped.toLowerCase();
  const normalized = unwrapped.toLowerCase().replace(/\.$/u, "");
  if (normalized.length === 0 || normalized.length > 253 ||
      normalized.split(".").some((label) => !DNS_LABEL.test(label))) {
    throw new TargetSecurityError("INVALID_NETWORK_TARGET");
  }
  return normalized;
};

export const validateNetworkTarget = (input: unknown): ValidatedNetworkTarget => {
  if (typeof input !== "string" || input.length === 0 ||
      /[\u0000-\u0020\u007f]/u.test(input)) {
    throw new TargetSecurityError("INVALID_NETWORK_TARGET");
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new TargetSecurityError("INVALID_NETWORK_TARGET");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TargetSecurityError("UNSUPPORTED_NETWORK_PROTOCOL");
  }
  if (!input.toLowerCase().startsWith(parsed.protocol + "//")) {
    throw new TargetSecurityError("INVALID_NETWORK_TARGET");
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new TargetSecurityError("URL_USERINFO_NOT_ALLOWED");
  }
  const scheme = parsed.protocol.slice(0, -1) as NetworkScheme;
  const effectivePort = scheme === "http" ? 80 : 443;
  if (parsed.port !== "" && Number(parsed.port) !== effectivePort) {
    throw new TargetSecurityError("CUSTOM_PORT_NOT_ALLOWED");
  }
  const originalHostname = normalizeHostname(parsed.hostname);
  const literal = classifyIpAddress(originalHostname);
  if (isIP(originalHostname) !== 0 && !literal.allowed) {
    throw new TargetSecurityError("UNSAFE_IP_ADDRESS");
  }
  return {
    scheme,
    originalHostname,
    effectivePort,
    pathAndQuery: `${parsed.pathname}${parsed.search}`,
    ...(isIP(originalHostname) !== 0 ? { literalAddress: literal.address } : {}),
  };
};
