import { describe, expect, it } from "vitest";
import { reduceBriefingSession } from "../session-reducer";
import { command, context, session } from "./fixtures";

function accepted(
  current: ReturnType<typeof session>,
  value: Parameters<typeof reduceBriefingSession>[1],
) {
  const result = reduceBriefingSession(current, value, context);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.structuredError.message);
  return result.nextSession;
}

describe("deterministic briefing session reducer", () => {
  it("starts a ready briefing", () => {
    const current = session();
    const next = accepted(current, command(current, { type: "START_BRIEFING" }));
    expect(next.status).toBe("presenting-scene");
    expect(next.updatedAt).toBe(context.transitionTimestamp);
  });

  it("advances and enters closing on the final scene", () => {
    let current = session({ status: "presenting-scene" });
    current = accepted(
      current,
      command(current, { type: "NEXT_SCENE", sceneId: "scene-2", sceneIndex: 1 }),
    );
    const next = accepted(
      current,
      command(current, { type: "NEXT_SCENE", sceneId: "scene-3", sceneIndex: 2 }),
    );
    expect(next.status).toBe("closing");
    expect(next.sceneCursor.visitedSceneIds).toEqual(["scene-1", "scene-2", "scene-3"]);
  });

  it("rejects a non-adjacent next scene without mutation", () => {
    const current = session({ status: "presenting-scene" });
    const snapshot = structuredClone(current);
    const result = reduceBriefingSession(
      current,
      command(current, { type: "NEXT_SCENE", sceneId: "scene-3", sceneIndex: 2 }),
      context,
    );
    expect(result.success).toBe(false);
    expect(current).toEqual(snapshot);
    if (!result.success) expect(result.structuredError.code).toBe("SCENE_ID_MISMATCH");
  });

  it("moves backward and jumps only through explicit navigation", () => {
    let current = session({
      status: "closing",
      sceneCursor: {
        sceneId: "scene-3",
        sceneIndex: 2,
        totalScenes: 3,
        visitedSceneIds: ["scene-1", "scene-2", "scene-3"],
      },
    });
    current = accepted(
      current,
      command(current, {
        type: "PREVIOUS_SCENE",
        sceneId: "scene-2",
        sceneIndex: 1,
      }),
    );
    const jumped = accepted(
      current,
      command(current, { type: "JUMP_TO_SCENE", sceneId: "scene-1", sceneIndex: 0 }),
    );
    expect(jumped.sceneCursor.sceneIndex).toBe(0);
  });

  it("rejects navigation beyond scene bounds", () => {
    const current = session({ status: "presenting-scene" });
    const result = reduceBriefingSession(
      current,
      command(current, { type: "JUMP_TO_SCENE", sceneId: "missing", sceneIndex: 3 }),
      context,
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.structuredError.code).toBe("SCENE_OUT_OF_BOUNDS");
  });

  it("rejects stale fingerprints", () => {
    const current = session({ status: "presenting-scene" });
    const nextCommand = command(current, {
      type: "NEXT_SCENE",
      sceneId: "scene-2",
      sceneIndex: 1,
    });
    nextCommand.expectedSessionFingerprint = "stale";
    const result = reduceBriefingSession(current, nextCommand, context);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.structuredError.code).toBe("STALE_SESSION_FINGERPRINT");
      expect(result.auditRecord?.transitionOutcome).toBe("ignored-stale");
    }
  });

  it("enters and preserves manual map view", () => {
    const current = session({ status: "presenting-scene" });
    const viewport = {
      center: { longitude: 127, latitude: 37 },
      zoom: 7,
      bearing: 0,
      pitch: 30,
    };
    const manual = accepted(
      current,
      command(current, {
        type: "USER_MAP_INTERACTION_STARTED",
        viewportSnapshot: viewport,
      }),
    );
    expect(manual.status).toBe("manual-map-view");
    const kept = accepted(manual, command(manual, { type: "KEEP_MANUAL_VIEW" }));
    expect(kept.manualMapViewState).toEqual({
      status: "active",
      viewportSnapshot: viewport,
    });
  });

  it("starts, completes, and replays motion without moving scenes", () => {
    let current = session({ status: "presenting-scene" });
    const originalScene = current.sceneCursor;
    current = accepted(
      current,
      command(current, {
        type: "SCENE_MOTION_STARTED",
        operationId: "motion-1",
      }),
    );
    expect(current.sceneCursor).toEqual(originalScene);
    current = accepted(
      current,
      command(current, {
        type: "SCENE_MOTION_COMPLETED",
        operationId: "motion-1",
      }),
    );
    const replay = accepted(
      current,
      command(current, {
        type: "REPLAY_SCENE_MOTION",
        operationId: "motion-2",
      }),
    );
    expect(replay.sceneCursor).toEqual(originalScene);
  });

  it("returns from manual view only after matching motion completion", () => {
    const viewport = {
      center: { longitude: 127, latitude: 37 },
      zoom: 7,
      bearing: 0,
      pitch: 30,
    };
    let current = session({
      status: "manual-map-view",
      viewportSnapshot: viewport,
      manualMapViewState: { status: "active", viewportSnapshot: viewport },
    });
    current = accepted(
      current,
      command(current, {
        type: "RETURN_TO_BRIEFING_CAMERA",
        operationId: "operation-return",
      }),
    );
    const stale = reduceBriefingSession(
      current,
      command(current, {
        type: "SCENE_MOTION_COMPLETED",
        operationId: "operation-stale",
      }),
      context,
    );
    expect(stale.success).toBe(false);
    const next = accepted(
      current,
      command(current, {
        type: "SCENE_MOTION_COMPLETED",
        operationId: "operation-return",
      }),
    );
    expect(next.status).toBe("presenting-scene");
    expect(next.manualMapViewState.status).toBe("inactive");
  });

  it("opens and closes the composer with a resumable status", () => {
    const current = session({ status: "presenting-scene" });
    const open = accepted(current, command(current, { type: "OPEN_COMPOSER" }));
    expect(open.resumeStatus).toBe("presenting-scene");
    const closed = accepted(open, command(open, { type: "CLOSE_COMPOSER" }));
    expect(closed.status).toBe("presenting-scene");
  });

  it("runs follow-up and replan operation ownership", () => {
    let current = session({
      status: "composer-open",
      composerState: "expanded",
      resumeStatus: "presenting-scene",
    });
    current = accepted(
      current,
      command(current, {
        type: "SUBMIT_FOLLOW_UP",
        followUpId: "follow-up-1",
        operationId: "operation-replan",
      }),
    );
    expect(current.activeOperation?.kind).toBe("follow-up");
    current = accepted(
      current,
      command(current, {
        type: "REPLAN_STARTED",
        operationId: "operation-replan",
      }),
    );
    expect(current.activeOperation?.kind).toBe("replan");
    const duplicate = reduceBriefingSession(
      current,
      command(current, {
        type: "REPLAN_STARTED",
        operationId: "operation-replan",
      }),
      context,
    );
    expect(duplicate.success).toBe(false);
    if (!duplicate.success) {
      expect(duplicate.structuredError.code).toBe("DUPLICATE_REPLAN_START");
    }
  });

  it("atomically replaces validated identities and maps a scene", () => {
    const current = session({
      status: "replanning",
      composerState: "expanded",
      activeOperation: {
        operationId: "operation-replan",
        kind: "replan",
        startedFromSessionFingerprint: "prior",
      },
    });
    const next = accepted(
      current,
      command(current, {
        type: "REPLAN_COMPLETED",
        operationId: "operation-replan",
        replacement: {
          validated: true,
          expectedPreviousScriptFingerprint: current.scriptFingerprint,
          currentQuestionId: "question-2",
          contractId: "contract-2",
          contractFingerprint: "contract-fingerprint-2",
          contextPackageFingerprint: "context-fingerprint-2",
          planId: "plan-2",
          planFingerprint: "plan-fingerprint-2",
          scriptId: "script-2",
          scriptFingerprint: "script-fingerprint-2",
          sceneIds: ["replacement-1", "replacement-2"],
        },
        mapping: {
          strategy: "map-to-replacement-scene",
          targetSceneId: "replacement-2",
          targetSceneIndex: 1,
          viewportPolicy: "apply-replacement-scene-camera",
        },
      }),
    );
    expect(next.scriptId).toBe("script-2");
    expect(next.sceneCursor.sceneId).toBe("replacement-2");
    expect(next.status).toBe("closing");
  });

  it("keeps the previous script on replanning failure", () => {
    const current = session({
      status: "replanning",
      composerState: "expanded",
      activeOperation: {
        operationId: "operation-replan",
        kind: "replan",
        startedFromSessionFingerprint: "prior",
      },
    });
    const next = accepted(
      current,
      command(current, {
        type: "REPLAN_FAILED",
        operationId: "operation-replan",
        failure: { code: "NO_CONTEXT", message: "No context", retryable: true },
      }),
    );
    expect(next.status).toBe("briefing-ready");
    expect(next.scriptFingerprint).toBe(current.scriptFingerprint);
  });

  it("rejects a replacement for another Script", () => {
    const current = session({
      status: "replanning",
      composerState: "expanded",
      activeOperation: {
        operationId: "operation-replan",
        kind: "replan",
        startedFromSessionFingerprint: "prior",
      },
    });
    const result = reduceBriefingSession(
      current,
      command(current, {
        type: "REPLAN_COMPLETED",
        operationId: "operation-replan",
        replacement: {
          validated: true,
          expectedPreviousScriptFingerprint: "another-script",
          currentQuestionId: "question-2",
          contractId: "contract-2",
          contractFingerprint: "contract-fingerprint-2",
          contextPackageFingerprint: "context-fingerprint-2",
          planId: "plan-2",
          planFingerprint: "plan-fingerprint-2",
          scriptId: "script-2",
          scriptFingerprint: "script-fingerprint-2",
          sceneIds: ["new-1"],
        },
        mapping: {
          strategy: "restart-at-opening",
          viewportPolicy: "apply-replacement-scene-camera",
        },
      }),
      context,
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.structuredError.code).toBe("SCRIPT_FINGERPRINT_MISMATCH");
    }
  });

  it("rejects an inconsistent replacement mapping", () => {
    const current = session({
      status: "replanning",
      composerState: "expanded",
      activeOperation: {
        operationId: "operation-replan",
        kind: "replan",
        startedFromSessionFingerprint: "prior",
      },
    });
    const result = reduceBriefingSession(
      current,
      command(current, {
        type: "REPLAN_COMPLETED",
        operationId: "operation-replan",
        replacement: {
          validated: true,
          expectedPreviousScriptFingerprint: current.scriptFingerprint,
          currentQuestionId: "question-2",
          contractId: "contract-2",
          contractFingerprint: "contract-fingerprint-2",
          contextPackageFingerprint: "context-fingerprint-2",
          planId: "plan-2",
          planFingerprint: "plan-fingerprint-2",
          scriptId: "script-2",
          scriptFingerprint: "script-fingerprint-2",
          sceneIds: ["new-1", "new-2"],
        },
        mapping: {
          strategy: "map-to-replacement-scene",
          targetSceneId: "new-2",
          targetSceneIndex: 0,
          viewportPolicy: "apply-replacement-scene-camera",
        },
      }),
      context,
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.structuredError.code).toBe("INVALID_SCENE_MAPPING");
  });

  it("produces identical results for identical inputs", () => {
    const current = session();
    const value = command(current, { type: "START_BRIEFING" });
    expect(reduceBriefingSession(current, value, context)).toEqual(
      reduceBriefingSession(current, value, context),
    );
  });

  it("ends and resets without deleting script identities", () => {
    const current = session({ status: "presenting-scene" });
    const ended = accepted(current, command(current, { type: "END_BRIEFING" }));
    const reset = accepted(ended, command(ended, { type: "RESET_SESSION" }));
    expect(reset.status).toBe("exploration");
    expect(reset.scriptFingerprint).toBe(current.scriptFingerprint);
  });

  it("treats ending an ended session as an idempotent transition", () => {
    const current = session({ status: "ended" });
    const next = accepted(current, command(current, { type: "END_BRIEFING" }));
    expect(next.status).toBe("ended");
    expect(next.sceneCursor).toEqual(current.sceneCursor);
  });

  it("replays a closed briefing from its opening scene", () => {
    const current = session({
      status: "closing",
      sceneCursor: {
        sceneId: "scene-3",
        sceneIndex: 2,
        totalScenes: 3,
        visitedSceneIds: ["scene-1", "scene-2", "scene-3"],
      },
    });
    const next = accepted(
      current,
      command(current, { type: "REPLAY_BRIEFING", sceneId: "scene-1" }),
    );
    expect(next.status).toBe("presenting-scene");
    expect(next.sceneCursor.sceneIndex).toBe(0);
  });
});
