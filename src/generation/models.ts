import type { BriefingContract, BriefingQuestion, VisualMode } from "../briefing";
import type { EvidenceContextPackage } from "../context";
import type {
  AnswerStrategy, EpistemicType, ExplanationDecisionRule,
  ExplanationPlanBuildResult, ExplanationPlanDraft, ExplanationPlanSection,
  ExplanationPlanValidationResult, ExplanationStep,
  ExplanationVisualIntent, ValidatedExplanationPlan,
} from "../explanation";
import type { PersonalizedImpactPlanningContext } from "../personalization";

export interface ProviderMetadata {
  providerId: string; adapterId: string; adapterVersion: string; modelId: string;
  supportsJsonSchema: boolean; supportsNativeStructuredOutput: boolean;
  supportsRefusalSignal: boolean; supportsUsageReporting: boolean;
  deterministicMode: "deterministic" | "best-effort" | "nondeterministic";
  configured: boolean;
}

export interface ProviderCapabilities {
  maximumInputCharacters: number; maximumOutputTokens: number;
  nativeStructuredOutput: boolean; jsonSchemaDraft: string;
  supportsAbortSignal: boolean; supportsRequestId: boolean;
  supportsTemperature: boolean; supportsSeed: boolean; supportsReasoningControl: boolean;
}

export interface StructuredGenerationBudget {
  maximumInputCharacters: number; maximumOutputTokens: number;
  timeoutMs: number; maximumTransportRetries: number; maximumRepairAttempts: 0 | 1;
}

export interface GenerationPolicy {
  id: string; version: string; promptTemplateId: string; promptTemplateVersion: string;
  proposalSchemaVersion: string; planSchemaVersion: string;
  allowRepair: boolean; retryBaseDelayMs: number;
}

export interface ProviderSelection { providerId: string; modelId: string }

export interface ExplanationPlanGenerationInput {
  question: BriefingQuestion; briefingContract: BriefingContract;
  evidenceContextPackage: EvidenceContextPackage; generationPolicy: GenerationPolicy;
  providerSelection: ProviderSelection; generationBudget: StructuredGenerationBudget;
  requestedAt: string; requestId: string; abortSignal?: AbortSignal;
  personalizedImpactPlanningContext?: PersonalizedImpactPlanningContext;
}

export interface AllowedReferenceCatalog {
  contextItemIds: string[]; excerptIds: string[]; provenanceRecordIds: string[];
  sourceDocumentIds: string[]; claimIds: string[]; evidenceLinkIds: string[];
  dataPointIds: string[]; entityIds: string[]; locationIds: string[];
  requiredSectionKinds: string[]; allowedVisualModes: VisualMode[];
  allowedEpistemicTypes: EpistemicType[];
  personalImpact?: {
    analysisFingerprint: string;
    exposureIds: string[];
    impactChannelIds: string[];
    impactAssessmentIds: string[];
    scenarioIds: string[];
  };
}

export interface UntrustedEvidenceRecord {
  recordType: "UNTRUSTED_EVIDENCE"; instructionPolicy: "DATA_ONLY";
  contextItemId: string; excerptId: string; text: string;
  evidenceCategory: string; sourceDocumentIds: string[]; claimIds: string[];
  evidenceLinkIds: string[]; dataPointIds: string[]; entityIds: string[];
  locationIds: string[]; provenanceRecordIds: string[]; confidence: number;
  relation: "supports" | "contradicts" | "contextualizes";
}

export interface PromptTemplateDefinition {
  id: string; version: string; systemInstruction: string; evidenceInstruction: string;
  outputInstruction: string; hash: string;
}

export interface ExplanationPlanLlmRequestPackage {
  requestId: string;
  questionReference: { questionId: string; text: string; language: "ko" | "en"; personalizationRequested: boolean };
  normalizedQuestion: string; answerGoal: string; answerStrategy: AnswerStrategy;
  contractSummary: Record<string, unknown>; policySummary: Record<string, unknown>;
  contextCatalog: UntrustedEvidenceRecord[]; allowedReferenceCatalog: AllowedReferenceCatalog;
  requiredSections: string[]; permittedVisualModes: VisualMode[];
  prohibitedBehaviors: string[]; proposalSchemaVersion: string;
  promptTemplate: PromptTemplateDefinition; generationBudget: StructuredGenerationBudget;
  requestFingerprint: string;
  personalizedImpactPlanningContext?: PersonalizedImpactPlanningContext;
}

export type ProposalSection = Omit<ExplanationPlanSection, "id" | "steps" | "visualIntents"> & {
  localKey: string; steps: ProposalStep[]; visualIntentKeys: string[];
};
export type ProposalStep = Omit<
  ExplanationStep,
  "id" | "sectionId" | "dependencyStepIds" | "visualIntentIds" | "evidenceBindings"
> & {
  localKey: string; evidenceBindings: ProposalEvidenceBinding[];
  dependencyLocalKeys: string[]; visualIntentKeys: string[];
};
export type ProposalEvidenceBinding = Omit<
  ExplanationStep["evidenceBindings"][number], "id"
> & { localKey: string };
export type ProposalVisualIntent = Omit<
  ExplanationVisualIntent, "id" | "relatedSectionIds" | "relatedStepIds"
> & { localKey: string; relatedSectionKeys: string[]; relatedStepKeys: string[] };

export interface ExplanationPlanProposal {
  answerStrategy: AnswerStrategy; sections: ProposalSection[];
  visualIntents: ProposalVisualIntent[]; decisionRule: ExplanationDecisionRule;
  globalUncertainties: string[]; warnings: string[];
}

export interface ProviderUsage {
  inputTokens?: number; outputTokens?: number; totalTokens?: number;
  cachedTokens?: number; reasoningTokens?: number;
}

export type GenerationErrorCode =
  | "INVALID_GENERATION_INPUT" | "CONTRACT_NOT_READY" | "CONTEXT_NOT_READY"
  | "REFERENCE_MISMATCH" | "PROVIDER_NOT_CONFIGURED" | "PROVIDER_DISABLED"
  | "PROVIDER_TIMEOUT" | "PROVIDER_ABORTED" | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_QUOTA_EXCEEDED" | "PROVIDER_AUTHENTICATION_FAILED"
  | "PROVIDER_PERMISSION_DENIED" | "PROVIDER_INVALID_REQUEST"
  | "PROVIDER_TRANSIENT_ERROR" | "PROVIDER_RESPONSE_INVALID"
  | "PROVIDER_REFUSAL" | "PROPOSAL_SCHEMA_INVALID"
  | "PROPOSAL_REFERENCE_INVALID" | "PROPOSAL_HYDRATION_FAILED"
  | "PLAN_SEMANTIC_INVALID" | "REPAIR_EXHAUSTED";

export interface GenerationError {
  code: GenerationErrorCode; stage: string; message: string;
  retryable: boolean; details?: Record<string, string | number | boolean>;
}

export type ProviderStructuredResponse =
  | { outcome: "proposal"; proposal: unknown; providerResponseId?: string; finishReason?: string; usage?: ProviderUsage }
  | { outcome: "refusal"; refusal: { code: string; reason: string }; providerResponseId?: string; usage?: ProviderUsage }
  | { outcome: "failure"; error: GenerationError };

export interface StructuredGenerationProvider {
  readonly metadata: ProviderMetadata; readonly capabilities: ProviderCapabilities;
  generate(request: ExplanationPlanLlmRequestPackage, signal?: AbortSignal): Promise<ProviderStructuredResponse>;
}

export interface GenerationAttempt {
  attempt: number; kind: "initial" | "transport-retry" | "repair";
  startedAt: string; completedAt: string; outcome: "proposal" | "refusal" | "failure";
  errorCode?: GenerationErrorCode; providerResponseId?: string; finishReason?: string;
  usage?: ProviderUsage;
}

export interface GenerationAuditRecord {
  runId: string; requestId: string; requestFingerprint: string;
  questionId: string; contractId: string; contextPackageId: string;
  contractFingerprint: string; contextPackageFingerprint: string;
  providerId: string; adapterId: string; adapterVersion: string; modelId: string;
  promptTemplateId: string; promptTemplateVersion: string; promptHash: string;
  proposalSchemaVersion: string; planSchemaVersion: string; validationPolicyVersion: string;
  startedAt: string; completedAt: string; attempts: GenerationAttempt[];
  providerResponseId?: string; finishReason?: string; refusal?: { code: string; reason: string };
  usage?: ProviderUsage; providerOutputHash?: string; hydratedDraftFingerprint?: string;
  validatedPlanFingerprint?: string; validationOutcome?: ExplanationPlanValidationResult["outcome"];
  repairCount: number; redactionApplied: boolean; warnings: string[];
}

export type StructuredGenerationResult =
  | { success: true; outcome: "validated-plan"; plan: ValidatedExplanationPlan; validation: ExplanationPlanValidationResult; audit: GenerationAuditRecord }
  | { success: true; outcome: "clarification-required" | "unsupported" | "insufficient-context" | "provider-refusal"; audit: GenerationAuditRecord; reasons: string[] }
  | { success: false; error: GenerationError; audit: GenerationAuditRecord };

export interface GenerationAuditRepository {
  save(record: GenerationAuditRecord): void;
  findByRunId(runId: string): GenerationAuditRecord | undefined;
  findByRequestFingerprint(fingerprint: string): GenerationAuditRecord[];
}

export interface GenerationReplayCache {
  find(requestFingerprint: string): ValidatedExplanationPlan | undefined;
  save(requestFingerprint: string, plan: ValidatedExplanationPlan): void;
  invalidate(requestFingerprint: string): void;
}

export interface HydrationContext {
  request: ExplanationPlanLlmRequestPackage; contract: BriefingContract;
  contextPackage: EvidenceContextPackage; now: string;
  generator: { type: "llm"; id: string; version: string };
  planVersion: string; policyVersion: string;
  personalizedImpactPlanningContext?: PersonalizedImpactPlanningContext;
}

export interface ProposalHydrationResult {
  success: boolean; plan?: ExplanationPlanDraft; error?: GenerationError;
}

export type PreflightResult =
  | { proceed: true; request: ExplanationPlanLlmRequestPackage }
  | { proceed: false; result: ExplanationPlanBuildResult };
