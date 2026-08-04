import { BriefingContractCompiler, type BriefingQuestion } from "../../briefing";
import {
  EvidenceContextBuilder,
  InMemoryEvidenceCandidateProvider,
} from "../../context";
import type { SourceDocument } from "../../domain";
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
  type ImpactMappingProposal,
  type ImpactScenario,
  type PersonalizedImpactAnalysisInput,
  type UserExposureInput,
} from "..";

const NOW = "2026-08-04T00:00:00.000Z";

export function impactInput(
  exposureInputs: UserExposureInput[] = [
    { dimension: "geography", countryCode: "KR" },
    { dimension: "currency", currencyCode: "USD" },
    { dimension: "industry", industry: "semiconductor" },
  ],
): PersonalizedImpactAnalysisInput {
  const question: BriefingQuestion = {
    id: "question:personal-impact",
    text: "How could semiconductor policy and FX changes affect my USD assets?",
    language: "en",
    submittedAt: NOW,
    referencedEventIds: ["event:semiconductor-policy"],
    referencedEntityIds: [],
    personalizationRequested: true,
    userProvidedContext: {
      locations: ["KR"],
      industries: ["semiconductor"],
      portfolioHoldings: ["USD"],
    },
  };
  const compiled = new BriefingContractCompiler({
    now: () => new Date(NOW),
    createId: () => "contract:personal-impact",
  }).compile(question);
  if (!compiled.success || compiled.outcome !== "ready") {
    throw new Error("Personal impact Contract fixture was not ready.");
  }

  const built = new EvidenceContextBuilder({
    provider: new InMemoryEvidenceCandidateProvider(),
    now: () => new Date(NOW),
    createId: () => "context:personal-impact",
  }).build({
    question,
    briefingContract: compiled.contract,
    referencedEventIds: question.referencedEventIds,
    referencedDossierIds: [],
    callerProvidedRecords: evidenceDocuments(),
    corpusRevision: "corpus:personal-impact-v1",
    requestedAt: NOW,
    retrievalPolicyVersion: "retrieval:personal-impact-v1",
  });
  if (!built.success) throw new Error(built.error.message);

  return {
    personalContext: createPersonalImpactContext({
      contextVersion: "1",
      consent: {
        enabled: true,
        purpose: "personalized-impact-analysis",
      },
      callerScope: {
        lifetime: "request-run",
        propagation: "explicit-only",
      },
      exposures: exposureInputs.map(createUserExposure),
    }),
    contract: compiled.contract,
    evidenceContextPackage: built.contextPackage,
  };
}

export function deterministicImpactPolicy(
  transform?: (proposal: ImpactMappingProposal) => ImpactMappingProposal | undefined,
): ImpactMappingPolicy {
  return {
    id: "fixture:personal-impact-policy",
    version: "1",
    policyVersion: "personal-impact-policy-v1",
    deterministic: true,
    map(input) {
      const proposal = impactProposal(input);
      return transform ? transform(proposal) : proposal;
    },
  };
}

export function rekeyProposal(proposal: ImpactMappingProposal): ImpactMappingProposal {
  const channelIdMap = new Map<string, string>();
  const channels = proposal.channels.map((channel) => {
    const priorId = channel.channelId;
    const next = { ...channel, channelId: createImpactChannelId(channel) };
    channelIdMap.set(priorId, next.channelId);
    return next;
  });
  const assessments = proposal.assessments.map((assessment) => {
    const next = {
      ...assessment,
      channelIds: assessment.channelIds.map((id) => channelIdMap.get(id) ?? id),
    };
    return { ...next, assessmentId: createImpactAssessmentId(next) };
  });
  const scenarios = proposal.scenarios.map((scenario) => {
    const next = {
      ...scenario,
      channelIds: scenario.channelIds.map((id) => channelIdMap.get(id) ?? id),
    };
    return { ...next, scenarioId: createImpactScenarioId(next) };
  });
  return { ...proposal, channels, assessments, scenarios };
}

function impactProposal(input: PersonalizedImpactAnalysisInput): ImpactMappingProposal {
  const evidenceIds = input.evidenceContextPackage.selectedItems.map(({ id }) => id);
  if (evidenceIds.length === 0) throw new Error("Fixture evidence is empty.");
  const premise = condition("premise", "Semiconductor restrictions and FX pressure continue.");
  const trigger = condition("trigger", "Restrictions remain in force and supply stays constrained.");
  const counterSignal = condition("counter-signal", "Restrictions ease or supply capacity expands.");
  const conditions = [premise, trigger, counterSignal];

  const channels: ImpactChannel[] = input.personalContext.exposures.map((exposure, index) => {
    const countervailing = index === input.personalContext.exposures.length - 1 && index > 0;
    const draft: Omit<ImpactChannel, "channelId"> = {
      mechanism: countervailing
        ? "Easing restrictions could reduce the same input-cost and supply pressure."
        : mechanismFor(exposure.dimension),
      evidenceContextItemIds: [evidenceIds[index % evidenceIds.length]!],
      exposureIds: [exposure.exposureId],
      relation: countervailing ? "countervailing" : "conditional",
      direction: countervailing ? "decreases" : "increases",
      conditionIds: [countervailing ? counterSignal.conditionId : trigger.conditionId],
      uncertainty: {
        posture: "material",
        statement: "The realized effect depends on the stated condition and actual exposure structure.",
        unknowns: ["Pass-through timing is not established by the fixture."],
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
      direction: related.some(({ relation }) => relation === "countervailing")
        ? "decreases"
        : "increases",
      epistemicType: "inference",
      conditionIds: related.flatMap(({ conditionIds }) => conditionIds),
      uncertainty: {
        posture: "material",
        statement: "This assessment is conditional and not a measured magnitude.",
        unknowns: ["The fixture supplies no calibrated impact magnitude."],
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
    expectedDirection: channels.some(({ relation }) => relation === "countervailing")
      ? "mixed"
      : "increases",
    uncertainty: {
      posture: "material",
      statement: "The scenario is a conditional branch, not a probability forecast.",
      unknowns: ["Policy implementation and FX paths may diverge."],
    },
  };
  const scenario = { ...scenarioDraft, scenarioId: createImpactScenarioId(scenarioDraft) };
  return {
    conditions,
    channels,
    assessments,
    scenarios: [scenario],
    unknowns: ["No calibrated probability or magnitude is available."],
    limitations: ["This fixture is explanatory and does not recommend an action."],
  };
}

function condition(
  kind: ImpactCondition["kind"],
  statement: string,
): ImpactCondition {
  const draft = { kind, statement };
  return { ...draft, conditionId: createImpactConditionId(draft) };
}

function mechanismFor(dimension: string): string {
  switch (dimension) {
    case "currency":
      return "An FX move can translate the KRW valuation of the explicit currency exposure.";
    case "industry":
      return "Supply constraints can affect input availability for the explicit industry exposure.";
    case "geography":
      return "Downstream production effects can reach the explicitly supplied geographic exposure.";
    default:
      return "The documented transmission path can reach the explicitly supplied exposure.";
  }
}

function evidenceDocuments(): SourceDocument[] {
  return [
    {
      id: "document:semiconductor-policy",
      sourceId: "source:official",
      documentType: "GovernmentDocument",
      canonicalUrl: "https://agency.example/semiconductor-policy",
      title: "Semiconductor policy restriction",
      languageCode: "en",
      publishedAt: NOW,
      retrievedAt: NOW,
      authorNames: ["Agency"],
      contentText: "The semiconductor policy restricts Taiwan supply and may constrain downstream Korean production inputs.",
      entityIds: [],
      topicIds: [],
      eventIds: ["event:semiconductor-policy"],
    },
    {
      id: "document:fx-conditions",
      sourceId: "source:statistics",
      documentType: "StatisticalDataset",
      canonicalUrl: "https://statistics.example/fx-conditions",
      title: "USD KRW valuation conditions",
      languageCode: "en",
      publishedAt: NOW,
      retrievedAt: NOW,
      authorNames: ["Statistics Office"],
      contentText: "USD KRW exchange-rate changes alter the KRW translation value of USD-denominated assets.",
      entityIds: [],
      topicIds: [],
      eventIds: ["event:semiconductor-policy"],
    },
  ];
}
