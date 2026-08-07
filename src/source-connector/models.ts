import type { IngestionHints, IngestionRequest } from "../ingestion";

export const SOURCE_CONNECTOR_IDS = [
  "web",
  "rss",
  "official-document",
  "youtube",
  "reddit",
  "x",
  "telegram",
  "user-submitted",
] as const;
export type SourceConnectorId = (typeof SOURCE_CONNECTOR_IDS)[number];

export const SOURCE_CONTENT_KINDS = [
  "text",
  "html",
  "document",
  "image",
  "audio",
  "video",
] as const;
export type SourceContentKind = (typeof SOURCE_CONTENT_KINDS)[number];

export type SourceLocator =
  | { kind: "web"; url: string }
  | { kind: "user-submitted"; submissionId: string };

export const CREDENTIAL_REQUIREMENT_KINDS = [
  "none",
  "api-key",
  "oauth",
  "user-session",
] as const;
export type CredentialRequirementKind =
  (typeof CREDENTIAL_REQUIREMENT_KINDS)[number];

export interface CredentialRequirement {
  kind: CredentialRequirementKind;
}

export const SOURCE_ACCESS_LEVELS = [
  "public-only",
  "authenticated-explicit-consent",
  "prohibited",
] as const;
export type SourceAccessLevel = (typeof SOURCE_ACCESS_LEVELS)[number];

export interface SourceAccessPolicy {
  access: SourceAccessLevel;
}

export interface ConnectorCapability {
  connectorId: SourceConnectorId;
  connectorVersion: string;
  supportedContentKinds: SourceContentKind[];
  credentialRequirement: CredentialRequirement;
  paginationSupport: "none" | "cursor" | "page";
  incrementalFetchSupport: boolean;
  canonicalLocatorSupport: boolean;
  timestampSupport: boolean;
}

export interface SourceAcquisitionRequest {
  requestId: string;
  connectorId: SourceConnectorId;
  locator: SourceLocator;
  requestedContentKind?: SourceContentKind;
  accessPolicy: SourceAccessPolicy;
}

export interface RawArtifactReference {
  artifactId: string;
  sourceIdentity: string;
  contentKind: SourceContentKind;
  mediaType: string;
  contentHash: string;
  byteLength: number;
}

export interface AcquiredInlineText {
  representation: "inline-text";
  text: string;
}

export interface AcquisitionTraceMetadata {
  requestId: string;
  connectorVersion: string;
  attempt: number;
}

export interface SourceAcquisitionSuccess {
  success: true;
  connectorId: SourceConnectorId;
  locator: SourceLocator;
  canonicalLocator?: SourceLocator;
  sourceIdentity: string;
  acquisitionId: string;
  acquiredAt: string;
  content: AcquiredInlineText;
  rawArtifact: RawArtifactReference;
  trace: AcquisitionTraceMetadata;
}

export const SOURCE_ACQUISITION_FAILURE_OUTCOMES = [
  "unsupported",
  "access-denied",
  "authentication-required",
  "rate-limited",
  "unavailable",
  "cancelled",
  "failed",
] as const;
export type SourceAcquisitionFailureOutcome =
  (typeof SOURCE_ACQUISITION_FAILURE_OUTCOMES)[number];

export interface SourceAcquisitionFailure {
  success: false;
  connectorId: SourceConnectorId;
  locator: SourceLocator;
  requestId: string;
  outcome: SourceAcquisitionFailureOutcome;
  retryable: boolean;
  reasonCode: string;
}

export type SourceAcquisitionResult =
  | SourceAcquisitionSuccess
  | SourceAcquisitionFailure;

export interface SourceConnectorCancellation {
  isCancellationRequested(): boolean;
}

export interface SourceConnectorExecutionContext {
  cancellation?: SourceConnectorCancellation;
}

export interface SourceConnector {
  readonly capability: ConnectorCapability;
  acquire(
    request: SourceAcquisitionRequest,
    context?: SourceConnectorExecutionContext,
  ): Promise<SourceAcquisitionResult>;
}

export interface AcquisitionProvenance {
  connectorId: SourceConnectorId;
  connectorVersion: string;
  requestId: string;
  acquisitionId: string;
  sourceIdentity: string;
  rawArtifactId: string;
}

export interface AcquisitionIngestionProjection {
  ingestionRequest: IngestionRequest;
  provenance: AcquisitionProvenance;
}

export interface AcquisitionBridgeOptions {
  hints?: IngestionHints;
}

export type AcquisitionBridgeResult =
  | { success: true; projection: AcquisitionIngestionProjection }
  | {
      success: false;
      error: {
        code:
          | "INVALID_ACQUISITION_RESULT"
          | "UNSUPPORTED_LOCATOR"
          | "UNSUPPORTED_CONTENT_KIND";
        message: string;
      };
    };
