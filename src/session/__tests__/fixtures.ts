import { presentationPreference } from "../../script/presentation";
import type { BriefingSession } from "../briefing-session";
import type { SessionCommand } from "../session-command";
import { withBriefingSessionFingerprint } from "../session-fingerprint";
import type { DeterministicSessionContext } from "../session-reducer";

export const context: DeterministicSessionContext = {
  transitionTimestamp: "2026-07-28T01:02:03.000Z",
  eventId: "event-1",
  auditRecordId: "audit-1",
  policyVersion: "session-policy-v1",
};

export function session(
  overrides: Partial<BriefingSession> = {},
): BriefingSession {
  const base: Omit<BriefingSession, "semanticFingerprint"> = {
    sessionId: "session-1",
    status: "briefing-ready",
    originalQuestionId: "question-1",
    currentQuestionId: "question-1",
    contractId: "contract-1",
    contractFingerprint: "contract-fingerprint-1",
    contextPackageFingerprint: "context-fingerprint-1",
    planId: "plan-1",
    planFingerprint: "plan-fingerprint-1",
    scriptId: "script-1",
    scriptFingerprint: "script-fingerprint-1",
    sceneCursor: {
      sceneId: "scene-1",
      sceneIndex: 0,
      totalScenes: 3,
      visitedSceneIds: ["scene-1"],
    },
    presentationPreference: presentationPreference(),
    selectedAnalysisTab: "key",
    manualMapViewState: { status: "inactive" },
    composerState: "compact",
    policyVersion: "session-policy-v1",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
  const { semanticFingerprint: _ignored, ...withoutFingerprint } = overrides;
  return withBriefingSessionFingerprint({ ...base, ...withoutFingerprint });
}

type CommandInput<T extends SessionCommand["type"]> =
  Extract<SessionCommand, { type: T }> extends infer Value
    ? Value extends SessionCommand
      ? Omit<Value, "commandId" | "expectedSessionFingerprint">
      : never
    : never;

export function command<T extends SessionCommand["type"]>(
  current: BriefingSession,
  value: CommandInput<T>,
): Extract<SessionCommand, { type: T }> {
  const input = value as { type: T };
  return {
    commandId: `command-${input.type.toLowerCase()}`,
    expectedSessionFingerprint: current.semanticFingerprint,
    ...(value as object),
  } as Extract<SessionCommand, { type: T }>;
}
