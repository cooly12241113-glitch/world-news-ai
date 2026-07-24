import { describe, expect, it } from "vitest";
import {
  InMemoryEvidenceCandidateProvider,
  RepositoryBackedEvidenceCandidateProvider,
} from "../provider";
import { RetrievalPlanner } from "../planner";
import {
  DeterministicCandidateScorer,
  extractExcerpt,
  selectDiverseCandidates,
} from "../selection";
import { document, request } from "./fixtures";

describe("candidate retrieval and selection", () => {
  it("merges and normalizes caller-provided records", () => {
    const input = request([document({ canonicalUrl: "https://example.gov/report?token=secret" })]);
    const plan = new RetrievalPlanner(() => "plan-1").createPlan(input);
    const candidates = new InMemoryEvidenceCandidateProvider().findCandidates(plan, input);
    expect(candidates[0]).toMatchObject({
      recordType: "source-document", recordId: "document-1", primarySource: true,
    });
    expect(candidates[0]?.provenance.canonicalIdentity).toBe("https://example.gov/report");
  });

  it("uses repository lookups before merging explicit records", () => {
    const calls: string[] = [];
    const repository = {
      findLatestByEventId(id: string) { calls.push(`event:${id}`); return undefined; },
      findByDossierId(id: string) { calls.push(`dossier:${id}`); return undefined; },
    };
    const input = request([document()]);
    input.referencedDossierIds = ["dossier-1"];
    const plan = new RetrievalPlanner(() => "plan-1").createPlan(input);
    const provider = new RepositoryBackedEvidenceCandidateProvider(repository);
    const candidates = provider.findCandidates(plan, input);
    expect(calls).toEqual(["event:event-1", "dossier:dossier-1"]);
    expect(candidates).toHaveLength(1);
  });

  it("scores exact, event, and primary-source signals", () => {
    const input = request([document({ contentText: inputText() })]);
    const plan = new RetrievalPlanner(() => "plan-1").createPlan(input);
    const candidate = new InMemoryEvidenceCandidateProvider().findCandidates(plan, input)[0];
    if (!candidate) throw new Error("candidate missing");
    const score = new DeterministicCandidateScorer().score(candidate, plan);
    expect(score.lexicalScore).toBeGreaterThan(0);
    expect(score.eventMatchScore).toBe(1);
    expect(score.evidenceQualityScore).toBe(1);
  });

  it("deduplicates canonical identities with stable selection", () => {
    const input = request([document(), document({ id: "document-2" })]);
    const plan = new RetrievalPlanner(() => "plan-1").createPlan(input);
    const candidates = new InMemoryEvidenceCandidateProvider().findCandidates(plan, input);
    const scorer = new DeterministicCandidateScorer();
    const result = selectDiverseCandidates(
      candidates.map((candidate) => ({ candidate, score: scorer.score(candidate, plan) })),
      {
        maximumItemsPerSource: 3, maximumItemsPerDocument: 2,
        minimumIndependentSources: 2, reserveForPrimarySources: 1,
        reserveForContradictingEvidence: 0, reserveForDataPoints: 0,
        allowSamePublisherRevisions: false,
      },
      10,
    );
    expect(result.selected).toHaveLength(1);
    expect(result.duplicates).toBeGreaterThan(0);
  });

  it("extracts a bounded Unicode excerpt with exact provenance", () => {
    const input = request([document()]);
    const plan = new RetrievalPlanner(() => "plan-1").createPlan(input);
    const candidate = new InMemoryEvidenceCandidateProvider().findCandidates(plan, input)[0];
    if (!candidate) throw new Error("candidate missing");
    const excerpt = extractExcerpt(candidate, plan.searchTerms, 40);
    expect(excerpt?.offsetPrecision).toBe("exact");
    expect(excerpt?.characterCount).toBeLessThanOrEqual(40);
    expect(excerpt?.excerptHash).toHaveLength(64);
  });
});

function inputText(): string {
  return "금리 인상이 시장에 미치는 영향은? 공식 근거.";
}
