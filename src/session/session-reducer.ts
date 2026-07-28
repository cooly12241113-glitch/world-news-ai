import type {
  BriefingSession,
  BriefingSessionStatus,
  ReturnableSessionStatus,
} from "./briefing-session";
import type { SessionAuditRecord, SessionTransitionOutcome } from "./session-audit";
import type { SessionCommand, SessionCommandType } from "./session-command";
import type { SessionEvent } from "./session-event";
import type {
  SessionTransitionError,
  SessionTransitionErrorCode,
} from "./errors";
import { createBriefingSessionFingerprint } from "./session-fingerprint";
import {
  BriefingSessionSchema,
  SessionCommandSchema,
} from "./session-validator";

export interface DeterministicSessionContext {
  transitionTimestamp: string;
  eventId: string;
  auditRecordId: string;
  policyVersion: string;
}

export type SessionTransitionResult =
  | {
      success: true;
      previousSessionFingerprint: string;
      nextSession: BriefingSession;
      nextSessionFingerprint: string;
      emittedEvents: SessionEvent[];
      auditRecord: SessionAuditRecord;
    }
  | {
      success: false;
      previousSessionFingerprint?: string;
      emittedEvents: SessionEvent[];
      auditRecord?: SessionAuditRecord;
      structuredError: SessionTransitionError;
    };

class TransitionRejected extends Error {
  constructor(
    readonly code: SessionTransitionErrorCode,
    message: string,
    readonly outcome: SessionTransitionOutcome = "rejected",
  ) {
    super(message);
  }
}

function reject(
  code: SessionTransitionErrorCode,
  message: string,
  outcome?: SessionTransitionOutcome,
): never {
  throw new TransitionRejected(code, message, outcome);
}

function requireStatus(
  session: BriefingSession,
  allowed: BriefingSessionStatus[],
): void {
  if (!allowed.includes(session.status)) {
    reject("INVALID_TRANSITION", `${session.status} does not allow this command`);
  }
}

function requireOperation(
  session: BriefingSession,
  operationId: string,
): NonNullable<BriefingSession["activeOperation"]> {
  if (
    session.activeOperation === undefined ||
    session.activeOperation.operationId !== operationId
  ) {
    reject("STALE_OPERATION", "The operation no longer owns this transition", "ignored-stale");
  }
  return session.activeOperation;
}

function moveToScene(
  session: BriefingSession,
  sceneId: string,
  sceneIndex: number,
): void {
  if (sceneIndex < 0 || sceneIndex >= session.sceneCursor.totalScenes) {
    reject("SCENE_OUT_OF_BOUNDS", "Target scene is outside the script");
  }
  session.sceneCursor = {
    sceneId,
    sceneIndex,
    totalScenes: session.sceneCursor.totalScenes,
    visitedSceneIds: session.sceneCursor.visitedSceneIds.includes(sceneId)
      ? [...session.sceneCursor.visitedSceneIds]
      : [...session.sceneCursor.visitedSceneIds, sceneId],
  };
  session.status =
    sceneIndex === session.sceneCursor.totalScenes - 1
      ? "closing"
      : "presenting-scene";
  session.manualMapViewState = { status: "inactive" };
  delete session.viewportSnapshot;
  delete session.activeOperation;
}

function resolveReplacementScene(
  session: BriefingSession,
  command: Extract<SessionCommand, { type: "REPLAN_COMPLETED" }>,
): { sceneId: string; sceneIndex: number; preserveManualView: boolean } {
  const { sceneIds } = command.replacement;
  if (new Set(sceneIds).size !== sceneIds.length) {
    reject("INVALID_REPLACEMENT", "Replacement scene IDs must be unique");
  }
  if (command.mapping.strategy === "preserve-current-scene") {
    const sceneIndex = sceneIds.indexOf(session.sceneCursor.sceneId);
    if (sceneIndex < 0) {
      reject("INVALID_SCENE_MAPPING", "Current scene is absent from replacement");
    }
    return {
      sceneId: session.sceneCursor.sceneId,
      sceneIndex,
      preserveManualView:
        command.mapping.viewportPolicy === "preserve-manual-view" ||
        command.mapping.viewportPolicy === "preserve-when-scene-survives",
    };
  }
  if (command.mapping.strategy === "restart-at-opening") {
    return { sceneId: sceneIds[0]!, sceneIndex: 0, preserveManualView: false };
  }
  if (
    sceneIds[command.mapping.targetSceneIndex] !== command.mapping.targetSceneId
  ) {
    reject("INVALID_SCENE_MAPPING", "Replacement scene ID and index do not match");
  }
  return {
    sceneId: command.mapping.targetSceneId,
    sceneIndex: command.mapping.targetSceneIndex,
    preserveManualView:
      command.mapping.viewportPolicy === "preserve-manual-view",
  };
}

function applyCommand(session: BriefingSession, command: SessionCommand): void {
  switch (command.type) {
    case "START_BRIEFING":
      requireStatus(session, ["exploration", "briefing-ready"]);
      session.status = "presenting-scene";
      session.composerState = "compact";
      return;
    case "NEXT_SCENE":
      requireStatus(session, [
        "presenting-scene", "scene-motion-running", "manual-map-view",
      ]);
      if (command.sceneIndex !== session.sceneCursor.sceneIndex + 1) {
        reject("SCENE_ID_MISMATCH", "Next scene must immediately follow current scene");
      }
      moveToScene(session, command.sceneId, command.sceneIndex);
      return;
    case "PREVIOUS_SCENE":
      requireStatus(session, [
        "presenting-scene", "scene-motion-running", "manual-map-view", "closing",
      ]);
      if (command.sceneIndex !== session.sceneCursor.sceneIndex - 1) {
        reject("SCENE_ID_MISMATCH", "Previous scene must immediately precede current scene");
      }
      moveToScene(session, command.sceneId, command.sceneIndex);
      return;
    case "JUMP_TO_SCENE":
      requireStatus(session, [
        "presenting-scene", "scene-motion-running", "manual-map-view", "closing",
      ]);
      moveToScene(session, command.sceneId, command.sceneIndex);
      return;
    case "REPLAY_SCENE_MOTION":
    case "SCENE_MOTION_STARTED":
      requireStatus(session, ["presenting-scene", "scene-motion-running"]);
      if (session.activeOperation !== undefined) {
        requireOperation(session, command.operationId);
      }
      session.status = "scene-motion-running";
      session.activeOperation = {
        operationId: command.operationId,
        kind: "scene-motion",
        startedFromSessionFingerprint: command.expectedSessionFingerprint,
        targetSceneId: session.sceneCursor.sceneId,
      };
      return;
    case "SCENE_MOTION_COMPLETED": {
      requireStatus(session, ["scene-motion-running"]);
      const operation = requireOperation(session, command.operationId);
      if (
        operation.kind !== "scene-motion" &&
        operation.kind !== "return-to-briefing-camera"
      ) {
        reject("STALE_OPERATION", "Operation is not a scene motion", "ignored-stale");
      }
      session.status = "presenting-scene";
      session.manualMapViewState = { status: "inactive" };
      delete session.viewportSnapshot;
      delete session.activeOperation;
      return;
    }
    case "USER_MAP_INTERACTION_STARTED":
      requireStatus(session, ["presenting-scene", "scene-motion-running"]);
      session.status = "manual-map-view";
      session.viewportSnapshot = command.viewportSnapshot;
      session.manualMapViewState = {
        status: "active",
        viewportSnapshot: command.viewportSnapshot,
      };
      delete session.activeOperation;
      return;
    case "KEEP_MANUAL_VIEW":
      requireStatus(session, ["manual-map-view"]);
      return;
    case "RETURN_TO_BRIEFING_CAMERA":
      requireStatus(session, ["manual-map-view"]);
      if (session.manualMapViewState.status !== "active") {
        reject("INVALID_SESSION", "Manual viewport snapshot is unavailable");
      }
      session.status = "scene-motion-running";
      session.manualMapViewState = {
        status: "returning-to-briefing",
        viewportSnapshot: session.manualMapViewState.viewportSnapshot,
      };
      session.activeOperation = {
        operationId: command.operationId,
        kind: "return-to-briefing-camera",
        startedFromSessionFingerprint: command.expectedSessionFingerprint,
        targetSceneId: session.sceneCursor.sceneId,
      };
      return;
    case "OPEN_COMPOSER":
      requireStatus(session, [
        "exploration", "briefing-ready", "presenting-scene", "scene-motion-running",
        "manual-map-view", "closing", "ended",
      ]);
      session.resumeStatus =
        session.status === "scene-motion-running"
          ? "presenting-scene"
          : (session.status as ReturnableSessionStatus);
      session.status = "composer-open";
      session.composerState = "expanded";
      delete session.activeOperation;
      return;
    case "CLOSE_COMPOSER":
      requireStatus(session, ["composer-open"]);
      session.status = session.resumeStatus ?? "briefing-ready";
      session.composerState =
        session.status === "exploration" ? "closed" : "compact";
      delete session.resumeStatus;
      delete session.error;
      return;
    case "SUBMIT_FOLLOW_UP":
      requireStatus(session, ["composer-open"]);
      session.status = "replanning";
      session.composerState = "expanded";
      session.followUpParentId = command.followUpId;
      session.activeOperation = {
        operationId: command.operationId,
        kind: "follow-up",
        startedFromSessionFingerprint: command.expectedSessionFingerprint,
      };
      return;
    case "REPLAN_STARTED": {
      requireStatus(session, ["replanning"]);
      const operation = requireOperation(session, command.operationId);
      if (operation.kind === "replan") {
        reject("DUPLICATE_REPLAN_START", "Replanning already started");
      }
      if (operation.kind !== "follow-up") {
        reject("STALE_OPERATION", "Follow-up operation is no longer active", "ignored-stale");
      }
      session.activeOperation = { ...operation, kind: "replan" };
      return;
    }
    case "REPLAN_COMPLETED": {
      requireStatus(session, ["replanning"]);
      const operation = requireOperation(session, command.operationId);
      if (operation.kind !== "replan") {
        reject("STALE_OPERATION", "Replan operation has not started", "ignored-stale");
      }
      if (
        command.replacement.expectedPreviousScriptFingerprint !==
        session.scriptFingerprint
      ) {
        reject("SCRIPT_FINGERPRINT_MISMATCH", "Replacement targets another script");
      }
      const target = resolveReplacementScene(session, command);
      const preserveManual =
        target.preserveManualView &&
        session.manualMapViewState.status !== "inactive";
      session.currentQuestionId = command.replacement.currentQuestionId;
      session.contractId = command.replacement.contractId;
      session.contractFingerprint = command.replacement.contractFingerprint;
      session.contextPackageFingerprint =
        command.replacement.contextPackageFingerprint;
      session.planId = command.replacement.planId;
      session.planFingerprint = command.replacement.planFingerprint;
      session.scriptId = command.replacement.scriptId;
      session.scriptFingerprint = command.replacement.scriptFingerprint;
      session.sceneCursor = {
        sceneId: target.sceneId,
        sceneIndex: target.sceneIndex,
        totalScenes: command.replacement.sceneIds.length,
        visitedSceneIds: [
          ...session.sceneCursor.visitedSceneIds.filter((id) =>
            command.replacement.sceneIds.includes(id),
          ),
          ...(!session.sceneCursor.visitedSceneIds.includes(target.sceneId)
            ? [target.sceneId]
            : []),
        ],
      };
      session.status = preserveManual
        ? "manual-map-view"
        : target.sceneIndex === command.replacement.sceneIds.length - 1
          ? "closing"
          : "presenting-scene";
      if (!preserveManual) {
        session.manualMapViewState = { status: "inactive" };
        delete session.viewportSnapshot;
      }
      session.composerState = "compact";
      delete session.activeOperation;
      delete session.resumeStatus;
      delete session.error;
      return;
    }
    case "REPLAN_FAILED":
      requireStatus(session, ["replanning"]);
      requireOperation(session, command.operationId);
      session.status = session.resumeStatus ?? "briefing-ready";
      session.composerState =
        session.status === "exploration" ? "closed" : "compact";
      session.error = command.failure;
      delete session.activeOperation;
      delete session.resumeStatus;
      return;
    case "REPLAN_RESOLVED": {
      requireStatus(session, ["replanning"]);
      const operation = requireOperation(session, command.operationId);
      if (
        operation.kind !== "replan" ||
        operation.startedFromSessionFingerprint !==
          command.startedFromSessionFingerprint
      ) {
        reject("STALE_OPERATION", "Resolution does not own the active replan", "ignored-stale");
      }
      if (command.resolution.type === "current-context-answer") {
        session.status = session.resumeStatus ?? "presenting-scene";
        session.composerState =
          session.status === "exploration" ? "closed" : "compact";
        delete session.resumeStatus;
      } else {
        session.status = "composer-open";
        session.composerState = "expanded";
      }
      delete session.activeOperation;
      delete session.error;
      return;
    }
    case "REPLAY_BRIEFING":
      requireStatus(session, ["closing", "ended"]);
      moveToScene(session, command.sceneId, 0);
      session.composerState = "compact";
      return;
    case "END_BRIEFING":
      if (session.status === "ended") {
        return;
      }
      requireStatus(session, [
        "presenting-scene", "scene-motion-running", "manual-map-view", "closing",
      ]);
      session.status = "ended";
      session.composerState = "compact";
      session.manualMapViewState = { status: "inactive" };
      delete session.viewportSnapshot;
      delete session.activeOperation;
      return;
    case "RESET_SESSION": {
      const openingSceneId = session.sceneCursor.visitedSceneIds[0]!;
      session.status = "exploration";
      session.sceneCursor = {
        sceneId: openingSceneId,
        sceneIndex: 0,
        totalScenes: session.sceneCursor.totalScenes,
        visitedSceneIds: [openingSceneId],
      };
      session.currentQuestionId = session.originalQuestionId;
      session.manualMapViewState = { status: "inactive" };
      session.composerState = "closed";
      delete session.viewportSnapshot;
      delete session.activeOperation;
      delete session.resumeStatus;
      delete session.followUpParentId;
      delete session.error;
    }
  }
}

function makeAudit(
  session: BriefingSession,
  command: SessionCommand,
  context: DeterministicSessionContext,
  outcome: SessionTransitionOutcome,
  nextFingerprint?: string,
  errorCode?: string,
): SessionAuditRecord {
  return {
    auditRecordId: context.auditRecordId,
    sessionId: session.sessionId,
    commandType: command.type,
    previousFingerprint: session.semanticFingerprint,
    ...(nextFingerprint === undefined ? {} : { nextFingerprint }),
    transitionOutcome: outcome,
    ...(errorCode === undefined ? {} : { errorCode }),
    sceneId: session.sceneCursor.sceneId,
    ...("operationId" in command ? { operationId: command.operationId } : {}),
    policyVersion: context.policyVersion,
    occurredAt: context.transitionTimestamp,
  };
}

function makeEvent(
  previous: BriefingSession,
  next: BriefingSession,
  command: SessionCommand,
  context: DeterministicSessionContext,
  accepted: boolean,
): SessionEvent {
  return {
    eventId: context.eventId,
    type: accepted ? "SESSION_TRANSITIONED" : "SESSION_TRANSITION_REJECTED",
    commandId: command.commandId,
    commandType: command.type,
    sessionId: previous.sessionId,
    fromStatus: previous.status,
    toStatus: next.status,
    previousFingerprint: previous.semanticFingerprint,
    ...(accepted ? { nextFingerprint: next.semanticFingerprint } : {}),
    sceneId: next.sceneCursor.sceneId,
    sceneIndex: next.sceneCursor.sceneIndex,
    composerState: next.composerState,
    manualMapViewStatus: next.manualMapViewState.status,
    ...("operationId" in command ? { operationId: command.operationId } : {}),
    occurredAt: context.transitionTimestamp,
    policyVersion: context.policyVersion,
  };
}

export function reduceBriefingSession(
  inputSession: BriefingSession,
  inputCommand: SessionCommand,
  context: DeterministicSessionContext,
): SessionTransitionResult {
  const parsedSession = BriefingSessionSchema.safeParse(inputSession);
  if (!parsedSession.success) {
    return {
      success: false,
      emittedEvents: [],
      structuredError: {
        code: "INVALID_SESSION",
        message: parsedSession.error.message,
        retryable: false,
      },
    };
  }
  const parsedCommand = SessionCommandSchema.safeParse(inputCommand);
  if (!parsedCommand.success) {
    return {
      success: false,
      previousSessionFingerprint: parsedSession.data.semanticFingerprint,
      emittedEvents: [],
      structuredError: {
        code: "INVALID_COMMAND",
        message: parsedCommand.error.message,
        retryable: false,
      },
    };
  }
  const session = parsedSession.data;
  const command = parsedCommand.data;
  const actualFingerprint = createBriefingSessionFingerprint(session);
  if (
    actualFingerprint !== session.semanticFingerprint ||
    command.expectedSessionFingerprint !== session.semanticFingerprint
  ) {
    const error: SessionTransitionError = {
      code: "STALE_SESSION_FINGERPRINT",
      message: "Command does not target the current semantic session state",
      commandType: command.type,
      retryable: true,
    };
    const audit = makeAudit(
      session,
      command,
      context,
      "ignored-stale",
      undefined,
      error.code,
    );
    return {
      success: false,
      previousSessionFingerprint: session.semanticFingerprint,
      emittedEvents: [makeEvent(session, session, command, context, false)],
      auditRecord: audit,
      structuredError: error,
    };
  }

  const next = structuredClone(session);
  try {
    applyCommand(next, command);
    next.updatedAt = context.transitionTimestamp;
    next.policyVersion = context.policyVersion;
    next.semanticFingerprint = createBriefingSessionFingerprint(next);
    const validated = BriefingSessionSchema.safeParse(next);
    if (!validated.success) {
      reject("INVALID_SESSION", validated.error.message, "failed");
    }
    const audit = makeAudit(
      session,
      command,
      context,
      "accepted",
      next.semanticFingerprint,
    );
    return {
      success: true,
      previousSessionFingerprint: session.semanticFingerprint,
      nextSession: next,
      nextSessionFingerprint: next.semanticFingerprint,
      emittedEvents: [makeEvent(session, next, command, context, true)],
      auditRecord: audit,
    };
  } catch (caught) {
    const failure =
      caught instanceof TransitionRejected
        ? caught
        : new TransitionRejected("INVALID_SESSION", "Session transition failed", "failed");
    const error: SessionTransitionError = {
      code: failure.code,
      message: failure.message,
      commandType: command.type as SessionCommandType,
      retryable:
        failure.code === "STALE_OPERATION" ||
        failure.code === "STALE_SESSION_FINGERPRINT",
    };
    const audit = makeAudit(
      session,
      command,
      context,
      failure.outcome,
      undefined,
      failure.code,
    );
    return {
      success: false,
      previousSessionFingerprint: session.semanticFingerprint,
      emittedEvents: [makeEvent(session, session, command, context, false)],
      auditRecord: audit,
      structuredError: error,
    };
  }
}
