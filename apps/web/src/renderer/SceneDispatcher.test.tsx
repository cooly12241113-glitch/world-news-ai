// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import "../tests/test-setup";
import { adaptBriefingScript } from "./presentation-adapter";
import { buildDemoScript } from "../fixtures/build-demo-script";
import { SceneDispatcher } from "./SceneDispatcher";
import { initialPlayerState } from "../player/player-state";
import { FakeMapRendererAdapter } from "../map/fake-map-adapter";

const briefing = () => {
  const result = adaptBriefingScript(buildDemoScript());
  if (!result.success) throw new Error("adaptation failed");
  return result.value;
};
const props = {
  player: { ...initialPlayerState, status: "playing" as const, sceneCount: 7 },
  insets: { top: 72, right: 400, bottom: 160, left: 20 },
  reducedMotion: false,
  onMapInteraction: vi.fn(),
};

describe("Scene dispatcher integration", () => {
  it("dispatches chart, document, and text surfaces", () => {
    const value = briefing();
    const { rerender } = render(<SceneDispatcher {...props} scene={value.scenes[4]!} />);
    expect(screen.getByRole("table", { name: "Accessible chart data" })).not.toBeNull();
    rerender(<SceneDispatcher {...props} scene={value.scenes[5]!} />);
    expect(screen.getByText(/Implementation Brief/)).not.toBeNull();
    rerender(<SceneDispatcher {...props} scene={value.scenes[0]!} />);
    expect(screen.getByText(/accessible static presentation/)).not.toBeNull();
  });
  it("applies desktop panel width and bottom controls as non-map safe insets", () => {
    const scene = briefing().scenes[5]!;
    const { container, rerender } = render(<SceneDispatcher {...props} scene={scene} />);
    const safeArea = container.querySelector(".non-map-safe-area") as HTMLElement;
    expect(safeArea.dataset).toMatchObject({ rightInset: "400", bottomInset: "160" });
    expect(safeArea.style.getPropertyValue("--surface-right-inset")).toBe("400px");
    expect(safeArea.style.getPropertyValue("--surface-bottom-inset")).toBe("160px");
    rerender(<SceneDispatcher {...props} insets={{ ...props.insets, right: 20 }} scene={scene} />);
    expect(safeArea.style.getPropertyValue("--surface-right-inset")).toBe("20px");
  });
  it("uses explicit content, caption, and dock grid rows for non-map scenes", () => {
    const value = briefing();
    const { container, rerender } = render(<SceneDispatcher {...props}
      flowCaption={<div data-testid="flow-caption">Caption</div>}
      flowDock={<div data-testid="flow-dock">Dock</div>}
      insets={{ ...props.insets, bottom: 212 }} scene={value.scenes[4]!} />);
    const shell = container.querySelector(".non-map-scene-shell")!;
    expect(shell.children[0]!.classList.contains("non-map-scrollable-content")).toBe(true);
    expect(shell.children[1]!.getAttribute("data-testid")).toBe("flow-caption");
    expect(shell.children[2]!.getAttribute("data-testid")).toBe("flow-dock");
    const finalChartRow = screen.getByRole("rowheader", { name: "Source and vintage" }).closest("tr")!;
    expect(shell.children[0]!.contains(finalChartRow)).toBe(true);
    expect((container.querySelector(".non-map-safe-area") as HTMLElement)
      .style.getPropertyValue("--surface-bottom-inset")).toBe("212px");
    rerender(<SceneDispatcher {...props} insets={{ ...props.insets, right: 20, bottom: 248 }}
      flowCaption={<div data-testid="flow-caption">Caption</div>}
      flowDock={<div data-testid="flow-dock">Dock</div>}
      scene={value.scenes[5]!} />);
    const unknowns = screen.getByRole("heading", { name: "Unknowns" }).parentElement!;
    expect(container.querySelector(".non-map-scrollable-content")!.contains(unknowns)).toBe(true);
    expect((container.querySelector(".non-map-safe-area") as HTMLElement)
      .style.getPropertyValue("--surface-bottom-inset")).toBe("248px");
  });
  it("uses the fake map adapter without canvas or network", async () => {
    const adapter = new FakeMapRendererAdapter();
    render(<SceneDispatcher {...props} scene={briefing().scenes[1]!}
      mapAdapterFactory={() => adapter} />);
    await waitFor(() => expect(adapter.initialized).toBe(true));
    await waitFor(() => expect(adapter.overlays.length).toBeGreaterThan(0));
    expect(screen.getByLabelText("Interactive world map")).not.toBeNull();
  });
  it("keeps one adapter across handler rerenders and applies the latest map scene", async () => {
    const adapter = new FakeMapRendererAdapter();
    const factory = vi.fn(() => adapter);
    const value = briefing();
    const view = render(<SceneDispatcher {...props} scene={value.scenes[1]!}
      mapAdapterFactory={factory} />);
    await waitFor(() => expect(adapter.overlays.length).toBeGreaterThan(0));
    view.rerender(<SceneDispatcher {...props} onMapInteraction={vi.fn()}
      scene={value.scenes[2]!} mapAdapterFactory={factory} />);
    view.rerender(<SceneDispatcher {...props} onMapInteraction={vi.fn()}
      scene={value.scenes[3]!} mapAdapterFactory={factory} />);
    await waitFor(() => expect(adapter.overlays[0]?.points).toHaveLength(3));
    expect(factory).toHaveBeenCalledOnce();
    expect(adapter.destroyed).toBe(false);
    expect(adapter.overlays[0]?.destinationPointIndex).toBe(2);
  });
  it("runs scene motion on entry and replay without changing scene navigation", async () => {
    const adapter = new FakeMapRendererAdapter();
    const scene = briefing().scenes[3]!;
    const factory = () => adapter;
    const view = render(<SceneDispatcher {...props} scene={scene}
      mapAdapterFactory={factory} />);
    await waitFor(() => expect(adapter.motions).toHaveLength(1));
    view.rerender(<SceneDispatcher {...props}
      player={{ ...props.player, currentSceneIndex: 3, motionRequestId: 1 }}
      scene={scene} mapAdapterFactory={factory} />);
    await waitFor(() => expect(adapter.motions).toHaveLength(2));
    expect(props.player.currentSceneIndex).toBe(0);
  });
  it("uses jump motion when Motion is off and never moves a non-map scene", async () => {
    const adapter = new FakeMapRendererAdapter();
    const value = briefing();
    const factory = () => adapter;
    const view = render(<SceneDispatcher {...props}
      player={{ ...props.player, animationEnabled: false }}
      scene={value.scenes[2]!} mapAdapterFactory={factory} />);
    await waitFor(() => expect(adapter.motions[0]?.transition).toBe("jump"));
    view.rerender(<SceneDispatcher {...props} scene={value.scenes[4]!}
      mapAdapterFactory={factory} />);
    expect(adapter.motions).toHaveLength(1);
  });
  it("mounts a visible projected Pacific route only for Impact Path", async () => {
    const adapter = new FakeMapRendererAdapter();
    const value = briefing();
    const factory = () => adapter;
    const view = render(<SceneDispatcher {...props} scene={value.scenes[2]!}
      mapAdapterFactory={factory} />);
    expect(screen.queryByLabelText(/Fallback Pacific route/)).toBeNull();
    view.rerender(<SceneDispatcher {...props} scene={value.scenes[3]!}
      mapAdapterFactory={factory} />);
    expect(await screen.findByLabelText(/Fallback Pacific route/)).not.toBeNull();
    const route = screen.getByLabelText(/Fallback Pacific route/);
    expect(route.querySelector(".route-fallback-casing")).not.toBeNull();
    expect(route.querySelector(".route-fallback-line")).not.toBeNull();
    view.rerender(<SceneDispatcher {...props} scene={value.scenes[4]!}
      mapAdapterFactory={factory} />);
    await waitFor(() => expect(screen.queryByLabelText(/Fallback Pacific route/)).toBeNull());
  });
  it("keeps route presentation scoped across 4→3→4 and Replay motion", async () => {
    const adapter = new FakeMapRendererAdapter();
    const value = briefing();
    const factory = () => adapter;
    const view = render(<SceneDispatcher {...props} scene={value.scenes[3]!}
      mapAdapterFactory={factory} />);
    await screen.findByLabelText(/Fallback Pacific route/);
    view.rerender(<SceneDispatcher {...props} scene={value.scenes[2]!}
      mapAdapterFactory={factory} />);
    await waitFor(() => expect(screen.queryByLabelText(/Fallback Pacific route/)).toBeNull());
    view.rerender(<SceneDispatcher {...props} scene={value.scenes[3]!}
      player={{ ...props.player, currentSceneIndex: 3, motionRequestId: 1 }}
      mapAdapterFactory={factory} />);
    expect(await screen.findByLabelText(/Fallback Pacific route/)).not.toBeNull();
    view.rerender(<SceneDispatcher {...props} scene={value.scenes[3]!}
      player={{ ...props.player, currentSceneIndex: 3, motionRequestId: 2 }}
      mapAdapterFactory={factory} />);
    expect(await screen.findByLabelText(/Fallback Pacific route/)).not.toBeNull();
    expect(adapter.overlays[0]?.destinationPointIndex).toBe(2);
  });
  it("still mounts the Impact Path route presentation when the GeoJSON adapter fails", async () => {
    const adapter = new FakeMapRendererAdapter();
    adapter.overlayFailure = true;
    render(<SceneDispatcher {...props} scene={briefing().scenes[3]!}
      mapAdapterFactory={() => adapter} />);
    expect(await screen.findByLabelText(/Fallback Pacific route/)).not.toBeNull();
  });
  it("reprojects the geographic route on camera change, resize, and replay without manual interaction", async () => {
    const adapter = new FakeMapRendererAdapter();
    const interaction = vi.fn();
    const value = briefing();
    const factory = () => adapter;
    const view = render(<SceneDispatcher {...props} onMapInteraction={interaction}
      scene={value.scenes[3]!} mapAdapterFactory={factory} />);
    const route = await screen.findByLabelText(/Fallback Pacific route/);
    const line = route.querySelector(".route-fallback-line")!;
    const initial = line.getAttribute("points");
    adapter.projectionOffset = 50;
    adapter.emitCameraChange();
    await waitFor(() => expect(line.getAttribute("points")).not.toBe(initial));
    const moved = line.getAttribute("points");
    adapter.projectionOffset = 100;
    adapter.resize();
    await waitFor(() => expect(line.getAttribute("points")).not.toBe(moved));
    const resized = line.getAttribute("points");
    adapter.projectionOffset = 150;
    view.rerender(<SceneDispatcher {...props} onMapInteraction={interaction}
      player={{ ...props.player, currentSceneIndex: 3, motionRequestId: 1 }}
      scene={value.scenes[3]!} mapAdapterFactory={factory} />);
    await waitFor(() => expect(line.getAttribute("points")).not.toBe(resized));
    expect(interaction).not.toHaveBeenCalled();
    view.rerender(<SceneDispatcher {...props} onMapInteraction={interaction}
      scene={value.scenes[4]!} mapAdapterFactory={factory} />);
    expect(screen.queryByLabelText(/Fallback Pacific route/)).toBeNull();
    expect(adapter.cameraListenerCount).toBe(0);
  });
  it("retains overlays on the live adapter after a StrictMode double lifecycle", async () => {
    const adapters: FakeMapRendererAdapter[] = [];
    const factory = () => {
      const adapter = new FakeMapRendererAdapter();
      adapters.push(adapter);
      return adapter;
    };
    render(<StrictMode><SceneDispatcher {...props} scene={briefing().scenes[3]!}
      mapAdapterFactory={factory} /></StrictMode>);
    await waitFor(() => expect(adapters.at(-1)?.overlays[0]?.points).toHaveLength(3));
    expect(adapters[0]?.destroyed).toBe(true);
    expect(adapters.at(-1)?.destroyed).toBe(false);
    expect(adapters.at(-1)?.overlays[0]?.destinationPointIndex).toBe(2);
  });
  it("makes no motion calls for static mode", async () => {
    const value = adaptBriefingScript(buildDemoScript("static"));
    if (!value.success) throw new Error("adaptation failed");
    expect(value.value.scenes.every((scene) =>
      scene.visualDirectives.every(({ cameraIntent }) =>
        cameraIntent.action === "no-camera-motion"))).toBe(true);
  });
});
