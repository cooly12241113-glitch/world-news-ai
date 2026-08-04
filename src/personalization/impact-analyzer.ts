import {
  createPersonalizedImpactAnalysisId,
  personalizedImpactAnalysisFingerprint,
} from "./impact-fingerprint";
import type {
  ImpactMappingPolicy,
  ImpactValidationIssue,
  PersonalizedImpactAnalysis,
  PersonalizedImpactAnalysisResult,
} from "./impact-models";
import {
  ImpactMappingProposalSchema,
  PersonalizedImpactAnalysisInputSchema,
  PersonalizedImpactValidator,
} from "./impact-validation";

export class PersonalizedImpactAnalyzer {
  private readonly validator = new PersonalizedImpactValidator();

  constructor(private readonly mappingPolicy: ImpactMappingPolicy) {}

  analyze(inputValue: unknown): PersonalizedImpactAnalysisResult {
    const inputResult = PersonalizedImpactAnalysisInputSchema.safeParse(inputValue);
    if (!inputResult.success) {
      return rejected(inputResult.error.issues.map((issue) => ({
        code: "INPUT_INVALID",
        path: issue.path.join("."),
        message: issue.message,
      })));
    }
    const input = inputResult.data;

    if (!input.personalContext.consent.enabled) {
      return {
        success: true,
        outcome: "insufficient-context",
        reason: "personalization-disabled",
      };
    }
    if (input.personalContext.exposures.length === 0) {
      return {
        success: true,
        outcome: "insufficient-context",
        reason: "no-exposures",
      };
    }
    if (
      input.evidenceContextPackage.status === "insufficient-evidence" ||
      input.evidenceContextPackage.status === "no-relevant-context"
    ) {
      return {
        success: true,
        outcome: "insufficient-evidence",
        reason: "evidence-context-not-ready",
      };
    }
    if (input.contract.status !== "ready" || !input.contract.personalizationPolicy.enabled) {
      return rejected([{
        code: input.contract.status !== "ready"
          ? "CONTRACT_NOT_READY"
          : "PERSONALIZATION_POLICY_DISABLED",
        path: "contract",
        message: "Personalized impact analysis requires a ready, enabled Contract policy.",
      }]);
    }

    let proposalValue: unknown;
    try {
      proposalValue = this.mappingPolicy.map(input);
    } catch {
      return rejected([{
        code: "ANALYSIS_SCHEMA_INVALID",
        path: "mappingPolicy",
        message: "Impact mapping policy failed.",
      }]);
    }
    if (proposalValue === undefined) {
      return {
        success: true,
        outcome: "unsupported-impact-path",
        reason: "no-supported-mapping",
      };
    }
    const proposalResult = ImpactMappingProposalSchema.safeParse(proposalValue);
    if (!proposalResult.success) {
      return rejected(proposalResult.error.issues.map((issue) => ({
        code: "ANALYSIS_SCHEMA_INVALID",
        path: issue.path.join("."),
        message: issue.message,
      })));
    }

    const proposal = proposalResult.data;
    const base = {
      questionId: input.contract.questionId,
      contractId: input.contract.id,
      evidenceContextPackageId: input.evidenceContextPackage.id,
      contractFingerprint: input.contract.semanticFingerprint,
      personalContextFingerprint: input.personalContext.semanticFingerprint,
      evidenceContextFingerprint: input.evidenceContextPackage.fingerprint,
      conditions: [...proposal.conditions].sort(byConditionId),
      channels: [...proposal.channels].sort(byChannelId),
      assessments: [...proposal.assessments].sort(byAssessmentId),
      scenarios: [...proposal.scenarios].sort(byScenarioId),
      unknowns: [...new Set(proposal.unknowns)].sort(),
      limitations: [...new Set(proposal.limitations)].sort(),
      policyVersion: this.mappingPolicy.policyVersion,
    };
    const analysis: PersonalizedImpactAnalysis = {
      ...base,
      analysisId: createPersonalizedImpactAnalysisId(base),
      semanticFingerprint: personalizedImpactAnalysisFingerprint(base),
    };
    const validation = this.validator.validate(input, analysis);
    return validation.outcome === "valid"
      ? { success: true, outcome: "completed", analysis: validation.analysis }
      : rejected(validation.issues);
  }
}

function rejected(issues: ImpactValidationIssue[]): PersonalizedImpactAnalysisResult {
  return { success: false, outcome: "policy-rejected", issues };
}

function byConditionId(left: { conditionId: string }, right: { conditionId: string }): number {
  return left.conditionId.localeCompare(right.conditionId);
}

function byChannelId(left: { channelId: string }, right: { channelId: string }): number {
  return left.channelId.localeCompare(right.channelId);
}

function byAssessmentId(left: { assessmentId: string }, right: { assessmentId: string }): number {
  return left.assessmentId.localeCompare(right.assessmentId);
}

function byScenarioId(left: { scenarioId: string }, right: { scenarioId: string }): number {
  return left.scenarioId.localeCompare(right.scenarioId);
}
