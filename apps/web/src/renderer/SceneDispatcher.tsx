import type { CSSProperties, ReactNode } from "react";
import type { BriefingPlayerState } from "../player/player-state";
import type {
  MapCameraState, MapRendererAdapter, MapViewportInsets,
} from "../map/map-adapter";
import { MapSurface } from "../map/MapSurface";
import { EvidenceBoardSurface, surfaceFor } from "../surfaces/Surfaces";
import type { RenderableScene } from "./presentation-adapter";

export function SceneDispatcher({
  scene, player, insets, reducedMotion, onMapInteraction, mapAdapterFactory,
  surfaceIdentity, flowCaption, flowDock,
}: {
  scene: RenderableScene;
  player: BriefingPlayerState;
  insets: MapViewportInsets;
  reducedMotion: boolean;
  surfaceIdentity?: string;
  onMapInteraction: (viewport: MapCameraState) => void;
  mapAdapterFactory?: () => MapRendererAdapter;
  flowCaption?: ReactNode;
  flowDock?: ReactNode;
}) {
  if (scene.primarySurface === "map") {
    return <div className="scene-stack">
      <MapSurface scene={scene} player={player} insets={insets}
        surfaceIdentity={surfaceIdentity}
        reducedMotion={reducedMotion} onUserInteraction={onMapInteraction}
        adapterFactory={mapAdapterFactory} />
      {scene.kind === "supporting-evidence" && <EvidenceBoardSurface scene={scene} />}
    </div>;
  }
  const safeAreaStyle = {
    "--surface-right-inset": `${insets.right}px`,
    "--surface-bottom-inset": `${insets.bottom}px`,
  } as CSSProperties;
  return <div className="scene-stack non-map-scene-shell non-map-safe-area" style={safeAreaStyle}
    data-right-inset={insets.right} data-bottom-inset={insets.bottom}>
    <div className="non-map-scrollable-content">
      {surfaceFor(scene.primarySurface, scene)}
    </div>
    {flowCaption}
    {flowDock}
  </div>;
}
