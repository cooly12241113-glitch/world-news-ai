import {
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  type AddLayerObject,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { WORLD_CAMERA, type CameraMotionInstruction, type MapCameraState,
  type MapInitializationConfiguration, type MapRendererAdapter,
  type MapUserInteractionEvent, type ResolvedOverlayInstruction } from "./map-adapter";

export const OVERLAY_SOURCE_ID = "briefing-overlays";
export const ROUTE_CASING_LAYER_ID = "briefing-route-casing";
export const ROUTE_LAYER_ID = "briefing-routes";

export function buildOverlayFeatureCollection(
  overlays: ResolvedOverlayInstruction[],
): FeatureCollection<Geometry> {
  const features: Feature<Geometry>[] = overlays.flatMap((overlay): Feature<Geometry>[] => {
    if (overlay.type !== "route" || overlay.points.length < 2) return [];
    const segments = splitRouteAtAntimeridian(overlay.points);
    return [{
      type: "Feature", properties: { kind: "route", label: overlay.label },
      geometry: { type: "MultiLineString", coordinates: segments },
    }];
  });
  return { type: "FeatureCollection", features };
}

export interface MarkerModel {
  longitude: number;
  latitude: number;
  role: "origin" | "waypoint" | "destination";
  label: string;
}

export function buildMarkerModels(overlays: ResolvedOverlayInstruction[]): MarkerModel[] {
  return overlays.filter((overlay) => overlay.type === "route")
    .flatMap((overlay) => overlay.points.map((point, index) => ({
    longitude: normalizeLongitude(point.longitude),
    latitude: point.latitude,
    role: index === overlay.destinationPointIndex ? "destination" as const
      : index === 0 ? "origin" as const : "waypoint" as const,
    label: `${index === overlay.destinationPointIndex ? "Destination"
      : index === 0 ? "Origin" : "Waypoint"}: ${overlay.pointLabels?.[index] ?? overlay.label}`,
    })));
}

export function splitRouteAtAntimeridian(
  points: Array<{ longitude: number; latitude: number }>,
): number[][][] {
  if (points.length === 0) return [];
  const normalized = points.map((point) => ({
    longitude: normalizeLongitude(point.longitude), latitude: point.latitude,
  }));
  const segments: number[][][] = [[[normalized[0]!.longitude, normalized[0]!.latitude]]];
  for (let index = 1; index < normalized.length; index += 1) {
    const start = normalized[index - 1]!;
    const end = normalized[index]!;
    const delta = end.longitude - start.longitude;
    if (Math.abs(delta) > 180) {
      const westbound = delta > 0;
      const adjustedEnd = end.longitude + (westbound ? -360 : 360);
      const edge = westbound ? -180 : 180;
      const ratio = (edge - start.longitude) / (adjustedEnd - start.longitude);
      const latitude = start.latitude + (end.latitude - start.latitude) * ratio;
      segments.at(-1)!.push([edge, latitude]);
      segments.push([[westbound ? 180 : -180, latitude]]);
    }
    segments.at(-1)!.push([end.longitude, end.latitude]);
  }
  return segments;
}

const normalizeLongitude = (longitude: number) =>
  ((longitude + 180) % 360 + 360) % 360 - 180;

export class MapInteractionGate {
  private sequence = 0;
  private activeMotionId?: number;
  startProgrammaticMotion() {
    const id = ++this.sequence;
    this.activeMotionId = id;
    return id;
  }
  completeProgrammaticMotion(id: number) {
    if (id !== this.activeMotionId) return false;
    this.activeMotionId = undefined;
    return true;
  }
  receiveMapEvent(hasOriginalEvent: boolean) {
    if (!hasOriginalEvent) return { manual: false, cancelProgrammaticMotion: false };
    const cancelProgrammaticMotion = this.activeMotionId !== undefined;
    this.activeMotionId = undefined;
    this.sequence += 1;
    return { manual: true, cancelProgrammaticMotion };
  }
  isProgrammaticMotion() { return this.activeMotionId !== undefined; }
}

export const overlayLayerDefinitions = () => ([
  {
    id: ROUTE_CASING_LAYER_ID, type: "line" as const, source: OVERLAY_SOURCE_ID,
    layout: { visibility: "visible" as const },
    filter: ["==", ["get", "kind"], "route"],
    paint: { "line-color": "#03131c", "line-width": 9, "line-opacity": 0.96 },
  },
  {
    id: ROUTE_LAYER_ID, type: "line" as const, source: OVERLAY_SOURCE_ID,
    layout: { visibility: "visible" as const },
    filter: ["==", ["get", "kind"], "route"],
    paint: { "line-color": "#63f5dc", "line-width": 5, "line-opacity": 1 },
  },
] satisfies AddLayerObject[]);

interface OverlayStyleMap {
  isStyleLoaded(): boolean | void;
  getSource(id: string): unknown;
  addSource(id: string, source: { type: "geojson"; data: FeatureCollection<Geometry> }): void;
  getLayer(id: string): unknown;
  addLayer(layer: AddLayerObject): void;
  moveLayer(id: string): void;
}

export function reconcileOverlayStyle(
  map: OverlayStyleMap,
  data: FeatureCollection<Geometry>,
) {
  if (!map.isStyleLoaded()) return false;
  const source = map.getSource(OVERLAY_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) map.addSource(OVERLAY_SOURCE_ID, { type: "geojson", data });
  for (const layer of overlayLayerDefinitions()) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
    map.moveLayer(layer.id);
  }
  const finalSource = map.getSource(OVERLAY_SOURCE_ID) as GeoJSONSource | undefined;
  finalSource?.setData(data);
  return true;
}

export class OverlaySnapshotStore {
  private fingerprint?: string;
  private data: FeatureCollection<Geometry> = { type: "FeatureCollection", features: [] };
  apply(fingerprint: string | undefined, data: FeatureCollection<Geometry>) {
    if (fingerprint === this.fingerprint) return false;
    this.fingerprint = fingerprint;
    this.data = data;
    return true;
  }
  clear(fingerprint?: string) {
    if (fingerprint && fingerprint !== this.fingerprint) return false;
    this.fingerprint = undefined;
    this.data = { type: "FeatureCollection", features: [] };
    return true;
  }
  current() { return this.data; }
  currentFingerprint() { return this.fingerprint; }
}

export class MapLibreMapRendererAdapter implements MapRendererAdapter {
  private map?: MapLibreMap;
  private state: MapCameraState = WORLD_CAMERA;
  private readonly interactionGate = new MapInteractionGate();
  private manualGestureActive = false;
  private readonly overlaySnapshot = new OverlaySnapshotStore();
  private markers: MapLibreMarker[] = [];
  private readonly listeners = new Set<(event: MapUserInteractionEvent) => void>();
  private readonly cameraListeners = new Set<() => void>();

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
      map.on("dragstart", (event) => this.handleMapInteraction("pan", event));
      map.on("zoomstart", (event) => this.handleMapInteraction("zoom", event));
      map.on("rotatestart", (event) => this.handleMapInteraction("rotate", event));
      map.on("movestart", (event) => this.handleMapInteraction("pan", event));
      map.on("moveend", () => {
        queueMicrotask(() => { this.manualGestureActive = false; });
      });
      map.on("move", () => this.notifyCameraChange());
      map.on("zoom", () => this.notifyCameraChange());
      map.on("rotate", () => this.notifyCameraChange());
      map.on("pitch", () => this.notifyCameraChange());
      map.on("resize", () => this.notifyCameraChange());
      map.on("moveend", () => this.notifyCameraChange());
      map.on("zoomend", () => this.notifyCameraChange());
      map.on("rotateend", () => this.notifyCameraChange());
      map.on("style.load", () => {
        this.ensureOverlayArtifacts();
        this.notifyCameraChange();
      });
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
    if (this.interactionGate.isProgrammaticMotion()) this.map.stop();
    const motionId = this.interactionGate.startProgrammaticMotion();
    const options = {
      center: [instruction.destination.center.longitude, instruction.destination.center.latitude] as [number, number],
      zoom: instruction.destination.zoom,
      bearing: instruction.destination.bearing,
      pitch: instruction.destination.pitch,
      duration: instruction.durationMs,
      padding: instruction.viewportInsets,
      essential: instruction.essential,
    };
    if (instruction.transition === "jump") {
      this.map.jumpTo(options);
      this.interactionGate.completeProgrammaticMotion(motionId);
      this.state = instruction.destination;
      return { success: true };
    }
    const completion = new Promise<void>((resolve) => this.map!.once("moveend", () => {
      this.interactionGate.completeProgrammaticMotion(motionId);
      resolve();
    }));
    if (instruction.transition === "fly") this.map.flyTo(options);
    else this.map.easeTo(options);
    this.state = instruction.destination;
    await completion;
    return { success: true };
  }
  async applyOverlays(overlays: ResolvedOverlayInstruction[], fingerprint?: string) {
    if (!this.map) return { success: false, message: "Map is not initialized." };
    const snapshotKey = fingerprint ?? JSON.stringify(overlays);
    this.overlaySnapshot.apply(snapshotKey, buildOverlayFeatureCollection(overlays));
    this.applyMarkers(buildMarkerModels(overlays));
    if (!this.ensureOverlayArtifacts()) {
      return { success: true, pending: true };
    }
    return { success: true };
  }
  async clearSceneOverlays(fingerprint?: string) {
    if (!this.overlaySnapshot.clear(fingerprint)) return;
    this.clearMarkers();
    const source = this.map?.getSource(OVERLAY_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(this.overlaySnapshot.current());
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
  subscribeToCameraChange(listener: () => void) {
    this.cameraListeners.add(listener);
    return () => this.cameraListeners.delete(listener);
  }
  destroy() {
    this.clearMarkers();
    this.map?.remove();
    this.map = undefined;
    this.listeners.clear();
    this.cameraListeners.clear();
  }
  projectPoints(points: ResolvedOverlayInstruction["points"]) {
    if (!this.map) return [];
    const center = this.map.getCenter().lng;
    return points.map((point) => {
      const longitude = closestWorldCopy(normalizeLongitude(point.longitude), center);
      const projected = this.map!.project([longitude, point.latitude]);
      return { x: projected.x, y: projected.y };
    });
  }
  private applyMarkers(models: MarkerModel[]) {
    if (!this.map) return;
    this.clearMarkers();
    const center = this.map.getCenter().lng;
    this.markers = models.map((model) => {
      const element = document.createElement("div");
      element.className = `briefing-map-marker ${model.role}`;
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", model.label);
      return new MapLibreMarker({ element })
        .setLngLat([closestWorldCopy(model.longitude, center), model.latitude])
        .addTo(this.map!);
    });
  }
  private clearMarkers() {
    for (const marker of this.markers) marker.remove();
    this.markers = [];
  }
  private ensureOverlayArtifacts() {
    return this.map ? reconcileOverlayStyle(this.map, this.overlaySnapshot.current()) : false;
  }
  private handleMapInteraction(
    type: MapUserInteractionEvent["type"],
    event: { originalEvent?: unknown },
  ) {
    const decision = this.interactionGate.receiveMapEvent(Boolean(event.originalEvent));
    if (!decision.manual || this.manualGestureActive) return;
    this.manualGestureActive = true;
    if (decision.cancelProgrammaticMotion) this.map?.stop();
    for (const listener of this.listeners) listener({ type, source: "user" });
  }
  private notifyCameraChange() {
    if (this.map) {
      const center = this.map.getCenter();
      this.state = {
        center: { longitude: center.lng, latitude: center.lat },
        zoom: this.map.getZoom(),
        bearing: this.map.getBearing(),
        pitch: this.map.getPitch(),
      };
    }
    for (const listener of this.cameraListeners) listener();
  }
}

const closestWorldCopy = (longitude: number, reference: number) =>
  longitude + Math.round((reference - longitude) / 360) * 360;

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
  layers: [{
    id: "osm", type: "raster" as const, source: "openmaptiles",
    paint: {
      "raster-brightness-max": 0.72,
      "raster-saturation": -0.55,
      "raster-contrast": 0.08,
    },
  }],
};
