// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import "../tests/test-setup";
import { buildDemoScript, demoEvidence } from "../fixtures/build-demo-script";
import { adaptBriefingScript } from "../renderer/presentation-adapter";
import { FakeMapRendererAdapter } from "../map/fake-map-adapter";
import { FixtureLocationGeometryCatalog } from "../map/fixture-location-catalog";
import { resolveCameraTarget } from "../map/camera-target-resolver";
import { planCameraMotion } from "../map/motion-planner";
import { WORLD_CAMERA } from "../map/map-adapter";
import { initialPlayerState } from "../player/player-state";
import { playerReducer } from "../player/player-reducer";

const briefing = (mode: Parameters<typeof buildDemoScript>[0] = "auto") => {
  const result = adaptBriefingScript(buildDemoScript(mode));
  if (!result.success) throw new Error("adaptation failed");
  return result.value;
};

describe("Sprint 13 renderer integration scenarios", () => {
  it("1. map causal briefing preserves opening, map sequence, evidence, and closing", () => {
    const value = briefing();
    expect(value.scenes[0]?.kind).toBe("opening");
    expect(value.scenes[1]?.primarySurface).toBe("map");
    expect(value.scenes[4]?.contentBindings.length).toBeGreaterThan(0);
    expect(value.scenes.at(-1)?.kind).toBe("closing");
  });

  it("2. impact map-flow resolves a Korea-bound route with safe viewport", () => {
    const scene = briefing().scenes[3]!;
    const directive = scene.visualDirectives[0]!;
    const target = resolveCameraTarget(directive.cameraIntent, new FixtureLocationGeometryCatalog());
    expect(directive.mode).toBe("map-flow");
    expect(directive.locationIds).toContain("south-korea");
    expect(target.success).toBe(true);
    expect(scene.layout.safeViewport.reserveSidePanel).toBe(true);
  });

  it("3. fact verification exposes a document and evidence-bound citation", () => {
    const scene = briefing("document-led").scenes[5]!;
    expect(scene.primarySurface).toBe("document");
    expect(scene.citations[0]?.sourceDocumentIds).toContain(demoEvidence.document.id);
    expect(scene.uncertainties.length).toBeGreaterThan(0);
  });

  it("4. forecast/scenario presentation exposes uncertainty without probability", () => {
    const serialized = JSON.stringify(briefing("chart-led"));
    expect(serialized).toContain("uncertainty");
    expect(serialized).not.toMatch(/probability|percentChance|likelihoodScore/);
  });

  it("5. static mode produces no camera motion instruction", () => {
    const value = briefing("static");
    expect(value.scenes.flatMap(({ visualDirectives }) => visualDirectives)
      .every(({ cameraIntent }) => cameraIntent.action === "no-camera-motion")).toBe(true);
  });

  it("6. reduced motion never plans a fly transition", () => {
    const directive = briefing("reduced-motion").scenes[2]!.visualDirectives[0]!;
    const target = resolveCameraTarget(
      { ...directive.cameraIntent, action: "focus-region", targetLocationIds: ["east-asia"] },
      new FixtureLocationGeometryCatalog(),
    );
    if (!target.success) throw new Error("target failed");
    const plan = planCameraMotion({
      intent: { ...directive.cameraIntent, action: "focus-region", targetLocationIds: ["east-asia"] },
      current: WORLD_CAMERA, target: target.value,
      viewportInsets: { top: 72, right: 20, bottom: 150, left: 20 },
      playbackSpeed: "normal", animationPolicy: "minimal",
      cameraMotionPolicy: "minimize", reducedMotion: true,
      timing: { pace: "normal", hold: "standard", userAdvanceAllowed: true },
      transition: { style: "minimal", preserveUserView: true, requiresMotionPlanner: true },
    });
    expect(plan.segments.every(({ transition }) => transition !== "fly")).toBe(true);
  });

  it("7. composer interaction pauses and preserves the active scene", () => {
    const loaded = playerReducer(initialPlayerState, { type: "load", sceneCount: 7 });
    const playing = playerReducer(playerReducer(loaded, { type: "start" }), { type: "next" });
    const focused = playerReducer(playing, { type: "composer-focus" });
    expect(focused).toMatchObject({ status: "paused", pauseReason: "composer", currentSceneIndex: 1 });
  });

  it("8. manual map interaction pauses and offers deterministic return", async () => {
    const adapter = new FakeMapRendererAdapter();
    let state = playerReducer(initialPlayerState, { type: "load", sceneCount: 7 });
    state = playerReducer(state, { type: "start" });
    await adapter.initialize(document.createElement("div"), { style: {}, initialCamera: WORLD_CAMERA });
    adapter.subscribeToUserInteraction(() => { state = playerReducer(state, { type: "map-interaction" }); });
    adapter.emitUserInteraction();
    expect(state).toMatchObject({ status: "paused", mapConflict: true });
    state = playerReducer(state, { type: "return-to-script-camera" });
    expect(state.mapConflict).toBe(false);
  });
});
