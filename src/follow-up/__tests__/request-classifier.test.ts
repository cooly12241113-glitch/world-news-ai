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
});
