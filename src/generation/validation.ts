import { z } from "zod";
import { BriefingContractSchema, BriefingQuestionSchema } from "../briefing";
import { EvidenceContextPackageSchema } from "../context";
import {
  ExplanationDecisionRuleSchema, ExplanationEvidenceBindingSchema,
  ExplanationPlanSchema, ExplanationPlanSectionSchema, ExplanationPlanValidationResultSchema,
  ExplanationStepSchema, ExplanationVisualIntentSchema,
} from "../explanation";
import type {
  AllowedReferenceCatalog, ExplanationPlanGenerationInput,
  ExplanationPlanLlmRequestPackage, ExplanationPlanProposal,
  GenerationAuditRecord, GenerationAttempt, GenerationError,
  PromptTemplateDefinition, ProviderCapabilities, ProviderMetadata,
  ProviderStructuredResponse, StructuredGenerationBudget,
  StructuredGenerationResult,
} from "./models";

const S = z.string().trim().min(1);
const SA = z.array(S);
const NN = z.number().finite().int().nonnegative();
const POS = z.number().finite().int().positive();
const VisualMode = z.enum(["map", "map-flow", "chart", "timeline", "document", "comparison", "evidence-board", "personalized-impact", "text"]);
const Epistemic = z.enum(["confirmed-fact", "attributed-claim", "interpretation", "inference", "forecast", "unknown"]);
const ErrorCode = z.enum([
  "INVALID_GENERATION_INPUT", "CONTRACT_NOT_READY", "CONTEXT_NOT_READY",
  "REFERENCE_MISMATCH", "PROVIDER_NOT_CONFIGURED", "PROVIDER_DISABLED",
  "PROVIDER_TIMEOUT", "PROVIDER_ABORTED", "PROVIDER_RATE_LIMITED",
  "PROVIDER_QUOTA_EXCEEDED", "PROVIDER_AUTHENTICATION_FAILED",
  "PROVIDER_PERMISSION_DENIED", "PROVIDER_INVALID_REQUEST",
  "PROVIDER_TRANSIENT_ERROR", "PROVIDER_RESPONSE_INVALID", "PROVIDER_REFUSAL",
  "PROPOSAL_SCHEMA_INVALID", "PROPOSAL_REFERENCE_INVALID",
  "PROPOSAL_HYDRATION_FAILED", "PLAN_SEMANTIC_INVALID", "REPAIR_EXHAUSTED",
]);

export const ProviderMetadataSchema: z.ZodType<ProviderMetadata> = z.strictObject({
  providerId: S, adapterId: S, adapterVersion: S, modelId: z.string(),
  supportsJsonSchema: z.boolean(), supportsNativeStructuredOutput: z.boolean(),
  supportsRefusalSignal: z.boolean(), supportsUsageReporting: z.boolean(),
  deterministicMode: z.enum(["deterministic", "best-effort", "nondeterministic"]),
  configured: z.boolean(),
});
export const ProviderCapabilitiesSchema: z.ZodType<ProviderCapabilities> = z.strictObject({
  maximumInputCharacters: POS, maximumOutputTokens: POS,
  nativeStructuredOutput: z.boolean(), jsonSchemaDraft: S,
  supportsAbortSignal: z.boolean(), supportsRequestId: z.boolean(),
  supportsTemperature: z.boolean(), supportsSeed: z.boolean(),
  supportsReasoningControl: z.boolean(),
});
export const StructuredGenerationBudgetSchema: z.ZodType<StructuredGenerationBudget> = z.strictObject({
  maximumInputCharacters: POS, maximumOutputTokens: POS, timeoutMs: POS,
  maximumTransportRetries: NN, maximumRepairAttempts: z.union([z.literal(0), z.literal(1)]),
});
const GenerationPolicySchema = z.strictObject({
  id: S, version: S, promptTemplateId: S, promptTemplateVersion: S,
  proposalSchemaVersion: S, planSchemaVersion: S, allowRepair: z.boolean(),
  retryBaseDelayMs: NN,
});
export const ExplanationPlanGenerationInputSchema: z.ZodType<Omit<ExplanationPlanGenerationInput, "abortSignal">> = z.strictObject({
  question: BriefingQuestionSchema, briefingContract: BriefingContractSchema,
  evidenceContextPackage: EvidenceContextPackageSchema,
  generationPolicy: GenerationPolicySchema,
  providerSelection: z.strictObject({ providerId: S, modelId: S }),
  generationBudget: StructuredGenerationBudgetSchema,
  requestedAt: z.iso.datetime(), requestId: S,
});
export const AllowedReferenceCatalogSchema: z.ZodType<AllowedReferenceCatalog> = z.strictObject({
  contextItemIds: SA, excerptIds: SA, provenanceRecordIds: SA,
  sourceDocumentIds: SA, claimIds: SA, evidenceLinkIds: SA, dataPointIds: SA,
  entityIds: SA, locationIds: SA, requiredSectionKinds: SA,
  allowedVisualModes: z.array(VisualMode), allowedEpistemicTypes: z.array(Epistemic),
});
const UntrustedEvidenceSchema = z.strictObject({
  recordType: z.literal("UNTRUSTED_EVIDENCE"), instructionPolicy: z.literal("DATA_ONLY"),
  contextItemId: S, excerptId: S, text: S, evidenceCategory: S,
  sourceDocumentIds: SA, claimIds: SA, evidenceLinkIds: SA, dataPointIds: SA,
  entityIds: SA, locationIds: SA, provenanceRecordIds: SA,
  confidence: z.number().finite().min(0).max(1),
  relation: z.enum(["supports", "contradicts", "contextualizes"]),
});
export const PromptTemplateDefinitionSchema: z.ZodType<PromptTemplateDefinition> = z.strictObject({
  id: S, version: S, systemInstruction: S, evidenceInstruction: S,
  outputInstruction: S, hash: S,
});
export const ExplanationPlanLlmRequestPackageSchema: z.ZodType<ExplanationPlanLlmRequestPackage> = z.strictObject({
  requestId: S,
  questionReference: z.strictObject({
    questionId: S, text: S, language: z.enum(["ko", "en"]), personalizationRequested: z.boolean(),
  }),
  normalizedQuestion: S, answerGoal: S,
  answerStrategy: z.enum(["explain-cause", "trace-impact", "verify-claim", "compare-subjects", "forecast-scenarios", "personalize-impact", "summarize-situation", "exploratory-explanation"]),
  contractSummary: z.record(z.string(), z.unknown()), policySummary: z.record(z.string(), z.unknown()),
  contextCatalog: z.array(UntrustedEvidenceSchema),
  allowedReferenceCatalog: AllowedReferenceCatalogSchema, requiredSections: SA,
  permittedVisualModes: z.array(VisualMode), prohibitedBehaviors: SA,
  proposalSchemaVersion: S, promptTemplate: PromptTemplateDefinitionSchema,
  generationBudget: StructuredGenerationBudgetSchema, requestFingerprint: S,
});

export const ProposalEvidenceBindingSchema = ExplanationEvidenceBindingSchema.omit({ id: true }).extend({ localKey: S }).strict();
const ExplanationStepObject = ExplanationStepSchema as unknown as z.ZodObject<z.ZodRawShape>;
export const ProposalStepSchema = ExplanationStepObject.omit({
  id: true, sectionId: true, evidenceBindings: true,
  dependencyStepIds: true, visualIntentIds: true,
}).extend({
  localKey: S, evidenceBindings: z.array(ProposalEvidenceBindingSchema),
  dependencyLocalKeys: SA, visualIntentKeys: SA,
}).strict();
export const ProposalSectionSchema = ExplanationPlanSectionSchema.omit({
  id: true, steps: true, visualIntents: true,
}).extend({
  localKey: S, steps: z.array(ProposalStepSchema).min(1), visualIntentKeys: SA,
  objective: z.string().trim().min(1).max(500),
}).strict();
export const ProposalVisualIntentSchema = ExplanationVisualIntentSchema.omit({
  id: true, relatedSectionIds: true, relatedStepIds: true,
}).extend({
  localKey: S, relatedSectionKeys: SA, relatedStepKeys: SA,
  purpose: z.string().trim().min(1).max(500),
  justification: z.string().trim().min(1).max(500),
}).strict();
export const ExplanationPlanProposalSchema: z.ZodType<ExplanationPlanProposal> = z.strictObject({
  answerStrategy: z.enum(["explain-cause", "trace-impact", "verify-claim", "compare-subjects", "forecast-scenarios", "personalize-impact", "summarize-situation", "exploratory-explanation"]),
  sections: z.array(ProposalSectionSchema).min(1),
  visualIntents: z.array(ProposalVisualIntentSchema),
  decisionRule: ExplanationDecisionRuleSchema,
  globalUncertainties: z.array(z.string()), warnings: z.array(z.string()),
}) as unknown as z.ZodType<ExplanationPlanProposal>;
export const GenerationErrorSchema: z.ZodType<GenerationError> = z.strictObject({
  code: ErrorCode, stage: S, message: S, retryable: z.boolean(),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});
const UsageSchema = z.strictObject({
  inputTokens: NN.optional(), outputTokens: NN.optional(), totalTokens: NN.optional(),
  cachedTokens: NN.optional(), reasoningTokens: NN.optional(),
});
export const ProviderRefusalSchema = z.strictObject({ code: S, reason: S });
export const ProviderStructuredResponseSchema: z.ZodType<ProviderStructuredResponse> = z.union([
  z.strictObject({ outcome: z.literal("proposal"), proposal: z.unknown(), providerResponseId: S.optional(), finishReason: S.optional(), usage: UsageSchema.optional() }),
  z.strictObject({ outcome: z.literal("refusal"), refusal: ProviderRefusalSchema, providerResponseId: S.optional(), usage: UsageSchema.optional() }),
  z.strictObject({ outcome: z.literal("failure"), error: GenerationErrorSchema }),
]);
export const GenerationAttemptSchema: z.ZodType<GenerationAttempt> = z.strictObject({
  attempt: POS, kind: z.enum(["initial", "transport-retry", "repair"]),
  startedAt: z.iso.datetime(), completedAt: z.iso.datetime(),
  outcome: z.enum(["proposal", "refusal", "failure"]), errorCode: ErrorCode.optional(),
  providerResponseId: S.optional(), finishReason: S.optional(), usage: UsageSchema.optional(),
});
export const GenerationAuditRecordSchema: z.ZodType<GenerationAuditRecord> = z.strictObject({
  runId: S, requestId: S, requestFingerprint: S, questionId: S, contractId: S,
  contextPackageId: S, contractFingerprint: S, contextPackageFingerprint: S,
  providerId: S, adapterId: S, adapterVersion: S, modelId: S,
  promptTemplateId: S, promptTemplateVersion: S, promptHash: S,
  proposalSchemaVersion: S, planSchemaVersion: S, validationPolicyVersion: S,
  startedAt: z.iso.datetime(), completedAt: z.iso.datetime(),
  attempts: z.array(GenerationAttemptSchema), providerResponseId: S.optional(),
  finishReason: S.optional(), refusal: ProviderRefusalSchema.optional(),
  usage: UsageSchema.optional(), providerOutputHash: S.optional(),
  hydratedDraftFingerprint: S.optional(), validatedPlanFingerprint: S.optional(),
  validationOutcome: z.enum(["valid", "valid-with-warnings", "invalid", "insufficient-context"]).optional(),
  repairCount: NN, redactionApplied: z.boolean(), warnings: z.array(z.string()),
});
export const StructuredGenerationResultSchema: z.ZodType<StructuredGenerationResult> = z.union([
  z.strictObject({
    success: z.literal(true), outcome: z.literal("validated-plan"),
    plan: ExplanationPlanSchema.and(z.object({ status: z.literal("validated") })),
    validation: ExplanationPlanValidationResultSchema, audit: GenerationAuditRecordSchema,
  }),
  z.strictObject({
    success: z.literal(true),
    outcome: z.enum(["clarification-required", "unsupported", "insufficient-context", "provider-refusal"]),
    audit: GenerationAuditRecordSchema, reasons: z.array(S),
  }),
  z.strictObject({ success: z.literal(false), error: GenerationErrorSchema, audit: GenerationAuditRecordSchema }),
]) as unknown as z.ZodType<StructuredGenerationResult>;
