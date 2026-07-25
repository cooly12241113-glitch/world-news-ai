import { useState } from "react";

export function BottomComposer({
  expanded, briefing = false, context, onFocus, onCancel, onStart,
}: {
  expanded: boolean; briefing?: boolean;
  context?: { sceneId: string; scriptFingerprint: string };
  onFocus: () => void; onCancel: () => void; onStart: () => void;
}) {
  const [question, setQuestion] = useState("");
  return (
    <div className={`bottom-dock composer ${expanded ? "expanded" : ""}`}
      data-position="bottom-center" data-chrome="controls"
      data-scene-id={context?.sceneId} data-script-fingerprint={context?.scriptFingerprint}>
      <label className="sr-only" htmlFor="briefing-question">Ask a follow-up question</label>
      <input id="briefing-question" value={question}
        placeholder="Ask about a region, impact, or source…"
        onChange={(event) => setQuestion(event.target.value)}
        onFocus={onFocus} aria-expanded={expanded} />
      {expanded && <button type="button" className="quiet" onClick={onCancel}>Cancel</button>}
      {!briefing && <button type="button" className="primary" onClick={onStart}>
        Start demo briefing
      </button>}
      {briefing && <small className="composer-note">Demo only · backend not connected</small>}
    </div>
  );
}
