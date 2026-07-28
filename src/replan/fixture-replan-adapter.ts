import type { BriefingContract } from "../briefing";
import type { EvidenceContextPackage } from "../context";
import type { ValidatedExplanationPlan } from "../explanation";
import { createFollowUpAnswerPlan } from "../follow-up";
import type { BriefingScriptDraft } from "../script";
import type { ReplacementSessionIdentity } from "../session";
import {
  assessEvidenceContinuity,
  assertEvidenceContinuitySafe,
} from "./evidence-continuity";
import type { ReplanAdapter } from "./replan-adapter";
import { replanResultFingerprint } from "./replan-fingerprint";
import type { ReplanResultFingerprintInput } from "./replan-fingerprint";
import type { ReplanRequest } from "./replan-request";
import { ReplanRequestSchema } from "./replan-request";
import type { ReplanResult } from "./replan-result";
import {
  evidenceAllowlistFromContext,
  validateReplacement,
} from "./replacement-validator";
import { createSceneReplacementMapping } from "./scene-mapping";

export type FixtureScenarioKind =
  | "current-context-source-answer"
  | "revise-current-scene-counterevidence"
  | "append-impact-scenes"
  | "replace-remaining-perspective"
  | "rebuild-beginner-briefing"
  | "clarification-result"
  | "unsupported-result"
  | "failure-result";

export interface FixtureReplanScenario {
  scenarioId: string;
  kind: FixtureScenarioKind;
  expectedScope:
    | "answer-current-context"
    | "revise-current-scene"
    | "append-scenes"
    | "replace-remaining-scenes"
    | "rebuild-entire-briefing"
    | "clarification-required"
    | "unsupported";
  fixtureMetadata: { fictional: true; description: string };
  replacement?: {
    script: BriefingScriptDraft;
    plan: ValidatedExplanationPlan;
    contract: BriefingContract;
    contextPackage: EvidenceContextPackage;
    invalidatedEvidenceIds: string[];
  };
}

export class FixtureReplanAdapter implements ReplanAdapter {
  readonly id = "fixture-replan-adapter";
  readonly deterministic = true as const;
  private readonly scenarios: Map<string, FixtureReplanScenario>;

  constructor(scenarios: FixtureReplanScenario[]) {
    this.scenarios = new Map(scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  }

  prepare(input: ReplanRequest): ReplanResult {
    const request = ReplanRequestSchema.parse(input);
    const scenario = this.scenarios.get(request.fixtureScenarioId);
    if (!scenario) {
      throw new Error("Unknown fixture scenario.");
    }
    if (scenario.expectedScope !== request.replanDecision.scope) {
      throw new Error("Fixture scenario does not match the replan decision.");
    }
    const base = {
      resultId: request.deterministicContext.resultId,
      operationId: request.operationId,
      startedFromSessionFingerprint: request.startedFromSessionFingerprint,
      policyVersion: request.deterministicContext.policyVersion,
    };
    if (scenario.kind === "current-context-source-answer") {
      const evidenceId = request.followUpContext.visibleEvidenceIds[0];
      const answerPlan = createFollowUpAnswerPlan({
        answerPlanId: request.deterministicContext.answerPlanId,
        followUpId: request.followUpRequest.followUpId,
        sessionId: request.sessionId,
        sceneId: request.currentSceneId,
        answerType: "source-list",
        evidenceBindings: evidenceId ? [evidenceId] : [],
        statementTypes: evidenceId ? ["attributed-claim"] : ["unknown"],
        uncertaintyNotes: [],
        missingEvidence: evidenceId ? [] : ["No visible allowlisted evidence."],
      }, request.followUpContext.evidenceAllowlist);
      return this.fingerprint({ ...base, outcome: "current-context-answer", answerPlan });
    }
    if (scenario.kind === "clarification-result") {
      return this.fingerprint({
        ...base,
        outcome: "clarification-required",
        reasonCode: "AMBIGUOUS_REFERENT",
      });
    }
    if (scenario.kind === "unsupported-result") {
      return this.fingerprint({
        ...base,
        outcome: "unsupported",
        reasonCode: "UNSUPPORTED_SYSTEM_ACTION",
      });
    }
    if (scenario.kind === "failure-result") {
      return this.fingerprint({
        ...base,
        outcome: "failed",
        error: { code: "FIXTURE_REPLAN_FAILED", retryable: true },
        safeRollbackIdentity: {
          scriptFingerprint: request.currentScriptFingerprint,
          contextPackageFingerprint: request.currentContextPackageFingerprint,
          sceneId: request.currentSceneId,
        },
      });
    }
    if (!scenario.replacement) {
      throw new Error("Replacement fixture is missing.");
    }
    const validated = validateReplacement({
      ...scenario.replacement,
      followUpContext: request.followUpContext,
    });
    const replacementSceneIds = validated.script.scenes.map((scene) => scene.id);
    const strategy = request.replanDecision.suggestedSceneMappingPolicy;
    if (!strategy) throw new Error("Replacement mapping policy is missing.");
    const mapping = createSceneReplacementMapping({
      strategy,
      currentSceneId: request.currentSceneId,
      previousSceneIds: request.followUpContext.availableSceneIds,
      replacementSceneIds,
      completedSceneIds: request.completedSceneIds,
    });
    const replacementAllowlist = evidenceAllowlistFromContext(
      scenario.replacement.contextPackage,
    );
    const continuity = assessEvidenceContinuity(
      request.followUpContext.evidenceAllowlist,
      replacementAllowlist,
      scenario.replacement.invalidatedEvidenceIds,
      request.deterministicContext.policyVersion,
    );
    assertEvidenceContinuitySafe(continuity);
    const previous = new Set(request.followUpContext.availableSceneIds);
    const next = new Set(replacementSceneIds);
    const preservedSceneIds = [...previous].filter((id) => next.has(id));
    const removedSceneIds = [...previous].filter((id) => !next.has(id));
    const changedSceneIds = replacementSceneIds.filter((id) => !previous.has(id));
    const replacement: ReplacementSessionIdentity = {
      validated: true,
      expectedPreviousScriptFingerprint: request.currentScriptFingerprint,
      currentQuestionId: validated.script.questionId,
      contractId: validated.script.contractId,
      contractFingerprint: validated.script.contractFingerprint,
      contextPackageFingerprint: validated.script.contextPackageFingerprint,
      planId: validated.script.explanationPlanId,
      planFingerprint: validated.script.explanationPlanFingerprint,
      scriptId: validated.script.id,
      scriptFingerprint: validated.script.fingerprint,
      sceneIds: replacementSceneIds,
    };
    return this.fingerprint({
      ...base,
      outcome: "replacement-ready",
      replacement,
      validatedReplacementScript: validated.script,
      sceneReplacementMapping: mapping,
      evidenceContinuity: continuity,
      changedSceneIds,
      preservedSceneIds,
      removedSceneIds,
    });
  }

  private fingerprint<T extends ReplanResultFingerprintInput>(
    result: T,
  ): T & { semanticFingerprint: string } {
    return { ...result, semanticFingerprint: replanResultFingerprint(result) };
  }
}
