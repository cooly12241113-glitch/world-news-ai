import type { BriefingRunResult } from "./types";

export function isCurrentBriefingRun(
  expectedRunId: string,
  result: Pick<BriefingRunResult, "runId">,
): boolean {
  return expectedRunId.length > 0 && result.runId === expectedRunId;
}
