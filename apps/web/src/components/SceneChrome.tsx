import type { RenderableScene } from "../renderer/presentation-adapter";

export function SceneCaption({ scene }: { scene: RenderableScene }) {
  return (
    <div className="scene-caption" aria-live="polite" aria-atomic="true">
      <span className="epistemic-badge">{scene.kind === "uncertainty" ? "Uncertain" : "Evidence-bound"}</span>
      <p>{scene.objective}</p>
    </div>
  );
}

export function SceneProgress({ current, total }: { current: number; total: number }) {
  return <div className="scene-progress" aria-label={`Scene ${current + 1} of ${total}`}>
    {Array.from({ length: total }, (_, index) =>
      <span key={index} className={index <= current ? "active" : ""} />)}
  </div>;
}

export function MapConflictPrompt({
  visible, onKeep, onReturn,
}: { visible: boolean; onKeep: () => void; onReturn: () => void }) {
  if (!visible) return null;
  return <div className="conflict-prompt" role="dialog" aria-label="Map view changed">
    <strong>Playback paused</strong>
    <span>You moved the map. Keep your view or return to the scripted camera.</span>
    <button type="button" onClick={onKeep}>Keep my view</button>
    <button type="button" className="primary" onClick={onReturn}>Return to briefing</button>
  </div>;
}
