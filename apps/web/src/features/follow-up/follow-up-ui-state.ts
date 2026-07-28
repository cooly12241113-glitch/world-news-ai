export type FollowUpExecutionStatus = "idle" | "running";
export type FollowUpTone = "informational" | "success" | "clarification" | "policy" | "error";
export const CLARIFICATION_OPTION_IDS = [
  "replace-remaining-scenes",
  "rebuild-entire-briefing",
  "keep-current-briefing",
] as const;
export type ClarificationOptionId = (typeof CLARIFICATION_OPTION_IDS)[number];

export interface FollowUpViewModel {
  tone: FollowUpTone;
  title: string;
  summary: string;
  detailRows: Array<{ label: string; value: string }>;
  evidenceItems: string[];
  clarificationOptions: ClarificationOptionId[];
  canRetry: boolean;
  canDismiss: boolean;
  shouldOpenComposer: boolean;
  shouldPreserveViewport: boolean;
  fixtureLabel: string;
  accessibilityAnnouncement: string;
}
