import { z } from "zod";
import { BriefingContractSchema } from "../briefing";
import { EvidenceContextPackageSchema } from "../context";
import {
  createImpactAssessmentId,
  createImpactChannelId,
  createImpactConditionId,
  createImpactScenarioId,
  createPersonalizedImpactAnalysisId,
  impactChannelSemanticValue,
  personalizedImpactAnalysisFingerprint,
} from "./impact-fingerprint";
import type {
  ImpactAssessment,
  ImpactChannel,
  ImpactCondition,
  ImpactMappingProposal,
  ImpactScenario,
  ImpactValidationIssue,
  PersonalizedImpactAnalysis,
  PersonalizedImpactAnalysisInput,
  PersonalizedImpactValidationResult,
} from "./impact-models";
import { IMPACT_DIRECTIONS, IMPACT_RELATIONS, IMPACT_SCENARIO_KINDS } from "./impact-models";
import { normalizePersonalizationText } from "./fingerprint";
import { PersonalImpactContextSchema } from "./validation";

const Id = z.string().trim().min(1);
const Fingerprint = z.string().regex(/^[a-f0-9]{64}$/u);
const Text = z.string()
  .transform(normalizePersonalizationText)
  .pipe(z.string().min(1).max(500));
const UniqueIds = z.array(Id).max(30).refine((ids) => new Set(ids).size === ids.length, {
  message: "IDs must be unique.",
});
const NonEmptyUniqueIds = UniqueIds.pipe(z.array(Id).min(1));
const Epistemic = z.enum(["inference", "forecast", "unknown"]);

export const ImpactConditionSchema: z.ZodType<ImpactCondition> = z.strictObject({
  conditionId: Id,
  kind: z.enum(["premise", "trigger", "counter-signal", "limitation"]),
  statement: Text,
});

const ImpactUncertaintySchema = z.strictObject({
  posture: z.enum(["bounded", "material", "indeterminate"]),
  statement: Text,
  unknowns: z.array(Text).max(20),
});

export const ImpactChannelSchema: z.ZodType<ImpactChannel> = z.strictObject({
  channelId: Id,
  mechanism: Text,
  evidenceContextItemIds: NonEmptyUniqueIds,
  exposureIds: NonEmptyUniqueIds,
  relation: z.enum(IMPACT_RELATIONS),
  direction: z.enum(IMPACT_DIRECTIONS),
  conditionIds: UniqueIds,
  uncertainty: ImpactUncertaintySchema,
  epistemicType: Epistemic,
});

export const ImpactAssessmentSchema: z.ZodType<ImpactAssessment> = z.strictObject({
  assessmentId: Id,
  exposureId: Id,
  channelIds: NonEmptyUniqueIds,
  direction: z.enum(IMPACT_DIRECTIONS),
  epistemicType: Epistemic,
  conditionIds: UniqueIds,
  uncertainty: ImpactUncertaintySchema,
  supportingContextItemIds: NonEmptyUniqueIds,
});

const ImpactHorizonSchema = z.strictObject({
  amount: z.number().int().positive().max(100),
  unit: z.enum(["day", "week", "month", "year"]),
});

export const ImpactScenarioSchema: z.ZodType<ImpactScenario> = z.strictObject({
  scenarioId: Id,
  kind: z.enum(IMPACT_SCENARIO_KINDS),
  premiseConditionId: Id,
  horizon: ImpactHorizonSchema,
  triggerConditionIds: NonEmptyUniqueIds,
  counterSignalConditionIds: NonEmptyUniqueIds,
  affectedExposureIds: NonEmptyUniqueIds,
  channelIds: NonEmptyUniqueIds,
  expectedDirection: z.enum(IMPACT_DIRECTIONS),
  uncertainty: ImpactUncertaintySchema,
});

export const ImpactMappingProposalSchema: z.ZodType<ImpactMappingProposal> =
  z.strictObject({
    conditions: z.array(ImpactConditionSchema).max(30),
    channels: z.array(ImpactChannelSchema).min(1).max(20),
    assessments: z.array(ImpactAssessmentSchema).min(1).max(20),
    scenarios: z.array(ImpactScenarioSchema).max(8),
    unknowns: z.array(Text).max(20),
    limitations: z.array(Text).max(20),
  });

export const PersonalizedImpactAnalysisInputSchema:
z.ZodType<PersonalizedImpactAnalysisInput> = z.strictObject({
  personalContext: PersonalImpactContextSchema,
  contract: BriefingContractSchema,
  evidenceContextPackage: EvidenceContextPackageSchema,
});

export const PersonalizedImpactAnalysisSchema:
z.ZodType<PersonalizedImpactAnalysis> = z.strictObject({
  analysisId: Id,
  questionId: Id,
  contractId: Id,
  evidenceContextPackageId: Id,
  contractFingerprint: Fingerprint,
  personalContextFingerprint: Fingerprint,
  evidenceContextFingerprint: Fingerprint,
  conditions: z.array(ImpactConditionSchema).max(30),
  channels: z.array(ImpactChannelSchema).min(1).max(20),
  assessments: z.array(ImpactAssessmentSchema).min(1).max(20),
  scenarios: z.array(ImpactScenarioSchema).max(8),
  unknowns: z.array(Text).max(20),
  limitations: z.array(Text).max(20),
  policyVersion: Id,
  semanticFingerprint: Fingerprint,
});

export class PersonalizedImpactValidator {
  validate(
    inputValue: unknown,
    analysisValue: unknown,
  ): PersonalizedImpactValidationResult {
    const inputResult = PersonalizedImpactAnalysisInputSchema.safeParse(inputValue);
    if (!inputResult.success) {
      return invalid(inputResult.error.issues.map((issue) => ({
        code: "INPUT_INVALID",
        path: issue.path.join("."),
        message: issue.message,
      })));
    }
    const analysisResult = PersonalizedImpactAnalysisSchema.safeParse(analysisValue);
    if (!analysisResult.success) {
      return invalid(analysisResult.error.issues.map((issue) => ({
        code: "ANALYSIS_SCHEMA_INVALID",
        path: issue.path.join("."),
        message: issue.message,
      })));
    }

    const input = inputResult.data;
    const analysis = analysisResult.data;
    const issues: ImpactValidationIssue[] = [];
    const add = (
      code: ImpactValidationIssue["code"],
      path: string,
      message: string,
    ) => issues.push({ code, path, message });

    this.validateLineage(input, analysis, add);
    this.validateReferences(input, analysis, add);
    this.validateSemanticIdentity(analysis, add);

    return issues.length === 0
      ? { outcome: "valid", analysis, issues: [] }
      : invalid(issues);
  }

  private validateLineage(
    input: PersonalizedImpactAnalysisInput,
    analysis: PersonalizedImpactAnalysis,
    add: AddIssue,
  ): void {
    if (input.contract.status !== "ready") {
      add("CONTRACT_NOT_READY", "contract.status", "Impact analysis requires a ready Contract.");
    }
    if (!input.personalContext.consent.enabled || !input.contract.personalizationPolicy.enabled) {
      add(
        "PERSONALIZATION_POLICY_DISABLED",
        "personalContext.consent.enabled",
        "Impact analysis requires enabled consent and Contract policy.",
      );
    }
    if (input.contract.questionId !== input.evidenceContextPackage.questionId) {
      add(
        "QUESTION_REFERENCE_MISMATCH",
        "evidenceContextPackage.questionId",
        "Evidence context does not belong to the Contract question.",
      );
    }
    if (input.evidenceContextPackage.contractId !== input.contract.id) {
      add(
        "CONTRACT_REFERENCE_MISMATCH",
        "evidenceContextPackage.contractId",
        "Evidence context does not belong to the Contract.",
      );
    }
    if (
      analysis.questionId !== input.contract.questionId ||
      analysis.contractId !== input.contract.id ||
      analysis.evidenceContextPackageId !== input.evidenceContextPackage.id
    ) {
      add("CONTRACT_REFERENCE_MISMATCH", "analysis", "Analysis identity lineage is inconsistent.");
    }
    if (analysis.contractFingerprint !== input.contract.semanticFingerprint) {
      add(
        "CONTRACT_FINGERPRINT_MISMATCH",
        "contractFingerprint",
        "Analysis Contract fingerprint is stale or unknown.",
      );
    }
    if (analysis.personalContextFingerprint !== input.personalContext.semanticFingerprint) {
      add(
        "PERSONAL_CONTEXT_FINGERPRINT_MISMATCH",
        "personalContextFingerprint",
        "Analysis personal-context fingerprint is stale or unknown.",
      );
    }
    if (analysis.evidenceContextFingerprint !== input.evidenceContextPackage.fingerprint) {
      add(
        "EVIDENCE_CONTEXT_FINGERPRINT_MISMATCH",
        "evidenceContextFingerprint",
        "Analysis evidence-context fingerprint is stale or unknown.",
      );
    }
  }

  private validateReferences(
    input: PersonalizedImpactAnalysisInput,
    analysis: PersonalizedImpactAnalysis,
    add: AddIssue,
  ): void {
    const evidenceIds = new Set(
      input.evidenceContextPackage.selectedItems.map(({ id }) => id),
    );
    const exposureIds = new Set(input.personalContext.exposures.map(({ exposureId }) => exposureId));
    const conditionById = new Map(analysis.conditions.map((condition) => [condition.conditionId, condition]));
    const channelIds = new Set(analysis.channels.map(({ channelId }) => channelId));

    for (const [index, channel] of analysis.channels.entries()) {
      for (const evidenceId of channel.evidenceContextItemIds) {
        if (!evidenceIds.has(evidenceId)) {
          add("UNKNOWN_EVIDENCE_REFERENCE", `channels.${index}.evidenceContextItemIds`, `Unknown evidence reference: ${evidenceId}`);
        }
      }
      for (const exposureId of channel.exposureIds) {
        if (!exposureIds.has(exposureId)) {
          add("UNKNOWN_EXPOSURE_REFERENCE", `channels.${index}.exposureIds`, `Unknown exposure reference: ${exposureId}`);
        }
      }
      this.requireConditions(channel.conditionIds, conditionById, `channels.${index}.conditionIds`, add);
      if (channel.relation === "conditional" && channel.conditionIds.length === 0) {
        add("CONDITIONAL_REQUIREMENT_MISSING", `channels.${index}.conditionIds`, "Conditional impact requires a condition.");
      }
      if (
        channel.relation === "unknown" &&
        (channel.epistemicType !== "unknown" || channel.direction !== "uncertain")
      ) {
        add("UNKNOWN_POSTURE_INVALID", `channels.${index}`, "Unknown impact requires unknown posture and uncertain direction.");
      }
      if (channel.epistemicType === "forecast" && channel.conditionIds.length === 0) {
        add("CONDITIONAL_REQUIREMENT_MISSING", `channels.${index}`, "Forecast impact requires an explicit condition.");
      }
    }

    for (const [index, assessment] of analysis.assessments.entries()) {
      if (!exposureIds.has(assessment.exposureId)) {
        add("UNKNOWN_EXPOSURE_REFERENCE", `assessments.${index}.exposureId`, "Assessment references an unknown exposure.");
      }
      for (const channelId of assessment.channelIds) {
        if (!channelIds.has(channelId)) {
          add("UNKNOWN_CHANNEL_REFERENCE", `assessments.${index}.channelIds`, `Unknown channel reference: ${channelId}`);
        }
      }
      for (const evidenceId of assessment.supportingContextItemIds) {
        if (!evidenceIds.has(evidenceId)) {
          add("UNKNOWN_EVIDENCE_REFERENCE", `assessments.${index}.supportingContextItemIds`, `Unknown evidence reference: ${evidenceId}`);
        }
      }
      this.requireConditions(assessment.conditionIds, conditionById, `assessments.${index}.conditionIds`, add);
    }

    for (const [index, scenario] of analysis.scenarios.entries()) {
      const premise = conditionById.get(scenario.premiseConditionId);
      if (premise?.kind !== "premise") {
        add("SCENARIO_REFERENCE_INVALID", `scenarios.${index}.premiseConditionId`, "Scenario premise must reference a premise condition.");
      }
      this.requireConditionKind(scenario.triggerConditionIds, "trigger", conditionById, `scenarios.${index}.triggerConditionIds`, add);
      this.requireConditionKind(scenario.counterSignalConditionIds, "counter-signal", conditionById, `scenarios.${index}.counterSignalConditionIds`, add);
      for (const exposureId of scenario.affectedExposureIds) {
        if (!exposureIds.has(exposureId)) {
          add("UNKNOWN_EXPOSURE_REFERENCE", `scenarios.${index}.affectedExposureIds`, `Unknown exposure reference: ${exposureId}`);
        }
      }
      for (const channelId of scenario.channelIds) {
        if (!channelIds.has(channelId)) {
          add("UNKNOWN_CHANNEL_REFERENCE", `scenarios.${index}.channelIds`, `Unknown channel reference: ${channelId}`);
        }
      }
    }
  }

  private validateSemanticIdentity(
    analysis: PersonalizedImpactAnalysis,
    add: AddIssue,
  ): void {
    const semanticChannelValues = new Set<string>();
    const allIds = new Set<string>();
    const register = (id: string, path: string) => {
      if (allIds.has(id)) {
        add("DUPLICATE_SEMANTIC_IDENTITY", path, `Duplicate semantic ID: ${id}`);
      }
      allIds.add(id);
    };

    for (const [index, condition] of analysis.conditions.entries()) {
      register(condition.conditionId, `conditions.${index}.conditionId`);
      if (condition.conditionId !== createImpactConditionId(condition)) {
        add("SEMANTIC_IDENTITY_INVALID", `conditions.${index}.conditionId`, "Condition ID does not match its semantics.");
      }
    }
    for (const [index, channel] of analysis.channels.entries()) {
      register(channel.channelId, `channels.${index}.channelId`);
      const semanticValue = JSON.stringify(impactChannelSemanticValue(channel));
      if (semanticChannelValues.has(semanticValue)) {
        add("DUPLICATE_SEMANTIC_IDENTITY", `channels.${index}`, "Duplicate semantic impact channel.");
      }
      semanticChannelValues.add(semanticValue);
      if (channel.channelId !== createImpactChannelId(channel)) {
        add("SEMANTIC_IDENTITY_INVALID", `channels.${index}.channelId`, "Channel ID does not match its semantics.");
      }
    }
    for (const [index, assessment] of analysis.assessments.entries()) {
      register(assessment.assessmentId, `assessments.${index}.assessmentId`);
      if (assessment.assessmentId !== createImpactAssessmentId(assessment)) {
        add("SEMANTIC_IDENTITY_INVALID", `assessments.${index}.assessmentId`, "Assessment ID does not match its semantics.");
      }
    }
    for (const [index, scenario] of analysis.scenarios.entries()) {
      register(scenario.scenarioId, `scenarios.${index}.scenarioId`);
      if (scenario.scenarioId !== createImpactScenarioId(scenario)) {
        add("SEMANTIC_IDENTITY_INVALID", `scenarios.${index}.scenarioId`, "Scenario ID does not match its semantics.");
      }
    }
    if (analysis.analysisId !== createPersonalizedImpactAnalysisId(analysis)) {
      add("SEMANTIC_IDENTITY_INVALID", "analysisId", "Analysis ID does not match its semantics.");
    }
    if (analysis.semanticFingerprint !== personalizedImpactAnalysisFingerprint(analysis)) {
      add("ANALYSIS_FINGERPRINT_INVALID", "semanticFingerprint", "Analysis fingerprint is invalid.");
    }
  }

  private requireConditions(
    ids: string[],
    conditions: Map<string, ImpactCondition>,
    path: string,
    add: AddIssue,
  ): void {
    for (const id of ids) {
      if (!conditions.has(id)) {
        add("UNKNOWN_CONDITION_REFERENCE", path, `Unknown condition reference: ${id}`);
      }
    }
  }

  private requireConditionKind(
    ids: string[],
    kind: ImpactCondition["kind"],
    conditions: Map<string, ImpactCondition>,
    path: string,
    add: AddIssue,
  ): void {
    for (const id of ids) {
      if (conditions.get(id)?.kind !== kind) {
        add("SCENARIO_REFERENCE_INVALID", path, `Condition ${id} must have kind ${kind}.`);
      }
    }
  }
}

type AddIssue = (
  code: ImpactValidationIssue["code"],
  path: string,
  message: string,
) => void;

function invalid(issues: ImpactValidationIssue[]): PersonalizedImpactValidationResult {
  return { outcome: "invalid", issues };
}
