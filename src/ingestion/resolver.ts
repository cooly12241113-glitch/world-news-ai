import { IngestionError } from "./error";
import { validatePublicUrl } from "./url-policy";
import type {
  IngestionRequest,
  IngestionTrace,
  ResolvedInput,
} from "./types";

export interface InputResolverOptions {
  now?: () => Date;
}

const parseContentType = (
  value: string | null,
): { mediaType?: string; charset?: string } => {
  if (value === null) return {};
  const [mediaType, ...parameters] = value.split(";").map((part) => part.trim());
  const charsetParameter = parameters.find((part) =>
    part.toLowerCase().startsWith("charset="),
  );
  return {
    mediaType: mediaType?.toLowerCase(),
    charset: charsetParameter?.slice("charset=".length).replace(/^"|"$/g, ""),
  };
};

/** Resolves already-materialized content. It intentionally has no network authority. */
export class InputResolver {
  readonly #now: () => Date;

  constructor(options: InputResolverOptions = {}) {
    this.#now = options.now ?? (() => new Date());
  }

  async resolve(
    request: IngestionRequest,
    _trace: IngestionTrace,
  ): Promise<ResolvedInput> {
    if (request.kind === "url") {
      throw new IngestionError(
        "SAFE_ACQUISITION_REQUIRED",
        "URL ingestion requires an authoritative safe acquisition result",
        "resolve",
      );
    }
    if (request.content.trim().length === 0) {
      throw new IngestionError(
        "INVALID_INPUT",
        "Content input must not be empty",
        "input",
      );
    }
    const sourceUrl = request.sourceUrl === undefined
      ? undefined
      : validatePublicUrl(request.sourceUrl).toString();
    const contentType = parseContentType(
      request.mediaType ?? request.hints?.mediaType ?? null,
    );
    return {
      originalInput: request,
      requestedUrl: sourceUrl,
      finalUrl: sourceUrl,
      mediaType: contentType.mediaType,
      charset: contentType.charset ?? "utf-8",
      content: request.content,
      byteLength: new TextEncoder().encode(request.content).byteLength,
      retrievedAt: request.retrievedAt ?? this.#now().toISOString(),
      warnings: [],
    };
  }
}
