import { useEffect, useState, type KeyboardEvent } from "react";
import type { RenderableBriefing, RenderableScene } from "../renderer/presentation-adapter";
import { ui } from "../ui-copy";
import type { ClarificationOptionId, FollowUpViewModel } from "../features/follow-up";
import { FollowUpOutcomePanel } from "../features/follow-up";
import { createMyLensViewModel, MyLensPanel } from "../features/personalized-impact";

const tabs = [ui.key, ui.evidence, ui.limits, ui.uncertainty, ui.sources] as const;
const MY_LENS = "My Lens" as const;
type Tab = (typeof tabs)[number] | typeof MY_LENS;
export const defaultAnalysisTab = (kind: RenderableScene["kind"]): Tab => ({
  "supporting-evidence": ui.evidence, "contradicting-evidence": ui.limits,
  uncertainty: ui.uncertainty, "source-review": ui.sources,
  "impact-path": ui.evidence, comparison: ui.evidence, timeline: ui.evidence,
  opening: ui.key, "global-overview": ui.key, "regional-focus": ui.key,
  closing: ui.key,
} as Partial<Record<RenderableScene["kind"], Tab>>)[kind] ?? ui.key;

export function AnalysisPanel({
  scene, briefing, open, onToggle, followUp, onClarification, onRetry, onDismiss,
  onMyLensFollowUp,
}: {
  scene: RenderableScene; open: boolean; onToggle: () => void;
  briefing?: RenderableBriefing;
  followUp?: FollowUpViewModel;
  onClarification?: (option: ClarificationOptionId) => void;
  onRetry?: () => void;
  onDismiss?: () => void;
  onMyLensFollowUp?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(() => defaultAnalysisTab(scene.kind));
  const myLens = briefing ? createMyLensViewModel(briefing, scene) : undefined;
  useEffect(() => setTab(defaultAnalysisTab(scene.kind)), [scene.id, scene.kind]);
  useEffect(() => {
    if (tab === MY_LENS && !myLens) setTab(defaultAnalysisTab(scene.kind));
  }, [myLens, scene.kind, tab]);
  const availableTabs: readonly Tab[] = myLens ? [...tabs, MY_LENS] : tabs;
  const selectTabFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>, item: Tab) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setTab(item);
      return;
    }
    const current = availableTabs.indexOf(item);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? availableTabs.length - 1
        : event.key === "ArrowRight" ? (current + 1) % availableTabs.length
          : event.key === "ArrowLeft" ? (current - 1 + availableTabs.length) % availableTabs.length
            : undefined;
    if (next === undefined) return;
    event.preventDefault();
    setTab(availableTabs[next]!);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  };
  return (
    <aside className={`analysis-panel ${open ? "open" : ""}`} aria-label="Analysis panel">
      <button type="button" className="panel-toggle" onClick={onToggle}
        aria-expanded={open} aria-controls="analysis-content">
        {open ? "Close analysis" : "Open analysis"}
      </button>
      <div id="analysis-content">
        <p className="eyebrow">{ui.currentScene}</p>
        <h2 id="analysis-scene-heading" tabIndex={-1}>{scene.kind.replaceAll("-", " ")}</h2>
        <div className="tabs" role="tablist" aria-label="Analysis views">
          {availableTabs.map((item) => <button type="button" role="tab" key={item}
            aria-selected={tab === item} onClick={() => setTab(item)}
            onKeyDown={(event) => selectTabFromKeyboard(event, item)}>{item}</button>)}
        </div>
        <div className="panel-copy" role="tabpanel">
          {followUp && <FollowUpOutcomePanel viewModel={followUp}
            onClarification={onClarification ?? (() => undefined)}
            onRetry={onRetry ?? (() => undefined)}
            onDismiss={onDismiss ?? (() => undefined)} />}
          {tab === "Key" && <p>{scene.objective}</p>}
          {tab === "Evidence" && <p>{scene.contentBindings.length} evidence binding(s) retained.</p>}
          {tab === "Limits" && <p>No verdict is generated. Claims remain attributed.</p>}
          {tab === "Uncertainty" && <p>{scene.uncertainties.length
            ? "Uncertainty disclosure is required." : "No scene-specific uncertainty cue."}</p>}
          {tab === "Sources" && <CitationList scene={scene} />}
          {tab === MY_LENS && myLens && <MyLensPanel viewModel={myLens}
            onAskFollowUp={onMyLensFollowUp} />}
        </div>
      </div>
    </aside>
  );
}

export function CitationList({ scene }: { scene: RenderableScene }) {
  return <ul className="citation-list">{scene.citations.length
    ? scene.citations.map((cue) => <li key={cue.id}>
      <span>Source</span> {cue.sourceDocumentIds.join(", ")}
    </li>)
    : <li>No source cue for this boundary scene.</li>}</ul>;
}
