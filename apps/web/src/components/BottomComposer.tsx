import { useEffect, useRef } from "react";

export function BottomComposer({
  expanded, briefing = false, context, value = "", running = false,
  maxLength = 800, onChange, onSubmit, onFocus, onCancel, onStart,
}: {
  expanded: boolean; briefing?: boolean;
  context?: { sceneId: string; scriptFingerprint: string };
  value?: string; running?: boolean; maxLength?: number;
  onChange?: (value: string) => void; onSubmit?: () => void;
  onFocus: () => void; onCancel: () => void; onStart: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (expanded) input.current?.focus(); }, [expanded]);
  return (
    <div className={`bottom-dock composer ${expanded ? "expanded" : ""}`}
      data-position="bottom-center" data-chrome="controls"
      data-scene-id={context?.sceneId} data-script-fingerprint={context?.scriptFingerprint}>
      <label className="sr-only" htmlFor="briefing-question">Ask a follow-up question</label>
      <textarea id="briefing-question" ref={input} value={value} rows={expanded ? 2 : 1}
        maxLength={maxLength}
        placeholder="Ask about a region, impact, or source…"
        onChange={(event) => onChange?.(event.target.value)}
        onFocus={onFocus} aria-expanded={expanded}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.preventDefault(); onCancel(); }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            if (!running && value.trim()) onSubmit?.();
          }
        }} />
      {expanded && <button type="button" className="quiet" onClick={onCancel}>Cancel</button>}
      {expanded && briefing && <button type="button" className="primary"
        disabled={running || !value.trim()} onClick={onSubmit}>
        {running ? "Working…" : "Submit"}
      </button>}
      {!briefing && <button type="button" className="primary" onClick={onStart}>
        Start demo briefing
      </button>}
      {briefing && <small className="composer-note">
        Demo follow-up · fixture only · backend not connected · {value.length}/{maxLength}
      </small>}
    </div>
  );
}
