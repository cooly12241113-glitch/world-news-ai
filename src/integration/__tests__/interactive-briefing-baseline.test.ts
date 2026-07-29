import { describe, expect, it } from "vitest";
import { executeFollowUp } from "../../application/follow-up";
import {
  adapter,
  activeSession,
  executionRequest,
  scenarios,
} from "../../application/follow-up/__tests__/fixtures";
import {
  FixtureReplanAdapter,
  replanResultFingerprint,
  type ReplanAdapter,
  type ReplanResult,
} from "../../replan";
import { compiled } from "../../script/__tests__/fixtures";
import { briefingScriptFingerprint } from "../../script";

describe("Milestone 02 interactive briefing fixture integration", () => {
  it("carries validated Contract, Context, Plan, and Script identities into Session", () => {
    const { input, script } = compiled();
    const session = activeSession();
    expect(input.plan.status).toBe("validated");
    expect(script.status).toBe("validated");
    expect(script.contractFingerprint).toBe(input.contract.semanticFingerprint);
    expect(script.contextPackageFingerprint).toBe(input.contextPackage.fingerprint);
    expect(script.explanationPlanFingerprint).toBe(input.plan.fingerprint);
    expect(session).toMatchObject({
      contractFingerprint: script.contractFingerprint,
      contextPackageFingerprint: script.contextPackageFingerprint,
      planFingerprint: script.explanationPlanFingerprint,
      scriptFingerprint: script.fingerprint,
    });
  });

  it("answers current context without replacing Script, cursor, or evidence lineage", () => {
    const session = activeSession();
    const outcome = executeFollowUp(
      session,
      executionRequest(session, "source", "current-context"),
      { replanAdapter: adapter() },
    );
    expect(outcome.outcome).toBe("current-context-answer");
    expect(outcome.nextSession.scriptFingerprint).toBe(session.scriptFingerprint);
    expect(outcome.nextSession.sceneCursor).toEqual(session.sceneCursor);
    if (outcome.outcome === "current-context-answer") {
      expect(outcome.answerPlan.evidenceBindings.length).toBeGreaterThan(0);
    }
  });

  it("applies one semantic current-scene revision and preserves the cursor", () => {
    const session = activeSession();
    const outcome = executeFollowUp(
      session,
      executionRequest(session, "revise this scene", "revise"),
      { replanAdapter: adapter() },
    );
    expect(outcome.outcome).toBe("replacement-applied");
    if (outcome.outcome !== "replacement-applied") return;
    expect(outcome.changedSceneIds).toEqual([session.sceneCursor.sceneId]);
    expect(outcome.preservedSceneIds).not.toContain(session.sceneCursor.sceneId);
    expect(outcome.nextSceneCursor.sceneId).toBe(session.sceneCursor.sceneId);
  });

  it("applies a full rebuild with a new Script identity at opening", () => {
    const session = activeSession();
    const outcome = executeFollowUp(
      session,
      executionRequest(session, "start over", "rebuild"),
      { replanAdapter: adapter() },
    );
    expect(outcome.outcome).toBe("replacement-applied");
    if (outcome.outcome !== "replacement-applied") return;
    expect(outcome.replacementScriptFingerprint).not.toBe(session.scriptFingerprint);
    expect(outcome.nextSceneCursor.sceneIndex).toBe(0);
    expect(outcome.preservedSceneIds).toHaveLength(0);
  });

  it("ignores a stale replan without changing Session", () => {
    const session = activeSession();
    const base = adapter();
    const stale: ReplanAdapter = {
      id: "milestone-stale-adapter",
      deterministic: true,
      prepare(request) {
        const result = base.prepare(request);
        const changed = { ...result, operationId: "stale-operation" };
        return {
          ...changed,
          semanticFingerprint: replanResultFingerprint(
            changed as ReplanResult,
          ),
        } as ReplanResult;
      },
    };
    const outcome = executeFollowUp(
      session,
      executionRequest(session, "source", "current-context"),
      { replanAdapter: stale },
    );
    expect(outcome.outcome).toBe("stale-ignored");
    expect(outcome.nextSession).toEqual(session);
  });

  it("rejects an invalid replacement evidence ID and rolls back", () => {
    const session = activeSession();
    const invalidScenarios = structuredClone(scenarios());
    const revise = invalidScenarios.find(({ scenarioId }) => scenarioId === "revise")!;
    const script = revise.replacement!.script;
    script.scenes.flatMap(({ contentBindings }) => contentBindings)[0]!
      .sourceDocumentIds.push("invented-evidence-id");
    script.fingerprint = briefingScriptFingerprint(script);
    const outcome = executeFollowUp(
      session,
      executionRequest(session, "revise this scene", "revise"),
      { replanAdapter: new FixtureReplanAdapter(invalidScenarios) },
    );
    expect(outcome.outcome).toBe("failed");
    expect(outcome.nextSession.scriptFingerprint).toBe(session.scriptFingerprint);
    expect(outcome.nextSession.sceneCursor).toEqual(session.sceneCursor);
  });

  it("rejects a Session/Script fingerprint mismatch before partial application", () => {
    const session = activeSession();
    const request = executionRequest(session, "source", "current-context");
    request.followUpContext.scriptFingerprint = "mismatched-script";
    expect(() => executeFollowUp(
      session,
      request,
      { replanAdapter: adapter() },
    )).toThrow(/does not target the current session/);
    expect(session).toEqual(activeSession());
  });
});
