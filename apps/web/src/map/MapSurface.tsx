import { useEffect, useRef, useState } from "react";
import type { RenderableScene } from "../renderer/presentation-adapter";
import type { BriefingPlayerState } from "../player/player-state";
import { resolveCameraTarget } from "./camera-target-resolver";
import { FixtureLocationGeometryCatalog } from "./fixture-location-catalog";
import { MapLibreMapRendererAdapter, demoMapStyle } from "./maplibre-adapter";
import type {
  GeoPoint, MapCameraState, MapRendererAdapter, MapViewportInsets, ProjectedPoint,
} from "./map-adapter";
import { WORLD_CAMERA } from "./map-adapter";
import { planCameraMotion } from "./motion-planner";
import { resolveOverlays } from "./overlay-controller";

interface Props {
  scene: RenderableScene;
  player: BriefingPlayerState;
  insets: MapViewportInsets;
  reducedMotion: boolean;
  surfaceIdentity?: string;
  onUserInteraction: (viewport: MapCameraState) => void;
  adapterFactory?: () => MapRendererAdapter;
}

const catalog = new FixtureLocationGeometryCatalog();
const defaultAdapterFactory = () => new MapLibreMapRendererAdapter();
const style = () => import.meta.env.VITE_MAP_STYLE_URL
  || (import.meta.env.VITE_MAP_DEMO_STYLE_ENABLED !== "false" ? demoMapStyle : demoMapStyle);

export function MapSurface({
  scene, player, insets, reducedMotion, onUserInteraction,
  surfaceIdentity = scene.id,
  adapterFactory = defaultAdapterFactory,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const adapter = useRef<MapRendererAdapter | undefined>(undefined);
  const interactionHandler = useRef(onUserInteraction);
  const sceneOperationId = useRef(0);
  const routeGeography = useRef<GeoPoint[]>([]);
  const lastMotionIdentity = useRef<{ sceneId: string; requestId: number } | undefined>(undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [warning, setWarning] = useState<string | undefined>();
  const [fallbackPoints, setFallbackPoints] = useState<ProjectedPoint[]>([]);
  const [retry, setRetry] = useState(0);

  useEffect(() => { interactionHandler.current = onUserInteraction; }, [onUserInteraction]);

  useEffect(() => {
    if (!container.current) return;
    const instance = adapterFactory();
    adapter.current = undefined;
    setStatus("loading");
    let active = true;
    let unsubscribe = () => {};
    let unsubscribeCamera = () => {};
    void instance.initialize(container.current, {
      style: style(),
      initialCamera: WORLD_CAMERA,
    }).then((result) => {
      if (!active) return;
      if (!result.success) setStatus("error");
      else {
        adapter.current = instance;
        setStatus("ready");
        unsubscribe = instance.subscribeToUserInteraction(() => {
          const current = instance.getCameraState();
          interactionHandler.current({
            center: { ...current.center },
            zoom: current.zoom,
            bearing: current.bearing,
            pitch: current.pitch,
          });
        });
        unsubscribeCamera = instance.subscribeToCameraChange(() => {
          if (routeGeography.current.length >= 3) {
            setFallbackPoints(instance.projectPoints(routeGeography.current));
          }
        });
      }
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);
    return () => {
      active = false;
      unsubscribe();
      unsubscribeCamera();
      observer.disconnect();
      instance.destroy();
      if (adapter.current === instance) adapter.current = undefined;
    };
  }, [adapterFactory, retry]);

  useEffect(() => {
    const instance = adapter.current;
    if (!instance || status !== "ready") return;
    const operationId = ++sceneOperationId.current;
    const shouldMoveCamera = lastMotionIdentity.current?.sceneId !== scene.id
      || lastMotionIdentity.current.requestId !== player.motionRequestId;
    lastMotionIdentity.current = { sceneId: scene.id, requestId: player.motionRequestId };
    if (scene.kind !== "impact-path") {
      setFallbackPoints([]);
      routeGeography.current = [];
    }
    const directive = scene.visualDirectives.find(({ mode }) => mode === "map" || mode === "map-flow");
    if (!directive) {
      setWarning(`No map directive for scene ${scene.id}.`);
      return;
    }
    void (async () => {
      const overlays = resolveOverlays(scene.visualDirectives, catalog);
      if (overlays.length === 0) {
        if (operationId === sceneOperationId.current) {
          setWarning(`Overlay resolution failed for scene ${scene.id}.`);
        }
        return;
      }
      if (scene.kind === "impact-path") {
        routeGeography.current = overlays[0]?.points.map((point) => ({ ...point })) ?? [];
        setFallbackPoints(instance.projectPoints(routeGeography.current));
      }
      const overlayResult = await instance.applyOverlays(overlays, scene.id);
      if (operationId !== sceneOperationId.current) return;
      if (!overlayResult.success) {
        setWarning(overlayResult.message ?? `Overlay application failed for scene ${scene.id}.`);
      } else {
        setWarning(undefined);
        if (scene.kind !== "impact-path") setFallbackPoints([]);
      }
      if (!shouldMoveCamera) return;
      const target = resolveCameraTarget(directive.cameraIntent, catalog);
      if (!target.success) { setWarning(target.error.message); return; }
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
        if (operationId !== sceneOperationId.current) return;
        if (!result.success) { setWarning(result.message ?? "Map motion failed."); break; }
      }
      if (operationId === sceneOperationId.current && scene.kind === "impact-path") {
        setFallbackPoints(instance.projectPoints(routeGeography.current));
      }
    })();
    return () => { sceneOperationId.current += 1; };
  }, [
    scene.id, scene.visualDirectives, surfaceIdentity,
    player.motionRequestId, status,
  ]);

  return (
    <section className="map-surface" aria-label="Interactive world map">
      <div ref={container} className="map-canvas" aria-hidden="true" />
      <p className="sr-only">
        Accessible map summary: {scene.objective}. Locations:{" "}
        {scene.visualDirectives.flatMap(({ locationIds }) => locationIds).join(", ") || "none"}.
        {scene.kind === "impact-path"
          ? " Route roles: United States origin, Taiwan waypoint, South Korea emphasized destination."
          : ""}
      </p>
      {fallbackPoints.length >= 3 && scene.kind === "impact-path"
        && <RouteFallback points={fallbackPoints} />}
      {status === "loading" && <div className="map-status">Loading map…</div>}
      {warning && import.meta.env.DEV && <p className="renderer-warning" role="status">{warning}</p>}
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

function RouteFallback({ points }: { points: ProjectedPoint[] }) {
  const route = points.map(({ x, y }) => `${x},${y}`).join(" ");
  return (
    <svg className="route-fallback" aria-label="Fallback Pacific route from the United States via Taiwan to South Korea">
      <polyline className="route-fallback-casing" points={route} />
      <polyline className="route-fallback-line" points={route} />
    </svg>
  );
}
