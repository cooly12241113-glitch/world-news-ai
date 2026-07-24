import type {
  Claim,
  DataPoint,
  Entity,
  EvidenceLink,
  SourceDocument,
} from "../domain";
import type { EventDossierRepository } from "../dossier";
import type {
  CallerProvidedRecord,
  ContextBuildRequest,
  EvidenceCandidate,
  EvidenceCandidateProvider,
  RetrievalPlan,
} from "./models";

function isDocument(record: CallerProvidedRecord): record is SourceDocument {
  return "documentType" in record;
}
function isClaim(record: CallerProvidedRecord): record is Claim {
  return "statement" in record;
}
function isEvidence(record: CallerProvidedRecord): record is EvidenceLink {
  return "relation" in record;
}
function isDataPoint(record: CallerProvidedRecord): record is DataPoint {
  return "value" in record && "name" in record;
}
function isEntity(record: CallerProvidedRecord): record is Entity {
  return "canonicalName" in record;
}

function primaryDocument(documentType: SourceDocument["documentType"]): boolean {
  return ["GovernmentDocument", "StatisticalDataset", "LegalDocument", "CorporateDisclosure"].includes(documentType);
}

function safeCanonicalIdentity(value: string): string {
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function candidateFromRecord(
  record: CallerProvidedRecord,
  observedAt: string,
): EvidenceCandidate {
  if (isDocument(record)) {
    return {
      id: `source-document:${record.id}`,
      recordType: "source-document",
      recordId: record.id,
      eventIds: record.eventIds,
      dossierIds: [],
      sourceDocumentIds: [record.id],
      title: record.title,
      searchableText: [record.summary, record.contentText].filter(Boolean).join("\n"),
      publishedAt: record.publishedAt,
      retrievedAt: record.retrievedAt,
      sourceType: record.documentType,
      sourceName: record.sourceId,
      documentType: record.documentType,
      language: record.languageCode,
      locations: [],
      domains: [],
      entityIds: record.entityIds,
      claimIds: [],
      evidenceLinkIds: [],
      dataPointIds: [],
      primarySource: primaryDocument(record.documentType),
      structuredMetadata: {},
      provenance: { canonicalIdentity: safeCanonicalIdentity(record.canonicalUrl), observedAt },
    };
  }
  if (isClaim(record)) {
    return {
      id: `claim:${record.id}`, recordType: "claim", recordId: record.id,
      eventIds: record.eventIds, dossierIds: [], sourceDocumentIds: [record.sourceDocumentId],
      title: "Claim", searchableText: record.statement, publishedAt: record.extractedAt,
      sourceType: "claim", sourceName: record.sourceDocumentId, language: "und",
      locations: [], domains: [], entityIds: record.attributedEntityIds, claimIds: [record.id],
      evidenceLinkIds: [], dataPointIds: [], primarySource: false,
      structuredMetadata: { confidence: record.confidence },
      provenance: { observedAt },
    };
  }
  if (isEvidence(record)) {
    return {
      id: `evidence-link:${record.id}`, recordType: "evidence-link", recordId: record.id,
      eventIds: record.targetType === "event" ? [record.targetId] : [], dossierIds: [],
      sourceDocumentIds: [record.sourceDocumentId], title: `Evidence: ${record.relation}`,
      searchableText: [record.locator, record.excerpt].filter(Boolean).join("\n"),
      sourceType: "evidence", sourceName: record.sourceDocumentId, language: "und",
      locations: [], domains: [], entityIds: [],
      claimIds: record.targetType === "claim" ? [record.targetId] : [],
      evidenceLinkIds: [record.id],
      dataPointIds: record.targetType === "data_point" ? [record.targetId] : [],
      primarySource: false,
      structuredMetadata: { relation: record.relation, confidence: record.confidence },
      provenance: { observedAt },
    };
  }
  if (isDataPoint(record)) {
    return {
      id: `data-point:${record.id}`, recordType: "data-point", recordId: record.id,
      eventIds: record.eventIds, dossierIds: [], sourceDocumentIds: [record.sourceDocumentId],
      title: record.name, searchableText: `${record.name}: ${record.value}${record.unit ? ` ${record.unit}` : ""}`,
      publishedAt: record.observedAt, sourceType: "data", sourceName: record.sourceDocumentId,
      language: "und", locations: [], domains: [], entityIds: record.entityIds,
      claimIds: [], evidenceLinkIds: [], dataPointIds: [record.id], primarySource: false,
      structuredMetadata: { value: record.value, ...(record.unit ? { unit: record.unit } : {}) },
      provenance: { observedAt },
    };
  }
  if (isEntity(record)) {
    return {
      id: `entity:${record.id}`, recordType: "entity", recordId: record.id,
      eventIds: [], dossierIds: [], sourceDocumentIds: [], title: record.canonicalName,
      searchableText: [record.canonicalName, ...record.aliases, record.description].filter(Boolean).join("\n"),
      sourceType: "entity", sourceName: "domain", language: "und",
      locations: record.type === "location" || record.type === "country" ? [record.canonicalName] : [],
      domains: [], entityIds: [record.id], claimIds: [], evidenceLinkIds: [],
      dataPointIds: [], primarySource: false, structuredMetadata: { entityType: record.type },
      provenance: { observedAt },
    };
  }
  throw new Error("Unsupported caller-provided record.");
}

export class InMemoryEvidenceCandidateProvider implements EvidenceCandidateProvider {
  readonly id = "in-memory-evidence-candidates";
  constructor(private readonly candidates: EvidenceCandidate[] = []) {}

  findCandidates(plan: RetrievalPlan, request: ContextBuildRequest): EvidenceCandidate[] {
    const provided = request.callerProvidedRecords.map((record) =>
      candidateFromRecord(record, request.requestedAt));
    return [...this.candidates, ...provided]
      .filter((candidate) =>
        plan.targetEventIds.length === 0 ||
        candidate.eventIds.some((id) => plan.targetEventIds.includes(id)) ||
        candidate.searchableText.length > 0)
      .slice(0, plan.maximumCandidates);
  }
}

export class RepositoryBackedEvidenceCandidateProvider implements EvidenceCandidateProvider {
  readonly id = "repository-backed-evidence-candidates";
  constructor(
    private readonly dossiers: EventDossierRepository,
    private readonly records: EvidenceCandidateProvider = new InMemoryEvidenceCandidateProvider(),
  ) {}

  findCandidates(plan: RetrievalPlan, request: ContextBuildRequest): EvidenceCandidate[] {
    const dossierIds = new Set(request.referencedDossierIds);
    const dossiers = [
      ...request.referencedEventIds.map((id) => this.dossiers.findLatestByEventId(id)),
      ...request.referencedDossierIds.map((id) => this.dossiers.findByDossierId(id)),
    ].filter((dossier) => dossier !== undefined);
    const dossierCandidates: EvidenceCandidate[] = [];
    for (const dossier of dossiers) {
      dossierIds.add(dossier.id);
      for (const statement of dossier.statements) {
        dossierCandidates.push({
          id: `dossier-statement:${dossier.id}:${statement.id}`,
          recordType: "dossier-section", recordId: statement.id,
          eventIds: [dossier.eventId], dossierIds: [dossier.id],
          sourceDocumentIds: statement.sourceDocumentIds, title: dossier.title,
          searchableText: statement.text, publishedAt: statement.createdAt,
          retrievedAt: dossier.updatedAt, sourceType: "event-dossier",
          sourceName: dossier.id, language: "und", locations: [], domains: [],
          entityIds: dossier.entityIds, claimIds: statement.claimIds,
          evidenceLinkIds: statement.evidenceLinkIds, dataPointIds: statement.dataPointIds,
          primarySource: false,
          structuredMetadata: {
            statementType: statement.statementType,
            confidence: statement.confidence.score,
          },
          provenance: {
            fingerprint: dossier.semanticFingerprint,
            revisionNumber: dossier.revisionNumber,
            observedAt: dossier.updatedAt,
          },
        });
      }
    }
    return [...dossierCandidates, ...this.records.findCandidates(plan, request)]
      .slice(0, plan.maximumCandidates);
  }
}
