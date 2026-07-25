// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../tests/test-setup";
import { BottomComposer } from "./BottomComposer";
import { PlaybackControlBar } from "./PlaybackControlBar";
import { AnalysisPanel } from "./AnalysisPanel";
import { SceneCaption } from "./SceneChrome";
import { MapConflictPrompt } from "./SceneChrome";
import { ClosingControls } from "./ClosingControls";
import { buildDemoScript } from "../fixtures/build-demo-script";
import { adaptBriefingScript } from "../renderer/presentation-adapter";
import { initialPlayerState } from "../player/player-state";

const firstScene = () => {
  const adapted = adaptBriefingScript(buildDemoScript());
  if (!adapted.success) throw new Error("adaptation failed");
  return adapted.value.scenes[1]!;
};

describe("Briefing UI controls", () => {
  it("keeps the composer bottom-centered, expands on focus, and starts explicitly", async () => {
    const user = userEvent.setup();
    const focus = vi.fn(); const start = vi.fn();
    const { rerender } = render(<BottomComposer expanded={false}
      onFocus={focus} onCancel={vi.fn()} onStart={start} />);
    expect(screen.getByPlaceholderText(/Ask about/).closest(".bottom-dock"))
      .toHaveProperty("dataset", expect.objectContaining({ position: "bottom-center" }));
    await user.click(screen.getByPlaceholderText(/Ask about/));
    expect(focus).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Start demo/ }));
    expect(start).toHaveBeenCalled();
    rerender(<BottomComposer expanded onFocus={focus} onCancel={vi.fn()} onStart={start} />);
    expect(screen.getByRole("button", { name: "Cancel" })).not.toBeNull();
  });
  it("exposes accessible playback state and disabled boundaries", async () => {
    const user = userEvent.setup(); const next = vi.fn(); const replay = vi.fn(); const ask = vi.fn();
    render(<PlaybackControlBar state={{ ...initialPlayerState, status: "paused", sceneCount: 7 }}
      mapScene onPrevious={vi.fn()} onReplayMotion={replay} onNext={next} onAsk={ask}
      onSpeed={vi.fn()} onAnimation={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Previous scene" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Next scene" }));
    expect(next).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /Play briefing|Pause briefing/ })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Replay scene motion" }));
    await user.click(screen.getByRole("button", { name: "Ask a question" }));
    expect(replay).toHaveBeenCalledOnce();
    expect(ask).toHaveBeenCalledOnce();
  });
  it("keeps briefing composer context and does not show a second start action", () => {
    render(<BottomComposer expanded briefing
      context={{ sceneId: "scene:3", scriptFingerprint: "fingerprint:demo" }}
      onFocus={vi.fn()} onCancel={vi.fn()} onStart={vi.fn()} />);
    const composer = screen.getByPlaceholderText(/Ask about/).closest(".composer") as HTMLElement;
    expect(composer.dataset.sceneId).toBe("scene:3");
    expect(composer.dataset.scriptFingerprint).toBe("fingerprint:demo");
    expect(screen.queryByRole("button", { name: /Start demo/ })).toBeNull();
    expect(screen.getByText(/backend not connected/)).not.toBeNull();
  });
  it("opens analysis tabs and keeps evidence roles textual", async () => {
    const user = userEvent.setup();
    render(<AnalysisPanel scene={firstScene()} open onToggle={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("evidence binding");
    await user.click(screen.getByRole("tab", { name: "Sources" }));
    expect(screen.getByText("Source")).not.toBeNull();
  });
  it("selects scene-derived tabs and preserves explicit same-scene selection", async () => {
    const user = userEvent.setup();
    const adapted = adaptBriefingScript(buildDemoScript());
    if (!adapted.success) throw new Error("adaptation failed");
    const evidence = adapted.value.scenes[4]!;
    const uncertainty = adapted.value.scenes[5]!;
    const view = render(<AnalysisPanel scene={evidence} open onToggle={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Evidence" }).getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getByRole("tab", { name: "Sources" }));
    view.rerender(<AnalysisPanel scene={evidence} open onToggle={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Sources" }).getAttribute("aria-selected")).toBe("true");
    view.rerender(<AnalysisPanel scene={uncertainty} open onToggle={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Uncertainty" }).getAttribute("aria-selected")).toBe("true");
  });
  it("keeps caption copy distinct and exposes ended actions", () => {
    const scene = firstScene();
    render(<><SceneCaption scene={scene} /><ClosingControls
      onReplay={vi.fn()} onFollowUp={vi.fn()} onEnd={vi.fn()} /></>);
    expect(screen.queryByText(scene.objective)).toBeNull();
    expect(screen.getByRole("button", { name: "Replay" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Ask a follow-up" })).not.toBeNull();
  });
  it("uses manual-map wording from the centralized UI copy", () => {
    render(<MapConflictPrompt visible onKeep={vi.fn()} onReturn={vi.fn()} />);
    expect(screen.getByText("Map view changed")).not.toBeNull();
    expect(screen.getByText(/Keep your current view/)).not.toBeNull();
    expect(screen.queryByText("Playback paused")).toBeNull();
  });
  it("supports keyboard activation without form submission", () => {
    const start = vi.fn();
    render(<BottomComposer expanded={false} onFocus={vi.fn()} onCancel={vi.fn()} onStart={start} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Start demo/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /Start demo/ }));
    expect(start).toHaveBeenCalledOnce();
  });
});
