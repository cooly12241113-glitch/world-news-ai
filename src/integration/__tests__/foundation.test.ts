import { describe, expect, it } from "vitest";
import { BriefingContractCompiler } from "../../briefing";
import type { BriefingQuestion } from "../../briefing";
import { EvidenceContextBuilder } from "../../context";
import {
  InMemoryEvidenceCandidateProvider,
  RepositoryBackedEvidenceCandidateProvider,
  RetrievalPlanner,
  candidateFromRecord,
} from "../../context";
import type { ContextBuildRequest, EvidenceCandidate } from "../../context";
import { EventDossierBuilder } from "../../dossier";
import type { EventDossier } from "../../dossier";
import type {
  Claim,
  DataPoint,
  Entity,
  Event,
  EvidenceLink,
  SourceDocument,
} from "../../domain";
import { IngestionPipeline } from "../../ingestion";
import { InMemoryPersistenceAdapter, PersistentIngestionService } from "../../persistence";

const TIME = "2026-07-25T00:00:00.000Z";
const EVENT_ID = "event-foundation";

interface FoundationFixture {
  question: BriefingQuestion;
  contractResult: ReturnType<BriefingContractCompiler["compile"]>;
  contextRequest?: ContextBuildRequest;
  builder?: EvidenceContextBuilder;
  sourceDocument?: SourceDocument;
  dossier?: EventDossier;
  revisionNumber?: number;
  sourceFingerprint?: string;
}

async function foundationFixture(
  text: string,
  options: {
    userLocations?: string[];
    personalizationRequested?: boolean;
    includeContradiction?: boolean;
    includeData?: boolean;
  } = {},
): Promise<FoundationFixture> {
  let sequence = 0;
  const now = () => new Date(TIME);
  const persistence = new InMemoryPersistenceAdapter();
  const service = new PersistentIngestionService(
    new IngestionPipeline({ minimumBodyLength: 40 }),
    persistence,
    { now, createId: () => `persist-${++sequence}` },
  );
  const rawBody =
    "정부는 물가 안정과 시장 신뢰 회복을 정책 발표의 공식 배경으로 제시했다. " +
    "보고서는 금리와 무역 경로를 통한 한국 경제 영향을 함께 설명한다.";
  const persisted = await service.ingest({
    kind: "content",
    content: rawBody,
    mediaType: "text/plain",
    sourceUrl: "https://government.example/policy?id=foundation&utm_source=audit",
    retrievedAt: TIME,
    hints: {
      title: "정책 발표 공식 보고서",
      expectedLanguage: "ko",
      expectedDocumentType: "GovernmentDocument",
      sourceName: "Government Office",
    },
  });
  if (!persisted.success) throw new Error(persisted.error.code);
  const stored = persistence.repositories.sourceDocuments.findByStorageId(persisted.documentId);
  if (!stored) throw new Error("stored document missing");
  const primary: SourceDocument = {
    ...stored.sourceDocument,
    eventIds: [EVENT_ID],
    entityIds: ["entity-korea"],
  };
  const reporting: SourceDocument = {
    ...primary,
    id: "document-reporting",
    sourceId: "source-reporting",
    documentType: "NewsArticle",
    canonicalUrl: "https://news.example/policy-analysis",
    title: "정책 영향 독립 보도",
    contentText: "독립 보도는 정책 영향이 산업별로 다르며 단기 효과가 제한될 수 있다고 설명한다.",
  };
  const entity: Entity = {
    id: "entity-korea", type: "country", canonicalName: "한국", aliases: ["대한민국"],
    countryCode: "KR",
  };
  const claim: Claim = {
    id: "claim-policy", sourceDocumentId: primary.id,
    statement: "정부는 해당 기업 제재를 확정했다.",
    confidence: "medium", attributedEntityIds: [entity.id],
    eventIds: [EVENT_ID], extractedAt: TIME,
  };
  const supporting: EvidenceLink = {
    id: "evidence-support", sourceDocumentId: primary.id,
    targetType: "claim", targetId: claim.id, relation: "supports",
    excerpt: "정부는 정책 발표의 공식 배경을 제시했다.",
    confidence: "high", createdAt: TIME,
  };
  const contradicting: EvidenceLink = {
    id: "evidence-contradict", sourceDocumentId: reporting.id,
    targetType: "claim", targetId: claim.id, relation: "contradicts",
    excerpt: "독립 보도는 제재의 최종 확정 여부가 남아 있다고 설명한다.",
    confidence: "medium", createdAt: TIME,
  };
  const data: DataPoint = {
    id: "data-rate", sourceDocumentId: primary.id, name: "기준금리",
    value: 3.5, unit: "%", observedAt: TIME, confidence: "high",
    entityIds: [entity.id], eventIds: [EVENT_ID],
  };
  const event: Event = {
    id: EVENT_ID, title: "정책 발표", summary: "정부 정책 발표",
    status: "confirmed", confidence: "high", startedAt: TIME,
    articleIds: [], entityIds: [entity.id], topicIds: [],
    locationEntityIds: [entity.id], createdAt: TIME, updatedAt: TIME,
  };
  const dossierResult = new EventDossierBuilder(now, () => "dossier-foundation").build({
    event,
    sourceDocuments: [primary, reporting],
    claims: [claim],
    evidenceLinks: [supporting, ...(options.includeContradiction ? [contradicting] : [])],
    dataPoints: options.includeData ? [data] : [],
    entities: [entity],
    statements: [{
      id: "statement-policy",
      text: "공식 보고서는 정책 배경을 물가 안정과 시장 신뢰로 설명한다.",
      statementType: "attributed-claim",
      confidence: {
        score: 0.6, level: "high", reasons: ["claim and evidence references"],
        evidenceCount: 1, independentSourceCount: 1, primarySourceCount: 1,
        contradictionCount: options.includeContradiction ? 1 : 0,
        assessedAt: TIME, assessedBy: "system",
      },
      sourceDocumentIds: [primary.id], claimIds: [claim.id],
      evidenceLinkIds: [supporting.id], dataPointIds: [],
      authoredBy: "system", createdAt: TIME,
    }],
    openQuestions: [],
  });
  if (!dossierResult.success) throw new Error(dossierResult.error.code);
  const dossier = dossierResult.revision.snapshot;
  const question: BriefingQuestion = {
    id: `question-${sequence}`, text, language: "ko", submittedAt: TIME,
    referencedEventIds: [EVENT_ID], referencedEntityIds: [entity.id],
    userProvidedContext: options.userLocations ? { locations: options.userLocations } : undefined,
    personalizationRequested: options.personalizationRequested ?? false,
  };
  const compiler = new BriefingContractCompiler({
    now, createId: () => "contract-foundation",
  });
  const contractResult = compiler.compile(question);
  if (!contractResult.success || contractResult.outcome !== "ready") {
    return { question, contractResult, sourceDocument: primary, dossier };
  }
  const primaryCandidate = candidateFromRecord(primary, TIME);
  const persistenceCandidate: EvidenceCandidate = {
    ...primaryCandidate,
    provenance: {
      canonicalIdentity: primaryCandidate.provenance.canonicalIdentity,
      fingerprint: persisted.fingerprint,
      revisionNumber: persisted.revisionNumber,
      selectedCapabilityId: "plain-text",
      observedAt: TIME,
    },
  };
  const baseProvider = new InMemoryEvidenceCandidateProvider([persistenceCandidate]);
  const dossierRepository = {
    findLatestByEventId: (id: string) => id === EVENT_ID ? dossier : undefined,
    findByDossierId: (id: string) => id === dossier.id ? dossier : undefined,
  };
  const provider = new RepositoryBackedEvidenceCandidateProvider(dossierRepository, baseProvider);
  const builder = new EvidenceContextBuilder({
    provider, now, createId: () => "context-foundation",
    planner: new RetrievalPlanner(() => "plan-foundation"),
  });
  const contextRequest: ContextBuildRequest = {
    question, briefingContract: contractResult.contract,
    referencedEventIds: [EVENT_ID], referencedDossierIds: [dossier.id],
    callerProvidedRecords: [
      reporting, claim, supporting,
      ...(options.includeContradiction ? [contradicting] : []),
      ...(options.includeData ? [data] : []),
      entity,
    ],
    corpusRevision: "foundation-corpus-1", requestedAt: TIME,
    retrievalPolicyVersion: "foundation-retrieval-v1",
  };
  return {
    question, contractResult, contextRequest, builder, sourceDocument: primary,
    dossier, revisionNumber: persisted.revisionNumber,
    sourceFingerprint: persisted.fingerprint,
  };
}

describe("Milestone 01 intelligence foundation integration", () => {
  it("Scenario A: carries causal evidence from raw content to a deterministic context package", async () => {
    const fixture = await foundationFixture("왜 이 정책은 발표되었는가?");
    if (!fixture.contractResult.success || !fixture.builder || !fixture.contextRequest ||
        !fixture.sourceDocument) throw new Error("fixture failed");
    expect(fixture.contractResult.intentAnalysis.primaryIntent).toBe("causal-explanation");
    expect(fixture.contractResult.contract.timeScope.historicalStartPolicy).toBe("direct-trigger");
    const first = fixture.builder.build(fixture.contextRequest);
    const second = fixture.builder.build({
      ...fixture.contextRequest,
      requestedAt: "2030-01-01T00:00:00.000Z",
      callerProvidedRecords: [...fixture.contextRequest.callerProvidedRecords].reverse(),
    });
    if (!first.success || !second.success) throw new Error("context failed");
    expect(first.contextPackage.fingerprint).toBe(second.contextPackage.fingerprint);
    expect(first.contextPackage.selectedItems.length).toBeGreaterThan(0);
    const sourceItem = first.contextPackage.selectedItems.find((item) =>
      item.recordId === fixture.sourceDocument?.id);
    const provenance = first.contextPackage.provenanceIndex.find((record) =>
      record.contextItemId === sourceItem?.id);
    const excerpt = first.contextPackage.excerpts.find((entry) =>
      entry.id === sourceItem?.excerptId);
    expect(provenance).toMatchObject({
      sourceDocumentId: fixture.sourceDocument.id,
      fingerprint: fixture.sourceFingerprint,
      revisionNumber: fixture.revisionNumber,
      selectedCapabilityId: "plain-text",
    });
    expect(fixture.sourceDocument.contentText).toContain(excerpt?.text.replace(/…$/, "") ?? "");
  });

  it("Scenario B: scopes Korean economic impact and exposes missing evidence", async () => {
    const fixture = await foundationFixture(
      "이 사건은 한국 경제와 무역에 어떤 영향을 줄 수 있는가?",
      { userLocations: ["한국"], includeData: true },
    );
    if (!fixture.contractResult.success || !fixture.builder || !fixture.contextRequest) {
      throw new Error("fixture failed");
    }
    expect(fixture.contractResult.intentAnalysis.primaryIntent).toBe("impact-analysis");
    expect(fixture.contractResult.contract.geographicScope.focalLocations).toContain("한국");
    expect(fixture.contractResult.contract.domainScope).toEqual(
      expect.arrayContaining(["macroeconomics", "trade"]),
    );
    expect(fixture.contractResult.contract.visualPolicy.mapUsage).not.toBe("required");
    const result = fixture.builder.build(fixture.contextRequest);
    if (!result.success) throw new Error(result.error.message);
    expect(["ready", "partial", "insufficient-evidence"]).toContain(result.outcome);
    expect(
      result.contextPackage.sections.quantitativeData.length > 0 ||
      result.contextPackage.evidenceGaps.some((gap) => gap.gapType === "missing-quantitative-data"),
    ).toBe(true);
  });

  it("Scenario C: keeps verification support and contradiction separate without asserting a verdict", async () => {
    const fixture = await foundationFixture(
      "정부가 해당 기업 제재를 확정했다는 주장은 사실인가?",
      { includeContradiction: true },
    );
    if (!fixture.contractResult.success || !fixture.builder || !fixture.contextRequest) {
      throw new Error("fixture failed");
    }
    expect(fixture.contractResult.intentAnalysis.primaryIntent).toBe("fact-verification");
    const plan = new RetrievalPlanner(() => "audit-plan").createPlan(fixture.contextRequest);
    expect(plan.requiredContextSections).toContain("claim-origin");
    const result = fixture.builder.build(fixture.contextRequest);
    if (!result.success) throw new Error(result.error.message);
    expect(result.contextPackage.sections.supportingEvidence.length).toBeGreaterThan(0);
    expect(result.contextPackage.sections.contradictingEvidence.length).toBeGreaterThan(0);
    expect(result.contextPackage.selectedItems.some((item) =>
      item.evidenceCategory === "attributed-claim")).toBe(true);
  });

  it("Scenario D: stops ambiguous personalization before candidate retrieval", async () => {
    const fixture = await foundationFixture(
      "이것은 내 포트폴리오에 어떻게 될까?",
      { personalizationRequested: true },
    );
    expect(fixture.contractResult).toMatchObject({
      success: true, outcome: "clarification-required",
    });
    if (!fixture.contractResult.success) throw new Error("compile failed");
    let providerCalls = 0;
    const builder = new EvidenceContextBuilder({
      provider: {
        id: "audit-spy",
        findCandidates() { providerCalls += 1; return []; },
      },
    });
    const result = builder.build({
      question: fixture.question,
      briefingContract: fixture.contractResult.contract,
      referencedEventIds: [EVENT_ID], referencedDossierIds: [],
      callerProvidedRecords: [], corpusRevision: "audit",
      requestedAt: TIME, retrievalPolicyVersion: "audit-v1",
    });
    expect(result).toMatchObject({
      success: false, error: { code: "CONTRACT_NOT_READY" },
    });
    expect(providerCalls).toBe(0);
    expect(fixture.contractResult.contract.personalizationPolicy.enabled).toBe(false);
  });
});
