import { RuleBasedExplanationPlanAssembler, type ExplanationPlanDraft } from "../../explanation";
import { generationInput as baseInput, now } from "../../explanation/__tests__/fixtures";
import type {
  ExplanationPlanGenerationInput, ExplanationPlanProposal,
  ProposalSection, ProposalVisualIntent,
} from "../models";

export { now };

export function input(text?: string): ExplanationPlanGenerationInput {
  const base = baseInput(text);
  return {
    question: base.question, briefingContract: base.contract,
    evidenceContextPackage: base.contextPackage,
    generationPolicy: {
      id: "generation-standard", version: "generation-v1",
      promptTemplateId: "explanation-plan", promptTemplateVersion: "1.0.0",
      proposalSchemaVersion: "proposal-v1", planSchemaVersion: "explanation-plan-v1",
      allowRepair: true, retryBaseDelayMs: 100,
    },
    providerSelection: { providerId: "deterministic-fake", modelId: "fixture-v1" },
    generationBudget: {
      maximumInputCharacters: 100_000, maximumOutputTokens: 8_000,
      timeoutMs: 5_000, maximumTransportRetries: 2, maximumRepairAttempts: 1,
    },
    requestedAt: now, requestId: "request-1",
  };
}

export function proposal(text?: string): ExplanationPlanProposal {
  const source = baseInput(text);
  const built = new RuleBasedExplanationPlanAssembler({
    now: () => new Date(now), createId: () => "rule-plan",
  }).generate(source);
  if (!built.success || !("plan" in built)) throw new Error("plan missing");
  return proposalFromPlan(built.plan);
}

export function proposalFromPlan(plan: ExplanationPlanDraft): ExplanationPlanProposal {
  const sectionKey = new Map(plan.sections.map((section, index) => [section.id, `section-${index}`]));
  const stepKey = new Map(plan.sections.flatMap(({ steps }) => steps)
    .map((step, index) => [step.id, `step-${index}`]));
  const allVisuals = uniqueVisuals(plan.sections.flatMap(({ visualIntents }) => visualIntents));
  const visualKey = new Map(allVisuals.map((visual, index) => [visual.id, `visual-${index}`]));
  const sections: ProposalSection[] = plan.sections.map((section) => ({
    localKey: sectionKey.get(section.id)!,
    kind: section.kind, order: section.order, required: section.required,
    objective: section.objective, sourceContractSection: section.sourceContractSection,
    contextItemIds: section.contextItemIds,
    visualIntentKeys: section.visualIntents.map(({ id }) => visualKey.get(id)!),
    warnings: section.warnings,
    steps: section.steps.map((step) => ({
      localKey: stepKey.get(step.id)!, kind: step.kind, order: step.order,
      objective: step.objective, outputRequirement: step.outputRequirement,
      epistemicPolicy: step.epistemicPolicy,
      evidenceBindings: step.evidenceBindings.map((binding, index) => ({
        ...binding, localKey: `binding-${stepKey.get(step.id)}-${index}`,
        id: undefined,
      })).map(({ id: _id, ...binding }) => binding),
      dependencyLocalKeys: step.dependencyStepIds.map((id) => stepKey.get(id)!),
      subjectEntityIds: step.subjectEntityIds, locationIds: step.locationIds,
      ...(step.timeReference ? { timeReference: step.timeReference } : {}),
      visualIntentKeys: step.visualIntentIds.map((id) => visualKey.get(id)!),
      confidenceRequirement: step.confidenceRequirement,
      uncertaintyRequirement: step.uncertaintyRequirement,
      optional: step.optional, warnings: step.warnings,
    })),
  }));
  const visualIntents: ProposalVisualIntent[] = allVisuals.map((visual) => ({
    localKey: visualKey.get(visual.id)!,
    mode: visual.mode, purpose: visual.purpose, requiredness: visual.requiredness,
    relatedSectionKeys: visual.relatedSectionIds.map((id) => sectionKey.get(id)!),
    relatedStepKeys: visual.relatedStepIds.map((id) => stepKey.get(id)!),
    contextItemIds: visual.contextItemIds, entityIds: visual.entityIds,
    locationIds: visual.locationIds, dataPointIds: visual.dataPointIds,
    ...(visual.timeRange ? { timeRange: visual.timeRange } : {}),
    justification: visual.justification, fallbackMode: visual.fallbackMode,
    warnings: visual.warnings,
  }));
  return {
    answerStrategy: plan.answerStrategy, sections, visualIntents,
    decisionRule: plan.decisionRule, globalUncertainties: plan.globalUncertainties,
    warnings: plan.warnings,
  };
}

function uniqueVisuals(values: ExplanationPlanDraft["requiredVisualIntents"]) {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}
