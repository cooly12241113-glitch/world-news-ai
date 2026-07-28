import type { ClarificationOptionId, FollowUpViewModel } from "./follow-up-ui-state";
import { FollowUpClarificationOptions } from "./FollowUpClarificationOptions";

export function FollowUpOutcomePanel({
  viewModel,
  onClarification,
  onRetry,
  onDismiss,
}: {
  viewModel?: FollowUpViewModel;
  onClarification: (option: ClarificationOptionId) => void;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (!viewModel) return null;
  return <section className={`follow-up-outcome tone-${viewModel.tone}`}
    aria-live="polite" role={viewModel.tone === "error" ? "alert" : "status"}>
    <span className="fixture-badge">{viewModel.fixtureLabel}</span>
    <h3>{viewModel.title}</h3>
    <p>{viewModel.summary}</p>
    {viewModel.detailRows.length > 0 && <dl>{viewModel.detailRows.map((row) =>
      <div key={row.label}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>}
    {viewModel.evidenceItems.length > 0 && <ul>{viewModel.evidenceItems.map((item) =>
      <li key={item}>{item}</li>)}</ul>}
    <FollowUpClarificationOptions options={viewModel.clarificationOptions}
      onSelect={onClarification} />
    <div className="follow-up-actions">
      {viewModel.canRetry && <button type="button" onClick={onRetry}>Retry</button>}
      {viewModel.canDismiss && <button type="button" className="quiet"
        onClick={onDismiss}>Dismiss</button>}
    </div>
    <span className="sr-only">{viewModel.accessibilityAnnouncement}</span>
  </section>;
}
