import { isCurrentBriefingRun, type BriefingRunResult } from "@world-news-ai/application-briefing-run";
import type { BriefingSession } from "@world-news-ai/session";
import type { ValidatedBriefingScript } from "@world-news-ai/script-web";
import { adaptBriefingScript, type RenderableBriefing } from "../../renderer/presentation-adapter";
import type { LocalBriefingRuntimeHandle } from "./local-briefing-runtime";

export type BootstrapState =
  | { status: "loading" }
  | { status: "ready"; script: ValidatedBriefingScript; session: BriefingSession; presentation: RenderableBriefing }
  | { status: "terminal-unavailable"; message: string };

export function completedBootstrapState(result: BriefingRunResult): BootstrapState {
  if (result.outcome.kind !== "completed") {
    return { status: "terminal-unavailable", message: "The fixture briefing is temporarily unavailable." };
  }
  const presentation = adaptBriefingScript(result.outcome.script);
  if (!presentation.success) {
    return { status: "terminal-unavailable", message: "The fixture briefing could not be prepared." };
  }
  return {
    status: "ready",
    script: result.outcome.script,
    session: result.outcome.session,
    presentation: presentation.value,
  };
}

export class BootstrapRunController {
  private current?: LocalBriefingRuntimeHandle;

  replace(handle: LocalBriefingRuntimeHandle): void {
    this.current?.cancel();
    this.current = handle;
  }

  accepts(result: BriefingRunResult): boolean {
    return this.current !== undefined && isCurrentBriefingRun(this.current.runId, result);
  }

  cancel(): void {
    this.current?.cancel();
    this.current = undefined;
  }
}
