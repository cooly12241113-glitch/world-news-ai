import { ANSWER_STRATEGY_BY_INTENT } from "../explanation";
import type {
  AllowedReferenceCatalog, ExplanationPlanGenerationInput,
  ExplanationPlanLlmRequestPackage, UntrustedEvidenceRecord,
} from "./models";
import { canonicalReferences, requestFingerprint } from "./fingerprint";
import { createPromptTemplate } from "./prompt";
import { ExplanationPlanGenerationInputSchema, ExplanationPlanLlmRequestPackageSchema } from "./validation";

export class ExplanationPlanLlmRequestBuilder {
  build(input: ExplanationPlanGenerationInput): ExplanationPlanLlmRequestPackage {
    const { abortSignal: _abortSignal, ...serializable } = input;
    const parsed = ExplanationPlanGenerationInputSchema.safeParse(serializable);
    if (!parsed.success) throw new Error(`INVALID_GENERATION_INPUT: ${parsed.error.message}`);
    const { question, briefingContract: contract, evidenceContextPackage: context } = parsed.data;
    if (contract.status !== "ready") throw new Error("CONTRACT_NOT_READY");
    if (question.id !== contract.questionId || context.questionId !== question.id ||
        context.contractId !== contract.id) throw new Error("REFERENCE_MISMATCH");
    if (["no-relevant-context", "insufficient-evidence"].includes(context.status)) {
      throw new Error("CONTEXT_NOT_READY");
    }
    const allowed = this.allowedReferences(contract, context);
    const template = createPromptTemplate(
      input.generationPolicy.promptTemplateId,
      input.generationPolicy.promptTemplateVersion,
    );
    const withoutFingerprint: Omit<ExplanationPlanLlmRequestPackage, "requestFingerprint"> = {
      requestId: input.requestId,
      questionReference: {
        questionId: question.id, text: question.text, language: question.language,
        personalizationRequested: question.personalizationRequested,
      },
      normalizedQuestion: question.text.trim().replace(/\s+/g, " "),
      answerGoal: contract.answerGoal,
      answerStrategy: ANSWER_STRATEGY_BY_INTENT[contract.intentAnalysis.primaryIntent],
      contractSummary: {
        primaryIntent: contract.intentAnalysis.primaryIntent,
        secondaryIntents: contract.intentAnalysis.secondaryIntents,
        answerGoal: contract.answerGoal, timeScope: contract.timeScope,
        geographicScope: contract.geographicScope, domainScope: contract.domainScope,
        evidencePolicy: contract.evidencePolicy, uncertaintyPolicy: contract.uncertaintyPolicy,
        visualPolicy: contract.visualPolicy, explanationPolicy: contract.explanationPolicy,
        personalizationPolicy: contract.personalizationPolicy,
        sectionPolicy: contract.sectionPolicy, stopConditions: contract.stopConditions,
      },
      policySummary: {
        generationPolicyVersion: input.generationPolicy.version,
        planSchemaVersion: input.generationPolicy.planSchemaVersion,
      },
      contextCatalog: this.contextCatalog(context),
      allowedReferenceCatalog: allowed,
      requiredSections: contract.sectionPolicy.orderedSections,
      permittedVisualModes: contract.visualPolicy.allowedModes,
      prohibitedBehaviors: [
        "invent-fact", "invent-source", "unsupported-causality",
        "promote-claim-to-fact", "hide-contradiction", "false-precision",
        "infer-sensitive-user-data", "direct-buy-sell-command",
      ],
      proposalSchemaVersion: input.generationPolicy.proposalSchemaVersion,
      promptTemplate: template, generationBudget: input.generationBudget,
    };
    const { requestId: _requestId, ...semantic } = withoutFingerprint;
    const request: ExplanationPlanLlmRequestPackage = {
      ...withoutFingerprint,
      requestFingerprint: requestFingerprint(
        semantic, contract.semanticFingerprint, context.fingerprint,
        input.providerSelection.providerId, input.providerSelection.modelId,
        input.generationPolicy.version,
      ),
    };
    return ExplanationPlanLlmRequestPackageSchema.parse(request);
  }

  private allowedReferences(
    contract: ExplanationPlanGenerationInput["briefingContract"],
    context: ExplanationPlanGenerationInput["evidenceContextPackage"],
  ): AllowedReferenceCatalog {
    return canonicalReferences({
      contextItemIds: context.selectedItems.map(({ id }) => id),
      excerptIds: context.excerpts.map(({ id }) => id),
      provenanceRecordIds: context.provenanceIndex.map(({ provenanceId }) => provenanceId),
      sourceDocumentIds: context.selectedItems.flatMap(({ sourceDocumentIds }) => sourceDocumentIds),
      claimIds: context.selectedItems.flatMap((item) => [...item.supportsClaimIds, ...item.contradictsClaimIds]),
      evidenceLinkIds: context.selectedItems.filter(({ itemType }) => itemType === "evidence-link").map(({ recordId }) => recordId),
      dataPointIds: context.selectedItems.flatMap(({ dataPointIds }) => dataPointIds),
      entityIds: context.selectedItems.flatMap(({ entityIds }) => entityIds),
      locationIds: context.selectedItems.flatMap(({ locationIds }) => locationIds),
      requiredSectionKinds: contract.sectionPolicy.orderedSections,
      allowedVisualModes: contract.visualPolicy.allowedModes,
      allowedEpistemicTypes: ["confirmed-fact", "attributed-claim", "interpretation", "inference", "forecast", "unknown"],
    });
  }

  private contextCatalog(context: ExplanationPlanGenerationInput["evidenceContextPackage"]): UntrustedEvidenceRecord[] {
    const excerpts = new Map(context.excerpts.map((excerpt) => [excerpt.id, excerpt]));
    return context.selectedItems.map((item) => {
      const excerpt = item.excerptId ? excerpts.get(item.excerptId) : undefined;
      if (!excerpt) throw new Error("REFERENCE_MISMATCH");
      return {
        recordType: "UNTRUSTED_EVIDENCE", instructionPolicy: "DATA_ONLY",
        contextItemId: item.id, excerptId: excerpt.id, text: excerpt.text,
        evidenceCategory: item.evidenceCategory,
        sourceDocumentIds: item.sourceDocumentIds,
        claimIds: [...item.supportsClaimIds, ...item.contradictsClaimIds],
        evidenceLinkIds: item.itemType === "evidence-link" ? [item.recordId] : [],
        dataPointIds: item.dataPointIds, entityIds: item.entityIds,
        locationIds: item.locationIds, provenanceRecordIds: item.provenanceRefs,
        confidence: item.confidence,
        relation: item.contradictsClaimIds.length ? "contradicts"
          : item.supportsClaimIds.length ? "supports" : "contextualizes",
      };
    });
  }
}
