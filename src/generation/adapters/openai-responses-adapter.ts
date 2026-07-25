import OpenAI from "openai";
import { z } from "zod";
import { ExplanationPlanProposalSchema } from "../validation";
import type {
  ExplanationPlanLlmRequestPackage, ProviderCapabilities, ProviderMetadata,
  ProviderStructuredResponse, StructuredGenerationProvider,
} from "../models";

interface ResponsesClient {
  responses: {
    create(body: Record<string, unknown>, options?: { signal?: AbortSignal; timeout?: number }): Promise<unknown>;
  };
}

export interface OpenAIResponsesAdapterOptions {
  enabled?: boolean; apiKey?: string; modelId?: string; projectId?: string;
  timeoutMs?: number; client?: ResponsesClient;
}

export class OpenAIResponsesStructuredAdapter implements StructuredGenerationProvider {
  readonly metadata: ProviderMetadata;
  readonly capabilities: ProviderCapabilities = {
    maximumInputCharacters: 1_000_000, maximumOutputTokens: 100_000,
    nativeStructuredOutput: true, jsonSchemaDraft: "draft-7",
    supportsAbortSignal: true, supportsRequestId: true, supportsTemperature: true,
    supportsSeed: false, supportsReasoningControl: true,
  };
  private readonly client?: ResponsesClient;
  private readonly timeoutMs: number;

  constructor(options: OpenAIResponsesAdapterOptions = {}) {
    const enabled = options.enabled === true;
    const configured = enabled && Boolean(options.apiKey && options.modelId);
    this.metadata = {
      providerId: "openai", adapterId: "openai-responses-structured",
      adapterVersion: "1.0.0", modelId: options.modelId ?? "",
      supportsJsonSchema: true, supportsNativeStructuredOutput: true,
      supportsRefusalSignal: true, supportsUsageReporting: true,
      deterministicMode: "best-effort", configured,
    };
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.client = options.client ?? (configured
      ? new OpenAI({ apiKey: options.apiKey!, ...(options.projectId ? { project: options.projectId } : {}) })
      : undefined);
  }

  async generate(
    request: ExplanationPlanLlmRequestPackage,
    signal?: AbortSignal,
  ): Promise<ProviderStructuredResponse> {
    if (!this.metadata.configured || !this.client) return failure("PROVIDER_NOT_CONFIGURED", "OpenAI provider is not enabled and configured.", false);
    if (signal?.aborted) return failure("PROVIDER_ABORTED", "Request aborted.", false);
    try {
      const response = await this.client.responses.create({
        model: this.metadata.modelId,
        input: [
          { role: "developer", content: [
            { type: "input_text", text: request.promptTemplate.systemInstruction },
            { type: "input_text", text: request.promptTemplate.evidenceInstruction },
            { type: "input_text", text: request.promptTemplate.outputInstruction },
          ] },
          { role: "user", content: [{ type: "input_text", text: JSON.stringify({
            question: request.questionReference, answerGoal: request.answerGoal,
            answerStrategy: request.answerStrategy, contract: request.contractSummary,
            policy: request.policySummary, allowedReferences: request.allowedReferenceCatalog,
            evidence: request.contextCatalog, requiredSections: request.requiredSections,
          }) }] },
        ],
        text: {
          format: {
            type: "json_schema", name: "explanation_plan_proposal", strict: true,
            schema: z.toJSONSchema(ExplanationPlanProposalSchema, { target: "draft-7" }),
          },
        },
        max_output_tokens: request.generationBudget.maximumOutputTokens,
        metadata: { request_id: request.requestId, request_fingerprint: request.requestFingerprint },
        store: false,
      }, { signal, timeout: Math.min(this.timeoutMs, request.generationBudget.timeoutMs) });
      return parseOpenAIResponse(response);
    } catch (cause) {
      return mapOpenAIError(cause);
    }
  }
}

export function parseOpenAIResponse(input: unknown): ProviderStructuredResponse {
  if (!isObject(input)) return failure("PROVIDER_RESPONSE_INVALID", "OpenAI response is not an object.", false);
  const id = typeof input.id === "string" ? input.id : undefined;
  const usage = isObject(input.usage) ? {
    ...(number(input.usage.input_tokens) !== undefined ? { inputTokens: number(input.usage.input_tokens)! } : {}),
    ...(number(input.usage.output_tokens) !== undefined ? { outputTokens: number(input.usage.output_tokens)! } : {}),
    ...(number(input.usage.total_tokens) !== undefined ? { totalTokens: number(input.usage.total_tokens)! } : {}),
    ...(isObject(input.usage.input_tokens_details) && number(input.usage.input_tokens_details.cached_tokens) !== undefined
      ? { cachedTokens: number(input.usage.input_tokens_details.cached_tokens)! } : {}),
    ...(isObject(input.usage.output_tokens_details) && number(input.usage.output_tokens_details.reasoning_tokens) !== undefined
      ? { reasoningTokens: number(input.usage.output_tokens_details.reasoning_tokens)! } : {}),
  } : undefined;
  const refusal = findRefusal(input.output);
  if (refusal) return { outcome: "refusal", refusal: { code: "openai-refusal", reason: refusal }, ...(id ? { providerResponseId: id } : {}), ...(usage ? { usage } : {}) };
  const outputText = typeof input.output_text === "string" ? input.output_text : findOutputText(input.output);
  if (!outputText) return failure("PROVIDER_RESPONSE_INVALID", "OpenAI response has no structured output.", false);
  try {
    return {
      outcome: "proposal", proposal: JSON.parse(outputText),
      ...(id ? { providerResponseId: id } : {}),
      ...(typeof input.status === "string" ? { finishReason: input.status } : {}),
      ...(usage ? { usage } : {}),
    };
  } catch {
    return failure("PROVIDER_RESPONSE_INVALID", "Structured output is not valid JSON.", false);
  }
}

export function mapOpenAIError(cause: unknown): ProviderStructuredResponse {
  const status = isObject(cause) ? number(cause.status) : undefined;
  const name = isObject(cause) && typeof cause.name === "string" ? cause.name : "";
  const code = isObject(cause) && typeof cause.code === "string" ? cause.code : "";
  if (name === "AbortError") return failure("PROVIDER_ABORTED", "Request aborted.", false);
  if (name.includes("Timeout") || code === "ETIMEDOUT") return failure("PROVIDER_TIMEOUT", "Provider request timed out.", true);
  if (status === 401) return failure("PROVIDER_AUTHENTICATION_FAILED", "Provider authentication failed.", false);
  if (status === 403) return failure("PROVIDER_PERMISSION_DENIED", "Provider permission denied.", false);
  if (status === 429 && /quota/i.test(String(isObject(cause) ? cause.message : ""))) return failure("PROVIDER_QUOTA_EXCEEDED", "Provider quota exceeded.", false);
  if (status === 429) return failure("PROVIDER_RATE_LIMITED", "Provider rate limited the request.", true);
  if (status !== undefined && status >= 500) return failure("PROVIDER_TRANSIENT_ERROR", "Provider server error.", true);
  if (status !== undefined && status >= 400) return failure("PROVIDER_INVALID_REQUEST", "Provider rejected the request.", false);
  return failure("PROVIDER_TRANSIENT_ERROR", "Provider request failed.", true);
}

function findOutputText(output: unknown): string | undefined {
  if (!Array.isArray(output)) return undefined;
  for (const item of output) if (isObject(item) && Array.isArray(item.content)) {
    for (const content of item.content) if (isObject(content) && content.type === "output_text" && typeof content.text === "string") return content.text;
  }
  return undefined;
}
function findRefusal(output: unknown): string | undefined {
  if (!Array.isArray(output)) return undefined;
  for (const item of output) if (isObject(item) && Array.isArray(item.content)) {
    for (const content of item.content) if (isObject(content) && content.type === "refusal" && typeof content.refusal === "string") return content.refusal;
  }
  return undefined;
}
function failure(code: Parameters<typeof error>[0], message: string, retryable: boolean): ProviderStructuredResponse {
  return { outcome: "failure", error: error(code, message, retryable) };
}
function error(code: import("../models").GenerationErrorCode, message: string, retryable: boolean) {
  return { code, stage: "provider", message, retryable } as const;
}
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function number(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
