// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import "../../tests/test-setup";
import { AnalysisPanel } from "../../components/AnalysisPanel";
import { createLocalBriefingRuntime } from "../runtime/local-briefing-runtime";
import { adaptBriefingScript } from "../../renderer/presentation-adapter";

async function personalizedFixture() {
  const result = await createLocalBriefingRuntime({
    nextRunId: () => "run:my-lens-ui",
    now: () => "2026-08-05T00:00:00.000Z",
  }).start("auto", true).result;
  if (result.outcome.kind !== "completed") throw new Error("Personalized fixture did not complete.");
  const presentation = adaptBriefingScript(result.outcome.script);
  if (!presentation.success) throw new Error("Personalized fixture did not adapt.");
  return { ...result.outcome, presentation: presentation.value };
}

describe("My Lens presentation", () => {
  it("appears only for a valid personalized Script projection", async () => {
    const personalized = await personalizedFixture();
    const boundScene = personalized.presentation.scenes.find(
      ({ personalImpactBindings }) => personalImpactBindings.length > 0,
    )!;
    const view = render(<AnalysisPanel scene={boundScene} briefing={personalized.presentation}
      open onToggle={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "My Lens" })).not.toBeNull();

    const ordinaryResult = await createLocalBriefingRuntime({
      nextRunId: () => "run:ordinary-ui",
      now: () => "2026-08-05T00:00:00.000Z",
    }).start().result;
    if (ordinaryResult.outcome.kind !== "completed") throw new Error("Ordinary fixture failed.");
    const ordinaryPresentation = adaptBriefingScript(ordinaryResult.outcome.script);
    if (!ordinaryPresentation.success) throw new Error("Ordinary fixture did not adapt.");
    view.rerender(<AnalysisPanel scene={ordinaryPresentation.value.scenes[0]!}
      briefing={ordinaryPresentation.value} open onToggle={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: "My Lens" })).toBeNull();
  });

  it("shows explicit exposures and bounded posture without exposing semantic identities", async () => {
    const fixture = await personalizedFixture();
    const scene = fixture.presentation.scenes.find(
      ({ personalImpactBindings }) => personalImpactBindings.some(
        ({ impactChannelIds }) => impactChannelIds.length > 0,
      ),
    )!;
    const beforeScript = fixture.script.fingerprint;
    const beforeSession = fixture.session.semanticFingerprint;
    const onFollowUp = vi.fn();
    const { container } = render(<AnalysisPanel scene={scene} briefing={fixture.presentation}
      open onToggle={vi.fn()} onMyLensFollowUp={onFollowUp} />);
    fireEvent.click(screen.getByRole("tab", { name: "My Lens" }));
    expect(screen.getByText("South Korea")).not.toBeNull();
    expect(screen.getByText("USD")).not.toBeNull();
    expect(screen.getByText("Semiconductor")).not.toBeNull();
    expect(screen.getByRole("heading", { name: /You provided/ })).not.toBeNull();
    expect(screen.getAllByText(/Conditional inference/).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/fingerprint|exposure:|impact-channel:/iu);
    fireEvent.click(screen.getByRole("button", { name: "Ask about this lens" }));
    expect(onFollowUp).toHaveBeenCalledOnce();
    expect(fixture.script.fingerprint).toBe(beforeScript);
    expect(fixture.session.semanticFingerprint).toBe(beforeSession);
  });

  it("keeps the lens honest on scenes without a personal binding", async () => {
    const fixture = await personalizedFixture();
    render(<AnalysisPanel scene={fixture.presentation.scenes[0]!}
      briefing={fixture.presentation} open onToggle={vi.fn()} />);
    fireEvent.click(screen.getByRole("tab", { name: "My Lens" }));
    expect(screen.getByText(/no personalized impact path/i)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Ask about this lens" })).toBeNull();
  });

  it("fails closed when a renderer projection contains a foreign personal reference", async () => {
    const fixture = await personalizedFixture();
    const forged = structuredClone(fixture.presentation);
    const boundScene = forged.scenes.find(({ personalImpactBindings }) => personalImpactBindings.length > 0)!;
    boundScene.personalImpactBindings[0]!.exposureIds = ["exposure:foreign"];
    render(<AnalysisPanel scene={boundScene} briefing={forged} open onToggle={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: "My Lens" })).toBeNull();
  });

  it("activates My Lens and moves between analysis tabs from the keyboard", async () => {
    const user = userEvent.setup();
    const fixture = await personalizedFixture();
    const scene = fixture.presentation.scenes.find(
      ({ personalImpactBindings }) => personalImpactBindings.length > 0,
    )!;
    render(<AnalysisPanel scene={scene} briefing={fixture.presentation}
      open onToggle={vi.fn()} />);
    const lens = screen.getByRole("tab", { name: "My Lens" });
    lens.focus();
    await user.keyboard("{Enter}");
    expect(lens.getAttribute("aria-selected")).toBe("true");
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Sources" }).getAttribute("aria-selected"))
      .toBe("true");
  });
});
