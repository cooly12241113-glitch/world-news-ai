import type {
  SourceAcquisitionFailure,
  SourceAcquisitionFailureOutcome,
  SourceAcquisitionRequest,
  SourceLocator,
} from "../source-connector";

const OUTCOME_BY_REASON: Readonly<Record<string, SourceAcquisitionFailureOutcome>> =
  Object.freeze({
    SOURCE_ACCESS_PROHIBITED: "access-denied",
    CREDENTIAL_CONNECTOR_SCOPE_MISMATCH: "access-denied",
    CREDENTIAL_REQUIREMENT_MISMATCH: "access-denied",
    INVALID_ACQUISITION_AUTHORIZATION_INPUT: "access-denied",
    SOURCE_ACCOUNT_CONSENT_REQUIRED: "authentication-required",
    CREDENTIAL_REFERENCE_REQUIRED: "authentication-required",
    CREDENTIAL_AVAILABILITY_REQUIRED: "authentication-required",
    CREDENTIAL_REFERENCE_UNAVAILABLE: "authentication-required",
    CREDENTIAL_REFERENCE_ACCESS_DENIED: "authentication-required",
    UNSUPPORTED_NETWORK_PROTOCOL: "unsupported",
    INVALID_NETWORK_TARGET: "access-denied",
    URL_USERINFO_NOT_ALLOWED: "access-denied",
    CUSTOM_PORT_NOT_ALLOWED: "access-denied",
    UNSAFE_IP_ADDRESS: "access-denied",
    DNS_MIXED_ADDRESS_SET: "access-denied",
    HTTPS_DOWNGRADE_DENIED: "access-denied",
    REDIRECT_LOOP_DETECTED: "access-denied",
    REDIRECT_LIMIT_EXCEEDED: "failed",
    REDIRECT_LOCATION_REQUIRED: "failed",
    EGRESS_TARGET_MISMATCH: "failed",
    TLS_VALIDATION_FAILED: "failed",
    RESPONSE_HEADERS_INVALID: "failed",
    ACQUISITION_CANCELLED: "cancelled",
    RATE_LIMIT_EXCEEDED: "rate-limited",
    RATE_LIMIT_STATE_CAPACITY_EXHAUSTED: "rate-limited",
    HTTP_RATE_LIMITED: "rate-limited",
    CONCURRENCY_LIMIT_EXCEEDED: "unavailable",
    DNS_RESOLUTION_FAILED: "unavailable",
    ATTEMPT_TIMEOUT: "unavailable",
    OVERALL_DEADLINE_EXCEEDED: "unavailable",
    PINNED_TRANSPORT_FAILED: "unavailable",
    HTTP_TRANSIENT_FAILURE: "unavailable",
  });

const RETRYABLE_PUBLIC_REASONS = new Set([
  "DNS_RESOLUTION_FAILED",
  "ATTEMPT_TIMEOUT",
  "OVERALL_DEADLINE_EXCEEDED",
  "PINNED_TRANSPORT_FAILED",
  "HTTP_TRANSIENT_FAILURE",
  "CONCURRENCY_LIMIT_EXCEEDED",
]);

export const mapLifecycleReasonToOutcome = (
  reasonCode: string,
): SourceAcquisitionFailureOutcome => OUTCOME_BY_REASON[reasonCode] ?? "failed";

export const privacyMinimizedLocator = (
  locator: SourceLocator,
): SourceLocator => {
  if (locator.kind !== "web") return locator;
  try {
    const parsed = new URL(locator.url);
    parsed.search = "";
    parsed.hash = "";
    return { kind: "web", url: parsed.toString() };
  } catch {
    return { kind: "web", url: "https://invalid.invalid/" };
  }
};

export const createLifecycleFailure = (
  request: SourceAcquisitionRequest,
  reasonCode: string,
): SourceAcquisitionFailure => ({
  success: false,
  connectorId: request.connectorId,
  locator: privacyMinimizedLocator(request.locator),
  requestId: request.requestId,
  outcome: mapLifecycleReasonToOutcome(reasonCode),
  retryable: RETRYABLE_PUBLIC_REASONS.has(reasonCode),
  reasonCode,
});

export const mappedLifecycleReasonCodes = (): string[] =>
  Object.keys(OUTCOME_BY_REASON).sort();
