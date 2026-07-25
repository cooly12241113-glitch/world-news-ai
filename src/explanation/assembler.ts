import { randomUUID } from "node:crypto";
import type { BriefingContract, VisualMode } from "../briefing";
import type { ContextItem, EvidenceContextPackage } from "../context";
import { explanationPlanSemanticFingerprint } from "./fingerprint";
import {
  ANSWER_STRATEGY_BY_INTENT,
  type EpistemicType,
  type ExplanationDecisionRule,
  type ExplanationEvidenceBinding,
  type ExplanationPlanBuildResult,
  type ExplanationPlanCoverage,
  type ExplanationPlanDraft,
  type ExplanationPlanGenerationInput,
  type ExplanationPlanGenerator,
  type ExplanationPlanSection,
  type ExplanationStep,
  type ExplanationStepKind,
  type ExplanationVisualIntent,
  type OutputType,
  type PlanSectionKind,
} from "./models";
import { ExplanationPlanValidator } from "./validator";

export interface RuleBasedExplanationPlanAssemblerOptions {
  now?: () => Date;
  createId?: () => string;
  validator?: ExplanationPlanValidator;
  planVersion?: string;
  policyVersion?: string;
}

export class RuleBasedExplanationPlanAssembler implements ExplanationPlanGenerator {
  readonly id = "rule-based-explanation-plan-assembler";
  readonly version = "1.0.0";
  readonly policyVersion: string;
  readonly deterministic = true;
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly validator: ExplanationPlanValidator;
  private sequence = 0;

  constructor(options: RuleBasedExplanationPlanAssemblerOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.validator = options.validator ?? new ExplanationPlanValidator();
    this.policyVersion = options.policyVersion ?? "explanation-policy-v1";
  }

  generate(input: ExplanationPlanGenerationInput): ExplanationPlanBuildResult {
    const { question, contract, contextPackage } = input;
    if (contract.questionId !== question.id) {
      return this.failure("QUESTION_REFERENCE_MISMATCH", "references");
    }
    if (contract.status === "clarification-required") {
      return {
        success: true, outcome: "clarification-required",
        ...(contract.intentAnalysis.ambiguity.clarificationQuestion
          ? { clarificationQuestion: contract.intentAnalysis.ambiguity.clarificationQuestion }
          : {}),
        reasons: contract.intentAnalysis.ambiguity.missingInformation.length
          ? contract.intentAnalysis.ambiguity.missingInformation
          : ["The contract requires clarification."],
      };
    }
    if (contract.status === "unsupported") {
      return { success: true, outcome: "unsupported", reasons: ["The BriefingContract marks the request unsupported."] };
    }
    if (contextPackage.contractId !== contract.id || contextPackage.questionId !== question.id) {
      return this.failure("CONTEXT_REFERENCE_MISMATCH", "references");
    }
    this.sequence = 0;
    try {
      const sections = contract.sectionPolicy.orderedSections.map((sourceSection, order) =>
        this.section(sourceSection, order, contract, contextPackage));
      const visuals = this.visuals(contract, contextPackage, sections);
      for (const visual of visuals) {
        const section = sections.find(({ id }) => visual.relatedSectionIds.includes(id));
        if (section) section.visualIntents.push(visual);
      }
      const coverage = this.coverage(contract, contextPackage, sections);
      const insufficient = contextPackage.status === "insufficient-evidence" ||
        contextPackage.status === "no-relevant-context" ||
        coverage.blockingGaps.length > 0;
      const draft: ExplanationPlanDraft = {
        id: this.createId(),
        questionId: question.id,
        contractId: contract.id,
        contextPackageId: contextPackage.id,
        contractFingerprint: contract.semanticFingerprint,
        contextPackageFingerprint: contextPackage.fingerprint,
        planVersion: "explanation-plan-v1",
        policyVersion: this.policyVersion,
        generator: { type: "rule", id: this.id, version: this.version },
        answerStrategy: ANSWER_STRATEGY_BY_INTENT[contract.intentAnalysis.primaryIntent],
        answerObjective: contract.answerGoal,
        status: insufficient ? "insufficient-context" : "draft",
        sections,
        globalUncertainties: contextPackage.evidenceGaps.map(({ description }) => description),
        requiredVisualIntents: visuals.filter(({ requiredness }) => requiredness === "required"),
        coverage,
        decisionRule: decisionRule(contract.intentAnalysis.primaryIntent),
        ...(insufficient ? { stopReason: "EvidenceContextPackage contains blocking or insufficient evidence." } : {}),
        warnings: [...contract.warnings, ...contextPackage.warnings],
        createdAt: this.now().toISOString(),
        fingerprint: "pending",
      };
      draft.fingerprint = explanationPlanSemanticFingerprint(draft);
      const validation = this.validator.validate(draft, contract, contextPackage);
      const outcome = insufficient ? "insufficient-context"
        : contextPackage.status === "partial" || validation.outcome === "valid-with-warnings"
          ? "partial" : "ready";
      return { success: true, outcome, plan: draft, validation, warnings: draft.warnings };
    } catch (error) {
      return this.failure(
        "PLAN_ASSEMBLY_FAILED",
        "assembly",
        error instanceof Error ? error.message : "Plan assembly failed.",
      );
    }
  }

  private section(
    sourceSection: string,
    order: number,
    contract: BriefingContract,
    context: EvidenceContextPackage,
  ): ExplanationPlanSection {
    const kind = sectionKind(sourceSection, order);
    const id = `section:${order}:${slug(sourceSection)}`;
    const items = this.itemsFor(kind, context);
    const step = this.step(kind, id, items, contract, context);
    return {
      id, kind, order, required: true,
      objective: `Provide the ${sourceSection} component required by the BriefingContract.`,
      sourceContractSection: sourceSection,
      steps: [step],
      contextItemIds: items.map(({ id: itemId }) => itemId),
      visualIntents: [],
      warnings: items.length === 0 ? [`No context item is available for ${sourceSection}.`] : [],
    };
  }

  private step(
    sectionKindValue: PlanSectionKind,
    sectionId: string,
    items: ContextItem[],
    contract: BriefingContract,
    context: EvidenceContextPackage,
  ): ExplanationStep {
    const kind = stepKind(sectionKindValue);
    const id = `step:${this.sequence++}:${kind}`;
    const preferredType = epistemicType(sectionKindValue);
    const bindings = items.map((item, index) => binding(item, index, context));
    const isGap = sectionKindValue === "uncertainty" && context.evidenceGaps.length > 0;
    const isForecast = preferredType === "forecast";
    return {
      id, sectionId, kind, order: 0,
      objective: `Define the evidence-grounded requirement for ${sectionKindValue}.`,
      outputRequirement: {
        outputType: outputType(sectionKindValue),
        maximumStatements: sectionKindValue === "direct-answer" ? 2 : 3,
        directness: sectionKindValue === "direct-answer" ? "direct" : preferredType === "confirmed-fact" ? "contextual" : "qualified",
        requiresCitation: bindings.length > 0,
        requiresConfidenceLabel: contract.uncertaintyPolicy.requireConfidenceLabels,
        requiresUncertaintyLabel: ["uncertainty", "scenarios", "alternative-explanations"].includes(sectionKindValue),
        allowedEpistemicTypes: [preferredType],
        prohibitedBehaviors: [
          "invent-fact", "invent-source", "unsupported-causality",
          "promote-claim-to-fact", "hide-contradiction", "false-precision",
          "infer-sensitive-user-data", "direct-buy-sell-command",
        ],
      },
      epistemicPolicy: {
        allowedTypes: [preferredType],
        preferredType,
        evidenceRequirement: bindings.length > 0 ? "required" : isGap ? "gap-required" : "when-available",
        allowInference: preferredType === "inference",
        allowForecast: isForecast,
        requireAttribution: preferredType === "attributed-claim",
        requireAssumptions: isForecast,
        requireCounterEvidenceReview: contract.evidencePolicy.requireContradictingEvidence,
        prohibitFactPromotion: true,
      },
      evidenceBindings: bindings,
      dependencyStepIds: [],
      subjectEntityIds: [...new Set(items.flatMap(({ entityIds }) => entityIds))],
      locationIds: [...new Set(items.flatMap(({ locationIds }) => locationIds))],
      ...(isForecast && contract.timeScope.forecastHorizon
        ? { timeReference: contract.timeScope.forecastHorizon }
        : {}),
      visualIntentIds: [],
      confidenceRequirement: contract.uncertaintyPolicy.requireConfidenceLabels ? "required" : "when-uncertain",
      uncertaintyRequirement: ["uncertainty", "scenarios"].includes(sectionKindValue) ? "required" : "when-material",
      optional: false,
      warnings: bindings.length === 0 ? ["Evidence must not be invented for this step."] : [],
    };
  }

  private itemsFor(kind: PlanSectionKind, context: EvidenceContextPackage): ContextItem[] {
    const sectionNames: Record<PlanSectionKind, Array<keyof EvidenceContextPackage["sections"]>> = {
      "direct-answer": ["directEvidence", "currentSituation"],
      "current-situation": ["currentSituation", "directEvidence"],
      "necessary-background": ["background"],
      "explanation-path": ["supportingEvidence", "background"],
      "supporting-evidence": ["supportingEvidence", "directEvidence"],
      "contradicting-evidence": ["contradictingEvidence"],
      comparison: ["directEvidence", "supportingEvidence"],
      "claim-verification": ["supportingEvidence", "contradictingEvidence"],
      scenarios: ["currentSituation", "verificationSignals"],
      "counter-factors": ["contradictingEvidence"],
      "alternative-explanations": ["contradictingEvidence", "background"],
      confirmed: ["directEvidence", "supportingEvidence"],
      uncertainty: ["openQuestions", "contradictingEvidence"],
      "next-verification-signals": ["verificationSignals"],
      sources: ["directEvidence", "supportingEvidence", "contradictingEvidence"],
    };
    const ids = new Set(sectionNames[kind].flatMap((name) => context.sections[name]));
    return context.selectedItems.filter(({ id }) => ids.has(id)).slice(0, 5);
  }

  private visuals(
    contract: BriefingContract,
    context: EvidenceContextPackage,
    sections: ExplanationPlanSection[],
  ): ExplanationVisualIntent[] {
    if (contract.visualPolicy.maximumScenes === 0) return [];
    let mode: VisualMode | undefined;
    if (context.selectedItems.some(({ dataPointIds }) => dataPointIds.length > 0) &&
        contract.visualPolicy.allowedModes.includes("chart")) mode = "chart";
    else if (context.selectedItems.some(({ locationIds }) => locationIds.length > 0) &&
      contract.visualPolicy.mapUsage !== "disabled" &&
      contract.visualPolicy.allowedModes.includes("map")) mode = "map";
    else if (contract.visualPolicy.allowedModes.includes("document")) mode = "document";
    if (!mode) return [];
    const section = mode === "chart"
      ? sections.find(({ contextItemIds }) => context.selectedItems.some(({ id, dataPointIds }) =>
        contextItemIds.includes(id) && dataPointIds.length > 0))
      : sections.find(({ contextItemIds }) => contextItemIds.length > 0);
    if (!section) return [];
    const items = context.selectedItems.filter(({ id }) => section.contextItemIds.includes(id));
    const visual: ExplanationVisualIntent = {
      id: `visual:${mode}`, mode,
      purpose: `Clarify the evidence relationships in ${section.sourceContractSection}.`,
      requiredness: contract.visualPolicy.mapUsage === "required" && mode === "map" ? "required" : "preferred",
      relatedSectionIds: [section.id],
      relatedStepIds: [section.steps[0]!.id],
      contextItemIds: items.map(({ id }) => id),
      entityIds: [...new Set(items.flatMap(({ entityIds }) => entityIds))],
      locationIds: [...new Set(items.flatMap(({ locationIds }) => locationIds))],
      dataPointIds: [...new Set(items.flatMap(({ dataPointIds }) => dataPointIds))],
      justification: "The visual exposes evidence structure without prescribing renderer implementation.",
      fallbackMode: contract.visualPolicy.fallbackMode,
      warnings: [],
    };
    section.steps[0]!.visualIntentIds.push(visual.id);
    return [visual];
  }

  private coverage(
    contract: BriefingContract,
    context: EvidenceContextPackage,
    sections: ExplanationPlanSection[],
  ): ExplanationPlanCoverage {
    const missing = sections.filter(({ contextItemIds, kind }) =>
      contextItemIds.length === 0 && !["uncertainty", "sources"].includes(kind))
      .map(({ sourceContractSection }) => sourceContractSection);
    const blocking = context.evidenceGaps.filter(({ blocking }) => blocking).map(({ id }) => id);
    const evidenceCoverage = sections.length === 0 ? 0 :
      sections.filter(({ contextItemIds }) => contextItemIds.length > 0).length / sections.length;
    const overall = (context.coverage.overall + evidenceCoverage) / 2;
    return {
      overall,
      requiredSectionCoverage: (sections.length - missing.length) / Math.max(1, sections.length),
      evidenceCoverage,
      contradictionCoverage: context.coverage.contradictionCoverage,
      uncertaintyCoverage: contract.uncertaintyPolicy.requireKnownUnknowns
        ? Number(sections.some(({ kind }) => kind === "uncertainty")) : 1,
      primarySourceCoverage: context.coverage.primarySourceCoverage,
      quantitativeCoverage: context.coverage.quantitativeDataCoverage,
      temporalCoverage: context.coverage.timelineCoverage,
      geographicCoverage: contract.geographicScope.focalLocations.length === 0
        ? 1 : Number(context.selectedItems.some(({ locationIds }) => locationIds.length > 0)),
      personalizationCoverage: context.coverage.personalizationCoverage,
      missingRequirements: missing,
      blockingGaps: blocking,
    };
  }

  private failure(
    code: "QUESTION_REFERENCE_MISMATCH" | "CONTEXT_REFERENCE_MISMATCH" | "PLAN_ASSEMBLY_FAILED",
    stage: string,
    details?: string,
  ): ExplanationPlanBuildResult {
    return { success: false, error: { code, stage, retryable: false, ...(details ? { details } : {}) } };
  }
}

function binding(item: ContextItem, index: number, context: EvidenceContextPackage): ExplanationEvidenceBinding {
  const usage = item.contradictsClaimIds.length > 0 ? "contradicts"
    : item.dataPointIds.length > 0 ? "quantifies"
      : item.supportsClaimIds.length > 0 ? "supports" : "contextualizes";
  return {
    id: `binding:${item.id}:${index}`,
    contextItemId: item.id,
    usage,
    excerptIds: item.excerptId ? [item.excerptId] : [],
    provenanceRecordIds: [...item.provenanceRefs],
    sourceDocumentIds: [...item.sourceDocumentIds],
    claimIds: [...new Set([...item.supportsClaimIds, ...item.contradictsClaimIds])],
    evidenceLinkIds: item.itemType === "evidence-link" ? [item.recordId] : [],
    dataPointIds: [...item.dataPointIds],
    entityIds: [...item.entityIds],
    required: true,
    selectionReason: item.selectionReasons.join("; ") || "Selected by the EvidenceContextPackage.",
    confidence: item.confidence,
    warnings: context.evidenceGaps.filter(({ relatedClaimIds }) =>
      relatedClaimIds.some((id) => item.supportsClaimIds.includes(id))).map(({ description }) => description),
  };
}

function sectionKind(label: string, order: number): PlanSectionKind {
  if (order === 0) return "direct-answer";
  const normalized = label.toLowerCase();
  if (normalized.includes("current")) return "current-situation";
  if (normalized.includes("background") || normalized === "origin") return "necessary-background";
  if (normalized.includes("contradict")) return "contradicting-evidence";
  if (normalized.includes("support")) return "supporting-evidence";
  if (normalized.includes("comparison") || normalized.includes("subject") || normalized.includes("difference")) return "comparison";
  if (normalized.includes("scenario") || normalized.includes("driver") || normalized.includes("assumption")) return "scenarios";
  if (normalized.includes("counter")) return "counter-factors";
  if (normalized.includes("uncertain")) return "uncertainty";
  if (normalized.includes("confirmed") || normalized === "verdict") return "confirmed";
  if (normalized.includes("watch") || normalized.includes("verification")) return "next-verification-signals";
  if (normalized.includes("source")) return "sources";
  if (normalized === "claim") return "claim-verification";
  return "explanation-path";
}

function stepKind(kind: PlanSectionKind): ExplanationStepKind {
  const mapping: Record<PlanSectionKind, ExplanationStepKind> = {
    "direct-answer": "state-direct-answer",
    "current-situation": "establish-current-state",
    "necessary-background": "introduce-background",
    "explanation-path": "explain-mechanism",
    "supporting-evidence": "evaluate-supporting-evidence",
    "contradicting-evidence": "evaluate-contradicting-evidence",
    comparison: "compare-subject",
    "claim-verification": "establish-claim-origin",
    scenarios: "define-scenario",
    "counter-factors": "identify-counter-factor",
    "alternative-explanations": "present-alternative-explanation",
    confirmed: "evaluate-supporting-evidence",
    uncertainty: "expose-uncertainty",
    "next-verification-signals": "identify-verification-signal",
    sources: "summarize-source-basis",
  };
  return mapping[kind];
}

function epistemicType(kind: PlanSectionKind): EpistemicType {
  if (kind === "claim-verification") return "attributed-claim";
  if (kind === "scenarios") return "forecast";
  if (kind === "uncertainty") return "unknown";
  if (["explanation-path", "alternative-explanations", "counter-factors"].includes(kind)) return "inference";
  if (kind === "direct-answer") return "interpretation";
  return "confirmed-fact";
}

function outputType(kind: PlanSectionKind): OutputType {
  if (kind === "direct-answer") return "direct-answer";
  if (kind === "explanation-path") return "causal-link";
  if (kind === "claim-verification") return "claim-assessment";
  if (kind === "comparison") return "comparison";
  if (kind === "scenarios") return "scenario";
  if (kind === "uncertainty") return "uncertainty-disclosure";
  if (kind === "next-verification-signals") return "verification-signal";
  if (kind === "sources") return "source-note";
  return "factual-summary";
}

function decisionRule(intent: BriefingContract["intentAnalysis"]["primaryIntent"]): ExplanationDecisionRule {
  if (intent === "fact-verification") {
    return {
      type: "fact-verification",
      allowedOutcomes: ["confirmed", "strongly-supported", "mixed", "unsubstantiated", "contradicted", "undetermined"],
      requiredEvidenceConditions: ["evaluate supporting and contradicting evidence", "retain attribution"],
      blockingConditions: ["claim origin missing"],
      downgradeConditions: ["independent corroboration missing", "primary source missing"],
      prohibitUnsupportedConclusion: true,
    };
  }
  if (intent === "forecast") {
    return {
      type: "forecast-scenarios",
      allowedOutcomes: ["base-scenario", "upside-scenario", "downside-scenario", "high-uncertainty"],
      requiredEvidenceConditions: ["state assumptions", "identify forecast horizon", "identify verification signals"],
      blockingConditions: ["assumptions missing"],
      downgradeConditions: ["verification signals missing", "evidence weakens"],
      prohibitUnsupportedConclusion: true,
    };
  }
  return {
    type: "evidence-sufficiency",
    allowedOutcomes: ["supported", "partially-supported", "insufficient-context", "undetermined"],
    requiredEvidenceConditions: ["bind every factual requirement to context evidence"],
    blockingConditions: ["blocking evidence gap"],
    downgradeConditions: ["contradicting evidence missing", "independent sources missing"],
    prohibitUnsupportedConclusion: true,
  };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
