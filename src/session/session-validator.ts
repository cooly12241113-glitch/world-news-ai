import { z } from "zod";
import { BriefingPresentationPreferenceSchema } from "../script/validation";
import type { BriefingSession } from "./briefing-session";
import { BRIEFING_SESSION_STATUSES } from "./briefing-session";
import type {
  ReplacementSessionIdentity,
  SceneReplacementMapping,
  SessionCommand,
} from "./session-command";
import type { SessionAuditRecord } from "./session-audit";
import type { SessionEvent } from "./session-event";

const Id = z.string().trim().min(1);
const Fingerprint = z.string().trim().min(1);
const Timestamp = z.iso.datetime();
const Status = z.enum(BRIEFING_SESSION_STATUSES);
const ReturnableStatus = Status.exclude(["composer-open", "replanning", "error"]);
const AnalysisTab = z.enum(["key", "evidence", "limits", "uncertainty", "sources"]);
const ComposerState = z.enum(["closed", "compact", "expanded"]);
const OperationKind = z.enum([
  "scene-motion",
  "return-to-briefing-camera",
  "follow-up",
  "replan",
]);
const CommandType = z.enum([
  "START_BRIEFING", "NEXT_SCENE", "PREVIOUS_SCENE", "JUMP_TO_SCENE",
  "REPLAY_SCENE_MOTION", "SCENE_MOTION_STARTED", "SCENE_MOTION_COMPLETED",
  "USER_MAP_INTERACTION_STARTED", "KEEP_MANUAL_VIEW", "RETURN_TO_BRIEFING_CAMERA",
  "OPEN_COMPOSER", "CLOSE_COMPOSER", "SUBMIT_FOLLOW_UP", "REPLAN_STARTED",
  "REPLAN_COMPLETED", "REPLAN_FAILED", "REPLAY_BRIEFING", "END_BRIEFING",
  "RESET_SESSION",
]);

export const ViewportSnapshotSchema = z.strictObject({
  center: z.strictObject({
    longitude: z.number().finite().min(-180).max(180),
    latitude: z.number().finite().min(-90).max(90),
  }),
  zoom: z.number().finite().min(0).max(24),
  bearing: z.number().finite(),
  pitch: z.number().finite().min(0).max(85),
});

export const SceneCursorSchema = z
  .strictObject({
    sceneId: Id,
    sceneIndex: z.number().int().nonnegative(),
    totalScenes: z.number().int().positive(),
    visitedSceneIds: z.array(Id).min(1),
  })
  .superRefine((cursor, context) => {
    if (cursor.sceneIndex >= cursor.totalScenes) {
      context.addIssue({ code: "custom", message: "Scene index is out of bounds." });
    }
    if (new Set(cursor.visitedSceneIds).size !== cursor.visitedSceneIds.length) {
      context.addIssue({ code: "custom", message: "Visited scene IDs must be unique." });
    }
    if (!cursor.visitedSceneIds.includes(cursor.sceneId)) {
      context.addIssue({ code: "custom", message: "Current scene must be visited." });
    }
  });

export const ManualMapViewStateSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("inactive") }),
  z.strictObject({
    status: z.literal("active"),
    viewportSnapshot: ViewportSnapshotSchema,
  }),
  z.strictObject({
    status: z.literal("returning-to-briefing"),
    viewportSnapshot: ViewportSnapshotSchema,
  }),
]);

export const ActiveOperationSchema = z.strictObject({
  operationId: Id,
  kind: OperationKind,
  startedFromSessionFingerprint: Fingerprint,
  targetSceneId: Id.optional(),
});

export const BriefingSessionSchema: z.ZodType<BriefingSession> = z
  .strictObject({
    sessionId: Id,
    status: Status,
    originalQuestionId: Id,
    currentQuestionId: Id,
    contractId: Id,
    contractFingerprint: Fingerprint,
    contextPackageFingerprint: Fingerprint,
    planId: Id,
    planFingerprint: Fingerprint,
    scriptId: Id,
    scriptFingerprint: Fingerprint,
    sceneCursor: SceneCursorSchema,
    presentationPreference: BriefingPresentationPreferenceSchema,
    selectedAnalysisTab: AnalysisTab,
    viewportSnapshot: ViewportSnapshotSchema.optional(),
    manualMapViewState: ManualMapViewStateSchema,
    composerState: ComposerState,
    activeOperation: ActiveOperationSchema.optional(),
    resumeStatus: ReturnableStatus.optional(),
    followUpParentId: Id.optional(),
    error: z
      .strictObject({ code: Id, message: Id, retryable: z.boolean() })
      .optional(),
    policyVersion: Id,
    createdAt: Timestamp,
    updatedAt: Timestamp,
    semanticFingerprint: Fingerprint,
  })
  .superRefine((session, context) => {
    if (
      session.status === "manual-map-view" &&
      session.manualMapViewState.status !== "active"
    ) {
      context.addIssue({ code: "custom", message: "Manual map view must be active." });
    }
    if (
      session.status !== "manual-map-view" &&
      session.status !== "scene-motion-running" &&
      session.manualMapViewState.status === "active"
    ) {
      context.addIssue({ code: "custom", message: "Active manual view has invalid status." });
    }
    if (
      (session.status === "composer-open" || session.status === "replanning") &&
      session.composerState !== "expanded"
    ) {
      context.addIssue({ code: "custom", message: "Composer must be expanded." });
    }
    if (session.status === "replanning" && session.activeOperation === undefined) {
      context.addIssue({ code: "custom", message: "Replanning requires an operation." });
    }
  });

const CommandIdentity = {
  commandId: Id,
  expectedSessionFingerprint: Fingerprint,
};
const TargetScene = { sceneId: Id, sceneIndex: z.number().int().nonnegative() };
const Operation = { operationId: Id };
const ViewportPolicy = z.enum([
  "preserve-manual-view",
  "preserve-when-scene-survives",
  "apply-replacement-scene-camera",
]);

export const SceneReplacementMappingSchema: z.ZodType<SceneReplacementMapping> =
  z.discriminatedUnion("strategy", [
    z.strictObject({
      strategy: z.literal("preserve-current-scene"),
      viewportPolicy: ViewportPolicy,
    }),
    z.strictObject({
      strategy: z.enum([
        "map-to-replacement-scene",
        "map-to-nearest-preceding-scene",
        "move-to-first-new-scene",
      ]),
      targetSceneId: Id,
      targetSceneIndex: z.number().int().nonnegative(),
      viewportPolicy: ViewportPolicy,
    }),
    z.strictObject({
      strategy: z.literal("restart-at-opening"),
      viewportPolicy: z.literal("apply-replacement-scene-camera"),
    }),
  ]);

export const ReplacementSessionIdentitySchema: z.ZodType<ReplacementSessionIdentity> =
  z.strictObject({
    validated: z.literal(true),
    expectedPreviousScriptFingerprint: Fingerprint,
    currentQuestionId: Id,
    contractId: Id,
    contractFingerprint: Fingerprint,
    contextPackageFingerprint: Fingerprint,
    planId: Id,
    planFingerprint: Fingerprint,
    scriptId: Id,
    scriptFingerprint: Fingerprint,
    sceneIds: z.array(Id).min(1),
  });

export const SessionCommandSchema: z.ZodType<SessionCommand> =
  z.discriminatedUnion("type", [
    z.strictObject({ ...CommandIdentity, type: z.literal("START_BRIEFING") }),
    ...(["NEXT_SCENE", "PREVIOUS_SCENE", "JUMP_TO_SCENE"] as const).map((type) =>
      z.strictObject({ ...CommandIdentity, type: z.literal(type), ...TargetScene }),
    ),
    ...(["REPLAY_SCENE_MOTION", "SCENE_MOTION_STARTED", "SCENE_MOTION_COMPLETED", "RETURN_TO_BRIEFING_CAMERA", "REPLAN_STARTED"] as const).map((type) =>
      z.strictObject({ ...CommandIdentity, type: z.literal(type), ...Operation }),
    ),
    z.strictObject({
      ...CommandIdentity,
      type: z.literal("USER_MAP_INTERACTION_STARTED"),
      viewportSnapshot: ViewportSnapshotSchema,
    }),
    ...(["KEEP_MANUAL_VIEW", "OPEN_COMPOSER", "CLOSE_COMPOSER", "END_BRIEFING", "RESET_SESSION"] as const).map((type) =>
      z.strictObject({ ...CommandIdentity, type: z.literal(type) }),
    ),
    z.strictObject({
      ...CommandIdentity,
      type: z.literal("SUBMIT_FOLLOW_UP"),
      followUpId: Id,
      operationId: Id,
    }),
    z.strictObject({
      ...CommandIdentity,
      type: z.literal("REPLAN_COMPLETED"),
      operationId: Id,
      replacement: ReplacementSessionIdentitySchema,
      mapping: SceneReplacementMappingSchema,
    }),
    z.strictObject({
      ...CommandIdentity,
      type: z.literal("REPLAN_FAILED"),
      operationId: Id,
      failure: z.strictObject({ code: Id, message: Id, retryable: z.boolean() }),
    }),
    z.strictObject({
      ...CommandIdentity,
      type: z.literal("REPLAY_BRIEFING"),
      sceneId: Id,
    }),
  ]) as z.ZodType<SessionCommand>;

export const SessionEventSchema: z.ZodType<SessionEvent> = z.strictObject({
  eventId: Id,
  type: z.enum(["SESSION_TRANSITIONED", "SESSION_TRANSITION_REJECTED"]),
  commandId: Id,
  commandType: CommandType,
  sessionId: Id,
  fromStatus: Status,
  toStatus: Status,
  previousFingerprint: Fingerprint,
  nextFingerprint: Fingerprint.optional(),
  sceneId: Id,
  sceneIndex: z.number().int().nonnegative(),
  composerState: ComposerState,
  manualMapViewStatus: z.enum(["inactive", "active", "returning-to-briefing"]),
  operationId: Id.optional(),
  occurredAt: Timestamp,
  policyVersion: Id,
});

export const SessionAuditRecordSchema: z.ZodType<SessionAuditRecord> =
  z.strictObject({
    auditRecordId: Id,
    sessionId: Id,
    commandType: CommandType,
    previousFingerprint: Fingerprint,
    nextFingerprint: Fingerprint.optional(),
    transitionOutcome: z.enum(["accepted", "rejected", "ignored-stale", "failed"]),
    errorCode: Id.optional(),
    sceneId: Id,
    operationId: Id.optional(),
    policyVersion: Id,
    occurredAt: Timestamp,
  });
