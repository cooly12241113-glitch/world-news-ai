import type { BriefingSession } from "@world-news-ai/session";
import type { BriefingPlayerState } from "../../player/player-state";

export function synchronizePlayerWithSession(
  player: BriefingPlayerState,
  session: BriefingSession,
): BriefingPlayerState {
  return {
    ...player,
    status: session.status === "ended" ? "ended" : player.status,
    sceneCount: session.sceneCursor.totalScenes,
    currentSceneIndex: session.sceneCursor.sceneIndex,
    composerExpanded: session.composerState === "expanded",
  };
}
