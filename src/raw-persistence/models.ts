import type { RawArtifactReference } from "../source-connector";
import type {
  RawArtifactGovernanceRecord,
  RawArtifactLifecyclePolicy,
  RawArtifactOperationContext,
  RawArtifactTombstone,
} from "../source-governance";

export interface RawArtifactCandidate {
  artifact: RawArtifactReference;
  bytes: Uint8Array;
  acquisitionId: string;
  governance: RawArtifactGovernanceRecord;
  policy: RawArtifactLifecyclePolicy;
  context: RawArtifactOperationContext;
}
export interface StoredRawArtifact {
  artifact: RawArtifactReference;
  bytes: Uint8Array;
  governanceRecordId: string;
  policyId: string;
  policyFingerprint: string;
  redactionPosture: RawArtifactLifecyclePolicy["redaction"];
  createdAt: string;
  expiresAt?: string;
  legalHoldAuthorityId?: string;
}
export interface RawArtifactAcquisitionOccurrence {
  acquisitionId: string;
  artifactId: string;
  occurredAt: string;
}
export interface RawPersistenceAuditEvent {
  eventId: string;
  artifactId: string;
  sourceIdentity: string;
  policyId: string;
  policyFingerprint: string;
  operation: "persist" | "read" | "delete" | "expiry";
  outcome: "allowed" | "denied" | "persisted" | "deduplicated" | "occurrence-recorded" | "deleted";
  reasonCode: string;
  occurredAt: string;
}
export type RawPersistenceResult =
  | { success: true; outcome: "persisted" | "idempotent" | "deduplicated" | "occurrence-recorded"; artifactId: string }
  | { success: false; reasonCode: string };
export type RawReadResult =
  | { success: true; artifact: StoredRawArtifact }
  | { success: false; reasonCode: string };
export type RawDeleteResult =
  | { success: true; outcome: "deleted" | "already-deleted"; tombstone: RawArtifactTombstone }
  | { success: false; reasonCode: string };
