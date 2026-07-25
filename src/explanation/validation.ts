import { z } from "zod";
import type {
  ExplanationPlanBuildResult,
  ExplanationPlanDraft,
  ExplanationPlanValidationIssue,
  ExplanationPlanValidationResult,
  ExplanationStep,
} from "./models";

const Id = z.string().trim().min(1);
const Text = z.string().trim().min(1);
const Strings = z.array(Id);
const Score = z.number().finite().min(0).max(1);
const VisualMode = z.enum([
  "map", "map-flow", "chart", "timeline", "document", "comparison",
  "evidence-board", "personalized-impact", "text",
]);
const Epistemic = z.enum([
  "confirmed-fact", "attributed-claim", "interpretation",
  "inference", "forecast", "unknown",
]);
const ErrorCode = z.enum([
  "CONTRACT_NOT_READY", "CONTEXT_PACKAGE_NOT_READY",
  "QUESTION_REFERENCE_MISMATCH", "CONTRACT_REFERENCE_MISMATCH",
  "CONTEXT_REFERENCE_MISMATCH", "INVALID_EXPLANATION_PLAN",
  "DUPLICATE_PLAN_ID", "INVALID_SECTION_ORDER", "INVALID_STEP_ORDER",
  "MISSING_REQUIRED_SECTION", "MISSING_EVIDENCE_BINDING",
  "BROKEN_CONTEXT_REFERENCE", "BROKEN_PROVENANCE_REFERENCE",
  "UNSUPPORTED_EPISTEMIC_TYPE", "UNSUPPORTED_VISUAL_MODE",
  "VISUAL_POLICY_VIOLATION", "PERSONALIZATION_POLICY_VIOLATION",
  "STEP_DEPENDENCY_CYCLE", "STOP_CONDITION_EXCEEDED",
  "UNSUPPORTED_FACT_PROMOTION", "FORECAST_ASSUMPTION_MISSING",
  "UNCERTAINTY_REQUIREMENT_MISSING", "PLAN_VALIDATION_FAILED",
  "PLAN_ASSEMBLY_FAILED",
]);

export const StepOutputRequirementSchema = z.strictObject({
  outputType: z.enum([
    "direct-answer", "factual-summary", "causal-link", "impact-link",
    "claim-assessment", "comparison", "scenario", "uncertainty-disclosure",
    "verification-signal", "source-note",
  ]),
  maximumStatements: z.number().int().positive(),
  directness: z.enum(["direct", "contextual", "qualified"]),
  requiresCitation: z.boolean(),
  requiresConfidenceLabel: z.boolean(),
  requiresUncertaintyLabel: z.boolean(),
  allowedEpistemicTypes: z.array(Epistemic).min(1),
  prohibitedBehaviors: z.array(z.enum([
    "invent-fact", "invent-source", "unsupported-causality",
    "promote-claim-to-fact", "hide-contradiction", "false-precision",
    "infer-sensitive-user-data", "direct-buy-sell-command",
  ])),
});

export const StepEpistemicPolicySchema = z.strictObject({
  allowedTypes: z.array(Epistemic).min(1),
  preferredType: Epistemic,
  evidenceRequirement: z.enum(["required", "when-available", "gap-required"]),
  allowInference: z.boolean(),
  allowForecast: z.boolean(),
  requireAttribution: z.boolean(),
  requireAssumptions: z.boolean(),
  requireCounterEvidenceReview: z.boolean(),
  prohibitFactPromotion: z.boolean(),
});

export const ExplanationEvidenceBindingSchema = z.strictObject({
  id: Id, contextItemId: Id,
  usage: z.enum([
    "supports", "contradicts", "contextualizes", "establishes-origin",
    "quantifies", "supplies-assumption", "supplies-verification-signal",
    "exposes-gap",
  ]),
  excerptIds: Strings, provenanceRecordIds: Strings, sourceDocumentIds: Strings,
  claimIds: Strings, evidenceLinkIds: Strings, dataPointIds: Strings,
  entityIds: Strings, required: z.boolean(), selectionReason: Text,
  confidence: Score, warnings: z.array(z.string()),
});

export const ExplanationVisualIntentSchema = z.strictObject({
  id: Id, mode: VisualMode, purpose: Text,
  requiredness: z.enum(["required", "preferred", "optional"]),
  relatedSectionIds: Strings, relatedStepIds: Strings, contextItemIds: Strings,
  entityIds: Strings, locationIds: Strings, dataPointIds: Strings,
  timeRange: Text.optional(), justification: Text, fallbackMode: VisualMode,
  warnings: z.array(z.string()),
});

export const ExplanationStepSchema: z.ZodType<ExplanationStep> = z.strictObject({
  id: Id, sectionId: Id,
  kind: z.enum([
    "state-direct-answer", "establish-current-state", "introduce-background",
    "identify-trigger", "explain-mechanism", "trace-impact-channel",
    "establish-claim-origin", "evaluate-supporting-evidence",
    "evaluate-contradicting-evidence", "define-comparison-criterion",
    "compare-subject", "identify-counter-factor",
    "present-alternative-explanation", "establish-forecast-driver",
    "define-scenario", "state-assumption", "expose-uncertainty",
    "identify-verification-signal", "summarize-source-basis",
  ]),
  order: z.number().int().nonnegative(), objective: Text,
  outputRequirement: StepOutputRequirementSchema,
  epistemicPolicy: StepEpistemicPolicySchema,
  evidenceBindings: z.array(ExplanationEvidenceBindingSchema),
  dependencyStepIds: Strings, subjectEntityIds: Strings, locationIds: Strings,
  timeReference: Text.optional(), visualIntentIds: Strings,
  confidenceRequirement: z.enum(["required", "when-uncertain", "not-required"]),
  uncertaintyRequirement: z.enum(["required", "when-material", "not-required"]),
  optional: z.boolean(), warnings: z.array(z.string()),
});

export const ExplanationPlanSectionSchema = z.strictObject({
  id: Id,
  kind: z.enum([
    "direct-answer", "current-situation", "necessary-background",
    "explanation-path", "supporting-evidence", "contradicting-evidence",
    "comparison", "claim-verification", "scenarios", "counter-factors",
    "alternative-explanations", "confirmed", "uncertainty",
    "next-verification-signals", "sources",
  ]),
  order: z.number().int().nonnegative(), required: z.boolean(), objective: Text,
  sourceContractSection: Text, steps: z.array(ExplanationStepSchema).min(1),
  contextItemIds: Strings, visualIntents: z.array(ExplanationVisualIntentSchema),
  warnings: z.array(z.string()),
});

export const ExplanationPlanCoverageSchema = z.strictObject({
  overall: Score, requiredSectionCoverage: Score, evidenceCoverage: Score,
  contradictionCoverage: Score, uncertaintyCoverage: Score,
  primarySourceCoverage: Score, quantitativeCoverage: Score,
  temporalCoverage: Score, geographicCoverage: Score,
  personalizationCoverage: Score, missingRequirements: Strings, blockingGaps: Strings,
});

export const ExplanationDecisionRuleSchema = z.strictObject({
  type: z.enum(["fact-verification", "forecast-scenarios", "evidence-sufficiency"]),
  allowedOutcomes: Strings, requiredEvidenceConditions: Strings,
  blockingConditions: Strings, downgradeConditions: Strings,
  prohibitUnsupportedConclusion: z.boolean(),
});

export const ExplanationPlanSchema: z.ZodType<ExplanationPlanDraft> = z.strictObject({
  id: Id, questionId: Id, contractId: Id, contextPackageId: Id,
  contractFingerprint: Id, contextPackageFingerprint: Id,
  planVersion: Id, policyVersion: Id,
  generator: z.strictObject({
    type: z.enum(["rule", "llm", "human"]), id: Id, version: Id,
  }),
  answerStrategy: z.enum([
    "explain-cause", "trace-impact", "verify-claim", "compare-subjects",
    "forecast-scenarios", "personalize-impact", "summarize-situation",
    "exploratory-explanation",
  ]),
  answerObjective: Text,
  status: z.enum(["draft", "validated", "invalid", "insufficient-context"]),
  sections: z.array(ExplanationPlanSectionSchema),
  globalUncertainties: z.array(z.string()),
  requiredVisualIntents: z.array(ExplanationVisualIntentSchema),
  coverage: ExplanationPlanCoverageSchema,
  decisionRule: ExplanationDecisionRuleSchema,
  stopReason: Text.optional(), warnings: z.array(z.string()),
  createdAt: z.iso.datetime(), fingerprint: Id,
});

export const ExplanationPlanValidationIssueSchema: z.ZodType<ExplanationPlanValidationIssue> =
  z.strictObject({
    code: ErrorCode, severity: z.enum(["error", "warning", "info"]),
    path: Text, message: Text, relatedSectionId: Id.optional(),
    relatedStepId: Id.optional(), relatedContextItemId: Id.optional(),
    details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  });

export const ExplanationPlanValidationResultSchema: z.ZodType<ExplanationPlanValidationResult> =
  z.discriminatedUnion("outcome", [
    z.strictObject({
      outcome: z.enum(["valid", "valid-with-warnings"]),
      plan: ExplanationPlanSchema.and(z.object({ status: z.literal("validated") })),
      issues: z.array(ExplanationPlanValidationIssueSchema), fingerprint: Id,
    }),
    z.strictObject({
      outcome: z.enum(["invalid", "insufficient-context"]),
      issues: z.array(ExplanationPlanValidationIssueSchema), fingerprint: Id,
    }),
  ]);

export const ExplanationPlanBuildResultSchema: z.ZodType<ExplanationPlanBuildResult> =
  z.union([
    z.strictObject({
      success: z.literal(true), outcome: z.enum(["ready", "partial", "insufficient-context"]),
      plan: ExplanationPlanSchema, validation: ExplanationPlanValidationResultSchema,
      warnings: z.array(z.string()),
    }),
    z.strictObject({
      success: z.literal(true),
      outcome: z.enum(["clarification-required", "unsupported", "no-plan"]),
      clarificationQuestion: Text.optional(), reasons: z.array(Text).min(1),
    }),
    z.strictObject({
      success: z.literal(false),
      error: z.strictObject({
        code: ErrorCode, stage: Text, retryable: z.boolean(), details: z.string().optional(),
      }),
    }),
  ]);
