import {
  IngestionPipeline,
  type IngestionResult,
} from "../ingestion";
import {
  SourceAcquisitionIngestionBridge,
  type AcquisitionBridgeOptions,
  type AcquisitionProvenance,
  type SourceAcquisitionFailure,
  type SourceAcquisitionRequest,
  type SourceAcquisitionSuccess,
  type SourceConnectorExecutionContext,
} from "../source-connector";
import {
  SafeRuntimeFixtureConnector,
} from "./runtime-source-connector";
import { SafeNetworkAcquisitionRuntime } from "./safe-runtime";

type SuccessfulIngestion = Extract<IngestionResult, { success: true }>;
type FailedIngestion = Extract<IngestionResult, { success: false }>;

export type SafeNetworkIngestionResult =
  | {
      success: true;
      acquisition: SourceAcquisitionSuccess;
      ingestion: SuccessfulIngestion;
      provenance: AcquisitionProvenance;
    }
  | { success: false; stage: "acquisition"; acquisition: SourceAcquisitionFailure }
  | {
      success: false;
      stage: "bridge";
      error: { code: string; message: string };
    }
  | { success: false; stage: "ingestion"; ingestion: FailedIngestion };

/**
 * The sole URL-to-ingestion composition boundary. Network acquisition remains
 * entirely inside the injected SafeNetworkAcquisitionRuntime executor.
 */
export class SafeNetworkIngestionService {
  readonly #connector: SafeRuntimeFixtureConnector;
  readonly #bridge: SourceAcquisitionIngestionBridge;
  readonly #pipeline: IngestionPipeline;

  constructor(
    executor: SafeNetworkAcquisitionRuntime,
    options: {
      pipeline?: IngestionPipeline;
      bridge?: SourceAcquisitionIngestionBridge;
      now?: () => string;
    } = {},
  ) {
    this.#connector = new SafeRuntimeFixtureConnector(executor, options.now);
    this.#bridge = options.bridge ?? new SourceAcquisitionIngestionBridge();
    this.#pipeline = options.pipeline ?? new IngestionPipeline();
  }

  async ingest(
    request: SourceAcquisitionRequest,
    context: SourceConnectorExecutionContext = {},
    bridgeOptions: AcquisitionBridgeOptions = {},
  ): Promise<SafeNetworkIngestionResult> {
    const acquisition = await this.#connector.acquire(request, context);
    if (!acquisition.success) {
      return { success: false, stage: "acquisition", acquisition };
    }
    const bridged = this.#bridge.project(acquisition, bridgeOptions);
    if (!bridged.success) {
      return { success: false, stage: "bridge", error: bridged.error };
    }
    const ingestion = await this.#pipeline.ingest(
      bridged.projection.ingestionRequest,
    );
    if (!ingestion.success) {
      return { success: false, stage: "ingestion", ingestion };
    }
    return {
      success: true,
      acquisition,
      ingestion,
      provenance: bridged.projection.provenance,
    };
  }
}
