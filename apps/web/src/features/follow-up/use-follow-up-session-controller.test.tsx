// @vitest-environment jsdom
import { useEffect } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { withBriefingSessionFingerprint } from "@world-news-ai/session";
import type { BriefingSession } from "@world-news-ai/session";
import type { ValidatedBriefingScript } from "@world-news-ai/script-web";
import "../../tests/test-setup";
import { BottomComposer } from "../../components/BottomComposer";
import { buildDemoScript } from "../../fixtures/build-demo-script";
import { createDemoBriefingSession } from "../session";
import { FollowUpClarificationOptions } from "./FollowUpClarificationOptions";
import { FollowUpOutcomePanel } from "./FollowUpOutcomePanel";
import type { FollowUpRuntimeContext } from "./follow-up-runtime-context";
import {
  applyClarificationOption,
  useFollowUpSessionController,
} from "./use-follow-up-session-controller";
import { createLocalBriefingRuntime } from "../runtime";

function deterministicRuntime(): FollowUpRuntimeContext {
  let id = 0;
  return {
    nextId: (prefix) => `${prefix}:${++id}`,
    now: () => "2026-07-28T00:00:00.000Z",
  };
}

const runtimeFixture = deterministicRuntime();
const scriptFixture = buildDemoScript();

function Harness({
  runtime = runtimeFixture,
  initial = scriptFixture,
}: {
  runtime?: FollowUpRuntimeContext;
  initial?: ValidatedBriefingScript | { script: ValidatedBriefingScript; session: BriefingSession };
}) {
  const controller = useFollowUpSessionController(initial, runtime);
  useEffect(() => {
    if (controller.focusRequest?.target === "composer") {
      document.getElementById("briefing-question")?.focus();
    } else if (controller.focusRequest?.target === "analysis") {
      document.getElementById("analysis-scene-heading")?.focus();
    }
  }, [controller.focusRequest]);
  return <div>
    <button onClick={controller.openComposer}>Open</button>
    <button onClick={controller.startBriefing}>Start session</button>
    <button onClick={() => controller.navigateToScene(
      controller.script.scenes[3]!.id, 3,
    )}>Jump to impact</button>
    <button onClick={() => controller.recordManualMapInteraction({
      center: { longitude: 127.8, latitude: 36.3 },
      zoom: 4, bearing: 0, pitch: 0,
    })}>Move map</button>
    <button onClick={controller.keepManualMapView}>Keep map</button>
    <button onClick={controller.returnToBriefingCamera}>Return map</button>
    {controller.session.composerState === "expanded" && <BottomComposer
      expanded briefing value={controller.draft}
      onChange={controller.updateDraft} onSubmit={controller.submitFollowUp}
      onFocus={controller.openComposer} onCancel={controller.closeComposer}
      onStart={controller.startBriefing} />}
    <FollowUpOutcomePanel viewModel={controller.viewModel}
      onClarification={controller.selectClarificationOption}
      onRetry={controller.retryFollowUp} onDismiss={controller.dismissOutcome} />
    <h2 id="analysis-scene-heading" tabIndex={-1}>Scene analysis</h2>
    <output data-testid="outcome">{controller.outcome?.outcome ?? "none"}</output>
    <span data-testid="scene">{controller.session.sceneCursor.sceneId}</span>
    <span data-testid="script">{controller.script.fingerprint}</span>
    <span data-testid="composer">{controller.session.composerState}</span>
    <span data-testid="operation">{controller.latestOperationIdentity ?? "none"}</span>
    <span data-testid="session-status">{controller.session.status}</span>
    <span data-testid="manual-map">{controller.session.manualMapViewState.status}</span>
    <span data-testid="personal-exposures">{
      controller.script.personalizedImpactPlanningContext?.exposures
        .map(({ canonicalSubject }) => canonicalSubject).join(",") ?? "none"
    }</span>
  </div>;
}

async function submit(text: string) {
  fireEvent.click(screen.getByRole("button", { name: "Open" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Ask a follow-up question" }),
    { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  await waitFor(() => expect(screen.getByTestId("outcome").textContent).not.toBe("none"));
}

describe("follow-up session controller", () => {
  it("keeps runtime-generated Script compatible across revision, clarification, keep, and rebuild", async () => {
    const bootstrap = await createLocalBriefingRuntime({
      nextRunId: () => "run:follow-up-compatibility",
      now: () => "2026-07-31T00:00:00.000Z",
    }).start().result;
    if (bootstrap.outcome.kind !== "completed") throw new Error("Expected completed runtime fixture.");
    render(<Harness runtime={deterministicRuntime()} initial={{
      script: bootstrap.outcome.script,
      session: bootstrap.outcome.session,
    }} />);
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    fireEvent.click(screen.getByRole("button", { name: "Jump to impact" }));
    await submit("현재 장면의 반대 근거를 보여줘");
    expect(screen.getByTestId("outcome").textContent).toBe("replacement-applied");
    expect(screen.getByText("Changed scenes").nextSibling?.textContent).toContain("1");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await submit("한국 경제 영향을 추가해줘");
    expect(screen.getByTestId("outcome").textContent).toBe("clarification-required");
    const scriptAfterRevision = screen.getByTestId("script").textContent;
    const sceneAfterRevision = screen.getByTestId("scene").textContent;
    fireEvent.click(screen.getByRole("button", { name: "keep current briefing" }));
    expect(screen.getByTestId("script").textContent).toBe(scriptAfterRevision);
    expect(screen.getByTestId("scene").textContent).toBe(sceneAfterRevision);
    await submit("처음부터 초보자 수준으로 다시 설명해줘");
    expect(screen.getByTestId("outcome").textContent).toBe("replacement-applied");
    expect(screen.getByText("Changed scenes").nextSibling?.textContent).toContain("7");
    expect(screen.getByTestId("scene").textContent).toBe("demo-rebuild:0");
  });
  it("answers from current context without changing Script or scene", async () => {
    render(<Harness />);
    const script = screen.getByTestId("script").textContent;
    const scene = screen.getByTestId("scene").textContent;
    await submit("source for this claim");
    expect(screen.getByTestId("outcome").textContent).toBe("current-context-answer");
    expect(screen.getByTestId("script").textContent).toBe(script);
    expect(screen.getByTestId("scene").textContent).toBe(scene);
    expect(screen.getByText("Uncertainty")).toBeTruthy();
    expect(screen.getByText("This is a deterministic fixture response.")).toBeTruthy();
  });

  it("synchronizes manual map interaction, keep, and return with Session", () => {
    render(<Harness runtime={deterministicRuntime()} />);
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    fireEvent.click(screen.getByRole("button", { name: "Move map" }));
    expect(screen.getByTestId("session-status").textContent).toBe("manual-map-view");
    expect(screen.getByTestId("manual-map").textContent).toBe("active");
    fireEvent.click(screen.getByRole("button", { name: "Keep map" }));
    expect(screen.getByTestId("manual-map").textContent).toBe("active");
    fireEvent.click(screen.getByRole("button", { name: "Return map" }));
    expect(screen.getByTestId("session-status").textContent).toBe("presenting-scene");
    expect(screen.getByTestId("manual-map").textContent).toBe("inactive");
  });

  it("applies a rebuild atomically and restarts at opening", async () => {
    render(<Harness />);
    const script = screen.getByTestId("script").textContent;
    await submit("start over");
    expect(screen.getByTestId("outcome").textContent).toBe("replacement-applied");
    expect(screen.getByTestId("script").textContent).not.toBe(script);
    expect(screen.getByTestId("scene").textContent).toBe("demo-rebuild:0");
  });

  it("returns clarification instead of pretending a terminal replacement is append", async () => {
    render(<Harness />);
    const script = screen.getByTestId("script").textContent;
    await submit("add a scene");
    expect(screen.getByTestId("outcome").textContent).toBe("clarification-required");
    expect(screen.getByTestId("script").textContent).toBe(script);
  });

  it.each([
    ["replace remaining scenes", "여기서부터 남은 장면을 다시 구성해줘"],
    ["rebuild entire briefing", "처음부터 전체 브리핑을 다시 구성해줘"],
  ] as const)("opens Composer with an explicit draft for %s without submitting", async (
    option,
    expectedDraft,
  ) => {
    render(<Harness runtime={deterministicRuntime()} />);
    await submit("add a scene");
    const operation = screen.getByTestId("operation").textContent;
    fireEvent.click(screen.getByRole("button", { name: option }));
    expect(screen.getByTestId("outcome").textContent).toBe("none");
    expect(screen.getByTestId("composer").textContent).toBe("expanded");
    expect(screen.getByRole("textbox", { name: "Ask a follow-up question" }))
      .toHaveProperty("value", expectedDraft);
    expect(screen.getByTestId("operation").textContent).toBe(operation);
    expect(document.activeElement).toBe(
      screen.getByRole("textbox", { name: "Ask a follow-up question" }),
    );
  });

  it("dismisses keep-current without changing Script or scene", async () => {
    render(<Harness runtime={deterministicRuntime()} />);
    const script = screen.getByTestId("script").textContent;
    const scene = screen.getByTestId("scene").textContent;
    await submit("add a scene");
    fireEvent.click(screen.getByRole("button", { name: "keep current briefing" }));
    expect(screen.getByTestId("outcome").textContent).toBe("none");
    expect(screen.getByTestId("script").textContent).toBe(script);
    expect(screen.getByTestId("scene").textContent).toBe(scene);
    expect(screen.getByTestId("composer").textContent).toBe("compact");
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Scene analysis" }));
  });

  it("preserves manual viewport state when keep-current closes clarification", () => {
    const base = createDemoBriefingSession(scriptFixture, "2026-07-28T00:00:00.000Z");
    const { semanticFingerprint: _fingerprint, ...withoutFingerprint } = base;
    const viewport = {
      center: { longitude: 127.8, latitude: 36.3 },
      zoom: 4, bearing: 0, pitch: 0,
    };
    const session = withBriefingSessionFingerprint({
      ...withoutFingerprint,
      status: "composer-open",
      sceneCursor: {
        sceneId: scriptFixture.scenes[3]!.id,
        sceneIndex: 3,
        totalScenes: scriptFixture.scenes.length,
        visitedSceneIds: scriptFixture.scenes.slice(0, 4).map(({ id }) => id),
      },
      composerState: "expanded",
      resumeStatus: "manual-map-view",
      viewportSnapshot: viewport,
      manualMapViewState: { status: "active", viewportSnapshot: viewport },
    });
    const result = applyClarificationOption(
      session, "keep-current-briefing", deterministicRuntime(),
    );
    expect(result.nextSession.scriptFingerprint).toBe(session.scriptFingerprint);
    expect(result.nextSession.sceneCursor).toEqual(session.sceneCursor);
    expect(result.nextSession.viewportSnapshot).toEqual(viewport);
    expect(result.nextSession.manualMapViewState).toEqual({
      status: "active", viewportSnapshot: viewport,
    });
    expect(result.nextSession.activeOperation).toBeUndefined();
    expect(result.nextSession.status).toBe("manual-map-view");
  });

  it("passes the exact option ID through keyboard activation", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<FollowUpClarificationOptions
      options={["replace-remaining-scenes", "keep-current-briefing"]}
      onSelect={onSelect} />);
    const replace = screen.getByRole("button", { name: "replace remaining scenes" });
    replace.focus();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenLastCalledWith("replace-remaining-scenes");
    const keep = screen.getByRole("button", { name: "keep current briefing" });
    keep.focus();
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenLastCalledWith("keep-current-briefing");
  });

  it("rebuilds changed personal context and removes personalization without stale reuse", async () => {
    const bootstrap = await createLocalBriefingRuntime({
      nextRunId: () => "run:personalized-follow-up",
      now: () => "2026-08-05T00:00:00.000Z",
    }).start("auto", true).result;
    if (bootstrap.outcome.kind !== "completed") throw new Error("Expected personalized fixture.");
    render(<Harness runtime={deterministicRuntime()} initial={{
      script: bootstrap.outcome.script,
      session: bootstrap.outcome.session,
    }} />);
    const originalScript = screen.getByTestId("script").textContent;

    await submit("달러 보유가 없다고 가정해줘");
    expect(screen.getByTestId("outcome").textContent).toBe("replacement-applied");
    expect(screen.getByTestId("script").textContent).not.toBe(originalScript);
    expect(screen.getByTestId("personal-exposures").textContent).toBe("KR,semiconductor");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await submit("왜 나한테 영향이 있다는 거야?");
    expect(screen.getByTestId("outcome").textContent).toBe("current-context-answer");
    expect(screen.getByText(/You provided KR/)).not.toBeNull();
    expect(screen.getByText(/conditional inference/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await submit("반대 시나리오도 보여줘");
    expect(screen.getByTestId("outcome").textContent).toBe("current-context-answer");
    expect(screen.getByText(/Validated baseline scenario/)).not.toBeNull();
    expect(screen.getByText(/not a probability forecast/)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    await submit("개인화 정보는 빼고 다시 설명해줘");
    expect(screen.getByTestId("outcome").textContent).toBe("replacement-applied");
    expect(screen.getByTestId("personal-exposures").textContent).toBe("none");
  });
});
