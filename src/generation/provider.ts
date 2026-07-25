import type {
  ExplanationPlanLlmRequestPackage, ProviderStructuredResponse,
  StructuredGenerationProvider,
} from "./models";

export type Sleeper = (delayMs: number, signal?: AbortSignal) => Promise<void>;
export const defaultSleeper: Sleeper = (delayMs, signal) => new Promise((resolve, reject) => {
  const timeout = setTimeout(resolve, delayMs);
  signal?.addEventListener("abort", () => {
    clearTimeout(timeout);
    reject(new DOMException("Aborted", "AbortError"));
  }, { once: true });
});

export async function callWithRetry(
  provider: StructuredGenerationProvider,
  request: ExplanationPlanLlmRequestPackage,
  sleeper: Sleeper,
  signal?: AbortSignal,
): Promise<Array<{ response: ProviderStructuredResponse; startedAt: string; completedAt: string }>> {
  const results: Array<{ response: ProviderStructuredResponse; startedAt: string; completedAt: string }> = [];
  for (let attempt = 0; attempt <= request.generationBudget.maximumTransportRetries; attempt += 1) {
    const startedAt = new Date().toISOString();
    const response = await provider.generate(request, signal);
    results.push({ response, startedAt, completedAt: new Date().toISOString() });
    if (response.outcome !== "failure" || !response.error.retryable ||
        attempt === request.generationBudget.maximumTransportRetries) break;
    await sleeper(2 ** attempt * 100, signal);
  }
  return results;
}
