import { z } from "zod";
import { IdSchema, ISODateStringSchema, NonEmptyStringSchema } from "../validation/common";
import {
  createRawArtifactId,
  CredentialRequirementSchema,
  RawArtifactReferenceSchema,
  SourceAccessPolicySchema,
  SourceConnectorIdSchema,
} from "../source-connector";
import {
  RAW_ACCESS_CLASSES,
  RAW_ACCESS_PURPOSES,
  RAW_ARTIFACT_OPERATIONS,
  RAW_DELETION_TRIGGERS,
  RAW_ENCRYPTION_REQUIREMENTS,
  RAW_REDACTION_POSTURES,
  SOURCE_ACCESS_DECISION_STATUSES,
  type CredentialReference,
  type CredentialReferenceAvailability,
  type CredentialScope,
  type LegalHoldAuthority,
  type RawArtifactAccessAuditEvent,
  type RawArtifactDeletionPolicy,
  type RawArtifactGovernanceRecord,
  type RawArtifactLifecyclePolicy,
  type RawArtifactOperationContext,
  type RawArtifactPolicyEvaluationInput,
  type RawArtifactRetentionPolicy,
  type RawArtifactTombstone,
  type RetentionDuration,
  type SourceAccessDecision,
  type SourceAcquisitionAuthorizationDecision,
  type SourceAcquisitionAuthorizationInput,
  type SourceAccountAccessConsent,
} from "./models";

const FingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const ReasonCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/u);

export const RetentionDurationSchema: z.ZodType<RetentionDuration> =
  z.strictObject({
    amount: z.number().int().positive(),
    unit: z.enum(["day", "week", "month", "year"]),
  });

export const LegalHoldAuthoritySchema: z.ZodType<LegalHoldAuthority> =
  z.strictObject({
    authorityReferenceId: IdSchema,
    posture: z.literal("active"),
  });

export const RawArtifactRetentionPolicySchema:
z.ZodType<RawArtifactRetentionPolicy> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("ephemeral") }),
  z.strictObject({
    kind: z.literal("bounded"),
    duration: RetentionDurationSchema,
  }),
  z.strictObject({
    kind: z.literal("retained-for-evidence"),
    duration: RetentionDurationSchema,
  }),
  z.strictObject({
    kind: z.literal("legal-hold"),
    authority: LegalHoldAuthoritySchema,
  }),
]);

export const RawArtifactDeletionPolicySchema:
z.ZodType<RawArtifactDeletionPolicy> = z.strictObject({
  triggers: z.array(z.enum(RAW_DELETION_TRIGGERS))
    .refine((values) => new Set(values).size === values.length),
  legalHoldPreventsDeletion: z.boolean(),
  normalizedDocumentAction: z.enum(["none", "review-required"]),
});

export const RawArtifactLifecyclePolicySchema:
z.ZodType<RawArtifactLifecyclePolicy> = z.strictObject({
  policyId: IdSchema,
  policyVersion: NonEmptyStringSchema,
  retention: RawArtifactRetentionPolicySchema,
  deletion: RawArtifactDeletionPolicySchema,
  redaction: z.enum(RAW_REDACTION_POSTURES),
  encryption: z.enum(RAW_ENCRYPTION_REQUIREMENTS),
  accessClass: z.enum(RAW_ACCESS_CLASSES),
  instructionPolicy: z.literal("UNTRUSTED_DATA"),
  semanticFingerprint: FingerprintSchema,
}).superRefine((policy, context) => {
  if (policy.retention.kind === "legal-hold" &&
      !policy.deletion.legalHoldPreventsDeletion) {
    context.addIssue({
      code: "custom",
      path: ["deletion", "legalHoldPreventsDeletion"],
      message: "Legal hold retention must prevent deletion.",
    });
  }
  if (policy.retention.kind !== "legal-hold" &&
      policy.deletion.legalHoldPreventsDeletion) {
    context.addIssue({
      code: "custom",
      path: ["deletion", "legalHoldPreventsDeletion"],
      message: "Only an explicit legal hold may prevent deletion.",
    });
  }
  if ((policy.retention.kind === "bounded" ||
       policy.retention.kind === "retained-for-evidence") &&
      !policy.deletion.triggers.includes("scheduled-expiry")) {
    context.addIssue({
      code: "custom",
      path: ["deletion", "triggers"],
      message: "Time-bounded retention requires a scheduled-expiry trigger.",
    });
  }
  const persistent = policy.retention.kind !== "ephemeral";
  if (persistent && policy.encryption === "not-persisted") {
    context.addIssue({
      code: "custom",
      path: ["encryption"],
      message: "Persistent retention requires an at-rest encryption posture.",
    });
  }
  if (policy.redaction === "discard-after-normalization" &&
      policy.encryption !== "not-persisted") {
    context.addIssue({
      code: "custom",
      path: ["encryption"],
      message: "Discard-after-normalization must use not-persisted posture.",
    });
  }
});

export const RawArtifactGovernanceRecordSchema:
z.ZodType<RawArtifactGovernanceRecord> = z.strictObject({
  governanceRecordId: IdSchema,
  artifactId: IdSchema,
  sourceIdentity: IdSchema,
  policyId: IdSchema,
  policyFingerprint: FingerprintSchema,
});

export const CredentialScopeSchema: z.ZodType<CredentialScope> = z.strictObject({
  purpose: z.literal("source-acquisition"),
  connectorId: SourceConnectorIdSchema,
  consentScope: z.enum(["none", "explicit-source-access"]),
});

export const CredentialReferenceSchema: z.ZodType<CredentialReference> =
  z.strictObject({
    credentialRefId: IdSchema,
    connectorId: SourceConnectorIdSchema,
    requirement: z.enum(["api-key", "oauth", "user-session"]),
    scope: CredentialScopeSchema,
  }).superRefine((reference, context) => {
    if (reference.connectorId !== reference.scope.connectorId) {
      context.addIssue({
        code: "custom",
        path: ["scope", "connectorId"],
        message: "Credential scope must match its connector.",
      });
    }
  });

export const SourceAccountAccessConsentSchema:
z.ZodType<SourceAccountAccessConsent> = z.strictObject({
  granted: z.boolean(),
  purpose: z.literal("source-account-access"),
  scope: z.literal("this-acquisition"),
});

export const CredentialReferenceAvailabilitySchema:
z.ZodType<CredentialReferenceAvailability> = z.union([
  z.strictObject({ status: z.literal("available") }),
  z.strictObject({ status: z.literal("unavailable"), reasonCode: ReasonCodeSchema }),
  z.strictObject({ status: z.literal("denied"), reasonCode: ReasonCodeSchema }),
]);

export const SourceAcquisitionAuthorizationInputSchema:
z.ZodType<SourceAcquisitionAuthorizationInput> = z.strictObject({
  connectorId: SourceConnectorIdSchema,
  sourceAccessPolicy: SourceAccessPolicySchema,
  credentialRequirement: CredentialRequirementSchema,
  credentialReference: CredentialReferenceSchema.optional(),
  credentialAvailability: CredentialReferenceAvailabilitySchema.optional(),
  sourceAccountConsent: SourceAccountAccessConsentSchema.optional(),
}).superRefine((value, context) => {
  if (value.credentialAvailability !== undefined &&
      value.credentialReference === undefined) {
    context.addIssue({
      code: "custom",
      path: ["credentialAvailability"],
      message: "Credential availability requires a credential reference.",
    });
  }
});

export const SourceAcquisitionAuthorizationDecisionSchema:
z.ZodType<SourceAcquisitionAuthorizationDecision> = z.strictObject({
  status: z.enum(SOURCE_ACCESS_DECISION_STATUSES),
  reasonCode: ReasonCodeSchema,
  connectorId: SourceConnectorIdSchema,
});

export const RawArtifactOperationContextSchema:
z.ZodType<RawArtifactOperationContext> = z.strictObject({
  operation: z.enum(RAW_ARTIFACT_OPERATIONS),
  purpose: z.enum(RAW_ACCESS_PURPOSES),
  actorClass: z.enum(["ingestion-runtime", "authorized-operator", "retention-worker"]),
  connectorId: SourceConnectorIdSchema,
  sourceAccessPolicy: SourceAccessPolicySchema,
  credentialReference: CredentialReferenceSchema.optional(),
  credentialAvailability: CredentialReferenceAvailabilitySchema.optional(),
  sourceAccountConsent: SourceAccountAccessConsentSchema.optional(),
}).superRefine((contextValue, context) => {
  if (contextValue.credentialAvailability !== undefined &&
      contextValue.credentialReference === undefined) {
    context.addIssue({
      code: "custom",
      path: ["credentialAvailability"],
      message: "Credential availability requires a credential reference.",
    });
  }
});

export const RawArtifactPolicyEvaluationInputSchema:
z.ZodType<RawArtifactPolicyEvaluationInput> = z.strictObject({
  artifact: RawArtifactReferenceSchema,
  governance: RawArtifactGovernanceRecordSchema,
  policy: RawArtifactLifecyclePolicySchema,
  context: RawArtifactOperationContextSchema,
});

export const SourceAccessDecisionSchema: z.ZodType<SourceAccessDecision> =
  z.strictObject({
    status: z.enum(SOURCE_ACCESS_DECISION_STATUSES),
    reasonCode: ReasonCodeSchema,
    operation: z.enum(RAW_ARTIFACT_OPERATIONS),
    policyId: IdSchema.optional(),
    policyFingerprint: FingerprintSchema.optional(),
  });

export const RawArtifactAccessAuditEventSchema:
z.ZodType<RawArtifactAccessAuditEvent> = z.strictObject({
  auditEventId: IdSchema,
  artifactId: IdSchema,
  governanceRecordId: IdSchema,
  operation: z.enum(RAW_ARTIFACT_OPERATIONS),
  purpose: z.enum(RAW_ACCESS_PURPOSES),
  actorClass: z.enum(["ingestion-runtime", "authorized-operator", "retention-worker"]),
  actorReferenceId: IdSchema.optional(),
  decision: z.enum(["allowed", "denied"]),
  reasonCode: ReasonCodeSchema,
  policyId: IdSchema,
  policyFingerprint: FingerprintSchema,
  occurredAt: ISODateStringSchema,
});

export const RawArtifactTombstoneSchema: z.ZodType<RawArtifactTombstone> =
  z.strictObject({
    tombstoneId: IdSchema,
    artifactId: IdSchema,
    sourceIdentity: IdSchema,
    contentHash: FingerprintSchema,
    policyId: IdSchema,
    policyFingerprint: FingerprintSchema,
    deletionReason: z.enum(["expired", "explicit-request", "policy-deletion"]),
    normalizedDocumentAction: z.enum(["none", "review-required"]),
    deletedAt: ISODateStringSchema,
  }).superRefine((tombstone, context) => {
    if (tombstone.artifactId !== createRawArtifactId(
          tombstone.sourceIdentity,
          tombstone.contentHash,
        )) {
      context.addIssue({
        code: "custom",
        path: ["artifactId"],
        message: "Tombstone artifact identity must match source and content identity.",
      });
    }
  });
