import { describe, expect, it } from "vitest";
import { RuleBasedQuestionIntentAnalyzer } from "../analyzer";
import { question } from "./fixtures";

const analyzer = new RuleBasedQuestionIntentAnalyzer(
  () => new Date("2026-07-24T01:00:00.000Z"),
);

describe("RuleBasedQuestionIntentAnalyzer", () => {
  it.each([
    ["왜 충돌이 시작됐나?", "causal-explanation"],
    ["경제에 어떤 영향을 주나?", "impact-analysis"],
    ["이 발표가 사실인가 검증해줘", "fact-verification"],
    ["두 정책의 차이를 비교해줘", "comparison"],
    ["앞으로 어떻게 될 가능성이 있나?", "forecast"],
    ["나의 포트폴리오에 미치는 영향은?", "personalized-impact"],
    ["현재 상황을 요약해줘", "situation-summary"],
    ["Explore the available evidence.", "exploratory"],
  ] as const)("classifies %s", (text, intent) => {
    expect(analyzer.analyze(question({ text })).primaryIntent).toBe(intent);
  });

  it("retains compound intent signals", () => {
    const result = analyzer.analyze(question({
      text: "왜 충돌이 발생했고 경제에 어떤 영향을 주나?",
    }));
    expect(result.primaryIntent).toBe("causal-explanation");
    expect(result.secondaryIntents).toContain("impact-analysis");
  });

  it("is deterministic apart from the injected clock", () => {
    expect(analyzer.analyze(question())).toEqual(analyzer.analyze(question()));
  });

  it("requires clarification for an unbound reference", () => {
    const result = analyzer.analyze(question({ text: "이것은 어떻게 될까?" }));
    expect(result.ambiguity.status).toBe("clarification-required");
    expect(result.ambiguity.clarificationQuestion).toBeDefined();
  });

  it("requires caller context for personalization", () => {
    const result = analyzer.analyze(question({
      text: "내 포트폴리오 영향은?", personalizationRequested: true,
    }));
    expect(result.ambiguity.missingInformation).toContain("personalization context");
  });

  it("requires subjects and criteria for a generic comparison", () => {
    const result = analyzer.analyze(question({ text: "어느 쪽이 더 나은가?" }));
    expect(result.ambiguity.status).toBe("clarification-required");
    expect(result.ambiguity.missingInformation).toContain("comparison subjects and criteria");
  });

  it("applies a reasonable forecast default", () => {
    const result = analyzer.analyze(question({ text: "앞으로 가능성은?" }));
    expect(result.ambiguity.status).toBe("defaults-applied");
    expect(result.ambiguity.resolvableWithDefaults).toBe(true);
  });

  it("returns unsupported for uninterpretable punctuation", () => {
    expect(analyzer.analyze(question({ text: "?!?" })).ambiguity.status).toBe("unsupported");
  });
});
