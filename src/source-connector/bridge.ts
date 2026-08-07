import type { IngestionRequest } from "../ingestion";
import type {
  AcquisitionBridgeOptions,
  AcquisitionBridgeResult,
  SourceLocator,
} from "./models";
import { SourceAcquisitionSuccessSchema } from "./validation";

const webUrl = (locator: SourceLocator): string | undefined =>
  locator.kind === "web" ? locator.url : undefined;

export class SourceAcquisitionIngestionBridge {
  project(
    input: unknown,
    options: AcquisitionBridgeOptions = {},
  ): AcquisitionBridgeResult {
    const parsed = SourceAcquisitionSuccessSchema.safeParse(input);
    if (!parsed.success) {
      return {
        success: false,
        error: {
          code: "INVALID_ACQUISITION_RESULT",
          message: "Acquisition success result failed runtime validation.",
        },
      };
    }
    const result = parsed.data;
    const sourceUrl = webUrl(result.canonicalLocator ?? result.locator);
    if (sourceUrl === undefined) {
      return {
        success: false,
        error: {
          code: "UNSUPPORTED_LOCATOR",
          message: "Existing ingestion currently requires a Web locator.",
        },
      };
    }
    if (!["text", "html"].includes(result.rawArtifact.contentKind)) {
      return {
        success: false,
        error: {
          code: "UNSUPPORTED_CONTENT_KIND",
          message: "Existing ingestion currently accepts connector text or HTML only.",
        },
      };
    }
    const ingestionRequest: IngestionRequest = {
      kind: "content",
      content: result.content.text,
      mediaType: result.rawArtifact.mediaType,
      sourceUrl,
      retrievedAt: result.acquiredAt,
      ...(options.hints ? { hints: options.hints } : {}),
    };
    return {
      success: true,
      projection: {
        ingestionRequest,
        provenance: {
          connectorId: result.connectorId,
          connectorVersion: result.trace.connectorVersion,
          requestId: result.trace.requestId,
          acquisitionId: result.acquisitionId,
          sourceIdentity: result.sourceIdentity,
          rawArtifactId: result.rawArtifact.artifactId,
        },
      },
    };
  }
}
