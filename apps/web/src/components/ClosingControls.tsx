export function ClosingControls({
  onReplay, onFollowUp, onEnd,
}: { onReplay: () => void; onFollowUp: () => void; onEnd: () => void }) {
  return (
    <div className="bottom-dock closing-controls" data-chrome="controls"
      aria-label="Briefing ended controls">
      <strong>Briefing complete</strong>
      <button type="button" className="primary" onClick={onReplay}>Replay</button>
      <button type="button" onClick={onFollowUp}>Ask a follow-up</button>
      <button type="button" onClick={onEnd}>End briefing</button>
    </div>
  );
}
