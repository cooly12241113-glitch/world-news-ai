import type { ExplanationPlanDraft } from "../../explanation";
import type {
  ExplanationPlanProposal,
  ProposalSection,
  ProposalVisualIntent,
} from "../models";

export function proposalFromExplanationPlan(
  plan: ExplanationPlanDraft,
): ExplanationPlanProposal {
  const sectionKeys = new Map(
    plan.sections.map((section, index) => [section.id, `section-${index}`]),
  );
  const steps = plan.sections.flatMap(({ steps: values }) => values);
  const stepKeys = new Map(steps.map((step, index) => [step.id, `step-${index}`]));
  const visuals = [...new Map(
    plan.sections.flatMap(({ visualIntents }) => visualIntents)
      .map((visual) => [visual.id, visual]),
  ).values()];
  const visualKeys = new Map(
    visuals.map((visual, index) => [visual.id, `visual-${index}`]),
  );
  const sections: ProposalSection[] = plan.sections.map((section) => ({
    localKey: required(sectionKeys, section.id),
    kind: section.kind,
    order: section.order,
    required: section.required,
    objective: section.objective,
    sourceContractSection: section.sourceContractSection,
    contextItemIds: section.contextItemIds,
    visualIntentKeys: section.visualIntents.map(({ id }) => required(visualKeys, id)),
    warnings: section.warnings,
    steps: section.steps.map((step) => ({
      localKey: required(stepKeys, step.id),
      kind: step.kind,
      order: step.order,
      objective: step.objective,
      outputRequirement: step.outputRequirement,
      epistemicPolicy: step.epistemicPolicy,
      evidenceBindings: step.evidenceBindings.map(({ id: _id, ...binding }, index) => ({
        ...binding,
        localKey: `binding-${required(stepKeys, step.id)}-${index}`,
      })),
      dependencyLocalKeys: step.dependencyStepIds.map((id) => required(stepKeys, id)),
      subjectEntityIds: step.subjectEntityIds,
      locationIds: step.locationIds,
      ...(step.timeReference ? { timeReference: step.timeReference } : {}),
      visualIntentKeys: step.visualIntentIds.map((id) => required(visualKeys, id)),
      confidenceRequirement: step.confidenceRequirement,
      uncertaintyRequirement: step.uncertaintyRequirement,
      ...(step.personalImpactBindings
        ? { personalImpactBindings: step.personalImpactBindings }
        : {}),
      optional: step.optional,
      warnings: step.warnings,
    })),
  }));
  const visualIntents: ProposalVisualIntent[] = visuals.map((visual) => ({
    localKey: required(visualKeys, visual.id),
    mode: visual.mode,
    purpose: visual.purpose,
    requiredness: visual.requiredness,
    relatedSectionKeys: visual.relatedSectionIds.map((id) => required(sectionKeys, id)),
    relatedStepKeys: visual.relatedStepIds.map((id) => required(stepKeys, id)),
    contextItemIds: visual.contextItemIds,
    entityIds: visual.entityIds,
    locationIds: visual.locationIds,
    dataPointIds: visual.dataPointIds,
    ...(visual.timeRange ? { timeRange: visual.timeRange } : {}),
    justification: visual.justification,
    fallbackMode: visual.fallbackMode,
    warnings: visual.warnings,
  }));
  return {
    answerStrategy: plan.answerStrategy,
    sections,
    visualIntents,
    decisionRule: plan.decisionRule,
    globalUncertainties: plan.globalUncertainties,
    warnings: plan.warnings,
  };
}

function required<Key, Value>(values: Map<Key, Value>, key: Key): Value {
  const value = values.get(key);
  if (value === undefined) throw new Error("Fixture plan reference is incomplete.");
  return value;
}
