import type { BriefingContract } from "../../briefing";
import type { EvidenceContextPackage } from "../../context";
import {
  createPersonalizedImpactPlanningContext,
  type PersonalImpactContext,
  type PersonalizedImpactAnalysis,
  type PersonalizedImpactAnalysisInput,
  type PersonalizedImpactAnalysisResult,
  type PersonalizedImpactPlanningContext,
} from "../../personalization";

export interface PersonalizedImpactCoordinatorInput {
  personalContext?: PersonalImpactContext;
  contract: BriefingContract;
  evidenceContextPackage: EvidenceContextPackage;
}

export type PersonalizedImpactCoordinatorResult =
  | { outcome: "skipped"; reason: "not-requested" }
  | { outcome: "context-required"; reason: "personal-context-missing" }
  | {
      outcome: "unavailable";
      reason: "personalization-disabled" | "enabled-no-exposures" |
        "insufficient-evidence" | "unsupported-impact-path";
    }
  | { outcome: "policy-rejected"; reason: "impact-policy-rejected" }
  | {
      outcome: "completed";
      analysis: PersonalizedImpactAnalysis;
      planningContext: PersonalizedImpactPlanningContext;
    };

export interface PersonalizedImpactAnalyzerPort {
  analyze(
    input: PersonalizedImpactAnalysisInput,
  ): PersonalizedImpactAnalysisResult | Promise<PersonalizedImpactAnalysisResult>;
}

export class PersonalizedImpactCoordinator {
  constructor(private readonly analyzer: PersonalizedImpactAnalyzerPort) {}

  async coordinate(
    input: PersonalizedImpactCoordinatorInput,
  ): Promise<PersonalizedImpactCoordinatorResult> {
    if (input.contract.intentAnalysis.primaryIntent !== "personalized-impact") {
      return { outcome: "skipped", reason: "not-requested" };
    }
    const personalContext = input.personalContext;
    if (!personalContext) {
      return { outcome: "context-required", reason: "personal-context-missing" };
    }
    if (!personalContext.consent.enabled) {
      return { outcome: "unavailable", reason: "personalization-disabled" };
    }
    if (personalContext.exposures.length === 0) {
      return { outcome: "unavailable", reason: "enabled-no-exposures" };
    }
    const result = await this.analyzer.analyze({
      personalContext,
      contract: input.contract,
      evidenceContextPackage: input.evidenceContextPackage,
    });
    if (!result.success) {
      return { outcome: "policy-rejected", reason: "impact-policy-rejected" };
    }
    if (result.outcome === "insufficient-context") {
      return {
        outcome: "unavailable",
        reason: result.reason === "personalization-disabled"
          ? "personalization-disabled"
          : "enabled-no-exposures",
      };
    }
    if (result.outcome === "insufficient-evidence") {
      return { outcome: "unavailable", reason: "insufficient-evidence" };
    }
    if (result.outcome === "unsupported-impact-path") {
      return { outcome: "unavailable", reason: "unsupported-impact-path" };
    }
    return {
      outcome: "completed",
      analysis: result.analysis,
      planningContext: createPersonalizedImpactPlanningContext(personalContext, result.analysis),
    };
  }
}
