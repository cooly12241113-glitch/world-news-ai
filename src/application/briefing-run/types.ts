import type { BriefingContract, BriefingQuestion } from "../../briefing";
import type {
  ContextBuildRequest,
  EvidenceContextPackage,
} from "../../context";
import type { ValidatedExplanationPlan } from "../../explanation";
import type {
  ExplanationPlanGenerationInput,
  StructuredGenerationResult,
} from "../../generation";
import type {
  BriefingPresentationPreference,
  BriefingScriptBuildResult,
  ValidatedBriefingScript,
} from "../../script";
import type { BriefingSession } from "../../session";
import type { PersonalImpactContext } from "../../personalization";
import type { PersonalizedImpactPlanningContext } from "../../personalization";
import type {
  PersonalizedImpactCoordinatorInput,
  PersonalizedImpactCoordinatorResult,
} from "../personalized-impact";

export interface CreateBriefingRequest {
  question: BriefingQuestion;
  presentationPreference: BriefingPresentationPreference;
  personalImpactContext?: PersonalImpactContext;
}

export interface RuntimeIdGenerator {
  nextRunId(): string;
}

export interface RuntimeClock {
  now(): string;
}

export interface BriefingRunCancellation {
  isCancellationRequested(): boolean;
}

export interface BriefingRunExecutionContext {
  cancellation?: BriefingRunCancellation;
}

export const BRIEFING_RUN_STAGES = [
  "received",
  "contract-building",
  "context-building",
  "impact-analyzing",
  "plan-generating",
  "script-compiling",
  "session-creating",
  "completed",
] as const;

export type BriefingRunStage = (typeof BRIEFING_RUN_STAGES)[number];

export interface BriefingRunSemanticLineage {
  contractFingerprint: string;
  contextFingerprint: string;
  explanationPlanFingerprint: string;
  scriptFingerprint: string;
  sessionFingerprint: string;
  personalContextFingerprint?: string;
  personalizedImpactAnalysisFingerprint?: string;
}

export type BriefingRunFailureCategory =
  | "request-invalid"
  | "contract-invalid"
  | "context-failed"
  | "personalization-failed"
  | "generation-failed"
  | "script-failed"
  | "session-invalid"
  | "lineage-mismatch"
  | "unexpected";

export type BriefingRunReceiptFailureCategory =
  | "invalid-request"
  | "contract-invalid"
  | "context-unavailable"
  | "personalization-unavailable"
  | "generation-unavailable"
  | "invalid-proposal"
  | "script-invalid"
  | "session-invalid"
  | "invariant-violation"
  | "unexpected";

interface NonTechnicalOutcome {
  finalStage: BriefingRunStage;
  technical: false;
  reason?: string;
}

export type BriefingRunOutcome =
  | ({
      kind: "completed";
      finalStage: "completed";
      technical: false;
      script: ValidatedBriefingScript;
      session: BriefingSession;
      lineage: BriefingRunSemanticLineage;
    })
  | (NonTechnicalOutcome & { kind: "clarification-required" })
  | (NonTechnicalOutcome & { kind: "insufficient-evidence" })
  | (NonTechnicalOutcome & { kind: "generation-unavailable" })
  | (NonTechnicalOutcome & { kind: "personalization-context-required" })
  | (NonTechnicalOutcome & { kind: "personalized-impact-unavailable" })
  | (NonTechnicalOutcome & { kind: "policy-rejected" })
  | (NonTechnicalOutcome & { kind: "cancelled" })
  | {
      kind: "failed";
      finalStage: BriefingRunStage;
      technical: true;
      category: BriefingRunFailureCategory;
      reason?: string;
    };

export interface BriefingRunReceipt {
  runId: string;
  startedAt: string;
  completedAt: string;
  finalStage: BriefingRunStage;
  outcomeKind: BriefingRunOutcome["kind"];
  contractFingerprint?: string;
  contextFingerprint?: string;
  explanationPlanFingerprint?: string;
  scriptFingerprint?: string;
  sessionFingerprint?: string;
  personalizationRequested?: true;
  personalizationUsed?: true;
  exposureCount?: number;
  personalContextFingerprint?: string;
  personalizedImpactAnalysisFingerprint?: string;
  evidenceCount?: number;
  sceneCount?: number;
  failureCategory?: BriefingRunReceiptFailureCategory;
}

export interface BriefingRunResult {
  runId: string;
  outcome: BriefingRunOutcome;
  receipt: BriefingRunReceipt;
}

export interface BriefingSessionInitializationInput {
  question: BriefingQuestion;
  contract: BriefingContract;
  contextPackage: EvidenceContextPackage;
  plan: ValidatedExplanationPlan;
  script: ValidatedBriefingScript;
}

export interface BriefingRunServiceDependencies {
  runtimeIdGenerator: RuntimeIdGenerator;
  runtimeClock: RuntimeClock;
  contractCompiler: {
    compile(input: unknown): import("../../briefing").CompileBriefingResult;
  };
  contextBuilder: {
    build(input: unknown): import("../../context").ContextBuildResult;
  };
  generationCoordinator: {
    generate(input: ExplanationPlanGenerationInput): Promise<StructuredGenerationResult>;
  };
  personalizedImpactCoordinator?: {
    coordinate(input: PersonalizedImpactCoordinatorInput):
      Promise<PersonalizedImpactCoordinatorResult>;
  };
  scriptCompiler: {
    compile(input: import("../../script").BriefingScriptCompileInput): BriefingScriptBuildResult;
  };
  createContextRequest(
    request: CreateBriefingRequest,
    contract: BriefingContract,
  ): ContextBuildRequest;
  createGenerationInput(
    request: CreateBriefingRequest,
    contract: BriefingContract,
    contextPackage: EvidenceContextPackage,
    personalizedImpactPlanningContext?: PersonalizedImpactPlanningContext,
  ): ExplanationPlanGenerationInput;
  initializeSession(input: BriefingSessionInitializationInput): BriefingSession;
}
