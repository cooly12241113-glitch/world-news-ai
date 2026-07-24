import type { BriefingQuestion } from "../models";

export function question(overrides: Partial<BriefingQuestion> = {}): BriefingQuestion {
  return {
    id: "question-1",
    text: "현재 상황을 요약해줘",
    language: "ko",
    submittedAt: "2026-07-24T00:00:00.000Z",
    referencedEventIds: [],
    referencedEntityIds: [],
    personalizationRequested: false,
    ...overrides,
  };
}
