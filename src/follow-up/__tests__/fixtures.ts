import { compiled } from "../../script/__tests__/fixtures";
import { briefingScriptFingerprint, type BriefingScriptDraft } from "../../script";
import type { BriefingSession } from "../../session";
import { withBriefingSessionFingerprint } from "../../session";
import {
  evidenceAllowlistFromContext,
  type FixtureReplanScenario,
  type ReplanRequest,
} from "../../replan";
import type {
  FollowUpContext,
  FollowUpRequest,
  ReplanDecision,
} from "..";
import { presentationPreference } from "../../script/presentation";

export const timestamp = "2026-07-28T02:00:00.000Z";

export function sourceFixture() {
  return compiled();
}

export function followUpContext(): FollowUpContext {
  const { input, script } = sourceFixture();
  const sceneIds = script.scenes.map((scene) => scene.id);
  const currentSceneIndex = Math.min(1, sceneIds.length - 1);
  const currentSceneId = sceneIds[currentSceneIndex]!;
  const allowlist = evidenceAllowlistFromContext(input.contextPackage);
  return {
    sessionId: "session-follow-up",
    currentSceneId,
    currentSceneIndex,
    scriptId: script.id,
    scriptFingerprint: script.fingerprint,
    contractId: input.contract.id,
    contractFingerprint: input.contract.semanticFingerprint,
    planId: input.plan.id,
    planFingerprint: input.plan.fingerprint,
    contextPackageId: input.contextPackage.id,
    contextPackageFingerprint: input.contextPackage.fingerprint,
    availableSceneIds: sceneIds,
    completedSceneIds: sceneIds.slice(0, currentSceneIndex + 1),
    remainingSceneIds: sceneIds.slice(currentSceneIndex + 1),
    visibleEvidenceIds: allowlist.contextItemIds.slice(0, 2),
    evidenceAllowlist: allowlist,
    presentationPreference: presentationPreference(),
    selectedAnalysisTab: "evidence",
    manualMapViewStatus: "inactive",
    policyVersion: "follow-up-policy-v1",
  };
}

export function followUpRequest(
  text: string,
  locale: "ko" | "en" = "en",
): FollowUpRequest {
  const context = followUpContext();
  return {
    followUpId: "follow-up-1",
    sessionId: context.sessionId,
    parentQuestionId: "question-parent",
    text,
    locale,
    currentSceneId: context.currentSceneId,
    currentSceneIndex: context.currentSceneIndex,
    expectedSessionFingerprint: "composer-session-fingerprint",
    scriptFingerprint: context.scriptFingerprint,
    contextPackageFingerprint: context.contextPackageFingerprint,
    submittedAt: timestamp,
    policyVersion: context.policyVersion,
  };
}

function variant(
  mode: "revise" | "append" | "replace-remaining" | "rebuild",
): ReturnType<typeof sourceFixture> {
  const fixture = sourceFixture();
  const script = structuredClone(fixture.script) as BriefingScriptDraft;
  const current = followUpContext();
  const originalIds = script.scenes.map((scene) => scene.id);
  let scenes = script.scenes;

  if (mode === "append") {
    const closing = scenes.at(-1)!;
    const template = scenes.at(-2)!;
    const appended = structuredClone(template);
    appended.id = "fixture-appended-impact";
    appended.kind = "impact-path";
    closing.dependsOnSceneIds = [appended.id];
    scenes = [...scenes.slice(0, -2), appended, closing];
  } else if (mode === "rebuild") {
    const map = new Map(originalIds.map((id, index) => [id, `fixture-beginner-${index}`]));
    scenes = scenes.map((scene) => ({
      ...scene,
      id: map.get(scene.id)!,
      dependsOnSceneIds: scene.dependsOnSceneIds.map((id) => map.get(id)!),
    }));
  } else if (mode === "replace-remaining") {
    const map = new Map(originalIds.map((id, index) => [
      id,
      index <= current.currentSceneIndex ? id : `fixture-perspective-${index}`,
    ]));
    scenes = scenes.map((scene) => ({
      ...scene,
      id: map.get(scene.id)!,
      dependsOnSceneIds: scene.dependsOnSceneIds.map((id) => map.get(id)!),
    }));
  }
  script.scenes = scenes;
  script.id = `fixture-script-${mode}`;
  script.scriptVersion = `fixture-${mode}-v1`;
  script.fingerprint = briefingScriptFingerprint(script);
  return { input: fixture.input, script };
}

export function scenarios(): FixtureReplanScenario[] {
  const make = (
    scenarioId: string,
    kind: FixtureReplanScenario["kind"],
    expectedScope: FixtureReplanScenario["expectedScope"],
    replacementMode?: "revise" | "append" | "replace-remaining" | "rebuild",
  ): FixtureReplanScenario => {
    const replacement = replacementMode ? variant(replacementMode) : undefined;
    return {
      scenarioId,
      kind,
      expectedScope,
      fixtureMetadata: {
        fictional: true,
        description:
          scenarioId === "append"
            ? "Synthetic Korea impact test fixture; not a real event."
            : "Synthetic deterministic test fixture; not a real event.",
      },
      ...(replacement
        ? {
            replacement: {
              script: replacement.script,
              plan: replacement.input.plan,
              contract: replacement.input.contract,
              contextPackage: replacement.input.contextPackage,
              invalidatedEvidenceIds: [],
            },
          }
        : {}),
    };
  };
  return [
    make("current-context", "current-context-source-answer", "answer-current-context"),
    make("revise", "revise-current-scene-counterevidence", "revise-current-scene", "revise"),
    make("append", "append-impact-scenes", "append-scenes", "append"),
    make("replace", "replace-remaining-perspective", "replace-remaining-scenes", "replace-remaining"),
    make("rebuild", "rebuild-beginner-briefing", "rebuild-entire-briefing", "rebuild"),
    make("clarification", "clarification-result", "clarification-required"),
    make("unsupported", "unsupported-result", "unsupported"),
    make("failure", "failure-result", "append-scenes"),
  ];
}

export function replanRequest(
  decision: ReplanDecision,
  fixtureScenarioId: string,
  startedFromSessionFingerprint = "composer-session-fingerprint",
): ReplanRequest {
  const context = followUpContext();
  const request = followUpRequest("source", "en");
  request.followUpId = decision.followUpId;
  return {
    operationId: "operation-replan",
    sessionId: context.sessionId,
    startedFromSessionFingerprint,
    followUpRequest: request,
    followUpContext: context,
    replanDecision: decision,
    currentScriptId: context.scriptId,
    currentScriptFingerprint: context.scriptFingerprint,
    currentPlanId: context.planId,
    currentPlanFingerprint: context.planFingerprint,
    currentContextPackageId: context.contextPackageId,
    currentContextPackageFingerprint: context.contextPackageFingerprint,
    currentSceneId: context.currentSceneId,
    completedSceneIds: context.completedSceneIds,
    fixtureScenarioId,
    deterministicContext: {
      resultId: "result-1",
      answerPlanId: "answer-plan-1",
      occurredAt: timestamp,
      policyVersion: "replan-policy-v1",
    },
  };
}

export function activeSession(): BriefingSession {
  const context = followUpContext();
  const base: Omit<BriefingSession, "semanticFingerprint"> = {
    sessionId: context.sessionId,
    status: "composer-open",
    originalQuestionId: "question-parent",
    currentQuestionId: "question-parent",
    contractId: context.contractId,
    contractFingerprint: context.contractFingerprint,
    contextPackageFingerprint: context.contextPackageFingerprint,
    planId: context.planId,
    planFingerprint: context.planFingerprint,
    scriptId: context.scriptId,
    scriptFingerprint: context.scriptFingerprint,
    sceneCursor: {
      sceneId: context.currentSceneId,
      sceneIndex: context.currentSceneIndex,
      totalScenes: context.availableSceneIds.length,
      visitedSceneIds: context.completedSceneIds,
    },
    presentationPreference: context.presentationPreference,
    selectedAnalysisTab: context.selectedAnalysisTab,
    manualMapViewState: { status: "inactive" },
    composerState: "expanded",
    resumeStatus: "presenting-scene",
    policyVersion: "session-policy-v1",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return withBriefingSessionFingerprint(base);
}
