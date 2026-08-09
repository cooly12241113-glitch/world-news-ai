import type { LookupAddress } from "node:dns";

export type NetworkScheme = "http" | "https";
export type IpFamily = 4 | 6;

export const TARGET_SECURITY_REASON_CODES = [
  "INVALID_NETWORK_TARGET",
  "UNSUPPORTED_NETWORK_PROTOCOL",
  "URL_USERINFO_NOT_ALLOWED",
  "CUSTOM_PORT_NOT_ALLOWED",
  "UNSAFE_IP_ADDRESS",
  "DNS_MIXED_ADDRESS_SET",
  "DNS_RESOLUTION_FAILED",
  "EGRESS_TARGET_MISMATCH",
  "TLS_VALIDATION_FAILED",
  "PINNED_TRANSPORT_FAILED",
  "RESPONSE_HEADERS_INVALID",
  "ATTEMPT_TIMEOUT",
  "ACQUISITION_CANCELLED",
  "OVERALL_DEADLINE_EXCEEDED",
] as const;
export type TargetSecurityReasonCode =
  (typeof TARGET_SECURITY_REASON_CODES)[number];

export class TargetSecurityError extends Error {
  readonly reasonCode: TargetSecurityReasonCode;

  constructor(reasonCode: TargetSecurityReasonCode) {
    super(reasonCode);
    this.name = "TargetSecurityError";
    this.reasonCode = reasonCode;
  }
}

export interface ValidatedNetworkTarget {
  scheme: NetworkScheme;
  originalHostname: string;
  effectivePort: 80 | 443;
  pathAndQuery: string;
  literalAddress?: string;
}

export interface DnsResolver {
  resolve(hostname: string): Promise<readonly LookupAddress[]>;
}

declare const approvedEgressTargetBrand: unique symbol;

export interface ApprovedEgressTarget {
  readonly scheme: NetworkScheme;
  readonly originalHostname: string;
  readonly effectivePort: 80 | 443;
  readonly pathAndQuery: string;
  readonly pinnedIp: string;
  readonly family: IpFamily;
  readonly approvalFingerprint: string;
  readonly [approvedEgressTargetBrand]: true;
}

export interface PinnedTransportProof {
  scheme: NetworkScheme;
  hostname: string;
  port: 80 | 443;
  pinnedIp: string;
  remoteAddress: string;
  statusCode: number;
}
