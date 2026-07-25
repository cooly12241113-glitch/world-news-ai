// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import "./../tests/test-setup";
import { FixtureLocationGeometryCatalog } from "./fixture-location-catalog";
import { resolveCameraTarget } from "./camera-target-resolver";
import { combineBounds } from "./camera-target-resolver";
import { resolveOverlays, unwrapRoute } from "./overlay-controller";
import { calculateViewportInsets } from "./viewport-insets";
import { FakeMapRendererAdapter } from "./fake-map-adapter";
import { WORLD_CAMERA } from "./map-adapter";
import type { CameraIntent } from "@world-news-ai/script-web";
import { buildDemoScript } from "../fixtures/build-demo-script";
import { adaptBriefingScript } from "../renderer/presentation-adapter";
import {
  buildOverlayFeatureCollection,
  buildMarkerModels,
  demoMapStyle,
  MapInteractionGate,
  overlayLayerDefinitions,
  OverlaySnapshotStore,
  reconcileOverlayStyle,
  ROUTE_CASING_LAYER_ID,
  ROUTE_LAYER_ID,
} from "./maplibre-adapter";

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
    if (result.success) {
      expect(Object.values(result.value.center).every(Number.isFinite)).toBe(true);
      expect(result.value.center.longitude).toBeGreaterThan(150);
      expect(result.value.bounds!.east - result.value.bounds!.west).toBe(141);
    }
  });
  it("combines date-line bounds deterministically without mutating input", () => {
    const input = [
      { west: -98, south: 39, east: -98, north: 39 },
      { west: 121, south: 34, east: 121, north: 34 },
    ];
    const snapshot = structuredClone(input);
    const forward = combineBounds(input);
    const reverse = combineBounds([...input].reverse());
    expect(forward).toEqual(reverse);
    expect(input).toEqual(snapshot);
    expect(forward.east - forward.west).toBe(141);
  });
  it("unwraps Pacific routes along the shortest arc and retains Korea destination", () => {
    const catalog = new FixtureLocationGeometryCatalog();
    const route = unwrapRoute([
      { longitude: -98, latitude: 39 }, { longitude: 121, latitude: 23.7 },
      { longitude: 127.8, latitude: 36.3 },
    ]);
    expect(route[1]!.longitude).toBeLessThan(-98);
    const script = buildRouteDirective();
    const overlays = resolveOverlays([script], catalog);
    expect(overlays[0]?.points).toHaveLength(3);
    expect(overlays[0]?.destinationPointIndex).toBe(2);
    const data = buildOverlayFeatureCollection(overlays);
    const routeFeature = data.features.find(({ properties }) => properties?.kind === "route");
    expect(routeFeature?.geometry.type).toBe("MultiLineString");
    if (routeFeature?.geometry.type !== "MultiLineString") throw new Error("route unavailable");
    expect(routeFeature.geometry.coordinates).toHaveLength(2);
    expect(routeFeature.geometry.coordinates[0]?.[0]).toEqual([-98, 39]);
    expect(routeFeature.geometry.coordinates[0]?.at(-1)?.[0]).toBe(-180);
    expect(routeFeature.geometry.coordinates[1]?.[0]?.[0]).toBe(180);
    expect(routeFeature.geometry.coordinates[1]?.slice(1).map(([longitude]) => longitude))
      .toEqual([121, 127.80000000000001]);
    expect(routeFeature.geometry.coordinates.flat(2)
      .filter((_value, index) => index % 2 === 0)
      .every((longitude) => longitude >= -180 && longitude <= 180)).toBe(true);
    expect(data.features).toHaveLength(1);
    const markers = buildMarkerModels(overlays);
    expect(markers).toHaveLength(3);
    expect(markers.map(({ longitude }) => longitude)).toEqual([-98, 121, 127.80000000000001]);
    expect(markers.map(({ role }) => role)).toEqual(["origin", "waypoint", "destination"]);
    expect(markers[2]?.label).toBe("Destination: South Korea");
    const briefing = adaptBriefingScript(buildDemoScript());
    if (!briefing.success) throw new Error("fixture adaptation failed");
    const overview = resolveOverlays(
      briefing.value.scenes[1]!.visualDirectives,
      new FixtureLocationGeometryCatalog(),
    );
    const regional = resolveOverlays(
      briefing.value.scenes[2]!.visualDirectives,
      new FixtureLocationGeometryCatalog(),
    );
    expect(buildMarkerModels(overview)).toHaveLength(0);
    expect(buildMarkerModels(regional)).toHaveLength(0);
  });
  it("keeps high-contrast overlay layers above raster-only tone treatment", () => {
    const layers = overlayLayerDefinitions();
    expect(layers.map(({ id }) => id)).toEqual([
      ROUTE_CASING_LAYER_ID, ROUTE_LAYER_ID,
    ]);
    expect(layers.every(({ source }) => source === "briefing-overlays")).toBe(true);
    expect(layers[1]?.paint).toMatchObject({ "line-width": 5, "line-opacity": 1 });
    expect(layers.every(({ layout }) => layout?.visibility === "visible")).toBe(true);
    expect(layers[0]?.filter).toEqual(["==", ["get", "kind"], "route"]);
    expect(layers[1]?.filter).toEqual(["==", ["get", "kind"], "route"]);
    expect(demoMapStyle.layers[0]?.paint).toHaveProperty("raster-brightness-max");
    expect(JSON.stringify(layers)).not.toContain("raster-brightness");
  });
  it("restores overlay data and top-layer order after a style reload", () => {
    const source = { data: undefined as unknown, setData(data: unknown) { this.data = data; } };
    const layerOrder: string[] = ["osm"];
    const map = {
      source: undefined as typeof source | undefined,
      isStyleLoaded: () => true,
      getSource() { return this.source; },
      addSource(_id: string, value: { data: unknown }) {
        this.source = source;
        source.data = value.data;
      },
      getLayer(id: string) { return layerOrder.includes(id) ? { id } : undefined; },
      addLayer(layer: { id: string }) { layerOrder.push(layer.id); },
      moveLayer(id: string) {
        layerOrder.splice(layerOrder.indexOf(id), 1);
        layerOrder.push(id);
      },
    };
    const overlays = resolveOverlays([buildRouteDirective()], new FixtureLocationGeometryCatalog());
    const data = buildOverlayFeatureCollection(overlays);
    expect(reconcileOverlayStyle(map, data)).toBe(true);
    expect(layerOrder).toEqual([
      "osm", ROUTE_CASING_LAYER_ID, ROUTE_LAYER_ID,
    ]);
    map.source = undefined;
    layerOrder.splice(1);
    expect(reconcileOverlayStyle(map, data)).toBe(true);
    expect(source.data).toEqual(data);
    expect(layerOrder.slice(-2)).toEqual([
      ROUTE_CASING_LAYER_ID, ROUTE_LAYER_ID,
    ]);
  });
  it("rejects stale scene cleanup and retains the latest overlay snapshot", () => {
    const store = new OverlaySnapshotStore();
    const catalog = new FixtureLocationGeometryCatalog();
    const latest = buildOverlayFeatureCollection(resolveOverlays([buildRouteDirective()], catalog));
    store.apply("scene:regional", { type: "FeatureCollection", features: [] });
    store.apply("scene:impact", latest);
    expect(store.clear("scene:regional")).toBe(false);
    expect(store.currentFingerprint()).toBe("scene:impact");
    expect(store.current().features).toHaveLength(1);
    expect(store.clear("scene:impact")).toBe(true);
    expect(store.current().features).toHaveLength(0);
  });
  it("queues the latest overlay while style loads and applies it without an error state", () => {
    const store = new OverlaySnapshotStore();
    const data = buildOverlayFeatureCollection(resolveOverlays(
      [buildRouteDirective()], new FixtureLocationGeometryCatalog(),
    ));
    store.apply("scene:impact", data);
    let ready = false;
    const source = { data: undefined as unknown, setData(value: unknown) { this.data = value; } };
    const layers: string[] = ["osm"];
    const map = {
      isStyleLoaded: () => ready,
      getSource: () => ready ? source : undefined,
      addSource: (_id: string, value: { data: unknown }) => { source.data = value.data; },
      getLayer: (id: string) => layers.includes(id) ? { id } : undefined,
      addLayer: (layer: { id: string }) => { layers.push(layer.id); },
      moveLayer: (id: string) => {
        layers.splice(layers.indexOf(id), 1);
        layers.push(id);
      },
    };
    expect(reconcileOverlayStyle(map, store.current())).toBe(false);
    expect(store.current().features).toHaveLength(1);
    ready = true;
    expect(reconcileOverlayStyle(map, store.current())).toBe(true);
    expect(source.data).toEqual(data);
    expect(layers.slice(-2)).toEqual([
      ROUTE_CASING_LAYER_ID, ROUTE_LAYER_ID,
    ]);
  });
  it("calculates composer, panel, expanded, mobile and clamped insets", () => {
    const base = {
      viewportWidth: 1000, viewportHeight: 700, composerHeight: 70,
      playbackHeight: 60, captionHeight: 80, sidePanelWidth: 360,
      mobileSafeAreaBottom: 20, panelOpen: true, composerExpanded: false, mobile: false,
    };
    const desktop = calculateViewportInsets(base);
    const collapsed = calculateViewportInsets({ ...base, panelOpen: false });
    const mobile = calculateViewportInsets({ ...base, mobile: true });
    const expanded = calculateViewportInsets({ ...base, composerExpanded: true });
    const invalid = calculateViewportInsets({ ...base, composerHeight: -10, sidePanelWidth: 9_999 });
    expect(desktop.right).toBeGreaterThan(collapsed.right);
    expect(collapsed.right).toBe(20);
    expect(mobile.right).toBe(20);
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
  it("ignores scripted camera events and accepts only original user input", () => {
    const gate = new MapInteractionGate();
    const ease = gate.startProgrammaticMotion();
    expect(gate.receiveMapEvent(false)).toEqual({
      manual: false, cancelProgrammaticMotion: false,
    });
    expect(gate.completeProgrammaticMotion(ease)).toBe(true);
    for (const operation of ["flyTo", "fitBounds", "jumpTo", "replay", "style.load", "resize"]) {
      const motion = gate.startProgrammaticMotion();
      expect(gate.receiveMapEvent(false), operation).toMatchObject({ manual: false });
      expect(gate.completeProgrammaticMotion(motion)).toBe(true);
    }
  });
  it.each(["drag", "wheel", "touch", "rotate", "keyboard"])(
    "treats original %s input as manual interaction",
    () => {
      const gate = new MapInteractionGate();
      expect(gate.receiveMapEvent(true)).toEqual({
        manual: true, cancelProgrammaticMotion: false,
      });
    },
  );
  it("cancels scripted motion on real input and ignores its stale moveend", () => {
    const gate = new MapInteractionGate();
    const staleMotion = gate.startProgrammaticMotion();
    expect(gate.receiveMapEvent(true)).toEqual({
      manual: true, cancelProgrammaticMotion: true,
    });
    const latestMotion = gate.startProgrammaticMotion();
    expect(gate.completeProgrammaticMotion(staleMotion)).toBe(false);
    expect(gate.isProgrammaticMotion()).toBe(true);
    expect(gate.completeProgrammaticMotion(latestMotion)).toBe(true);
    expect(gate.isProgrammaticMotion()).toBe(false);
  });
});

const buildRouteDirective = () => {
  const result = adaptBriefingScript(buildDemoScript());
  if (!result.success) throw new Error("fixture adaptation failed");
  return result.value.scenes[3]!.visualDirectives[0]!;
};
