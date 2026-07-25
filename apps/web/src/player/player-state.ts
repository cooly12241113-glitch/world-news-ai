export type PauseReason = "user" | "composer" | "map-interaction" | "source";
export type PlaybackSpeed = "slow" | "normal" | "fast";

export interface BriefingPlayerState {
  status: "exploration" | "ready" | "playing" | "paused" | "ended" | "error";
  sceneCount: number;
  currentSceneIndex: number;
  pauseReason?: PauseReason;
  playbackSpeed: PlaybackSpeed;
  animationEnabled: boolean;
  motionRequestId: number;
  completedMotionRequestId: number;
  mapConflict: boolean;
  composerExpanded: boolean;
  error?: string;
}

export const initialPlayerState: BriefingPlayerState = {
  status: "exploration",
  sceneCount: 0,
  currentSceneIndex: 0,
  playbackSpeed: "normal",
  animationEnabled: true,
  motionRequestId: 0,
  completedMotionRequestId: 0,
  mapConflict: false,
  composerExpanded: false,
};
