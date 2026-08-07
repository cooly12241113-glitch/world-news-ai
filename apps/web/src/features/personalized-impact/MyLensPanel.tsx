import type { MyLensViewModel } from "./personalized-impact-view-model";

export function MyLensPanel({ viewModel, onAskFollowUp }: {
  viewModel: MyLensViewModel;
  onAskFollowUp?: () => void;
}) {
  return <section className="my-lens" aria-label="My Lens personalized impact">
    <p className="my-lens-intro">This lens uses only the explicit exposures attached to this briefing.</p>
    <h3>Explicit exposure · You provided</h3>
    <ul className="exposure-list">{viewModel.exposures.map((exposure) => <li key={exposure.id}
      className={exposure.activeInScene ? "active" : ""}>
      <strong>{exposure.label}</strong><span>{exposure.dimension}</span>
    </li>)}</ul>
    {!viewModel.hasSceneProjection && <p className="lens-boundary">
      This scene has no personalized impact path. The lens remains available for bound impact and scenario scenes.
    </p>}
    {viewModel.paths.map((path) => <article className="lens-card" key={path.key}>
      <span className="lens-label">Impact path · {path.exposureLabels.join(", ")}</span>
      <p>{path.mechanism}</p>
      <dl><div><dt>Posture</dt><dd>{path.posture}</dd></div></dl>
      {path.conditions.map((condition) => <p className="lens-condition" key={condition}>If {condition}</p>)}
    </article>)}
    {viewModel.scenarios.map((scenario) => <article className="lens-card" key={scenario.key}>
      <span className="lens-label">Scenario · {scenario.label}</span>
      <p>{scenario.premise}</p>
      <dl><div><dt>Posture</dt><dd>{scenario.posture}</dd></div></dl>
      {scenario.triggers.map((trigger) => <p className="lens-condition" key={trigger}>If {trigger}</p>)}
      {scenario.counterSignals.map((signal) => <p className="lens-counter" key={signal}>Watch for: {signal}</p>)}
    </article>)}
    {viewModel.unknowns.length > 0 && <div className="lens-unknown">
      <h3>Unknown</h3>
      <ul>{viewModel.unknowns.map((unknown) => <li key={unknown}>{unknown}</li>)}</ul>
    </div>}
    {viewModel.hasSceneProjection && onAskFollowUp && <button type="button"
      className="lens-follow-up" onClick={onAskFollowUp}>Ask about this lens</button>}
  </section>;
}
