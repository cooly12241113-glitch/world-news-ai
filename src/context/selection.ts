import { createSemanticFingerprint } from "../briefing";
import type {
  CandidateScore,
  DiversityPolicy,
  EvidenceCandidate,
  EvidenceCategory,
  RetrievalPlan,
  SourceExcerpt,
} from "./models";

function overlap(terms: string[], text: string): number {
  if (terms.length === 0) return 0;
  const normalized = text.toLocaleLowerCase();
  return terms.filter((term) => normalized.includes(term.toLocaleLowerCase())).length / terms.length;
}

function intersects(left: string[], right: string[]): boolean {
  return left.some((value) => right.includes(value));
}

export function evidenceCategory(candidate: EvidenceCandidate): EvidenceCategory {
  if (candidate.structuredMetadata.relation === "contradicts") return "contradicting-evidence";
  if (candidate.recordType === "claim") return "attributed-claim";
  if (candidate.primarySource) {
    if (candidate.documentType === "LegalDocument") return "primary-legal";
    if (candidate.documentType === "StatisticalDataset") return "primary-statistical";
    if (candidate.documentType === "CorporateDisclosure") return "primary-corporate";
    return "primary-official";
  }
  if (candidate.recordType === "source-document") return "secondary-reporting";
  if (candidate.recordType === "dossier-section") return "secondary-analysis";
  return "contextual-evidence";
}

export class DeterministicCandidateScorer {
  readonly version = "lexical-metadata-v1";

  score(candidate: EvidenceCandidate, plan: RetrievalPlan): CandidateScore {
    const titleOverlap = overlap(plan.searchTerms, candidate.title);
    const bodyOverlap = overlap(plan.searchTerms, candidate.searchableText);
    const exact = plan.exactPhrases.some((phrase) =>
      candidate.searchableText.toLocaleLowerCase().includes(phrase.toLocaleLowerCase())) ? 1 : 0;
    const lexicalScore = Math.min(1, exact * 0.45 + titleOverlap * 0.25 + bodyOverlap * 0.3);
    const eventMatchScore = intersects(candidate.eventIds, plan.targetEventIds) ? 1 : 0;
    const entityMatchScore = intersects(candidate.entityIds, plan.targetEntityIds) ? 1 : 0;
    const geographicScore = intersects(candidate.locations, plan.targetLocations) ? 1 : 0;
    const domainScore = intersects(candidate.domains, plan.targetDomains) ? 1 : 0;
    const evidenceQualityScore = candidate.primarySource ? 1 :
      candidate.evidenceLinkIds.length > 0 ? 0.75 : candidate.claimIds.length > 0 ? 0.5 : 0.3;
    const freshnessScore = candidate.provenance.revisionNumber !== undefined ? 0.8 : 0.5;
    const unsupportedLanguage = candidate.language !== "und" &&
      !["ko", "en"].includes(candidate.language);
    const penalties = unsupportedLanguage ? ["unsupported-language"] : [];
    const totalScore = Math.max(0, Math.min(1,
      lexicalScore * 0.35 + eventMatchScore * 0.15 + entityMatchScore * 0.1 +
      geographicScore * 0.05 + domainScore * 0.1 + evidenceQualityScore * 0.2 +
      freshnessScore * 0.05 - penalties.length * 0.15));
    return {
      totalScore, lexicalScore, eventMatchScore, entityMatchScore, geographicScore,
      temporalScore: 0.5, domainScore, evidenceQualityScore, diversityScore: 0,
      freshnessScore, penalties,
      reasons: [
        ...(exact ? ["exact phrase match"] : []),
        ...(eventMatchScore ? ["target event match"] : []),
        ...(candidate.primarySource ? ["primary source"] : []),
        ...(candidate.evidenceLinkIds.length ? ["evidence-linked record"] : []),
      ],
      scorerVersion: this.version,
    };
  }
}

function duplicateKey(candidate: EvidenceCandidate): string {
  return candidate.provenance.fingerprint ??
    candidate.provenance.canonicalIdentity ??
    `${candidate.recordType}:${candidate.recordId}`;
}

export function selectDiverseCandidates(
  scored: Array<{ candidate: EvidenceCandidate; score: CandidateScore }>,
  policy: DiversityPolicy,
  maximum: number,
): { selected: Array<{ candidate: EvidenceCandidate; score: CandidateScore }>; duplicates: number } {
  const sorted = [...scored].sort((left, right) =>
    right.score.totalScore - left.score.totalScore ||
    Number(right.candidate.primarySource) - Number(left.candidate.primarySource) ||
    (right.candidate.provenance.revisionNumber ?? 0) - (left.candidate.provenance.revisionNumber ?? 0) ||
    (right.candidate.publishedAt ?? "").localeCompare(left.candidate.publishedAt ?? "") ||
    left.candidate.recordId.localeCompare(right.candidate.recordId));
  const seen = new Set<string>();
  const sourceCount = new Map<string, number>();
  const documentCount = new Map<string, number>();
  const selected: typeof sorted = [];
  let duplicates = 0;
  const reserve = [
    ...sorted.filter((entry) => entry.candidate.primarySource).slice(0, policy.reserveForPrimarySources),
    ...sorted.filter((entry) => evidenceCategory(entry.candidate) === "contradicting-evidence")
      .slice(0, policy.reserveForContradictingEvidence),
    ...sorted.filter((entry) => entry.candidate.recordType === "data-point")
      .slice(0, policy.reserveForDataPoints),
    ...sorted,
  ];
  for (const entry of reserve) {
    const key = duplicateKey(entry.candidate);
    if (seen.has(key)) { duplicates += 1; continue; }
    const source = entry.candidate.sourceName;
    const document = entry.candidate.sourceDocumentIds[0] ?? entry.candidate.recordId;
    if ((sourceCount.get(source) ?? 0) >= policy.maximumItemsPerSource) continue;
    if ((documentCount.get(document) ?? 0) >= policy.maximumItemsPerDocument) continue;
    seen.add(key);
    sourceCount.set(source, (sourceCount.get(source) ?? 0) + 1);
    documentCount.set(document, (documentCount.get(document) ?? 0) + 1);
    selected.push(entry);
    if (selected.length >= maximum) break;
  }
  return { selected, duplicates };
}

export function extractExcerpt(
  candidate: EvidenceCandidate,
  terms: string[],
  maximumCharacters = 700,
): SourceExcerpt | undefined {
  const source = candidate.searchableText.trim();
  if (!source) return undefined;
  const sentences = source.split(/(?<=[.!?。！？])\s+|\r?\n+/u).filter(Boolean);
  const matched = [...sentences].sort((left, right) =>
    overlap(terms, right) - overlap(terms, left) ||
    source.indexOf(left) - source.indexOf(right))[0];
  if (!matched) return undefined;
  const start = source.indexOf(matched);
  const text = matched.length <= maximumCharacters ? matched : `${matched.slice(0, maximumCharacters - 1)}…`;
  const exact = start >= 0;
  return {
    id: `excerpt:${candidate.id}`,
    sourceDocumentId: candidate.sourceDocumentIds[0] ?? candidate.recordId,
    text,
    ...(exact ? { startOffset: start, endOffset: start + Math.min(matched.length, maximumCharacters) } : {}),
    offsetPrecision: exact ? "exact" : "unavailable",
    sectionHint: candidate.recordType,
    matchedTerms: terms.filter((term) => text.toLocaleLowerCase().includes(term.toLocaleLowerCase())),
    extractionReason: "Highest lexical overlap within a source sentence or paragraph.",
    excerptHash: createSemanticFingerprint(text),
    characterCount: text.length,
    provenance: candidate.provenance,
    warnings: matched.length > maximumCharacters ? ["Excerpt was deterministically truncated."] : [],
  };
}
