import type {
  CredentialRequirementKind,
  RawArtifactReference,
  SourceAccessPolicy,
  SourceConnectorId,
} from "../source-connector";

export interface RetentionDuration {
  amount: number;
  unit: "day" | "week" | "month" | "year";
}

export interface LegalHoldAuthority {
  authorityReferenceId: string;
  posture: "active";
}

export type RawArtifactRetentionPolicy =
  | { kind: "ephemeral" }
  | { kind: "bounded"; duration: RetentionDuration }
  | { kind: "retained-for-evidence"; duration: RetentionDuration }
  | { kind: "legal-hold"; authority: LegalHoldAuthority };

export const RAW_DELETION_TRIGGERS = [
  "scheduled-expiry",
  "explicit-request",
  "policy-deletion",
] as const;
export type RawDeletionTrigger = (typeof RAW_DELETION_TRIGGERS)[number];

export interface RawArtifactDeletionPolicy {
  triggers: RawDeletionTrigger[];
  legalHoldPreventsDeletion: boolean;
  normalizedDocumentAction: "none" | "review-required";
}

export const RAW_REDACTION_POSTURES = [
  "none",
  "metadata-only",
  "sensitive-fields",
  "discard-after-normalization",
] as const;
export type RawRedactionPosture = (typeof RAW_REDACTION_POSTURES)[number];

export const RAW_ENCRYPTION_REQUIREMENTS = [
  "required-at-rest",
  "platform-managed",
  "not-persisted",
] as const;
export type RawEncryptionRequirement =
  (typeof RAW_ENCRYPTION_REQUIREMENTS)[number];

export const RAW_ACCESS_CLASSES = [
  "public-source",
  "consented-private-source",
  "restricted-operational",
] as const;
export type RawArtifactAccessClass = (typeof RAW_ACCESS_CLASSES)[number];

export interface RawArtifactLifecyclePolicyDraft {
  policyVersion: string;
  retention: RawArtifactRetentionPolicy;
  deletion: RawArtifactDeletionPolicy;
  redaction: RawRedactionPosture;
  encryption: RawEncryptionRequirement;
  accessClass: RawArtifactAccessClass;
  instructionPolicy: "UNTRUSTED_DATA";
}

export interface RawArtifactLifecyclePolicy
  extends RawArtifactLifecyclePolicyDraft {
  policyId: string;
  semanticFingerprint: string;
}

export interface RawArtifactGovernanceRecord {
  governanceRecordId: string;
  artifactId: string;
  sourceIdentity: string;
  policyId: string;
  policyFingerprint: string;
}

export interface CredentialScope {
  purpose: "source-acquisition";
  connectorId: SourceConnectorId;
  consentScope: "none" | "explicit-source-access";
}

export interface CredentialReference {
  credentialRefId: string;
  connectorId: SourceConnectorId;
  requirement: Exclude<CredentialRequirementKind, "none">;
  scope: CredentialScope;
}

export interface SourceAccountAccessConsent {
  granted: boolean;
  purpose: "source-account-access";
  scope: "this-acquisition";
}

export type CredentialReferenceAvailability =
  | { status: "available" }
  | { status: "unavailable"; reasonCode: string }
  | { status: "denied"; reasonCode: string };

export interface CredentialReferenceAvailabilityResolver {
  resolveAvailability(
    reference: CredentialReference,
  ): Promise<CredentialReferenceAvailability>;
}

export const RAW_ARTIFACT_OPERATIONS = [
  "read",
  "persist",
  "normalize",
  "redact",
  "delete",
] as const;
export type RawArtifactOperation = (typeof RAW_ARTIFACT_OPERATIONS)[number];

export const RAW_ACCESS_PURPOSES = [
  "ingestion-normalization",
  "retention-management",
  "security-review",
  "deletion-request",
] as const;
export type RawAccessPurpose = (typeof RAW_ACCESS_PURPOSES)[number];

export type RawAccessActorClass =
  | "ingestion-runtime"
  | "authorized-operator"
  | "retention-worker";

export interface RawArtifactOperationContext {
  operation: RawArtifactOperation;
  purpose: RawAccessPurpose;
  actorClass: RawAccessActorClass;
  connectorId: SourceConnectorId;
  sourceAccessPolicy: SourceAccessPolicy;
  credentialReference?: CredentialReference;
  credentialAvailability?: CredentialReferenceAvailability;
  sourceAccountConsent?: SourceAccountAccessConsent;
}

export interface RawArtifactPolicyEvaluationInput {
  artifact: RawArtifactReference;
  governance: RawArtifactGovernanceRecord;
  policy: RawArtifactLifecyclePolicy;
  context: RawArtifactOperationContext;
}

export const SOURCE_ACCESS_DECISION_STATUSES = [
  "allowed",
  "denied",
  "credential-required",
  "explicit-consent-required",
  "prohibited",
] as const;
export type SourceAccessDecisionStatus =
  (typeof SOURCE_ACCESS_DECISION_STATUSES)[number];

export interface SourceAccessDecision {
  status: SourceAccessDecisionStatus;
  reasonCode: string;
  operation: RawArtifactOperation;
  policyId?: string;
  policyFingerprint?: string;
}

export interface RawArtifactAccessAuditEvent {
  auditEventId: string;
  artifactId: string;
  governanceRecordId: string;
  operation: RawArtifactOperation;
  purpose: RawAccessPurpose;
  actorClass: RawAccessActorClass;
  actorReferenceId?: string;
  decision: "allowed" | "denied";
  reasonCode: string;
  policyId: string;
  policyFingerprint: string;
  occurredAt: string;
}

export interface RawArtifactTombstone {
  tombstoneId: string;
  artifactId: string;
  sourceIdentity: string;
  contentHash: string;
  policyId: string;
  policyFingerprint: string;
  deletionReason: "expired" | "explicit-request" | "policy-deletion";
  normalizedDocumentAction: "none" | "review-required";
  deletedAt: string;
}
