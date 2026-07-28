import type { ReplanRequest } from "./replan-request";
import type { ReplanResult } from "./replan-result";

export interface ReplanAdapter {
  readonly id: string;
  readonly deterministic: true;
  prepare(request: ReplanRequest): ReplanResult;
}
