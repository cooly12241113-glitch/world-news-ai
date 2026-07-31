import { describe, expect, it } from "vitest";
import { createLocalBriefingRuntime } from "./local-briefing-runtime";

describe("local briefing runtime", () => {
  it("executes the real deterministic pipeline through Script and Session", async () => {
    const runtime = createLocalBriefingRuntime({
      nextRunId: () => "run:local-test",
      now: () => "2026-07-31T00:00:00.000Z",
    });
    const result = await runtime.start().result;
    expect(result.outcome.kind).toBe("completed");
    expect(result.receipt.outcomeKind).toBe("completed");
    expect(result.receipt.evidenceCount).toBe(9);
    expect(result.receipt.sceneCount).toBe(7);
    expect(result.receipt.contractFingerprint).toBeTruthy();
    expect(result.receipt.contextFingerprint).toBeTruthy();
    expect(result.receipt.explanationPlanFingerprint).toBeTruthy();
    if (result.outcome.kind !== "completed") throw new Error("Expected completed fixture run.");
    expect(result.outcome.script.scenes.map(({ kind }) => kind)).toEqual([
      "opening", "global-overview", "regional-focus", "impact-path",
      "supporting-evidence", "uncertainty", "closing",
    ]);
    expect(result.outcome.script.scenes.map(({ objective }) => objective)).toEqual([
      "Frame the policy question and evidence boundary.",
      "Establish the global technology-policy context.",
      "Focus on the United States and East Asia.",
      "Trace the evidence-bound semiconductor supply path toward South Korea.",
      "Compare the fixture exposure indicator and primary policy source.",
      "Separate assumptions, limits, and verification signals.",
      "Return to the evidence boundary and invite a follow-up.",
    ]);
    const impact = result.outcome.script.scenes[3]!;
    expect(impact.visualDirectives[0]).toMatchObject({
      mode: "map-flow",
      locationIds: ["united-states", "taiwan", "south-korea"],
      cameraIntent: { action: "trace-route" },
      overlayIntent: { overlayTypes: ["directional-flow"] },
    });
    for (const scene of result.outcome.script.scenes) {
      expect(new Set(scene.citationCues.map(({ id }) => id)).size)
        .toBe(scene.citationCues.length);
    }
    expect(result.outcome.session.scriptId).toBe(result.outcome.script.id);
    expect(result.outcome.session.scriptFingerprint).toBe(result.outcome.script.fingerprint);
    expect(result.outcome.lineage.sessionFingerprint).toBe(result.outcome.session.semanticFingerprint);
  });

  it("cancels through the Web cancellation bridge", async () => {
    const handle = createLocalBriefingRuntime({
      nextRunId: () => "run:cancel-test",
      now: () => "2026-07-31T00:00:00.000Z",
    }).start();
    handle.cancel();
    const result = await handle.result;
    expect(result.outcome.kind).toBe("cancelled");
  });
});
