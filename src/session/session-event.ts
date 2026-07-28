import type {
  BriefingSessionStatus,
  ComposerState,
  ManualMapViewState,
} from "./briefing-session";
import type { SessionCommandType } from "./session-command";

export interface SessionEvent {
  eventId: string;
  type: "SESSION_TRANSITIONED" | "SESSION_TRANSITION_REJECTED";
  commandId: string;
  commandType: SessionCommandType;
  sessionId: string;
  fromStatus: BriefingSessionStatus;
  toStatus: BriefingSessionStatus;
  previousFingerprint: string;
  nextFingerprint?: string;
  sceneId: string;
  sceneIndex: number;
  composerState: ComposerState;
  manualMapViewStatus: ManualMapViewState["status"];
  operationId?: string;
  occurredAt: string;
  policyVersion: string;
}
