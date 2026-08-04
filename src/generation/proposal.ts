import type { ExplanationPlanProposal, AllowedReferenceCatalog, GenerationError } from "./models";
import { ExplanationPlanProposalSchema } from "./validation";

export type ProposalValidationResult =
  | { success: true; proposal: ExplanationPlanProposal }
  | { success: false; error: GenerationError };

export function validateProposal(
  input: unknown,
  allowed: AllowedReferenceCatalog,
): ProposalValidationResult {
  const parsed = ExplanationPlanProposalSchema.safeParse(input);
  if (!parsed.success) {
    return failure("PROPOSAL_SCHEMA_INVALID", parsed.error.message);
  }
  const proposal = parsed.data;
  const sectionKeys = proposal.sections.map(({ localKey }) => localKey);
  const steps = proposal.sections.flatMap(({ steps }) => steps);
  const stepKeys = steps.map(({ localKey }) => localKey);
  const bindingKeys = steps.flatMap(({ evidenceBindings }) => evidenceBindings.map(({ localKey }) => localKey));
  const visualKeys = proposal.visualIntents.map(({ localKey }) => localKey);
  for (const [name, keys] of [
    ["section", sectionKeys], ["step", stepKeys], ["binding", bindingKeys], ["visual", visualKeys],
  ] as const) {
    if (new Set(keys).size !== keys.length) return failure("PROPOSAL_SCHEMA_INVALID", `Duplicate ${name} localKey.`);
  }
  const sections = new Set(sectionKeys);
  const stepSet = new Set(stepKeys);
  const visuals = new Set(visualKeys);
  const exact = (values: readonly string[], allowedValues: readonly string[], label: string): GenerationError | undefined => {
    const allowedSet = new Set(allowedValues);
    const invalid = values.find((value) => !allowedSet.has(value));
    return invalid ? error("PROPOSAL_REFERENCE_INVALID", `${label} is not allowlisted.`) : undefined;
  };
  for (const section of proposal.sections) {
    if (!allowed.requiredSectionKinds.includes(section.sourceContractSection)) {
      return failure("PROPOSAL_REFERENCE_INVALID", "Section is not required by the contract.");
    }
    const contextError = exact(section.contextItemIds, allowed.contextItemIds, "ContextItem ID");
    if (contextError) return { success: false, error: contextError };
    if (section.visualIntentKeys.some((key) => !visuals.has(key))) return failure("PROPOSAL_REFERENCE_INVALID", "Visual localKey is missing.");
    for (const step of section.steps) {
      if (step.dependencyLocalKeys.some((key) => !stepSet.has(key))) return failure("PROPOSAL_REFERENCE_INVALID", "Dependency localKey is missing.");
      if (step.visualIntentKeys.some((key) => !visuals.has(key))) return failure("PROPOSAL_REFERENCE_INVALID", "Step visual localKey is missing.");
      for (const [values, allowedValues, label] of [
        [step.subjectEntityIds, allowed.entityIds, "Entity ID"],
        [step.locationIds, allowed.locationIds, "Location ID"],
      ] as const) {
        const invalid = exact(values, allowedValues, label);
        if (invalid) return { success: false, error: invalid };
      }
      if (step.epistemicPolicy.allowedTypes.some((type) => !allowed.allowedEpistemicTypes.includes(type))) {
        return failure("PROPOSAL_REFERENCE_INVALID", "Epistemic type is not allowlisted.");
      }
      if (step.personalImpactBindings) {
        const personal = allowed.personalImpact;
        if (!personal ||
            step.personalImpactBindings.analysisFingerprint !== personal.analysisFingerprint) {
          return failure("PROPOSAL_REFERENCE_INVALID", "Personal impact lineage is not allowlisted.");
        }
        for (const [values, allowedValues, label] of [
          [step.personalImpactBindings.exposureIds, personal.exposureIds, "Exposure ID"],
          [step.personalImpactBindings.impactChannelIds, personal.impactChannelIds, "ImpactChannel ID"],
          [step.personalImpactBindings.impactAssessmentIds, personal.impactAssessmentIds, "ImpactAssessment ID"],
          [step.personalImpactBindings.scenarioIds, personal.scenarioIds, "Scenario ID"],
        ] as const) {
          const invalid = exact(values, allowedValues, label);
          if (invalid) return { success: false, error: invalid };
        }
      }
      for (const binding of step.evidenceBindings) {
        for (const [values, allowedValues, label] of [
          [[binding.contextItemId], allowed.contextItemIds, "ContextItem ID"],
          [binding.excerptIds, allowed.excerptIds, "Excerpt ID"],
          [binding.provenanceRecordIds, allowed.provenanceRecordIds, "Provenance ID"],
          [binding.sourceDocumentIds, allowed.sourceDocumentIds, "SourceDocument ID"],
          [binding.claimIds, allowed.claimIds, "Claim ID"],
          [binding.evidenceLinkIds, allowed.evidenceLinkIds, "EvidenceLink ID"],
          [binding.dataPointIds, allowed.dataPointIds, "DataPoint ID"],
          [binding.entityIds, allowed.entityIds, "Entity ID"],
        ] as const) {
          const invalid = exact(values, allowedValues, label);
          if (invalid) return { success: false, error: invalid };
        }
      }
    }
  }
  for (const visual of proposal.visualIntents) {
    if (!allowed.allowedVisualModes.includes(visual.mode)) return failure("PROPOSAL_REFERENCE_INVALID", "Visual mode is not allowlisted.");
    if (visual.relatedSectionKeys.some((key) => !sections.has(key)) ||
        visual.relatedStepKeys.some((key) => !stepSet.has(key))) {
      return failure("PROPOSAL_REFERENCE_INVALID", "Visual local reference is missing.");
    }
    for (const [values, allowedValues, label] of [
      [visual.contextItemIds, allowed.contextItemIds, "ContextItem ID"],
      [visual.entityIds, allowed.entityIds, "Entity ID"],
      [visual.locationIds, allowed.locationIds, "Location ID"],
      [visual.dataPointIds, allowed.dataPointIds, "DataPoint ID"],
    ] as const) {
      const invalid = exact(values, allowedValues, label);
      if (invalid) return { success: false, error: invalid };
    }
  }
  return { success: true, proposal };
}

function failure(code: GenerationError["code"], message: string): ProposalValidationResult {
  return { success: false, error: error(code, message) };
}
function error(code: GenerationError["code"], message: string): GenerationError {
  return { code, stage: "proposal-validation", message, retryable: false };
}
