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
    geometries.length === 1 && geometry.bounds ? [geometry.bounds] : [{
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
  const south = Math.min(...bounds.map((value) => value.south));
  const north = Math.max(...bounds.map((value) => value.north));
  const intervals = bounds.flatMap(({ west, east }) => longitudeIntervals(west, east))
    .sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  let largestGap: [number, number] = [0, 0];
  for (let index = 0; index < merged.length; index += 1) {
    const current = merged[index]!;
    const next = merged[(index + 1) % merged.length]!;
    const gap: [number, number] = [current[1], next[0] + (index === merged.length - 1 ? 360 : 0)];
    if (gap[1] - gap[0] > largestGap[1] - largestGap[0]) largestGap = gap;
  }
  const west = normalizeLongitude(largestGap[1]);
  return { west, south, east: west + 360 - (largestGap[1] - largestGap[0]), north };
}

const longitudeIntervals = (west: number, east: number): Array<[number, number]> => {
  const start = normalize360(west);
  const width = Math.min(360, Math.max(0, east - west < 0 ? east - west + 360 : east - west));
  if (width >= 360) return [[0, 360]];
  if (start + width <= 360) return [[start, start + width]];
  return [[start, 360], [0, start + width - 360]];
};

const normalize360 = (longitude: number) => ((longitude % 360) + 360) % 360;
const normalizeLongitude = (longitude: number) => {
  const normalized = normalize360(longitude);
  return normalized > 180 ? normalized - 360 : normalized;
};
