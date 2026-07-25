import { describe, expect, it } from "vitest";
import type { CameraIntent } from "@world-news-ai/script-web";
import { planCameraMotion, type MotionPlannerInput } from "./motion-planner";
import { WORLD_CAMERA } from "./map-adapter";

const intent: CameraIntent = {
  action: "focus-country", targetLocationIds: ["south-korea"], targetEntityIds: [],
  framing: "national", spatialRelationship: "single-focus", motionPriority: "normal",
  transitionPreference: "smooth", preserveSafeViewport: true,
  allowRotation: false, allowZoom: true, allowPan: true,
  fallbackAction: "hold-current-view", warnings: [],
};
const input = (): MotionPlannerInput => ({
  intent, current: WORLD_CAMERA,
  target: { center: { longitude: 127.8, latitude: 36.3 }, zoom: 4.6, bearing: 0, pitch: 0 },
  viewportInsets: { top: 72, right: 400, bottom: 160, left: 20 },
  playbackSpeed: "normal", animationPolicy: "full", cameraMotionPolicy: "allow",
  reducedMotion: false, timing: { pace: "normal", hold: "standard", userAdvanceAllowed: true },
  transition: { style: "continuous", preserveUserView: true, requiresMotionPlanner: true },
});

describe("Motion Planner v0", () => {
  it("is deterministic, finite, clamped, and uses at most two segments", () => {
    const first = planCameraMotion(input());
    const second = planCameraMotion(input());
    expect(first).toEqual(second);
    expect(first.segments.length).toBeLessThanOrEqual(2);
    expect(first.totalEstimatedDurationMs).toBeGreaterThanOrEqual(650);
    expect(Number.isFinite(first.totalEstimatedDurationMs)).toBe(true);
  });
  it("adjusts duration for slow and fast playback", () => {
    const slow = input(); slow.playbackSpeed = "slow";
    const fast = input(); fast.playbackSpeed = "fast";
    expect(planCameraMotion(slow).totalEstimatedDurationMs)
      .toBeGreaterThan(planCameraMotion(fast).totalEstimatedDurationMs);
  });
  it.each([
    ["no camera", { intent: { ...intent, action: "no-camera-motion" as const } }],
    ["animation disabled", { animationPolicy: "disabled" as const }],
    ["camera disallowed", { cameraMotionPolicy: "disallow" as const }],
  ])("returns no segments when %s", (_label, update) => {
    expect(planCameraMotion({ ...input(), ...update }).segments).toHaveLength(0);
  });
  it("uses a short ease for reduced motion and never fly", () => {
    const value = input(); value.reducedMotion = true;
    const plan = planCameraMotion(value);
    expect(plan.totalEstimatedDurationMs).toBeLessThanOrEqual(900);
    expect(plan.segments.every(({ transition }) => transition !== "fly")).toBe(true);
  });
  it("preserves safe viewport insets", () => {
    expect(planCameraMotion(input()).segments[0]?.viewportInsets.right).toBe(400);
  });
});
