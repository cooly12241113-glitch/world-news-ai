import type { FollowUpExecutionOutcome } from "@world-news-ai/application-follow-up";
import type { ValidatedBriefingScript } from "@world-news-ai/script-web";
import { adaptBriefingScript, type RenderableBriefing } from "../../renderer/presentation-adapter";

export interface AtomicScriptApplication {
  script: ValidatedBriefingScript;
  presentation: RenderableBriefing;
  sceneIndex: number;
}

export function applyReplacementAtomically(
  previousScript: ValidatedBriefingScript,
  replacementScript: ValidatedBriefingScript | undefined,
  outcome: FollowUpExecutionOutcome,
): AtomicScriptApplication {
  if (outcome.outcome !== "replacement-applied" || !replacementScript) {
    throw new Error("A validated replacement outcome and Script are required.");
  }
  const adapted = adaptBriefingScript(replacementScript);
  if (
    !adapted.success ||
    replacementScript.fingerprint !== outcome.replacementScriptFingerprint ||
    adapted.value.fingerprint !== outcome.nextSession.scriptFingerprint ||
    adapted.value.scenes[outcome.nextSceneCursor.sceneIndex]?.id !==
      outcome.nextSceneCursor.sceneId
  ) {
    throw new Error("Replacement identities are inconsistent.");
  }
  if (previousScript.fingerprint !== outcome.previousScriptFingerprint) {
    throw new Error("Replacement does not target the active Script.");
  }
  return {
    script: replacementScript,
    presentation: adapted.value,
    sceneIndex: outcome.nextSceneCursor.sceneIndex,
  };
}
