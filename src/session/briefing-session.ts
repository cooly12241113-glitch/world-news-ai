import type { BriefingPresentationPreference } from "../script/models";

export const BRIEFING_SESSION_STATUSES = [
  "exploration",
  "briefing-ready",
  "presenting-scene",
  "scene-motion-running",
  "manual-map-view",
  "composer-open",
  "replanning",
  "closing",
  "ended",
  "error",
] as const;

export type BriefingSessionStatus = (typeof BRIEFING_SESSION_STATUSES)[number];

export type ReturnableSessionStatus = Exclude<
  BriefingSessionStatus,
  "composer-open" | "replanning" | "error"
>;

export type AnalysisTab =
  | "key"
  | "evidence"
  | "limits"
  | "uncertainty"
  | "sources";

export interface SceneCursor {
  sceneId: string;
  sceneIndex: number;
  totalScenes: number;
  visitedSceneIds: string[];
}

export interface ViewportSnapshot {
  center: {
    longitude: number;
    latitude: number;
  };
  zoom: number;
  bearing: number;
  pitch: number;
}

export type ManualMapViewState =
  | { status: "inactive" }
  | { status: "active"; viewportSnapshot: ViewportSnapshot }
  | {
      status: "returning-to-briefing";
      viewportSnapshot: ViewportSnapshot;
    };

export type ComposerState = "closed" | "compact" | "expanded";

export type SessionOperationKind =
  | "scene-motion"
  | "return-to-briefing-camera"
  | "follow-up"
  | "replan";

export interface ActiveOperation {
  operationId: string;
  kind: SessionOperationKind;
  startedFromSessionFingerprint: string;
  targetSceneId?: string;
}

export interface SessionErrorState {
  code: string;
  message: string;
  retryable: boolean;
}

export interface BriefingSession {
  sessionId: string;
  status: BriefingSessionStatus;
  originalQuestionId: string;
  currentQuestionId: string;
  contractId: string;
  contractFingerprint: string;
  contextPackageFingerprint: string;
  planId: string;
  planFingerprint: string;
  scriptId: string;
  scriptFingerprint: string;
  sceneCursor: SceneCursor;
  presentationPreference: BriefingPresentationPreference;
  selectedAnalysisTab: AnalysisTab;
  viewportSnapshot?: ViewportSnapshot;
  manualMapViewState: ManualMapViewState;
  composerState: ComposerState;
  activeOperation?: ActiveOperation;
  resumeStatus?: ReturnableSessionStatus;
  followUpParentId?: string;
  error?: SessionErrorState;
  policyVersion: string;
  createdAt: string;
  updatedAt: string;
  semanticFingerprint: string;
}
