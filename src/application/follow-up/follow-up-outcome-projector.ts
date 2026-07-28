import type { FollowUpExecutionOutcome } from "./follow-up-execution-outcome";

export const RECOMMENDED_UI_ACTIONS = [
  "keep-current-scene",
  "show-current-context-answer",
  "apply-replacement-script",
  "reopen-composer",
  "show-unsupported-message",
  "show-retryable-error",
  "ignore-stale-result",
] as const;

export type RecommendedUiAction = (typeof RECOMMENDED_UI_ACTIONS)[number];

export function projectRecommendedUiAction(
  outcome: FollowUpExecutionOutcome["outcome"],
  retryable = false,
): RecommendedUiAction {
  switch (outcome) {
    case "current-context-answer":
      return "show-current-context-answer";
    case "replacement-applied":
      return "apply-replacement-script";
    case "clarification-required":
      return "reopen-composer";
    case "unsupported":
      return "show-unsupported-message";
    case "failed":
      return retryable ? "show-retryable-error" : "keep-current-scene";
    case "stale-ignored":
      return "ignore-stale-result";
  }
}
