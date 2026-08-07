import {
  createImpactAssessmentId,
  createImpactChannelId,
  createImpactConditionId,
  createImpactScenarioId,
  createPersonalImpactContext,
  createUserExposure,
  type ImpactAssessment,
  type ImpactChannel,
  type ImpactCondition,
  type ImpactMappingPolicy,
  type ImpactScenario,
  type PersonalImpactContext,
  type PersonalizedImpactAnalysisInput,
} from "@world-news-ai/personalization";

export function createLocalPersonalImpactContext(options: {
  excludeCurrency?: "USD";
} = {}): PersonalImpactContext {
  const exposures = [
    createUserExposure({ dimension: "geography", countryCode: "KR" }),
    ...(options.excludeCurrency === "USD" ? [] : [
      createUserExposure({ dimension: "currency" as const, currencyCode: "USD" }),
    ]),
    createUserExposure({ dimension: "industry", industry: "semiconductor" }),
  ];
  return createPersonalImpactContext({
    contextVersion: "1",
    consent: { enabled: true, purpose: "personalized-impact-analysis" },
    callerScope: { lifetime: "request-run", propagation: "explicit-only" },
    exposures,
  });
}

export const localPersonalizedImpactPolicy: ImpactMappingPolicy = {
  id: "fixture:local-personalized-impact",
  version: "1",
  policyVersion: "personalized-impact-fixture-v1",
  deterministic: true,
  map: createLocalImpactProposal,
};

function createLocalImpactProposal(input: PersonalizedImpactAnalysisInput) {
  const evidenceIds = input.evidenceContextPackage.selectedItems.map(({ id }) => id);
  if (evidenceIds.length === 0) return undefined;
  const premise = condition("premise", "Technology controls and current FX conditions remain in force.");
  const trigger = condition("trigger", "Supply constraints persist while USD/KRW translation pressure remains material.");
  const counterSignal = condition("counter-signal", "Controls ease, supply expands, or the FX path reverses.");
  const conditions = [premise, trigger, counterSignal];
  const channels: ImpactChannel[] = input.personalContext.exposures.map((exposure, index) => {
    const currency = exposure.dimension === "currency";
    const draft: Omit<ImpactChannel, "channelId"> = {
      mechanism: mechanismFor(exposure.dimension),
      evidenceContextItemIds: [evidenceIds[index % evidenceIds.length]!],
      exposureIds: [exposure.exposureId],
      relation: currency ? "countervailing" : "conditional",
      direction: currency ? "mixed" : "increases",
      conditionIds: [currency ? premise.conditionId : trigger.conditionId],
      uncertainty: {
        posture: "material",
        statement: "The realized effect depends on the stated conditions and the user's actual exposure structure.",
        unknowns: ["The fixture does not establish impact magnitude or timing."],
      },
      epistemicType: "inference",
    };
    return { ...draft, channelId: createImpactChannelId(draft) };
  });
  const assessments: ImpactAssessment[] = input.personalContext.exposures.map((exposure) => {
    const related = channels.filter(({ exposureIds }) => exposureIds.includes(exposure.exposureId));
    const draft: Omit<ImpactAssessment, "assessmentId"> = {
      exposureId: exposure.exposureId,
      channelIds: related.map(({ channelId }) => channelId),
      direction: related[0]?.direction ?? "uncertain",
      epistemicType: "inference",
      conditionIds: related.flatMap(({ conditionIds }) => conditionIds),
      uncertainty: {
        posture: "material",
        statement: "This is a conditional inference, not a measured personal outcome.",
        unknowns: ["No calibrated exposure weight or impact magnitude is available."],
      },
      supportingContextItemIds: related.flatMap(({ evidenceContextItemIds }) => evidenceContextItemIds),
    };
    return { ...draft, assessmentId: createImpactAssessmentId(draft) };
  });
  const scenarioDraft: Omit<ImpactScenario, "scenarioId"> = {
    kind: "baseline",
    premiseConditionId: premise.conditionId,
    horizon: { amount: 3, unit: "month" },
    triggerConditionIds: [trigger.conditionId],
    counterSignalConditionIds: [counterSignal.conditionId],
    affectedExposureIds: input.personalContext.exposures.map(({ exposureId }) => exposureId),
    channelIds: channels.map(({ channelId }) => channelId),
    expectedDirection: "mixed",
    uncertainty: {
      posture: "material",
      statement: "This is a conditional scenario, not a probability forecast.",
      unknowns: ["Policy implementation and FX paths may diverge."],
    },
  };
  const scenario = { ...scenarioDraft, scenarioId: createImpactScenarioId(scenarioDraft) };
  return {
    conditions, channels, assessments, scenarios: [scenario],
    unknowns: ["No calibrated probability, magnitude, or personal exposure weight is available."],
    limitations: ["This lens explains possible channels and does not recommend an action."],
  };
}

function condition(kind: ImpactCondition["kind"], statement: string): ImpactCondition {
  const draft = { kind, statement };
  return { ...draft, conditionId: createImpactConditionId(draft) };
}

function mechanismFor(dimension: string): string {
  if (dimension === "currency") return "USD/KRW moves can change the KRW translation of the explicit USD exposure.";
  if (dimension === "industry") return "Supply constraints can affect input availability for the explicit semiconductor exposure.";
  return "Downstream production effects can reach the explicitly supplied South Korea exposure.";
}
