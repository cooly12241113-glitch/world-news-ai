import { describe, expect, it } from "vitest";
import {
  mapOpenAIError, OpenAIResponsesStructuredAdapter, parseOpenAIResponse,
} from "../adapters/openai-responses-adapter";
import { ExplanationPlanLlmRequestBuilder } from "../request-builder";
import { input, proposal } from "./fixtures";

describe("OpenAIResponsesStructuredAdapter", () => {
  it("is safe and unconfigured by default", async () => {
    const adapter = new OpenAIResponsesStructuredAdapter();
    expect(adapter.metadata.configured).toBe(false);
    expect(await adapter.generate(new ExplanationPlanLlmRequestBuilder().build(input())))
      .toMatchObject({ outcome: "failure", error: { code: "PROVIDER_NOT_CONFIGURED" } });
  });

  it("maps a structured Responses request through an injected client", async () => {
    let body: Record<string, unknown> | undefined;
    const adapter = new OpenAIResponsesStructuredAdapter({
      enabled: true, apiKey: "not-a-real-secret", modelId: "injected-model",
      client: { responses: { create: async (value) => {
        body = value;
        return {
          id: "resp-1", status: "completed", output_text: JSON.stringify(proposal()),
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30,
            input_tokens_details: { cached_tokens: 2 },
            output_tokens_details: { reasoning_tokens: 3 } },
        };
      } } },
    });
    const response = await adapter.generate(new ExplanationPlanLlmRequestBuilder().build(input()));
    expect(body).toMatchObject({
      model: "injected-model", store: false,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(response).toMatchObject({
      outcome: "proposal", providerResponseId: "resp-1",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, cachedTokens: 2, reasoningTokens: 3 },
    });
  });

  it("maps explicit refusal separately", () => {
    expect(parseOpenAIResponse({
      id: "resp-refusal",
      output: [{ content: [{ type: "refusal", refusal: "Safety refusal" }] }],
    })).toMatchObject({ outcome: "refusal", refusal: { reason: "Safety refusal" } });
  });

  it("rejects missing or invalid structured output", () => {
    expect(parseOpenAIResponse({ id: "resp-empty", output: [] }))
      .toMatchObject({ outcome: "failure", error: { code: "PROVIDER_RESPONSE_INVALID" } });
    expect(parseOpenAIResponse({ output_text: "not-json" }))
      .toMatchObject({ outcome: "failure", error: { code: "PROVIDER_RESPONSE_INVALID" } });
  });

  it.each([
    [{ status: 401 }, "PROVIDER_AUTHENTICATION_FAILED", false],
    [{ status: 403 }, "PROVIDER_PERMISSION_DENIED", false],
    [{ status: 429, message: "quota exceeded" }, "PROVIDER_QUOTA_EXCEEDED", false],
    [{ status: 429 }, "PROVIDER_RATE_LIMITED", true],
    [{ status: 500 }, "PROVIDER_TRANSIENT_ERROR", true],
    [{ status: 400 }, "PROVIDER_INVALID_REQUEST", false],
    [{ name: "TimeoutError" }, "PROVIDER_TIMEOUT", true],
    [{ name: "AbortError" }, "PROVIDER_ABORTED", false],
  ])("maps provider error %#", (cause, code, retryable) => {
    expect(mapOpenAIError(cause)).toMatchObject({
      outcome: "failure", error: { code, retryable },
    });
  });
});
