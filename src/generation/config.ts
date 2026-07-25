import type { OpenAIResponsesAdapterOptions } from "./adapters/openai-responses-adapter";

export interface ServerGenerationEnvironment {
  WORLD_NEWS_AI_LLM_ENABLED?: string;
  WORLD_NEWS_AI_LLM_TIMEOUT_MS?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_PROJECT_ID?: string;
}

export function readOpenAIAdapterConfig(
  environment: ServerGenerationEnvironment,
): OpenAIResponsesAdapterOptions {
  const enabled = environment.WORLD_NEWS_AI_LLM_ENABLED === "true";
  const timeout = environment.WORLD_NEWS_AI_LLM_TIMEOUT_MS === undefined
    ? undefined : Number(environment.WORLD_NEWS_AI_LLM_TIMEOUT_MS);
  if (timeout !== undefined && (!Number.isSafeInteger(timeout) || timeout <= 0)) {
    throw new Error("WORLD_NEWS_AI_LLM_TIMEOUT_MS must be a positive integer.");
  }
  return {
    enabled,
    ...(environment.OPENAI_API_KEY ? { apiKey: environment.OPENAI_API_KEY } : {}),
    ...(environment.OPENAI_MODEL ? { modelId: environment.OPENAI_MODEL } : {}),
    ...(environment.OPENAI_PROJECT_ID ? { projectId: environment.OPENAI_PROJECT_ID } : {}),
    ...(timeout ? { timeoutMs: timeout } : {}),
  };
}
