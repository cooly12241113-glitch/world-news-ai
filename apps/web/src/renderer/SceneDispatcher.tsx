import type { BriefingPlayerState } from "../player/player-state";
import type { MapRendererAdapter, MapViewportInsets } from "../map/map-adapter";
import { MapSurface } from "../map/MapSurface";
import { EvidenceBoardSurface, surfaceFor } from "../surfaces/Surfaces";
import type { RenderableScene } from "./presentation-adapter";

export function SceneDispatcher({
  scene, player, insets, reducedMotion, onMapInteraction, mapAdapterFactory,
}: {
  scene: RenderableScene;
  player: BriefingPlayerState;
  insets: MapViewportInsets;
  reducedMotion: boolean;
  onMapInteraction: () => void;
  mapAdapterFactory?: () => MapRendererAdapter;
}) {
  if (scene.primarySurface === "map") {
    return <div className="scene-stack">
      <MapSurface scene={scene} player={player} insets={insets}
        reducedMotion={reducedMotion} onUserInteraction={onMapInteraction}
        adapterFactory={mapAdapterFactory} />
      {scene.kind === "supporting-evidence" && <EvidenceBoardSurface scene={scene} />}
    </div>;
  }
  return <div className="scene-stack">{surfaceFor(scene.primarySurface, scene)}</div>;
}
