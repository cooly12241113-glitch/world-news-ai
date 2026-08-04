import { z } from "zod";
import type {
  BriefingPresentationPreference, BriefingScriptBuildResult, BriefingScriptDraft,
  BriefingScriptValidationIssue, BriefingScriptValidationResult, BriefingScene,
  BriefingOpening, BriefingClosing, SceneContentBinding, SceneVisualDirective,
} from "./models";
import { PersonalImpactBindingSchema } from "../explanation";
import { PersonalizedImpactPlanningContextSchema } from "../personalization";

const S = z.string().trim().min(1);
const Text = z.string().trim().min(1).max(500);
const SA = z.array(S);
const Score = z.number().finite().min(0).max(1);
const VisualMode = z.enum(["map", "map-flow", "chart", "timeline", "document", "comparison", "evidence-board", "personalized-impact", "text"]);
const Epistemic = z.enum(["confirmed-fact", "attributed-claim", "interpretation", "inference", "forecast", "unknown"]);
const PresentationMode = z.enum(["auto", "cinematic-map", "map-and-chart", "chart-led", "document-led", "static", "reduced-motion"]);
const ScriptErrorCode = z.enum([
  "SCRIPT_INPUT_INVALID", "SCRIPT_REFERENCE_MISMATCH", "PRESENTATION_PREFERENCE_INVALID",
  "UNSUPPORTED_PRESENTATION_MODE", "PLAN_NOT_VALIDATED", "CONTEXT_PACKAGE_INVALID",
  "SCRIPT_ASSEMBLY_FAILED", "SCRIPT_SCHEMA_INVALID", "SCRIPT_SEMANTIC_INVALID",
  "MISSING_REQUIRED_SCENE", "MISSING_PLAN_STEP_COVERAGE", "DUPLICATE_SCENE_ID",
  "INVALID_SCENE_ORDER", "BROKEN_SCENE_DEPENDENCY", "SCENE_DEPENDENCY_CYCLE",
  "BROKEN_CONTENT_BINDING", "BROKEN_CITATION_REFERENCE",
  "UNSUPPORTED_VISUAL_DIRECTIVE", "CAMERA_POLICY_VIOLATION", "STATIC_MODE_VIOLATION",
  "REDUCED_MOTION_VIOLATION", "SAFE_VIEWPORT_POLICY_MISSING",
  "COMPOSER_POLICY_VIOLATION", "ACCESSIBILITY_REQUIREMENT_MISSING",
  "STOP_CONDITION_EXCEEDED", "SCRIPT_VALIDATION_FAILED",
  "PERSONAL_IMPACT_REFERENCE_INVALID", "PERSONAL_IMPACT_LINEAGE_MISMATCH",
]);

export const BriefingPresentationPreferenceSchema: z.ZodType<BriefingPresentationPreference> = z.strictObject({
  mode: PresentationMode, playbackSpeed: z.enum(["slow", "normal", "fast"]),
  animationPolicy: z.enum(["full", "minimal", "disabled"]),
  cameraMotionPolicy: z.enum(["allow", "minimize", "disallow"]),
  narrationPolicy: z.enum(["required", "preferred", "captions-only", "disabled"]),
  captionPolicy: z.enum(["always", "auto", "disabled"]),
  sourceDisplayPolicy: z.enum(["inline", "scene-end", "briefing-end", "on-demand"]),
  panelPolicy: z.enum(["collapsed-by-default", "contextual", "persistent", "hidden"]),
  composerPolicy: z.strictObject({
    position: z.literal("bottom-center"), collapsedByDefault: z.literal(true),
    collapseDuringPlayback: z.literal(true), expandOnUserFocus: z.literal(true),
    pausePlaybackOnFocus: z.literal(true), preserveMapViewport: z.literal(true),
  }),
  accessibilityPolicy: z.strictObject({
    reducedMotionAvailable: z.literal(true), staticFallbackRequired: z.literal(true),
    keyboardNavigationRequired: z.literal(true), screenReaderLabelsRequired: z.literal(true),
    colorIndependentMeaningRequired: z.literal(true),
  }),
  userInitiated: z.literal(true), autoplay: z.literal(false), preferenceVersion: S,
}).superRefine((value, context) => {
  if (value.mode === "static" && (value.animationPolicy !== "disabled" || value.cameraMotionPolicy !== "disallow")) {
    context.addIssue({ code: "custom", message: "Static mode requires disabled animation and disallowed camera motion." });
  }
  if (value.mode === "reduced-motion" && (value.animationPolicy === "full" || value.cameraMotionPolicy === "allow")) {
    context.addIssue({ code: "custom", message: "Reduced motion cannot use full animation or unrestricted camera motion." });
  }
});

export const SafeViewportPolicySchema = z.strictObject({
  reserveBottomComposer: z.literal(true), reservePlaybackControls: z.literal(true),
  reserveCaptionArea: z.literal(true), reserveSidePanel: z.boolean(),
  mobileSafeAreaRequired: z.literal(true), preservePrimaryVisualFocus: z.literal(true),
  insetIntent: z.enum(["automatic", "balanced", "visual-priority"]),
});
export const CameraIntentSchema = z.strictObject({
  action: z.enum(["establish-global-view", "focus-region", "focus-country", "focus-local-area", "compare-regions", "trace-route", "trace-network", "follow-impact-path", "return-to-overview", "hold-current-view", "no-camera-motion"]),
  targetLocationIds: SA, targetEntityIds: SA,
  framing: z.enum(["global", "multi-region", "continental", "regional", "national", "subnational", "local", "network", "current"]),
  spatialRelationship: z.enum(["single-focus", "comparison", "directional-flow", "bidirectional-flow", "network", "containment", "adjacency", "none"]),
  motionPriority: z.enum(["low", "normal", "high"]),
  transitionPreference: z.enum(["smooth", "minimal", "none"]),
  preserveSafeViewport: z.boolean(), allowRotation: z.boolean(), allowZoom: z.boolean(),
  allowPan: z.boolean(), fallbackAction: z.enum(["hold-current-view", "no-camera-motion"]),
  warnings: z.array(z.string()),
});
export const MapOverlayIntentSchema = z.strictObject({
  overlayTypes: z.array(z.enum(["marker", "region-highlight", "country-highlight", "route", "directional-flow", "network-edge", "network-node", "heat-area", "boundary", "annotation", "none"])),
  entityIds: SA, locationIds: SA, routeBindings: SA, networkBindings: SA,
  emphasis: z.enum(["primary", "balanced", "contextual"]),
  declutterPolicy: z.enum(["automatic", "prioritize-primary", "cluster-secondary", "hide-nonessential"]),
  labelPolicy: z.enum(["essential-only", "contextual", "on-demand"]),
  timeFilter: Text.optional(), sourceCueIds: SA, warnings: z.array(z.string()),
});
export const ChartIntentSchema = z.strictObject({
  chartPurpose: Text, dataPointIds: SA, comparisonEntityIds: SA,
  timeRange: Text.optional(), preferredForm: z.enum(["line", "bar", "area", "scatter", "distribution", "contribution", "scenario-range", "table", "auto"]),
  scalePolicy: z.enum(["auto", "shared", "independent"]),
  uncertaintyDisplay: z.enum(["required", "preferred", "not-applicable"]),
  annotationRequirements: z.array(z.string()), fallbackMode: VisualMode, warnings: z.array(z.string()),
});
export const DocumentIntentSchema = z.strictObject({
  sourceDocumentIds: SA, excerptIds: SA, claimIds: SA,
  displayPurpose: z.enum(["show-primary-source", "verify-wording", "establish-claim-origin", "compare-documents", "show-official-data", "expose-contradiction"]),
  emphasisTargets: z.array(z.string()), attributionRequired: z.boolean(),
  fallbackMode: VisualMode, warnings: z.array(z.string()),
});
export const SceneVisualDirectiveSchema: z.ZodType<SceneVisualDirective> = z.strictObject({
  id: S, mode: VisualMode, purpose: Text,
  requiredness: z.enum(["required", "preferred", "optional"]),
  sourceVisualIntentId: S.optional(), contextItemIds: SA, entityIds: SA,
  locationIds: SA, dataPointIds: SA, timeRange: Text.optional(),
  cameraIntent: CameraIntentSchema, overlayIntent: MapOverlayIntentSchema.optional(),
  chartIntent: ChartIntentSchema.optional(), documentIntent: DocumentIntentSchema.optional(),
  fallbackMode: VisualMode, accessibilityFallback: z.enum(["text", "table", "static"]),
  warnings: z.array(z.string()),
});
export const SceneContentBindingSchema: z.ZodType<SceneContentBinding> = z.strictObject({
  id: S, planSectionId: S, planStepId: S, contextItemIds: SA, excerptIds: SA,
  provenanceRecordIds: SA, sourceDocumentIds: SA, claimIds: SA,
  evidenceLinkIds: SA, dataPointIds: SA, entityIds: SA, locationIds: SA,
  usage: z.enum(["establish", "explain", "support", "contradict", "contextualize", "quantify", "compare", "expose-uncertainty", "supply-assumption", "supply-verification-signal", "cite"]),
  required: z.boolean(), warnings: z.array(z.string()),
});
export const SceneNarrationDirectiveSchema = z.strictObject({
  required: z.boolean(), purpose: Text,
  outputType: z.enum(["introduction", "direct-answer", "factual-summary", "causal-explanation", "impact-explanation", "claim-assessment", "comparison", "scenario-explanation", "uncertainty-disclosure", "verification-signal", "source-note"]),
  maximumStatements: z.number().int().positive(), maximumCharacters: z.number().int().positive().max(2000),
  directness: z.enum(["direct", "contextual", "qualified"]),
  allowedEpistemicTypes: z.array(Epistemic).min(1),
  requiresAttribution: z.boolean(), requiresCitation: z.boolean(),
  requiresUncertaintyDisclosure: z.boolean(), requiresAssumptionDisclosure: z.boolean(),
  prohibitedBehaviors: SA, sourceStepIds: SA, contextItemIds: SA, warnings: z.array(z.string()),
});
export const SceneCaptionDirectiveSchema = z.strictObject({
  required: z.boolean(), purpose: Text, maximumCharacters: z.number().int().positive().max(500),
  placement: z.enum(["above-composer", "visual-bottom", "side-panel"]),
  avoidsComposerOverlap: z.boolean(), mapOcclusionPolicy: z.enum(["minimal", "adaptive", "none"]),
  sourceStepIds: SA, warnings: z.array(z.string()),
});
export const SceneCitationCueSchema = z.strictObject({
  id: S, contextItemIds: SA, excerptIds: SA, provenanceRecordIds: SA,
  sourceDocumentIds: SA, displayPolicy: z.enum(["inline", "scene-end", "briefing-end", "on-demand"]),
  attributionRequired: z.boolean(), warnings: z.array(z.string()),
});
export const SceneUncertaintyCueSchema = z.strictObject({
  id: S, planStepIds: SA, evidenceGapIds: SA,
  disclosure: z.enum(["explicit", "label", "panel"]), blocking: z.boolean(),
  warnings: z.array(z.string()),
});
export const SceneLayoutDirectiveSchema = z.strictObject({
  primaryRegion: z.enum(["visual", "document", "comparison", "text"]),
  secondaryPanel: z.enum(["none", "sources", "context", "uncertainty"]),
  mapDominance: z.enum(["none", "supporting", "primary"]),
  composerState: z.enum(["expanded", "collapsed", "playback-controls"]),
  composerPosition: z.literal("bottom-center"), safeViewport: SafeViewportPolicySchema,
});
export const SceneTimingIntentSchema = z.strictObject({
  pace: z.enum(["slow", "normal", "fast"]), hold: z.enum(["brief", "standard", "extended"]),
  userAdvanceAllowed: z.boolean(),
});
export const SceneTransitionIntentSchema = z.strictObject({
  style: z.enum(["continuous", "cut", "minimal", "none"]),
  preserveUserView: z.boolean(), requiresMotionPlanner: z.boolean(),
});
export const BriefingSceneSchema: z.ZodType<BriefingScene> = z.strictObject({
  id: S, kind: z.enum(["opening", "direct-answer", "global-overview", "regional-focus", "current-situation", "necessary-background", "causal-step", "impact-path", "claim-origin", "supporting-evidence", "contradicting-evidence", "comparison", "scenario", "counter-factor", "alternative-explanation", "uncertainty", "verification-signals", "source-review", "closing"]),
  order: z.number().int().nonnegative(), titleRequirement: Text, objective: Text,
  sourceSectionIds: SA, sourceStepIds: SA, dependsOnSceneIds: SA,
  contentBindings: z.array(SceneContentBindingSchema),
  personalImpactBindings: z.array(
    PersonalImpactBindingSchema.extend({ planStepId: S }).strict(),
  ).optional(),
  visualDirectives: z.array(SceneVisualDirectiveSchema),
  narrationDirective: SceneNarrationDirectiveSchema,
  captionDirective: SceneCaptionDirectiveSchema,
  citationCues: z.array(SceneCitationCueSchema), uncertaintyCues: z.array(SceneUncertaintyCueSchema),
  interactionDirectives: SA, layoutDirective: SceneLayoutDirectiveSchema,
  timingIntent: SceneTimingIntentSchema, transitionIntent: SceneTransitionIntentSchema,
  optional: z.boolean(), warnings: z.array(z.string()),
});
export const BriefingOpeningSchema: z.ZodType<BriefingOpening> = z.strictObject({
  objective: Text, establishesScope: z.boolean(), requiredContextItemIds: SA,
  requiredPlanStepIds: SA, layoutIntent: Text,
  narrationRequirement: z.enum(["required", "preferred", "disabled"]),
  captionRequirement: z.enum(["required", "preferred", "disabled"]),
  sourceCueIds: SA, warnings: z.array(z.string()),
});
export const BriefingClosingSchema: z.ZodType<BriefingClosing> = z.strictObject({
  objective: Text, summaryStepIds: SA, uncertaintyStepIds: SA,
  verificationSignalStepIds: SA, requiredContextItemIds: SA, sourceCueIds: SA,
  returnViewIntent: z.enum(["overview", "preserve", "none"]),
  followUpPolicy: z.enum(["offer-current-scene-context", "offer-general-follow-up", "disabled"]),
  warnings: z.array(z.string()),
});
export const BriefingPlaybackPolicySchema = z.strictObject({
  autoplay: z.literal(false), userInitiated: z.literal(true),
  controls: z.array(z.enum(["pause", "resume", "previous", "next", "jump", "speed", "disable-animation"])),
  composerDuringPlayback: z.literal("playback-controls"), restoreComposerAfterPlayback: z.literal(true),
});
export const BriefingInteractionPolicySchema = z.strictObject({
  pauseOnComposerFocus: z.literal(true), pauseOnManualMapInteraction: z.literal(true),
  preserveUserView: z.literal(true), resumeScriptCameraOnlyOnUserAction: z.literal(true),
  sourceOpenPolicy: z.enum(["pause", "continue"]), followUpContext: z.literal("current-scene"),
});
export const BriefingAccessibilityPolicySchema = z.strictObject({
  reducedMotionAvailable: z.literal(true), staticFallbackRequired: z.literal(true),
  keyboardNavigationRequired: z.literal(true), screenReaderLabelsRequired: z.literal(true),
  colorIndependentMeaningRequired: z.literal(true), captionsAvailable: z.literal(true),
  staticFallbackAvailable: z.literal(true),
});
export const BriefingScriptCoverageSchema = z.strictObject({
  overall: Score, planSectionCoverage: Score, planStepCoverage: Score,
  evidenceCoverage: Score, citationCoverage: Score, uncertaintyCoverage: Score,
  visualCoverage: Score, accessibilityCoverage: Score, staticFallbackCoverage: Score,
  interactionCoverage: Score, missingRequirements: SA, blockingGaps: SA,
});
export const BriefingScriptSchema: z.ZodType<BriefingScriptDraft> = z.strictObject({
  id: S, questionId: S, contractId: S, contextPackageId: S, explanationPlanId: S,
  contractFingerprint: S, contextPackageFingerprint: S, explanationPlanFingerprint: S,
  personalContextFingerprint: S.optional(),
  personalizedImpactAnalysisFingerprint: S.optional(),
  personalizedImpactPlanningContext: PersonalizedImpactPlanningContextSchema.optional(),
  scriptVersion: S, compiler: z.strictObject({
    type: z.enum(["rule", "llm", "human"]), id: S, version: S, policyVersion: S,
  }),
  presentationPreference: BriefingPresentationPreferenceSchema,
  status: z.enum(["draft", "validated", "invalid", "insufficient-context", "static-only"]),
  titleRequirement: Text, opening: BriefingOpeningSchema,
  scenes: z.array(BriefingSceneSchema).min(2), closing: BriefingClosingSchema,
  playbackPolicy: BriefingPlaybackPolicySchema, interactionPolicy: BriefingInteractionPolicySchema,
  accessibilityPolicy: BriefingAccessibilityPolicySchema,
  coverage: BriefingScriptCoverageSchema, warnings: z.array(z.string()),
  stopReason: Text.optional(), createdAt: z.iso.datetime(), fingerprint: S,
});
export const BriefingScriptValidationIssueSchema: z.ZodType<BriefingScriptValidationIssue> = z.strictObject({
  code: ScriptErrorCode, severity: z.enum(["error", "warning", "info"]),
  path: S, message: S, relatedSceneId: S.optional(),
  relatedPlanStepId: S.optional(), relatedContextItemId: S.optional(),
});
export const BriefingScriptValidationResultSchema = z.union([
  z.strictObject({
    outcome: z.enum(["valid", "valid-with-warnings", "static-only"]),
    script: BriefingScriptSchema.and(z.object({ status: z.enum(["validated", "static-only"]) })),
    issues: z.array(BriefingScriptValidationIssueSchema), fingerprint: S,
  }),
  z.strictObject({
    outcome: z.enum(["invalid", "insufficient-context"]),
    issues: z.array(BriefingScriptValidationIssueSchema), fingerprint: S,
  }),
]) as unknown as z.ZodType<BriefingScriptValidationResult>;
export const BriefingScriptBuildResultSchema = z.union([
  z.strictObject({
    success: z.literal(true), outcome: z.enum(["validated-script", "validated-static-script", "partial-script"]),
    script: BriefingScriptSchema, validation: BriefingScriptValidationResultSchema,
    warnings: z.array(z.string()),
  }),
  z.strictObject({
    success: z.literal(true), outcome: z.enum(["insufficient-context", "unsupported-presentation", "no-script"]),
    reasons: z.array(S).min(1),
  }),
  z.strictObject({
    success: z.literal(false),
    error: z.strictObject({ code: ScriptErrorCode, stage: S, retryable: z.literal(false), details: z.string().optional() }),
  }),
]) as unknown as z.ZodType<BriefingScriptBuildResult>;
