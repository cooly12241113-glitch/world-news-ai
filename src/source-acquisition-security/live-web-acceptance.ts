import { ProductionAcquisitionOrchestrator } from "../acquisition-orchestration";
import type { IngestionHints } from "../ingestion";
import { NodeDnsResolver } from "./dns";
import { LiveWebSourceConnector } from "./live-source-connectors";
import { NodePinnedResponseHeadTransport } from "./response-head-transport";
import { SafeNetworkAcquisitionRuntime } from "./safe-runtime";

export interface LiveWebAcceptanceInput {
  url: string;
  requestId?: string;
  hints?: IngestionHints;
}

export type LiveWebAcceptanceResult =
  | {
      success: true;
      connectorId: "web";
      terminalHttpClass: "2xx";
      acquisitionId: string;
      sourceIdentity: string;
      rawArtifactId: string;
      contentHash: string;
      mediaType: "text/html";
      sourceDocumentId: string;
      sourceDocumentProduced: true;
      contentHashProduced: true;
      acquisitionIdentityProduced: true;
      persistenceEnabled: false;
      refetchObserved: false;
      redecodeObserved: false;
    }
  | {
      success: false;
      stage:
        | "configuration"
        | "acquisition"
        | "persistence"
        | "bridge"
        | "ingestion"
        | "source-document"
        | "unknown";
      reasonCode: string;
    };

const safeFailure = (
  result: Awaited<ReturnType<ProductionAcquisitionOrchestrator["execute"]>>,
): LiveWebAcceptanceResult => {
  if (result.success) throw new Error("LIVE_WEB_ACCEPTANCE_RESULT_MISMATCH");
  if (result.stage === "acquisition") {
    return {
      success: false,
      stage: "acquisition",
      reasonCode: result.acquisition.reasonCode,
    };
  }
  if (result.stage === "bridge") {
    return { success: false, stage: "bridge", reasonCode: result.error.code };
  }
  if (result.stage === "ingestion") {
    return {
      success: false,
      stage: "ingestion",
      reasonCode: result.ingestion.error.code,
    };
  }
  return {
    success: false,
    stage: result.ingestion.success ? "persistence" : "ingestion",
    reasonCode: result.ingestion.success
      ? result.persistence.result.reasonCode
      : result.ingestion.error.code,
  };
};

/**
 * Explicit opt-in real-world acceptance composition. It returns identifiers
 * and bounded status only; raw URL, headers, body, query, and native errors are
 * never included. Raw persistence is deliberately unavailable in this path.
 */
export const runLiveWebAcceptance = async (
  input: LiveWebAcceptanceInput,
): Promise<LiveWebAcceptanceResult> => {
  if (input.url.trim().length === 0) {
    return {
      success: false,
      stage: "configuration",
      reasonCode: "LIVE_WEB_URL_REQUIRED",
    };
  }
  const runtime = new SafeNetworkAcquisitionRuntime({
    resolver: new NodeDnsResolver(),
    transport: new NodePinnedResponseHeadTransport(),
  });
  const connector = new LiveWebSourceConnector(runtime);
  const result = await new ProductionAcquisitionOrchestrator(connector).execute({
    acquisition: {
      requestId: input.requestId ?? "live-web-manual-acceptance",
      connectorId: "web",
      locator: { kind: "web", url: input.url },
      requestedContentKind: "html",
      accessPolicy: { access: "public-only" },
    },
    ...(input.hints === undefined ? {} : { bridgeOptions: { hints: input.hints } }),
  });
  if (!result.success) return safeFailure(result);
  if (result.acquisition.rawArtifact.mediaType !== "text/html") {
    return {
      success: false,
      stage: "acquisition",
      reasonCode: "LIVE_WEB_MEDIA_TYPE_MISMATCH",
    };
  }
  return {
    success: true,
    connectorId: "web",
    terminalHttpClass: "2xx",
    acquisitionId: result.acquisition.acquisitionId,
    sourceIdentity: result.acquisition.sourceIdentity,
    rawArtifactId: result.acquisition.rawArtifact.artifactId,
    contentHash: result.acquisition.rawArtifact.contentHash,
    mediaType: result.acquisition.rawArtifact.mediaType,
    sourceDocumentId: result.ingestion.document.id,
    sourceDocumentProduced: true,
    contentHashProduced: true,
    acquisitionIdentityProduced: true,
    persistenceEnabled: false,
    refetchObserved: false,
    redecodeObserved: false,
  };
};
