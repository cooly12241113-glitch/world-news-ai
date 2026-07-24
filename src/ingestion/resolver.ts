import { IngestionError } from "./error";
import { validatePublicUrl } from "./url-policy";
import type {
  IngestionRequest,
  IngestionTrace,
  ResolvedInput,
  ResponseMetadata,
} from "./types";

export interface InputResolverOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  maxRedirects?: number;
  maxRetries?: number;
  retryBackoffMs?: number;
  userAgent?: string;
  delay?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
}

const DEFAULTS = {
  timeoutMs: 10_000,
  maxResponseBytes: 5_000_000,
  maxRedirects: 5,
  maxRetries: 2,
  retryBackoffMs: 200,
  userAgent: "WorldNewsAI-Ingestion/1.0",
} as const;

const parseContentType = (
  value: string | null,
): { mediaType?: string; charset?: string } => {
  if (value === null) {
    return {};
  }
  const [mediaType, ...parameters] = value.split(";").map((part) => part.trim());
  const charsetParameter = parameters.find((part) =>
    part.toLowerCase().startsWith("charset="),
  );
  return {
    mediaType: mediaType?.toLowerCase(),
    charset: charsetParameter?.slice("charset=".length).replace(/^"|"$/g, ""),
  };
};

const headersToRecord = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

const isRetryableStatus = (status: number): boolean =>
  status === 429 || status >= 500;

export class InputResolver {
  readonly #options: Required<InputResolverOptions>;

  constructor(options: InputResolverOptions = {}) {
    this.#options = {
      fetch: options.fetch ?? fetch,
      timeoutMs: options.timeoutMs ?? DEFAULTS.timeoutMs,
      maxResponseBytes: options.maxResponseBytes ?? DEFAULTS.maxResponseBytes,
      maxRedirects: options.maxRedirects ?? DEFAULTS.maxRedirects,
      maxRetries: options.maxRetries ?? DEFAULTS.maxRetries,
      retryBackoffMs: options.retryBackoffMs ?? DEFAULTS.retryBackoffMs,
      userAgent: options.userAgent ?? DEFAULTS.userAgent,
      delay:
        options.delay ??
        ((milliseconds) =>
          new Promise((resolve) => setTimeout(resolve, milliseconds))),
      now: options.now ?? (() => new Date()),
    };
  }

  async resolve(
    request: IngestionRequest,
    trace: IngestionTrace,
  ): Promise<ResolvedInput> {
    if (request.kind === "content") {
      if (request.content.trim().length === 0) {
        throw new IngestionError(
          "INVALID_INPUT",
          "Content input must not be empty",
          "input",
        );
      }
      const sourceUrl =
        request.sourceUrl === undefined
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
        retrievedAt:
          request.retrievedAt ?? this.#options.now().toISOString(),
        warnings: [],
      };
    }

    const requestedUrl = validatePublicUrl(request.url).toString();
    return this.#fetchUrl(request, requestedUrl, trace);
  }

  async #fetchUrl(
    request: Extract<IngestionRequest, { kind: "url" }>,
    requestedUrl: string,
    trace: IngestionTrace,
  ): Promise<ResolvedInput> {
    let currentUrl = requestedUrl;
    let redirectCount = 0;
    let attempt = 0;

    while (true) {
      validatePublicUrl(currentUrl);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.#options.timeoutMs);
      let response: Response;
      try {
        response = await this.#options.fetch(currentUrl, {
          redirect: "manual",
          headers: { "user-agent": this.#options.userAgent },
          signal: controller.signal,
        });
      } catch (cause) {
        clearTimeout(timeout);
        const timedOut =
          cause instanceof DOMException && cause.name === "AbortError";
        trace.fetchAttempts.push({
          url: currentUrl,
          attempt: attempt + 1,
          errorCode: timedOut ? "FETCH_TIMEOUT" : "FETCH_FAILED",
        });
        throw new IngestionError(
          timedOut ? "FETCH_TIMEOUT" : "FETCH_FAILED",
          timedOut ? "Request timed out" : "Network request failed",
          "resolve",
          { retryable: true, cause },
        );
      }
      clearTimeout(timeout);
      trace.fetchAttempts.push({
        url: currentUrl,
        attempt: attempt + 1,
        status: response.status,
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (location === null) {
          throw new IngestionError(
            "HTTP_STATUS_ERROR",
            "Redirect response did not include a location",
            "resolve",
            { context: { status: response.status } },
          );
        }
        if (redirectCount >= this.#options.maxRedirects) {
          throw new IngestionError(
            "TOO_MANY_REDIRECTS",
            "Redirect limit exceeded",
            "resolve",
          );
        }
        const nextUrl = new URL(location, currentUrl).toString();
        validatePublicUrl(nextUrl);
        trace.redirects.push({
          from: currentUrl,
          to: nextUrl,
          status: response.status,
        });
        currentUrl = nextUrl;
        redirectCount += 1;
        continue;
      }

      if (!response.ok) {
        if (
          isRetryableStatus(response.status) &&
          attempt < this.#options.maxRetries
        ) {
          attempt += 1;
          await this.#options.delay(
            this.#options.retryBackoffMs * 2 ** (attempt - 1),
          );
          continue;
        }
        throw new IngestionError(
          "HTTP_STATUS_ERROR",
          `HTTP request failed with status ${response.status}`,
          "resolve",
          {
            retryable: isRetryableStatus(response.status),
            context: { status: response.status },
          },
        );
      }

      const declaredLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > this.#options.maxResponseBytes
      ) {
        throw new IngestionError(
          "RESPONSE_TOO_LARGE",
          "Response exceeds configured size limit",
          "resolve",
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > this.#options.maxResponseBytes) {
        throw new IngestionError(
          "RESPONSE_TOO_LARGE",
          "Response exceeds configured size limit",
          "resolve",
        );
      }

      const contentType = parseContentType(response.headers.get("content-type"));
      let content: string;
      try {
        content = new TextDecoder(contentType.charset ?? "utf-8", {
          fatal: true,
        }).decode(bytes);
      } catch (cause) {
        throw new IngestionError(
          "UNSUPPORTED_CONTENT_TYPE",
          "Response charset could not be decoded",
          "resolve",
          { cause },
        );
      }

      const responseMetadata: ResponseMetadata = {
        status: response.status,
        headers: headersToRecord(response.headers),
        redirectCount,
      };
      return {
        originalInput: request,
        requestedUrl,
        finalUrl: currentUrl,
        mediaType: contentType.mediaType,
        charset: contentType.charset ?? "utf-8",
        content,
        byteLength: bytes.byteLength,
        retrievedAt:
          request.retrievedAt ?? this.#options.now().toISOString(),
        responseMetadata,
        warnings: [],
      };
    }
  }
}
