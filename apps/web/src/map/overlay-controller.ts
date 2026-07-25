import type { SceneVisualDirective } from "@world-news-ai/script-web";
import type { LocationGeometryCatalog } from "./location-catalog";
import type { ResolvedOverlayInstruction } from "./map-adapter";

export function resolveOverlays(
  directives: SceneVisualDirective[],
  catalog: LocationGeometryCatalog,
): ResolvedOverlayInstruction[] {
  return directives.flatMap((directive) => {
    const points = catalog.resolveMany(directive.locationIds)
      .flatMap((result) => result.success ? [result.geometry.center] : []);
    if (points.length === 0) return [];
    return [{
      id: directive.id,
      type: directive.mode === "map-flow" ? "route" as const : "marker" as const,
      points,
      label: directive.purpose,
    }];
  });
}
