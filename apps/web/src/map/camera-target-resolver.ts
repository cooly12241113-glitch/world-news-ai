import type { CameraIntent } from "@world-news-ai/script-web";
import type { LocationGeometryCatalog } from "./location-catalog";
import type { GeoBounds, ResolvedCameraTarget } from "./map-adapter";
import { rendererFailure, type RendererResult } from "../renderer/renderer-result";

const zoomFor = (framing: CameraIntent["framing"]): number => ({
  global: 1.25, "multi-region": 2, continental: 2.6, regional: 3.4,
  national: 4.6, subnational: 6, local: 8, network: 2.8, current: 3,
})[framing];

export function resolveCameraTarget(
  intent: CameraIntent,
  catalog: LocationGeometryCatalog,
): RendererResult<ResolvedCameraTarget> {
  const resolved = catalog.resolveMany(intent.targetLocationIds);
  const failures = resolved.filter((entry) => !entry.success);
  if (failures.length > 0 || resolved.length === 0) {
    return rendererFailure("LOCATION_RESOLUTION_FAILED",
      failures[0]?.message ?? "Camera target has no resolvable location.");
  }
  const geometries = resolved.flatMap((entry) => entry.success ? [entry.geometry] : []);
  const bounds = combineBounds(geometries.flatMap((geometry) =>
    geometry.bounds ? [geometry.bounds] : [{
      west: geometry.center.longitude, east: geometry.center.longitude,
      south: geometry.center.latitude, north: geometry.center.latitude,
    }]));
  const center = {
    longitude: (bounds.west + bounds.east) / 2,
    latitude: (bounds.south + bounds.north) / 2,
  };
  return {
    success: true,
    value: {
      center,
      ...(geometries.length > 1 || geometries.some(({ bounds }) => bounds) ? { bounds } : {}),
      zoom: zoomFor(intent.framing),
      bearing: 0,
      pitch: intent.action === "trace-route" ? 18 : 0,
    },
    warnings: [],
  };
}

export function combineBounds(bounds: GeoBounds[]): GeoBounds {
  if (bounds.length === 0) throw new Error("At least one bound is required.");
  return bounds.reduce((combined, value) => ({
    west: Math.min(combined.west, value.west),
    south: Math.min(combined.south, value.south),
    east: Math.max(combined.east, value.east),
    north: Math.max(combined.north, value.north),
  }));
}
