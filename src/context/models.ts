import type {
  Claim,
  DataPoint,
  Entity,
  EvidenceLink,
  SourceDocument,
} from "../domain";
import type { BriefingContract, BriefingDomain, BriefingQuestion } from "../briefing";

export type CallerProvidedRecord =
  | SourceDocument
  | Claim
  | EvidenceLink
  | DataPoint
  | Entity;

export interface ContextBuildRequest {
  question: BriefingQuestion;
  briefingContract: BriefingContract;
  referencedEventIds: string[];
  referencedDossierIds: string[];
  callerProvidedRecords: CallerProvidedRecord[];
  corpusRevision: string;
  requestedAt: string;
  retrievalPolicyVersion: string;
}

export type RequiredContextSection =
  | "direct-answer-evidence" | "current-situation" | "necessary-background"
  | "explanation-path" | "supporting-evidence" | "contradicting-evidence"
  | "timeline" | "quantitative-data" | "open-questions"
  | "next-verification-signals" | "claim-origin" | "source-quality"
  | "unresolved-gaps" | "trigger-event" | "transmission-mechanism"
  | "affected-domains" | "counter-factors" | "current-state" | "drivers"
  | "assumptions" | "contradicting-signals" | "verification-signals";

export interface RetrievalPlan {
  id: string;
  questionId: string;
  contractId: string;
  searchTerms: string[];
  exactPhrases: string[];
  targetEventIds: string[];
  targetEntityIds: string[];
  targetLocations: string[];
  targetDomains: BriefingDomain[];
  temporalWindow: string;
  requiredEvidenceCategories: EvidenceCategory[];
  requiredContextSections: RequiredContextSection[];
  preferredSourceTypes: string[];
  contradictionRequirement: boolean;
  primarySourceRequirement: boolean;
  dataRequirement: boolean;
  maximumCandidates: number;
  maximumSelectedItems: number;
  maximumCharacters: number;
  maximumExcerpts: number;
  stopConditions: string[];
  warnings: string[];
  policyVersion: string;
  fingerprint: string;
}

export type EvidenceRecordType =
  | "dossier-section" | "source-document" | "claim" | "evidence-link"
  | "data-point" | "entity" | "open-question" | "timeline-item";

export interface CandidateProvenance {
  canonicalIdentity?: string;
  fingerprint?: string;
  revisionNumber?: number;
  selectedCapabilityId?: string;
  observedAt: string;
}

export interface EvidenceCandidate {
  id: string;
  recordType: EvidenceRecordType;
  recordId: string;
  eventIds: string[];
  dossierIds: string[];
  sourceDocumentIds: string[];
  title: string;
  searchableText: string;
  publishedAt?: string;
  retrievedAt?: string;
  sourceType: string;
  sourceName: string;
  documentType?: string;
  language: string;
  locations: string[];
  domains: BriefingDomain[];
  entityIds: string[];
  claimIds: string[];
  evidenceLinkIds: string[];
  dataPointIds: string[];
  primarySource: boolean;
  structuredMetadata: Record<string, string | number | boolean>;
  provenance: CandidateProvenance;
}

export interface CandidateScore {
  totalScore: number;
  lexicalScore: number;
  eventMatchScore: number;
  entityMatchScore: number;
  geographicScore: number;
  temporalScore: number;
  domainScore: number;
  evidenceQualityScore: number;
  diversityScore: number;
  freshnessScore: number;
  penalties: string[];
  reasons: string[];
  scorerVersion: string;
}

export type EvidenceCategory =
  | "primary-official" | "primary-corporate" | "primary-legal"
  | "primary-statistical" | "secondary-reporting" | "secondary-analysis"
  | "attributed-claim" | "contradicting-evidence" | "contextual-evidence"
  | "unresolved";

export interface DiversityPolicy {
  maximumItemsPerSource: number;
  maximumItemsPerDocument: number;
  minimumIndependentSources: number;
  reserveForPrimarySources: number;
  reserveForContradictingEvidence: number;
  reserveForDataPoints: number;
  allowSamePublisherRevisions: boolean;
}

export interface SourceExcerpt {
  id: string;
  sourceDocumentId: string;
  text: string;
  startOffset?: number;
  endOffset?: number;
  offsetPrecision: "exact" | "normalized" | "approximate" | "unavailable";
  sectionHint: string;
  matchedTerms: string[];
  extractionReason: string;
  excerptHash: string;
  characterCount: number;
  provenance: CandidateProvenance;
  warnings: string[];
}

export interface ContextBudget {
  maximumCharacters: number;
  maximumItems: number;
  maximumDocuments: number;
  maximumExcerpts: number;
  maximumItemsPerSection: number;
  maximumItemsPerSource: number;
  reservedPrimarySourceItems: number;
  reservedContradictingEvidenceItems: number;
  reservedDataPointItems: number;
}

export type ContextSectionName =
  | "directEvidence" | "currentSituation" | "background"
  | "supportingEvidence" | "contradictingEvidence" | "timeline"
  | "quantitativeData" | "openQuestions" | "verificationSignals";

export interface ContextItem {
  id: string;
  itemType: EvidenceRecordType;
  recordId: string;
  excerptId?: string;
  relevanceScore: number;
  evidenceCategory: EvidenceCategory;
  supportsClaimIds: string[];
  contradictsClaimIds: string[];
  sourceDocumentIds: string[];
  dataPointIds: string[];
  entityIds: string[];
  locationIds: string[];
  selectionReasons: string[];
  confidence: number;
  provenanceRefs: string[];
}

export interface ContextCoverage {
  overall: number;
  requiredSectionCoverage: number;
  primarySourceCoverage: number;
  independentSourceCoverage: number;
  contradictionCoverage: number;
  quantitativeDataCoverage: number;
  timelineCoverage: number;
  personalizationCoverage: number;
  missingRequiredSections: RequiredContextSection[];
}

export interface EvidenceGap {
  id: string;
  gapType:
    | "missing-primary-source" | "missing-contradicting-evidence"
    | "missing-quantitative-data" | "insufficient-independent-sources"
    | "unresolved-claim" | "stale-evidence" | "missing-user-context"
    | "temporal-gap" | "geographic-gap";
  description: string;
  importance: "low" | "medium" | "high" | "critical";
  requiredEvidenceCategory?: EvidenceCategory;
  relatedClaimIds: string[];
  relatedEntityIds: string[];
  suggestedDiscoveryQuery: string;
  blocking: boolean;
  reasons: string[];
}

export interface ProvenanceRecord {
  provenanceId: string;
  contextItemId: string;
  recordType: EvidenceRecordType;
  recordId: string;
  sourceDocumentId?: string;
  excerptId?: string;
  canonicalIdentity?: string;
  fingerprint?: string;
  revisionNumber?: number;
  selectedCapabilityId?: string;
  observedAt: string;
}

export interface EvidenceContextPackage {
  id: string;
  questionId: string;
  contractId: string;
  retrievalPlanId: string;
  status: "ready" | "partial" | "insufficient-evidence" | "no-relevant-context";
  corpusRevision: string;
  sections: Record<ContextSectionName, string[]>;
  selectedItems: ContextItem[];
  excerpts: SourceExcerpt[];
  excludedCandidateSummary: {
    total: number;
    duplicates: number;
    budget: number;
    lowRelevance: number;
  };
  coverage: ContextCoverage;
  evidenceGaps: EvidenceGap[];
  openQuestions: string[];
  provenanceIndex: ProvenanceRecord[];
  warnings: string[];
  createdAt: string;
  policyVersion: string;
  fingerprint: string;
}

export type ContextBuildErrorCode =
  | "CONTRACT_NOT_READY" | "INVALID_CONTEXT_REQUEST" | "RETRIEVAL_PLAN_FAILED"
  | "CANDIDATE_PROVIDER_FAILED" | "RECORD_NOT_FOUND" | "BROKEN_REFERENCE"
  | "EXCERPT_EXTRACTION_FAILED" | "CONTEXT_BUDGET_INVALID"
  | "CONTEXT_VALIDATION_FAILED" | "PROVENANCE_INCOMPLETE"
  | "CONTEXT_BUILD_FAILED";

export type ContextBuildResult =
  | {
      success: true;
      outcome: EvidenceContextPackage["status"];
      contextPackage: EvidenceContextPackage;
      warnings: string[];
    }
  | {
      success: false;
      error: {
        code: ContextBuildErrorCode;
        stage: string;
        message: string;
        retryable: boolean;
      };
    };

export interface EvidenceCandidateProvider {
  readonly id: string;
  findCandidates(plan: RetrievalPlan, request: ContextBuildRequest): EvidenceCandidate[];
}

export interface EvidenceContextPackageRepository {
  save(contextPackage: EvidenceContextPackage): void;
  findByFingerprint(fingerprint: string): EvidenceContextPackage | undefined;
}
