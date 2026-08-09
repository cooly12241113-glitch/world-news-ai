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
import { authorizeCredentialAndConsent } from "./authorization";

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
    const accessAuthorization = authorizeCredentialAndConsent({
      connectorId: value.context.connectorId,
      sourceAccessPolicy: value.context.sourceAccessPolicy,
      credentialReference: value.context.credentialReference,
      credentialAvailability: value.context.credentialAvailability,
      sourceAccountConsent: value.context.sourceAccountConsent,
      credentialRequired:
        value.policy.accessClass === "consented-private-source" ||
        value.policy.accessClass === "restricted-operational",
      consentRequired: value.policy.accessClass === "consented-private-source",
    });
    if (accessAuthorization.status === "prohibited") {
      return decision(
        accessAuthorization.status,
        accessAuthorization.reasonCode,
        value.context.operation,
        value,
      );
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
    if (accessAuthorization.status !== "allowed") {
      return decision(
        accessAuthorization.status,
        accessAuthorization.reasonCode,
        value.context.operation,
        value,
      );
    }
    return decision("allowed", "POLICY_ALLOWED", value.context.operation, value);
  }
}
