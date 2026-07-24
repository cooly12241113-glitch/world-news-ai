import { BriefingContractCompiler } from "../../briefing";
import type { BriefingQuestion } from "../../briefing";
import type { SourceDocument, EvidenceLink, DataPoint } from "../../domain";
import type { ContextBuildRequest } from "../models";

export const now = "2026-07-24T00:00:00.000Z";

export function question(text = "금리 인상이 시장에 미치는 영향은?"): BriefingQuestion {
  return {
    id: "question-1", text, language: "ko", submittedAt: now,
    referencedEventIds: ["event-1"], referencedEntityIds: [],
    personalizationRequested: false,
  };
}

export function request(
  records: ContextBuildRequest["callerProvidedRecords"] = [],
  text?: string,
): ContextBuildRequest {
  const q = question(text);
  const compiled = new BriefingContractCompiler({
    now: () => new Date(now), createId: () => "contract-1",
  }).compile(q);
  if (!compiled.success) throw new Error(compiled.error.message);
  return {
    question: q, briefingContract: compiled.contract,
    referencedEventIds: ["event-1"], referencedDossierIds: [],
    callerProvidedRecords: records, corpusRevision: "corpus-1",
    requestedAt: now, retrievalPolicyVersion: "retrieval-v1",
  };
}

export function document(overrides: Partial<SourceDocument> = {}): SourceDocument {
  return {
    id: "document-1", sourceId: "source-1", documentType: "GovernmentDocument",
    canonicalUrl: "https://example.gov/report", title: "금리 인상 공식 보고서",
    languageCode: "ko", publishedAt: now, retrievedAt: now, authorNames: ["Agency"],
    contentText: "금리 인상은 시장 유동성과 자금 조달 비용에 영향을 준다.",
    entityIds: [], topicIds: [], eventIds: ["event-1"], ...overrides,
  };
}

export function contradiction(): EvidenceLink {
  return {
    id: "evidence-1", sourceDocumentId: "document-2", targetType: "claim",
    targetId: "claim-1", relation: "contradicts",
    excerpt: "일부 지표는 시장 영향이 제한적임을 보여준다.",
    confidence: "high", createdAt: now,
  };
}

export function dataPoint(): DataPoint {
  return {
    id: "data-1", sourceDocumentId: "document-3", name: "기준금리",
    value: 3.5, unit: "%", observedAt: now, confidence: "high",
    entityIds: [], eventIds: ["event-1"],
  };
}
