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

export interface CreateBriefingRequest {
  question: BriefingQuestion;
  presentationPreference: BriefingPresentationPreference;
}

export const BRIEFING_RUN_STAGES = [
  "received",
  "contract-building",
  "context-building",
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
}

export type BriefingRunFailureCategory =
  | "request-invalid"
  | "contract-invalid"
  | "context-failed"
  | "generation-failed"
  | "script-failed"
  | "session-invalid"
  | "lineage-mismatch"
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
  | (NonTechnicalOutcome & { kind: "policy-rejected" })
  | (NonTechnicalOutcome & { kind: "cancelled" })
  | {
      kind: "failed";
      finalStage: BriefingRunStage;
      technical: true;
      category: BriefingRunFailureCategory;
      reason?: string;
    };

export interface BriefingSessionInitializationInput {
  question: BriefingQuestion;
  contract: BriefingContract;
  contextPackage: EvidenceContextPackage;
  plan: ValidatedExplanationPlan;
  script: ValidatedBriefingScript;
}

export interface BriefingRunServiceDependencies {
  contractCompiler: {
    compile(input: unknown): import("../../briefing").CompileBriefingResult;
  };
  contextBuilder: {
    build(input: unknown): import("../../context").ContextBuildResult;
  };
  generationCoordinator: {
    generate(input: ExplanationPlanGenerationInput): Promise<StructuredGenerationResult>;
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
  ): ExplanationPlanGenerationInput;
  initializeSession(input: BriefingSessionInitializationInput): BriefingSession;
}

