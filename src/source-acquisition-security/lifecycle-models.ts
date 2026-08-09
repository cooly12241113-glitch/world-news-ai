import type {
  CredentialRequirement,
  SourceAcquisitionFailure,
  SourceAcquisitionRequest,
  SourceConnectorCancellation,
} from "../source-connector";
import type {
  CredentialReference,
  CredentialReferenceAvailability,
  SourceAccountAccessConsent,
} from "../source-governance";
import type {
  ApprovedEgressTarget,
  NetworkScheme,
} from "./models";

export const LIFECYCLE_REASON_CODES = [
  "ACQUISITION_CANCELLED",
  "OVERALL_DEADLINE_EXCEEDED",
  "ATTEMPT_TIMEOUT",
  "REDIRECT_LOCATION_REQUIRED",
  "REDIRECT_LOOP_DETECTED",
  "REDIRECT_LIMIT_EXCEEDED",
  "HTTPS_DOWNGRADE_DENIED",
  "RESPONSE_HEADERS_INVALID",
  "RATE_LIMIT_EXCEEDED",
  "RATE_LIMIT_STATE_CAPACITY_EXHAUSTED",
  "CONCURRENCY_LIMIT_EXCEEDED",
  "HTTP_RATE_LIMITED",
  "HTTP_TRANSIENT_FAILURE",
] as const;
export type LifecycleReasonCode = (typeof LIFECYCLE_REASON_CODES)[number];

export interface SafeResponseHead {
  statusCode: number;
  location?: string;
  retryAfter?: string;
  contentType?: string;
  contentLength?: number;
}

export interface ResponseHeadAttemptContext {
  timeoutMs: number;
  maxHeaderSizeBytes: number;
  cancellation?: SourceConnectorCancellation;
}

export interface PinnedResponseHeadTransport {
  requestHead(
    target: ApprovedEgressTarget,
    context: ResponseHeadAttemptContext,
  ): Promise<SafeResponseHead>;
}

export interface SafeNetworkAcquisitionInput {
  request: SourceAcquisitionRequest;
  credentialRequirement: CredentialRequirement;
  credentialReference?: CredentialReference;
  credentialAvailability?: CredentialReferenceAvailability;
  sourceAccountConsent?: SourceAccountAccessConsent;
  cancellation?: SourceConnectorCancellation;
}

export interface SafeNetworkAcquisitionSuccess {
  success: true;
  connectorId: SourceAcquisitionRequest["connectorId"];
  requestId: string;
  finalTarget: {
    scheme: NetworkScheme;
    hostname: string;
    port: 80 | 443;
    targetFingerprint: string;
  };
  statusCode: number;
  attemptNumber: number;
  redirectHop: number;
}

export type SafeNetworkAcquisitionResult =
  | SafeNetworkAcquisitionSuccess
  | SourceAcquisitionFailure;

export interface SafeLifecyclePolicy {
  maxRedirects: number;
  maxAttemptsPerTarget: number;
  overallDeadlineMs: number;
  attemptTimeoutMs: number;
  retryBaseDelayMs: number;
  maxRetryDelayMs: number;
  maxHeaderSizeBytes: number;
}

export const DEFAULT_SAFE_LIFECYCLE_POLICY: Readonly<SafeLifecyclePolicy> =
  Object.freeze({
    maxRedirects: 5,
    maxAttemptsPerTarget: 3,
    overallDeadlineMs: 30_000,
    attemptTimeoutMs: 10_000,
    retryBaseDelayMs: 100,
    maxRetryDelayMs: 2_000,
    maxHeaderSizeBytes: 16_384,
  });

export interface MonotonicClock {
  nowMs(): number;
}

export interface CancellationAwareSleeper {
  sleep(
    delayMs: number,
    cancellation?: SourceConnectorCancellation,
  ): Promise<"completed" | "cancelled">;
}

export interface AdmissionRequest {
  connectorId: SourceAcquisitionRequest["connectorId"];
  originKey: string;
  nowMs: number;
}

export interface AdmissionLease {
  release(): void;
}

export type AdmissionDecision =
  | { admitted: true; lease: AdmissionLease }
  | {
    admitted: false;
    reasonCode:
      | "RATE_LIMIT_EXCEEDED"
      | "RATE_LIMIT_STATE_CAPACITY_EXHAUSTED"
      | "CONCURRENCY_LIMIT_EXCEEDED";
  };

export interface AcquisitionAdmissionGate {
  /** Backward-compatible combined admission. Runtime adapters should split phases. */
  admit(request: AdmissionRequest): AdmissionDecision;
  /** Consumes rate quota before DNS. A successful lease has no long lifetime. */
  admitRate?(request: AdmissionRequest): AdmissionDecision;
  /** Acquires active-network concurrency after target approval. */
  admitConcurrency?(request: AdmissionRequest): AdmissionDecision;
}

export interface AdmissionPolicy {
  maxConcurrentPerConnector: number;
  maxConcurrentPerOrigin: number;
  maxRequestsPerConnectorWindow: number;
  maxRequestsPerOriginWindow: number;
  rateWindowMs: number;
  maxTrackedConnectorRateBuckets: number;
  maxTrackedOriginRateBuckets: number;
}

export const DEFAULT_ADMISSION_POLICY: Readonly<AdmissionPolicy> = Object.freeze({
  maxConcurrentPerConnector: 8,
  maxConcurrentPerOrigin: 2,
  maxRequestsPerConnectorWindow: 60,
  maxRequestsPerOriginWindow: 20,
  rateWindowMs: 60_000,
  maxTrackedConnectorRateBuckets: 64,
  maxTrackedOriginRateBuckets: 4_096,
});

export const HARD_MAX_RESPONSE_HEADER_BYTES = 16_384;
