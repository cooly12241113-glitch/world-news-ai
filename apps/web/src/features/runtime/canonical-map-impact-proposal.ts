import type { ExplanationPlanDraft, ExplanationStepKind, PlanSectionKind } from "@world-news-ai/explanation";
import type { EvidenceContextPackage } from "@world-news-ai/context";
import {
  proposalFromExplanationPlan,
  type ExplanationPlanGenerationInput,
  type ExplanationPlanProposal,
  type ProposalVisualIntent,
} from "@world-news-ai/generation";
import { canonicalMapImpactScenes } from "../../fixtures/canonical-map-impact";

const middle = canonicalMapImpactScenes.slice(1, -1);
const sectionKinds: PlanSectionKind[] = [
  "direct-answer",
  "necessary-background",
  "explanation-path",
  "supporting-evidence",
  "uncertainty",
];
const stepKinds: ExplanationStepKind[] = [
  "state-direct-answer",
  "introduce-background",
  "explain-mechanism",
  "evaluate-supporting-evidence",
  "expose-uncertainty",
];

export function createCanonicalMapImpactProposal(
  plan: ExplanationPlanDraft,
  context: EvidenceContextPackage,
  personalizedImpact?: ExplanationPlanGenerationInput["personalizedImpactPlanningContext"],
): ExplanationPlanProposal {
  const proposal = proposalFromExplanationPlan(plan);
  if (proposal.sections.length < middle.length) {
    throw new Error("Canonical map-impact fixture requires at least five plan sections.");
  }
  proposal.answerStrategy = personalizedImpact ? "personalize-impact" : "trace-impact";
  const dataPointIds = [...new Set(context.selectedItems.flatMap(({ dataPointIds }) => dataPointIds))];
  const firstSectionByGroup = new Map<number, number>();
  proposal.sections.forEach((section, index) => {
    const group = Math.floor(index * middle.length / proposal.sections.length);
    const semantic = middle[group]!;
    firstSectionByGroup.set(group, firstSectionByGroup.get(group) ?? index);
    section.kind = sectionKinds[group]!;
    section.objective = semantic.objective;
    section.visualIntentKeys = semantic.mode && firstSectionByGroup.get(group) === index
      ? [`canonical-visual-${group}`]
      : [];
    section.steps.forEach((step) => {
      step.kind = stepKinds[group]!;
      step.objective = semantic.objective;
      step.locationIds = [...semantic.locationIds];
      step.visualIntentKeys = [...section.visualIntentKeys];
      step.outputRequirement.outputType = group === 0
        ? "direct-answer"
        : group === 2
        ? "causal-link"
        : group === 4 ? "uncertainty-disclosure" : "factual-summary";
      step.uncertaintyRequirement = group === 4 ? "required" : "when-material";
      const requiredItems = context.selectedItems.filter((item) =>
        semantic.locationIds.some((locationId) => item.locationIds.includes(locationId)) ||
        (semantic.mode === "chart" && item.dataPointIds.some((id) => dataPointIds.includes(id))));
      for (const item of requiredItems) {
        if (step.evidenceBindings.some(({ contextItemId }) => contextItemId === item.id)) continue;
        step.evidenceBindings.push({
          localKey: `canonical-binding-${section.localKey}-${step.localKey}-${item.id}`,
          contextItemId: item.id,
          usage: item.dataPointIds.length ? "quantifies" : "contextualizes",
          excerptIds: item.excerptId ? [item.excerptId] : [],
          provenanceRecordIds: item.provenanceRefs,
          sourceDocumentIds: item.sourceDocumentIds,
          claimIds: [...new Set([...item.supportsClaimIds, ...item.contradictsClaimIds])],
          evidenceLinkIds: item.itemType === "evidence-link" ? [item.recordId] : [],
          dataPointIds: item.dataPointIds,
          entityIds: item.entityIds,
          required: true,
          selectionReason: "Canonical fixture presentation binding.",
          confidence: item.confidence,
          warnings: [],
        });
      }
    });
  });
  proposal.visualIntents = proposal.sections.flatMap((section, index) => {
    const group = Math.floor(index * middle.length / proposal.sections.length);
    const semantic = middle[group]!;
    if (!semantic.mode || firstSectionByGroup.get(group) !== index) return [];
    const step = section.steps[0];
    if (!step) return [];
    return [visualIntent(
      `canonical-visual-${group}`,
      semantic.mode,
      section.localKey,
      step.localKey,
      section.contextItemIds,
      semantic.locationIds,
      semantic.mode === "chart" ? dataPointIds : [],
      semantic.objective,
    )];
  });
  if (personalizedImpact) {
    for (const visual of proposal.visualIntents) visual.requiredness = "preferred";
    bindPersonalizedImpact(proposal, personalizedImpact);
  }
  return proposal;
}

function bindPersonalizedImpact(
  proposal: ExplanationPlanProposal,
  planning: NonNullable<ExplanationPlanGenerationInput["personalizedImpactPlanningContext"]>,
): void {
  const channelStep = proposal.sections.flatMap(({ steps }) => steps)
    .find(({ kind }) => kind === "explain-mechanism");
  const scenarioStep = proposal.sections.flatMap(({ steps }) => steps)
    .find(({ kind }) => kind === "expose-uncertainty");
  if (!channelStep || !scenarioStep) throw new Error("Personalized fixture steps are unavailable.");
  channelStep.kind = "trace-impact-channel";
  channelStep.outputRequirement.outputType = "impact-link";
  channelStep.outputRequirement.allowedEpistemicTypes = ["inference"];
  channelStep.epistemicPolicy = {
    ...channelStep.epistemicPolicy,
    allowedTypes: ["inference"], preferredType: "inference",
    allowInference: true, allowForecast: false, requireAssumptions: false,
  };
  channelStep.personalImpactBindings = {
    analysisFingerprint: planning.analysisFingerprint,
    exposureIds: planning.exposures.map(({ exposureId }) => exposureId),
    impactChannelIds: planning.channels.map(({ channelId }) => channelId),
    impactAssessmentIds: planning.assessments.map(({ assessmentId }) => assessmentId),
    scenarioIds: [],
  };
  scenarioStep.kind = "define-scenario";
  scenarioStep.outputRequirement.outputType = "scenario";
  scenarioStep.outputRequirement.allowedEpistemicTypes = ["forecast"];
  scenarioStep.epistemicPolicy = {
    ...scenarioStep.epistemicPolicy,
    allowedTypes: ["forecast"], preferredType: "forecast",
    allowInference: false, allowForecast: true, requireAssumptions: true,
  };
  scenarioStep.personalImpactBindings = {
    analysisFingerprint: planning.analysisFingerprint,
    exposureIds: planning.scenarios.flatMap(({ affectedExposureIds }) => affectedExposureIds),
    impactChannelIds: planning.scenarios.flatMap(({ channelIds }) => channelIds),
    impactAssessmentIds: [],
    scenarioIds: planning.scenarios.map(({ scenarioId }) => scenarioId),
  };
}

function visualIntent(
  localKey: string,
  mode: ProposalVisualIntent["mode"],
  sectionKey: string,
  stepKey: string,
  contextItemIds: string[],
  locationIds: string[],
  dataPointIds: string[],
  purpose: string,
): ProposalVisualIntent {
  return {
    localKey,
    mode,
    purpose,
    requiredness: mode === "map-flow" ? "required" : "preferred",
    relatedSectionKeys: [sectionKey],
    relatedStepKeys: [stepKey],
    contextItemIds,
    entityIds: [],
    locationIds,
    dataPointIds,
    justification: "Canonical fixture semantics preserve renderer-neutral presentation intent.",
    fallbackMode: "text",
    warnings: [],
  };
}
