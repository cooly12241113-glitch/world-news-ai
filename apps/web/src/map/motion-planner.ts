import type { BriefingScene, CameraIntent } from "@world-news-ai/script-web";
import type { PlaybackSpeed } from "../player/player-state";
import type {
  CameraMotionInstruction,
  MapCameraState,
  MapViewportInsets,
  ResolvedCameraTarget,
} from "./map-adapter";

export interface MotionPlannerInput {
  intent: CameraIntent;
  current: MapCameraState;
  target: ResolvedCameraTarget;
  viewportInsets: MapViewportInsets;
  playbackSpeed: PlaybackSpeed;
  animationPolicy: "full" | "minimal" | "disabled";
  cameraMotionPolicy: "allow" | "minimize" | "disallow";
  reducedMotion: boolean;
  timing: BriefingScene["timingIntent"];
  transition: BriefingScene["transitionIntent"];
}
export interface CameraMotionPlan {
  segments: CameraMotionInstruction[];
  arrivalBehavior: "hold" | "continue";
  totalEstimatedDurationMs: number;
  warnings: string[];
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const distance = (a: MapCameraState["center"], b: MapCameraState["center"]) => {
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLon = (b.longitude - a.longitude) * Math.PI / 180;
  const lat1 = a.latitude * Math.PI / 180;
  const lat2 = b.latitude * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

export function planCameraMotion(input: MotionPlannerInput): CameraMotionPlan {
  const disabled = input.intent.action === "no-camera-motion"
    || input.intent.action === "hold-current-view"
    || input.cameraMotionPolicy === "disallow";
  if (disabled) return { segments: [], arrivalBehavior: "hold", totalEstimatedDurationMs: 0, warnings: [] };
  if (input.animationPolicy === "disabled") {
    return {
      segments: [{
        destination: input.target, transition: "jump", durationMs: 0,
        viewportInsets: input.viewportInsets, essential: false,
      }],
      arrivalBehavior: "hold", totalEstimatedDurationMs: 0, warnings: [],
    };
  }
  const km = distance(input.current.center, input.target.center);
  const zoomDelta = Math.abs(input.current.zoom - input.target.zoom);
  const speed = { slow: 1.25, normal: 1, fast: 0.78 }[input.playbackSpeed];
  const reduced = input.reducedMotion || input.cameraMotionPolicy === "minimize"
    || input.animationPolicy === "minimal";
  const duration = reduced ? clamp((450 + zoomDelta * 100) * speed, 250, 900)
    : clamp((700 + Math.sqrt(km) * 32 + zoomDelta * 180) * speed, 650, 4200);
  const segment: CameraMotionInstruction = {
    destination: input.target,
    transition: reduced ? "ease" : km > 4500 ? "fly" : "ease",
    durationMs: Math.round(duration),
    viewportInsets: input.viewportInsets,
    essential: false,
  };
  return {
    segments: [segment],
    arrivalBehavior: input.timing.hold === "brief" ? "continue" : "hold",
    totalEstimatedDurationMs: segment.durationMs,
    warnings: km > 9000 ? ["Long-distance transition is limited to one overview-aware segment."] : [],
  };
}
