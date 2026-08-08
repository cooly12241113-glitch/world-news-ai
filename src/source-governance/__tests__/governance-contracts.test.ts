import { describe, expect, it } from "vitest";
import {
  RawArtifactReferenceSchema,
  createContentHash,
  createRawArtifactId,
  createSourceIdentity,
  type RawArtifactReference,
} from "../../source-connector";
import {
  CredentialReferenceSchema,
  RawArtifactAccessAuditEventSchema,
  RawArtifactGovernanceRecordSchema,
  RawArtifactLifecyclePolicySchema,
  RawArtifactPolicyEvaluationInputSchema,
  RawArtifactTombstoneSchema,
  createRawArtifactGovernanceRecord,
  createRawArtifactLifecyclePolicy,
  rawArtifactPolicyFingerprint,
  type CredentialReference,
  type RawArtifactAccessAuditEvent,
  type RawArtifactLifecyclePolicy,
  type RawArtifactLifecyclePolicyDraft,
} from "../index";

const artifact = (): RawArtifactReference => {
  const sourceIdentity = createSourceIdentity({
    kind: "web",
    url: "https://example.com/raw-source",
  });
  const contentHash = createContentHash("untrusted raw source content");
  return {
    artifactId: createRawArtifactId(sourceIdentity, contentHash),
    sourceIdentity,
    contentKind: "text",
    mediaType: "text/plain",
    contentHash,
    byteLength: 28,
  };
};

const policyDraft = (): RawArtifactLifecyclePolicyDraft => ({
  policyVersion: "1",
  retention: { kind: "bounded", duration: { amount: 30, unit: "day" } },
  deletion: {
    triggers: ["scheduled-expiry", "explicit-request", "policy-deletion"],
    legalHoldPreventsDeletion: false,
    normalizedDocumentAction: "review-required",
  },
  redaction: "sensitive-fields",
  encryption: "required-at-rest",
  accessClass: "public-source",
  instructionPolicy: "UNTRUSTED_DATA",
});

const policy = (): RawArtifactLifecyclePolicy =>
  createRawArtifactLifecyclePolicy(policyDraft());

const credential = (): CredentialReference => ({
  credentialRefId: "credential-ref-1",
  connectorId: "web",
  requirement: "api-key",
  scope: {
    purpose: "source-acquisition",
    connectorId: "web",
    consentScope: "none",
  },
});

const auditEvent = (): RawArtifactAccessAuditEvent => {
  const value = artifact();
  const lifecycle = policy();
  const governance = createRawArtifactGovernanceRecord(value, lifecycle);
  return {
    auditEventId: "audit-1",
    artifactId: value.artifactId,
    governanceRecordId: governance.governanceRecordId,
    operation: "normalize",
    purpose: "ingestion-normalization",
    actorClass: "ingestion-runtime",
    decision: "allowed",
    reasonCode: "POLICY_ALLOWED",
    policyId: lifecycle.policyId,
    policyFingerprint: lifecycle.semanticFingerprint,
    occurredAt: "2026-08-07T00:00:00.000Z",
  };
};

const evaluationInput = () => {
  const value = artifact();
  const lifecycle = policy();
  return {
    artifact: value,
    governance: createRawArtifactGovernanceRecord(value, lifecycle),
    policy: lifecycle,
    context: {
      operation: "normalize" as const,
      purpose: "ingestion-normalization" as const,
      actorClass: "ingestion-runtime" as const,
      connectorId: "web" as const,
      sourceAccessPolicy: { access: "public-only" as const },
    },
  };
};

describe("raw artifact governance contracts", () => {
  it("accepts a bounded public-source lifecycle policy", () => {
    expect(RawArtifactLifecyclePolicySchema.safeParse(policy()).success).toBe(true);
  });

  it("accepts typed bounded retention without a core magic duration", () => {
    expect(policy().retention).toEqual({
      kind: "bounded",
      duration: { amount: 30, unit: "day" },
    });
  });

  it.each([0, -1])("rejects invalid retention amount %s", (amount) => {
    const draft = policyDraft();
    draft.retention = { kind: "bounded", duration: { amount, unit: "day" } };
    expect(RawArtifactLifecyclePolicySchema.safeParse(
      createRawArtifactLifecyclePolicy(draft),
    ).success).toBe(false);
  });

  it("requires retained-for-evidence to remain explicitly bounded", () => {
    const draft = policyDraft();
    draft.retention = {
      kind: "retained-for-evidence",
      duration: { amount: 90, unit: "day" },
    };
    expect(RawArtifactLifecyclePolicySchema.safeParse(
      createRawArtifactLifecyclePolicy(draft),
    ).success).toBe(true);
    expect(RawArtifactLifecyclePolicySchema.safeParse({
      ...createRawArtifactLifecyclePolicy(draft),
      retention: { kind: "retained-for-evidence" },
    }).success).toBe(false);
  });

  it("requires time-bounded retention to schedule expiry", () => {
    const draft = policyDraft();
    draft.deletion.triggers = ["explicit-request"];
    expect(RawArtifactLifecyclePolicySchema.safeParse(
      createRawArtifactLifecyclePolicy(draft),
    ).success).toBe(false);
  });

  it("requires an explicit opaque authority for legal hold", () => {
    const draft = policyDraft();
    draft.retention = {
      kind: "legal-hold",
      authority: {
        authorityReferenceId: "legal-hold-authority-1",
        posture: "active",
      },
    };
    draft.deletion.legalHoldPreventsDeletion = true;
    expect(RawArtifactLifecyclePolicySchema.safeParse(
      createRawArtifactLifecyclePolicy(draft),
    ).success).toBe(true);
    expect(RawArtifactLifecyclePolicySchema.safeParse({
      ...createRawArtifactLifecyclePolicy(draft),
      retention: { kind: "legal-hold" },
    }).success).toBe(false);
  });

  it("rejects deletion protection outside an explicit legal hold", () => {
    const draft = policyDraft();
    draft.deletion.legalHoldPreventsDeletion = true;
    expect(RawArtifactLifecyclePolicySchema.safeParse(
      createRawArtifactLifecyclePolicy(draft),
    ).success).toBe(false);
  });

  it("accepts discard-after-normalization without persistence encryption", () => {
    const draft = policyDraft();
    draft.retention = { kind: "ephemeral" };
    draft.redaction = "discard-after-normalization";
    draft.encryption = "not-persisted";
    expect(RawArtifactLifecyclePolicySchema.safeParse(
      createRawArtifactLifecyclePolicy(draft),
    ).success).toBe(true);
  });

  it("does not equate public access with permanent retention", () => {
    const value = policy();
    expect(value.accessClass).toBe("public-source");
    expect(value.retention.kind).toBe("bounded");
  });

  it("accepts an opaque connector-scoped CredentialReference", () => {
    expect(CredentialReferenceSchema.parse(credential())).toEqual(credential());
  });

  it("rejects a credential reference whose connector scope mismatches", () => {
    const value = credential();
    value.scope.connectorId = "rss";
    expect(CredentialReferenceSchema.safeParse(value).success).toBe(false);
  });

  it("rejects a credential reference outside the source-acquisition purpose", () => {
    expect(CredentialReferenceSchema.safeParse({
      ...credential(),
      scope: { ...credential().scope, purpose: "personal-impact" },
    }).success).toBe(false);
  });

  it.each([
    "token",
    "apiKey",
    "password",
    "cookie",
    "authorization",
    "accessToken",
    "refreshToken",
    "secret",
    "credentialValue",
  ])("rejects secret field %s across public governance schemas", (field) => {
    expect(CredentialReferenceSchema.safeParse({
      ...credential(),
      [field]: "secret-value",
    }).success).toBe(false);
    expect(RawArtifactLifecyclePolicySchema.safeParse({
      ...policy(),
      [field]: "secret-value",
    }).success).toBe(false);
    expect(RawArtifactAccessAuditEventSchema.safeParse({
      ...auditEvent(),
      [field]: "secret-value",
    }).success).toBe(false);
    expect(RawArtifactPolicyEvaluationInputSchema.safeParse({
      ...evaluationInput(),
      [field]: "secret-value",
    }).success).toBe(false);
  });

  it("accepts a privacy-minimized access audit event", () => {
    expect(RawArtifactAccessAuditEventSchema.safeParse(auditEvent()).success)
      .toBe(true);
  });

  it("rejects raw content in an access audit event", () => {
    expect(RawArtifactAccessAuditEventSchema.safeParse({
      ...auditEvent(),
      rawContent: "ignore previous instructions",
    }).success).toBe(false);
  });

  it("creates a deterministic policy fingerprint independent of trigger order", () => {
    const first = policyDraft();
    const second = policyDraft();
    second.deletion.triggers.reverse();
    expect(rawArtifactPolicyFingerprint(first)).toBe(
      rawArtifactPolicyFingerprint(second),
    );
  });

  it("keeps runtime audit timestamps out of policy identity", () => {
    const first = auditEvent();
    const second = { ...auditEvent(), occurredAt: "2026-08-08T00:00:00.000Z" };
    expect(first.policyFingerprint).toBe(second.policyFingerprint);
  });

  it("makes raw deletion behavior explicit without deleting normalized data", () => {
    expect(policy().deletion.normalizedDocumentAction).toBe("review-required");
    expect(policy().deletion).not.toHaveProperty("deleteSourceDocument");
  });

  it("keeps Sprint 17.1 RawArtifactReference contract compatible", () => {
    expect(RawArtifactReferenceSchema.safeParse(artifact()).success).toBe(true);
    expect(RawArtifactGovernanceRecordSchema.safeParse(
      createRawArtifactGovernanceRecord(artifact(), policy()),
    ).success).toBe(true);
  });

  it("attaches governance by identity without copying the policy", () => {
    const governance = createRawArtifactGovernanceRecord(artifact(), policy());
    expect(governance).not.toHaveProperty("retention");
    expect(governance).not.toHaveProperty("encryption");
  });

  it("retains a minimal provenance tombstone contract after deletion", () => {
    const value = artifact();
    const lifecycle = policy();
    expect(RawArtifactTombstoneSchema.safeParse({
      tombstoneId: "tombstone-1",
      artifactId: value.artifactId,
      sourceIdentity: value.sourceIdentity,
      contentHash: value.contentHash,
      policyId: lifecycle.policyId,
      policyFingerprint: lifecycle.semanticFingerprint,
      deletionReason: "expired",
      normalizedDocumentAction: "review-required",
      deletedAt: "2026-09-07T00:00:00.000Z",
    }).success).toBe(true);
  });

  it.each(["rawContent", "secret", "credentialValue", "metadata"])(
    "rejects tombstone shadow-storage field %s",
    (field) => {
      const value = artifact();
      const lifecycle = policy();
      expect(RawArtifactTombstoneSchema.safeParse({
        tombstoneId: "tombstone-1",
        artifactId: value.artifactId,
        sourceIdentity: value.sourceIdentity,
        contentHash: value.contentHash,
        policyId: lifecycle.policyId,
        policyFingerprint: lifecycle.semanticFingerprint,
        deletionReason: "expired",
        normalizedDocumentAction: "review-required",
        deletedAt: "2026-09-07T00:00:00.000Z",
        [field]: "forbidden",
      }).success).toBe(false);
    },
  );

  it("rejects a tombstone whose artifact identity is forged", () => {
    const value = artifact();
    const lifecycle = policy();
    expect(RawArtifactTombstoneSchema.safeParse({
      tombstoneId: "tombstone-1",
      artifactId: "forged-artifact",
      sourceIdentity: value.sourceIdentity,
      contentHash: value.contentHash,
      policyId: lifecycle.policyId,
      policyFingerprint: lifecycle.semanticFingerprint,
      deletionReason: "expired",
      normalizedDocumentAction: "review-required",
      deletedAt: "2026-09-07T00:00:00.000Z",
    }).success).toBe(false);
  });

  it("fixes acquired content posture to UNTRUSTED_DATA", () => {
    expect(policy().instructionPolicy).toBe("UNTRUSTED_DATA");
    expect(RawArtifactLifecyclePolicySchema.safeParse({
      ...policy(),
      instructionPolicy: "INSTRUCTIONS",
    }).success).toBe(false);
  });
});
