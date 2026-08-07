import { describe, expect, it } from "vitest";
import {
  FollowUpRequestSchema,
  classifyFollowUp,
  followUpFingerprint,
  parseFollowUpRequest,
} from "..";
import { followUpContext, followUpRequest } from "./fixtures";

const classify = (text: string, locale: "ko" | "en" = "en") =>
  classifyFollowUp(followUpRequest(text, locale), followUpContext(), {
    decisionId: "decision-1",
    policyVersion: "classifier-v1",
  });

const classifyPersonalized = (text: string) => {
  const context = followUpContext();
  context.personalizedImpact = {
    personalContextFingerprint: "personal-context-fingerprint",
    analysisFingerprint: "analysis-fingerprint",
    exposureIds: ["exposure-1"],
    impactChannelIds: ["channel-1"],
    impactAssessmentIds: ["assessment-1"],
    scenarioIds: ["scenario-1"],
  };
  return classifyFollowUp(followUpRequest(text, "ko"), context, {
    decisionId: "decision-personalized",
    policyVersion: "classifier-v1",
  });
};

describe("FollowUpRequest", () => {
  it.each([
    ["출처를 보여줘", "ko" as const],
    ["show the source", "en" as const],
  ])("accepts %s", (text, locale) => {
    expect(FollowUpRequestSchema.safeParse(followUpRequest(text, locale)).success)
      .toBe(true);
  });

  it("rejects empty normalized text", () => {
    expect(FollowUpRequestSchema.safeParse(followUpRequest("   ")).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(FollowUpRequestSchema.safeParse({
      ...followUpRequest("source"),
      rawPrompt: "forbidden",
    }).success).toBe(false);
  });

  it("rejects excessive text", () => {
    expect(FollowUpRequestSchema.safeParse(followUpRequest("a".repeat(1_001))).success)
      .toBe(false);
  });

  it("normalizes Unicode and whitespace", () => {
    const parsed = parseFollowUpRequest(followUpRequest("  e\u0301vidence   source  "));
    expect(parsed.text).toBe("évidence source");
  });

  it("rejects control characters", () => {
    expect(FollowUpRequestSchema.safeParse(followUpRequest("source\u0007")).success)
      .toBe(false);
  });

  it("fingerprints normalized content without timestamp or ID", () => {
    const first = parseFollowUpRequest(followUpRequest("  source  "));
    const second = {
      ...first,
      followUpId: "another",
      submittedAt: "2030-01-01T00:00:00.000Z",
    };
    expect(followUpFingerprint(first)).toBe(followUpFingerprint(second));
  });
});

describe("deterministic follow-up classification", () => {
  it("treats Korean counterevidence as a current-scene revision", () => {
    expect(classify("현재 장면에 반대 근거도 보여줘", "ko").scope)
      .toBe("revise-current-scene");
  });
  it("classifies the browser acceptance rebuild wording", () => {
    expect(classify("처음부터 초보자 수준으로 다시 설명해줘", "ko").scope)
      .toBe("rebuild-entire-briefing");
  });
  it("classifies the browser acceptance file deletion wording as unsupported", () => {
    expect(classify("내 컴퓨터 파일을 삭제해줘", "ko").scope).toBe("unsupported");
  });
  it.each([
    ["source for this claim", "answer-current-context"],
    ["revise this scene", "revise-current-scene"],
    ["add a scene at the end", "append-scenes"],
    ["from here onward redo the rest", "replace-remaining-scenes"],
    ["start over for a beginner", "rebuild-entire-briefing"],
    ["what did they do", "clarification-required"],
    ["delete a file", "unsupported"],
  ])("classifies %s", (text, expected) => {
    expect(classify(text).scope).toBe(expected);
  });

  it.each([
    ["출처를 보여줘", "answer-current-context"],
    ["현재 장면 수정", "revise-current-scene"],
    ["한국 경제 영향 추가", "append-scenes"],
    ["여기서부터 다시 남은 부분을 바꿔", "replace-remaining-scenes"],
    ["처음부터 다시 초보자용으로", "rebuild-entire-briefing"],
    ["그 사람이 왜 그랬어", "clarification-required"],
    ["파일 삭제해", "unsupported"],
  ])("classifies Korean: %s", (text, expected) => {
    expect(classify(text, "ko").scope).toBe(expected);
  });

  it("is deterministic", () => {
    expect(classify("show the source")).toEqual(classify("show the source"));
  });

  it("gives unsupported policy precedence", () => {
    expect(classify("delete a file and start over").scope).toBe("unsupported");
  });

  it("requires clarification for compound content scopes", () => {
    const decision = classify("show the source and add a scene");
    expect(decision.scope).toBe("clarification-required");
    expect(decision.matchedRuleCodes).toEqual([
      "COMPOUND_SCOPE_REQUIRES_CLARIFICATION",
    ]);
  });

  it("falls back to clarification instead of guessing", () => {
    expect(classify("please make it better").scope).toBe("clarification-required");
  });

  it.each([
    ["달러 보유가 없다고 가정해줘", "rebuild-entire-briefing", "FULL_REBUILD_PERSONAL_CONTEXT_CHANGE"],
    ["개인화 정보는 빼고 다시 설명해줘", "rebuild-entire-briefing", "FULL_REBUILD_REMOVE_PERSONALIZATION"],
    ["왜 나한테 영향이 있다는 거야?", "answer-current-context", "CURRENT_CONTEXT_PERSONAL_IMPACT_EXPLANATION"],
    ["반대 시나리오도 보여줘", "answer-current-context", "CURRENT_CONTEXT_VALIDATED_COUNTER_SCENARIO"],
  ])("classifies personalized follow-up: %s", (text, scope, code) => {
    const decision = classifyPersonalized(text);
    expect(decision.scope).toBe(scope);
    expect(decision.matchedRuleCodes).toEqual([code]);
  });
});
