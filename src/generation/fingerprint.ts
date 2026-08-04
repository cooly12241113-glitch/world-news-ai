import { createSemanticFingerprint } from "../briefing";
import type {
  AllowedReferenceCatalog, ExplanationPlanLlmRequestPackage,
  ExplanationPlanProposal, PromptTemplateDefinition,
} from "./models";

const sorted = (values: string[]) => [...new Set(values)].sort();

export function canonicalReferences(catalog: AllowedReferenceCatalog): AllowedReferenceCatalog {
  return {
    ...catalog,
    contextItemIds: sorted(catalog.contextItemIds), excerptIds: sorted(catalog.excerptIds),
    provenanceRecordIds: sorted(catalog.provenanceRecordIds),
    sourceDocumentIds: sorted(catalog.sourceDocumentIds), claimIds: sorted(catalog.claimIds),
    evidenceLinkIds: sorted(catalog.evidenceLinkIds), dataPointIds: sorted(catalog.dataPointIds),
    entityIds: sorted(catalog.entityIds), locationIds: sorted(catalog.locationIds),
    requiredSectionKinds: sorted(catalog.requiredSectionKinds),
    allowedVisualModes: sorted(catalog.allowedVisualModes) as AllowedReferenceCatalog["allowedVisualModes"],
    allowedEpistemicTypes: sorted(catalog.allowedEpistemicTypes) as AllowedReferenceCatalog["allowedEpistemicTypes"],
    ...(catalog.personalImpact ? { personalImpact: {
      analysisFingerprint: catalog.personalImpact.analysisFingerprint,
      exposureIds: sorted(catalog.personalImpact.exposureIds),
      impactChannelIds: sorted(catalog.personalImpact.impactChannelIds),
      impactAssessmentIds: sorted(catalog.personalImpact.impactAssessmentIds),
      scenarioIds: sorted(catalog.personalImpact.scenarioIds),
    } } : {}),
  };
}

export function promptHash(template: Omit<PromptTemplateDefinition, "hash">): string {
  return createSemanticFingerprint(template);
}

export function requestFingerprint(
  request: Omit<ExplanationPlanLlmRequestPackage, "requestFingerprint" | "requestId">,
  contractFingerprint: string,
  contextPackageFingerprint: string,
  providerId: string,
  modelId: string,
  policyVersion: string,
): string {
  return createSemanticFingerprint({
    normalizedQuestion: request.normalizedQuestion,
    contractFingerprint, contextPackageFingerprint, providerId, modelId,
    prompt: {
      id: request.promptTemplate.id, version: request.promptTemplate.version,
      hash: request.promptTemplate.hash,
    },
    proposalSchemaVersion: request.proposalSchemaVersion,
    policyVersion,
    budget: request.generationBudget,
    allowedReferences: canonicalReferences(request.allowedReferenceCatalog),
    visualModes: sorted(request.permittedVisualModes),
    ...(request.personalizedImpactPlanningContext ? {
      personalizedImpactAnalysisFingerprint:
        request.personalizedImpactPlanningContext.analysisFingerprint,
    } : {}),
  });
}

export function proposalOutputHash(proposal: ExplanationPlanProposal): string {
  return createSemanticFingerprint(proposal);
}
