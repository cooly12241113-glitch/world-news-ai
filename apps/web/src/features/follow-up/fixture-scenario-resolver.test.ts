import { describe, expect, it } from "vitest";
import type { FollowUpContext, FollowUpRequest } from "@world-news-ai/follow-up";
import { buildDemoScript } from "../../fixtures/build-demo-script";
import { createDemoBriefingSession } from "../session";
import {
  classifyReplacementScenes,
  resolveFixtureScenario,
} from "./fixture-scenario-resolver";

const script = buildDemoScript();
const session = createDemoBriefingSession(script, "2026-07-28T00:00:00.000Z");
const ids = script.scenes.map(({ id }) => id);
const allowlist = {
  contextItemIds: ["context:semiconductor-policy"],
  excerptIds: ["excerpt:policy-brief"],
  provenanceRecordIds: ["provenance:policy-brief"],
  sourceDocumentIds: ["document:policy-brief"],
  claimIds: ["claim:policy"],
  evidenceLinkIds: ["evidence:policy"],
  dataPointIds: ["data:exposure-index"],
};
const context: FollowUpContext = {
  sessionId: session.sessionId, currentSceneId: ids[0]!, currentSceneIndex: 0,
  scriptId: script.id, scriptFingerprint: script.fingerprint,
  contractId: script.contractId, contractFingerprint: script.contractFingerprint,
  planId: script.explanationPlanId, planFingerprint: script.explanationPlanFingerprint,
  contextPackageId: script.contextPackageId,
  contextPackageFingerprint: script.contextPackageFingerprint,
  availableSceneIds: ids, completedSceneIds: [ids[0]!], remainingSceneIds: ids.slice(1),
  visibleEvidenceIds: [], evidenceAllowlist: allowlist,
  presentationPreference: script.presentationPreference, selectedAnalysisTab: "key",
  manualMapViewStatus: "inactive", policyVersion: "demo-session-v1",
};

function request(text: string): FollowUpRequest {
  return {
    followUpId: "follow-up", sessionId: session.sessionId,
    parentQuestionId: session.currentQuestionId, text, locale: "en",
    currentSceneId: context.currentSceneId, currentSceneIndex: 0,
    expectedSessionFingerprint: session.semanticFingerprint,
    scriptFingerprint: script.fingerprint,
    contextPackageFingerprint: script.contextPackageFingerprint,
    submittedAt: "2026-07-28T00:00:00.000Z", policyVersion: "demo-session-v1",
  };
}

describe("fixture scenario resolver", () => {
  it.each([
    ["source for this claim", "answer-current-context", "current-context"],
    ["revise this scene", "revise-current-scene", "revise"],
    ["add a scene", "append-scenes", "append-unavailable"],
    ["replace the remaining scenes", "replace-remaining-scenes", "replace"],
    ["start over", "rebuild-entire-briefing", "rebuild"],
    ["do that again", "clarification-required", "clarification"],
    ["delete a file", "unsupported", "unsupported"],
  ] as const)("maps %s through the core classifier", (text, scope, scenarioId) => {
    const result = resolveFixtureScenario(request(text), context, script, "decision");
    expect(result.decision.scope).toBe(scope);
    expect(result.scenarioId).toBe(scenarioId);
  });

  it("does not present terminal replacement as append", () => {
    const result = resolveFixtureScenario(request("add a scene"), context, script, "decision");
    expect(result.appendUnavailable).toBe(true);
    expect(result.replacementScript).toBeUndefined();
  });

  it("changes the current Impact Path scene with fixture counterevidence", () => {
    const currentSceneIndex = 3;
    const currentSceneId = ids[currentSceneIndex]!;
    const impactContext = {
      ...context,
      currentSceneId,
      currentSceneIndex,
      completedSceneIds: ids.slice(0, currentSceneIndex + 1),
      remainingSceneIds: ids.slice(currentSceneIndex + 1),
    };
    const impactRequest = {
      ...request("revise this scene"),
      currentSceneId,
      currentSceneIndex,
    };
    const resolution = resolveFixtureScenario(
      impactRequest, impactContext, script, "decision",
    );
    const replacement = resolution.replacementScript!;
    const previousScene = script.scenes[currentSceneIndex]!;
    const replacementScene = replacement.scenes[currentSceneIndex]!;
    expect(replacement.fingerprint).not.toBe(script.fingerprint);
    expect(replacementScene.contentBindings).toHaveLength(
      previousScene.contentBindings.length + 1,
    );
    expect(replacementScene.contentBindings.at(-1)).toMatchObject({
      usage: "contradict",
      required: false,
    });
    expect(replacementScene.visualDirectives).toEqual(previousScene.visualDirectives);
  });

  it("counts same-ID semantic changes without double-counting them as preserved", () => {
    const currentSceneIndex = 3;
    const currentSceneId = ids[currentSceneIndex]!;
    const resolution = resolveFixtureScenario({
      ...request("revise this scene"),
      currentSceneId,
      currentSceneIndex,
    }, {
      ...context,
      currentSceneId,
      currentSceneIndex,
    }, script, "decision");
    const changes = classifyReplacementScenes(script, resolution.replacementScript!);
    expect(changes.changedSceneIds).toEqual([currentSceneId]);
    expect(changes.changedSceneIds).toHaveLength(1);
    expect(changes.preservedSceneIds).toHaveLength(6);
    expect(changes.preservedSceneIds).not.toContain(currentSceneId);
    expect(changes.removedSceneIds).toEqual([]);
  });
});
