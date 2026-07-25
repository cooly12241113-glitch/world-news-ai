import type { BriefingPlayerState, PauseReason, PlaybackSpeed } from "./player-state";

export type PlayerAction =
  | { type: "load"; sceneCount: number }
  | { type: "start" | "pause" | "resume" | "next" | "previous" | "end" | "replay" }
  | { type: "jump"; index: number }
  | { type: "pause-for"; reason: PauseReason }
  | { type: "set-speed"; speed: PlaybackSpeed }
  | { type: "set-animation"; enabled: boolean }
  | { type: "composer-focus" | "composer-cancel" | "map-interaction"
      | "keep-user-map-view" | "return-to-script-camera" | "replay-scene-motion" }
  | { type: "motion-start"; requestId: number }
  | { type: "motion-complete"; requestId: number }
  | { type: "error"; message: string };

export function playerReducer(
  state: BriefingPlayerState,
  action: PlayerAction,
): BriefingPlayerState {
  switch (action.type) {
    case "load":
      return { ...state, status: action.sceneCount > 0 ? "ready" : "error",
        sceneCount: action.sceneCount, currentSceneIndex: 0,
        ...(action.sceneCount > 0 ? {} : { error: "No scenes available." }) };
    case "start":
    case "resume":
      return state.sceneCount > 0 && state.status !== "ended"
        ? { ...state, status: "playing", pauseReason: undefined, mapConflict: false }
        : state;
    case "replay":
      return state.sceneCount > 0
        ? { ...state, currentSceneIndex: 0, status: "playing", composerExpanded: false }
        : state;
    case "pause":
      return state.status === "playing" ? { ...state, status: "paused", pauseReason: "user" } : state;
    case "pause-for":
      return { ...state, status: "paused", pauseReason: action.reason };
    case "next": {
      const next = Math.min(state.currentSceneIndex + 1, state.sceneCount - 1);
      return { ...state, currentSceneIndex: next,
        status: next === state.sceneCount - 1 ? "ended" : state.status };
    }
    case "previous":
      return { ...state, currentSceneIndex: Math.max(0, state.currentSceneIndex - 1),
        status: state.status === "ended" ? "paused" : state.status };
    case "jump":
      return action.index >= 0 && action.index < state.sceneCount
        ? { ...state, currentSceneIndex: action.index,
          status: action.index === state.sceneCount - 1 ? "ended" : state.status }
        : state;
    case "end":
      return { ...state, currentSceneIndex: 0,
        status: "exploration", composerExpanded: false };
    case "set-speed":
      return { ...state, playbackSpeed: action.speed };
    case "set-animation":
      return { ...state, animationEnabled: action.enabled };
    case "composer-focus":
      return { ...state, status: state.status === "playing" ? "paused" : state.status,
        pauseReason: state.status === "playing" ? "composer" : state.pauseReason,
        composerExpanded: true };
    case "composer-cancel":
      return { ...state, composerExpanded: false };
    case "map-interaction":
      return { ...state, status: "paused", pauseReason: "map-interaction", mapConflict: true };
    case "keep-user-map-view":
      return { ...state, mapConflict: false };
    case "return-to-script-camera":
      return { ...state, mapConflict: false, motionRequestId: state.motionRequestId + 1 };
    case "replay-scene-motion":
      return { ...state, motionRequestId: state.motionRequestId + 1 };
    case "motion-start":
      return action.requestId > state.motionRequestId ? { ...state, motionRequestId: action.requestId } : state;
    case "motion-complete":
      return action.requestId === state.motionRequestId
        ? { ...state, completedMotionRequestId: action.requestId } : state;
    case "error":
      return { ...state, status: "error", error: action.message };
  }
}
