import { createSemanticFingerprint } from "../briefing";
import type { BriefingContract } from "../briefing";
import type { EvidenceContextPackage } from "../context";
import type { ValidatedExplanationPlan } from "../explanation";
import { briefingScriptFingerprint } from "./fingerprint";
import type {
  BriefingScriptDraft, BriefingScriptValidationIssue,
  BriefingScriptValidationResult, ScriptErrorCode, ValidatedBriefingScript,
} from "./models";
import { BriefingScriptSchema } from "./validation";

export class BriefingScriptValidator {
  validate(
    draft: unknown, plan: ValidatedExplanationPlan,
    contract: BriefingContract, context: EvidenceContextPackage,
  ): BriefingScriptValidationResult {
    const parsed = BriefingScriptSchema.safeParse(draft);
    if (!parsed.success) return invalid(parsed.error.issues.map((issue) => ({
      code: "SCRIPT_SCHEMA_INVALID", severity: "error",
      path: issue.path.join("."), message: issue.message,
    })));
    const script = parsed.data;
    const issues: BriefingScriptValidationIssue[] = [];
    const add = (code: ScriptErrorCode, message: string, path: string,
      severity: BriefingScriptValidationIssue["severity"] = "error",
      related: Partial<BriefingScriptValidationIssue> = {}) =>
      issues.push({ code, message, path, severity, ...related });
    if (script.questionId !== plan.questionId || script.contractId !== contract.id ||
        script.contextPackageId !== context.id || script.explanationPlanId !== plan.id ||
        script.contractFingerprint !== contract.semanticFingerprint ||
        script.contextPackageFingerprint !== context.fingerprint ||
        script.explanationPlanFingerprint !== plan.fingerprint) {
      add("SCRIPT_REFERENCE_MISMATCH", "Script identity or fingerprint does not match input.", "identity");
    }
    const sceneIds = new Set<string>(); const orders = new Set<number>();
    for (const scene of script.scenes) {
      if (sceneIds.has(scene.id)) add("DUPLICATE_SCENE_ID", "Scene ID must be unique.", "scenes", "error", { relatedSceneId: scene.id });
      sceneIds.add(scene.id);
      if (orders.has(scene.order)) add("INVALID_SCENE_ORDER", "Scene order must be unique.", "scenes.order", "error", { relatedSceneId: scene.id });
      orders.add(scene.order);
    }
    const ordered = [...orders].sort((a, b) => a - b);
    if (ordered.some((order, index) => order !== index)) add("INVALID_SCENE_ORDER", "Scene order must be contiguous from zero.", "scenes.order");
    if (script.scenes[0]?.kind !== "opening" || script.scenes.at(-1)?.kind !== "closing") {
      add("MISSING_REQUIRED_SCENE", "Opening must be first and closing last.", "scenes");
    }
    if (script.scenes.length > contract.stopConditions.maximumEvidenceItems) {
      add("STOP_CONDITION_EXCEEDED", "Scene budget exceeded.", "scenes");
    }
    this.dependencies(script, add);
    const sections = new Set(plan.sections.map(({ id }) => id));
    const stepById = new Map(plan.sections.flatMap(({ steps }) => steps).map((step) => [step.id, step]));
    const contextById = new Map(context.selectedItems.map((item) => [item.id, item]));
    const excerptIds = new Set(context.excerpts.map(({ id }) => id));
    const provenance = new Map(context.provenanceIndex.map((record) => [record.provenanceId, record]));
    const covered = new Set<string>();
    for (const scene of script.scenes) {
      if (scene.sourceSectionIds.some((id) => !sections.has(id)) ||
          scene.sourceStepIds.some((id) => !stepById.has(id))) {
        add("BROKEN_CONTENT_BINDING", "Scene references a missing plan section or step.", "scenes.sourceStepIds", "error", { relatedSceneId: scene.id });
      }
      scene.sourceStepIds.forEach((id) => covered.add(id));
      for (const binding of scene.contentBindings) {
        const step = stepById.get(binding.planStepId);
        if (!step || !sections.has(binding.planSectionId)) {
          add("BROKEN_CONTENT_BINDING", "Content binding references a missing plan item.", "contentBindings", "error", { relatedSceneId: scene.id });
          continue;
        }
        const planContextIds = new Set(step.evidenceBindings.map(({ contextItemId }) => contextItemId));
        for (const itemId of binding.contextItemIds) {
          const item = contextById.get(itemId);
          if (!item || !planContextIds.has(itemId)) add("BROKEN_CONTENT_BINDING", "Content exceeds the plan evidence boundary.", "contentBindings.contextItemIds", "error", { relatedSceneId: scene.id, relatedContextItemId: itemId });
        }
        if (binding.excerptIds.some((id) => !excerptIds.has(id))) add("BROKEN_CONTENT_BINDING", "Excerpt reference is broken.", "contentBindings.excerptIds", "error", { relatedSceneId: scene.id });
        for (const provenanceId of binding.provenanceRecordIds) {
          const record = provenance.get(provenanceId);
          if (!record || !binding.contextItemIds.includes(record.contextItemId)) {
            add("BROKEN_CONTENT_BINDING", "Provenance reference is broken.", "contentBindings.provenanceRecordIds", "error", { relatedSceneId: scene.id });
          }
        }
      }
      if (scene.contentBindings.length > 0 && scene.citationCues.length === 0) {
        add("BROKEN_CITATION_REFERENCE", "Evidence-bearing scenes require citation cues.", "citationCues", "error", { relatedSceneId: scene.id });
      }
      this.visuals(scene, plan, contract, script, add);
      if (scene.layoutDirective.composerPosition !== "bottom-center" ||
          !scene.layoutDirective.safeViewport.reserveBottomComposer ||
          !scene.layoutDirective.safeViewport.mobileSafeAreaRequired) {
        add("COMPOSER_POLICY_VIOLATION", "Bottom composer and mobile safe viewport are mandatory.", "layoutDirective", "error", { relatedSceneId: scene.id });
      }
      if (!scene.layoutDirective.safeViewport.preservePrimaryVisualFocus) {
        add("SAFE_VIEWPORT_POLICY_MISSING", "Safe viewport must preserve visual focus.", "layoutDirective.safeViewport", "error", { relatedSceneId: scene.id });
      }
    }
    for (const step of plan.sections.flatMap(({ steps }) => steps).filter(({ optional }) => !optional)) {
      if (!covered.has(step.id)) add("MISSING_PLAN_STEP_COVERAGE", "Required plan step is not represented.", "scenes.sourceStepIds", "error", { relatedPlanStepId: step.id });
    }
    if (script.playbackPolicy.autoplay || !script.playbackPolicy.userInitiated ||
        !script.interactionPolicy.pauseOnComposerFocus) {
      add("COMPOSER_POLICY_VIOLATION", "Playback must be user initiated and pause on composer focus.", "playbackPolicy");
    }
    const access = script.accessibilityPolicy;
    if (!access.staticFallbackAvailable || !access.keyboardNavigationRequired ||
        !access.screenReaderLabelsRequired || !access.colorIndependentMeaningRequired ||
        !access.captionsAvailable) {
      add("ACCESSIBILITY_REQUIREMENT_MISSING", "Accessibility policy is incomplete.", "accessibilityPolicy");
    }
    if (context.evidenceGaps.some(({ blocking }) => blocking)) {
      add("CONTEXT_PACKAGE_INVALID", "Blocking context gaps remain.", "context.evidenceGaps", "warning");
    }
    const errors = issues.filter(({ severity }) => severity === "error");
    if (errors.length) return invalid(issues);
    if (context.status === "insufficient-evidence" || context.status === "no-relevant-context") {
      return { outcome: "insufficient-context", issues, fingerprint: createSemanticFingerprint(issues) };
    }
    const staticOnly = ["static", "reduced-motion"].includes(script.presentationPreference.mode);
    const validated: ValidatedBriefingScript = {
      ...script, status: staticOnly ? "static-only" : "validated",
      fingerprint: briefingScriptFingerprint(script),
    };
    return {
      outcome: staticOnly ? "static-only" : issues.some(({ severity }) => severity === "warning") ? "valid-with-warnings" : "valid",
      script: validated, issues, fingerprint: validated.fingerprint,
    };
  }

  private dependencies(script: BriefingScriptDraft, add: Add): void {
    const byId = new Map(script.scenes.map((scene) => [scene.id, scene]));
    const visiting = new Set<string>(); const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) { add("SCENE_DEPENDENCY_CYCLE", "Scene dependency cycle detected.", "dependsOnSceneIds", "error", { relatedSceneId: id }); return; }
      if (visited.has(id)) return;
      const scene = byId.get(id); if (!scene) return;
      visiting.add(id);
      for (const dependency of scene.dependsOnSceneIds) {
        if (dependency === id) add("SCENE_DEPENDENCY_CYCLE", "Scene cannot depend on itself.", "dependsOnSceneIds", "error", { relatedSceneId: id });
        else if (!byId.has(dependency)) add("BROKEN_SCENE_DEPENDENCY", "Scene dependency does not exist.", "dependsOnSceneIds", "error", { relatedSceneId: id });
        else visit(dependency);
      }
      visiting.delete(id); visited.add(id);
    };
    for (const id of byId.keys()) visit(id);
  }

  private visuals(
    scene: BriefingScriptDraft["scenes"][number], plan: ValidatedExplanationPlan,
    contract: BriefingContract, script: BriefingScriptDraft, add: Add,
  ): void {
    const visualById = new Map(plan.sections.flatMap(({ visualIntents }) => visualIntents).map((visual) => [visual.id, visual]));
    for (const visual of scene.visualDirectives) {
      if (!contract.visualPolicy.allowedModes.includes(visual.mode) && visual.mode !== "text") {
        add("UNSUPPORTED_VISUAL_DIRECTIVE", "Visual mode is not allowed.", "visualDirectives.mode", "error", { relatedSceneId: scene.id });
      }
      if (visual.sourceVisualIntentId && !visualById.has(visual.sourceVisualIntentId)) {
        add("UNSUPPORTED_VISUAL_DIRECTIVE", "Visual directive is outside the plan intent.", "visualDirectives.sourceVisualIntentId", "error", { relatedSceneId: scene.id });
      }
      const camera = visual.cameraIntent;
      const cameraMoves = camera.action !== "no-camera-motion" && camera.action !== "hold-current-view";
      if (cameraMoves && camera.targetLocationIds.length === 0) add("CAMERA_POLICY_VIOLATION", "Camera focus requires a location.", "cameraIntent.targetLocationIds", "error", { relatedSceneId: scene.id });
      if (script.presentationPreference.mode === "static" && cameraMoves) add("STATIC_MODE_VIOLATION", "Static mode forbids camera motion.", "cameraIntent", "error", { relatedSceneId: scene.id });
      if (script.presentationPreference.mode === "reduced-motion" &&
          (camera.transitionPreference === "smooth" || camera.motionPriority === "high")) {
        add("REDUCED_MOTION_VIOLATION", "Reduced motion requires minimal or no motion.", "cameraIntent", "error", { relatedSceneId: scene.id });
      }
      if (script.presentationPreference.animationPolicy === "disabled" && camera.transitionPreference !== "none") {
        add("CAMERA_POLICY_VIOLATION", "Disabled animation requires no camera transition.", "cameraIntent.transitionPreference", "error", { relatedSceneId: scene.id });
      }
      if (visual.mode === "chart" && (!visual.chartIntent || visual.chartIntent.dataPointIds.length === 0)) {
        add("UNSUPPORTED_VISUAL_DIRECTIVE", "Chart requires a DataPoint.", "chartIntent", "error", { relatedSceneId: scene.id });
      }
      if (visual.mode === "document"
        && (!visual.documentIntent || visual.documentIntent.sourceDocumentIds.length === 0)) {
        add(
          "UNSUPPORTED_VISUAL_DIRECTIVE",
          "Document mode requires a SourceDocument reference.",
          "documentIntent.sourceDocumentIds",
          "error",
          { relatedSceneId: scene.id },
        );
      }
    }
  }
}

type Add = (
  code: ScriptErrorCode, message: string, path: string,
  severity?: BriefingScriptValidationIssue["severity"],
  related?: Partial<BriefingScriptValidationIssue>,
) => void;
function invalid(issues: BriefingScriptValidationIssue[]): BriefingScriptValidationResult {
  return { outcome: "invalid", issues, fingerprint: createSemanticFingerprint(issues) };
}
