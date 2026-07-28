import type { ViewportSnapshot } from "./briefing-session";

interface CommandIdentity {
  commandId: string;
  expectedSessionFingerprint: string;
}

interface TargetScene {
  sceneId: string;
  sceneIndex: number;
}

export type SceneReplacementMapping =
  | {
      strategy: "preserve-current-scene";
      viewportPolicy:
        | "preserve-manual-view"
        | "preserve-when-scene-survives"
        | "apply-replacement-scene-camera";
    }
  | {
      strategy:
        | "map-to-replacement-scene"
        | "map-to-nearest-preceding-scene"
        | "move-to-first-new-scene";
      targetSceneId: string;
      targetSceneIndex: number;
      viewportPolicy:
        | "preserve-manual-view"
        | "preserve-when-scene-survives"
        | "apply-replacement-scene-camera";
    }
  | {
      strategy: "restart-at-opening";
      viewportPolicy: "apply-replacement-scene-camera";
    };

export interface ReplacementSessionIdentity {
  validated: true;
  expectedPreviousScriptFingerprint: string;
  currentQuestionId: string;
  contractId: string;
  contractFingerprint: string;
  contextPackageFingerprint: string;
  planId: string;
  planFingerprint: string;
  scriptId: string;
  scriptFingerprint: string;
  sceneIds: string[];
}

export type ReplanResolution =
  | {
      type: "current-context-answer";
      answerPlanFingerprint: string;
    }
  | {
      type: "clarification-required";
      reasonCode: string;
    }
  | {
      type: "unsupported";
      reasonCode: string;
    };

export type SessionCommand =
  | (CommandIdentity & { type: "START_BRIEFING" })
  | (CommandIdentity & { type: "NEXT_SCENE" } & TargetScene)
  | (CommandIdentity & { type: "PREVIOUS_SCENE" } & TargetScene)
  | (CommandIdentity & { type: "JUMP_TO_SCENE" } & TargetScene)
  | (CommandIdentity & {
      type: "REPLAY_SCENE_MOTION";
      operationId: string;
    })
  | (CommandIdentity & {
      type: "SCENE_MOTION_STARTED";
      operationId: string;
    })
  | (CommandIdentity & {
      type: "SCENE_MOTION_COMPLETED";
      operationId: string;
    })
  | (CommandIdentity & {
      type: "USER_MAP_INTERACTION_STARTED";
      viewportSnapshot: ViewportSnapshot;
    })
  | (CommandIdentity & { type: "KEEP_MANUAL_VIEW" })
  | (CommandIdentity & {
      type: "RETURN_TO_BRIEFING_CAMERA";
      operationId: string;
    })
  | (CommandIdentity & { type: "OPEN_COMPOSER" })
  | (CommandIdentity & { type: "CLOSE_COMPOSER" })
  | (CommandIdentity & {
      type: "SUBMIT_FOLLOW_UP";
      followUpId: string;
      operationId: string;
    })
  | (CommandIdentity & {
      type: "REPLAN_STARTED";
      operationId: string;
    })
  | (CommandIdentity & {
      type: "REPLAN_COMPLETED";
      operationId: string;
      replacement: ReplacementSessionIdentity;
      mapping: SceneReplacementMapping;
    })
  | (CommandIdentity & {
      type: "REPLAN_FAILED";
      operationId: string;
      failure: {
        code: string;
        message: string;
        retryable: boolean;
      };
    })
  | (CommandIdentity & {
      type: "REPLAN_RESOLVED";
      operationId: string;
      startedFromSessionFingerprint: string;
      resultFingerprint: string;
      resolution: ReplanResolution;
      occurredAt: string;
    })
  | (CommandIdentity & { type: "REPLAY_BRIEFING"; sceneId: string })
  | (CommandIdentity & { type: "END_BRIEFING" })
  | (CommandIdentity & { type: "RESET_SESSION" });

export type SessionCommandType = SessionCommand["type"];
