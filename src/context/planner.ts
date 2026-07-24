import { createSemanticFingerprint } from "../briefing";
import type { BriefingQuestion, QuestionIntent } from "../briefing";
import type { ContextBuildRequest, RequiredContextSection, RetrievalPlan } from "./models";

const COMMON: RequiredContextSection[] = [
  "direct-answer-evidence", "current-situation", "necessary-background",
  "supporting-evidence", "open-questions", "next-verification-signals",
];
const INTENT_SECTIONS: Partial<Record<QuestionIntent, RequiredContextSection[]>> = {
  "fact-verification": ["claim-origin", "supporting-evidence", "contradicting-evidence", "source-quality", "unresolved-gaps"],
  "impact-analysis": ["trigger-event", "transmission-mechanism", "affected-domains", "quantitative-data", "counter-factors"],
  "forecast": ["current-state", "drivers", "assumptions", "contradicting-signals", "verification-signals"],
  "causal-explanation": ["direct-answer-evidence", "necessary-background", "explanation-path", "contradicting-evidence"],
  comparison: ["direct-answer-evidence", "supporting-evidence", "quantitative-data", "source-quality"],
  "personalized-impact": ["direct-answer-evidence", "affected-domains", "quantitative-data", "counter-factors"],
};

const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "of", "to", "and", "or", "what", "why",
  "how", "이", "그", "저", "은", "는", "이", "가", "을", "를", "에", "의",
  "왜", "어떻게", "무엇", "인가", "해줘",
]);

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function terms(question: BriefingQuestion): string[] {
  return unique(
    question.text.toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .split(/\s+/u)
      .filter((term) => term.length > 1 && !STOP_WORDS.has(term)),
  ).slice(0, 24);
}

export class RetrievalPlanner {
  constructor(private readonly createId: () => string = () => crypto.randomUUID()) {}

  createPlan(request: ContextBuildRequest): RetrievalPlan {
    const contract = request.briefingContract;
    const analysis = contract.intentAnalysis;
    const requiredContextSections = unique([
      ...(INTENT_SECTIONS[analysis.primaryIntent] ?? COMMON),
      ...analysis.secondaryIntents.flatMap((intent) => INTENT_SECTIONS[intent] ?? []),
    ]) as RequiredContextSection[];
    const searchTerms = unique([
      ...terms(request.question),
      ...analysis.targetSubjects,
      ...analysis.targetOutcomes.flatMap((value) => value.toLocaleLowerCase().split(/\s+/u)),
      ...analysis.mentionedEntities,
      ...analysis.mentionedLocations,
      ...analysis.domainSignals,
    ]);
    const semantic = {
      question: request.question.text.trim().replace(/\s+/g, " "),
      contractFingerprint: contract.semanticFingerprint,
      searchTerms: [...searchTerms].sort(),
      exactPhrases: [request.question.text.trim()],
      eventIds: unique([...request.referencedEventIds, ...request.question.referencedEventIds]).sort(),
      entityIds: [...request.question.referencedEntityIds].sort(),
      locations: unique([
        ...contract.geographicScope.focalLocations,
        ...contract.geographicScope.userRelevantLocations,
      ]).sort(),
      domains: [...contract.domainScope].sort(),
      requiredContextSections: [...requiredContextSections].sort(),
      policyVersion: request.retrievalPolicyVersion,
    };
    return {
      id: this.createId(),
      questionId: request.question.id,
      contractId: contract.id,
      searchTerms,
      exactPhrases: [request.question.text.trim()],
      targetEventIds: semantic.eventIds,
      targetEntityIds: semantic.entityIds,
      targetLocations: semantic.locations,
      targetDomains: contract.domainScope,
      temporalWindow: contract.timeScope.forecastHorizon ?? contract.timeScope.focalPeriod,
      requiredEvidenceCategories: [
        ...(contract.evidencePolicy.requirePrimarySourcesWhenAvailable ? ["primary-official" as const] : []),
        ...(contract.evidencePolicy.requireContradictingEvidence ? ["contradicting-evidence" as const] : []),
        "contextual-evidence",
      ],
      requiredContextSections,
      preferredSourceTypes: ["official", "legal", "statistical", "reporting", "analysis"],
      contradictionRequirement: contract.evidencePolicy.requireContradictingEvidence,
      primarySourceRequirement: contract.evidencePolicy.requirePrimarySourcesWhenAvailable,
      dataRequirement: requiredContextSections.includes("quantitative-data"),
      maximumCandidates: Math.max(contract.stopConditions.maximumEvidenceItems * 4, 40),
      maximumSelectedItems: contract.stopConditions.maximumEvidenceItems,
      maximumCharacters: contract.stopConditions.maximumEvidenceItems * 800,
      maximumExcerpts: Math.min(contract.stopConditions.maximumEvidenceItems, contract.visualPolicy.maximumScenes * 3),
      stopConditions: [
        "answer-goal-met", "time-boundary-reached", "geographic-boundary-reached",
        "evidence-below-threshold",
      ],
      warnings: [],
      policyVersion: request.retrievalPolicyVersion,
      fingerprint: createSemanticFingerprint(semantic),
    };
  }
}
