import { describe, expect, it } from "vitest";
import { RetrievalPlanner } from "../planner";
import { request } from "./fixtures";

describe("RetrievalPlanner", () => {
  it.each([
    ["왜 충돌이 시작됐나?", "explanation-path"],
    ["경제에 미치는 영향은?", "transmission-mechanism"],
    ["이 주장은 사실인가 검증해줘", "claim-origin"],
    ["두 정책을 비교해줘", "source-quality"],
    ["앞으로 가능성은?", "assumptions"],
    ["내 포트폴리오 영향은?", "affected-domains"],
  ] as const)("creates intent-specific plan for %s", (text, section) => {
    const input = request([], text);
    if (text.includes("포트폴리오")) {
      input.question.personalizationRequested = false;
      input.briefingContract.status = "ready";
    }
    const plan = new RetrievalPlanner(() => "plan-1").createPlan(input);
    expect(plan.requiredContextSections).toContain(section);
  });

  it("reflects contract scope, evidence policy, and budget", () => {
    const input = request();
    input.briefingContract.geographicScope.focalLocations = ["Seoul"];
    const plan = new RetrievalPlanner(() => "plan-1").createPlan(input);
    expect(plan.targetEventIds).toEqual(["event-1"]);
    expect(plan.targetLocations).toEqual(["Seoul"]);
    expect(plan.targetDomains).toContain("markets");
    expect(plan.primarySourceRequirement).toBe(true);
    expect(plan.contradictionRequirement).toBe(true);
    expect(plan.maximumSelectedItems).toBe(input.briefingContract.stopConditions.maximumEvidenceItems);
  });

  it("creates deterministic fingerprints independent of generated ids", () => {
    const input = request();
    const first = new RetrievalPlanner(() => "plan-a").createPlan(input);
    const second = new RetrievalPlanner(() => "plan-b").createPlan(input);
    expect(first.fingerprint).toBe(second.fingerprint);
  });
});
