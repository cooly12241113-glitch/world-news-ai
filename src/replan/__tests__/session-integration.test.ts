import { describe, expect, it } from "vitest";
import { classifyFollowUp } from "../../follow-up";
import {
  activeSession,
  followUpContext,
  followUpRequest,
  replanRequest,
  scenarios,
  timestamp,
} from "../../follow-up/__tests__/fixtures";
import { reduceBriefingSession, type BriefingSession } from "../../session";
import {
  FixtureReplanAdapter,
  applyReplanResultToSession,
  type ReplanResult,
} from "..";

const sessionContext = {
  transitionTimestamp: timestamp,
  eventId: "event-integration",
  auditRecordId: "audit-integration",
  policyVersion: "session-policy-v1",
};

function decision(text: string) {
  return classifyFollowUp(followUpRequest(text), followUpContext(), {
    decisionId: "decision-1",
    policyVersion: "classifier-v1",
  });
}

function beginReplan(): BriefingSession {
  let current = activeSession();
  const submitted = reduceBriefingSession(current, {
    type: "SUBMIT_FOLLOW_UP",
    commandId: "submit",
    expectedSessionFingerprint: current.semanticFingerprint,
    followUpId: "follow-up-1",
    operationId: "operation-replan",
  }, sessionContext);
  if (!submitted.success) throw new Error("submit failed");
  current = submitted.nextSession;
  const started = reduceBriefingSession(current, {
    type: "REPLAN_STARTED",
    commandId: "start",
    expectedSessionFingerprint: current.semanticFingerprint,
    operationId: "operation-replan",
  }, sessionContext);
  if (!started.success) throw new Error("start failed");
  return started.nextSession;
}

function apply(current: BriefingSession, result: ReplanResult) {
  return applyReplanResultToSession(current, result, {
    commandId: "apply-result",
    sessionContext,
  });
}

describe("Sprint 14.1 session integration", () => {
  const adapter = new FixtureReplanAdapter(scenarios());
  const prepare = (
    current: BriefingSession,
    text: string,
    scenarioId: string,
  ) => adapter.prepare(replanRequest(
    decision(text),
    scenarioId,
    current.activeOperation?.startedFromSessionFingerprint,
  ));

  it("submit and start preserve the current Script", () => {
    const initial = activeSession();
    const replanning = beginReplan();
    expect(replanning.scriptFingerprint).toBe(initial.scriptFingerprint);
    expect(replanning.sceneCursor).toEqual(initial.sceneCursor);
  });

  it("current-context answer exits replan without replacement", () => {
    const current = beginReplan();
    const result = prepare(current, "source", "current-context");
    const applied = apply(current, result);
    expect(applied.success).toBe(true);
    if (applied.success) {
      expect(applied.nextSession.scriptFingerprint).toBe(current.scriptFingerprint);
      expect(applied.nextSession.status).toBe("presenting-scene");
    }
  });

  it.each([
    ["revise this scene", "revise"],
    ["add a scene", "append"],
    ["from here onward", "replace"],
    ["start over", "rebuild"],
  ])("applies validated replacement: %s", (text, scenarioId) => {
    const current = beginReplan();
    const result = prepare(current, text, scenarioId);
    const applied = apply(current, result);
    expect(applied.success).toBe(true);
    if (applied.success && result.outcome === "replacement-ready") {
      expect(applied.nextSession.scriptFingerprint).toBe(
        result.replacement.scriptFingerprint,
      );
    }
  });

  it.each([
    ["what did they do", "clarification"],
    ["delete a file", "unsupported"],
  ])("rolls back without replacement: %s", (text, scenarioId) => {
    const current = beginReplan();
    const result = prepare(current, text, scenarioId);
    const applied = apply(current, result);
    expect(applied.success).toBe(true);
    if (applied.success) {
      expect(applied.nextSession.scriptFingerprint).toBe(current.scriptFingerprint);
      expect(applied.nextSession.sceneCursor).toEqual(current.sceneCursor);
    }
  });

  it("rolls back a fixture adapter failure", () => {
    const current = beginReplan();
    const result = prepare(current, "add a scene", "failure");
    const applied = apply(current, result);
    expect(applied.success).toBe(true);
    if (applied.success) {
      expect(applied.nextSession.scriptFingerprint).toBe(current.scriptFingerprint);
      expect(applied.nextSession.error?.code).toBe("FIXTURE_REPLAN_FAILED");
    }
  });

  it("ignores a stale operation", () => {
    const current = beginReplan();
    const result = prepare(current, "source", "current-context");
    const stale = { ...result, operationId: "stale-operation" };
    const applied = apply(current, stale);
    expect(applied.success).toBe(false);
    if (!applied.success) expect(applied.structuredError.code).toBe("STALE_OPERATION");
  });

  it("ignores a stale starting fingerprint", () => {
    const current = beginReplan();
    const result = prepare(current, "source", "current-context");
    const stale = { ...result, startedFromSessionFingerprint: "stale" };
    const applied = apply(current, stale);
    expect(applied.success).toBe(false);
    if (!applied.success) {
      expect(applied.structuredError.code).toBe("STALE_SESSION_FINGERPRINT");
    }
  });

  it("latest operation prevents an older result from committing", () => {
    const current = beginReplan();
    const oldResult = prepare(current, "source", "current-context");
    const latest = structuredClone(current);
    latest.activeOperation = {
      operationId: "operation-latest",
      kind: "replan",
      startedFromSessionFingerprint: "latest-start",
    };
    const applied = apply(latest, oldResult);
    expect(applied.success).toBe(false);
  });
});
