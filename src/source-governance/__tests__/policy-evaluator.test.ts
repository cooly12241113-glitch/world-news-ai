import { describe, expect, it } from "vitest";
import {
  createContentHash,
  createRawArtifactId,
  createSourceIdentity,
  type RawArtifactReference,
} from "../../source-connector";
import {
  RawArtifactPolicyEvaluator,
  createRawArtifactGovernanceRecord,
  createRawArtifactLifecyclePolicy,
  type CredentialReference,
  type RawArtifactLifecyclePolicyDraft,
  type RawArtifactPolicyEvaluationInput,
} from "../index";

const artifact = (): RawArtifactReference => {
  const sourceIdentity = createSourceIdentity({
    kind: "web",
    url: "https://example.com/governed",
  });
  const contentHash = createContentHash("governed raw text");
  return {
    artifactId: createRawArtifactId(sourceIdentity, contentHash),
    sourceIdentity,
    contentKind: "text",
    mediaType: "text/plain",
    contentHash,
    byteLength: 17,
  };
};

const draft = (): RawArtifactLifecyclePolicyDraft => ({
  policyVersion: "1",
  retention: { kind: "bounded", duration: { amount: 7, unit: "day" } },
  deletion: {
    triggers: ["scheduled-expiry", "explicit-request"],
    legalHoldPreventsDeletion: false,
    normalizedDocumentAction: "none",
  },
  redaction: "sensitive-fields",
  encryption: "platform-managed",
  accessClass: "public-source",
  instructionPolicy: "UNTRUSTED_DATA",
});

const credential = (connectorId: "web" | "rss" = "web"):
CredentialReference => ({
  credentialRefId: `credential:${connectorId}`,
  connectorId,
  requirement: "oauth",
  scope: {
    purpose: "source-acquisition",
    connectorId,
    consentScope: "explicit-source-access",
  },
});

const input = (): RawArtifactPolicyEvaluationInput => {
  const raw = artifact();
  const policy = createRawArtifactLifecyclePolicy(draft());
  return {
    artifact: raw,
    governance: createRawArtifactGovernanceRecord(raw, policy),
    policy,
    context: {
      operation: "normalize",
      purpose: "ingestion-normalization",
      actorClass: "ingestion-runtime",
      connectorId: "web",
      sourceAccessPolicy: { access: "public-only" },
    },
  };
};

const evaluator = new RawArtifactPolicyEvaluator();

describe("raw artifact policy evaluator", () => {
  it("allows a valid public-source normalization", () => {
    expect(evaluator.evaluate(input())).toMatchObject({
      status: "allowed",
      reasonCode: "POLICY_ALLOWED",
      operation: "normalize",
    });
  });

  it("requires explicit source-account consent for authenticated access", () => {
    const value = input();
    value.context.sourceAccessPolicy = {
      access: "authenticated-explicit-consent",
    };
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "explicit-consent-required",
      reasonCode: "SOURCE_ACCOUNT_CONSENT_REQUIRED",
    });
  });

  it("requires an opaque credential reference after consent", () => {
    const value = input();
    value.context.sourceAccessPolicy = {
      access: "authenticated-explicit-consent",
    };
    value.context.sourceAccountConsent = {
      granted: true,
      purpose: "source-account-access",
      scope: "this-acquisition",
    };
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "credential-required",
      reasonCode: "CREDENTIAL_REFERENCE_REQUIRED",
    });
  });

  it("allows consented access with matching connector-scoped reference", () => {
    const value = input();
    value.context.sourceAccessPolicy = {
      access: "authenticated-explicit-consent",
    };
    value.context.sourceAccountConsent = {
      granted: true,
      purpose: "source-account-access",
      scope: "this-acquisition",
    };
    value.context.credentialReference = credential();
    value.context.credentialAvailability = { status: "available" };
    expect(evaluator.evaluate(value).status).toBe("allowed");
  });

  it("denies a credential scoped to another connector", () => {
    const value = input();
    value.context.credentialReference = credential("rss");
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "explicit-consent-required",
    });
    value.context.sourceAccountConsent = {
      granted: true,
      purpose: "source-account-access",
      scope: "this-acquisition",
    };
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "denied",
      reasonCode: "CREDENTIAL_CONNECTOR_SCOPE_MISMATCH",
    });
  });

  it("fails closed when a required credential reference is unavailable", () => {
    const value = input();
    value.context.sourceAccessPolicy = {
      access: "authenticated-explicit-consent",
    };
    value.context.sourceAccountConsent = {
      granted: true,
      purpose: "source-account-access",
      scope: "this-acquisition",
    };
    value.context.credentialReference = credential();
    value.context.credentialAvailability = {
      status: "unavailable",
      reasonCode: "REFERENCE_NOT_FOUND",
    };
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "credential-required",
      reasonCode: "CREDENTIAL_REFERENCE_UNAVAILABLE",
    });
  });

  it("denies access when credential availability resolution is denied", () => {
    const value = input();
    value.context.sourceAccessPolicy = {
      access: "authenticated-explicit-consent",
    };
    value.context.sourceAccountConsent = {
      granted: true,
      purpose: "source-account-access",
      scope: "this-acquisition",
    };
    value.context.credentialReference = credential();
    value.context.credentialAvailability = {
      status: "denied",
      reasonCode: "REFERENCE_ACCESS_DENIED",
    };
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "denied",
      reasonCode: "CREDENTIAL_REFERENCE_ACCESS_DENIED",
    });
  });

  it("requires an availability decision for a supplied credential reference", () => {
    const value = input();
    value.context.credentialReference = credential();
    value.context.sourceAccountConsent = {
      granted: true,
      purpose: "source-account-access",
      scope: "this-acquisition",
    };
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "credential-required",
      reasonCode: "CREDENTIAL_AVAILABILITY_REQUIRED",
    });
  });

  it("returns prohibited for a prohibited source access policy", () => {
    const value = input();
    value.context.sourceAccessPolicy = { access: "prohibited" };
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "prohibited",
      reasonCode: "SOURCE_ACCESS_PROHIBITED",
    });
  });

  it("fails closed for unknown governance state", () => {
    expect(evaluator.evaluate({ artifact: artifact() })).toMatchObject({
      status: "denied",
      reasonCode: "INVALID_GOVERNANCE_STATE",
    });
  });

  it("fails closed for a forged policy fingerprint", () => {
    const value = input();
    value.policy.semanticFingerprint = "a".repeat(64);
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "denied",
      reasonCode: "INVALID_GOVERNANCE_STATE",
    });
  });

  it("fails closed when governance references do not match the artifact", () => {
    const value = input();
    value.governance.artifactId = "another-artifact";
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "denied",
      reasonCode: "GOVERNANCE_REFERENCE_MISMATCH",
    });
  });

  it("fails closed for a forged artifact identity even when references agree", () => {
    const value = input();
    value.artifact.artifactId = "forged-artifact";
    value.governance = createRawArtifactGovernanceRecord(
      value.artifact,
      value.policy,
    );
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "denied",
      reasonCode: "GOVERNANCE_REFERENCE_MISMATCH",
    });
  });

  it("fails closed for a forged governance record identity", () => {
    const value = input();
    value.governance.governanceRecordId = "forged-governance-record";
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "denied",
      reasonCode: "GOVERNANCE_REFERENCE_MISMATCH",
    });
  });

  it("prevents deletion under legal hold", () => {
    const value = input();
    const legal = draft();
    legal.retention = {
      kind: "legal-hold",
      authority: {
        authorityReferenceId: "legal-hold-authority-1",
        posture: "active",
      },
    };
    legal.deletion.legalHoldPreventsDeletion = true;
    value.policy = createRawArtifactLifecyclePolicy(legal);
    value.governance = createRawArtifactGovernanceRecord(value.artifact, value.policy);
    value.context.operation = "delete";
    value.context.purpose = "deletion-request";
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "denied",
      reasonCode: "LEGAL_HOLD_PREVENTS_DELETION",
    });
  });

  it("prevents persistence for discard-after-normalization", () => {
    const value = input();
    const ephemeral = draft();
    ephemeral.retention = { kind: "ephemeral" };
    ephemeral.redaction = "discard-after-normalization";
    ephemeral.encryption = "not-persisted";
    value.policy = createRawArtifactLifecyclePolicy(ephemeral);
    value.governance = createRawArtifactGovernanceRecord(value.artifact, value.policy);
    value.context.operation = "persist";
    value.context.purpose = "retention-management";
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "denied",
      reasonCode: "RAW_PERSISTENCE_NOT_ALLOWED",
    });
  });

  it("prevents durable persistence under ephemeral retention", () => {
    const value = input();
    const ephemeral = draft();
    ephemeral.retention = { kind: "ephemeral" };
    value.policy = createRawArtifactLifecyclePolicy(ephemeral);
    value.governance = createRawArtifactGovernanceRecord(value.artifact, value.policy);
    value.context.operation = "persist";
    value.context.purpose = "retention-management";
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "denied",
      reasonCode: "RAW_PERSISTENCE_NOT_ALLOWED",
    });
  });

  it("requires a credential reference for restricted operational artifacts", () => {
    const value = input();
    const restricted = draft();
    restricted.accessClass = "restricted-operational";
    value.policy = createRawArtifactLifecyclePolicy(restricted);
    value.governance = createRawArtifactGovernanceRecord(value.artifact, value.policy);
    expect(evaluator.evaluate(value)).toMatchObject({
      status: "credential-required",
      reasonCode: "CREDENTIAL_REFERENCE_REQUIRED",
    });
  });
});
