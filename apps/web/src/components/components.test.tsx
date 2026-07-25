// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../tests/test-setup";
import { BottomComposer } from "./BottomComposer";
import { PlaybackControlBar } from "./PlaybackControlBar";
import { AnalysisPanel } from "./AnalysisPanel";
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
    const user = userEvent.setup(); const next = vi.fn();
    render(<PlaybackControlBar state={{ ...initialPlayerState, status: "paused", sceneCount: 7 }}
      onPrevious={vi.fn()} onNext={next} onToggle={vi.fn()}
      onSpeed={vi.fn()} onAnimation={vi.fn()} />);
    expect((screen.getByRole("button", { name: "Previous scene" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "Next scene" }));
    expect(next).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Play briefing" })).not.toBeNull();
  });
  it("opens analysis tabs and keeps evidence roles textual", async () => {
    const user = userEvent.setup();
    render(<AnalysisPanel scene={firstScene()} open onToggle={vi.fn()} />);
    await user.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("evidence binding");
    await user.click(screen.getByRole("tab", { name: "Sources" }));
    expect(screen.getByText("Source")).not.toBeNull();
  });
  it("supports keyboard activation without form submission", () => {
    const start = vi.fn();
    render(<BottomComposer expanded={false} onFocus={vi.fn()} onCancel={vi.fn()} onStart={start} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Start demo/ }), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /Start demo/ }));
    expect(start).toHaveBeenCalledOnce();
  });
});
