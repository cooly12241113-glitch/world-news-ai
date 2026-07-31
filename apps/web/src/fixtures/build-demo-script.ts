import {
  BriefingScriptSchema,
  briefingScriptFingerprint,
  presentationPreference,
  type BriefingScene,
  type BriefingScriptDraft,
  type CameraIntent,
  type PresentationMode,
  type SceneKind,
  type SceneVisualDirective,
  type ValidatedBriefingScript,
} from "@world-news-ai/script-web";
import { canonicalMapImpactScenes } from "./canonical-map-impact";

const CREATED_AT = "2026-07-25T00:00:00.000Z";
const CONTEXT_ID = "context:semiconductor-policy";
const DOCUMENT_ID = "document:policy-brief";
const EXCERPT_ID = "excerpt:policy-brief";
const PROVENANCE_ID = "provenance:policy-brief";
const DATA_POINT_ID = "data:exposure-index";

const noMotion = (): CameraIntent => ({
  action: "no-camera-motion", targetLocationIds: [], targetEntityIds: [],
  framing: "current", spatialRelationship: "none", motionPriority: "low",
  transitionPreference: "none", preserveSafeViewport: true,
  allowRotation: false, allowZoom: false, allowPan: false,
  fallbackAction: "no-camera-motion", warnings: [],
});

const camera = (
  action: CameraIntent["action"],
  locations: string[],
  framing: CameraIntent["framing"],
): CameraIntent => ({
  action, targetLocationIds: locations, targetEntityIds: [],
  framing, spatialRelationship: locations.length > 1 ? "directional-flow" : "single-focus",
  motionPriority: "normal", transitionPreference: "smooth",
  preserveSafeViewport: true, allowRotation: false, allowZoom: true,
  allowPan: true, fallbackAction: "hold-current-view", warnings: [],
});

function visual(
  id: string,
  mode: SceneVisualDirective["mode"],
  locations: string[] = [],
): SceneVisualDirective {
  const map = mode === "map" || mode === "map-flow";
  return {
    id, mode, purpose: `Present ${mode} evidence for this scene.`,
    requiredness: "preferred", sourceVisualIntentId: `plan-${id}`,
    contextItemIds: [CONTEXT_ID], entityIds: [], locationIds: locations,
    dataPointIds: mode === "chart" ? [DATA_POINT_ID] : [],
    cameraIntent: map
      ? camera(mode === "map-flow" ? "trace-route" : locations[0] === "world"
        ? "establish-global-view" : "focus-region", locations,
        locations.length > 1 ? "multi-region" : locations[0] === "world" ? "global" : "national")
      : noMotion(),
    ...(map ? {
      overlayIntent: {
        overlayTypes: mode === "map-flow" ? ["directional-flow" as const] : ["marker" as const],
        entityIds: [], locationIds: locations, routeBindings: [], networkBindings: [],
        emphasis: "primary" as const, declutterPolicy: "automatic" as const,
        labelPolicy: "essential-only" as const, sourceCueIds: ["citation:policy"],
        warnings: [],
      },
    } : {}),
    ...(mode === "chart" ? {
      chartIntent: {
        chartPurpose: "Compare evidence-bound exposure indicators.",
        dataPointIds: [DATA_POINT_ID], comparisonEntityIds: [],
        preferredForm: "bar" as const, scalePolicy: "shared" as const,
        uncertaintyDisplay: "required" as const,
        annotationRequirements: ["Label as fixture indicator"],
        fallbackMode: "text" as const, warnings: [],
      },
    } : {}),
    ...(mode === "document" ? {
      documentIntent: {
        sourceDocumentIds: [DOCUMENT_ID], excerptIds: [EXCERPT_ID],
        claimIds: ["claim:policy"], displayPurpose: "show-primary-source" as const,
        emphasisTargets: ["attribution"], attributionRequired: true,
        fallbackMode: "text" as const, warnings: [],
      },
    } : {}),
    fallbackMode: "text", accessibilityFallback: "static", warnings: [],
  };
}

function scene(
  order: number,
  kind: SceneKind,
  objective: string,
  visualDirective?: SceneVisualDirective,
): BriefingScene {
  const id = `scene:${order}:${kind}`;
  const evidence = kind !== "opening" && kind !== "closing";
  return {
    id, kind, order, titleRequirement: `Scene ${order + 1}: ${kind}`,
    objective, sourceSectionIds: evidence ? [`section:${kind}`] : [],
    sourceStepIds: evidence ? [`step:${kind}`] : [],
    dependsOnSceneIds: order === 0 ? [] : [`scene:${order - 1}:${KINDS[order - 1]}`],
    contentBindings: evidence ? [{
      id: `binding:${kind}`, planSectionId: `section:${kind}`, planStepId: `step:${kind}`,
      contextItemIds: [CONTEXT_ID], excerptIds: [EXCERPT_ID],
      provenanceRecordIds: [PROVENANCE_ID], sourceDocumentIds: [DOCUMENT_ID],
      claimIds: ["claim:policy"], evidenceLinkIds: ["evidence:policy"],
      dataPointIds: [DATA_POINT_ID], entityIds: [],
      locationIds: visualDirective?.locationIds ?? [], usage: kind === "uncertainty"
        ? "expose-uncertainty" : "support", required: true, warnings: [],
    }] : [],
    visualDirectives: visualDirective ? [visualDirective] : [],
    narrationDirective: {
      required: false, purpose: "Describe only the fixture-bound scene requirement.",
      outputType: kind === "impact-path" ? "impact-explanation"
        : kind === "uncertainty" ? "uncertainty-disclosure"
          : kind === "opening" ? "introduction"
            : kind === "closing" ? "source-note" : "factual-summary",
      maximumStatements: 3, maximumCharacters: 600,
      directness: "qualified", allowedEpistemicTypes: kind === "uncertainty"
        ? ["unknown"] : ["attributed-claim", "interpretation"],
      requiresAttribution: evidence, requiresCitation: evidence,
      requiresUncertaintyDisclosure: kind === "uncertainty",
      requiresAssumptionDisclosure: kind === "uncertainty",
      prohibitedBehaviors: ["invent-fact", "promote-claim-to-fact", "direct-buy-sell-command"],
      sourceStepIds: evidence ? [`step:${kind}`] : [],
      contextItemIds: evidence ? [CONTEXT_ID] : [], warnings: [],
    },
    captionDirective: {
      required: true, purpose: objective, maximumCharacters: 180,
      placement: "above-composer", avoidsComposerOverlap: true,
      mapOcclusionPolicy: "minimal",
      sourceStepIds: evidence ? [`step:${kind}`] : [], warnings: [],
    },
    citationCues: evidence ? [{
      id: `citation:${kind}`, contextItemIds: [CONTEXT_ID],
      excerptIds: [EXCERPT_ID], provenanceRecordIds: [PROVENANCE_ID],
      sourceDocumentIds: [DOCUMENT_ID], displayPolicy: "inline",
      attributionRequired: true, warnings: [],
    }] : [],
    uncertaintyCues: kind === "uncertainty" ? [{
      id: "uncertainty:policy", planStepIds: [`step:${kind}`],
      evidenceGapIds: ["gap:implementation"], disclosure: "explicit",
      blocking: false, warnings: [],
    }] : [],
    interactionDirectives: ["pause-on-composer-focus", "pause-on-manual-map-interaction"],
    layoutDirective: {
      primaryRegion: visualDirective?.mode === "document" ? "document"
        : visualDirective ? "visual" : "text",
      secondaryPanel: evidence ? "sources" : "none",
      mapDominance: visualDirective && ["map", "map-flow"].includes(visualDirective.mode)
        ? "primary" : "none",
      composerState: order === 0 ? "collapsed" : "playback-controls",
      composerPosition: "bottom-center",
      safeViewport: {
        reserveBottomComposer: true, reservePlaybackControls: true,
        reserveCaptionArea: true, reserveSidePanel: evidence,
        mobileSafeAreaRequired: true, preservePrimaryVisualFocus: true,
        insetIntent: "balanced",
      },
    },
    timingIntent: { pace: "normal", hold: "standard", userAdvanceAllowed: true },
    transitionIntent: {
      style: visualDirective && ["map", "map-flow"].includes(visualDirective.mode)
        ? "continuous" : "minimal",
      preserveUserView: true,
      requiresMotionPlanner: Boolean(visualDirective && ["map", "map-flow"].includes(visualDirective.mode)),
    },
    optional: false, warnings: [],
  };
}

const KINDS: SceneKind[] = canonicalMapImpactScenes.map(({ kind }) => kind);

export function buildDemoScript(mode: PresentationMode = "auto"): ValidatedBriefingScript {
  const preference = presentationPreference(mode);
  const staticMode = mode === "static" || mode === "reduced-motion";
  const scenes = canonicalMapImpactScenes.map((semantic, index) => scene(
    index,
    semantic.kind,
    semantic.objective,
    semantic.mode
      ? visual(`visual:${semantic.kind}`, semantic.mode, [...semantic.locationIds])
      : undefined,
  ));
  if (staticMode) for (const item of scenes) {
    item.visualDirectives = item.visualDirectives.map((directive) => ({
      ...directive,
      mode: mode === "static" ? "text" : directive.mode,
      cameraIntent: noMotion(),
    }));
    item.transitionIntent = { ...item.transitionIntent, style: "none", requiresMotionPlanner: false };
  }
  const draft: BriefingScriptDraft = {
    id: `demo:${mode}`, questionId: "question:demo", contractId: "contract:demo",
    contextPackageId: "context-package:demo", explanationPlanId: "plan:demo",
    contractFingerprint: "contract-fingerprint-demo",
    contextPackageFingerprint: "context-fingerprint-demo",
    explanationPlanFingerprint: "plan-fingerprint-demo",
    scriptVersion: "briefing-script-v1",
    compiler: { type: "human", id: "fixture-builder", version: "1.0.0", policyVersion: "fixture-v1" },
    presentationPreference: preference,
    status: staticMode ? "static-only" : "validated",
    titleRequirement: "Technology policy and the East Asian semiconductor impact path",
    opening: {
      objective: "Establish scope and evidence posture.", establishesScope: true,
      requiredContextItemIds: [], requiredPlanStepIds: [], layoutIntent: "Map-first safe viewport.",
      narrationRequirement: "preferred", captionRequirement: "required", sourceCueIds: [], warnings: [],
    },
    scenes,
    closing: {
      objective: "Close with uncertainty and sources.", summaryStepIds: ["step:supporting-evidence"],
      uncertaintyStepIds: ["step:uncertainty"], verificationSignalStepIds: ["step:uncertainty"],
      requiredContextItemIds: [CONTEXT_ID], sourceCueIds: ["citation:uncertainty"],
      returnViewIntent: staticMode ? "none" : "overview",
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
      ...preference.accessibilityPolicy, captionsAvailable: true, staticFallbackAvailable: true,
    },
    coverage: {
      overall: 1, planSectionCoverage: 1, planStepCoverage: 1, evidenceCoverage: 1,
      citationCoverage: 1, uncertaintyCoverage: 1, visualCoverage: 1,
      accessibilityCoverage: 1, staticFallbackCoverage: 1, interactionCoverage: 1,
      missingRequirements: [], blockingGaps: [],
    },
    warnings: [], createdAt: CREATED_AT, fingerprint: "pending",
  };
  draft.fingerprint = briefingScriptFingerprint(draft);
  const parsed = BriefingScriptSchema.parse(draft);
  if (!isValidated(parsed)) throw new Error("Fixture did not produce a validated script.");
  return parsed;
}

function isValidated(script: BriefingScriptDraft): script is ValidatedBriefingScript {
  return script.status === "validated" || script.status === "static-only";
}

export const demoEvidence = {
  document: {
    id: DOCUMENT_ID, title: "Semiconductor Policy Implementation Brief",
    type: "Government document", publisher: "Fixture Policy Office",
    publishedAt: "2026-07-20", revision: "1",
    excerpt: "The policy introduces phased controls and review checkpoints.",
  },
  dataPoint: {
    id: DATA_POINT_ID, label: "Supply-chain exposure index", value: 68, unit: "/100",
    band: "Material exposure (demo fixture value)",
    measures: "Relative supply-chain exposure represented by this fixture.",
    source: "Fixture evidence package", status: "Demo fixture", vintage: "2026-07-20",
  },
  supporting: ["Primary policy document defines phased controls.", "Fixture indicator shows material exposure."],
  contradicting: ["Implementation timing remains subject to review.", "Supplier adaptation may reduce the impact."],
};
