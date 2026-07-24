import * as z from "zod";
import {
  ClaimSchema,
  DataPointSchema,
  EntitySchema,
  EvidenceLinkSchema,
  SourceDocumentSchema,
} from "../validation";
import { BriefingContractSchema, BriefingQuestionSchema } from "../briefing";
import type {
  ContextBuildRequest,
  EvidenceContextPackage,
  RetrievalPlan,
} from "./models";

const S = z.string().min(1);
const SA = z.array(S);
const Score = z.number().min(0).max(1);
const Domain = z.enum([
  "geopolitics", "security", "diplomacy", "law-policy", "macroeconomics",
  "markets", "trade", "supply-chain", "technology", "corporate",
  "democracy-governance", "personal-finance",
]);
const EvidenceCategory = z.enum([
  "primary-official", "primary-corporate", "primary-legal", "primary-statistical",
  "secondary-reporting", "secondary-analysis", "attributed-claim",
  "contradicting-evidence", "contextual-evidence", "unresolved",
]);
const RecordType = z.enum([
  "dossier-section", "source-document", "claim", "evidence-link", "data-point",
  "entity", "open-question", "timeline-item",
]);
const RequiredSection = z.enum([
  "direct-answer-evidence", "current-situation", "necessary-background",
  "explanation-path", "supporting-evidence", "contradicting-evidence", "timeline",
  "quantitative-data", "open-questions", "next-verification-signals",
  "claim-origin", "source-quality", "unresolved-gaps", "trigger-event",
  "transmission-mechanism", "affected-domains", "counter-factors",
  "current-state", "drivers", "assumptions", "contradicting-signals",
  "verification-signals",
]);

export const ContextBuildRequestSchema: z.ZodType<ContextBuildRequest> = z.strictObject({
  question: BriefingQuestionSchema,
  briefingContract: BriefingContractSchema,
  referencedEventIds: SA,
  referencedDossierIds: SA,
  callerProvidedRecords: z.array(z.union([
    SourceDocumentSchema, ClaimSchema, EvidenceLinkSchema, DataPointSchema, EntitySchema,
  ])),
  corpusRevision: S,
  requestedAt: z.iso.datetime(),
  retrievalPolicyVersion: S,
});

export const RetrievalPlanSchema: z.ZodType<RetrievalPlan> = z.strictObject({
  id: S, questionId: S, contractId: S, searchTerms: SA, exactPhrases: SA,
  targetEventIds: SA, targetEntityIds: SA, targetLocations: SA,
  targetDomains: z.array(Domain), temporalWindow: S,
  requiredEvidenceCategories: z.array(EvidenceCategory),
  requiredContextSections: z.array(RequiredSection),
  preferredSourceTypes: SA, contradictionRequirement: z.boolean(),
  primarySourceRequirement: z.boolean(), dataRequirement: z.boolean(),
  maximumCandidates: z.number().int().positive(),
  maximumSelectedItems: z.number().int().positive(),
  maximumCharacters: z.number().int().positive(),
  maximumExcerpts: z.number().int().positive(),
  stopConditions: SA, warnings: SA, policyVersion: S, fingerprint: S,
});

const Item = z.strictObject({
  id: S, itemType: RecordType, recordId: S, excerptId: S.optional(),
  relevanceScore: Score, evidenceCategory: EvidenceCategory,
  supportsClaimIds: SA, contradictsClaimIds: SA, sourceDocumentIds: SA,
  dataPointIds: SA, entityIds: SA, locationIds: SA, selectionReasons: SA,
  confidence: Score, provenanceRefs: SA,
});
const Excerpt = z.strictObject({
  id: S, sourceDocumentId: S, text: S, startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
  offsetPrecision: z.enum(["exact", "normalized", "approximate", "unavailable"]),
  sectionHint: S, matchedTerms: SA, extractionReason: S, excerptHash: S,
  characterCount: z.number().int().positive(),
  provenance: z.strictObject({
    canonicalIdentity: S.optional(), fingerprint: S.optional(),
    revisionNumber: z.number().int().positive().optional(),
    selectedCapabilityId: S.optional(), observedAt: z.iso.datetime(),
  }),
  warnings: SA,
});
const Gap = z.strictObject({
  id: S,
  gapType: z.enum([
    "missing-primary-source", "missing-contradicting-evidence",
    "missing-quantitative-data", "insufficient-independent-sources",
    "unresolved-claim", "stale-evidence", "missing-user-context",
    "temporal-gap", "geographic-gap",
  ]),
  description: S, importance: z.enum(["low", "medium", "high", "critical"]),
  requiredEvidenceCategory: EvidenceCategory.optional(), relatedClaimIds: SA,
  relatedEntityIds: SA, suggestedDiscoveryQuery: S, blocking: z.boolean(),
  reasons: SA,
});
const Provenance = z.strictObject({
  provenanceId: S, contextItemId: S, recordType: RecordType, recordId: S,
  sourceDocumentId: S.optional(), excerptId: S.optional(),
  canonicalIdentity: S.optional(), fingerprint: S.optional(),
  revisionNumber: z.number().int().positive().optional(),
  selectedCapabilityId: S.optional(), observedAt: z.iso.datetime(),
});

export const EvidenceContextPackageSchema: z.ZodType<EvidenceContextPackage> = z.strictObject({
  id: S, questionId: S, contractId: S, retrievalPlanId: S,
  status: z.enum(["ready", "partial", "insufficient-evidence", "no-relevant-context"]),
  corpusRevision: S,
  sections: z.strictObject({
    directEvidence: SA, currentSituation: SA, background: SA,
    supportingEvidence: SA, contradictingEvidence: SA, timeline: SA,
    quantitativeData: SA, openQuestions: SA, verificationSignals: SA,
  }),
  selectedItems: z.array(Item), excerpts: z.array(Excerpt),
  excludedCandidateSummary: z.strictObject({
    total: z.number().int().nonnegative(), duplicates: z.number().int().nonnegative(),
    budget: z.number().int().nonnegative(), lowRelevance: z.number().int().nonnegative(),
  }),
  coverage: z.strictObject({
    overall: Score, requiredSectionCoverage: Score, primarySourceCoverage: Score,
    independentSourceCoverage: Score, contradictionCoverage: Score,
    quantitativeDataCoverage: Score, timelineCoverage: Score,
    personalizationCoverage: Score, missingRequiredSections: z.array(RequiredSection),
  }),
  evidenceGaps: z.array(Gap), openQuestions: SA, provenanceIndex: z.array(Provenance),
  warnings: SA, createdAt: z.iso.datetime(), policyVersion: S, fingerprint: S,
});
