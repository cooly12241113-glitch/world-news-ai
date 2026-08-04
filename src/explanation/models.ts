import type { BriefingContract, BriefingQuestion, QuestionIntent, VisualMode } from "../briefing";
import type { EvidenceContextPackage } from "../context";
import type { PersonalizedImpactPlanningContext } from "../personalization";

export type AnswerStrategy =
  | "explain-cause" | "trace-impact" | "verify-claim" | "compare-subjects"
  | "forecast-scenarios" | "personalize-impact" | "summarize-situation"
  | "exploratory-explanation";

export type PlanStatus = "draft" | "validated" | "invalid" | "insufficient-context";
export type EpistemicType =
  | "confirmed-fact" | "attributed-claim" | "interpretation"
  | "inference" | "forecast" | "unknown";

export type PlanSectionKind =
  | "direct-answer" | "current-situation" | "necessary-background"
  | "explanation-path" | "supporting-evidence" | "contradicting-evidence"
  | "comparison" | "claim-verification" | "scenarios" | "counter-factors"
  | "alternative-explanations" | "confirmed" | "uncertainty"
  | "next-verification-signals" | "sources";

export type ExplanationStepKind =
  | "state-direct-answer" | "establish-current-state" | "introduce-background"
  | "identify-trigger" | "explain-mechanism" | "trace-impact-channel"
  | "establish-claim-origin" | "evaluate-supporting-evidence"
  | "evaluate-contradicting-evidence" | "define-comparison-criterion"
  | "compare-subject" | "identify-counter-factor"
  | "present-alternative-explanation" | "establish-forecast-driver"
  | "define-scenario" | "state-assumption" | "expose-uncertainty"
  | "identify-verification-signal" | "summarize-source-basis";

export type OutputType =
  | "direct-answer" | "factual-summary" | "causal-link" | "impact-link"
  | "claim-assessment" | "comparison" | "scenario" | "uncertainty-disclosure"
  | "verification-signal" | "source-note";

export type ProhibitedBehavior =
  | "invent-fact" | "invent-source" | "unsupported-causality"
  | "promote-claim-to-fact" | "hide-contradiction" | "false-precision"
  | "infer-sensitive-user-data" | "direct-buy-sell-command";

export interface StepOutputRequirement {
  outputType: OutputType;
  maximumStatements: number;
  directness: "direct" | "contextual" | "qualified";
  requiresCitation: boolean;
  requiresConfidenceLabel: boolean;
  requiresUncertaintyLabel: boolean;
  allowedEpistemicTypes: EpistemicType[];
  prohibitedBehaviors: ProhibitedBehavior[];
}

export interface StepEpistemicPolicy {
  allowedTypes: EpistemicType[];
  preferredType: EpistemicType;
  evidenceRequirement: "required" | "when-available" | "gap-required";
  allowInference: boolean;
  allowForecast: boolean;
  requireAttribution: boolean;
  requireAssumptions: boolean;
  requireCounterEvidenceReview: boolean;
  prohibitFactPromotion: boolean;
}

export type EvidenceUsage =
  | "supports" | "contradicts" | "contextualizes" | "establishes-origin"
  | "quantifies" | "supplies-assumption" | "supplies-verification-signal"
  | "exposes-gap";

export interface ExplanationEvidenceBinding {
  id: string;
  contextItemId: string;
  usage: EvidenceUsage;
  excerptIds: string[];
  provenanceRecordIds: string[];
  sourceDocumentIds: string[];
  claimIds: string[];
  evidenceLinkIds: string[];
  dataPointIds: string[];
  entityIds: string[];
  required: boolean;
  selectionReason: string;
  confidence: number;
  warnings: string[];
}

export interface PersonalImpactBinding {
  analysisFingerprint: string;
  exposureIds: string[];
  impactChannelIds: string[];
  impactAssessmentIds: string[];
  scenarioIds: string[];
}

export interface ExplanationVisualIntent {
  id: string;
  mode: VisualMode;
  purpose: string;
  requiredness: "required" | "preferred" | "optional";
  relatedSectionIds: string[];
  relatedStepIds: string[];
  contextItemIds: string[];
  entityIds: string[];
  locationIds: string[];
  dataPointIds: string[];
  timeRange?: string;
  justification: string;
  fallbackMode: VisualMode;
  warnings: string[];
}

export interface ExplanationStep {
  id: string;
  sectionId: string;
  kind: ExplanationStepKind;
  order: number;
  objective: string;
  outputRequirement: StepOutputRequirement;
  epistemicPolicy: StepEpistemicPolicy;
  evidenceBindings: ExplanationEvidenceBinding[];
  personalImpactBindings?: PersonalImpactBinding;
  dependencyStepIds: string[];
  subjectEntityIds: string[];
  locationIds: string[];
  timeReference?: string;
  visualIntentIds: string[];
  confidenceRequirement: "required" | "when-uncertain" | "not-required";
  uncertaintyRequirement: "required" | "when-material" | "not-required";
  optional: boolean;
  warnings: string[];
}

export interface ExplanationPlanSection {
  id: string;
  kind: PlanSectionKind;
  order: number;
  required: boolean;
  objective: string;
  sourceContractSection: string;
  steps: ExplanationStep[];
  contextItemIds: string[];
  visualIntents: ExplanationVisualIntent[];
  warnings: string[];
}

export interface ExplanationPlanCoverage {
  overall: number;
  requiredSectionCoverage: number;
  evidenceCoverage: number;
  contradictionCoverage: number;
  uncertaintyCoverage: number;
  primarySourceCoverage: number;
  quantitativeCoverage: number;
  temporalCoverage: number;
  geographicCoverage: number;
  personalizationCoverage: number;
  missingRequirements: string[];
  blockingGaps: string[];
}

export interface ExplanationDecisionRule {
  type: "fact-verification" | "forecast-scenarios" | "evidence-sufficiency";
  allowedOutcomes: string[];
  requiredEvidenceConditions: string[];
  blockingConditions: string[];
  downgradeConditions: string[];
  prohibitUnsupportedConclusion: boolean;
}

export interface ExplanationPlanDraft {
  id: string;
  questionId: string;
  contractId: string;
  contextPackageId: string;
  contractFingerprint: string;
  contextPackageFingerprint: string;
  personalContextFingerprint?: string;
  personalizedImpactAnalysisFingerprint?: string;
  planVersion: string;
  policyVersion: string;
  generator: { type: "rule" | "llm" | "human"; id: string; version: string };
  answerStrategy: AnswerStrategy;
  answerObjective: string;
  status: PlanStatus;
  sections: ExplanationPlanSection[];
  globalUncertainties: string[];
  requiredVisualIntents: ExplanationVisualIntent[];
  coverage: ExplanationPlanCoverage;
  decisionRule: ExplanationDecisionRule;
  stopReason?: string;
  warnings: string[];
  createdAt: string;
  fingerprint: string;
}

export type ValidatedExplanationPlan = ExplanationPlanDraft & { status: "validated" };

export type ExplanationPlanErrorCode =
  | "CONTRACT_NOT_READY" | "CONTEXT_PACKAGE_NOT_READY"
  | "QUESTION_REFERENCE_MISMATCH" | "CONTRACT_REFERENCE_MISMATCH"
  | "CONTEXT_REFERENCE_MISMATCH" | "INVALID_EXPLANATION_PLAN"
  | "DUPLICATE_PLAN_ID" | "INVALID_SECTION_ORDER" | "INVALID_STEP_ORDER"
  | "MISSING_REQUIRED_SECTION" | "MISSING_EVIDENCE_BINDING"
  | "BROKEN_CONTEXT_REFERENCE" | "BROKEN_PROVENANCE_REFERENCE"
  | "UNSUPPORTED_EPISTEMIC_TYPE" | "UNSUPPORTED_VISUAL_MODE"
  | "VISUAL_POLICY_VIOLATION" | "PERSONALIZATION_POLICY_VIOLATION"
  | "STEP_DEPENDENCY_CYCLE" | "STOP_CONDITION_EXCEEDED"
  | "UNSUPPORTED_FACT_PROMOTION" | "FORECAST_ASSUMPTION_MISSING"
  | "UNCERTAINTY_REQUIREMENT_MISSING" | "PLAN_VALIDATION_FAILED"
  | "PLAN_ASSEMBLY_FAILED" | "PERSONAL_IMPACT_REFERENCE_INVALID"
  | "PERSONAL_IMPACT_LINEAGE_MISMATCH";

export interface ExplanationPlanValidationIssue {
  code: ExplanationPlanErrorCode;
  severity: "error" | "warning" | "info";
  path: string;
  message: string;
  relatedSectionId?: string;
  relatedStepId?: string;
  relatedContextItemId?: string;
  details?: Record<string, string | number | boolean>;
}

export type ExplanationPlanValidationResult =
  | {
      outcome: "valid" | "valid-with-warnings";
      plan: ValidatedExplanationPlan;
      issues: ExplanationPlanValidationIssue[];
      fingerprint: string;
    }
  | {
      outcome: "invalid" | "insufficient-context";
      issues: ExplanationPlanValidationIssue[];
      fingerprint: string;
    };

export type ExplanationPlanBuildResult =
  | {
      success: true;
      outcome: "ready" | "partial" | "insufficient-context";
      plan: ExplanationPlanDraft;
      validation: ExplanationPlanValidationResult;
      warnings: string[];
    }
  | {
      success: true;
      outcome: "clarification-required" | "unsupported" | "no-plan";
      clarificationQuestion?: string;
      reasons: string[];
    }
  | {
      success: false;
      error: {
        code: ExplanationPlanErrorCode;
        stage: string;
        retryable: boolean;
        details?: string;
      };
    };

export interface ExplanationPlanGenerationInput {
  question: BriefingQuestion;
  contract: BriefingContract;
  contextPackage: EvidenceContextPackage;
  personalizedImpactPlanningContext?: PersonalizedImpactPlanningContext;
}

export interface ExplanationPlanGenerator {
  readonly id: string;
  readonly version: string;
  readonly policyVersion: string;
  readonly deterministic: boolean;
  generate(input: ExplanationPlanGenerationInput): ExplanationPlanBuildResult;
}

export interface ExplanationPlanRepository {
  save(plan: ValidatedExplanationPlan): void;
  findById(id: string): ValidatedExplanationPlan | undefined;
  findLatest(questionId: string, contractId: string, contextPackageId: string): ValidatedExplanationPlan | undefined;
  findByFingerprint(fingerprint: string): ValidatedExplanationPlan | undefined;
}

export const ANSWER_STRATEGY_BY_INTENT: Record<QuestionIntent, AnswerStrategy> = {
  "causal-explanation": "explain-cause",
  "impact-analysis": "trace-impact",
  "fact-verification": "verify-claim",
  comparison: "compare-subjects",
  forecast: "forecast-scenarios",
  "personalized-impact": "personalize-impact",
  "situation-summary": "summarize-situation",
  exploratory: "exploratory-explanation",
};
