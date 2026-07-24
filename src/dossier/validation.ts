import * as z from "zod";
import {
  IdSchema,
  ISODateStringSchema,
  NonEmptyStringSchema,
  UniqueIdArraySchema,
} from "../validation";
import type {
  DossierConfidence,
  DossierRevision,
  DossierStatement,
  EventDossier,
} from "./models";

export const confidenceLevelForScore = (
  score: number,
): DossierConfidence["level"] => {
  if (score < 0.2) return "very-low";
  if (score < 0.4) return "low";
  if (score < 0.6) return "medium";
  if (score < 0.8) return "high";
  return "very-high";
};

export const DossierConfidenceSchema: z.ZodType<DossierConfidence> =
  z.strictObject({
    score: z.number().min(0).max(1),
    level: z.enum(["very-low", "low", "medium", "high", "very-high"]),
    reasons: z.array(NonEmptyStringSchema).min(1),
    evidenceCount: z.number().int().nonnegative(),
    independentSourceCount: z.number().int().nonnegative(),
    primarySourceCount: z.number().int().nonnegative(),
    contradictionCount: z.number().int().nonnegative(),
    assessedAt: ISODateStringSchema,
    assessedBy: z.enum(["human", "system", "ai"]),
  }).superRefine((value, context) => {
    if (value.level !== confidenceLevelForScore(value.score)) {
      context.addIssue({
        code: "custom",
        path: ["level"],
        message: "Confidence level must match score range",
      });
    }
  });

export const DossierStatementSchema: z.ZodType<DossierStatement> =
  z.strictObject({
    id: IdSchema,
    text: NonEmptyStringSchema,
    statementType: z.enum([
      "confirmed-fact",
      "attributed-claim",
      "interpretation",
      "inference",
      "forecast",
      "unknown",
    ]),
    confidence: DossierConfidenceSchema,
    sourceDocumentIds: UniqueIdArraySchema,
    claimIds: UniqueIdArraySchema,
    evidenceLinkIds: UniqueIdArraySchema,
    dataPointIds: UniqueIdArraySchema,
    assumptions: z.array(NonEmptyStringSchema).min(1).optional(),
    authoredBy: z.enum(["human", "system", "ai"]),
    createdAt: ISODateStringSchema,
  }).superRefine((value, context) => {
    const evidenceCount =
      value.sourceDocumentIds.length +
      value.evidenceLinkIds.length +
      value.dataPointIds.length;
    if (value.statementType === "confirmed-fact" && evidenceCount === 0) {
      context.addIssue({
        code: "custom",
        path: ["evidenceLinkIds"],
        message: "Confirmed facts require evidence",
      });
    }
    if (value.statementType === "attributed-claim" && value.claimIds.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["claimIds"],
        message: "Attributed claims require a claim reference",
      });
    }
    if (value.statementType === "forecast" && value.assumptions === undefined) {
      context.addIssue({
        code: "custom",
        path: ["assumptions"],
        message: "Forecasts require assumptions",
      });
    }
    if (value.statementType === "unknown" && value.confidence.score >= 0.4) {
      context.addIssue({
        code: "custom",
        path: ["confidence", "score"],
        message: "Unknown statements must have low confidence",
      });
    }
    if (
      value.authoredBy === "ai" &&
      evidenceCount === 0 &&
      value.statementType !== "inference" &&
      value.statementType !== "unknown"
    ) {
      context.addIssue({
        code: "custom",
        path: ["statementType"],
        message: "Unsupported AI statements must be inference or unknown",
      });
    }
  });

const ScoreSchema = z.number().min(0).max(1);
const CompletenessSchema = z.strictObject({
  overallScore: ScoreSchema,
  requiredCategoryCoverage: ScoreSchema,
  primarySourceCoverage: ScoreSchema,
  claimEvidenceCoverage: ScoreSchema,
  timelineCoverage: ScoreSchema,
  contradictionReviewCoverage: ScoreSchema,
  unresolvedCriticalQuestions: z.number().int().nonnegative(),
  missingCategories: z.array(NonEmptyStringSchema),
  assessedAt: ISODateStringSchema,
});

const ClaimAssessmentSchema = z.strictObject({
  claimId: IdSchema,
  status: z.enum([
    "unverified",
    "partially-supported",
    "supported",
    "disputed",
    "contradicted",
    "retracted",
    "unresolved",
  ]),
  supportingEvidenceLinkIds: UniqueIdArraySchema,
  contradictingEvidenceLinkIds: UniqueIdArraySchema,
  contextualEvidenceLinkIds: UniqueIdArraySchema,
  confidence: DossierConfidenceSchema,
});

const TimelineItemSchema = z.strictObject({
  id: IdSchema,
  occurredAt: ISODateStringSchema.optional(),
  title: NonEmptyStringSchema,
  description: NonEmptyStringSchema,
  itemType: z.enum(["event", "claim", "document", "data"]),
  sourceDocumentIds: UniqueIdArraySchema,
  claimIds: UniqueIdArraySchema,
  confidence: DossierConfidenceSchema,
  temporalPrecision: z.enum(["exact", "day", "approximate", "unknown"]),
});

const ContradictionSchema = z.strictObject({
  id: IdSchema,
  leftClaimId: IdSchema,
  rightClaimId: IdSchema,
  contradictionType: z.enum([
    "direct",
    "numerical",
    "temporal",
    "attribution",
    "causal",
    "contextual",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  explanation: NonEmptyStringSchema,
  evidenceLinkIds: UniqueIdArraySchema,
  status: z.enum(["open", "resolved"]),
  detectedBy: z.literal("rule"),
  confidence: DossierConfidenceSchema,
  reasons: z.array(NonEmptyStringSchema).min(1),
});

const DataAssessmentSchema = z.strictObject({
  dataPointId: IdSchema,
  relevance: NonEmptyStringSchema,
  interpretationType: z.enum(["fact", "context", "trend", "comparison"]),
  sourceDocumentIds: UniqueIdArraySchema,
  caveats: z.array(NonEmptyStringSchema),
});

const OpenQuestionSchema = z.strictObject({
  id: IdSchema,
  question: NonEmptyStringSchema,
  importance: z.enum(["low", "medium", "high", "critical"]),
  status: z.enum(["open", "resolved"]),
  requiredEvidenceTypes: z.array(NonEmptyStringSchema),
  relatedClaimIds: UniqueIdArraySchema,
  relatedEntityIds: UniqueIdArraySchema,
  createdAt: ISODateStringSchema,
  resolvedAt: ISODateStringSchema.optional(),
});

const SectionsSchema: z.ZodType<EventDossier["sections"]> = z.strictObject({
  executiveSummary: z.strictObject({
    kind: z.literal("executive-summary"),
    statementIds: UniqueIdArraySchema,
    confirmedFactStatementIds: UniqueIdArraySchema,
    majorClaimIds: UniqueIdArraySchema,
    uncertaintySummary: NonEmptyStringSchema,
    lastUpdatedAt: ISODateStringSchema,
  }),
  timeline: z.strictObject({
    kind: z.literal("timeline"),
    items: z.array(TimelineItemSchema),
  }),
  claims: z.strictObject({
    kind: z.literal("claims"),
    assessments: z.array(ClaimAssessmentSchema),
  }),
  evidence: z.strictObject({
    kind: z.literal("evidence"),
    claimAssessments: z.array(ClaimAssessmentSchema),
    missingEvidenceClaimIds: UniqueIdArraySchema,
  }),
  contradictions: z.strictObject({
    kind: z.literal("contradictions"),
    items: z.array(ContradictionSchema),
  }),
  data: z.strictObject({
    kind: z.literal("data"),
    items: z.array(DataAssessmentSchema),
  }),
  sourceOverview: z.strictObject({
    kind: z.literal("source-overview"),
    primarySourceDocumentIds: UniqueIdArraySchema,
    secondarySourceDocumentIds: UniqueIdArraySchema,
    sourceDiversity: ScoreSchema,
    missingSourceCategories: z.array(NonEmptyStringSchema),
    sourceConflictSummary: NonEmptyStringSchema,
  }),
  openQuestions: z.strictObject({
    kind: z.literal("open-questions"),
    items: z.array(OpenQuestionSchema),
  }),
  changeSummary: z.strictObject({
    kind: z.literal("change-summary"),
    changeIds: UniqueIdArraySchema,
  }),
});

export const EventDossierSchema: z.ZodType<EventDossier> = z.strictObject({
  id: IdSchema,
  eventId: IdSchema,
  title: NonEmptyStringSchema,
  status: z.enum(["building", "needs-evidence", "ready", "superseded"]),
  revisionNumber: z.number().int().positive(),
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
  generatedAt: ISODateStringSchema,
  sourceDocumentIds: UniqueIdArraySchema,
  claimIds: UniqueIdArraySchema,
  evidenceLinkIds: UniqueIdArraySchema,
  dataPointIds: UniqueIdArraySchema,
  entityIds: UniqueIdArraySchema,
  statements: z.array(DossierStatementSchema),
  sections: SectionsSchema,
  completeness: CompletenessSchema,
  warnings: z.array(NonEmptyStringSchema),
  openQuestionIds: UniqueIdArraySchema,
  previousRevisionId: IdSchema.optional(),
  semanticFingerprint: NonEmptyStringSchema,
});

const DossierChangeSchema = z.strictObject({
  id: IdSchema,
  changeType: z.enum([
    "added",
    "updated",
    "removed",
    "confirmed",
    "disputed",
    "corrected",
    "retracted",
    "confidence-increased",
    "confidence-decreased",
  ]),
  targetType: z.enum([
    "source-document",
    "claim",
    "evidence",
    "contradiction",
    "confidence",
    "open-question",
    "completeness",
  ]),
  targetId: IdSchema,
  fieldPath: NonEmptyStringSchema.optional(),
  previousValueSummary: NonEmptyStringSchema.optional(),
  currentValueSummary: NonEmptyStringSchema.optional(),
  reason: NonEmptyStringSchema,
  sourceDocumentIds: UniqueIdArraySchema,
  detectedAt: ISODateStringSchema,
});

export const DossierRevisionSchema: z.ZodType<DossierRevision> = z.strictObject({
  id: IdSchema,
  dossierId: IdSchema,
  eventId: IdSchema,
  revisionNumber: z.number().int().positive(),
  previousRevisionId: IdSchema.optional(),
  snapshot: EventDossierSchema,
  createdAt: ISODateStringSchema,
  changeSet: z.array(DossierChangeSchema),
});
