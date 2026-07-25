import { describe, expect, it } from "vitest";
import { presentationPreference } from "../presentation";
import {
  BriefingPresentationPreferenceSchema, BriefingScriptSchema,
  CameraIntentSchema, SceneCaptionDirectiveSchema,
} from "../validation";
import { compiled } from "./fixtures";

describe("Briefing presentation and runtime schemas", () => {
  it.each(["auto", "cinematic-map", "map-and-chart", "chart-led", "document-led", "static", "reduced-motion"] as const)(
    "accepts %s presentation", (mode) => {
      expect(BriefingPresentationPreferenceSchema.safeParse(presentationPreference(mode)).success).toBe(true);
    },
  );

  it("enforces fixed playback and bottom composer defaults", () => {
    const preference = presentationPreference();
    expect(preference).toMatchObject({
      autoplay: false, userInitiated: true,
      composerPolicy: {
        position: "bottom-center", collapseDuringPlayback: true,
        pausePlaybackOnFocus: true, preserveMapViewport: true,
      },
    });
  });

  it("rejects invalid static and reduced-motion combinations", () => {
    expect(BriefingPresentationPreferenceSchema.safeParse({
      ...presentationPreference("static"), cameraMotionPolicy: "allow",
    }).success).toBe(false);
    expect(BriefingPresentationPreferenceSchema.safeParse({
      ...presentationPreference("reduced-motion"), animationPolicy: "full",
    }).success).toBe(false);
  });

  it("strictly validates scripts and rejects final/renderer/reasoning fields", () => {
    const { script } = compiled();
    expect(BriefingScriptSchema.safeParse(script).success).toBe(true);
    expect(BriefingScriptSchema.safeParse({ ...script, finalAnswer: "invented" }).success).toBe(false);
    expect(BriefingScriptSchema.safeParse({ ...script, rendererCode: "map.flyTo()" }).success).toBe(false);
    expect(BriefingScriptSchema.safeParse({ ...script, chainOfThought: "private" }).success).toBe(false);
  });

  it("rejects invalid IDs, timestamps, enums, and excessive captions", () => {
    const { script } = compiled();
    expect(BriefingScriptSchema.safeParse({ ...script, id: "" }).success).toBe(false);
    expect(BriefingScriptSchema.safeParse({ ...script, createdAt: "today" }).success).toBe(false);
    expect(BriefingScriptSchema.safeParse({ ...script, status: "rendering" }).success).toBe(false);
    expect(SceneCaptionDirectiveSchema.safeParse({
      ...script.scenes[0]!.captionDirective, maximumCharacters: 501,
    }).success).toBe(false);
  });

  it("camera schema has no coordinates, zoom, speed, easing, or duration", () => {
    const camera = compiled().script.scenes[0]!.visualDirectives[0]?.cameraIntent ?? {
      action: "no-camera-motion", targetLocationIds: [], targetEntityIds: [],
      framing: "current", spatialRelationship: "none", motionPriority: "low",
      transitionPreference: "none", preserveSafeViewport: true,
      allowRotation: false, allowZoom: false, allowPan: false,
      fallbackAction: "no-camera-motion", warnings: [],
    };
    expect(CameraIntentSchema.safeParse({ ...camera, latitude: 1, zoom: 5, durationMs: 1000 }).success).toBe(false);
  });
});
