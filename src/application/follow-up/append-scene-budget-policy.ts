import { z } from "zod";

export const APPEND_BUDGET_ALTERNATIVES = [
  "replace-remaining-scenes",
  "rebuild-entire-briefing",
  "keep-current-briefing",
  "merge-scenes-later",
] as const;

export interface AppendSceneBudgetInput {
  currentSceneCount: number;
  requestedAdditionalSceneCount: number;
  maximumScenes: number;
  completedSceneIds: string[];
  remainingSceneIds: string[];
  decisionScope: "append-scenes";
  policyVersion: string;
}

export type AppendSceneBudgetOutcome =
  | {
      outcome: "append-allowed";
      resultingSceneCount: number;
      policyVersion: string;
    }
  | {
      outcome: "clarification-required";
      resultingSceneCount: number;
      maximumScenes: number;
      alternatives: Array<(typeof APPEND_BUDGET_ALTERNATIVES)[number]>;
      reasonCode: "APPEND_SCENE_BUDGET_EXCEEDED";
      policyVersion: string;
    }
  | {
      outcome: "invalid";
      reasonCode: "INVALID_APPEND_SCENE_COUNT";
      policyVersion: string;
    };

const Count = z.number().int().nonnegative();
const Id = z.string().trim().min(1);
export const AppendSceneBudgetInputSchema: z.ZodType<AppendSceneBudgetInput> =
  z.strictObject({
    currentSceneCount: Count,
    requestedAdditionalSceneCount: Count,
    maximumScenes: Count,
    completedSceneIds: z.array(Id),
    remainingSceneIds: z.array(Id),
    decisionScope: z.literal("append-scenes"),
    policyVersion: Id,
  });

export function evaluateAppendSceneBudget(
  inputValue: AppendSceneBudgetInput,
): AppendSceneBudgetOutcome {
  const parsed = AppendSceneBudgetInputSchema.safeParse(inputValue);
  if (!parsed.success || parsed.data.requestedAdditionalSceneCount === 0) {
    return {
      outcome: "invalid",
      reasonCode: "INVALID_APPEND_SCENE_COUNT",
      policyVersion: inputValue.policyVersion,
    };
  }
  const input = parsed.data;
  const resultingSceneCount =
    input.currentSceneCount + input.requestedAdditionalSceneCount;
  if (resultingSceneCount <= input.maximumScenes) {
    return {
      outcome: "append-allowed",
      resultingSceneCount,
      policyVersion: input.policyVersion,
    };
  }
  return {
    outcome: "clarification-required",
    resultingSceneCount,
    maximumScenes: input.maximumScenes,
    alternatives: [...APPEND_BUDGET_ALTERNATIVES],
    reasonCode: "APPEND_SCENE_BUDGET_EXCEEDED",
    policyVersion: input.policyVersion,
  };
}
