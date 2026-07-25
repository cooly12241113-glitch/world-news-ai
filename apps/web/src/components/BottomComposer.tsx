import { useState } from "react";

export function BottomComposer({
  expanded, onFocus, onCancel, onStart,
}: { expanded: boolean; onFocus: () => void; onCancel: () => void; onStart: () => void }) {
  const [question, setQuestion] = useState("");
  return (
    <div className={`bottom-dock composer ${expanded ? "expanded" : ""}`} data-position="bottom-center">
      <label className="sr-only" htmlFor="briefing-question">Ask a follow-up question</label>
      <input id="briefing-question" value={question}
        placeholder="Ask about a region, impact, or source…"
        onChange={(event) => setQuestion(event.target.value)}
        onFocus={onFocus} aria-expanded={expanded} />
      {expanded && <button type="button" className="quiet" onClick={onCancel}>Cancel</button>}
      <button type="button" className="primary" onClick={onStart}>
        Start demo briefing
      </button>
    </div>
  );
}
