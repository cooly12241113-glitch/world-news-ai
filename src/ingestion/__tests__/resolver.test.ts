import { describe, expect, it, vi } from "vitest";
import { IngestionPipeline, InputResolver, createTrace } from "../index";
import type { IngestionRequest } from "../index";

describe("network-free InputResolver", () => {
  it("resolves already-materialized content", async () => {
    const request: IngestionRequest = {
      kind: "content",
      content: "Title\n\nA sufficiently long plain text body.",
      mediaType: "text/plain; charset=utf-8",
      sourceUrl: "https://example.com/plain",
      retrievedAt: "2026-07-24T00:00:00.000Z",
    };
    const result = await new InputResolver().resolve(request, createTrace(request));
    expect(result).toMatchObject({
      content: request.content,
      mediaType: "text/plain",
      charset: "utf-8",
      finalUrl: "https://example.com/plain",
    });
  });

  it.each([
    "https://example.com/document",
    "http://localhost/",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://10.0.0.1/",
    "http://169.254.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::ffff:127.0.0.1]/",
  ])("rejects URL-only input without invoking global fetch: %s", async (url) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await new IngestionPipeline().ingest({
      kind: "url",
      url,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      error: { code: "SAFE_ACQUISITION_REQUIRED", stage: "resolve" },
    });
    fetchSpy.mockRestore();
  });

  it("keeps an injected deterministic clock for supplied content", async () => {
    const request: IngestionRequest = {
      kind: "content",
      content: "Title\n\nA sufficiently long materialized body.",
    };
    const result = await new InputResolver({
      now: () => new Date("2026-08-13T00:00:00.000Z"),
    }).resolve(request, createTrace(request));
    expect(result.retrievedAt).toBe("2026-08-13T00:00:00.000Z");
  });
});
