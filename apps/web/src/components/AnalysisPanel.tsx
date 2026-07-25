import { useEffect, useState } from "react";
import type { RenderableScene } from "../renderer/presentation-adapter";
import { ui } from "../ui-copy";

const tabs = [ui.key, ui.evidence, ui.limits, ui.uncertainty, ui.sources] as const;
type Tab = (typeof tabs)[number];
export const defaultAnalysisTab = (kind: RenderableScene["kind"]): Tab => ({
  "supporting-evidence": ui.evidence, "contradicting-evidence": ui.limits,
  uncertainty: ui.uncertainty, "source-review": ui.sources,
  "impact-path": ui.evidence, comparison: ui.evidence, timeline: ui.evidence,
  opening: ui.key, "global-overview": ui.key, "regional-focus": ui.key,
  closing: ui.key,
} as Partial<Record<RenderableScene["kind"], Tab>>)[kind] ?? ui.key;

export function AnalysisPanel({
  scene, open, onToggle,
}: { scene: RenderableScene; open: boolean; onToggle: () => void }) {
  const [tab, setTab] = useState<Tab>(() => defaultAnalysisTab(scene.kind));
  useEffect(() => setTab(defaultAnalysisTab(scene.kind)), [scene.id, scene.kind]);
  return (
    <aside className={`analysis-panel ${open ? "open" : ""}`} aria-label="Analysis panel">
      <button type="button" className="panel-toggle" onClick={onToggle}
        aria-expanded={open} aria-controls="analysis-content">
        {open ? "Close analysis" : "Open analysis"}
      </button>
      <div id="analysis-content">
        <p className="eyebrow">{ui.currentScene}</p>
        <h2>{scene.kind.replaceAll("-", " ")}</h2>
        <div className="tabs" role="tablist" aria-label="Analysis views">
          {tabs.map((item) => <button type="button" role="tab" key={item}
            aria-selected={tab === item} onClick={() => setTab(item)}>{item}</button>)}
        </div>
        <div className="panel-copy" role="tabpanel">
          {tab === "Key" && <p>{scene.objective}</p>}
          {tab === "Evidence" && <p>{scene.contentBindings.length} evidence binding(s) retained.</p>}
          {tab === "Limits" && <p>No verdict is generated. Claims remain attributed.</p>}
          {tab === "Uncertainty" && <p>{scene.uncertainties.length
            ? "Uncertainty disclosure is required." : "No scene-specific uncertainty cue."}</p>}
          {tab === "Sources" && <CitationList scene={scene} />}
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
