import { z } from "zod";
import { BriefingPresentationPreferenceSchema } from "../script/validation";
import type { BriefingPresentationPreference } from "../script/models";
import {
  containsDisallowedControlCharacter,
  MAX_FOLLOW_UP_TEXT_LENGTH,
  normalizeFollowUpText,
} from "./follow-up-normalizer";

export interface FollowUpRequest {
  followUpId: string;
  sessionId: string;
  parentQuestionId: string;
  text: string;
  locale: "ko" | "en";
  requestedPresentationPreference?: BriefingPresentationPreference;
  currentSceneId: string;
  currentSceneIndex: number;
  expectedSessionFingerprint: string;
  scriptFingerprint: string;
  contextPackageFingerprint: string;
  submittedAt: string;
  policyVersion: string;
}

const Id = z.string().trim().min(1);

export const FollowUpRequestSchema = z
  .strictObject({
    followUpId: Id,
    sessionId: Id,
    parentQuestionId: Id,
    text: z
      .string()
      .max(MAX_FOLLOW_UP_TEXT_LENGTH)
      .refine((value) => !containsDisallowedControlCharacter(value), {
        message: "Follow-up text contains a disallowed control character.",
      })
      .transform(normalizeFollowUpText)
      .pipe(z.string().min(1).max(MAX_FOLLOW_UP_TEXT_LENGTH)),
    locale: z.enum(["ko", "en"]),
    requestedPresentationPreference:
      BriefingPresentationPreferenceSchema.optional(),
    currentSceneId: Id,
    currentSceneIndex: z.number().int().nonnegative(),
    expectedSessionFingerprint: Id,
    scriptFingerprint: Id,
    contextPackageFingerprint: Id,
    submittedAt: z.iso.datetime(),
    policyVersion: Id,
  });

export function parseFollowUpRequest(input: unknown): FollowUpRequest {
  return FollowUpRequestSchema.parse(input);
}
