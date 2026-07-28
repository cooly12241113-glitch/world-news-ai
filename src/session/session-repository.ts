import type { BriefingSession } from "./briefing-session";
import type { SessionAuditRecord } from "./session-audit";

export interface BriefingSessionRepository {
  create(session: BriefingSession): Promise<void>;
  getById(sessionId: string): Promise<BriefingSession | undefined>;
  save(
    session: BriefingSession,
    expectedSessionFingerprint: string,
  ): Promise<void>;
  appendAuditRecord(record: SessionAuditRecord): Promise<void>;
  listAuditRecordsBySession(sessionId: string): Promise<SessionAuditRecord[]>;
}
