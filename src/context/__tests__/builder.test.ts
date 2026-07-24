import { describe, expect, it } from "vitest";
import { EvidenceContextBuilder } from "../builder";
import { InMemoryEvidenceCandidateProvider } from "../provider";
import { ContextBuildRequestSchema, EvidenceContextPackageSchema } from "../validation";
import { contradiction, dataPoint, document, now, request } from "./fixtures";

function builder(records = request().callerProvidedRecords) {
  let id = 0;
  return new EvidenceContextBuilder({
    provider: new InMemoryEvidenceCandidateProvider(),
    now: () => new Date(now),
    createId: () => `generated-${++id}`,
  });
}

describe("EvidenceContextBuilder", () => {
  it("strictly validates caller records", () => {
    const input = request([document()]);
    expect(ContextBuildRequestSchema.safeParse(input).success).toBe(true);
    expect(ContextBuildRequestSchema.safeParse({
      ...input, callerProvidedRecords: [{ ...document(), rawHtml: "<secret>" }],
    }).success).toBe(false);
  });

  it("rejects a non-ready contract", () => {
    const input = request();
    input.briefingContract.status = "clarification-required";
    expect(builder().build(input)).toMatchObject({
      success: false, error: { code: "CONTRACT_NOT_READY", retryable: false },
    });
  });

  it("returns no-relevant-context without inventing content", () => {
    const result = builder().build(request());
    expect(result).toMatchObject({ success: true, outcome: "no-relevant-context" });
    if (!result.success) throw new Error(result.error.message);
    expect(result.contextPackage.selectedItems).toEqual([]);
    expect(result.contextPackage.excerpts).toEqual([]);
  });

  it("builds traceable supporting, contradicting, and quantitative context", () => {
    const records = [
      document(),
      document({
        id: "document-2", sourceId: "source-2",
        canonicalUrl: "https://news.example/report", documentType: "NewsArticle",
      }),
      contradiction(),
      dataPoint(),
    ];
    const result = builder(records).build(request(records));
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(result.contextPackage.selectedItems.length).toBeGreaterThan(0);
    expect(result.contextPackage.sections.contradictingEvidence.length).toBeGreaterThan(0);
    expect(result.contextPackage.sections.quantitativeData.length).toBeGreaterThan(0);
    expect(result.contextPackage.provenanceIndex).toHaveLength(result.contextPackage.selectedItems.length);
    expect(EvidenceContextPackageSchema.safeParse(result.contextPackage).success).toBe(true);
  });

  it("reports evidence gaps and partial or insufficient outcomes", () => {
    const records = [document()];
    const result = builder(records).build(request(records));
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error.message);
    expect(["partial", "insufficient-evidence"]).toContain(result.outcome);
    expect(result.contextPackage.evidenceGaps.length).toBeGreaterThan(0);
  });

  it("creates deterministic fingerprints independent of time, ids, and provider order", () => {
    const records = [
      document(),
      document({
        id: "document-2", sourceId: "source-2", canonicalUrl: "https://example.org/second",
        documentType: "NewsArticle",
      }),
      contradiction(),
    ];
    const first = builder(records).build(request(records));
    const reversed = [...records].reverse();
    const second = new EvidenceContextBuilder({
      provider: new InMemoryEvidenceCandidateProvider(),
      now: () => new Date("2030-01-01T00:00:00.000Z"),
      createId: () => "different-id",
    }).build(request(reversed));
    if (!first.success || !second.success) throw new Error("build failed");
    expect(first.contextPackage.fingerprint).toBe(second.contextPackage.fingerprint);
  });

  it("changes fingerprint with corpus revision, policy, or excerpts", () => {
    const records = [document()];
    const base = builder(records).build(request(records));
    const corpusInput = request(records);
    corpusInput.corpusRevision = "corpus-2";
    const corpus = builder(records).build(corpusInput);
    const policyInput = request(records);
    policyInput.retrievalPolicyVersion = "retrieval-v2";
    const policy = builder(records).build(policyInput);
    const changedRecords = [document({
      title: "변경된 금리 시장 근거",
      contentText: "금리 인상이 시장에 미치는 영향은? 변경된 공식 근거.",
    })];
    const changed = builder(changedRecords).build(request(changedRecords));
    if (!base.success || !corpus.success || !policy.success || !changed.success) throw new Error("build failed");
    expect(corpus.contextPackage.fingerprint).not.toBe(base.contextPackage.fingerprint);
    expect(policy.contextPackage.fingerprint).not.toBe(base.contextPackage.fingerprint);
    expect(changed.contextPackage.fingerprint).not.toBe(base.contextPackage.fingerprint);
  });
});
