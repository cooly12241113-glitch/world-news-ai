import { createSemanticFingerprint } from "../briefing/fingerprint";
import type { BriefingScene, BriefingScriptDraft } from "./models";

const sorted = (values: string[]) => [...new Set(values)].sort();

export function briefingSceneFingerprint(scene: BriefingScene): string {
  return createSemanticFingerprint(scene);
}

export function briefingScriptFingerprint(script: BriefingScriptDraft): string {
  const sceneById = new Map(script.scenes.map((scene) => [scene.id, scene]));
  return createSemanticFingerprint({
    contractFingerprint: script.contractFingerprint,
    contextPackageFingerprint: script.contextPackageFingerprint,
    explanationPlanFingerprint: script.explanationPlanFingerprint,
    personalContextFingerprint: script.personalContextFingerprint,
    personalizedImpactAnalysisFingerprint: script.personalizedImpactAnalysisFingerprint,
    personalizedImpactPlanningContext: script.personalizedImpactPlanningContext,
    scriptVersion: script.scriptVersion, compiler: script.compiler,
    presentationPreference: script.presentationPreference,
    scenes: [...script.scenes].sort((a, b) => a.order - b.order).map((scene) => ({
      kind: scene.kind, order: scene.order, objective: scene.objective,
      sourceSectionIds: sorted(scene.sourceSectionIds), sourceStepIds: sorted(scene.sourceStepIds),
      dependencies: sorted(scene.dependsOnSceneIds.map((dependencyId) => {
        const dependency = sceneById.get(dependencyId);
        return dependency ? `${dependency.kind}:${dependency.order}` : `missing:${dependencyId}`;
      })),
      contentBindings: scene.contentBindings.map((binding) => ({
        planSectionId: binding.planSectionId, planStepId: binding.planStepId,
        contextItemIds: sorted(binding.contextItemIds), excerptIds: sorted(binding.excerptIds),
        provenanceRecordIds: sorted(binding.provenanceRecordIds),
        sourceDocumentIds: sorted(binding.sourceDocumentIds), claimIds: sorted(binding.claimIds),
        evidenceLinkIds: sorted(binding.evidenceLinkIds), dataPointIds: sorted(binding.dataPointIds),
        entityIds: sorted(binding.entityIds), locationIds: sorted(binding.locationIds),
        usage: binding.usage, required: binding.required,
      })).sort((a, b) => a.planStepId.localeCompare(b.planStepId)),
      personalImpactBindings: scene.personalImpactBindings?.map((binding) => ({
        planStepId: binding.planStepId,
        analysisFingerprint: binding.analysisFingerprint,
        exposureIds: sorted(binding.exposureIds),
        impactChannelIds: sorted(binding.impactChannelIds),
        impactAssessmentIds: sorted(binding.impactAssessmentIds),
        scenarioIds: sorted(binding.scenarioIds),
      })).sort((a, b) => a.planStepId.localeCompare(b.planStepId)),
      visualDirectives: scene.visualDirectives.map((visual) => ({
        mode: visual.mode, purpose: visual.purpose, requiredness: visual.requiredness,
        sourceVisualIntentId: visual.sourceVisualIntentId,
        contextItemIds: sorted(visual.contextItemIds), entityIds: sorted(visual.entityIds),
        locationIds: sorted(visual.locationIds), dataPointIds: sorted(visual.dataPointIds),
        timeRange: visual.timeRange, cameraIntent: visual.cameraIntent,
        overlayIntent: visual.overlayIntent, chartIntent: visual.chartIntent,
        documentIntent: visual.documentIntent, fallbackMode: visual.fallbackMode,
        accessibilityFallback: visual.accessibilityFallback,
      })),
      narrationDirective: scene.narrationDirective,
      captionDirective: scene.captionDirective,
      citationCues: scene.citationCues.map((cue) => ({
        contextItemIds: sorted(cue.contextItemIds), excerptIds: sorted(cue.excerptIds),
        provenanceRecordIds: sorted(cue.provenanceRecordIds),
        sourceDocumentIds: sorted(cue.sourceDocumentIds),
        displayPolicy: cue.displayPolicy, attributionRequired: cue.attributionRequired,
      })),
      uncertaintyCues: scene.uncertaintyCues.map((cue) => ({
        planStepIds: sorted(cue.planStepIds), evidenceGapIds: sorted(cue.evidenceGapIds),
        disclosure: cue.disclosure, blocking: cue.blocking,
      })),
      layoutDirective: scene.layoutDirective, timingIntent: scene.timingIntent,
      transitionIntent: scene.transitionIntent, optional: scene.optional,
    })),
    opening: script.opening, closing: script.closing,
    playbackPolicy: script.playbackPolicy, interactionPolicy: script.interactionPolicy,
    accessibilityPolicy: script.accessibilityPolicy, stopReason: script.stopReason,
  });
}
