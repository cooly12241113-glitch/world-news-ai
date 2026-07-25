import { ExplanationPlanValidator, type ValidatedExplanationPlan } from "../../explanation";
import { assembled } from "../../explanation/__tests__/fixtures";
import { RuleBasedBriefingScriptCompiler } from "../compiler";
import type { BriefingScriptCompileInput, BriefingScriptDraft, PresentationMode } from "../models";
import { presentationPreference } from "../presentation";

export const now = "2026-07-25T00:00:00.000Z";

export function compileInput(mode: PresentationMode = "auto"): BriefingScriptCompileInput {
  const { input, plan } = assembled();
  const validation = new ExplanationPlanValidator().validate(plan, input.contract, input.contextPackage);
  if (!("plan" in validation)) throw new Error("validated plan missing");
  return {
    plan: validation.plan as ValidatedExplanationPlan,
    contract: input.contract, contextPackage: input.contextPackage,
    preference: presentationPreference(mode),
  };
}

export function compiled(mode: PresentationMode = "auto"): {
  input: BriefingScriptCompileInput; script: BriefingScriptDraft;
} {
  const input = compileInput(mode);
  const result = new RuleBasedBriefingScriptCompiler(() => new Date(now)).compile(input);
  if (!result.success || !("script" in result)) {
    throw new Error("script compilation failed");
  }
  return { input, script: result.script };
}
