import {
  classifyFollowUp,
  createFollowUpAnswerPlan,
  type FollowUpContext,
  type FollowUpRequest,
  type ReplanDecision,
} from "@world-news-ai/follow-up";
import {
  createSceneReplacementMapping,
  replanResultFingerprint,
  type ReplanAdapter,
  type ReplanRequest,
  type ReplanResult,
  type ReplanResultFingerprintInput,
} from "@world-news-ai/replan";
import {
  briefingSceneFingerprint,
  briefingScriptFingerprint,
  type BriefingScriptDraft,
  type ValidatedBriefingScript,
} from "@world-news-ai/script-web";

export interface FixtureScenarioResolution {
  decision: ReplanDecision;
  scenarioId: string;
  sourceScript: ValidatedBriefingScript;
  replacementScript?: ValidatedBriefingScript;
  appendUnavailable: boolean;
}

const scenarioForScope: Record<ReplanDecision["scope"], string> = {
  "answer-current-context": "current-context",
  "revise-current-scene": "revise",
  "append-scenes": "append-unavailable",
  "replace-remaining-scenes": "replace",
  "rebuild-entire-briefing": "rebuild",
  "clarification-required": "clarification",
  unsupported: "unsupported",
};

function replacementVariant(
  source: ValidatedBriefingScript,
  scope: ReplanDecision["scope"],
  currentSceneIndex: number,
): ValidatedBriefingScript | undefined {
  if (!["revise-current-scene", "replace-remaining-scenes", "rebuild-entire-briefing"].includes(scope)) {
    return undefined;
  }
  const draft = structuredClone(source) as BriefingScriptDraft;
  const originalIds = draft.scenes.map(({ id }) => id);
  if (scope === "rebuild-entire-briefing") {
    const ids = new Map(originalIds.map((id, index) => [id, `demo-rebuild:${index}`]));
    draft.scenes = draft.scenes.map((scene) => ({
      ...scene,
      id: ids.get(scene.id)!,
      dependsOnSceneIds: scene.dependsOnSceneIds.map((id) => ids.get(id)!),
    }));
  } else if (scope === "replace-remaining-scenes") {
    const ids = new Map(originalIds.map((id, index) => [
      id,
      index <= currentSceneIndex ? id : `demo-replacement:${index}`,
    ]));
    draft.scenes = draft.scenes.map((scene) => ({
      ...scene,
      id: ids.get(scene.id)!,
      dependsOnSceneIds: scene.dependsOnSceneIds.map((id) => ids.get(id)!),
    }));
  } else {
    const current = draft.scenes[currentSceneIndex];
    if (current) {
      current.objective = `${current.objective} Include the fixture counterevidence boundary.`;
      const existing = current.contentBindings[0];
      if (existing) {
        current.contentBindings.push({
          ...structuredClone(existing),
          id: `${existing.id}:fixture-counterevidence`,
          usage: "contradict",
          required: false,
          warnings: ["Deterministic fixture counterevidence boundary."],
        });
      }
    }
  }
  draft.id = `demo:${scope}`;
  draft.questionId = `${source.questionId}:${scope}`;
  draft.scriptVersion = `${source.scriptVersion}:${scope}`;
  draft.fingerprint = briefingScriptFingerprint(draft);
  return draft as ValidatedBriefingScript;
}

export function resolveFixtureScenario(
  request: FollowUpRequest,
  context: FollowUpContext,
  script: ValidatedBriefingScript,
  decisionId: string,
  decisionInput?: ReplanDecision,
  replacementOverride?: ValidatedBriefingScript,
): FixtureScenarioResolution {
  const decision = decisionInput ?? classifyFollowUp(request, context, {
    decisionId,
    policyVersion: context.policyVersion,
  });
  return {
    decision,
    scenarioId: scenarioForScope[decision.scope],
    sourceScript: script,
    replacementScript: replacementOverride ??
      replacementVariant(script, decision.scope, context.currentSceneIndex),
    appendUnavailable: decision.scope === "append-scenes",
  };
}

export function classifyReplacementScenes(
  previousScript: ValidatedBriefingScript,
  replacementScript: ValidatedBriefingScript,
) {
  const previous = new Map(previousScript.scenes.map((scene) => [scene.id, scene]));
  const next = new Set(replacementScript.scenes.map(({ id }) => id));
  const changedSceneIds = replacementScript.scenes
    .filter((scene) => {
      const prior = previous.get(scene.id);
      return !prior ||
        briefingSceneFingerprint(prior) !== briefingSceneFingerprint(scene);
    })
    .map(({ id }) => id);
  const changed = new Set(changedSceneIds);
  return {
    changedSceneIds,
    preservedSceneIds: replacementScript.scenes
      .map(({ id }) => id)
      .filter((id) => previous.has(id) && !changed.has(id)),
    removedSceneIds: previousScript.scenes
      .map(({ id }) => id)
      .filter((id) => !next.has(id)),
  };
}

export class BrowserFixtureReplanAdapter implements ReplanAdapter {
  readonly id = "browser-fixture-replan-adapter";
  readonly deterministic = true as const;
  constructor(private readonly resolution: FixtureScenarioResolution) {}

  prepare(request: ReplanRequest): ReplanResult {
    const base = {
      resultId: request.deterministicContext.resultId,
      operationId: request.operationId,
      startedFromSessionFingerprint: request.startedFromSessionFingerprint,
      policyVersion: request.deterministicContext.policyVersion,
    };
    const fingerprint = <T extends ReplanResultFingerprintInput>(value: T) => ({
      ...value,
      semanticFingerprint: replanResultFingerprint(value),
    });
    if (this.resolution.appendUnavailable) {
      return fingerprint({ ...base, outcome: "clarification-required", reasonCode: "TRUE_APPEND_FIXTURE_UNAVAILABLE" });
    }
    if (this.resolution.decision.scope === "clarification-required") {
      return fingerprint({ ...base, outcome: "clarification-required", reasonCode: "AMBIGUOUS_REFERENT" });
    }
    if (this.resolution.decision.scope === "unsupported") {
      return fingerprint({ ...base, outcome: "unsupported", reasonCode: "UNSUPPORTED_SYSTEM_ACTION" });
    }
    if (this.resolution.decision.scope === "answer-current-context") {
      const planning = this.resolution.sourceScript.personalizedImpactPlanningContext;
      const codes = this.resolution.decision.matchedRuleCodes;
      const personalExplanation = codes.includes("CURRENT_CONTEXT_PERSONAL_IMPACT_EXPLANATION");
      const counterScenario = codes.includes("CURRENT_CONTEXT_VALIDATED_COUNTER_SCENARIO");
      const relevantChannels = planning?.channels.filter((channel) =>
        !counterScenario || planning.scenarios.some((scenario) =>
          scenario.channelIds.includes(channel.channelId)
        )
      ) ?? [];
      const allowed = new Set(Object.values(request.followUpContext.evidenceAllowlist).flat());
      const evidence = personalExplanation || counterScenario
        ? [...new Set(relevantChannels.flatMap(({ evidenceContextItemIds }) => evidenceContextItemIds))]
          .filter((id) => allowed.has(id))
        : request.followUpContext.visibleEvidenceIds.slice(0, 1);
      const notes = personalExplanation && planning
        ? personalImpactExplanation(planning)
        : counterScenario && planning
          ? validatedCounterScenario(planning)
          : ["This is a deterministic fixture response."];
      return fingerprint({
        ...base,
        outcome: "current-context-answer",
        answerPlan: createFollowUpAnswerPlan({
          answerPlanId: request.deterministicContext.answerPlanId,
          followUpId: request.followUpRequest.followUpId,
          sessionId: request.sessionId,
          sceneId: request.currentSceneId,
          answerType: personalExplanation ? "uncertainty-explanation"
            : counterScenario ? "evidence-summary" : "source-list",
          evidenceBindings: evidence,
          statementTypes: personalExplanation ? ["inference", "uncertainty"]
            : counterScenario ? ["forecast", "uncertainty"]
              : evidence.length ? ["attributed-claim"] : ["unknown"],
          uncertaintyNotes: notes,
          missingEvidence: evidence.length ? [] : ["No visible allowlisted evidence."],
        }, request.followUpContext.evidenceAllowlist),
      });
    }
    const script = this.resolution.replacementScript;
    const strategy = this.resolution.decision.suggestedSceneMappingPolicy;
    if (!script || !strategy) throw new Error("Replacement fixture is unavailable.");
    const sceneIds = script.scenes.map(({ id }) => id);
    const mapping = createSceneReplacementMapping({
      strategy,
      currentSceneId: request.currentSceneId,
      previousSceneIds: request.followUpContext.availableSceneIds,
      replacementSceneIds: sceneIds,
      completedSceneIds: request.completedSceneIds,
    });
    const sceneChanges = classifyReplacementScenes(
      this.resolution.sourceScript,
      script,
    );
    return fingerprint({
      ...base,
      outcome: "replacement-ready",
      replacement: {
        validated: true,
        expectedPreviousScriptFingerprint: request.currentScriptFingerprint,
        currentQuestionId: script.questionId,
        contractId: script.contractId,
        contractFingerprint: script.contractFingerprint,
        contextPackageFingerprint: script.contextPackageFingerprint,
        planId: script.explanationPlanId,
        planFingerprint: script.explanationPlanFingerprint,
        scriptId: script.id,
        scriptFingerprint: script.fingerprint,
        sceneIds,
      },
      validatedReplacementScript: script,
      sceneReplacementMapping: mapping,
      evidenceContinuity: {
        preservedEvidenceIds: Object.values(request.followUpContext.evidenceAllowlist).flat(),
        removedEvidenceIds: [],
        addedEvidenceIds: [],
        invalidatedEvidenceIds: [],
        unresolvedEvidenceIds: [],
        continuityStatus: "preserved",
        policyVersion: request.deterministicContext.policyVersion,
      },
      ...sceneChanges,
    });
  }
}

function personalImpactExplanation(
  planning: NonNullable<ValidatedBriefingScript["personalizedImpactPlanningContext"]>,
): string[] {
  const exposureById = new Map(planning.exposures.map((item) => [item.exposureId, item.canonicalSubject]));
  return planning.channels.map((channel) => {
    const exposures = channel.exposureIds.map((id) => exposureById.get(id)).filter(Boolean).join(", ");
    return `You provided ${exposures}. ${channel.mechanism} This remains a conditional ${channel.epistemicType}; ${channel.uncertainty.statement}`;
  });
}

function validatedCounterScenario(
  planning: NonNullable<ValidatedBriefingScript["personalizedImpactPlanningContext"]>,
): string[] {
  const conditions = new Map(planning.conditions.map((item) => [item.conditionId, item.statement]));
  return planning.scenarios.map((scenario) => {
    const counters = scenario.counterSignalConditionIds.map((id) => conditions.get(id)).filter(Boolean).join("; ");
    return `Validated ${scenario.kind} scenario over ${scenario.horizon.amount} ${scenario.horizon.unit}: counter-signals are ${counters}. ${scenario.uncertainty.statement}`;
  });
}
