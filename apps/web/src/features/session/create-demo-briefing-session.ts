import {
  withBriefingSessionFingerprint,
  type BriefingSession,
} from "@world-news-ai/session";
import type { ValidatedBriefingScript } from "@world-news-ai/script-web";

export const DEMO_SESSION_POLICY_VERSION = "demo-session-v1";

export function createDemoBriefingSession(
  script: ValidatedBriefingScript,
  now: string,
): BriefingSession {
  const firstScene = script.scenes[0];
  if (!firstScene) throw new Error("Demo Script must contain an opening scene.");
  return withBriefingSessionFingerprint({
    sessionId: `session:${script.id}`,
    status: "briefing-ready",
    originalQuestionId: script.questionId,
    currentQuestionId: script.questionId,
    contractId: script.contractId,
    contractFingerprint: script.contractFingerprint,
    contextPackageFingerprint: script.contextPackageFingerprint,
    planId: script.explanationPlanId,
    planFingerprint: script.explanationPlanFingerprint,
    scriptId: script.id,
    scriptFingerprint: script.fingerprint,
    sceneCursor: {
      sceneId: firstScene.id,
      sceneIndex: 0,
      totalScenes: script.scenes.length,
      visitedSceneIds: [firstScene.id],
    },
    presentationPreference: script.presentationPreference,
    selectedAnalysisTab: "key",
    manualMapViewState: { status: "inactive" },
    composerState: "compact",
    policyVersion: DEMO_SESSION_POLICY_VERSION,
    createdAt: now,
    updatedAt: now,
  });
}
