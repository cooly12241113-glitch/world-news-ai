import type {
  Claim,
  DataPoint,
  Entity,
  Event,
  EvidenceLink,
  SourceDocument,
} from "../domain";

export type DossierStatus =
  | "building"
  | "needs-evidence"
  | "ready"
  | "superseded";
export type StatementType =
  | "confirmed-fact"
  | "attributed-claim"
  | "interpretation"
  | "inference"
  | "forecast"
  | "unknown";
export type StatementAuthor = "human" | "system" | "ai";
export type ConfidenceLevel =
  | "very-low"
  | "low"
  | "medium"
  | "high"
  | "very-high";

export interface DossierConfidence {
  score: number;
  level: ConfidenceLevel;
  reasons: string[];
  evidenceCount: number;
  independentSourceCount: number;
  primarySourceCount: number;
  contradictionCount: number;
  assessedAt: string;
  assessedBy: StatementAuthor;
}

export interface DossierStatement {
  id: string;
  text: string;
  statementType: StatementType;
  confidence: DossierConfidence;
  sourceDocumentIds: string[];
  claimIds: string[];
  evidenceLinkIds: string[];
  dataPointIds: string[];
  assumptions?: string[];
  authoredBy: StatementAuthor;
  createdAt: string;
}

export type ClaimAssessmentStatus =
  | "unverified"
  | "partially-supported"
  | "supported"
  | "disputed"
  | "contradicted"
  | "retracted"
  | "unresolved";

export interface ClaimAssessment {
  claimId: string;
  status: ClaimAssessmentStatus;
  supportingEvidenceLinkIds: string[];
  contradictingEvidenceLinkIds: string[];
  contextualEvidenceLinkIds: string[];
  confidence: DossierConfidence;
}

export interface TimelineItem {
  id: string;
  occurredAt?: string;
  title: string;
  description: string;
  itemType: "event" | "claim" | "document" | "data";
  sourceDocumentIds: string[];
  claimIds: string[];
  confidence: DossierConfidence;
  temporalPrecision: "exact" | "day" | "approximate" | "unknown";
}

export interface Contradiction {
  id: string;
  leftClaimId: string;
  rightClaimId: string;
  contradictionType:
    | "direct"
    | "numerical"
    | "temporal"
    | "attribution"
    | "causal"
    | "contextual";
  severity: "low" | "medium" | "high";
  explanation: string;
  evidenceLinkIds: string[];
  status: "open" | "resolved";
  detectedBy: "rule";
  confidence: DossierConfidence;
  reasons: string[];
}

export interface DataAssessment {
  dataPointId: string;
  relevance: string;
  interpretationType: "fact" | "context" | "trend" | "comparison";
  sourceDocumentIds: string[];
  caveats: string[];
}

export interface OpenQuestion {
  id: string;
  question: string;
  importance: "low" | "medium" | "high" | "critical";
  status: "open" | "resolved";
  requiredEvidenceTypes: string[];
  relatedClaimIds: string[];
  relatedEntityIds: string[];
  createdAt: string;
  resolvedAt?: string;
}

export interface DossierCompleteness {
  overallScore: number;
  requiredCategoryCoverage: number;
  primarySourceCoverage: number;
  claimEvidenceCoverage: number;
  timelineCoverage: number;
  contradictionReviewCoverage: number;
  unresolvedCriticalQuestions: number;
  missingCategories: string[];
  assessedAt: string;
}

export interface DossierSections {
  executiveSummary: {
    kind: "executive-summary";
    statementIds: string[];
    confirmedFactStatementIds: string[];
    majorClaimIds: string[];
    uncertaintySummary: string;
    lastUpdatedAt: string;
  };
  timeline: { kind: "timeline"; items: TimelineItem[] };
  claims: { kind: "claims"; assessments: ClaimAssessment[] };
  evidence: {
    kind: "evidence";
    claimAssessments: ClaimAssessment[];
    missingEvidenceClaimIds: string[];
  };
  contradictions: { kind: "contradictions"; items: Contradiction[] };
  data: { kind: "data"; items: DataAssessment[] };
  sourceOverview: {
    kind: "source-overview";
    primarySourceDocumentIds: string[];
    secondarySourceDocumentIds: string[];
    sourceDiversity: number;
    missingSourceCategories: string[];
    sourceConflictSummary: string;
  };
  openQuestions: { kind: "open-questions"; items: OpenQuestion[] };
  changeSummary: { kind: "change-summary"; changeIds: string[] };
}

export type DossierChangeType =
  | "added"
  | "updated"
  | "removed"
  | "confirmed"
  | "disputed"
  | "corrected"
  | "retracted"
  | "confidence-increased"
  | "confidence-decreased";

export interface DossierChange {
  id: string;
  changeType: DossierChangeType;
  targetType:
    | "source-document"
    | "claim"
    | "evidence"
    | "contradiction"
    | "confidence"
    | "open-question"
    | "completeness";
  targetId: string;
  fieldPath?: string;
  previousValueSummary?: string;
  currentValueSummary?: string;
  reason: string;
  sourceDocumentIds: string[];
  detectedAt: string;
}

export interface EventDossier {
  id: string;
  eventId: string;
  title: string;
  status: DossierStatus;
  revisionNumber: number;
  createdAt: string;
  updatedAt: string;
  generatedAt: string;
  sourceDocumentIds: string[];
  claimIds: string[];
  evidenceLinkIds: string[];
  dataPointIds: string[];
  entityIds: string[];
  statements: DossierStatement[];
  sections: DossierSections;
  completeness: DossierCompleteness;
  warnings: string[];
  openQuestionIds: string[];
  previousRevisionId?: string;
  semanticFingerprint: string;
}

export interface DossierRevision {
  id: string;
  dossierId: string;
  eventId: string;
  revisionNumber: number;
  previousRevisionId?: string;
  snapshot: EventDossier;
  createdAt: string;
  changeSet: DossierChange[];
}

export interface BuildEventDossierInput {
  event: Event;
  sourceDocuments: SourceDocument[];
  claims: Claim[];
  evidenceLinks: EvidenceLink[];
  dataPoints: DataPoint[];
  entities: Entity[];
  statements?: DossierStatement[];
  timelineItems?: TimelineItem[];
  openQuestions?: OpenQuestion[];
  previousRevision?: DossierRevision;
}

export type BuildEventDossierResult =
  | { success: true; outcome: "created" | "revised"; revision: DossierRevision }
  | { success: true; outcome: "unchanged"; revision: DossierRevision }
  | {
      success: false;
      error: {
        code:
          | "EVENT_REFERENCE_MISMATCH"
          | "INVALID_DOSSIER_INPUT"
          | "MISSING_REQUIRED_EVIDENCE"
          | "INVALID_STATEMENT_CLASSIFICATION"
          | "BROKEN_REFERENCE"
          | "DOSSIER_VALIDATION_FAILED";
        message: string;
      };
    };
