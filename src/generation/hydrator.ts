import { createSemanticFingerprint } from "../briefing";
import { explanationPlanSemanticFingerprint, ExplanationPlanSchema } from "../explanation";
import type {
  ExplanationPlanDraft, ExplanationPlanSection, ExplanationStep,
  ExplanationVisualIntent,
} from "../explanation";
import type {
  ExplanationPlanProposal, HydrationContext, ProposalHydrationResult,
} from "./models";

const id = (type: string, requestFingerprint: string, localKey: string) =>
  `${type}:${createSemanticFingerprint({ requestFingerprint, localKey }).slice(0, 24)}`;

export class ExplanationPlanProposalHydrator {
  hydrate(proposal: ExplanationPlanProposal, context: HydrationContext): ProposalHydrationResult {
    try {
      const requestFingerprint = context.request.requestFingerprint;
      const sectionIds = new Map(proposal.sections.map(({ localKey }) =>
        [localKey, id("section", requestFingerprint, localKey)]));
      const stepIds = new Map(proposal.sections.flatMap(({ steps }) => steps).map(({ localKey }) =>
        [localKey, id("step", requestFingerprint, localKey)]));
      const visualIds = new Map(proposal.visualIntents.map(({ localKey }) =>
        [localKey, id("visual", requestFingerprint, localKey)]));
      const visuals = new Map<string, ExplanationVisualIntent>(proposal.visualIntents.map((visual) => [
        visual.localKey,
        {
          ...omit(visual, ["localKey", "relatedSectionKeys", "relatedStepKeys"]),
          id: visualIds.get(visual.localKey)!,
          relatedSectionIds: visual.relatedSectionKeys.map((key) => required(sectionIds, key)),
          relatedStepIds: visual.relatedStepKeys.map((key) => required(stepIds, key)),
        },
      ]));
      const sections: ExplanationPlanSection[] = proposal.sections
        .map((section) => {
          const sectionId = required(sectionIds, section.localKey);
          const steps: ExplanationStep[] = section.steps.map((step) => ({
            ...omit(step, ["localKey", "dependencyLocalKeys", "visualIntentKeys", "evidenceBindings"]),
            id: required(stepIds, step.localKey), sectionId,
            evidenceBindings: step.evidenceBindings.map((binding) => ({
              ...omit(binding, ["localKey"]),
              id: id("binding", requestFingerprint, binding.localKey),
            })),
            dependencyStepIds: step.dependencyLocalKeys.map((key) => required(stepIds, key)),
            visualIntentIds: step.visualIntentKeys.map((key) => required(visualIds, key)),
          }));
          return {
            ...omit(section, ["localKey", "steps", "visualIntentKeys"]),
            id: sectionId, steps,
            visualIntents: section.visualIntentKeys.map((key) => required(visuals, key)),
          };
        })
        .sort((left, right) => left.order - right.order);
      const packageCoverage = context.contextPackage.coverage;
      const evidenceSteps = sections.flatMap(({ steps }) => steps).filter(({ evidenceBindings }) => evidenceBindings.length > 0);
      const allSteps = sections.flatMap(({ steps }) => steps);
      const blocking = context.contextPackage.evidenceGaps.filter(({ blocking }) => blocking).map(({ id: gapId }) => gapId);
      const draft: ExplanationPlanDraft = {
        id: id("plan", requestFingerprint, "root"),
        questionId: context.contract.questionId, contractId: context.contract.id,
        contextPackageId: context.contextPackage.id,
        contractFingerprint: context.contract.semanticFingerprint,
        contextPackageFingerprint: context.contextPackage.fingerprint,
        ...(context.personalizedImpactPlanningContext ? {
          personalContextFingerprint:
            context.personalizedImpactPlanningContext.personalContextFingerprint,
          personalizedImpactAnalysisFingerprint:
            context.personalizedImpactPlanningContext.analysisFingerprint,
        } : {}),
        planVersion: context.planVersion, policyVersion: context.policyVersion,
        generator: context.generator,
        answerStrategy: proposal.answerStrategy,
        answerObjective: context.contract.answerGoal,
        status: blocking.length ? "insufficient-context" : "draft",
        sections, globalUncertainties: proposal.globalUncertainties,
        requiredVisualIntents: [...visuals.values()].filter(({ requiredness }) => requiredness === "required"),
        coverage: {
          overall: (packageCoverage.overall + evidenceSteps.length / Math.max(1, allSteps.length)) / 2,
          requiredSectionCoverage: sections.length / Math.max(1, context.contract.sectionPolicy.orderedSections.length),
          evidenceCoverage: evidenceSteps.length / Math.max(1, allSteps.length),
          contradictionCoverage: packageCoverage.contradictionCoverage,
          uncertaintyCoverage: Number(sections.some(({ kind }) => kind === "uncertainty")),
          primarySourceCoverage: packageCoverage.primarySourceCoverage,
          quantitativeCoverage: packageCoverage.quantitativeDataCoverage,
          temporalCoverage: packageCoverage.timelineCoverage,
          geographicCoverage: context.contract.geographicScope.focalLocations.length === 0 ? 1 :
            Number(allSteps.some(({ locationIds }) => locationIds.length > 0)),
          personalizationCoverage: packageCoverage.personalizationCoverage,
          missingRequirements: context.contract.sectionPolicy.orderedSections.filter((requiredSection) =>
            !sections.some(({ sourceContractSection }) => sourceContractSection === requiredSection)),
          blockingGaps: blocking,
        },
        decisionRule: proposal.decisionRule,
        ...(blocking.length ? { stopReason: "Blocking evidence gaps remain." } : {}),
        warnings: proposal.warnings, createdAt: context.now, fingerprint: "pending",
      };
      draft.fingerprint = explanationPlanSemanticFingerprint(draft);
      const validated = ExplanationPlanSchema.safeParse(draft);
      if (!validated.success) return failure(validated.error.message);
      return { success: true, plan: validated.data };
    } catch (cause) {
      return failure(cause instanceof Error ? cause.message : "Proposal hydration failed.");
    }
  }
}

function required<K, V>(map: Map<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new Error("Broken proposal local reference.");
  return value;
}

function omit<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

function failure(message: string): ProposalHydrationResult {
  return {
    success: false,
    error: { code: "PROPOSAL_HYDRATION_FAILED", stage: "hydration", message, retryable: false },
  };
}
