import { describe, expect, it } from "vitest";
import {
  AppendSceneBudgetInputSchema,
  evaluateAppendSceneBudget,
} from "..";
import { scenarios } from "./fixtures";

const input = {
  currentSceneCount: 5,
  requestedAdditionalSceneCount: 2,
  maximumScenes: 7,
  completedSceneIds: ["scene-1", "scene-2"],
  remainingSceneIds: ["scene-3", "scene-4", "scene-5"],
  decisionScope: "append-scenes" as const,
  policyVersion: "budget-v1",
};

describe("AppendSceneBudgetPolicy", () => {
  it("allows an append below the limit", () => {
    expect(evaluateAppendSceneBudget({ ...input, maximumScenes: 8 }).outcome)
      .toBe("append-allowed");
  });

  it("allows an append exactly at the limit", () => {
    expect(evaluateAppendSceneBudget(input)).toEqual({
      outcome: "append-allowed",
      resultingSceneCount: 7,
      policyVersion: "budget-v1",
    });
  });

  it("requires clarification above the limit", () => {
    const outcome = evaluateAppendSceneBudget({ ...input, maximumScenes: 6 });
    expect(outcome.outcome).toBe("clarification-required");
    if (outcome.outcome === "clarification-required") {
      expect(outcome.alternatives).toEqual([
        "replace-remaining-scenes",
        "rebuild-entire-briefing",
        "keep-current-briefing",
        "merge-scenes-later",
      ]);
    }
  });

  it("never silently converts append to replacement", () => {
    const outcome = evaluateAppendSceneBudget({ ...input, maximumScenes: 5 });
    expect(JSON.stringify(outcome)).not.toContain('"outcome":"replacement');
  });

  it("rejects a zero requested count", () => {
    expect(evaluateAppendSceneBudget({
      ...input,
      requestedAdditionalSceneCount: 0,
    }).outcome).toBe("invalid");
  });

  it("rejects negative counts at the strict boundary", () => {
    expect(AppendSceneBudgetInputSchema.safeParse({
      ...input,
      currentSceneCount: -1,
    }).success).toBe(false);
  });

  it("labels the bounded fixture as terminal replacement, not true append", () => {
    const fixture = scenarios().find((scenario) => scenario.scenarioId === "append")!;
    expect(fixture.fixtureMetadata.description).toContain("not a true append");
  });
});
