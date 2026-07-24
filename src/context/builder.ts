import { randomUUID } from "node:crypto";
import { createSemanticFingerprint } from "../briefing";
import type {
  ContextBudget,
  ContextBuildErrorCode,
  ContextBuildRequest,
  ContextBuildResult,
  ContextCoverage,
  ContextItem,
  ContextSectionName,
  DiversityPolicy,
  EvidenceCandidate,
  EvidenceCategory,
  EvidenceContextPackage,
  EvidenceCandidateProvider,
  EvidenceGap,
  ProvenanceRecord,
  RequiredContextSection,
  SourceExcerpt,
} from "./models";
import { RetrievalPlanner } from "./planner";
import {
  DeterministicCandidateScorer,
  evidenceCategory,
  extractExcerpt,
  selectDiverseCandidates,
} from "./selection";
import {
  ContextBuildRequestSchema,
  EvidenceContextPackageSchema,
  RetrievalPlanSchema,
} from "./validation";

const EMPTY_SECTIONS: Record<ContextSectionName, string[]> = {
  directEvidence: [], currentSituation: [], background: [], supportingEvidence: [],
  contradictingEvidence: [], timeline: [], quantitativeData: [],
  openQuestions: [], verificationSignals: [],
};

function sectionFor(candidate: EvidenceCandidate, category: EvidenceCategory): ContextSectionName {
  if (category === "contradicting-evidence") return "contradictingEvidence";
  if (candidate.recordType === "data-point") return "quantitativeData";
  if (candidate.recordType === "timeline-item") return "timeline";
  if (candidate.recordType === "open-question") return "openQuestions";
  if (candidate.recordType === "dossier-section") return "currentSituation";
  if (candidate.recordType === "claim" || candidate.recordType === "evidence-link") return "supportingEvidence";
  return "directEvidence";
}

function expectedSection(required: RequiredContextSection): ContextSectionName {
  if (["contradicting-evidence", "contradicting-signals", "counter-factors"].includes(required)) return "contradictingEvidence";
  if (["quantitative-data"].includes(required)) return "quantitativeData";
  if (required === "timeline") return "timeline";
  if (["open-questions", "unresolved-gaps"].includes(required)) return "openQuestions";
  if (["current-situation", "current-state"].includes(required)) return "currentSituation";
  if (["necessary-background", "claim-origin", "source-quality"].includes(required)) return "background";
  if (["next-verification-signals", "verification-signals"].includes(required)) return "verificationSignals";
  if (["supporting-evidence"].includes(required)) return "supportingEvidence";
  return "directEvidence";
}

export interface EvidenceContextBuilderOptions {
  provider: EvidenceCandidateProvider;
  planner?: RetrievalPlanner;
  scorer?: DeterministicCandidateScorer;
  now?: () => Date;
  createId?: () => string;
}

export class EvidenceContextBuilder {
  private readonly planner: RetrievalPlanner;
  private readonly scorer: DeterministicCandidateScorer;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(private readonly options: EvidenceContextBuilderOptions) {
    this.planner = options.planner ?? new RetrievalPlanner();
    this.scorer = options.scorer ?? new DeterministicCandidateScorer();
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  build(input: unknown): ContextBuildResult {
    const parsed = ContextBuildRequestSchema.safeParse(input);
    if (!parsed.success) return this.failure("INVALID_CONTEXT_REQUEST", "validation", parsed.error.message, false);
    const request = parsed.data;
    if (request.briefingContract.status !== "ready") {
      return this.failure("CONTRACT_NOT_READY", "contract", "BriefingContract must be ready.", false);
    }
    if (request.briefingContract.questionId !== request.question.id) {
      return this.failure("INVALID_CONTEXT_REQUEST", "contract", "Question and contract IDs do not match.", false);
    }
    try {
      const planResult = RetrievalPlanSchema.safeParse(this.planner.createPlan(request));
      if (!planResult.success) return this.failure("RETRIEVAL_PLAN_FAILED", "planning", planResult.error.message, false);
      const plan = planResult.data;
      const candidates = this.options.provider.findCandidates(plan, request);
      const scored = candidates.map((candidate) => ({ candidate, score: this.scorer.score(candidate, plan) }));
      const relevant = scored.filter((entry) =>
        entry.score.totalScore >= request.briefingContract.evidencePolicy.evidenceConfidenceThreshold / 2 ||
        entry.candidate.primarySource ||
        evidenceCategory(entry.candidate) === "contradicting-evidence" ||
        entry.candidate.recordType === "data-point");
      const diversity: DiversityPolicy = {
        maximumItemsPerSource: 3, maximumItemsPerDocument: 3, minimumIndependentSources: 2,
        reserveForPrimarySources: plan.primarySourceRequirement ? 1 : 0,
        reserveForContradictingEvidence: plan.contradictionRequirement ? 1 : 0,
        reserveForDataPoints: plan.dataRequirement ? 1 : 0,
        allowSamePublisherRevisions: false,
      };
      const budget: ContextBudget = {
        maximumCharacters: plan.maximumCharacters, maximumItems: plan.maximumSelectedItems,
        maximumDocuments: Math.min(plan.maximumSelectedItems, 12),
        maximumExcerpts: plan.maximumExcerpts, maximumItemsPerSection: 8,
        maximumItemsPerSource: diversity.maximumItemsPerSource,
        reservedPrimarySourceItems: diversity.reserveForPrimarySources,
        reservedContradictingEvidenceItems: diversity.reserveForContradictingEvidence,
        reservedDataPointItems: diversity.reserveForDataPoints,
      };
      const selection = selectDiverseCandidates(relevant, diversity, budget.maximumItems);
      return this.package(request, plan, candidates.length, relevant.length, selection, budget);
    } catch (error) {
      return this.failure(
        "CONTEXT_BUILD_FAILED", "build",
        error instanceof Error ? error.message : "Context build failed.", true,
      );
    }
  }

  private package(
    request: ContextBuildRequest,
    plan: ReturnType<RetrievalPlanner["createPlan"]>,
    candidateCount: number,
    relevantCount: number,
    selection: ReturnType<typeof selectDiverseCandidates>,
    budget: ContextBudget,
  ): ContextBuildResult {
    const sections = structuredClone(EMPTY_SECTIONS);
    const items: ContextItem[] = [];
    const excerpts: SourceExcerpt[] = [];
    const provenance: ProvenanceRecord[] = [];
    let characters = 0;
    let budgetExcluded = 0;
    for (const { candidate, score } of selection.selected) {
      const excerpt = extractExcerpt(candidate, plan.searchTerms);
      if (!excerpt || excerpts.length >= budget.maximumExcerpts ||
          characters + excerpt.characterCount > budget.maximumCharacters) {
        budgetExcluded += 1;
        continue;
      }
      const category = evidenceCategory(candidate);
      const section = sectionFor(candidate, category);
      if (sections[section].length >= budget.maximumItemsPerSection) {
        budgetExcluded += 1;
        continue;
      }
      const itemId = `context-item:${candidate.id}`;
      const provenanceId = `provenance:${candidate.id}`;
      const item: ContextItem = {
        id: itemId, itemType: candidate.recordType, recordId: candidate.recordId,
        excerptId: excerpt.id, relevanceScore: score.totalScore, evidenceCategory: category,
        supportsClaimIds: candidate.structuredMetadata.relation === "supports" ? candidate.claimIds : [],
        contradictsClaimIds: candidate.structuredMetadata.relation === "contradicts" ? candidate.claimIds : [],
        sourceDocumentIds: candidate.sourceDocumentIds, dataPointIds: candidate.dataPointIds,
        entityIds: candidate.entityIds, locationIds: candidate.locations,
        selectionReasons: score.reasons.length ? score.reasons : ["deterministic relevance score"],
        confidence: Math.max(score.totalScore, 0.01), provenanceRefs: [provenanceId],
      };
      items.push(item);
      excerpts.push(excerpt);
      sections[section].push(item.id);
      characters += excerpt.characterCount;
      provenance.push({
        provenanceId, contextItemId: item.id, recordType: candidate.recordType,
        recordId: candidate.recordId,
        ...(candidate.sourceDocumentIds[0] ? { sourceDocumentId: candidate.sourceDocumentIds[0] } : {}),
        excerptId: excerpt.id, ...candidate.provenance,
      });
    }
    const coverage = this.coverage(request, plan.requiredContextSections, sections, items);
    const gaps = this.gaps(request, plan, coverage, items);
    const status = items.length === 0 ? "no-relevant-context" :
      gaps.some((gap) => gap.blocking) ? "insufficient-evidence" :
      coverage.overall < 0.8 ? "partial" : "ready";
    const semantic = {
      question: request.question.text.trim().replace(/\s+/g, " "),
      contractFingerprint: request.briefingContract.semanticFingerprint,
      planFingerprint: plan.fingerprint,
      selected: items.map((item) => ({
        record: `${item.itemType}:${item.recordId}`,
        excerptHash: excerpts.find((excerpt) => excerpt.id === item.excerptId)?.excerptHash,
        section: Object.entries(sections).find(([, ids]) => ids.includes(item.id))?.[0],
        provenance: provenance
          .filter((record) => item.provenanceRefs.includes(record.provenanceId))
          .map((record) => ({
            canonicalIdentity: record.canonicalIdentity,
            fingerprint: record.fingerprint,
            revisionNumber: record.revisionNumber,
          }))
          .sort((left, right) =>
            (left.fingerprint ?? "").localeCompare(right.fingerprint ?? "") ||
            (left.canonicalIdentity ?? "").localeCompare(right.canonicalIdentity ?? "") ||
            (left.revisionNumber ?? 0) - (right.revisionNumber ?? 0)),
      })).sort((left, right) => left.record.localeCompare(right.record)),
      policyVersion: request.retrievalPolicyVersion,
      corpusRevision: request.corpusRevision,
    };
    const contextPackage: EvidenceContextPackage = {
      id: this.createId(), questionId: request.question.id,
      contractId: request.briefingContract.id, retrievalPlanId: plan.id, status,
      corpusRevision: request.corpusRevision, sections, selectedItems: items, excerpts,
      excludedCandidateSummary: {
        total: candidateCount - items.length, duplicates: selection.duplicates,
        budget: budgetExcluded, lowRelevance: candidateCount - relevantCount,
      },
      coverage, evidenceGaps: gaps,
      openQuestions: gaps.map((gap) => gap.description), provenanceIndex: provenance,
      warnings: gaps.map((gap) => gap.description), createdAt: this.now().toISOString(),
      policyVersion: request.retrievalPolicyVersion,
      fingerprint: createSemanticFingerprint(semantic),
    };
    const validated = EvidenceContextPackageSchema.safeParse(contextPackage);
    if (!validated.success) {
      return this.failure("CONTEXT_VALIDATION_FAILED", "validation", validated.error.message, false);
    }
    return { success: true, outcome: status, contextPackage: validated.data, warnings: validated.data.warnings };
  }

  private coverage(
    request: ContextBuildRequest,
    required: RequiredContextSection[],
    sections: Record<ContextSectionName, string[]>,
    items: ContextItem[],
  ): ContextCoverage {
    const missing = required.filter((section) => sections[expectedSection(section)].length === 0);
    const primary = items.some((item) => item.evidenceCategory.startsWith("primary-"));
    const contradicting = sections.contradictingEvidence.length > 0;
    const quantitative = sections.quantitativeData.length > 0;
    const timeline = sections.timeline.length > 0;
    const independent = new Set(items.flatMap((item) => item.sourceDocumentIds)).size;
    const requiredSectionCoverage = required.length === 0 ? 1 : (required.length - missing.length) / required.length;
    const requirements = [
      requiredSectionCoverage,
      request.briefingContract.evidencePolicy.requirePrimarySourcesWhenAvailable ? Number(primary) : 1,
      request.briefingContract.evidencePolicy.requireContradictingEvidence ? Number(contradicting) : 1,
      request.briefingContract.evidencePolicy.requireIndependentSources ? Math.min(1, independent / 2) : 1,
    ];
    return {
      overall: requirements.reduce((sum, value) => sum + value, 0) / requirements.length,
      requiredSectionCoverage,
      primarySourceCoverage: primary ? 1 : 0,
      independentSourceCoverage: Math.min(1, independent / 2),
      contradictionCoverage: contradicting ? 1 : 0,
      quantitativeDataCoverage: quantitative ? 1 : 0,
      timelineCoverage: timeline ? 1 : 0,
      personalizationCoverage: request.briefingContract.personalizationPolicy.enabled ? 1 : 0,
      missingRequiredSections: missing,
    };
  }

  private gaps(
    request: ContextBuildRequest,
    plan: ReturnType<RetrievalPlanner["createPlan"]>,
    coverage: ContextCoverage,
    items: ContextItem[],
  ): EvidenceGap[] {
    const definitions: Array<[boolean, EvidenceGap["gapType"], string, EvidenceCategory | undefined]> = [
      [plan.primarySourceRequirement && coverage.primarySourceCoverage === 0, "missing-primary-source", "A primary source is missing.", "primary-official"],
      [plan.contradictionRequirement && coverage.contradictionCoverage === 0, "missing-contradicting-evidence", "Contradicting evidence is missing.", "contradicting-evidence"],
      [plan.dataRequirement && coverage.quantitativeDataCoverage === 0, "missing-quantitative-data", "Required quantitative data is missing.", "primary-statistical"],
      [request.briefingContract.evidencePolicy.requireIndependentSources && coverage.independentSourceCoverage < 1, "insufficient-independent-sources", "Fewer than two independent documents were selected.", undefined],
    ];
    return definitions.filter(([condition]) => condition).map(([, gapType, description, category], index) => ({
      id: `gap-${index + 1}`, gapType, description, importance: "high",
      ...(category ? { requiredEvidenceCategory: category } : {}),
      relatedClaimIds: items.flatMap((item) => item.supportsClaimIds),
      relatedEntityIds: items.flatMap((item) => item.entityIds),
      suggestedDiscoveryQuery: `${request.question.text.trim()} ${description}`,
      blocking: gapType === "missing-primary-source" || gapType === "insufficient-independent-sources",
      reasons: ["Required by the BriefingContract evidence policy."],
    }));
  }

  private failure(
    code: ContextBuildErrorCode,
    stage: string,
    message: string,
    retryable: boolean,
  ): ContextBuildResult {
    return { success: false, error: { code, stage, message, retryable } };
  }
}
