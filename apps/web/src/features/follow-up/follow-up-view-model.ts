import type { FollowUpExecutionOutcome } from "@world-news-ai/application-follow-up";
import type { FollowUpViewModel } from "./follow-up-ui-state";
import {
  CLARIFICATION_OPTION_IDS,
  type ClarificationOptionId,
} from "./follow-up-ui-state";

const base = {
  canDismiss: true,
  shouldPreserveViewport: true,
  fixtureLabel: "Fixture response",
} as const;

export function createFollowUpViewModel(outcome: FollowUpExecutionOutcome): FollowUpViewModel {
  if (outcome.outcome === "current-context-answer") {
    return {
      ...base, tone: "informational", title: "Current-context answer",
      summary: "The answer uses only evidence already bound to this scene.",
      detailRows: [
        { label: "Answer type", value: outcome.answerPlan.answerType },
        { label: "Statement posture", value: outcome.answerPlan.statementTypes.join(", ") },
        ...(outcome.answerPlan.uncertaintyNotes.length > 0
          ? [{ label: "Uncertainty", value: outcome.answerPlan.uncertaintyNotes.join(" ") }]
          : []),
        ...(outcome.answerPlan.missingEvidence.length > 0
          ? [{ label: "Missing evidence", value: outcome.answerPlan.missingEvidence.join(" ") }]
          : []),
      ],
      evidenceItems: outcome.answerPlan.evidenceBindings,
      clarificationOptions: [], canRetry: false, shouldOpenComposer: false,
      accessibilityAnnouncement: "Fixture follow-up answer is ready.",
    };
  }
  if (outcome.outcome === "replacement-applied") {
    return {
      ...base, tone: "success", title: "Briefing updated",
      summary: "A validated simulated replacement was applied atomically.",
      detailRows: [
        { label: "Changed scenes", value: String(outcome.changedSceneIds.length) },
        { label: "Preserved scenes", value: String(outcome.preservedSceneIds.length) },
        { label: "Removed scenes", value: String(outcome.removedSceneIds.length) },
        { label: "Scene mapping", value: outcome.mappingStrategy },
        { label: "Evidence continuity", value: outcome.evidenceContinuityStatus },
      ],
      evidenceItems: [], clarificationOptions: [], canRetry: false,
      shouldOpenComposer: false, fixtureLabel: "Simulated replacement",
      accessibilityAnnouncement: "Fixture briefing replacement was applied.",
    };
  }
  if (outcome.outcome === "clarification-required") {
    const safeOptions = outcome.clarificationOptions.filter(
      (option): option is ClarificationOptionId =>
        CLARIFICATION_OPTION_IDS.includes(option as ClarificationOptionId),
    );
    return {
      ...base, tone: "clarification", title: "Please clarify the follow-up",
      summary: outcome.reasonCode === "TRUE_APPEND_FIXTURE_UNAVAILABLE"
        ? "A true append fixture is not available. Choose a safe alternative."
        : "The requested target or scope is ambiguous.",
      detailRows: [], evidenceItems: [],
      clarificationOptions: safeOptions,
      canRetry: false, shouldOpenComposer: true,
      accessibilityAnnouncement: "Clarification is required.",
    };
  }
  if (outcome.outcome === "unsupported") {
    return {
      ...base, tone: "policy", title: "Request outside demo scope",
      summary: "This fixture demo cannot perform that action. You can revise the question.",
      detailRows: [{ label: "Category", value: outcome.userFacingCategory }],
      evidenceItems: [], clarificationOptions: [], canRetry: false,
      shouldOpenComposer: true, accessibilityAnnouncement: "The request is unsupported in this demo.",
    };
  }
  if (outcome.outcome === "failed") {
    return {
      ...base, tone: "error", title: "Follow-up could not be completed",
      summary: "The previous briefing state was restored safely.",
      detailRows: [], evidenceItems: [], clarificationOptions: [],
      canRetry: outcome.retryable, shouldOpenComposer: true,
      accessibilityAnnouncement: "Follow-up failed and the previous briefing was restored.",
    };
  }
  return {
    ...base, tone: "informational", title: "Older result ignored",
    summary: "A newer operation already owns the session.",
    detailRows: [], evidenceItems: [], clarificationOptions: [],
    canRetry: false, shouldOpenComposer: false,
    accessibilityAnnouncement: "",
  };
}
