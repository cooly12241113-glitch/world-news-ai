import type { BriefingContract } from "../briefing";
import type { EvidenceContextPackage } from "../context";
import type { EpistemicType } from "../explanation";
import type { PersonalImpactContext } from "./models";

export const IMPACT_RELATIONS = [
  "direct",
  "indirect",
  "conditional",
  "countervailing",
  "unknown",
] as const;

export type ImpactRelation = (typeof IMPACT_RELATIONS)[number];

export const IMPACT_DIRECTIONS = [
  "increases",
  "decreases",
  "mixed",
  "unchanged",
  "uncertain",
] as const;

export type ImpactDirection = (typeof IMPACT_DIRECTIONS)[number];

export interface ImpactCondition {
  conditionId: string;
  kind: "premise" | "trigger" | "counter-signal" | "limitation";
  statement: string;
}

export interface ImpactUncertainty {
  posture: "bounded" | "material" | "indeterminate";
  statement: string;
  unknowns: string[];
}

export interface ImpactChannel {
  channelId: string;
  mechanism: string;
  evidenceContextItemIds: string[];
  exposureIds: string[];
  relation: ImpactRelation;
  direction: ImpactDirection;
  conditionIds: string[];
  uncertainty: ImpactUncertainty;
  epistemicType: Extract<EpistemicType, "inference" | "forecast" | "unknown">;
}

export interface ImpactAssessment {
  assessmentId: string;
  exposureId: string;
  channelIds: string[];
  direction: ImpactDirection;
  epistemicType: Extract<EpistemicType, "inference" | "forecast" | "unknown">;
  conditionIds: string[];
  uncertainty: ImpactUncertainty;
  supportingContextItemIds: string[];
}

export interface ImpactHorizon {
  amount: number;
  unit: "day" | "week" | "month" | "year";
}

export const IMPACT_SCENARIO_KINDS = [
  "baseline",
  "intensification",
  "easing",
  "counter-scenario",
] as const;

export type ImpactScenarioKind = (typeof IMPACT_SCENARIO_KINDS)[number];

export interface ImpactScenario {
  scenarioId: string;
  kind: ImpactScenarioKind;
  premiseConditionId: string;
  horizon: ImpactHorizon;
  triggerConditionIds: string[];
  counterSignalConditionIds: string[];
  affectedExposureIds: string[];
  channelIds: string[];
  expectedDirection: ImpactDirection;
  uncertainty: ImpactUncertainty;
}

export interface PersonalizedImpactAnalysis {
  analysisId: string;
  questionId: string;
  contractId: string;
  evidenceContextPackageId: string;
  contractFingerprint: string;
  personalContextFingerprint: string;
  evidenceContextFingerprint: string;
  conditions: ImpactCondition[];
  channels: ImpactChannel[];
  assessments: ImpactAssessment[];
  scenarios: ImpactScenario[];
  unknowns: string[];
  limitations: string[];
  policyVersion: string;
  semanticFingerprint: string;
}

export interface ImpactMappingProposal {
  conditions: ImpactCondition[];
  channels: ImpactChannel[];
  assessments: ImpactAssessment[];
  scenarios: ImpactScenario[];
  unknowns: string[];
  limitations: string[];
}

export interface PersonalizedImpactAnalysisInput {
  personalContext: PersonalImpactContext;
  contract: BriefingContract;
  evidenceContextPackage: EvidenceContextPackage;
}

export interface ImpactMappingPolicy {
  readonly id: string;
  readonly version: string;
  readonly policyVersion: string;
  readonly deterministic: true;
  map(input: PersonalizedImpactAnalysisInput): ImpactMappingProposal | undefined;
}

export type PersonalizedImpactAnalysisResult =
  | {
      success: true;
      outcome: "completed";
      analysis: PersonalizedImpactAnalysis;
    }
  | {
      success: true;
      outcome: "insufficient-context";
      reason: "personalization-disabled" | "no-exposures";
    }
  | {
      success: true;
      outcome: "insufficient-evidence";
      reason: "evidence-context-not-ready";
    }
  | {
      success: true;
      outcome: "unsupported-impact-path";
      reason: "no-supported-mapping";
    }
  | {
      success: false;
      outcome: "policy-rejected";
      issues: ImpactValidationIssue[];
    };

export type ImpactValidationIssueCode =
  | "INPUT_INVALID"
  | "CONTRACT_NOT_READY"
  | "PERSONALIZATION_POLICY_DISABLED"
  | "QUESTION_REFERENCE_MISMATCH"
  | "CONTRACT_REFERENCE_MISMATCH"
  | "CONTRACT_FINGERPRINT_MISMATCH"
  | "PERSONAL_CONTEXT_FINGERPRINT_MISMATCH"
  | "EVIDENCE_CONTEXT_FINGERPRINT_MISMATCH"
  | "UNKNOWN_EVIDENCE_REFERENCE"
  | "UNKNOWN_EXPOSURE_REFERENCE"
  | "UNKNOWN_CONDITION_REFERENCE"
  | "UNKNOWN_CHANNEL_REFERENCE"
  | "DUPLICATE_SEMANTIC_IDENTITY"
  | "CONDITIONAL_REQUIREMENT_MISSING"
  | "UNKNOWN_POSTURE_INVALID"
  | "SCENARIO_REFERENCE_INVALID"
  | "SEMANTIC_IDENTITY_INVALID"
  | "ANALYSIS_FINGERPRINT_INVALID"
  | "ANALYSIS_SCHEMA_INVALID";

export interface ImpactValidationIssue {
  code: ImpactValidationIssueCode;
  path: string;
  message: string;
}

export type PersonalizedImpactValidationResult =
  | {
      outcome: "valid";
      analysis: PersonalizedImpactAnalysis;
      issues: [];
    }
  | {
      outcome: "invalid";
      issues: ImpactValidationIssue[];
    };
