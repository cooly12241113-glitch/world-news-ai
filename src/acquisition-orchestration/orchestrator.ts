import { IngestionPipeline } from "../ingestion";
import {
  rawCandidateFromBoundedAcquisition,
  type RawPersistenceResult,
} from "../raw-persistence";
import { SourceAcquisitionIngestionBridge } from "../source-connector";
import {
  SafeNetworkAcquisitionRuntime,
  SafeRuntimeFixtureConnector,
} from "../source-acquisition-security";
import type {
  ProductionAcquisitionRequest,
  ProductionAcquisitionResult,
  ProductionAcquisitionSummary,
} from "./models";

const acquisitionSummary = (
  acquisition: import("../source-connector").SourceAcquisitionSuccess,
): ProductionAcquisitionSummary => ({
  connectorId: acquisition.connectorId,
  requestId: acquisition.trace.requestId,
  acquisitionId: acquisition.acquisitionId,
  sourceIdentity: acquisition.sourceIdentity,
  rawArtifact: acquisition.rawArtifact,
  acquiredAt: acquisition.acquiredAt,
});

/**
 * Executes one safe acquisition, then branches its exact bounded result to
 * optional governed raw persistence and materialized-content ingestion.
 */
export class ProductionAcquisitionOrchestrator {
  readonly #connector: SafeRuntimeFixtureConnector;
  readonly #bridge: SourceAcquisitionIngestionBridge;
  readonly #pipeline: IngestionPipeline;

  constructor(
    runtime: SafeNetworkAcquisitionRuntime,
    options: {
      bridge?: SourceAcquisitionIngestionBridge;
      pipeline?: IngestionPipeline;
      now?: () => string;
    } = {},
  ) {
    this.#connector = new SafeRuntimeFixtureConnector(runtime, options.now);
    this.#bridge = options.bridge ?? new SourceAcquisitionIngestionBridge();
    this.#pipeline = options.pipeline ?? new IngestionPipeline();
  }

  async execute(input: ProductionAcquisitionRequest): Promise<ProductionAcquisitionResult> {
    const detailed = await this.#connector.acquireDetailed(
      input.acquisition,
      input.executionContext,
    );
    if (!detailed.success) {
      return {
        success: false,
        stage: "acquisition",
        acquisition: detailed.sourceAcquisition,
      };
    }

    const persistence = input.rawPersistence === undefined
      ? { requested: false as const }
      : {
          requested: true as const,
          result: input.rawPersistence.service.persist(
            rawCandidateFromBoundedAcquisition(
              detailed.boundedAcquisition,
              input.acquisition,
              input.rawPersistence.policy,
              input.rawPersistence.context,
            ),
          ),
        };
    const acquisition = acquisitionSummary(detailed.sourceAcquisition);

    const bridged = this.#bridge.project(
      detailed.sourceAcquisition,
      input.bridgeOptions,
    );
    if (!bridged.success) {
      return {
        success: false,
        stage: "bridge",
        acquisition,
        persistence,
        error: bridged.error,
      };
    }
    const ingestion = await this.#pipeline.ingest(
      bridged.projection.ingestionRequest,
    );
    if (persistence.requested && !persistence.result.success) {
      return {
        success: false,
        stage: "persistence",
        acquisition,
        persistence: {
          requested: true,
          result: persistence.result,
        },
        ingestion,
        provenance: bridged.projection.provenance,
      };
    }
    if (!ingestion.success) {
      return {
        success: false,
        stage: "ingestion",
        acquisition,
        persistence,
        ingestion,
        provenance: bridged.projection.provenance,
      };
    }
    return {
      success: true,
      outcome: persistence.requested ? "persisted-and-ingested" : "ingested",
      acquisition,
      persistence: persistence as { requested: false } | {
        requested: true;
        result: Extract<RawPersistenceResult, { success: true }>;
      },
      ingestion,
      provenance: bridged.projection.provenance,
    };
  }
}
