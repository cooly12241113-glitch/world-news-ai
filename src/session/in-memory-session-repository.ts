import { createBriefingSessionFingerprint } from "./session-fingerprint";
import type { BriefingSessionRepository } from "./session-repository";
import {
  SessionRepositoryConflictError,
  SessionRepositoryValidationError,
} from "./errors";
import {
  BriefingSessionSchema,
  SessionAuditRecordSchema,
} from "./session-validator";
import type { BriefingSession } from "./briefing-session";
import type { SessionAuditRecord } from "./session-audit";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function parseSession(session: BriefingSession): BriefingSession {
  const parsed = BriefingSessionSchema.safeParse(session);
  if (!parsed.success) {
    throw new SessionRepositoryValidationError(parsed.error.message);
  }
  if (createBriefingSessionFingerprint(parsed.data) !== parsed.data.semanticFingerprint) {
    throw new SessionRepositoryValidationError(
      "Briefing session semantic fingerprint is invalid",
    );
  }
  return parsed.data;
}

export class InMemoryBriefingSessionRepository
  implements BriefingSessionRepository
{
  private readonly sessions = new Map<string, BriefingSession>();
  private readonly audits = new Map<string, SessionAuditRecord[]>();

  async create(session: BriefingSession): Promise<void> {
    const parsed = parseSession(session);
    if (this.sessions.has(parsed.sessionId)) {
      throw new SessionRepositoryConflictError();
    }
    this.sessions.set(parsed.sessionId, clone(parsed));
  }

  async getById(sessionId: string): Promise<BriefingSession | undefined> {
    const value = this.sessions.get(sessionId);
    return value === undefined ? undefined : clone(parseSession(value));
  }

  async save(
    session: BriefingSession,
    expectedSessionFingerprint: string,
  ): Promise<void> {
    const parsed = parseSession(session);
    const current = this.sessions.get(parsed.sessionId);
    if (
      current === undefined ||
      current.semanticFingerprint !== expectedSessionFingerprint
    ) {
      throw new SessionRepositoryConflictError();
    }
    this.sessions.set(parsed.sessionId, clone(parsed));
  }

  async appendAuditRecord(record: SessionAuditRecord): Promise<void> {
    const parsed = SessionAuditRecordSchema.safeParse(record);
    if (!parsed.success) {
      throw new SessionRepositoryValidationError(parsed.error.message);
    }
    const records = this.audits.get(parsed.data.sessionId) ?? [];
    records.push(clone(parsed.data));
    this.audits.set(parsed.data.sessionId, records);
  }

  async listAuditRecordsBySession(
    sessionId: string,
  ): Promise<SessionAuditRecord[]> {
    return clone(this.audits.get(sessionId) ?? []);
  }
}
