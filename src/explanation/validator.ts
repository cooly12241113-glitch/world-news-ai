import type { BriefingContract } from "../briefing";
import type { EvidenceContextPackage } from "../context";
import { createSemanticFingerprint } from "../briefing";
import { explanationPlanSemanticFingerprint } from "./fingerprint";
import type {
  ExplanationPlanDraft,
  ExplanationPlanErrorCode,
  ExplanationPlanValidationIssue,
  ExplanationPlanValidationResult,
  ExplanationStep,
  ValidatedExplanationPlan,
} from "./models";
import { ExplanationPlanSchema } from "./validation";
import type { PersonalizedImpactPlanningContext } from "../personalization";

export class ExplanationPlanValidator {
  validate(
    draft: unknown,
    contract: BriefingContract,
    contextPackage: EvidenceContextPackage,
    personalizedImpact?: PersonalizedImpactPlanningContext,
  ): ExplanationPlanValidationResult {
    const parsed = ExplanationPlanSchema.safeParse(draft);
    if (!parsed.success) {
      const issues: ExplanationPlanValidationIssue[] = parsed.error.issues.map((issue) => ({
        code: "INVALID_EXPLANATION_PLAN",
        severity: "error",
        path: issue.path.join("."),
        message: issue.message,
      }));
      return this.result("invalid", issues);
    }
    const plan = parsed.data;
    const issues: ExplanationPlanValidationIssue[] = [];
    const add = (
      code: ExplanationPlanErrorCode,
      message: string,
      path: string,
      severity: ExplanationPlanValidationIssue["severity"] = "error",
      related?: Partial<ExplanationPlanValidationIssue>,
    ) => issues.push({ code, severity, path, message, ...related });

    if (contract.status !== "ready") add("CONTRACT_NOT_READY", "Contract must be ready.", "contract.status");
    if (plan.questionId !== contract.questionId || contextPackage.questionId !== contract.questionId) {
      add("QUESTION_REFERENCE_MISMATCH", "Question references do not match.", "questionId");
    }
    if (plan.contractId !== contract.id || contextPackage.contractId !== contract.id) {
      add("CONTRACT_REFERENCE_MISMATCH", "Contract references do not match.", "contractId");
    }
    if (plan.contextPackageId !== contextPackage.id) {
      add("CONTEXT_REFERENCE_MISMATCH", "Context package reference does not match.", "contextPackageId");
    }
    if (plan.contractFingerprint !== contract.semanticFingerprint) {
      add("CONTRACT_REFERENCE_MISMATCH", "Contract fingerprint does not match.", "contractFingerprint");
    }
    if (plan.contextPackageFingerprint !== contextPackage.fingerprint) {
      add("CONTEXT_REFERENCE_MISMATCH", "Context fingerprint does not match.", "contextPackageFingerprint");
    }
    this.validatePersonalImpact(plan, personalizedImpact, add);

    const sectionIds = new Set<string>();
    const stepIds = new Set<string>();
    const steps = plan.sections.flatMap(({ steps }) => steps);
    const orders = new Set<number>();
    for (const section of plan.sections) {
      if (sectionIds.has(section.id)) add("DUPLICATE_PLAN_ID", "Duplicate section ID.", "sections", "error", { relatedSectionId: section.id });
      sectionIds.add(section.id);
      if (orders.has(section.order)) add("INVALID_SECTION_ORDER", "Section order must be unique.", "sections", "error", { relatedSectionId: section.id });
      orders.add(section.order);
      const stepOrders = new Set<number>();
      for (const step of section.steps) {
        if (stepIds.has(step.id)) add("DUPLICATE_PLAN_ID", "Duplicate step ID.", "sections.steps", "error", { relatedStepId: step.id });
        stepIds.add(step.id);
        if (step.sectionId !== section.id) add("INVALID_EXPLANATION_PLAN", "Step section reference does not match.", "sections.steps.sectionId", "error", { relatedStepId: step.id });
        if (stepOrders.has(step.order)) add("INVALID_STEP_ORDER", "Step order must be unique within a section.", "sections.steps.order", "error", { relatedStepId: step.id });
        stepOrders.add(step.order);
      }
    }
    const sortedOrders = [...orders].sort((a, b) => a - b);
    if (sortedOrders.some((order, index) => order !== index)) {
      add("INVALID_SECTION_ORDER", "Section order must be contiguous from zero.", "sections.order");
    }
    if (contract.explanationPolicy.directAnswerFirst && plan.sections[0]?.kind !== "direct-answer") {
      add("INVALID_SECTION_ORDER", "Direct answer must be the first section.", "sections.0");
    }
    for (const required of contract.sectionPolicy.orderedSections) {
      if (!plan.sections.some(({ sourceContractSection }) => sourceContractSection === required)) {
        add("MISSING_REQUIRED_SECTION", `Required contract section is missing: ${required}`, "sections");
      }
    }
    this.validateDependencies(steps, add);
    this.validateBindings(plan, contextPackage, add);
    this.validateEpistemics(steps, contextPackage, add);
    this.validateVisuals(plan, contract, contextPackage, add);

    if (steps.length > contract.stopConditions.maximumEvidenceItems) {
      add("STOP_CONDITION_EXCEEDED", "Maximum total steps exceeded.", "sections.steps");
    }
    const causalSteps = steps.filter(({ kind }) =>
      ["identify-trigger", "explain-mechanism", "trace-impact-channel"].includes(kind));
    if (causalSteps.length > contract.stopConditions.maximumCausalSteps) {
      add("STOP_CONDITION_EXCEEDED", "Maximum causal steps exceeded.", "sections.steps");
    }
    if (contract.uncertaintyPolicy.requireKnownUnknowns &&
        !plan.sections.some(({ kind }) => kind === "uncertainty")) {
      add("UNCERTAINTY_REQUIREMENT_MISSING", "An uncertainty section is required.", "sections");
    }
    if (contextPackage.evidenceGaps.some(({ blocking }) => blocking)) {
      add("CONTEXT_PACKAGE_NOT_READY", "Blocking evidence gaps remain explicit.", "contextPackage.evidenceGaps", "warning");
    }

    const errors = issues.filter(({ severity }) => severity === "error");
    if (errors.length > 0) return this.result("invalid", issues);
    if (contextPackage.status === "insufficient-evidence" || contextPackage.status === "no-relevant-context") {
      return this.result("insufficient-context", issues);
    }
    const validated: ValidatedExplanationPlan = {
      ...plan,
      status: "validated",
      fingerprint: explanationPlanSemanticFingerprint(plan),
    };
    return {
      outcome: issues.some(({ severity }) => severity === "warning") ? "valid-with-warnings" : "valid",
      plan: validated,
      issues,
      fingerprint: validated.fingerprint,
    };
  }

  private validatePersonalImpact(
    plan: ExplanationPlanDraft,
    planning: PersonalizedImpactPlanningContext | undefined,
    add: (code: ExplanationPlanErrorCode, message: string, path: string, severity?: "error" | "warning" | "info", related?: Partial<ExplanationPlanValidationIssue>) => void,
  ): void {
    const steps = plan.sections.flatMap(({ steps }) => steps);
    const bound = steps.filter(({ personalImpactBindings }) => personalImpactBindings !== undefined);
    if (bound.length === 0) {
      if (plan.personalContextFingerprint || plan.personalizedImpactAnalysisFingerprint) {
        add("PERSONAL_IMPACT_LINEAGE_MISMATCH", "Personal impact lineage requires a bound step.", "personalizedImpactAnalysisFingerprint");
      }
      return;
    }
    if (!planning ||
        plan.personalContextFingerprint !== planning.personalContextFingerprint ||
        plan.personalizedImpactAnalysisFingerprint !== planning.analysisFingerprint ||
        plan.contextPackageFingerprint !== planning.evidenceContextFingerprint) {
      add("PERSONAL_IMPACT_LINEAGE_MISMATCH", "Personal impact lineage does not match the validated planning context.", "personalizedImpactAnalysisFingerprint");
      return;
    }
    const exposures = new Set(planning.exposures.map(({ exposureId }) => exposureId));
    const channels = new Map(planning.channels.map((channel) => [channel.channelId, channel]));
    const assessments = new Set(planning.assessments.map(({ assessmentId }) => assessmentId));
    const scenarios = new Set(planning.scenarios.map(({ scenarioId }) => scenarioId));
    for (const step of bound) {
      const binding = step.personalImpactBindings!;
      if (binding.analysisFingerprint !== planning.analysisFingerprint ||
          binding.exposureIds.some((id) => !exposures.has(id)) ||
          binding.impactChannelIds.some((id) => !channels.has(id)) ||
          binding.impactAssessmentIds.some((id) => !assessments.has(id)) ||
          binding.scenarioIds.some((id) => !scenarios.has(id))) {
        add("PERSONAL_IMPACT_REFERENCE_INVALID", "Personal impact binding contains a foreign reference.", "personalImpactBindings", "error", { relatedStepId: step.id });
      }
      if (binding.scenarioIds.length > 0 &&
          (step.epistemicPolicy.preferredType !== "forecast" || !step.epistemicPolicy.requireAssumptions)) {
        add("FORECAST_ASSUMPTION_MISSING", "Scenario-bound steps require forecast posture and assumptions.", "epistemicPolicy", "error", { relatedStepId: step.id });
      }
      const hasUnknown = binding.impactChannelIds.some((id) => channels.get(id)?.relation === "unknown");
      if (hasUnknown && step.epistemicPolicy.preferredType !== "unknown") {
        add("UNSUPPORTED_FACT_PROMOTION", "Unknown impact channels require unknown epistemic posture.", "epistemicPolicy.preferredType", "error", { relatedStepId: step.id });
      }
    }
  }

  private result(
    outcome: "invalid" | "insufficient-context",
    issues: ExplanationPlanValidationIssue[],
  ): ExplanationPlanValidationResult {
    return { outcome, issues, fingerprint: createSemanticFingerprint(issues) };
  }

  private validateDependencies(
    steps: ExplanationStep[],
    add: (code: ExplanationPlanErrorCode, message: string, path: string, severity?: "error" | "warning" | "info", related?: Partial<ExplanationPlanValidationIssue>) => void,
  ): void {
    const byId = new Map(steps.map((step) => [step.id, step]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (step: ExplanationStep): void => {
      if (visiting.has(step.id)) {
        add("STEP_DEPENDENCY_CYCLE", "Step dependency graph contains a cycle.", "dependencyStepIds", "error", { relatedStepId: step.id });
        return;
      }
      if (visited.has(step.id)) return;
      visiting.add(step.id);
      for (const dependencyId of step.dependencyStepIds) {
        if (dependencyId === step.id) {
          add("STEP_DEPENDENCY_CYCLE", "A step cannot depend on itself.", "dependencyStepIds", "error", { relatedStepId: step.id });
          continue;
        }
        const dependency = byId.get(dependencyId);
        if (!dependency) {
          add("INVALID_EXPLANATION_PLAN", "Dependency step does not exist.", "dependencyStepIds", "error", { relatedStepId: step.id });
        } else {
          visit(dependency);
        }
      }
      visiting.delete(step.id);
      visited.add(step.id);
    };
    for (const step of steps) visit(step);
  }

  private validateBindings(
    plan: ExplanationPlanDraft,
    context: EvidenceContextPackage,
    add: (code: ExplanationPlanErrorCode, message: string, path: string, severity?: "error" | "warning" | "info", related?: Partial<ExplanationPlanValidationIssue>) => void,
  ): void {
    const items = new Map(context.selectedItems.map((item) => [item.id, item]));
    const excerpts = new Set(context.excerpts.map(({ id }) => id));
    const provenance = new Map(context.provenanceIndex.map((record) => [record.provenanceId, record]));
    for (const section of plan.sections) for (const step of section.steps) {
      if (step.epistemicPolicy.evidenceRequirement === "required" && step.evidenceBindings.length === 0) {
        add("MISSING_EVIDENCE_BINDING", "This step requires evidence.", "evidenceBindings", "error", { relatedSectionId: section.id, relatedStepId: step.id });
      }
      for (const binding of step.evidenceBindings) {
        const item = items.get(binding.contextItemId);
        if (!item) {
          add("BROKEN_CONTEXT_REFERENCE", "Context item does not exist.", "evidenceBindings.contextItemId", "error", { relatedStepId: step.id, relatedContextItemId: binding.contextItemId });
          continue;
        }
        if (binding.excerptIds.some((id) => !excerpts.has(id))) {
          add("BROKEN_CONTEXT_REFERENCE", "Excerpt does not exist.", "evidenceBindings.excerptIds", "error", { relatedStepId: step.id });
        }
        for (const id of binding.provenanceRecordIds) {
          const record = provenance.get(id);
          if (!record || record.contextItemId !== item.id ||
              (record.sourceDocumentId && !binding.sourceDocumentIds.includes(record.sourceDocumentId))) {
            add("BROKEN_PROVENANCE_REFERENCE", "Provenance chain is broken.", "evidenceBindings.provenanceRecordIds", "error", { relatedStepId: step.id, relatedContextItemId: item.id });
          }
        }
        if (binding.usage === "supports" && item.contradictsClaimIds.length > 0) {
          add("BROKEN_CONTEXT_REFERENCE", "Contradicting evidence cannot be bound as support.", "evidenceBindings.usage", "error", { relatedStepId: step.id });
        }
        if (binding.usage === "quantifies" && binding.dataPointIds.length === 0) {
          add("MISSING_EVIDENCE_BINDING", "Quantitative binding requires a DataPoint.", "evidenceBindings.dataPointIds", "error", { relatedStepId: step.id });
        }
      }
    }
  }

  private validateEpistemics(
    steps: ExplanationStep[],
    context: EvidenceContextPackage,
    add: (code: ExplanationPlanErrorCode, message: string, path: string, severity?: "error" | "warning" | "info", related?: Partial<ExplanationPlanValidationIssue>) => void,
  ): void {
    const gapIds = new Set(context.evidenceGaps.map(({ id }) => id));
    for (const step of steps) {
      const policy = step.epistemicPolicy;
      if (!policy.allowedTypes.includes(policy.preferredType) ||
          step.outputRequirement.allowedEpistemicTypes.some((type) => !policy.allowedTypes.includes(type))) {
        add("UNSUPPORTED_EPISTEMIC_TYPE", "Output and epistemic policies are inconsistent.", "epistemicPolicy", "error", { relatedStepId: step.id });
      }
      if (policy.preferredType === "confirmed-fact" &&
          policy.evidenceRequirement === "required" && step.evidenceBindings.length === 0) {
        add("MISSING_EVIDENCE_BINDING", "Confirmed facts require evidence.", "evidenceBindings", "error", { relatedStepId: step.id });
      }
      if (policy.preferredType === "attributed-claim" &&
          policy.evidenceRequirement === "required" &&
          !step.evidenceBindings.some(({ claimIds }) => claimIds.length > 0)) {
        add("MISSING_EVIDENCE_BINDING", "Attributed claims require a Claim reference.", "evidenceBindings.claimIds", "error", { relatedStepId: step.id });
      }
      if (policy.preferredType === "forecast" && !policy.requireAssumptions) {
        add("FORECAST_ASSUMPTION_MISSING", "Forecast steps must require assumptions.", "epistemicPolicy.requireAssumptions", "error", { relatedStepId: step.id });
      }
      if (policy.preferredType === "unknown" &&
          !step.evidenceBindings.some((binding) =>
            binding.usage === "exposes-gap" && gapIds.has(binding.contextItemId))) {
        add("UNCERTAINTY_REQUIREMENT_MISSING", "Unknown steps must identify an evidence gap.", "evidenceBindings", "warning", { relatedStepId: step.id });
      }
      if (!policy.prohibitFactPromotion) {
        add("UNSUPPORTED_FACT_PROMOTION", "Every step must prohibit unsupported fact promotion.", "epistemicPolicy.prohibitFactPromotion", "error", { relatedStepId: step.id });
      }
    }
  }

  private validateVisuals(
    plan: ExplanationPlanDraft,
    contract: BriefingContract,
    context: EvidenceContextPackage,
    add: (code: ExplanationPlanErrorCode, message: string, path: string, severity?: "error" | "warning" | "info", related?: Partial<ExplanationPlanValidationIssue>) => void,
  ): void {
    const visuals = [...plan.requiredVisualIntents, ...plan.sections.flatMap(({ visualIntents }) => visualIntents)];
    if (visuals.length > contract.visualPolicy.maximumScenes) {
      add("STOP_CONDITION_EXCEEDED", "Maximum visual scenes exceeded.", "visualIntents");
    }
    const dataIds = new Set(context.selectedItems.flatMap(({ dataPointIds }) => dataPointIds));
    for (const visual of visuals) {
      if (!contract.visualPolicy.allowedModes.includes(visual.mode)) {
        add("UNSUPPORTED_VISUAL_MODE", "Visual mode is not allowed by the contract.", "visualIntents.mode");
      }
      if (contract.visualPolicy.mapUsage === "disabled" && ["map", "map-flow"].includes(visual.mode)) {
        add("VISUAL_POLICY_VIOLATION", "Map use is disabled.", "visualIntents.mode");
      }
      if (contract.visualPolicy.mapUsage === "optional" && visual.requiredness === "required" &&
          ["map", "map-flow"].includes(visual.mode)) {
        add("VISUAL_POLICY_VIOLATION", "Optional map policy cannot be escalated to required.", "visualIntents.requiredness");
      }
      if (contract.visualPolicy.requireVisualJustification && visual.justification.trim() === "") {
        add("VISUAL_POLICY_VIOLATION", "Visual justification is required.", "visualIntents.justification");
      }
      if (visual.mode === "chart" && !visual.dataPointIds.some((id) => dataIds.has(id))) {
        add("VISUAL_POLICY_VIOLATION", "Chart intent requires a context DataPoint.", "visualIntents.dataPointIds");
      }
      if (visual.mode === "personalized-impact" && !contract.personalizationPolicy.enabled) {
        add("PERSONALIZATION_POLICY_VIOLATION", "Personalized visual requires enabled personalization.", "visualIntents.mode");
      }
    }
  }
}
