// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
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
  it("uses the fake map adapter without canvas or network", async () => {
    const adapter = new FakeMapRendererAdapter();
    render(<SceneDispatcher {...props} scene={briefing().scenes[1]!}
      mapAdapterFactory={() => adapter} />);
    await waitFor(() => expect(adapter.initialized).toBe(true));
    await waitFor(() => expect(adapter.overlays.length).toBeGreaterThan(0));
    expect(screen.getByLabelText("Interactive world map")).not.toBeNull();
  });
  it("makes no motion calls for static mode", async () => {
    const value = adaptBriefingScript(buildDemoScript("static"));
    if (!value.success) throw new Error("adaptation failed");
    expect(value.value.scenes.every((scene) =>
      scene.visualDirectives.every(({ cameraIntent }) =>
        cameraIntent.action === "no-camera-motion"))).toBe(true);
  });
});
