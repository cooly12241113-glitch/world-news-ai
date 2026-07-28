import type { ClarificationOptionId } from "./follow-up-ui-state";

export function FollowUpClarificationOptions({
  options,
  onSelect,
}: {
  options: ClarificationOptionId[];
  onSelect: (option: ClarificationOptionId) => void;
}) {
  if (options.length === 0) return null;
  return <div className="follow-up-options" aria-label="Clarification options">
    {options.map((option) => <button type="button" key={option}
      onClick={() => onSelect(option)}>{option.replaceAll("-", " ")}</button>)}
  </div>;
}
