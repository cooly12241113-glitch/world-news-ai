import { createSemanticFingerprint } from "../briefing";
import type { ExplanationPlanDraft } from "./models";

const sorted = (values: string[]): string[] => [...new Set(values)].sort();

export function explanationPlanSemanticFingerprint(plan: ExplanationPlanDraft): string {
  return createSemanticFingerprint({
    contractFingerprint: plan.contractFingerprint,
    contextPackageFingerprint: plan.contextPackageFingerprint,
    answerStrategy: plan.answerStrategy,
    answerObjective: plan.answerObjective,
    planVersion: plan.planVersion,
    policyVersion: plan.policyVersion,
    generator: plan.generator,
    sections: [...plan.sections]
      .sort((left, right) => left.order - right.order || left.kind.localeCompare(right.kind))
      .map((section) => ({
        kind: section.kind,
        order: section.order,
        required: section.required,
        objective: section.objective,
        sourceContractSection: section.sourceContractSection,
        contextItemIds: sorted(section.contextItemIds),
        steps: [...section.steps]
          .sort((left, right) => left.order - right.order || left.kind.localeCompare(right.kind))
          .map((step) => ({
            kind: step.kind,
            order: step.order,
            objective: step.objective,
            outputRequirement: {
              ...step.outputRequirement,
              allowedEpistemicTypes: sorted(step.outputRequirement.allowedEpistemicTypes),
              prohibitedBehaviors: sorted(step.outputRequirement.prohibitedBehaviors),
            },
            epistemicPolicy: {
              ...step.epistemicPolicy,
              allowedTypes: sorted(step.epistemicPolicy.allowedTypes),
            },
            bindings: step.evidenceBindings
              .map((binding) => ({
                usage: binding.usage,
                contextItemId: binding.contextItemId,
                excerptIds: sorted(binding.excerptIds),
                provenanceRecordIds: sorted(binding.provenanceRecordIds),
                sourceDocumentIds: sorted(binding.sourceDocumentIds),
                claimIds: sorted(binding.claimIds),
                evidenceLinkIds: sorted(binding.evidenceLinkIds),
                dataPointIds: sorted(binding.dataPointIds),
                entityIds: sorted(binding.entityIds),
                required: binding.required,
                selectionReason: binding.selectionReason,
                confidence: binding.confidence,
              }))
              .sort((left, right) =>
                left.contextItemId.localeCompare(right.contextItemId) ||
                left.usage.localeCompare(right.usage)),
            dependencyKinds: sorted(step.dependencyStepIds.map((dependencyId) => {
              const dependency = plan.sections.flatMap(({ steps }) => steps)
                .find(({ id }) => id === dependencyId);
              return dependency ? `${dependency.kind}:${dependency.order}` : `missing:${dependencyId}`;
            })),
            subjectEntityIds: sorted(step.subjectEntityIds),
            locationIds: sorted(step.locationIds),
            timeReference: step.timeReference,
            confidenceRequirement: step.confidenceRequirement,
            uncertaintyRequirement: step.uncertaintyRequirement,
            optional: step.optional,
          })),
        visuals: section.visualIntents.map(semanticVisual)
          .sort((left, right) => left.mode.localeCompare(right.mode) ||
            left.purpose.localeCompare(right.purpose)),
      })),
    requiredVisualIntents: plan.requiredVisualIntents.map(semanticVisual)
      .sort((left, right) => left.mode.localeCompare(right.mode) ||
        left.purpose.localeCompare(right.purpose)),
    globalUncertainties: sorted(plan.globalUncertainties),
    decisionRule: {
      ...plan.decisionRule,
      allowedOutcomes: sorted(plan.decisionRule.allowedOutcomes),
      requiredEvidenceConditions: sorted(plan.decisionRule.requiredEvidenceConditions),
      blockingConditions: sorted(plan.decisionRule.blockingConditions),
      downgradeConditions: sorted(plan.decisionRule.downgradeConditions),
    },
    stopReason: plan.stopReason,
  });
}

function semanticVisual(visual: ExplanationPlanDraft["requiredVisualIntents"][number]) {
  return {
    mode: visual.mode,
    purpose: visual.purpose,
    requiredness: visual.requiredness,
    contextItemIds: sorted(visual.contextItemIds),
    entityIds: sorted(visual.entityIds),
    locationIds: sorted(visual.locationIds),
    dataPointIds: sorted(visual.dataPointIds),
    timeRange: visual.timeRange,
    justification: visual.justification,
    fallbackMode: visual.fallbackMode,
  };
}
