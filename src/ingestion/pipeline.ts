import {
  GenericHtmlCapability,
  PlainTextCapability,
} from "./capabilities";
import { IngestionError } from "./error";
import { mapSourceDocument } from "./mapper";
import {
  normalizeExtraction,
  type NormalizationOptions,
} from "./normalize";
import { probeContent } from "./probe";
import { CapabilityRegistry } from "./registry";
import {
  InputResolver,
  type InputResolverOptions,
} from "./resolver";
import { createTrace } from "./trace";
import type {
  IngestionCapability,
  IngestionRequest,
  IngestionResult,
} from "./types";

export interface IngestionPipelineOptions
  extends InputResolverOptions,
    NormalizationOptions {
  capabilities?: readonly IngestionCapability[];
}

export class IngestionPipeline {
  readonly #resolver: InputResolver;
  readonly #registry: CapabilityRegistry;
  readonly #normalizationOptions: NormalizationOptions;

  constructor(options: IngestionPipelineOptions = {}) {
    this.#resolver = new InputResolver(options);
    this.#registry = new CapabilityRegistry();
    for (const capability of options.capabilities ?? [
      new GenericHtmlCapability(),
      new PlainTextCapability(),
    ]) {
      this.#registry.register(capability);
    }
    this.#normalizationOptions = {
      minimumBodyLength: options.minimumBodyLength,
      classificationThreshold: options.classificationThreshold,
    };
  }

  async ingest(request: IngestionRequest): Promise<IngestionResult> {
    const trace = createTrace(request);
    let warnings: string[] = [];
    try {
      const input = await this.#resolver.resolve(request, trace);
      trace.completedStages.push("resolve");
      const probe = probeContent(input);
      trace.declaredContentType = probe.declaredMediaType;
      trace.detectedFormat = probe.detectedFormat;
      if (probe.structuralSignals.includes("declared-content-type-mismatch")) {
        input.warnings.push(
          "Declared Content-Type conflicts with detected content format",
        );
      }
      trace.completedStages.push("probe");
      if (probe.detectedFormat === "unknown") {
        throw new IngestionError(
          "UNSUPPORTED_FORMAT",
          "Binary or unknown content is not supported",
          "probe",
        );
      }
      const selection = this.#registry.select(input, probe);
      trace.capabilityEvaluations = selection.evaluations;
      trace.selectedCapability = selection.capability.id;
      trace.selectedCapabilityReasons = selection.selectedReasons;
      trace.completedStages.push("select");
      const extraction = selection.capability.extract(input, probe);
      trace.completedStages.push("extract");
      const normalized = normalizeExtraction(
        input,
        extraction,
        this.#normalizationOptions,
      );
      warnings = normalized.warnings;
      trace.metadataSelections = normalized.extractionTrace;
      trace.normalizationWarnings = normalized.warnings;
      trace.classificationConfidence = normalized.documentTypeConfidence;
      trace.fingerprintGenerated = true;
      trace.completedStages.push("normalize", "classify", "fingerprint");
      const document = mapSourceDocument(normalized);
      trace.validationSucceeded = true;
      trace.completedStages.push("validate", "map");
      return {
        success: true,
        document,
        normalizedDocument: normalized,
        trace,
        warnings,
      };
    } catch (error) {
      const ingestionError =
        error instanceof IngestionError
          ? error
          : new IngestionError(
              "MAPPING_FAILED",
              "Unexpected ingestion failure",
              "map",
              { cause: error },
            );
      return {
        success: false,
        error: ingestionError.details,
        trace,
        warnings,
      };
    }
  }
}
