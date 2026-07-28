import { createSemanticFingerprint } from "../briefing/fingerprint";
import type { BriefingSession } from "./briefing-session";

export function createBriefingSessionFingerprint(
  session: Omit<BriefingSession, "semanticFingerprint"> | BriefingSession,
): string {
  return createSemanticFingerprint({
    status: session.status,
    originalQuestionId: session.originalQuestionId,
    currentQuestionId: session.currentQuestionId,
    contractId: session.contractId,
    contractFingerprint: session.contractFingerprint,
    contextPackageFingerprint: session.contextPackageFingerprint,
    planId: session.planId,
    planFingerprint: session.planFingerprint,
    scriptId: session.scriptId,
    scriptFingerprint: session.scriptFingerprint,
    sceneCursor: session.sceneCursor,
    presentationPreference: session.presentationPreference,
    selectedAnalysisTab: session.selectedAnalysisTab,
    viewportSnapshot: session.viewportSnapshot,
    manualMapViewState: session.manualMapViewState,
    composerState: session.composerState,
    activeOperation: session.activeOperation,
    resumeStatus: session.resumeStatus,
    followUpParentId: session.followUpParentId,
    error: session.error,
    policyVersion: session.policyVersion,
  });
}

export function withBriefingSessionFingerprint(
  session: Omit<BriefingSession, "semanticFingerprint">,
): BriefingSession {
  return {
    ...session,
    semanticFingerprint: createBriefingSessionFingerprint(session),
  };
}
