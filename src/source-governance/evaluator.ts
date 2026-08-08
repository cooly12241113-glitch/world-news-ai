import type {
  RawArtifactOperation,
  RawArtifactPolicyEvaluationInput,
  SourceAccessDecision,
  SourceAccessDecisionStatus,
} from "./models";
import { createRawArtifactId } from "../source-connector";
import {
  hasValidPolicyIdentity,
  hasValidRawArtifactGovernanceRecordIdentity,
} from "./identity";
import {
  RawArtifactPolicyEvaluationInputSchema,
  SourceAccessDecisionSchema,
} from "./validation";

const decision = (
  status: SourceAccessDecisionStatus,
  reasonCode: string,
  operation: RawArtifactOperation,
  input?: RawArtifactPolicyEvaluationInput,
): SourceAccessDecision => SourceAccessDecisionSchema.parse({
  status,
  reasonCode,
  operation,
  ...(input ? {
    policyId: input.policy.policyId,
    policyFingerprint: input.policy.semanticFingerprint,
  } : {}),
});

export class RawArtifactPolicyEvaluator {
  evaluate(input: unknown): SourceAccessDecision {
    const parsed = RawArtifactPolicyEvaluationInputSchema.safeParse(input);
    const fallbackOperation = typeof input === "object" && input !== null &&
      "context" in input && typeof input.context === "object" && input.context !== null &&
      "operation" in input.context &&
      ["read", "persist", "normalize", "redact", "delete"].includes(
        String(input.context.operation),
      )
      ? input.context.operation as RawArtifactOperation
      : "read";
    if (!parsed.success || !hasValidPolicyIdentity(parsed.data.policy)) {
      return decision("denied", "INVALID_GOVERNANCE_STATE", fallbackOperation);
    }
    const value = parsed.data;
    if (value.artifact.artifactId !== createRawArtifactId(
          value.artifact.sourceIdentity,
          value.artifact.contentHash,
        ) ||
        !hasValidRawArtifactGovernanceRecordIdentity(value.governance) ||
        value.governance.artifactId !== value.artifact.artifactId ||
        value.governance.sourceIdentity !== value.artifact.sourceIdentity ||
        value.governance.policyId !== value.policy.policyId ||
        value.governance.policyFingerprint !== value.policy.semanticFingerprint) {
      return decision("denied", "GOVERNANCE_REFERENCE_MISMATCH", value.context.operation, value);
    }
    if (value.context.sourceAccessPolicy.access === "prohibited") {
      return decision("prohibited", "SOURCE_ACCESS_PROHIBITED", value.context.operation, value);
    }
    if (value.context.operation === "delete" &&
        value.policy.retention.kind === "legal-hold") {
      return decision("denied", "LEGAL_HOLD_PREVENTS_DELETION", value.context.operation, value);
    }
    if (value.context.operation === "persist" &&
        (value.policy.retention.kind === "ephemeral" ||
         value.policy.encryption === "not-persisted" ||
         value.policy.redaction === "discard-after-normalization")) {
      return decision("denied", "RAW_PERSISTENCE_NOT_ALLOWED", value.context.operation, value);
    }
    const consentRequired =
      value.context.sourceAccessPolicy.access === "authenticated-explicit-consent" ||
      value.policy.accessClass === "consented-private-source" ||
      value.context.credentialReference?.scope.consentScope === "explicit-source-access";
    if (consentRequired && value.context.sourceAccountConsent?.granted !== true) {
      return decision(
        "explicit-consent-required",
        "SOURCE_ACCOUNT_CONSENT_REQUIRED",
        value.context.operation,
        value,
      );
    }
    const credentialRequired =
      value.context.sourceAccessPolicy.access === "authenticated-explicit-consent" ||
      value.policy.accessClass === "consented-private-source" ||
      value.policy.accessClass === "restricted-operational";
    if (credentialRequired && value.context.credentialReference === undefined) {
      return decision(
        "credential-required",
        "CREDENTIAL_REFERENCE_REQUIRED",
        value.context.operation,
        value,
      );
    }
    if (value.context.credentialReference !== undefined &&
        value.context.credentialReference.connectorId !== value.context.connectorId) {
      return decision(
        "denied",
        "CREDENTIAL_CONNECTOR_SCOPE_MISMATCH",
        value.context.operation,
        value,
      );
    }
    if (value.context.credentialReference !== undefined &&
        value.context.credentialAvailability === undefined) {
      return decision(
        "credential-required",
        "CREDENTIAL_AVAILABILITY_REQUIRED",
        value.context.operation,
        value,
      );
    }
    if (value.context.credentialAvailability?.status === "unavailable") {
      return decision(
        "credential-required",
        "CREDENTIAL_REFERENCE_UNAVAILABLE",
        value.context.operation,
        value,
      );
    }
    if (value.context.credentialAvailability?.status === "denied") {
      return decision(
        "denied",
        "CREDENTIAL_REFERENCE_ACCESS_DENIED",
        value.context.operation,
        value,
      );
    }
    return decision("allowed", "POLICY_ALLOWED", value.context.operation, value);
  }
}
