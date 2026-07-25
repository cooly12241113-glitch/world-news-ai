import type { SceneVisualDirective } from "@world-news-ai/script-web";
import type { LocationGeometryCatalog } from "./location-catalog";
import type { ResolvedOverlayInstruction } from "./map-adapter";

export function resolveOverlays(
  directives: SceneVisualDirective[],
  catalog: LocationGeometryCatalog,
): ResolvedOverlayInstruction[] {
  return directives.flatMap((directive) => {
    const resolved = catalog.resolveMany(directive.locationIds);
    if (resolved.some((result) => !result.success)) return [];
    const points = resolved
      .flatMap((result) => result.success ? [result.geometry.center] : []);
    if (points.length === 0) return [];
    return [{
      id: directive.id,
      type: directive.mode === "map-flow" ? "route" as const : "marker" as const,
      points: directive.mode === "map-flow" ? unwrapRoute(points) : points,
      label: directive.purpose,
      pointLabels: resolved.flatMap((result) => result.success ? [result.geometry.label] : []),
      ...(directive.mode === "map-flow" ? { destinationPointIndex: points.length - 1 } : {}),
    }];
  });
}

export function unwrapRoute<T extends { longitude: number; latitude: number }>(points: T[]): T[] {
  const result: T[] = [];
  for (const point of points) {
    const previous = result.at(-1)?.longitude;
    if (previous === undefined) { result.push({ ...point }); continue; }
    const candidates = [point.longitude - 360, point.longitude, point.longitude + 360];
    const longitude = candidates.reduce((best, value) =>
      Math.abs(value - previous) < Math.abs(best - previous) ? value : best);
    result.push({ ...point, longitude });
  }
  return result;
}
