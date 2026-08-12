import { createHash, randomUUID } from "node:crypto";
import {
  RawArtifactPolicyEvaluator,
  createRawArtifactGovernanceRecord,
  type RawArtifactLifecyclePolicy,
  type RawArtifactOperationContext,
  type RawArtifactTombstone,
} from "../source-governance";
import {
  createRawArtifactId,
  createSourceIdentity,
  type RawArtifactReference,
  type SourceAcquisitionRequest,
} from "../source-connector";
import {
  HARD_MAX_DECODED_BODY_BYTES,
  type SafeNetworkAcquisitionSuccess,
} from "../source-acquisition-security";
import type {
  RawArtifactCandidate,
  RawDeleteResult,
  RawPersistenceAuditEvent,
  RawPersistenceResult,
  RawReadResult,
  StoredRawArtifact,
} from "./models";
import type {
  AtRestProtectionProvider,
  RawPersistenceUnitOfWork,
} from "./ports";
import { RawPersistenceError } from "./sqlite-adapter";

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");
const eventId = (parts: unknown): string =>
  `raw-audit:${createHash("sha256").update(JSON.stringify({ parts, nonce: randomUUID() })).digest("hex")}`;

const addDuration = (createdAt: Date, policy: RawArtifactLifecyclePolicy): string | undefined => {
  if (policy.retention.kind !== "bounded" &&
      policy.retention.kind !== "retained-for-evidence") return undefined;
  const result = new Date(createdAt);
  const { amount, unit } = policy.retention.duration;
  if (unit === "day") result.setUTCDate(result.getUTCDate() + amount);
  if (unit === "week") result.setUTCDate(result.getUTCDate() + amount * 7);
  if (unit === "month") result.setUTCMonth(result.getUTCMonth() + amount);
  if (unit === "year") result.setUTCFullYear(result.getUTCFullYear() + amount);
  return result.toISOString();
};

export interface RawArtifactPersistenceServiceOptions {
  now?: () => Date;
  atRestProtection?: AtRestProtectionProvider;
  faultInjection?: (stage: "after-artifact-write" | "before-audit") => void;
}

export class RawArtifactPersistenceService {
  readonly #now: () => Date;
  readonly #evaluator = new RawArtifactPolicyEvaluator();
  readonly #atRestProtection?: AtRestProtectionProvider;
  readonly #faultInjection?: RawArtifactPersistenceServiceOptions["faultInjection"];
  constructor(
    readonly unitOfWork: RawPersistenceUnitOfWork,
    options: RawArtifactPersistenceServiceOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date());
    this.#atRestProtection = options.atRestProtection;
    this.#faultInjection = options.faultInjection;
  }

  persist(candidate: RawArtifactCandidate): RawPersistenceResult {
    const validationFailure = this.#validateCandidate(candidate);
    if (validationFailure !== undefined) return { success: false, reasonCode: validationFailure };
    const decision = this.#evaluator.evaluate({
      artifact: candidate.artifact,
      governance: candidate.governance,
      policy: candidate.policy,
      context: { ...candidate.context, operation: "persist" },
    });
    if (decision.status !== "allowed") {
      this.#appendCandidateAudit(candidate, "denied", decision.reasonCode);
      return { success: false, reasonCode: decision.reasonCode };
    }
    if (candidate.policy.redaction === "sensitive-fields") {
      this.#appendCandidateAudit(
        candidate,
        "denied",
        "REDACTION_REQUIREMENT_UNSATISFIED",
      );
      return { success: false, reasonCode: "REDACTION_REQUIREMENT_UNSATISFIED" };
    }
    if (candidate.policy.encryption === "required-at-rest" ||
        candidate.policy.encryption === "not-persisted" ||
        !this.#hasPlatformProtection()) {
      this.#appendCandidateAudit(
        candidate,
        "denied",
        "ENCRYPTION_REQUIREMENT_UNSATISFIED",
      );
      return { success: false, reasonCode: "ENCRYPTION_REQUIREMENT_UNSATISFIED" };
    }
    const now = this.#now();
    const record: StoredRawArtifact = {
      artifact: candidate.artifact,
      bytes: new Uint8Array(candidate.bytes),
      governanceRecordId: candidate.governance.governanceRecordId,
      policyId: candidate.policy.policyId,
      policyFingerprint: candidate.policy.semanticFingerprint,
      redactionPosture: candidate.policy.redaction,
      createdAt: now.toISOString(),
      ...(addDuration(now, candidate.policy) === undefined
        ? {} : { expiresAt: addDuration(now, candidate.policy) }),
      ...(candidate.policy.retention.kind === "legal-hold"
        ? { legalHoldAuthorityId: candidate.policy.retention.authority.authorityReferenceId }
        : {}),
    };
    const occurrence = {
      acquisitionId: candidate.acquisitionId,
      artifactId: candidate.artifact.artifactId,
      occurredAt: now.toISOString(),
    };
    try {
      return this.unitOfWork.rawTransaction(({ rawArtifacts }) => {
        const outcome = rawArtifacts.insert(record, occurrence);
        this.#faultInjection?.("after-artifact-write");
        this.#faultInjection?.("before-audit");
        const auditOutcome = outcome === "blob-deduplicated" ? "deduplicated"
          : outcome === "occurrence-inserted" ? "occurrence-recorded"
          : outcome === "occurrence-replayed" ? "deduplicated"
          : "persisted";
        const reasonCode = outcome === "blob-deduplicated" ? "RAW_CONTENT_DEDUPLICATED"
          : outcome === "occurrence-inserted" ? "RAW_ACQUISITION_RECORDED"
          : outcome === "occurrence-replayed" ? "RAW_ACQUISITION_REPLAYED"
          : "RAW_PERSISTED";
        rawArtifacts.appendAudit(this.#audit(
          record, auditOutcome, reasonCode, now,
        ));
        return {
          success: true as const,
          outcome: outcome === "occurrence-replayed" ? "idempotent" as const
            : outcome === "occurrence-inserted" ? "occurrence-recorded" as const
            : outcome === "blob-deduplicated" ? "deduplicated" as const
            : "persisted" as const,
          artifactId: record.artifact.artifactId,
        };
      });
    } catch (error) {
      return {
        success: false,
        reasonCode: error instanceof RawPersistenceError
          ? error.reasonCode : "RAW_STORAGE_FAILED",
      };
    }
  }

  read(
    artifactId: string,
    policy: RawArtifactLifecyclePolicy,
    context: RawArtifactOperationContext,
  ): RawReadResult {
    let record: StoredRawArtifact | undefined;
    try {
      record = this.unitOfWork.rawRepositories.rawArtifacts.findActiveById(artifactId);
    } catch {
      return { success: false, reasonCode: "RAW_STORAGE_FAILED" };
    }
    if (record === undefined) return { success: false, reasonCode: "RAW_ARTIFACT_NOT_FOUND" };
    if (record.expiresAt !== undefined && record.expiresAt <= this.#now().toISOString()) {
      this.#appendStoredAudit(record, "read", "denied", "RAW_ARTIFACT_EXPIRED");
      return { success: false, reasonCode: "RAW_ARTIFACT_EXPIRED" };
    }
    const decision = this.#evaluator.evaluate({
      artifact: record.artifact,
      governance: {
        governanceRecordId: record.governanceRecordId,
        artifactId: record.artifact.artifactId,
        sourceIdentity: record.artifact.sourceIdentity,
        policyId: record.policyId,
        policyFingerprint: record.policyFingerprint,
      },
      policy,
      context: { ...context, operation: "read" },
    });
    if (decision.status !== "allowed") {
      this.#appendStoredAudit(record, "read", "denied", decision.reasonCode);
      return { success: false, reasonCode: decision.reasonCode };
    }
    this.#appendStoredAudit(record, "read", "allowed", "POLICY_ALLOWED");
    return { success: true, artifact: record };
  }

  delete(
    artifactId: string,
    policy: RawArtifactLifecyclePolicy,
    context: RawArtifactOperationContext,
    reason: RawArtifactTombstone["deletionReason"],
  ): RawDeleteResult {
    const repository = this.unitOfWork.rawRepositories.rawArtifacts;
    let existingTombstone: RawArtifactTombstone | undefined;
    let record: StoredRawArtifact | undefined;
    try {
      existingTombstone = repository.findTombstone(artifactId);
      record = repository.findActiveById(artifactId);
    } catch {
      return { success: false, reasonCode: "RAW_STORAGE_FAILED" };
    }
    if (existingTombstone !== undefined) {
      return { success: true, outcome: "already-deleted", tombstone: existingTombstone };
    }
    if (record === undefined) return { success: false, reasonCode: "RAW_ARTIFACT_NOT_FOUND" };
    const requiredTrigger = reason === "expired" ? "scheduled-expiry" : reason;
    if (!policy.deletion.triggers.includes(requiredTrigger)) {
      this.#appendStoredAudit(record, "delete", "denied", "RAW_DELETE_TRIGGER_NOT_ALLOWED");
      return { success: false, reasonCode: "RAW_DELETE_TRIGGER_NOT_ALLOWED" };
    }
    const governance = {
      governanceRecordId: record.governanceRecordId,
      artifactId: record.artifact.artifactId,
      sourceIdentity: record.artifact.sourceIdentity,
      policyId: record.policyId,
      policyFingerprint: record.policyFingerprint,
    };
    const decision = this.#evaluator.evaluate({
      artifact: record.artifact, governance, policy,
      context: { ...context, operation: "delete" },
    });
    if (decision.status !== "allowed") {
      this.#appendStoredAudit(record, "delete", "denied", decision.reasonCode);
      return { success: false, reasonCode: decision.reasonCode };
    }
    const tombstone: RawArtifactTombstone = {
      tombstoneId: `raw-tombstone:${artifactId}`,
      artifactId,
      sourceIdentity: record.artifact.sourceIdentity,
      contentHash: record.artifact.contentHash,
      policyId: record.policyId,
      policyFingerprint: record.policyFingerprint,
      deletionReason: reason,
      normalizedDocumentAction: policy.deletion.normalizedDocumentAction,
      deletedAt: this.#now().toISOString(),
    };
    try {
      this.unitOfWork.rawTransaction(({ rawArtifacts }) => {
        rawArtifacts.deleteToTombstone(tombstone);
        rawArtifacts.appendAudit(this.#audit(record, "deleted", "RAW_DELETED", new Date(tombstone.deletedAt), "delete"));
      });
      return { success: true, outcome: "deleted", tombstone };
    } catch {
      return { success: false, reasonCode: "RAW_STORAGE_FAILED" };
    }
  }

  listExpiryEligible(at = this.#now()): string[] {
    return this.unitOfWork.rawRepositories.rawArtifacts.listExpired(at.toISOString());
  }

  #validateCandidate(candidate: RawArtifactCandidate): string | undefined {
    if (candidate.bytes.byteLength > HARD_MAX_DECODED_BODY_BYTES) return "RAW_ARTIFACT_TOO_LARGE";
    if (candidate.bytes.byteLength !== candidate.artifact.byteLength ||
        sha256(candidate.bytes) !== candidate.artifact.contentHash) return "RAW_HASH_MISMATCH";
    if (createRawArtifactId(candidate.artifact.sourceIdentity, candidate.artifact.contentHash) !==
        candidate.artifact.artifactId) return "RAW_ARTIFACT_IDENTITY_INVALID";
    return undefined;
  }
  #hasPlatformProtection(): boolean {
    try {
      return this.#atRestProtection?.satisfies("platform-managed") === true;
    } catch {
      return false;
    }
  }
  #audit(
    record: StoredRawArtifact,
    outcome: RawPersistenceAuditEvent["outcome"],
    reasonCode: string,
    occurredAt: Date,
    operation: RawPersistenceAuditEvent["operation"] = "persist",
  ): RawPersistenceAuditEvent {
    const base = {
      artifactId: record.artifact.artifactId,
      sourceIdentity: record.artifact.sourceIdentity,
      policyId: record.policyId,
      policyFingerprint: record.policyFingerprint,
      operation, outcome, reasonCode, occurredAt: occurredAt.toISOString(),
    };
    return { eventId: eventId(base), ...base };
  }
  #appendCandidateAudit(
    candidate: RawArtifactCandidate,
    outcome: RawPersistenceAuditEvent["outcome"],
    reasonCode: string,
  ): void {
    const record: StoredRawArtifact = {
      artifact: candidate.artifact, bytes: new Uint8Array(),
      governanceRecordId: candidate.governance.governanceRecordId,
      policyId: candidate.policy.policyId,
      policyFingerprint: candidate.policy.semanticFingerprint,
      redactionPosture: candidate.policy.redaction,
      createdAt: this.#now().toISOString(),
    };
    this.#appendStoredAudit(record, "persist", outcome, reasonCode);
  }
  #appendStoredAudit(
    record: StoredRawArtifact,
    operation: RawPersistenceAuditEvent["operation"],
    outcome: RawPersistenceAuditEvent["outcome"],
    reasonCode: string,
  ): void {
    try {
      const occurredAt = this.#now();
      this.unitOfWork.rawTransaction(({ rawArtifacts }) => {
        rawArtifacts.appendAudit(this.#audit(
          record, outcome, reasonCode, occurredAt, operation,
        ));
      });
    } catch {
      // Domain result remains sanitized if operational audit persistence fails.
    }
  }
}

export const rawCandidateFromBoundedAcquisition = (
  acquired: SafeNetworkAcquisitionSuccess,
  request: SourceAcquisitionRequest,
  policy: RawArtifactLifecyclePolicy,
  context: RawArtifactOperationContext,
): RawArtifactCandidate => {
  if (acquired.body === undefined) throw new RawPersistenceError("RAW_BODY_REQUIRED");
  const sourceIdentity = createSourceIdentity(request.locator);
  const artifact: RawArtifactReference = {
    artifactId: createRawArtifactId(sourceIdentity, acquired.body.decodedSha256),
    sourceIdentity,
    contentKind: acquired.body.contentKind,
    mediaType: acquired.body.mediaType,
    contentHash: acquired.body.decodedSha256,
    byteLength: acquired.body.decodedBytesProduced,
  };
  return {
    artifact,
    bytes: acquired.body.bytes,
    acquisitionId: `safe-acquisition:${request.requestId}`,
    governance: createRawArtifactGovernanceRecord(artifact, policy),
    policy,
    context: {
      ...context,
      operation: "persist",
      connectorId: request.connectorId,
      sourceAccessPolicy: request.accessPolicy,
    },
  };
};
