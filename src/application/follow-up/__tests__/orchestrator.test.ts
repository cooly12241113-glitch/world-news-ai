import { describe, expect, it } from "vitest";
import {
  executeFollowUp,
  type FollowUpExecutionOutcome,
} from "..";
import {
  replanResultFingerprint,
  type ReplanAdapter,
  type ReplanResult,
} from "../../../replan";
import {
  reduceBriefingSession,
  withBriefingSessionFingerprint,
  type SessionCommand,
} from "../../../session";
import { adapter, activeSession, executionRequest } from "./fixtures";

describe("Follow-up Outcome Orchestrator", () => {
  it("resolves a current-context answer without REPLAN_FAILED", () => {
    const current = activeSession();
    const commands: SessionCommand["type"][] = [];
    const outcome = executeFollowUp(
      current,
      executionRequest(current, "source", "current-context"),
      {
        replanAdapter: adapter(),
        sessionReducer: (session, command, context) => {
          commands.push(command.type);
          return reduceBriefingSession(session, command, context);
        },
      },
    );
    expect(outcome.outcome).toBe("current-context-answer");
    expect(commands).toEqual([
      "SUBMIT_FOLLOW_UP", "REPLAN_STARTED", "REPLAN_RESOLVED",
    ]);
    expect(outcome.nextSession.scriptFingerprint).toBe(current.scriptFingerprint);
    expect(outcome.nextSession.sceneCursor).toEqual(current.sceneCursor);
  });

  it.each([
    ["what did they do", "clarification", "clarification-required"],
    ["delete a file", "unsupported", "unsupported"],
  ] as const)("normal resolution does not become failure: %s", (
    text,
    scenario,
    expected,
  ) => {
    const current = activeSession();
    const commands: string[] = [];
    const outcome = executeFollowUp(
      current,
      executionRequest(current, text, scenario),
      {
        replanAdapter: adapter(),
        sessionReducer: (session, command, context) => {
          commands.push(command.type);
          return reduceBriefingSession(session, command, context);
        },
      },
    );
    expect(outcome.outcome).toBe(expected);
    expect(commands).toContain("REPLAN_RESOLVED");
    expect(commands).not.toContain("REPLAN_FAILED");
    expect(outcome.nextSession.status).toBe("composer-open");
  });

  it.each([
    ["revise this scene", "revise"],
    ["start over", "rebuild"],
  ])("applies a validated replacement: %s", (text, scenario) => {
    const current = activeSession();
    const outcome = executeFollowUp(
      current,
      executionRequest(current, text, scenario),
      { replanAdapter: adapter() },
    );
    expect(outcome.outcome).toBe("replacement-applied");
    expect(outcome.nextSession.scriptFingerprint).not.toBe(current.scriptFingerprint);
  });

  it("uses REPLAN_FAILED only for a technical fixture failure", () => {
    const current = activeSession();
    const commands: string[] = [];
    const outcome = executeFollowUp(
      current,
      executionRequest(current, "add a scene", "failure"),
      {
        replanAdapter: adapter(),
        sessionReducer: (session, command, context) => {
          commands.push(command.type);
          return reduceBriefingSession(session, command, context);
        },
      },
    );
    expect(outcome.outcome).toBe("failed");
    expect(commands.at(-1)).toBe("REPLAN_FAILED");
    expect(outcome.nextSession.scriptFingerprint).toBe(current.scriptFingerprint);
  });

  it("converts over-budget append into clarification, not replacement", () => {
    const current = activeSession();
    const outcome = executeFollowUp(
      current,
      executionRequest(current, "add a scene", "append", {
        requestedAdditionalSceneCount: 1,
        maximumScenes: current.sceneCursor.totalScenes,
      }),
      { replanAdapter: adapter() },
    );
    expect(outcome.outcome).toBe("clarification-required");
    if (outcome.outcome === "clarification-required") {
      expect(outcome.reasonCode).toBe("APPEND_SCENE_BUDGET_EXCEEDED");
    }
    expect(outcome.nextSession.scriptFingerprint).toBe(current.scriptFingerprint);
  });

  it("preserves manual map, viewport, tab, and cursor on normal answer", () => {
    const currentBase = activeSession();
    const viewport = {
      center: { longitude: 127, latitude: 37 },
      zoom: 6,
      bearing: 1,
      pitch: 20,
    };
    const { semanticFingerprint: _ignored, ...withoutFingerprint } = currentBase;
    const current = withBriefingSessionFingerprint({
      ...withoutFingerprint,
      resumeStatus: "manual-map-view",
      viewportSnapshot: viewport,
      manualMapViewState: { status: "active", viewportSnapshot: viewport },
      selectedAnalysisTab: "sources",
    });
    const request = executionRequest(current, "source", "current-context");
    request.followUpContext.manualMapViewStatus = "active";
    request.followUpContext.selectedAnalysisTab = "sources";
    const outcome = executeFollowUp(current, request, {
      replanAdapter: adapter(),
    });
    expect(outcome.nextSession.status).toBe("manual-map-view");
    expect(outcome.nextSession.viewportSnapshot).toEqual(viewport);
    expect(outcome.nextSession.selectedAnalysisTab).toBe("sources");
    expect(outcome.nextSession.sceneCursor).toEqual(current.sceneCursor);
  });

  it("ignores a stale adapter operation without changing the input session", () => {
    const current = activeSession();
    const baseAdapter = adapter();
    const staleAdapter: ReplanAdapter = {
      id: "stale-adapter",
      deterministic: true,
      prepare(request) {
        const result = baseAdapter.prepare(request);
        const stale = { ...result, operationId: "old-operation" };
        return {
          ...stale,
          semanticFingerprint: replanResultFingerprint(
            stale as ReplanResult,
          ),
        } as ReplanResult;
      },
    };
    const outcome = executeFollowUp(
      current,
      executionRequest(current, "source", "current-context"),
      { replanAdapter: staleAdapter },
    );
    expect(outcome.outcome).toBe("stale-ignored");
    expect(outcome.nextSession).toEqual(current);
  });

  it("is deterministic and does not mutate inputs", () => {
    const current = activeSession();
    const request = executionRequest(current, "source", "current-context");
    const currentSnapshot = structuredClone(current);
    const requestSnapshot = structuredClone(request);
    const first = executeFollowUp(current, request, { replanAdapter: adapter() });
    const second = executeFollowUp(current, request, { replanAdapter: adapter() });
    expect(first).toEqual(second);
    expect(current).toEqual(currentSnapshot);
    expect(request).toEqual(requestSnapshot);
  });

  it("outcome projection contains no raw follow-up text", () => {
    const current = activeSession();
    const request = executionRequest(
      current,
      "show citation private-zebra-phrase",
      "current-context",
    );
    const outcome: FollowUpExecutionOutcome = executeFollowUp(
      current,
      request,
      { replanAdapter: adapter() },
    );
    expect(JSON.stringify(outcome)).not.toContain(request.followUpRequest.text);
  });
});
