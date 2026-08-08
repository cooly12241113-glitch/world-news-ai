import { createHash } from "node:crypto";
import type { RawArtifactReference } from "../source-connector";
import type {
  RawArtifactGovernanceRecord,
  RawArtifactLifecyclePolicy,
  RawArtifactLifecyclePolicyDraft,
} from "./models";

const fingerprint = (value: unknown): string =>
  createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");

export const rawArtifactPolicySemanticValue = (
  policy: RawArtifactLifecyclePolicyDraft | RawArtifactLifecyclePolicy,
): unknown => ({
  policyVersion: policy.policyVersion.normalize("NFC"),
  retention: policy.retention,
  deletion: {
    ...policy.deletion,
    triggers: [...policy.deletion.triggers].sort(),
  },
  redaction: policy.redaction,
  encryption: policy.encryption,
  accessClass: policy.accessClass,
  instructionPolicy: policy.instructionPolicy,
});

export const rawArtifactPolicyFingerprint = (
  policy: RawArtifactLifecyclePolicyDraft | RawArtifactLifecyclePolicy,
): string => fingerprint(rawArtifactPolicySemanticValue(policy));

export const createRawArtifactLifecyclePolicy = (
  draft: RawArtifactLifecyclePolicyDraft,
): RawArtifactLifecyclePolicy => {
  const semanticFingerprint = rawArtifactPolicyFingerprint(draft);
  return {
    ...draft,
    policyId: `raw-policy:${semanticFingerprint}`,
    semanticFingerprint,
  };
};

export const hasValidPolicyIdentity = (
  policy: RawArtifactLifecyclePolicy,
): boolean => {
  const expected = rawArtifactPolicyFingerprint(policy);
  return policy.semanticFingerprint === expected &&
    policy.policyId === `raw-policy:${expected}`;
};

export const createRawArtifactGovernanceRecord = (
  artifact: RawArtifactReference,
  policy: RawArtifactLifecyclePolicy,
): RawArtifactGovernanceRecord => ({
  governanceRecordId: `raw-governance:${fingerprint({
    artifactId: artifact.artifactId,
    policyId: policy.policyId,
    policyFingerprint: policy.semanticFingerprint,
  })}`,
  artifactId: artifact.artifactId,
  sourceIdentity: artifact.sourceIdentity,
  policyId: policy.policyId,
  policyFingerprint: policy.semanticFingerprint,
});

export const hasValidRawArtifactGovernanceRecordIdentity = (
  record: RawArtifactGovernanceRecord,
): boolean => record.governanceRecordId === `raw-governance:${fingerprint({
  artifactId: record.artifactId,
  policyId: record.policyId,
  policyFingerprint: record.policyFingerprint,
})}`;
