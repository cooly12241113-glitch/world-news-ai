import { createSemanticFingerprint } from "../briefing/fingerprint";
import type {
  ImpactAssessment,
  ImpactChannel,
  ImpactCondition,
  ImpactScenario,
  PersonalizedImpactAnalysis,
} from "./impact-models";
import { normalizePersonalizationText } from "./fingerprint";

type WithoutId<T, Key extends keyof T> = Omit<T, Key>;

function sorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export function impactConditionSemanticValue(
  condition: WithoutId<ImpactCondition, "conditionId"> | ImpactCondition,
) {
  return {
    kind: condition.kind,
    statement: normalizePersonalizationText(condition.statement),
  };
}

export function createImpactConditionId(
  condition: WithoutId<ImpactCondition, "conditionId">,
): string {
  return `impact-condition:${createSemanticFingerprint(impactConditionSemanticValue(condition))}`;
}

function uncertaintySemanticValue(value: ImpactChannel["uncertainty"]) {
  return {
    posture: value.posture,
    statement: normalizePersonalizationText(value.statement),
    unknowns: sorted(value.unknowns.map(normalizePersonalizationText)),
  };
}

export function impactChannelSemanticValue(
  channel: WithoutId<ImpactChannel, "channelId"> | ImpactChannel,
) {
  return {
    mechanism: normalizePersonalizationText(channel.mechanism),
    evidenceContextItemIds: sorted(channel.evidenceContextItemIds),
    exposureIds: sorted(channel.exposureIds),
    relation: channel.relation,
    direction: channel.direction,
    conditionIds: sorted(channel.conditionIds),
    uncertainty: uncertaintySemanticValue(channel.uncertainty),
    epistemicType: channel.epistemicType,
  };
}

export function createImpactChannelId(
  channel: WithoutId<ImpactChannel, "channelId">,
): string {
  return `impact-channel:${createSemanticFingerprint(impactChannelSemanticValue(channel))}`;
}

export function impactAssessmentSemanticValue(
  assessment: WithoutId<ImpactAssessment, "assessmentId"> | ImpactAssessment,
) {
  return {
    exposureId: assessment.exposureId,
    channelIds: sorted(assessment.channelIds),
    direction: assessment.direction,
    epistemicType: assessment.epistemicType,
    conditionIds: sorted(assessment.conditionIds),
    uncertainty: uncertaintySemanticValue(assessment.uncertainty),
    supportingContextItemIds: sorted(assessment.supportingContextItemIds),
  };
}

export function createImpactAssessmentId(
  assessment: WithoutId<ImpactAssessment, "assessmentId">,
): string {
  return `impact-assessment:${createSemanticFingerprint(impactAssessmentSemanticValue(assessment))}`;
}

export function impactScenarioSemanticValue(
  scenario: WithoutId<ImpactScenario, "scenarioId"> | ImpactScenario,
) {
  return {
    kind: scenario.kind,
    premiseConditionId: scenario.premiseConditionId,
    horizon: scenario.horizon,
    triggerConditionIds: sorted(scenario.triggerConditionIds),
    counterSignalConditionIds: sorted(scenario.counterSignalConditionIds),
    affectedExposureIds: sorted(scenario.affectedExposureIds),
    channelIds: sorted(scenario.channelIds),
    expectedDirection: scenario.expectedDirection,
    uncertainty: uncertaintySemanticValue(scenario.uncertainty),
  };
}

export function createImpactScenarioId(
  scenario: WithoutId<ImpactScenario, "scenarioId">,
): string {
  return `impact-scenario:${createSemanticFingerprint(impactScenarioSemanticValue(scenario))}`;
}

export type ImpactAnalysisFingerprintInput = Omit<
  PersonalizedImpactAnalysis,
  "analysisId" | "semanticFingerprint"
>;

export function personalizedImpactAnalysisFingerprint(
  analysis: ImpactAnalysisFingerprintInput | PersonalizedImpactAnalysis,
): string {
  return createSemanticFingerprint({
    questionId: analysis.questionId,
    contractId: analysis.contractId,
    evidenceContextPackageId: analysis.evidenceContextPackageId,
    contractFingerprint: analysis.contractFingerprint,
    personalContextFingerprint: analysis.personalContextFingerprint,
    evidenceContextFingerprint: analysis.evidenceContextFingerprint,
    conditions: analysis.conditions
      .map(impactConditionSemanticValue)
      .sort(byCanonicalValue),
    channels: analysis.channels.map(impactChannelSemanticValue).sort(byCanonicalValue),
    assessments: analysis.assessments
      .map(impactAssessmentSemanticValue)
      .sort(byCanonicalValue),
    scenarios: analysis.scenarios.map(impactScenarioSemanticValue).sort(byCanonicalValue),
    unknowns: sorted(analysis.unknowns.map(normalizePersonalizationText)),
    limitations: sorted(analysis.limitations.map(normalizePersonalizationText)),
    policyVersion: analysis.policyVersion,
  });
}

export function createPersonalizedImpactAnalysisId(
  analysis: ImpactAnalysisFingerprintInput,
): string {
  return `personalized-impact-analysis:${personalizedImpactAnalysisFingerprint(analysis)}`;
}

function byCanonicalValue(left: unknown, right: unknown): number {
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}
