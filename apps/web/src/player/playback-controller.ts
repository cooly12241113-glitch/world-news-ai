import type { BriefingPlayerState } from "./player-state";

export function sceneAdvanceDelay(state: BriefingPlayerState): number | undefined {
  if (state.status !== "playing" || state.currentSceneIndex >= state.sceneCount - 1) return undefined;
  return { slow: 6200, normal: 4800, fast: 3400 }[state.playbackSpeed];
}
