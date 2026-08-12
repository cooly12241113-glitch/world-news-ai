import type { RawArtifactTombstone } from "../source-governance";
import type {
  RawArtifactAcquisitionOccurrence,
  RawPersistenceAuditEvent,
  StoredRawArtifact,
} from "./models";

export type RawArtifactInsertOutcome =
  | "artifact-inserted"
  | "blob-deduplicated"
  | "occurrence-inserted"
  | "occurrence-replayed";

export interface RawArtifactRepository {
  insert(
    record: StoredRawArtifact,
    occurrence: RawArtifactAcquisitionOccurrence,
  ): RawArtifactInsertOutcome;
  findActiveById(artifactId: string): StoredRawArtifact | undefined;
  listAcquisitions(artifactId: string): RawArtifactAcquisitionOccurrence[];
  findTombstone(artifactId: string): RawArtifactTombstone | undefined;
  listExpired(at: string): string[];
  deleteToTombstone(tombstone: RawArtifactTombstone): void;
  appendAudit(event: RawPersistenceAuditEvent): void;
  listAudit(artifactId: string): RawPersistenceAuditEvent[];
}
export interface RawPersistenceRepositories { rawArtifacts: RawArtifactRepository }
export interface RawPersistenceUnitOfWork {
  readonly rawRepositories: RawPersistenceRepositories;
  rawTransaction<T>(work: (repositories: RawPersistenceRepositories) => T): T;
}
export interface AtRestProtectionProvider {
  satisfies(requirement: "required-at-rest" | "platform-managed"): boolean;
}
