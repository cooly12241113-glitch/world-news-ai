import { useState } from "react";
import type { RenderableScene } from "../renderer/presentation-adapter";

const tabs = ["Key", "Evidence", "Limits", "Uncertainty", "Sources"] as const;

export function AnalysisPanel({
  scene, open, onToggle,
}: { scene: RenderableScene; open: boolean; onToggle: () => void }) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Key");
  return (
    <aside className={`analysis-panel ${open ? "open" : ""}`} aria-label="Analysis panel">
      <button type="button" className="panel-toggle" onClick={onToggle}
        aria-expanded={open} aria-controls="analysis-content">
        {open ? "Close analysis" : "Open analysis"}
      </button>
      <div id="analysis-content">
        <p className="eyebrow">Current scene</p>
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
