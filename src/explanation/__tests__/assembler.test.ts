import { describe, expect, it } from "vitest";
import { BriefingContractCompiler, type BriefingQuestion } from "../../briefing";
import { RuleBasedExplanationPlanAssembler } from "../assembler";
import { generationInput, noContext, now } from "./fixtures";

describe("RuleBasedExplanationPlanAssembler", () => {
  it.each([
    ["Why did the disruption happen?", "explain-cause"],
    ["What is the impact of the disruption on the market?", "trace-impact"],
    ["Is this claim true? Verify the claim.", "verify-claim"],
    ["Compare subject A and subject B.", "compare-subjects"],
    ["What is the likely outcome in the next three months?", "forecast-scenarios"],
    ["Summarize the current situation.", "summarize-situation"],
    ["Explore what is happening.", "exploratory-explanation"],
  ])("maps intent for %s", (text, strategy) => {
    const input = generationInput(text);
    const result = new RuleBasedExplanationPlanAssembler({
      now: () => new Date(now), createId: () => "plan-id",
    }).generate(input);
    expect(result.success).toBe(true);
    if (!result.success || !("plan" in result)) throw new Error("plan missing");
    expect(result.plan.answerStrategy).toBe(strategy);
    expect(result.plan.sections.map(({ sourceContractSection }) => sourceContractSection))
      .toEqual(input.contract.sectionPolicy.orderedSections);
  });

  it("creates structure and requirements, never final answer prose", () => {
    const input = generationInput();
    const result = new RuleBasedExplanationPlanAssembler({
      now: () => new Date(now), createId: () => "plan-id",
    }).generate(input);
    if (!result.success || !("plan" in result)) throw new Error("plan missing");
    expect(result.plan.sections.length).toBeGreaterThan(0);
    expect(result.plan.sections.every(({ steps }) => steps.length > 0)).toBe(true);
    expect(JSON.stringify(result.plan)).not.toContain(input.question.text);
    expect(JSON.stringify(result.plan)).not.toContain(input.contextPackage.excerpts[0]?.text);
  });

  it("is deterministic across generated IDs and timestamps", () => {
    const input = generationInput();
    const first = new RuleBasedExplanationPlanAssembler({
      now: () => new Date(now), createId: () => "first-id",
    }).generate(input);
    const second = new RuleBasedExplanationPlanAssembler({
      now: () => new Date("2030-01-01T00:00:00.000Z"), createId: () => "second-id",
    }).generate(input);
    if (!first.success || !second.success || !("plan" in first) || !("plan" in second)) throw new Error("plan missing");
    expect(first.plan.fingerprint).toBe(second.plan.fingerprint);
  });

  it("returns insufficient-context and does not add evidence for an empty package", () => {
    const input = generationInput();
    input.contextPackage = noContext(input);
    const result = new RuleBasedExplanationPlanAssembler().generate(input);
    expect(result).toMatchObject({ success: true, outcome: "insufficient-context" });
    if (!result.success || !("plan" in result)) throw new Error("plan missing");
    expect(result.plan.sections.flatMap(({ steps }) => steps)
      .flatMap(({ evidenceBindings }) => evidenceBindings)).toEqual([]);
  });

  it("stops at clarification-required before plan generation", () => {
    const question: BriefingQuestion = {
      id: "personal-question", text: "How does this affect my portfolio?",
      language: "en", submittedAt: now, referencedEventIds: [],
      referencedEntityIds: [], personalizationRequested: true,
    };
    const compiled = new BriefingContractCompiler({
      now: () => new Date(now), createId: () => "contract-personal",
    }).compile(question);
    if (!compiled.success) throw new Error(compiled.error.message);
    const base = generationInput();
    const result = new RuleBasedExplanationPlanAssembler().generate({
      question, contract: compiled.contract,
      contextPackage: {
        ...base.contextPackage,
        questionId: question.id,
        contractId: compiled.contract.id,
      },
    });
    expect(result).toMatchObject({ success: true, outcome: "clarification-required" });
    expect(result.success && "plan" in result).toBe(false);
  });
});
