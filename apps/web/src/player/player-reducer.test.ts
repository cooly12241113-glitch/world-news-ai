import { describe, expect, it } from "vitest";
import { initialPlayerState } from "./player-state";
import { playerReducer, type PlayerAction } from "./player-reducer";

const reduce = (...actions: PlayerAction[]) =>
  actions.reduce(playerReducer, initialPlayerState);

describe("Briefing player reducer", () => {
  it("loads, starts, pauses, and resumes", () => {
    const state = reduce({ type: "load", sceneCount: 4 }, { type: "start" },
      { type: "pause" }, { type: "resume" });
    expect(state).toMatchObject({ status: "playing", sceneCount: 4, currentSceneIndex: 0 });
  });
  it("navigates next, previous, jump, and end within bounds", () => {
    const state = reduce({ type: "load", sceneCount: 4 }, { type: "next" },
      { type: "jump", index: 3 }, { type: "previous" });
    expect(state).toMatchObject({ currentSceneIndex: 2, status: "paused" });
    expect(playerReducer(state, { type: "jump", index: 99 })).toBe(state);
  });
  it("pauses for composer focus and preserves the current scene", () => {
    const state = reduce({ type: "load", sceneCount: 3 }, { type: "start" },
      { type: "next" }, { type: "composer-focus" });
    expect(state).toMatchObject({
      status: "paused", pauseReason: "composer", composerExpanded: true, currentSceneIndex: 1,
    });
  });
  it("records manual map conflict and returns only on user action", () => {
    const state = reduce({ type: "load", sceneCount: 3 }, { type: "start" },
      { type: "map-interaction" });
    expect(state).toMatchObject({ status: "paused", mapConflict: true, pauseReason: "map-interaction" });
    expect(playerReducer(state, { type: "return-to-script-camera" }))
      .toMatchObject({ mapConflict: false, motionRequestId: 1 });
  });
  it("ignores stale motion completion", () => {
    const state = reduce({ type: "motion-start", requestId: 4 });
    expect(playerReducer(state, { type: "motion-complete", requestId: 3 })
      .completedMotionRequestId).toBe(0);
    expect(playerReducer(state, { type: "motion-complete", requestId: 4 })
      .completedMotionRequestId).toBe(4);
  });
  it("changes speed and disables animation", () => {
    expect(reduce({ type: "set-speed", speed: "fast" }, { type: "set-animation", enabled: false }))
      .toMatchObject({ playbackSpeed: "fast", animationEnabled: false });
  });
  it("returns an error for an empty load", () => {
    expect(reduce({ type: "load", sceneCount: 0 })).toMatchObject({ status: "error" });
  });
});
