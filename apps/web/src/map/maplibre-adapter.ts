import {
  Map as MapLibreMap,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { WORLD_CAMERA, type CameraMotionInstruction, type MapCameraState,
  type MapInitializationConfiguration, type MapRendererAdapter,
  type MapUserInteractionEvent, type ResolvedOverlayInstruction } from "./map-adapter";

const SOURCE_ID = "briefing-overlays";
const LINE_LAYER_ID = "briefing-routes";
const POINT_LAYER_ID = "briefing-points";

export class MapLibreMapRendererAdapter implements MapRendererAdapter {
  private map?: MapLibreMap;
  private state: MapCameraState = WORLD_CAMERA;
  private programmaticMotion = false;
  private readonly listeners = new Set<(event: MapUserInteractionEvent) => void>();

  async initialize(container: HTMLElement, configuration: MapInitializationConfiguration) {
    try {
      this.state = configuration.initialCamera;
      const map = new MapLibreMap({
        container,
        style: configuration.style as string | StyleSpecification,
        center: [this.state.center.longitude, this.state.center.latitude],
        zoom: this.state.zoom,
        bearing: this.state.bearing,
        pitch: this.state.pitch,
        attributionControl: {},
      });
      this.map = map;
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      map.on("dragstart", () => this.notify("pan"));
      map.on("zoomstart", () => this.notify("zoom"));
      await new Promise<void>((resolve, reject) => {
        map.once("load", () => resolve());
        map.once("error", (event) => reject(event.error));
      });
      return { success: true };
    } catch {
      this.destroy();
      return { success: false, message: "Map style could not be loaded." };
    }
  }
  async applyMotion(instruction: CameraMotionInstruction) {
    if (!this.map) return { success: false, message: "Map is not initialized." };
    this.programmaticMotion = true;
    const options = {
      center: [instruction.destination.center.longitude, instruction.destination.center.latitude] as [number, number],
      zoom: instruction.destination.zoom,
      bearing: instruction.destination.bearing,
      pitch: instruction.destination.pitch,
      duration: instruction.durationMs,
      padding: instruction.viewportInsets,
      essential: instruction.essential,
    };
    if (instruction.transition === "jump") this.map.jumpTo(options);
    else if (instruction.transition === "fly") this.map.flyTo(options);
    else this.map.easeTo(options);
    this.state = instruction.destination;
    await new Promise<void>((resolve) => this.map!.once("moveend", () => {
      this.programmaticMotion = false;
      resolve();
    }));
    return { success: true };
  }
  async applyOverlays(overlays: ResolvedOverlayInstruction[]) {
    if (!this.map) return { success: false, message: "Map is not initialized." };
    const features: Feature<Geometry>[] = overlays.flatMap((overlay): Feature<Geometry>[] => {
      if (overlay.type === "route" && overlay.points.length > 1) return [{
        type: "Feature", properties: { kind: "route", label: overlay.label },
        geometry: { type: "LineString", coordinates: overlay.points.map((point) => [point.longitude, point.latitude]) },
      }];
      return overlay.points.map((point) => ({
        type: "Feature" as const, properties: { kind: "point", label: overlay.label },
        geometry: { type: "Point" as const, coordinates: [point.longitude, point.latitude] },
      }));
    });
    const data: FeatureCollection = { type: "FeatureCollection", features };
    const source = this.map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      this.map.addSource(SOURCE_ID, { type: "geojson", data });
      this.map.addLayer({ id: LINE_LAYER_ID, type: "line", source: SOURCE_ID,
        filter: ["==", ["get", "kind"], "route"],
        paint: { "line-color": "#55d6be", "line-width": 3, "line-opacity": 0.8 } });
      this.map.addLayer({ id: POINT_LAYER_ID, type: "circle", source: SOURCE_ID,
        filter: ["==", ["get", "kind"], "point"],
        paint: { "circle-color": "#f8c15c", "circle-radius": 6, "circle-stroke-color": "#071019", "circle-stroke-width": 2 } });
    }
    return { success: true };
  }
  async clearSceneOverlays() {
    const source = this.map?.getSource(SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData({ type: "FeatureCollection", features: [] });
  }
  getCameraState() { return this.state; }
  resize() { this.map?.resize(); }
  setInteractionEnabled(enabled: boolean) {
    const handlers = this.map && [this.map.dragPan, this.map.scrollZoom, this.map.touchZoomRotate];
    handlers?.forEach((handler) => enabled ? handler.enable() : handler.disable());
  }
  subscribeToUserInteraction(listener: (event: MapUserInteractionEvent) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  destroy() { this.map?.remove(); this.map = undefined; this.listeners.clear(); }
  private notify(type: MapUserInteractionEvent["type"]) {
    if (!this.programmaticMotion) {
      for (const listener of this.listeners) listener({ type, source: "user" });
    }
  }
}

export const demoMapStyle = {
  version: 8 as const,
  sources: {
    openmaptiles: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "openmaptiles" }],
};
