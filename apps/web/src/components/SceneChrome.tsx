import type { RenderableScene } from "../renderer/presentation-adapter";
import { ui } from "../ui-copy";

export function SceneCaption({ scene, flow = false }: { scene: RenderableScene; flow?: boolean }) {
  const caption = {
    opening: "Start with the scope: this is a fixture-bound analysis, not a verdict.",
    "global-overview": "Notice how the policy question connects regions before narrowing focus.",
    "regional-focus": "Compare the United States and East Asia across the shortest Pacific frame.",
    "impact-path": "Follow the westbound supply path and its emphasized South Korea destination.",
    "supporting-evidence": "Read the indicator together with its source, vintage, and limits.",
    uncertainty: "Separate what is assumed, unknown, and observable before drawing conclusions.",
    closing: "Choose whether to replay, inspect context, or continue with a focused question.",
  } as Partial<Record<RenderableScene["kind"], string>>;
  return (
    <div className={`scene-caption ${flow ? "in-flow" : ""}`} data-chrome="caption"
      aria-live="polite" aria-atomic="true">
      <span className="epistemic-badge">{scene.kind === "uncertainty" ? "Uncertain" : "Evidence-bound"}</span>
      <p>{caption[scene.kind] ?? `Focus on the evidence boundary for ${scene.kind.replaceAll("-", " ")}.`}</p>
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
    <strong>{ui.mapViewChanged}</strong>
    <span>{ui.mapViewChangedBody}</span>
    <button type="button" onClick={onKeep}>{ui.keepMapView}</button>
    <button type="button" className="primary" onClick={onReturn}>{ui.returnToBriefing}</button>
  </div>;
}
