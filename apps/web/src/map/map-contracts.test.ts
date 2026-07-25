// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "./../tests/test-setup";
import { FixtureLocationGeometryCatalog } from "./fixture-location-catalog";
import { resolveCameraTarget } from "./camera-target-resolver";
import { calculateViewportInsets } from "./viewport-insets";
import { FakeMapRendererAdapter } from "./fake-map-adapter";
import { WORLD_CAMERA } from "./map-adapter";
import type { CameraIntent } from "@world-news-ai/script-web";

describe("Map renderer contracts", () => {
  it("resolves fixture locations and rejects unknown IDs", () => {
    const catalog = new FixtureLocationGeometryCatalog();
    expect(catalog.resolve("south-korea")).toMatchObject({ success: true });
    expect(catalog.resolve("unknown")).toMatchObject({ success: false });
  });
  it("combines multiple locations into a finite target", () => {
    const intent: CameraIntent = {
      action: "compare-regions", targetLocationIds: ["united-states", "east-asia"],
      targetEntityIds: [], framing: "multi-region", spatialRelationship: "comparison",
      motionPriority: "normal", transitionPreference: "smooth",
      preserveSafeViewport: true, allowRotation: false, allowZoom: true,
      allowPan: true, fallbackAction: "hold-current-view", warnings: [],
    };
    const result = resolveCameraTarget(intent, new FixtureLocationGeometryCatalog());
    expect(result.success).toBe(true);
    if (result.success) expect(Object.values(result.value.center).every(Number.isFinite)).toBe(true);
  });
  it("calculates composer, panel, expanded, mobile and clamped insets", () => {
    const base = {
      viewportWidth: 1000, viewportHeight: 700, composerHeight: 70,
      playbackHeight: 60, captionHeight: 80, sidePanelWidth: 360,
      mobileSafeAreaBottom: 20, panelOpen: true, composerExpanded: false, mobile: false,
    };
    const desktop = calculateViewportInsets(base);
    const collapsed = calculateViewportInsets({ ...base, panelOpen: false });
    const expanded = calculateViewportInsets({ ...base, composerExpanded: true });
    const invalid = calculateViewportInsets({ ...base, composerHeight: -10, sidePanelWidth: 9_999 });
    expect(desktop.right).toBeGreaterThan(collapsed.right);
    expect(expanded.bottom).toBeGreaterThan(desktop.bottom);
    expect(invalid.right).toBeLessThanOrEqual(420);
    expect(Object.values(invalid).every((value) => value >= 0)).toBe(true);
  });
  it("fake adapter records lifecycle, motion, overlays, resize and user events", async () => {
    const adapter = new FakeMapRendererAdapter();
    const listener = vi.fn();
    await adapter.initialize(document.createElement("div"), { style: {}, initialCamera: WORLD_CAMERA });
    const unsubscribe = adapter.subscribeToUserInteraction(listener);
    adapter.emitUserInteraction();
    await adapter.applyMotion({
      destination: { ...WORLD_CAMERA, zoom: 4 }, transition: "ease", durationMs: 500,
      viewportInsets: { top: 0, right: 0, bottom: 0, left: 0 }, essential: false,
    });
    await adapter.applyOverlays([{ id: "one", type: "marker", points: [WORLD_CAMERA.center], label: "One" }]);
    adapter.resize(); unsubscribe(); adapter.destroy();
    expect(listener).toHaveBeenCalledOnce();
    expect(adapter.motions).toHaveLength(1);
    expect(adapter.overlays).toHaveLength(1);
    expect(adapter.destroyed).toBe(true);
  });
});
