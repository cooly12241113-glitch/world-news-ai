import { describe, expect, it } from "vitest";
import { BriefingContractCompiler } from "../compiler";
import { question } from "./fixtures";

function compiler(policyVersion = "standard-v1") {
  let id = 0;
  return new BriefingContractCompiler({
    policyVersion,
    now: () => new Date("2026-07-24T02:00:00.000Z"),
    createId: () => `contract-${++id}`,
  });
}

function contractFor(text: string, overrides = {}) {
  const result = compiler().compile(question({ text, ...overrides }));
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.error.message);
  return result.contract;
}

describe("BriefingContractCompiler", () => {
  it("returns structured input errors", () => {
    expect(compiler().compile(question({ text: " " }))).toMatchObject({
      success: false, error: { code: "EMPTY_QUESTION" },
    });
    expect(compiler().compile(question({ text: "x".repeat(2001) }))).toMatchObject({
      success: false, error: { code: "QUESTION_TOO_LONG" },
    });
  });

  it("compiles the standard evidence-first policy", () => {
    const contract = contractFor("왜 충돌이 발생했나?");
    expect(contract.timeScope.historicalStartPolicy).toBe("direct-trigger");
    expect(contract.explanationPolicy.maximumCausalSteps).toBe(6);
    expect(contract.visualPolicy.maximumScenes).toBe(7);
    expect(contract.evidencePolicy).toMatchObject({
      minimumEvidencePerKeyStatement: 1,
      citationGranularity: "statement",
      requireContradictingEvidence: true,
    });
    expect(contract.uncertaintyPolicy.separateFactFromInference).toBe(true);
    expect(contract.stopConditions.stopWhenEvidenceWeakens).toBe(true);
  });

  it("overrides sections for verification, comparison, and forecast", () => {
    expect(contractFor("이 주장은 사실인가 검증해줘").sectionPolicy.orderedSections[0]).toBe("Claim");
    expect(contractFor("A와 B의 차이를 비교해줘").sectionPolicy.orderedSections[0]).toBe("Comparison Criteria");
    const forecast = contractFor("앞으로 가능성은?");
    expect(forecast.sectionPolicy.orderedSections).toContain("Assumptions");
    expect(forecast.timeScope.forecastHorizon).toBe("3 months");
  });

  it("selects visual modes from intent and domain without forcing a map", () => {
    expect(contractFor("이 주장이 사실인가?").visualPolicy.preferredModes).toContain("evidence-board");
    expect(contractFor("금리와 시장 영향은?").visualPolicy.preferredModes).toContain("chart");
    expect(contractFor("공급망 영향은?").visualPolicy.preferredModes).toContain("map-flow");
    expect(contractFor("법률 판결의 영향은?").visualPolicy.preferredModes).toContain("document");
    expect(contractFor("현재 상황을 요약해줘").visualPolicy.mapUsage).toBe("optional");
  });

  it("uses only explicit personalization context", () => {
    const personalized = contractFor("내 포트폴리오 영향은?", {
      personalizationRequested: true,
      userProvidedContext: { portfolioHoldings: ["Example ETF"] },
    });
    expect(personalized.personalizationPolicy).toMatchObject({
      enabled: true, targetType: "portfolio", recommendationMode: "exposure-analysis",
    });
    expect(personalized.personalizationPolicy.privacyWarnings).toHaveLength(1);
  });

  it("returns clarification as a successful structured outcome", () => {
    const result = compiler().compile(question({
      text: "내 포트폴리오 영향은?", personalizationRequested: true,
    }));
    expect(result).toMatchObject({
      success: true, outcome: "clarification-required",
    });
  });

  it("creates stable semantic fingerprints independent of ids and timestamps", () => {
    const first = compiler().compile(question({ id: "question-a", text: "왜 영향이 발생했나?" }));
    const second = new BriefingContractCompiler({
      now: () => new Date("2030-01-01T00:00:00.000Z"),
      createId: () => "different-contract",
    }).compile(question({
      id: "question-b", submittedAt: "2030-01-01T00:00:00.000Z", text: "왜 영향이 발생했나?",
    }));
    expect(first.success && second.success &&
      first.contract.semanticFingerprint === second.contract.semanticFingerprint).toBe(true);
  });

  it("changes the fingerprint when policy or semantic scope changes", () => {
    const base = compiler().compile(question({ text: "왜 영향이 발생했나?" }));
    const policy = compiler("standard-v2").compile(question({ text: "왜 영향이 발생했나?" }));
    const scope = compiler().compile(question({
      text: "왜 영향이 발생했나?", userProvidedContext: { locations: ["Seoul"] },
    }));
    if (!base.success || !policy.success || !scope.success) throw new Error("compile failed");
    expect(policy.contract.semanticFingerprint).not.toBe(base.contract.semanticFingerprint);
    expect(scope.contract.semanticFingerprint).not.toBe(base.contract.semanticFingerprint);
  });
});
