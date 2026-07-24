import { createHash } from "node:crypto";
import type { Claim, EvidenceLink } from "../domain";
import {
  type BuildEventDossierInput,
  type BuildEventDossierResult,
  type ClaimAssessment,
  type Contradiction,
  type DossierChange,
  type DossierCompleteness,
  type DossierConfidence,
  type DossierRevision,
  type EventDossier,
} from "./models";
import {
  confidenceLevelForScore,
  DossierStatementSchema,
  EventDossierSchema,
} from "./validation";

const hashId = (prefix: string, value: string): string =>
  `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 24)}`;
const uniqueSorted = (values: string[]): string[] => [...new Set(values)].sort();

const confidence = (
  evidenceCount: number,
  sourceCount: number,
  primaryCount: number,
  contradictionCount: number,
  assessedAt: string,
): DossierConfidence => {
  const score = Math.max(
    0,
    Math.min(
      1,
      0.15 +
        Math.min(evidenceCount, 4) * 0.12 +
        Math.min(sourceCount, 3) * 0.1 +
        Math.min(primaryCount, 2) * 0.08 -
        Math.min(contradictionCount, 3) * 0.15,
    ),
  );
  return {
    score,
    level: confidenceLevelForScore(score),
    reasons: [
      `evidence:${evidenceCount}`,
      `independent-sources:${sourceCount}`,
      `primary-sources:${primaryCount}`,
      `contradictions:${contradictionCount}`,
    ],
    evidenceCount,
    independentSourceCount: sourceCount,
    primarySourceCount: primaryCount,
    contradictionCount,
    assessedAt,
    assessedBy: "system",
  };
};

const primaryDocument = (type: string): boolean =>
  [
    "GovernmentDocument",
    "StatisticalDataset",
    "LegalDocument",
    "CorporateDisclosure",
  ].includes(type);

const assessClaims = (
  input: BuildEventDossierInput,
  now: string,
): ClaimAssessment[] =>
  input.claims
    .map((claim) => {
      const links = input.evidenceLinks.filter(
        (link) => link.targetType === "claim" && link.targetId === claim.id,
      );
      const supporting = links.filter(({ relation }) => relation === "supports");
      const contradicting = links.filter(
        ({ relation }) => relation === "contradicts",
      );
      const contextual = links.filter(
        ({ relation }) =>
          relation === "contextualizes" || relation === "derived_from",
      );
      const sourceIds = uniqueSorted(links.map(({ sourceDocumentId }) => sourceDocumentId));
      const primaryCount = input.sourceDocuments.filter(
        (document) =>
          sourceIds.includes(document.id) &&
          primaryDocument(document.documentType),
      ).length;
      const status: ClaimAssessment["status"] =
        contradicting.length > 0 && supporting.length > 0
          ? "disputed"
          : contradicting.length > 0
            ? "contradicted"
            : supporting.length > 1
              ? "supported"
              : supporting.length === 1
                ? "partially-supported"
                : "unverified";
      return {
        claimId: claim.id,
        status,
        supportingEvidenceLinkIds: supporting.map(({ id }) => id).sort(),
        contradictingEvidenceLinkIds: contradicting.map(({ id }) => id).sort(),
        contextualEvidenceLinkIds: contextual.map(({ id }) => id).sort(),
        confidence: confidence(
          links.length,
          sourceIds.length,
          primaryCount,
          contradicting.length,
          now,
        ),
      };
    })
    .sort((left, right) => left.claimId.localeCompare(right.claimId));

const contradictions = (
  input: BuildEventDossierInput,
  assessments: ClaimAssessment[],
  now: string,
): Contradiction[] => {
  const result: Contradiction[] = [];
  for (const link of input.evidenceLinks.filter(
    ({ targetType, relation }) =>
      targetType === "claim" && relation === "contradicts",
  )) {
    const other = input.claims.find(
      (claim) =>
        claim.id !== link.targetId &&
        claim.sourceDocumentId === link.sourceDocumentId,
    );
    if (other === undefined) continue;
    result.push(
      contradictionFrom(
        link.targetId,
        other.id,
        "direct",
        [link],
        "Explicit contradicting EvidenceLink",
        now,
      ),
    );
  }
  const grouped = new Map<string, typeof input.dataPoints>();
  for (const point of input.dataPoints) {
    const key = `${point.name}\u0000${point.observedAt ?? "unknown"}`;
    grouped.set(key, [...(grouped.get(key) ?? []), point]);
  }
  for (const points of grouped.values()) {
    if (
      points.length > 1 &&
      new Set(points.map(({ value }) => JSON.stringify(value))).size > 1 &&
      input.claims.length > 1
    ) {
      const claimIds = input.claims.map(({ id }) => id).sort();
      result.push(
        contradictionFrom(
          claimIds[0]!,
          claimIds[1]!,
          "numerical",
          [],
          `Conflicting values for ${points[0]!.name}`,
          now,
        ),
      );
    }
  }
  for (const assessment of assessments.filter(
    ({ status }) => status === "retracted",
  )) {
    result.push(
      contradictionFrom(
        assessment.claimId,
        assessment.claimId,
        "contextual",
        [],
        "Claim was retracted",
        now,
      ),
    );
  }
  return result
    .filter(
      (item, index, values) =>
        values.findIndex(({ id }) => id === item.id) === index,
    )
    .sort((left, right) => left.id.localeCompare(right.id));
};

const contradictionFrom = (
  leftClaimId: string,
  rightClaimId: string,
  contradictionType: Contradiction["contradictionType"],
  links: EvidenceLink[],
  explanation: string,
  now: string,
): Contradiction => ({
  id: hashId(
    "contradiction",
    [leftClaimId, rightClaimId, contradictionType].sort().join(":"),
  ),
  leftClaimId,
  rightClaimId,
  contradictionType,
  severity: links.length > 0 ? "high" : "medium",
  explanation,
  evidenceLinkIds: links.map(({ id }) => id).sort(),
  status: "open",
  detectedBy: "rule",
  confidence: confidence(links.length, new Set(links.map((link) => link.sourceDocumentId)).size, 0, 1, now),
  reasons: [explanation],
});

const completeness = (
  input: BuildEventDossierInput,
  assessments: ClaimAssessment[],
  contradictionsFound: Contradiction[],
  now: string,
): DossierCompleteness => {
  const types = new Set(input.sourceDocuments.map(({ documentType }) => documentType));
  const required = ["NewsArticle", "GovernmentDocument", "StatisticalDataset"];
  const requiredCategoryCoverage =
    required.filter((type) => types.has(type as never)).length / required.length;
  const primarySourceCoverage = input.sourceDocuments.length === 0
    ? 0
    : input.sourceDocuments.filter(({ documentType }) =>
        primaryDocument(documentType),
      ).length / input.sourceDocuments.length;
  const claimEvidenceCoverage = assessments.length === 0
    ? 0
    : assessments.filter(
        (assessment) =>
          assessment.supportingEvidenceLinkIds.length +
            assessment.contradictingEvidenceLinkIds.length >
          0,
      ).length / assessments.length;
  const timelineCoverage =
    (input.timelineItems?.length ?? 0) > 0 || input.event.startedAt !== undefined
      ? 1
      : 0;
  const contradictionReviewCoverage =
    input.claims.length < 2 || contradictionsFound.length > 0 ? 1 : 0.5;
  const unresolvedCriticalQuestions = (input.openQuestions ?? []).filter(
    ({ importance, status }) => importance === "critical" && status === "open",
  ).length;
  const scores = [
    requiredCategoryCoverage,
    primarySourceCoverage,
    claimEvidenceCoverage,
    timelineCoverage,
    contradictionReviewCoverage,
  ];
  const overallScore = Math.max(
    0,
    scores.reduce((sum, score) => sum + score, 0) / scores.length -
      unresolvedCriticalQuestions * 0.1,
  );
  return {
    overallScore,
    requiredCategoryCoverage,
    primarySourceCoverage,
    claimEvidenceCoverage,
    timelineCoverage,
    contradictionReviewCoverage,
    unresolvedCriticalQuestions,
    missingCategories: required.filter((type) => !types.has(type as never)),
    assessedAt: now,
  };
};

const semanticView = (dossier: EventDossier): unknown => ({
  eventId: dossier.eventId,
  title: dossier.title,
  sourceDocumentIds: dossier.sourceDocumentIds,
  claimIds: dossier.claimIds,
  evidenceLinkIds: dossier.evidenceLinkIds,
  dataPointIds: dossier.dataPointIds,
  entityIds: dossier.entityIds,
  statements: dossier.statements.map(({ createdAt: _createdAt, confidence: c, ...statement }) => ({
    ...statement,
    confidence: { ...c, assessedAt: undefined },
  })),
  claimAssessments: dossier.sections.claims.assessments.map((assessment) => ({
    ...assessment,
    confidence: { ...assessment.confidence, assessedAt: undefined },
  })),
  contradictions: dossier.sections.contradictions.items.map((item) => ({
    ...item,
    confidence: { ...item.confidence, assessedAt: undefined },
  })),
  timeline: dossier.sections.timeline.items,
  openQuestions: dossier.sections.openQuestions.items,
  completeness: { ...dossier.completeness, assessedAt: undefined },
});

export const generateDossierFingerprint = (dossier: EventDossier): string =>
  createHash("sha256")
    .update(JSON.stringify(semanticView(dossier)))
    .digest("hex");

const changesFrom = (
  previous: EventDossier,
  current: EventDossier,
  now: string,
): DossierChange[] => {
  const changes: DossierChange[] = [];
  const compareIds = (
    targetType: DossierChange["targetType"],
    previousIds: string[],
    currentIds: string[],
  ) => {
    for (const id of currentIds.filter((value) => !previousIds.includes(value))) {
      changes.push(change(targetType, id, "added", now));
    }
    for (const id of previousIds.filter((value) => !currentIds.includes(value))) {
      changes.push(change(targetType, id, "removed", now));
    }
  };
  compareIds("source-document", previous.sourceDocumentIds, current.sourceDocumentIds);
  compareIds("claim", previous.claimIds, current.claimIds);
  compareIds("evidence", previous.evidenceLinkIds, current.evidenceLinkIds);
  compareIds(
    "contradiction",
    previous.sections.contradictions.items.map(({ id }) => id),
    current.sections.contradictions.items.map(({ id }) => id),
  );
  compareIds(
    "open-question",
    previous.openQuestionIds,
    current.openQuestionIds,
  );
  for (const assessment of current.sections.claims.assessments) {
    const prior = previous.sections.claims.assessments.find(
      ({ claimId }) => claimId === assessment.claimId,
    );
    if (prior !== undefined && prior.status !== assessment.status) {
      changes.push({
        ...change("claim", assessment.claimId, "updated", now),
        fieldPath: "status",
        previousValueSummary: prior.status,
        currentValueSummary: assessment.status,
      });
    }
  }
  if (previous.completeness.overallScore !== current.completeness.overallScore) {
    changes.push({
      ...change("completeness", current.id, "updated", now),
      previousValueSummary: previous.completeness.overallScore.toFixed(3),
      currentValueSummary: current.completeness.overallScore.toFixed(3),
    });
  }
  return changes;
};

const change = (
  targetType: DossierChange["targetType"],
  targetId: string,
  changeType: DossierChange["changeType"],
  now: string,
): DossierChange => ({
  id: hashId("change", `${targetType}:${targetId}:${changeType}:${now}`),
  changeType,
  targetType,
  targetId,
  reason: `Deterministic ${targetType} comparison`,
  sourceDocumentIds: [],
  detectedAt: now,
});

export class EventDossierBuilder {
  constructor(
    readonly now: () => Date = () => new Date(),
    readonly createId: () => string = () => hashId("dossier", this.now().toISOString()),
  ) {}

  build(input: BuildEventDossierInput): BuildEventDossierResult {
    const integrityError = validateReferences(input);
    if (integrityError !== undefined) return integrityError;
    const now = this.now().toISOString();
    const statements = uniqueById(input.statements ?? []);
    for (const statement of statements) {
      if (!DossierStatementSchema.safeParse(statement).success) {
        return {
          success: false,
          error: {
            code: "INVALID_STATEMENT_CLASSIFICATION",
            message: "A statement violates classification rules",
          },
        };
      }
    }
    const assessments = assessClaims(input, now);
    const contradictionsFound = contradictions(input, assessments, now);
    const completenessValue = completeness(
      input,
      assessments,
      contradictionsFound,
      now,
    );
    const previous = input.previousRevision?.snapshot;
    const dossierId = previous?.id ?? this.createId();
    const timeline = [...(input.timelineItems ?? [])].sort(
      (left, right) =>
        (left.occurredAt ?? "9999").localeCompare(right.occurredAt ?? "9999") ||
        left.id.localeCompare(right.id),
    );
    const sourceIds = uniqueSorted(input.sourceDocuments.map(({ id }) => id));
    const primaryIds = uniqueSorted(
      input.sourceDocuments
        .filter(({ documentType }) => primaryDocument(documentType))
        .map(({ id }) => id),
    );
    const warnings = [
      ...(assessments.some(({ status }) => status === "unverified")
        ? ["Some claims have no evidence"]
        : []),
      ...(completenessValue.unresolvedCriticalQuestions > 0
        ? ["Critical questions remain unresolved"]
        : []),
      ...(contradictionsFound.length > 0
        ? ["Contradicting evidence requires review"]
        : []),
    ];
    const draft: EventDossier = {
      id: dossierId,
      eventId: input.event.id,
      title: input.event.title,
      status:
        completenessValue.overallScore >= 0.7 && warnings.length === 0
          ? "ready"
          : "needs-evidence",
      revisionNumber: (input.previousRevision?.revisionNumber ?? 0) + 1,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      generatedAt: now,
      sourceDocumentIds: sourceIds,
      claimIds: uniqueSorted(input.claims.map(({ id }) => id)),
      evidenceLinkIds: uniqueSorted(input.evidenceLinks.map(({ id }) => id)),
      dataPointIds: uniqueSorted(input.dataPoints.map(({ id }) => id)),
      entityIds: uniqueSorted(input.entities.map(({ id }) => id)),
      statements,
      sections: {
        executiveSummary: {
          kind: "executive-summary",
          statementIds: statements.map(({ id }) => id).sort(),
          confirmedFactStatementIds: statements
            .filter(({ statementType }) => statementType === "confirmed-fact")
            .map(({ id }) => id)
            .sort(),
          majorClaimIds: input.claims.map(({ id }) => id).sort(),
          uncertaintySummary:
            warnings.length > 0 ? warnings.join("; ") : "No material warning",
          lastUpdatedAt: now,
        },
        timeline: { kind: "timeline", items: timeline },
        claims: { kind: "claims", assessments },
        evidence: {
          kind: "evidence",
          claimAssessments: assessments,
          missingEvidenceClaimIds: assessments
            .filter(({ status }) => status === "unverified")
            .map(({ claimId }) => claimId),
        },
        contradictions: { kind: "contradictions", items: contradictionsFound },
        data: {
          kind: "data",
          items: input.dataPoints
            .map((point) => ({
              dataPointId: point.id,
              relevance: "Referenced by event dossier",
              interpretationType: "fact" as const,
              sourceDocumentIds: [point.sourceDocumentId],
              caveats: [],
            }))
            .sort((left, right) => left.dataPointId.localeCompare(right.dataPointId)),
        },
        sourceOverview: {
          kind: "source-overview",
          primarySourceDocumentIds: primaryIds,
          secondarySourceDocumentIds: sourceIds.filter(
            (id) => !primaryIds.includes(id),
          ),
          sourceDiversity:
            input.sourceDocuments.length === 0
              ? 0
              : new Set(input.sourceDocuments.map(({ sourceId }) => sourceId)).size /
                input.sourceDocuments.length,
          missingSourceCategories: completenessValue.missingCategories,
          sourceConflictSummary:
            contradictionsFound.length > 0
              ? `${contradictionsFound.length} deterministic conflict(s)`
              : "No deterministic conflicts detected",
        },
        openQuestions: {
          kind: "open-questions",
          items: [...(input.openQuestions ?? [])].sort((a, b) =>
            a.id.localeCompare(b.id),
          ),
        },
        changeSummary: { kind: "change-summary", changeIds: [] },
      },
      completeness: completenessValue,
      warnings,
      openQuestionIds: uniqueSorted((input.openQuestions ?? []).map(({ id }) => id)),
      previousRevisionId: input.previousRevision?.id,
      semanticFingerprint: "",
    };
    draft.semanticFingerprint = generateDossierFingerprint(draft);
    if (
      input.previousRevision !== undefined &&
      input.previousRevision.snapshot.semanticFingerprint ===
        draft.semanticFingerprint
    ) {
      return {
        success: true,
        outcome: "unchanged",
        revision: input.previousRevision,
      };
    }
    const changes =
      previous === undefined ? [] : changesFrom(previous, draft, now);
    draft.sections.changeSummary.changeIds = changes.map(({ id }) => id);
    const parsed = EventDossierSchema.safeParse(draft);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "DOSSIER_VALIDATION_FAILED",
          message: "Built dossier failed runtime validation",
        },
      };
    }
    const revision: DossierRevision = {
      id: hashId("dossier-revision", `${draft.id}:${draft.revisionNumber}`),
      dossierId: draft.id,
      eventId: draft.eventId,
      revisionNumber: draft.revisionNumber,
      previousRevisionId: input.previousRevision?.id,
      snapshot: parsed.data,
      createdAt: now,
      changeSet: changes,
    };
    return {
      success: true,
      outcome: previous === undefined ? "created" : "revised",
      revision,
    };
  }
}

const uniqueById = <T extends { id: string }>(values: T[]): T[] =>
  [...new Map(values.map((value) => [value.id, value])).values()].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

const validateReferences = (
  input: BuildEventDossierInput,
): BuildEventDossierResult | undefined => {
  const documentIds = new Set(input.sourceDocuments.map(({ id }) => id));
  const claimIds = new Set(input.claims.map(({ id }) => id));
  const evidenceIds = new Set(input.evidenceLinks.map(({ id }) => id));
  const dataPointIds = new Set(input.dataPoints.map(({ id }) => id));
  if (
    input.sourceDocuments.some(
      ({ eventIds }) => !eventIds.includes(input.event.id),
    ) ||
    input.claims.some(({ eventIds }) => !eventIds.includes(input.event.id)) ||
    input.dataPoints.some(({ eventIds }) => !eventIds.includes(input.event.id))
  ) {
    return {
      success: false,
      error: {
        code: "EVENT_REFERENCE_MISMATCH",
        message: "An input record does not reference the target event",
      },
    };
  }
  const broken =
    input.claims.some(({ sourceDocumentId }) => !documentIds.has(sourceDocumentId)) ||
    input.dataPoints.some(({ sourceDocumentId }) => !documentIds.has(sourceDocumentId)) ||
    input.evidenceLinks.some(
      (link) =>
        !documentIds.has(link.sourceDocumentId) ||
        (link.targetType === "claim" && !claimIds.has(link.targetId)) ||
        (link.targetType === "data_point" && !dataPointIds.has(link.targetId)),
    ) ||
    (input.statements ?? []).some(
      (statement) =>
        statement.sourceDocumentIds.some((id) => !documentIds.has(id)) ||
        statement.claimIds.some((id) => !claimIds.has(id)) ||
        statement.evidenceLinkIds.some((id) => !evidenceIds.has(id)) ||
        statement.dataPointIds.some((id) => !dataPointIds.has(id)),
    );
  return broken
    ? {
        success: false,
        error: {
          code: "BROKEN_REFERENCE",
          message: "A dossier input contains a broken reference",
        },
      }
    : undefined;
};
