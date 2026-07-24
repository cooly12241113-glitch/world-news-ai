import type {
  BuildEventDossierInput,
  BuildEventDossierResult,
} from "./models";
import { EventDossierBuilder } from "./builder";
import {
  DossierRevisionConflictError,
} from "./memory-adapter";
import type { DossierUnitOfWork } from "./persistence";

export class PersistentEventDossierService {
  constructor(
    readonly builder: EventDossierBuilder,
    readonly unitOfWork: DossierUnitOfWork,
  ) {}

  buildAndPersist(
    input: Omit<BuildEventDossierInput, "previousRevision">,
  ): BuildEventDossierResult | {
    success: false;
    error: {
      code: "REVISION_CONFLICT" | "DOSSIER_PERSISTENCE_FAILED";
      message: string;
    };
  } {
    const latest = this.unitOfWork.repositories.dossiers.findLatestByEventId(
      input.event.id,
    );
    const previousRevision =
      latest === undefined
        ? undefined
        : this.unitOfWork.repositories.revisions
            .listRevisionHistory(latest.id)
            .at(-1);
    const built = this.builder.build({ ...input, previousRevision });
    if (!built.success || built.outcome === "unchanged") return built;
    try {
      this.unitOfWork.transaction((repositories) => {
        repositories.revisions.saveRevision(
          built.revision,
          built.revision.revisionNumber - 1,
        );
      });
      return built;
    } catch (error) {
      return {
        success: false,
        error: {
          code:
            error instanceof DossierRevisionConflictError
              ? "REVISION_CONFLICT"
              : "DOSSIER_PERSISTENCE_FAILED",
          message: "Dossier revision could not be persisted",
        },
      };
    }
  }
}
