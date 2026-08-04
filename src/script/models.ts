import type { BriefingContract, VisualMode } from "../briefing";
import type { EvidenceContextPackage } from "../context";
import type { EpistemicType, ValidatedExplanationPlan } from "../explanation";
import type {
  PersonalImpactBinding,
} from "../explanation";
import type { PersonalizedImpactPlanningContext } from "../personalization";

export type PresentationMode =
  | "auto" | "cinematic-map" | "map-and-chart" | "chart-led"
  | "document-led" | "static" | "reduced-motion";

export interface BriefingPresentationPreference {
  mode: PresentationMode; playbackSpeed: "slow" | "normal" | "fast";
  animationPolicy: "full" | "minimal" | "disabled";
  cameraMotionPolicy: "allow" | "minimize" | "disallow";
  narrationPolicy: "required" | "preferred" | "captions-only" | "disabled";
  captionPolicy: "always" | "auto" | "disabled";
  sourceDisplayPolicy: "inline" | "scene-end" | "briefing-end" | "on-demand";
  panelPolicy: "collapsed-by-default" | "contextual" | "persistent" | "hidden";
  composerPolicy: {
    position: "bottom-center"; collapsedByDefault: true;
    collapseDuringPlayback: true; expandOnUserFocus: true;
    pausePlaybackOnFocus: true; preserveMapViewport: true;
  };
  accessibilityPolicy: {
    reducedMotionAvailable: true; staticFallbackRequired: true;
    keyboardNavigationRequired: true; screenReaderLabelsRequired: true;
    colorIndependentMeaningRequired: true;
  };
  userInitiated: true; autoplay: false; preferenceVersion: string;
}

export type SceneKind =
  | "opening" | "direct-answer" | "global-overview" | "regional-focus"
  | "current-situation" | "necessary-background" | "causal-step"
  | "impact-path" | "claim-origin" | "supporting-evidence"
  | "contradicting-evidence" | "comparison" | "scenario"
  | "counter-factor" | "alternative-explanation" | "uncertainty"
  | "verification-signals" | "source-review" | "closing";

export interface SceneContentBinding {
  id: string; planSectionId: string; planStepId: string;
  contextItemIds: string[]; excerptIds: string[]; provenanceRecordIds: string[];
  sourceDocumentIds: string[]; claimIds: string[]; evidenceLinkIds: string[];
  dataPointIds: string[]; entityIds: string[]; locationIds: string[];
  usage: "establish" | "explain" | "support" | "contradict" | "contextualize"
    | "quantify" | "compare" | "expose-uncertainty"
    | "supply-assumption" | "supply-verification-signal" | "cite";
  required: boolean; warnings: string[];
}

export interface CameraIntent {
  action: "establish-global-view" | "focus-region" | "focus-country"
    | "focus-local-area" | "compare-regions" | "trace-route" | "trace-network"
    | "follow-impact-path" | "return-to-overview" | "hold-current-view"
    | "no-camera-motion";
  targetLocationIds: string[]; targetEntityIds: string[];
  framing: "global" | "multi-region" | "continental" | "regional"
    | "national" | "subnational" | "local" | "network" | "current";
  spatialRelationship: "single-focus" | "comparison" | "directional-flow"
    | "bidirectional-flow" | "network" | "containment" | "adjacency" | "none";
  motionPriority: "low" | "normal" | "high";
  transitionPreference: "smooth" | "minimal" | "none";
  preserveSafeViewport: boolean; allowRotation: boolean; allowZoom: boolean;
  allowPan: boolean; fallbackAction: "hold-current-view" | "no-camera-motion";
  warnings: string[];
}

export interface MapOverlayIntent {
  overlayTypes: Array<"marker" | "region-highlight" | "country-highlight"
    | "route" | "directional-flow" | "network-edge" | "network-node"
    | "heat-area" | "boundary" | "annotation" | "none">;
  entityIds: string[]; locationIds: string[]; routeBindings: string[];
  networkBindings: string[]; emphasis: "primary" | "balanced" | "contextual";
  declutterPolicy: "automatic" | "prioritize-primary" | "cluster-secondary" | "hide-nonessential";
  labelPolicy: "essential-only" | "contextual" | "on-demand";
  timeFilter?: string; sourceCueIds: string[]; warnings: string[];
}

export interface ChartIntent {
  chartPurpose: string; dataPointIds: string[]; comparisonEntityIds: string[];
  timeRange?: string; preferredForm: "line" | "bar" | "area" | "scatter"
    | "distribution" | "contribution" | "scenario-range" | "table" | "auto";
  scalePolicy: "auto" | "shared" | "independent";
  uncertaintyDisplay: "required" | "preferred" | "not-applicable";
  annotationRequirements: string[]; fallbackMode: VisualMode; warnings: string[];
}

export interface DocumentIntent {
  sourceDocumentIds: string[]; excerptIds: string[]; claimIds: string[];
  displayPurpose: "show-primary-source" | "verify-wording"
    | "establish-claim-origin" | "compare-documents" | "show-official-data"
    | "expose-contradiction";
  emphasisTargets: string[]; attributionRequired: boolean;
  fallbackMode: VisualMode; warnings: string[];
}

export interface SceneVisualDirective {
  id: string; mode: VisualMode; purpose: string;
  requiredness: "required" | "preferred" | "optional";
  sourceVisualIntentId?: string; contextItemIds: string[]; entityIds: string[];
  locationIds: string[]; dataPointIds: string[]; timeRange?: string;
  cameraIntent: CameraIntent; overlayIntent?: MapOverlayIntent;
  chartIntent?: ChartIntent; documentIntent?: DocumentIntent;
  fallbackMode: VisualMode; accessibilityFallback: "text" | "table" | "static";
  warnings: string[];
}

export interface SceneNarrationDirective {
  required: boolean; purpose: string;
  outputType: "introduction" | "direct-answer" | "factual-summary"
    | "causal-explanation" | "impact-explanation" | "claim-assessment"
    | "comparison" | "scenario-explanation" | "uncertainty-disclosure"
    | "verification-signal" | "source-note";
  maximumStatements: number; maximumCharacters: number;
  directness: "direct" | "contextual" | "qualified";
  allowedEpistemicTypes: EpistemicType[];
  requiresAttribution: boolean; requiresCitation: boolean;
  requiresUncertaintyDisclosure: boolean; requiresAssumptionDisclosure: boolean;
  prohibitedBehaviors: string[]; sourceStepIds: string[];
  contextItemIds: string[]; warnings: string[];
}

export interface SceneCaptionDirective {
  required: boolean; purpose: string; maximumCharacters: number;
  placement: "above-composer" | "visual-bottom" | "side-panel";
  avoidsComposerOverlap: boolean; mapOcclusionPolicy: "minimal" | "adaptive" | "none";
  sourceStepIds: string[]; warnings: string[];
}

export interface SceneCitationCue {
  id: string; contextItemIds: string[]; excerptIds: string[];
  provenanceRecordIds: string[]; sourceDocumentIds: string[];
  displayPolicy: "inline" | "scene-end" | "briefing-end" | "on-demand";
  attributionRequired: boolean; warnings: string[];
}

export interface SceneUncertaintyCue {
  id: string; planStepIds: string[]; evidenceGapIds: string[];
  disclosure: "explicit" | "label" | "panel"; blocking: boolean; warnings: string[];
}

export interface SafeViewportPolicy {
  reserveBottomComposer: true; reservePlaybackControls: true;
  reserveCaptionArea: true; reserveSidePanel: boolean; mobileSafeAreaRequired: true;
  preservePrimaryVisualFocus: true; insetIntent: "automatic" | "balanced" | "visual-priority";
}

export interface SceneLayoutDirective {
  primaryRegion: "visual" | "document" | "comparison" | "text";
  secondaryPanel: "none" | "sources" | "context" | "uncertainty";
  mapDominance: "none" | "supporting" | "primary";
  composerState: "expanded" | "collapsed" | "playback-controls";
  composerPosition: "bottom-center"; safeViewport: SafeViewportPolicy;
}

export interface BriefingScene {
  id: string; kind: SceneKind; order: number; titleRequirement: string;
  objective: string; sourceSectionIds: string[]; sourceStepIds: string[];
  dependsOnSceneIds: string[]; contentBindings: SceneContentBinding[];
  personalImpactBindings?: Array<PersonalImpactBinding & { planStepId: string }>;
  visualDirectives: SceneVisualDirective[];
  narrationDirective: SceneNarrationDirective; captionDirective: SceneCaptionDirective;
  citationCues: SceneCitationCue[]; uncertaintyCues: SceneUncertaintyCue[];
  interactionDirectives: string[]; layoutDirective: SceneLayoutDirective;
  timingIntent: { pace: "slow" | "normal" | "fast"; hold: "brief" | "standard" | "extended"; userAdvanceAllowed: boolean };
  transitionIntent: { style: "continuous" | "cut" | "minimal" | "none"; preserveUserView: boolean; requiresMotionPlanner: boolean };
  optional: boolean; warnings: string[];
}

export interface BriefingOpening {
  objective: string; establishesScope: boolean; requiredContextItemIds: string[];
  requiredPlanStepIds: string[]; layoutIntent: string;
  narrationRequirement: "required" | "preferred" | "disabled";
  captionRequirement: "required" | "preferred" | "disabled";
  sourceCueIds: string[]; warnings: string[];
}
export interface BriefingClosing {
  objective: string; summaryStepIds: string[]; uncertaintyStepIds: string[];
  verificationSignalStepIds: string[]; requiredContextItemIds: string[];
  sourceCueIds: string[]; returnViewIntent: "overview" | "preserve" | "none";
  followUpPolicy: "offer-current-scene-context" | "offer-general-follow-up" | "disabled";
  warnings: string[];
}

export interface BriefingScriptCoverage {
  overall: number; planSectionCoverage: number; planStepCoverage: number;
  evidenceCoverage: number; citationCoverage: number; uncertaintyCoverage: number;
  visualCoverage: number; accessibilityCoverage: number;
  staticFallbackCoverage: number; interactionCoverage: number;
  missingRequirements: string[]; blockingGaps: string[];
}

export interface BriefingScriptDraft {
  id: string; questionId: string; contractId: string; contextPackageId: string;
  explanationPlanId: string; contractFingerprint: string;
  contextPackageFingerprint: string; explanationPlanFingerprint: string;
  personalContextFingerprint?: string;
  personalizedImpactAnalysisFingerprint?: string;
  personalizedImpactPlanningContext?: PersonalizedImpactPlanningContext;
  scriptVersion: string;
  compiler: { type: "rule" | "llm" | "human"; id: string; version: string; policyVersion: string };
  presentationPreference: BriefingPresentationPreference;
  status: "draft" | "validated" | "invalid" | "insufficient-context" | "static-only";
  titleRequirement: string; opening: BriefingOpening; scenes: BriefingScene[];
  closing: BriefingClosing;
  playbackPolicy: {
    autoplay: false; userInitiated: true; controls: Array<"pause" | "resume" | "previous" | "next" | "jump" | "speed" | "disable-animation">;
    composerDuringPlayback: "playback-controls"; restoreComposerAfterPlayback: true;
  };
  interactionPolicy: {
    pauseOnComposerFocus: true; pauseOnManualMapInteraction: true;
    preserveUserView: true; resumeScriptCameraOnlyOnUserAction: true;
    sourceOpenPolicy: "pause" | "continue"; followUpContext: "current-scene";
  };
  accessibilityPolicy: BriefingPresentationPreference["accessibilityPolicy"] & {
    captionsAvailable: true; staticFallbackAvailable: true;
  };
  coverage: BriefingScriptCoverage; warnings: string[]; stopReason?: string;
  createdAt: string; fingerprint: string;
}

export type ValidatedBriefingScript = BriefingScriptDraft & { status: "validated" | "static-only" };
export type ScriptValidationOutcome = "valid" | "valid-with-warnings" | "invalid" | "insufficient-context" | "static-only";
export type ScriptErrorCode =
  | "SCRIPT_INPUT_INVALID" | "SCRIPT_REFERENCE_MISMATCH"
  | "PRESENTATION_PREFERENCE_INVALID" | "UNSUPPORTED_PRESENTATION_MODE"
  | "PLAN_NOT_VALIDATED" | "CONTEXT_PACKAGE_INVALID" | "SCRIPT_ASSEMBLY_FAILED"
  | "SCRIPT_SCHEMA_INVALID" | "SCRIPT_SEMANTIC_INVALID"
  | "MISSING_REQUIRED_SCENE" | "MISSING_PLAN_STEP_COVERAGE"
  | "DUPLICATE_SCENE_ID" | "INVALID_SCENE_ORDER" | "BROKEN_SCENE_DEPENDENCY"
  | "SCENE_DEPENDENCY_CYCLE" | "BROKEN_CONTENT_BINDING"
  | "BROKEN_CITATION_REFERENCE" | "UNSUPPORTED_VISUAL_DIRECTIVE"
  | "CAMERA_POLICY_VIOLATION" | "STATIC_MODE_VIOLATION"
  | "REDUCED_MOTION_VIOLATION" | "SAFE_VIEWPORT_POLICY_MISSING"
  | "COMPOSER_POLICY_VIOLATION" | "ACCESSIBILITY_REQUIREMENT_MISSING"
  | "STOP_CONDITION_EXCEEDED" | "SCRIPT_VALIDATION_FAILED"
  | "PERSONAL_IMPACT_REFERENCE_INVALID" | "PERSONAL_IMPACT_LINEAGE_MISMATCH";
export interface BriefingScriptValidationIssue {
  code: ScriptErrorCode; severity: "error" | "warning" | "info";
  path: string; message: string; relatedSceneId?: string;
  relatedPlanStepId?: string; relatedContextItemId?: string;
}
export type BriefingScriptValidationResult =
  | { outcome: "valid" | "valid-with-warnings" | "static-only"; script: ValidatedBriefingScript; issues: BriefingScriptValidationIssue[]; fingerprint: string }
  | { outcome: "invalid" | "insufficient-context"; issues: BriefingScriptValidationIssue[]; fingerprint: string };
export type BriefingScriptBuildResult =
  | { success: true; outcome: "validated-script" | "validated-static-script" | "partial-script"; script: BriefingScriptDraft; validation: BriefingScriptValidationResult; warnings: string[] }
  | { success: true; outcome: "insufficient-context" | "unsupported-presentation" | "no-script"; reasons: string[] }
  | { success: false; error: { code: ScriptErrorCode; stage: string; retryable: false; details?: string } };

export interface BriefingScriptCompileInput {
  plan: ValidatedExplanationPlan; contract: BriefingContract;
  contextPackage: EvidenceContextPackage; preference: BriefingPresentationPreference;
  personalizedImpactPlanningContext?: PersonalizedImpactPlanningContext;
}
export interface BriefingScriptRepository {
  save(script: ValidatedBriefingScript): void;
  findById(id: string): ValidatedBriefingScript | undefined;
  findByFingerprint(fingerprint: string): ValidatedBriefingScript | undefined;
  findLatestByExplanationPlan(planId: string): ValidatedBriefingScript | undefined;
}
