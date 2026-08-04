import { createSemanticFingerprint } from "../briefing";
import type { ExplanationPlanSection, ExplanationStep, ExplanationVisualIntent } from "../explanation";
import { briefingScriptFingerprint } from "./fingerprint";
import type {
  BriefingScene, BriefingScriptBuildResult, BriefingScriptCompileInput,
  BriefingScriptDraft, CameraIntent, SceneContentBinding, SceneKind,
  SceneVisualDirective,
} from "./models";
import { BriefingPresentationPreferenceSchema, BriefingScriptSchema } from "./validation";
import { BriefingScriptValidator } from "./validator";

export class RuleBasedBriefingScriptCompiler {
  readonly id = "rule-based-briefing-script-compiler";
  readonly version = "1.0.0";
  readonly policyVersion = "script-policy-v1";
  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly validator = new BriefingScriptValidator(),
  ) {}

  compile(input: BriefingScriptCompileInput): BriefingScriptBuildResult {
    const preference = BriefingPresentationPreferenceSchema.safeParse(input.preference);
    if (!preference.success) return failure("PRESENTATION_PREFERENCE_INVALID", "preference", preference.error.message);
    const { plan, contract, contextPackage: context } = input;
    if (plan.status !== "validated") return failure("PLAN_NOT_VALIDATED", "input");
    if (plan.questionId !== contract.questionId || plan.contractId !== contract.id ||
        plan.contextPackageId !== context.id || context.contractId !== contract.id) {
      return failure("SCRIPT_REFERENCE_MISMATCH", "input");
    }
    if (context.status === "insufficient-evidence" || context.status === "no-relevant-context" ||
        plan.coverage.blockingGaps.length > 0) {
      return { success: true, outcome: "insufficient-context", reasons: ["Validated inputs contain blocking context gaps."] };
    }
    try {
      const staticOnly = ["static", "reduced-motion"].includes(preference.data.mode);
      const maximumMiddleScenes = Math.max(0, contract.stopConditions.maximumScenes - 2);
      const sectionGroups = groupSections(plan.sections, maximumMiddleScenes);
      const middle = sectionGroups.map((sections, index) =>
        this.scene(sections, index + 1, input, preference.data.mode));
      const scenes = [
        this.boundaryScene("opening", 0, input),
        ...middle,
        this.boundaryScene("closing", middle.length + 1, input),
      ];
      for (let index = 1; index < scenes.length; index += 1) {
        scenes[index]!.dependsOnSceneIds = [scenes[index - 1]!.id];
      }
      const allSteps = plan.sections.flatMap(({ steps }) => steps);
      const coveredSteps = new Set(middle.flatMap(({ sourceStepIds }) => sourceStepIds));
      const evidenceSteps = allSteps.filter(({ evidenceBindings }) => evidenceBindings.length > 0);
      const citedSteps = new Set(middle.flatMap(({ citationCues }) => citationCues)
        .flatMap((cue) => middle.flatMap(({ contentBindings }) => contentBindings)
          .filter((binding) => cue.contextItemIds.some((id) => binding.contextItemIds.includes(id)))
          .map(({ planStepId }) => planStepId)));
      const coverageValues = [
        plan.sections.length / Math.max(1, plan.sections.length),
        coveredSteps.size / Math.max(1, allSteps.length),
        evidenceSteps.length === 0 ? 1 : citedSteps.size / evidenceSteps.length,
      ];
      const draft: BriefingScriptDraft = {
        id: stableId("script", plan.fingerprint), questionId: plan.questionId,
        contractId: contract.id, contextPackageId: context.id, explanationPlanId: plan.id,
        contractFingerprint: contract.semanticFingerprint,
        contextPackageFingerprint: context.fingerprint,
        explanationPlanFingerprint: plan.fingerprint, scriptVersion: "briefing-script-v1",
        ...(input.personalizedImpactPlanningContext ? {
          personalContextFingerprint:
            input.personalizedImpactPlanningContext.personalContextFingerprint,
          personalizedImpactAnalysisFingerprint:
            input.personalizedImpactPlanningContext.analysisFingerprint,
          personalizedImpactPlanningContext: input.personalizedImpactPlanningContext,
        } : {}),
        compiler: { type: "rule", id: this.id, version: this.version, policyVersion: this.policyVersion },
        presentationPreference: preference.data,
        status: staticOnly ? "static-only" : "draft",
        titleRequirement: "Describe the bounded briefing topic without asserting a conclusion.",
        opening: {
          objective: "Establish scope, evidence posture, and briefing structure.",
          establishesScope: true, requiredContextItemIds: middle[0]?.contentBindings.flatMap(({ contextItemIds }) => contextItemIds) ?? [],
          requiredPlanStepIds: plan.sections[0]?.steps.map(({ id }) => id) ?? [],
          layoutIntent: "Reserve the primary visual and bottom composer safe viewport.",
          narrationRequirement: preference.data.narrationPolicy === "disabled" ? "disabled" : "preferred",
          captionRequirement: preference.data.captionPolicy === "disabled" ? "disabled" : "required",
          sourceCueIds: middle[0]?.citationCues.map(({ id }) => id) ?? [], warnings: [],
        },
        scenes,
        closing: {
          objective: "Separate supported content, uncertainty, verification signals, sources, and follow-up.",
          summaryStepIds: allSteps.filter(({ kind }) => ["state-direct-answer", "establish-current-state"].includes(kind)).map(({ id }) => id),
          uncertaintyStepIds: allSteps.filter(({ uncertaintyRequirement }) => uncertaintyRequirement === "required").map(({ id }) => id),
          verificationSignalStepIds: allSteps.filter(({ kind }) => kind === "identify-verification-signal").map(({ id }) => id),
          requiredContextItemIds: [...new Set(middle.flatMap(({ contentBindings }) => contentBindings).flatMap(({ contextItemIds }) => contextItemIds))],
          sourceCueIds: middle.flatMap(({ citationCues }) => citationCues.map(({ id }) => id)),
          returnViewIntent: staticOnly ? "none" : "overview",
          followUpPolicy: "offer-current-scene-context", warnings: [],
        },
        playbackPolicy: {
          autoplay: false, userInitiated: true,
          controls: ["pause", "resume", "previous", "next", "jump", "speed", "disable-animation"],
          composerDuringPlayback: "playback-controls", restoreComposerAfterPlayback: true,
        },
        interactionPolicy: {
          pauseOnComposerFocus: true, pauseOnManualMapInteraction: true,
          preserveUserView: true, resumeScriptCameraOnlyOnUserAction: true,
          sourceOpenPolicy: "pause", followUpContext: "current-scene",
        },
        accessibilityPolicy: {
          ...preference.data.accessibilityPolicy, captionsAvailable: true,
          staticFallbackAvailable: true,
        },
        coverage: {
          overall: coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length,
          planSectionCoverage: 1, planStepCoverage: coveredSteps.size / Math.max(1, allSteps.length),
          evidenceCoverage: evidenceSteps.length / Math.max(1, allSteps.length),
          citationCoverage: evidenceSteps.length === 0 ? 1 : citedSteps.size / evidenceSteps.length,
          uncertaintyCoverage: Number(middle.some(({ kind }) => kind === "uncertainty")),
          visualCoverage: middle.some(({ visualDirectives }) => visualDirectives.length) ? 1 : 0,
          accessibilityCoverage: 1, staticFallbackCoverage: 1, interactionCoverage: 1,
          missingRequirements: allSteps.filter(({ optional, id }) => !optional && !coveredSteps.has(id)).map(({ id }) => id),
          blockingGaps: context.evidenceGaps.filter(({ blocking }) => blocking).map(({ id }) => id),
        },
        warnings: [...plan.warnings], createdAt: this.now().toISOString(), fingerprint: "pending",
      };
      draft.fingerprint = briefingScriptFingerprint(draft);
      const schema = BriefingScriptSchema.safeParse(draft);
      if (!schema.success) return failure("SCRIPT_SCHEMA_INVALID", "schema", schema.error.message);
      const validation = this.validator.validate(
        schema.data,
        plan,
        contract,
        context,
        input.personalizedImpactPlanningContext,
      );
      if (!("script" in validation)) return failure("SCRIPT_VALIDATION_FAILED", "validation");
      return {
        success: true,
        outcome: validation.outcome === "static-only" ? "validated-static-script"
          : validation.outcome === "valid-with-warnings" ? "partial-script" : "validated-script",
        script: validation.script, validation, warnings: validation.script.warnings,
      };
    } catch (error) {
      return failure("SCRIPT_ASSEMBLY_FAILED", "assembly", error instanceof Error ? error.message : undefined);
    }
  }

  private boundaryScene(kind: "opening" | "closing", order: number, input: BriefingScriptCompileInput): BriefingScene {
    return this.baseScene(
      stableId("scene", `${input.plan.fingerprint}:${kind}`),
      kind,
      order,
      [],
      [],
      input,
      [],
      [],
      kind === "opening"
        ? "Frame the policy question and evidence boundary."
        : "Return to the evidence boundary and invite a follow-up.",
    );
  }

  private scene(
    sections: ExplanationPlanSection[], order: number,
    input: BriefingScriptCompileInput, mode: BriefingScriptCompileInput["preference"]["mode"],
  ): BriefingScene {
    const steps = sections.flatMap(({ steps }) => steps);
    const bindings = sections.flatMap((section) =>
      section.steps.flatMap((step) => step.evidenceBindings.map((binding, bindingIndex) =>
        this.binding(section, step, binding, bindingIndex, input))));
    const visuals = sections.flatMap(({ visualIntents }) => visualIntents)
      .map((visual) => this.visual(visual, mode, bindings));
    const primary = sections[0]!;
    const personalizedKind: SceneKind | undefined = steps.some(
      ({ personalImpactBindings }) => (personalImpactBindings?.scenarioIds.length ?? 0) > 0,
    ) ? "scenario" : steps.some(
      ({ personalImpactBindings }) => (personalImpactBindings?.impactChannelIds.length ?? 0) > 0,
    ) ? "impact-path" : undefined;
    return this.baseScene(
      stableId("scene", `${input.plan.fingerprint}:${sections.map(({ id }) => id).join(":")}`),
      personalizedKind ?? sceneKind(primary.kind, input.plan.answerStrategy), order,
      sections.map(({ id }) => id), steps.map(({ id }) => id), input, bindings, visuals,
      primary.objective,
      steps,
    );
  }

  private baseScene(
    id: string, kind: SceneKind, order: number, sectionIds: string[], stepIds: string[],
    input: BriefingScriptCompileInput, bindings: SceneContentBinding[],
    visuals: SceneVisualDirective[] = [], objective = `Define the ${kind} scene requirement.`,
    steps: ExplanationStep[] = [],
  ): BriefingScene {
    const contextIds = [...new Set(bindings.flatMap(({ contextItemIds }) => contextItemIds))];
    const staticMode = ["static", "reduced-motion"].includes(input.preference.mode);
    return {
      id, kind, order, titleRequirement: `Provide a concise ${kind} scene label.`,
      objective, sourceSectionIds: sectionIds, sourceStepIds: stepIds,
      dependsOnSceneIds: [], contentBindings: bindings, visualDirectives: visuals,
      ...(steps.some(({ personalImpactBindings }) => personalImpactBindings) ? {
        personalImpactBindings: steps.flatMap((step) =>
          step.personalImpactBindings
            ? [{ planStepId: step.id, ...step.personalImpactBindings }]
            : []),
      } : {}),
      narrationDirective: {
        required: input.preference.narrationPolicy === "required",
        purpose: `Express the ${kind} requirements without storing final prose.`,
        outputType: narrationType(kind), maximumStatements: 3, maximumCharacters: 800,
        directness: kind === "direct-answer" ? "direct" : "qualified",
        allowedEpistemicTypes: [...new Set(steps.flatMap(({ epistemicPolicy }) => epistemicPolicy.allowedTypes))].length
          ? [...new Set(steps.flatMap(({ epistemicPolicy }) => epistemicPolicy.allowedTypes))]
          : ["interpretation"],
        requiresAttribution: steps.some(({ epistemicPolicy }) => epistemicPolicy.requireAttribution),
        requiresCitation: bindings.length > 0,
        requiresUncertaintyDisclosure: steps.some(({ uncertaintyRequirement }) => uncertaintyRequirement === "required"),
        requiresAssumptionDisclosure: steps.some(({ epistemicPolicy }) => epistemicPolicy.requireAssumptions),
        prohibitedBehaviors: ["invent-fact", "invent-source", "promote-claim-to-fact", "false-precision", "direct-buy-sell-command"],
        sourceStepIds: stepIds, contextItemIds: contextIds, warnings: [],
      },
      captionDirective: {
        required: input.preference.captionPolicy !== "disabled",
        purpose: "Provide a concise accessible scene label, not final prose.",
        maximumCharacters: 240, placement: "above-composer",
        avoidsComposerOverlap: true, mapOcclusionPolicy: "minimal",
        sourceStepIds: stepIds, warnings: [],
      },
      citationCues: bindings.map((binding) => ({
        id: stableId("citation", `${id}:${binding.id}`),
        contextItemIds: binding.contextItemIds, excerptIds: binding.excerptIds,
        provenanceRecordIds: binding.provenanceRecordIds,
        sourceDocumentIds: binding.sourceDocumentIds,
        displayPolicy: input.preference.sourceDisplayPolicy,
        attributionRequired: true, warnings: [],
      })),
      uncertaintyCues: kind === "uncertainty" ? [{
        id: stableId("uncertainty", id), planStepIds: stepIds,
        evidenceGapIds: input.contextPackage.evidenceGaps.map(({ id }) => id),
        disclosure: "explicit", blocking: input.contextPackage.evidenceGaps.some(({ blocking }) => blocking),
        warnings: [],
      }] : [],
      interactionDirectives: ["pause-on-composer-focus", "pause-on-manual-map-interaction", "preserve-user-view"],
      layoutDirective: {
        primaryRegion: visuals.some(({ mode }) => mode === "document") ? "document"
          : visuals.some(({ mode }) => mode === "comparison") ? "comparison"
            : visuals.length ? "visual" : "text",
        secondaryPanel: bindings.length ? "sources" : kind === "uncertainty" ? "uncertainty" : "none",
        mapDominance: visuals.some(({ mode }) => ["map", "map-flow"].includes(mode)) ? "primary" : "none",
        composerState: order === 0 ? "collapsed" : "playback-controls",
        composerPosition: "bottom-center",
        safeViewport: {
          reserveBottomComposer: true, reservePlaybackControls: true,
          reserveCaptionArea: true, reserveSidePanel: bindings.length > 0,
          mobileSafeAreaRequired: true, preservePrimaryVisualFocus: true,
          insetIntent: "balanced",
        },
      },
      timingIntent: { pace: input.preference.playbackSpeed, hold: "standard", userAdvanceAllowed: true },
      transitionIntent: {
        style: staticMode ? "none" : input.preference.animationPolicy === "minimal" ? "minimal" : "continuous",
        preserveUserView: true, requiresMotionPlanner: !staticMode && visuals.some(({ mode }) => ["map", "map-flow"].includes(mode)),
      },
      optional: false, warnings: [],
    };
  }

  private binding(
    section: ExplanationPlanSection, step: ExplanationStep,
    binding: ExplanationStep["evidenceBindings"][number], index: number,
    input: BriefingScriptCompileInput,
  ): SceneContentBinding {
    const contextItem = input.contextPackage.selectedItems.find(({ id }) =>
      id === binding.contextItemId);
    return {
      id: stableId("binding", `${step.id}:${index}`),
      planSectionId: section.id, planStepId: step.id,
      contextItemIds: [binding.contextItemId], excerptIds: binding.excerptIds,
      provenanceRecordIds: binding.provenanceRecordIds,
      sourceDocumentIds: binding.sourceDocumentIds, claimIds: binding.claimIds,
      evidenceLinkIds: binding.evidenceLinkIds, dataPointIds: binding.dataPointIds,
      entityIds: binding.entityIds, locationIds: contextItem?.locationIds ?? [],
      usage: binding.usage === "supports" ? "support"
        : binding.usage === "contradicts" ? "contradict"
          : binding.usage === "quantifies" ? "quantify"
            : binding.usage === "supplies-assumption" ? "supply-assumption"
              : binding.usage === "supplies-verification-signal" ? "supply-verification-signal"
                : binding.usage === "exposes-gap" ? "expose-uncertainty" : "contextualize",
      required: binding.required, warnings: binding.warnings,
    };
  }

  private visual(
    visual: ExplanationVisualIntent,
    mode: BriefingScriptCompileInput["preference"]["mode"],
    bindings: SceneContentBinding[],
  ): SceneVisualDirective {
    const staticMode = ["static", "reduced-motion"].includes(mode);
    const actualMode = mode === "static" ? "text" : visual.mode;
    const camera = cameraIntent(visual, staticMode);
    const sourceDocumentIds = [...new Set(bindings.flatMap((binding) => binding.sourceDocumentIds))];
    const excerptIds = [...new Set(bindings.flatMap((binding) => binding.excerptIds))];
    const claimIds = [...new Set(bindings.flatMap((binding) => binding.claimIds))];
    return {
      id: stableId("visual", visual.id), mode: actualMode,
      purpose: visual.purpose, requiredness: visual.requiredness,
      sourceVisualIntentId: visual.id, contextItemIds: visual.contextItemIds,
      entityIds: visual.entityIds, locationIds: visual.locationIds,
      dataPointIds: visual.dataPointIds, ...(visual.timeRange ? { timeRange: visual.timeRange } : {}),
      cameraIntent: camera,
      ...(["map", "map-flow"].includes(actualMode) ? {
        overlayIntent: {
          overlayTypes: actualMode === "map-flow" ? ["directional-flow"] : ["marker"],
          entityIds: visual.entityIds, locationIds: visual.locationIds,
          routeBindings: [], networkBindings: [], emphasis: "primary",
          declutterPolicy: "automatic", labelPolicy: "essential-only",
          sourceCueIds: [], warnings: [],
        },
      } : {}),
      ...(actualMode === "chart" ? {
        chartIntent: {
          chartPurpose: visual.purpose, dataPointIds: visual.dataPointIds,
          comparisonEntityIds: visual.entityIds, ...(visual.timeRange ? { timeRange: visual.timeRange } : {}),
          preferredForm: "auto", scalePolicy: "auto",
          uncertaintyDisplay: "preferred", annotationRequirements: [],
          fallbackMode: visual.fallbackMode, warnings: [],
        },
      } : {}),
      ...(actualMode === "document" ? {
        documentIntent: {
          sourceDocumentIds, excerptIds, claimIds,
          displayPurpose: "show-primary-source", emphasisTargets: [],
          attributionRequired: true, fallbackMode: visual.fallbackMode, warnings: [],
        },
      } : {}),
      fallbackMode: visual.fallbackMode, accessibilityFallback: "static", warnings: visual.warnings,
    };
  }
}

function cameraIntent(visual: ExplanationVisualIntent, disabled: boolean): CameraIntent {
  if (disabled || !["map", "map-flow"].includes(visual.mode)) return {
    action: "no-camera-motion", targetLocationIds: visual.locationIds,
    targetEntityIds: visual.entityIds, framing: "current", spatialRelationship: "none",
    motionPriority: "low", transitionPreference: "none", preserveSafeViewport: true,
    allowRotation: false, allowZoom: false, allowPan: false,
    fallbackAction: "no-camera-motion", warnings: [],
  };
  return {
    action: visual.mode === "map-flow" ? "trace-route"
      : visual.locationIds.length > 1 ? "compare-regions" : "focus-region",
    targetLocationIds: visual.locationIds, targetEntityIds: visual.entityIds,
    framing: visual.locationIds.length > 1 ? "multi-region" : "regional",
    spatialRelationship: visual.mode === "map-flow" ? "directional-flow"
      : visual.locationIds.length > 1 ? "comparison" : "single-focus",
    motionPriority: "normal", transitionPreference: "smooth",
    preserveSafeViewport: true, allowRotation: false, allowZoom: true, allowPan: true,
    fallbackAction: "hold-current-view", warnings: [],
  };
}
function sceneKind(kind: ExplanationPlanSection["kind"], strategy: string): SceneKind {
  if (kind === "direct-answer") return strategy === "trace-impact" ? "global-overview" : "direct-answer";
  if (kind === "current-situation") return strategy === "trace-impact" ? "global-overview" : "current-situation";
  if (kind === "necessary-background") return strategy === "trace-impact" ? "regional-focus" : "necessary-background";
  if (kind === "explanation-path") return strategy === "trace-impact" ? "impact-path" : "causal-step";
  if (kind === "supporting-evidence") return "supporting-evidence";
  if (kind === "contradicting-evidence") return "contradicting-evidence";
  if (kind === "comparison") return "comparison";
  if (kind === "claim-verification") return "claim-origin";
  if (kind === "scenarios") return "scenario";
  if (kind === "counter-factors") return "counter-factor";
  if (kind === "alternative-explanations") return "alternative-explanation";
  if (kind === "uncertainty") return "uncertainty";
  if (kind === "next-verification-signals") return "verification-signals";
  if (kind === "sources") return "source-review";
  return "supporting-evidence";
}
function narrationType(kind: SceneKind): BriefingScene["narrationDirective"]["outputType"] {
  if (kind === "opening") return "introduction";
  if (kind === "direct-answer") return "direct-answer";
  if (kind === "causal-step") return "causal-explanation";
  if (kind === "impact-path") return "impact-explanation";
  if (kind === "claim-origin") return "claim-assessment";
  if (kind === "comparison") return "comparison";
  if (kind === "scenario") return "scenario-explanation";
  if (kind === "uncertainty") return "uncertainty-disclosure";
  if (kind === "verification-signals") return "verification-signal";
  if (kind === "source-review" || kind === "closing") return "source-note";
  return "factual-summary";
}
function stableId(type: string, semantic: string) {
  return `${type}:${createSemanticFingerprint({ semantic }).slice(0, 24)}`;
}
function groupSections(
  sections: ExplanationPlanSection[],
  maximumGroups: number,
): ExplanationPlanSection[][] {
  if (sections.length === 0 || maximumGroups === 0) return [];
  const groupCount = Math.min(sections.length, maximumGroups);
  const groups: ExplanationPlanSection[][] = Array.from(
    { length: groupCount },
    () => [],
  );
  sections.forEach((section, index) => {
    groups[Math.floor(index * groupCount / sections.length)]!.push(section);
  });
  return groups;
}
function failure(code: Parameters<typeof scriptError>[0], stage: string, details?: string): BriefingScriptBuildResult {
  return { success: false, error: scriptError(code, stage, details) };
}
function scriptError(code: import("./models").ScriptErrorCode, stage: string, details?: string) {
  return { code, stage, retryable: false as const, ...(details ? { details } : {}) };
}
