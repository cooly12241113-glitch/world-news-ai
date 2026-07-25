import type { BriefingPresentationPreference, PresentationMode } from "./models";

export function presentationPreference(
  mode: PresentationMode = "auto",
): BriefingPresentationPreference {
  const staticMode = mode === "static";
  const reduced = mode === "reduced-motion";
  return {
    mode, playbackSpeed: "normal",
    animationPolicy: staticMode ? "disabled" : reduced ? "minimal" : "full",
    cameraMotionPolicy: staticMode ? "disallow" : reduced ? "minimize" : "allow",
    narrationPolicy: "preferred", captionPolicy: "always",
    sourceDisplayPolicy: "scene-end", panelPolicy: "contextual",
    composerPolicy: {
      position: "bottom-center", collapsedByDefault: true,
      collapseDuringPlayback: true, expandOnUserFocus: true,
      pausePlaybackOnFocus: true, preserveMapViewport: true,
    },
    accessibilityPolicy: {
      reducedMotionAvailable: true, staticFallbackRequired: true,
      keyboardNavigationRequired: true, screenReaderLabelsRequired: true,
      colorIndependentMeaningRequired: true,
    },
    userInitiated: true, autoplay: false, preferenceVersion: "presentation-v1",
  };
}
