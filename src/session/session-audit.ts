import type { SessionCommandType } from "./session-command";

export type SessionTransitionOutcome =
  | "accepted"
  | "rejected"
  | "ignored-stale"
  | "failed";

export interface SessionAuditRecord {
  auditRecordId: string;
  sessionId: string;
  commandType: SessionCommandType;
  previousFingerprint: string;
  nextFingerprint?: string;
  transitionOutcome: SessionTransitionOutcome;
  errorCode?: string;
  sceneId: string;
  operationId?: string;
  policyVersion: string;
  occurredAt: string;
}
