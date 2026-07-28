import type { DeterministicSessionContext } from "@world-news-ai/session";

export interface FollowUpRuntimeContext {
  nextId(prefix: string): string;
  now(): string;
}

export const browserFollowUpRuntimeContext: FollowUpRuntimeContext = {
  nextId: (prefix) => `${prefix}:${crypto.randomUUID()}`,
  now: () => new Date().toISOString(),
};

export function sessionTransitionContext(
  runtime: FollowUpRuntimeContext,
  policyVersion: string,
): DeterministicSessionContext {
  return {
    transitionTimestamp: runtime.now(),
    eventId: runtime.nextId("event"),
    auditRecordId: runtime.nextId("audit"),
    policyVersion,
  };
}
