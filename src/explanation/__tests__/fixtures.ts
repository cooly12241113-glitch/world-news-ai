import { BriefingContractCompiler, type BriefingQuestion } from "../../briefing";
import {
  EvidenceContextBuilder,
  InMemoryEvidenceCandidateProvider,
  type EvidenceContextPackage,
} from "../../context";
import type { SourceDocument } from "../../domain";
import {
  RuleBasedExplanationPlanAssembler,
  type ExplanationPlanDraft,
  type ExplanationPlanGenerationInput,
} from "..";

export const now = "2026-07-25T00:00:00.000Z";

export function generationInput(
  text = "Why did the energy supply disruption increase market costs?",
): ExplanationPlanGenerationInput {
  const question: BriefingQuestion = {
    id: "question-1", text, language: "en", submittedAt: now,
    referencedEventIds: ["event-1"], referencedEntityIds: [],
    personalizationRequested: false,
  };
  const compiled = new BriefingContractCompiler({
    now: () => new Date(now), createId: () => "contract-1",
  }).compile(question);
  if (!compiled.success) throw new Error(compiled.error.message);
  const records: SourceDocument[] = [
    document(),
    document({
      id: "document-2", sourceId: "source-2",
      canonicalUrl: "https://news.example/independent",
      documentType: "NewsArticle",
      contentText: "Independent reporting says the disruption constrained supply and raised transport costs.",
    }),
  ];
  const built = new EvidenceContextBuilder({
    provider: new InMemoryEvidenceCandidateProvider(),
    now: () => new Date(now),
    createId: () => "context-1",
  }).build({
    question, briefingContract: compiled.contract,
    referencedEventIds: ["event-1"], referencedDossierIds: [],
    callerProvidedRecords: records, corpusRevision: "corpus-1",
    requestedAt: now, retrievalPolicyVersion: "retrieval-v1",
  });
  if (!built.success) throw new Error(built.error.message);
  return { question, contract: compiled.contract, contextPackage: built.contextPackage };
}

export function document(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: "document-1", sourceId: "source-1", documentType: "GovernmentDocument",
    canonicalUrl: "https://agency.example/report", title: "Energy supply disruption report",
    languageCode: "en", publishedAt: now, retrievedAt: now, authorNames: ["Agency"],
    contentText: "The energy supply disruption constrained supply and increased market transport costs.",
    entityIds: [], topicIds: [], eventIds: ["event-1"], ...overrides,
  };
}

export function assembled(): {
  input: ExplanationPlanGenerationInput;
  plan: ExplanationPlanDraft;
} {
  const input = generationInput();
  let id = 0;
  const result = new RuleBasedExplanationPlanAssembler({
    now: () => new Date(now), createId: () => `plan-${++id}`,
  }).generate(input);
  if (!result.success || !("plan" in result)) throw new Error("plan was not built");
  return { input, plan: result.plan };
}

export function noContext(input = generationInput()): EvidenceContextPackage {
  return {
    ...input.contextPackage,
    status: "no-relevant-context",
    selectedItems: [], excerpts: [], provenanceIndex: [],
    sections: {
      directEvidence: [], currentSituation: [], background: [], supportingEvidence: [],
      contradictingEvidence: [], timeline: [], quantitativeData: [],
      openQuestions: [], verificationSignals: [],
    },
    evidenceGaps: [{
      id: "gap-1", gapType: "missing-primary-source",
      description: "A primary source is missing.", importance: "critical",
      relatedClaimIds: [], relatedEntityIds: [],
      suggestedDiscoveryQuery: "official source", blocking: true,
      reasons: ["Required by contract."],
    }],
    fingerprint: "context-empty-fingerprint",
  };
}
