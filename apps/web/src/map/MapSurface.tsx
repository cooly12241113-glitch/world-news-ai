import { useEffect, useRef, useState } from "react";
import type { RenderableScene } from "../renderer/presentation-adapter";
import type { BriefingPlayerState } from "../player/player-state";
import { resolveCameraTarget } from "./camera-target-resolver";
import { FixtureLocationGeometryCatalog } from "./fixture-location-catalog";
import { MapLibreMapRendererAdapter, demoMapStyle } from "./maplibre-adapter";
import type { MapRendererAdapter, MapViewportInsets } from "./map-adapter";
import { WORLD_CAMERA } from "./map-adapter";
import { planCameraMotion } from "./motion-planner";
import { resolveOverlays } from "./overlay-controller";

interface Props {
  scene: RenderableScene;
  player: BriefingPlayerState;
  insets: MapViewportInsets;
  reducedMotion: boolean;
  onUserInteraction: () => void;
  adapterFactory?: () => MapRendererAdapter;
}

const catalog = new FixtureLocationGeometryCatalog();
const defaultAdapterFactory = () => new MapLibreMapRendererAdapter();
const style = () => import.meta.env.VITE_MAP_STYLE_URL
  || (import.meta.env.VITE_MAP_DEMO_STYLE_ENABLED !== "false" ? demoMapStyle : demoMapStyle);

export function MapSurface({
  scene, player, insets, reducedMotion, onUserInteraction,
  adapterFactory = defaultAdapterFactory,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const adapter = useRef<MapRendererAdapter | undefined>(undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!container.current) return;
    const instance = adapterFactory();
    adapter.current = undefined;
    setStatus("loading");
    let active = true;
    let unsubscribe = () => {};
    void instance.initialize(container.current, {
      style: style(),
      initialCamera: WORLD_CAMERA,
    }).then((result) => {
      if (!active) return;
      if (!result.success) setStatus("error");
      else {
        adapter.current = instance;
        setStatus("ready");
        unsubscribe = instance.subscribeToUserInteraction(() => onUserInteraction());
      }
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => {
      active = false;
      unsubscribe();
      observer.disconnect();
      instance.destroy();
      if (adapter.current === instance) adapter.current = undefined;
    };
  }, [adapterFactory, onUserInteraction, retry]);

  useEffect(() => {
    const instance = adapter.current;
    if (!instance || status !== "ready") return;
    let active = true;
    const directive = scene.visualDirectives.find(({ mode }) => mode === "map" || mode === "map-flow");
    void instance.clearSceneOverlays().then(async () => {
      if (!active || !directive) return;
      const overlays = resolveOverlays(scene.visualDirectives, catalog);
      const overlayResult = await instance.applyOverlays(overlays);
      if (!active || !overlayResult.success) { setStatus("error"); return; }
      const target = resolveCameraTarget(directive.cameraIntent, catalog);
      if (!target.success) { setStatus("error"); return; }
      const plan = planCameraMotion({
        intent: directive.cameraIntent,
        current: instance.getCameraState(),
        target: target.value,
        viewportInsets: insets,
        playbackSpeed: player.playbackSpeed,
        animationPolicy: player.animationEnabled ? (reducedMotion ? "minimal" : "full") : "disabled",
        cameraMotionPolicy: reducedMotion ? "minimize" : "allow",
        reducedMotion,
        timing: { pace: player.playbackSpeed, hold: "standard", userAdvanceAllowed: true },
        transition: { style: reducedMotion ? "minimal" : "continuous", preserveUserView: true, requiresMotionPlanner: true },
      });
      for (const segment of plan.segments) {
        const result = await instance.applyMotion(segment);
        if (!active || !result.success) { setStatus("error"); break; }
      }
    });
    return () => { active = false; };
  }, [scene, player.playbackSpeed, player.animationEnabled, insets, reducedMotion, status]);

  return (
    <section className="map-surface" aria-label="Interactive world map">
      <div ref={container} className="map-canvas" aria-hidden="true" />
      <p className="sr-only">
        Accessible map summary: {scene.objective}. Locations:{" "}
        {scene.visualDirectives.flatMap(({ locationIds }) => locationIds).join(", ") || "none"}.
      </p>
      {status === "loading" && <div className="map-status">Loading map…</div>}
      {status === "error" && (
        <div className="map-status map-error" role="alert">
          <strong>Map unavailable</strong>
          <span>The briefing, evidence, and navigation remain available.</span>
          <button type="button" onClick={() => { setStatus("loading"); setRetry((value) => value + 1); }}>
            Retry map
          </button>
        </div>
      )}
    </section>
  );
}
