import type { DossierRevision, EventDossier } from "./models";

export interface EventDossierRepository {
  findLatestByEventId(eventId: string): EventDossier | undefined;
  findByDossierId(dossierId: string): EventDossier | undefined;
}

export interface DossierRevisionRepository {
  saveRevision(
    revision: DossierRevision,
    expectedPreviousRevisionNumber: number,
  ): void;
  findRevisionById(revisionId: string): DossierRevision | undefined;
  listRevisionHistory(dossierId: string): DossierRevision[];
}

export interface DossierRepositories {
  dossiers: EventDossierRepository;
  revisions: DossierRevisionRepository;
}

export interface DossierUnitOfWork {
  readonly repositories: DossierRepositories;
  transaction<T>(work: (repositories: DossierRepositories) => T): T;
}
