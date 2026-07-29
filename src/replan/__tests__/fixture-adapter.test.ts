import { describe, expect, it } from "vitest";
import { classifyFollowUp } from "../../follow-up";
import { briefingScriptFingerprint } from "../../script";
import {
  followUpContext,
  followUpRequest,
  replanRequest,
  scenarios,
} from "../../follow-up/__tests__/fixtures";
import {
  FixtureReplanAdapter,
  ReplanResultSchema,
  createReplanAuditRecord,
  createSceneReplacementMapping,
  validateReplacement,
} from "..";

function decision(text: string) {
  return classifyFollowUp(followUpRequest(text), followUpContext(), {
    decisionId: "decision-1",
    policyVersion: "classifier-v1",
  });
}

describe("fixture replan adapter", () => {
  const adapter = new FixtureReplanAdapter(scenarios());

  it("returns a current-context answer without replacement", () => {
    const request = replanRequest(decision("source"), "current-context");
    const result = adapter.prepare(request);
    expect(result.outcome).toBe("current-context-answer");
    expect("replacement" in result).toBe(false);
    expect(ReplanResultSchema.safeParse(result).success).toBe(true);
    const audit = createReplanAuditRecord(request, result);
    expect(JSON.stringify(audit)).not.toContain(request.followUpRequest.text);
  });

  it("classifies a semantic same-ID current-scene revision as changed", () => {
    const context = followUpContext();
    const result = adapter.prepare(
      replanRequest(decision("revise this scene"), "revise"),
    );
    expect(result.outcome).toBe("replacement-ready");
    if (result.outcome !== "replacement-ready") return;
    expect(result.changedSceneIds).toEqual([context.currentSceneId]);
    expect(result.preservedSceneIds).not.toContain(context.currentSceneId);
    expect(result.changedSceneIds).toHaveLength(1);
  });

  it.each([
    ["revise this scene", "revise", "map-to-replacement-scene"],
    ["add a scene", "append", "preserve-current-scene"],
    ["from here onward", "replace", "map-to-nearest-preceding-scene"],
    ["start over", "rebuild", "restart-at-opening"],
  ])("prepares %s replacement", (text, scenarioId, mapping) => {
    const result = adapter.prepare(replanRequest(decision(text), scenarioId));
    expect(result.outcome).toBe("replacement-ready");
    if (result.outcome === "replacement-ready") {
      expect(result.sceneReplacementMapping.strategy).toBe(mapping);
      expect(result.evidenceContinuity.continuityStatus).toBe("preserved");
      expect(ReplanResultSchema.safeParse(result).success).toBe(true);
    }
  });

  it("returns structured clarification", () => {
    const result = adapter.prepare(
      replanRequest(decision("what did they do"), "clarification"),
    );
    expect(result.outcome).toBe("clarification-required");
  });

  it("returns structured unsupported outcome", () => {
    const result = adapter.prepare(
      replanRequest(decision("delete a file"), "unsupported"),
    );
    expect(result.outcome).toBe("unsupported");
  });

  it("returns a safe structured failure", () => {
    const result = adapter.prepare(
      replanRequest(decision("add a scene"), "failure"),
    );
    expect(result.outcome).toBe("failed");
    if (result.outcome === "failed") {
      expect(result.safeRollbackIdentity.scriptFingerprint).toBe(
        followUpContext().scriptFingerprint,
      );
    }
  });

  it("rejects an unknown fixture", () => {
    expect(() => adapter.prepare(
      replanRequest(decision("source"), "missing"),
    )).toThrow(/Unknown fixture/);
  });

  it("is deterministic", () => {
    const request = replanRequest(decision("add a scene"), "append");
    expect(adapter.prepare(request)).toEqual(adapter.prepare(request));
  });

  it("rejects a fixture/decision mismatch", () => {
    expect(() => adapter.prepare(
      replanRequest(decision("source"), "rebuild"),
    )).toThrow(/does not match/);
  });
});

describe("replacement and mapping validation", () => {
  it("accepts the validated fixture Script", () => {
    const scenario = scenarios().find((item) => item.scenarioId === "revise")!;
    expect(validateReplacement({
      ...scenario.replacement!,
      followUpContext: followUpContext(),
    }).script.status).toBe("validated");
  });

  it("rejects an invalid Script fingerprint", () => {
    const scenario = structuredClone(
      scenarios().find((item) => item.scenarioId === "revise")!,
    );
    scenario.replacement!.script.fingerprint = "forged";
    expect(() => validateReplacement({
      ...scenario.replacement!,
      followUpContext: followUpContext(),
    })).toThrow(/fingerprint/);
  });

  it("rejects duplicate scene IDs", () => {
    const scenario = structuredClone(
      scenarios().find((item) => item.scenarioId === "revise")!,
    );
    scenario.replacement!.script.scenes[1]!.id =
      scenario.replacement!.script.scenes[0]!.id;
    expect(() => validateReplacement({
      ...scenario.replacement!,
      followUpContext: followUpContext(),
    })).toThrow();
  });

  it.each([
    ["contextPackageFingerprint", "context-mismatch"],
    ["contractFingerprint", "contract-mismatch"],
    ["explanationPlanFingerprint", "plan-mismatch"],
  ] as const)("rejects a %s mismatch", (field, value) => {
    const scenario = structuredClone(
      scenarios().find((item) => item.scenarioId === "revise")!,
    );
    scenario.replacement!.script[field] = value;
    scenario.replacement!.script.fingerprint =
      briefingScriptFingerprint(scenario.replacement!.script);
    expect(() => validateReplacement({
      ...scenario.replacement!,
      followUpContext: followUpContext(),
    })).toThrow(/validation/);
  });

  it("rejects a Script above the maximum scene policy", () => {
    const scenario = structuredClone(
      scenarios().find((item) => item.scenarioId === "revise")!,
    );
    const script = scenario.replacement!.script;
    const closing = script.scenes.at(-1)!;
    const extra = structuredClone(script.scenes.at(-2)!);
    extra.id = "over-budget-scene";
    extra.order = closing.order;
    closing.order += 1;
    closing.dependsOnSceneIds = [extra.id];
    script.scenes = [...script.scenes.slice(0, -1), extra, closing];
    script.fingerprint = briefingScriptFingerprint(script);
    expect(() => validateReplacement({
      ...scenario.replacement!,
      followUpContext: followUpContext(),
    })).toThrow(/STOP_CONDITION_EXCEEDED/);
  });

  it("rejects an unknown evidence ID", () => {
    const scenario = structuredClone(
      scenarios().find((item) => item.scenarioId === "revise")!,
    );
    const script = scenario.replacement!.script;
    const binding = script.scenes.flatMap((scene) => scene.contentBindings)[0]!;
    binding.sourceDocumentIds.push("invented");
    script.fingerprint = briefingScriptFingerprint(script);
    expect(() => validateReplacement({
      ...scenario.replacement!,
      followUpContext: followUpContext(),
    })).toThrow();
  });

  it("rejects a missing mapping target", () => {
    expect(() => createSceneReplacementMapping({
      strategy: "map-to-replacement-scene",
      currentSceneId: "removed",
      previousSceneIds: ["removed"],
      replacementSceneIds: ["new"],
      completedSceneIds: ["removed"],
    })).toThrow(/target/);
  });

  it("rejects duplicate replacement scene IDs", () => {
    expect(() => createSceneReplacementMapping({
      strategy: "restart-at-opening",
      currentSceneId: "scene",
      previousSceneIds: ["scene"],
      replacementSceneIds: ["scene", "scene"],
      completedSceneIds: ["scene"],
    })).toThrow(/unique/);
  });
});
