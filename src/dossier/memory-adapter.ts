import { DossierRevisionSchema, EventDossierSchema } from "./validation";
import type { DossierRevision, EventDossier } from "./models";
import type {
  DossierRepositories,
  DossierRevisionRepository,
  DossierUnitOfWork,
  EventDossierRepository,
} from "./persistence";

export class DossierRevisionConflictError extends Error {
  constructor() {
    super("Dossier revision conflict");
    this.name = "DossierRevisionConflictError";
  }
}

export class InMemoryDossierAdapter
  implements DossierUnitOfWork, EventDossierRepository, DossierRevisionRepository
{
  #dossiers = new Map<string, EventDossier>();
  #revisions = new Map<string, DossierRevision>();
  readonly repositories: DossierRepositories = {
    dossiers: this,
    revisions: this,
  };

  transaction<T>(work: (repositories: DossierRepositories) => T): T {
    const dossiers = structuredClone(this.#dossiers);
    const revisions = structuredClone(this.#revisions);
    try {
      return work(this.repositories);
    } catch (error) {
      this.#dossiers = dossiers;
      this.#revisions = revisions;
      throw error;
    }
  }

  findLatestByEventId(eventId: string): EventDossier | undefined {
    const value = [...this.#dossiers.values()].find(
      (dossier) => dossier.eventId === eventId,
    );
    return value === undefined
      ? undefined
      : EventDossierSchema.parse(structuredClone(value));
  }

  findByDossierId(dossierId: string): EventDossier | undefined {
    const value = this.#dossiers.get(dossierId);
    return value === undefined
      ? undefined
      : EventDossierSchema.parse(structuredClone(value));
  }

  saveRevision(
    value: DossierRevision,
    expectedPreviousRevisionNumber: number,
  ): void {
    const revision = DossierRevisionSchema.parse(structuredClone(value));
    const current = this.#dossiers.get(revision.dossierId);
    if ((current?.revisionNumber ?? 0) !== expectedPreviousRevisionNumber) {
      throw new DossierRevisionConflictError();
    }
    if (this.#revisions.has(revision.id)) {
      throw new DossierRevisionConflictError();
    }
    this.#revisions.set(revision.id, revision);
    this.#dossiers.set(revision.dossierId, revision.snapshot);
  }

  findRevisionById(revisionId: string): DossierRevision | undefined {
    const value = this.#revisions.get(revisionId);
    return value === undefined
      ? undefined
      : DossierRevisionSchema.parse(structuredClone(value));
  }

  listRevisionHistory(dossierId: string): DossierRevision[] {
    return [...this.#revisions.values()]
      .filter((revision) => revision.dossierId === dossierId)
      .sort((left, right) => left.revisionNumber - right.revisionNumber)
      .map((revision) => DossierRevisionSchema.parse(structuredClone(revision)));
  }
}
