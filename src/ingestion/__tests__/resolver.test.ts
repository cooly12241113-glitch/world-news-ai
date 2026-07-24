import { describe, expect, it, vi } from "vitest";
import { IngestionPipeline, InputResolver, createTrace } from "../index";
import type { IngestionRequest } from "../index";

const request: IngestionRequest = {
  kind: "url",
  url: "https://example.com/document",
  retrievedAt: "2026-07-24T00:00:00.000Z",
};

const response = (
  body: string,
  status = 200,
  headers: Record<string, string> = { "content-type": "text/plain; charset=utf-8" },
): Response => new Response(body, { status, headers });

describe("InputResolver", () => {
  it("resolves content input without a network request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const resolver = new InputResolver({ fetch: fetchMock });
    const contentRequest: IngestionRequest = {
      kind: "content",
      content: "Title\n\nA sufficiently long plain text body.",
      mediaType: "text/plain",
      sourceUrl: "https://example.com/plain",
      retrievedAt: "2026-07-24T00:00:00.000Z",
    };
    const result = await resolver.resolve(contentRequest, createTrace(contentRequest));
    expect(result.content).toContain("plain text");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves response metadata and sends an explicit user agent", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response("Document content that is long enough."),
    );
    const resolver = new InputResolver({ fetch: fetchMock });
    const result = await resolver.resolve(request, createTrace(request));
    expect(result.responseMetadata?.status).toBe(200);
    expect(result.mediaType).toBe("text/plain");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      "user-agent": "WorldNewsAI-Ingestion/1.0",
    });
  });

  it("revalidates redirect destinations and rejects unsafe redirects", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response("", 302, { location: "http://127.0.0.1/private" }),
    );
    const pipeline = new IngestionPipeline({ fetch: fetchMock });
    const result = await pipeline.ingest(request);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("UNSAFE_URL");
    }
  });

  it("rejects excessive redirects", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      response("", 302, { location: `${String(url)}/next` }),
    );
    const pipeline = new IngestionPipeline({ fetch: fetchMock, maxRedirects: 1 });
    const result = await pipeline.ingest(request);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("TOO_MANY_REDIRECTS");
    }
  });

  it.each([500, 503, 429])(
    "retries retryable HTTP status %s with injected delay",
    async (status) => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(response("", status))
        .mockResolvedValueOnce(response("", status))
        .mockResolvedValueOnce(response("successful response body"));
      const delay = vi.fn(async () => undefined);
      const resolver = new InputResolver({
        fetch: fetchMock,
        maxRetries: 2,
        retryBackoffMs: 10,
        delay,
      });
      const result = await resolver.resolve(request, createTrace(request));
      expect(result.content).toBe("successful response body");
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(delay).toHaveBeenNthCalledWith(1, 10);
      expect(delay).toHaveBeenNthCalledWith(2, 20);
    },
  );

  it("converts 4xx into a non-retryable structured error", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(response("", 404));
    const pipeline = new IngestionPipeline({ fetch: fetchMock });
    const result = await pipeline.ingest(request);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("HTTP_STATUS_ERROR");
      expect(result.error.retryable).toBe(false);
      expect(result.error.context?.status).toBe(404);
    }
  });

  it("enforces the configured response-size limit", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      response("a".repeat(101), 200, {
        "content-type": "text/plain",
        "content-length": "101",
      }),
    );
    const pipeline = new IngestionPipeline({
      fetch: fetchMock,
      maxResponseBytes: 100,
    });
    const result = await pipeline.ingest(request);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("RESPONSE_TOO_LARGE");
    }
  });

  it("converts aborts into FETCH_TIMEOUT", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const pipeline = new IngestionPipeline({ fetch: fetchMock, timeoutMs: 1 });
    const result = await pipeline.ingest(request);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe("FETCH_TIMEOUT");
      expect(result.error.retryable).toBe(true);
    }
  });
});
