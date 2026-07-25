import type {
  ExplanationPlanLlmRequestPackage, ProviderCapabilities, ProviderMetadata,
  ProviderStructuredResponse, StructuredGenerationProvider,
} from "../models";

export type FakeScenario =
  | "proposal" | "invalid-json" | "schema-mismatch" | "disallowed-reference"
  | "semantic-invalid" | "refusal" | "timeout" | "rate-limit" | "quota"
  | "transient" | "repair-success" | "repair-exhaustion";

export class DeterministicFakeStructuredProvider implements StructuredGenerationProvider {
  readonly metadata: ProviderMetadata;
  readonly capabilities: ProviderCapabilities = {
    maximumInputCharacters: 100_000, maximumOutputTokens: 8_000,
    nativeStructuredOutput: true, jsonSchemaDraft: "draft-7",
    supportsAbortSignal: true, supportsRequestId: true, supportsTemperature: false,
    supportsSeed: true, supportsReasoningControl: true,
  };
  private calls = 0;

  constructor(
    private readonly fixture: (request: ExplanationPlanLlmRequestPackage, call: number) => ProviderStructuredResponse,
    modelId = "deterministic-fixture-v1",
  ) {
    this.metadata = {
      providerId: "deterministic-fake", adapterId: "fake-structured-provider",
      adapterVersion: "1.0.0", modelId, supportsJsonSchema: true,
      supportsNativeStructuredOutput: true, supportsRefusalSignal: true,
      supportsUsageReporting: true, deterministicMode: "deterministic", configured: true,
    };
  }

  async generate(
    request: ExplanationPlanLlmRequestPackage,
    signal?: AbortSignal,
  ): Promise<ProviderStructuredResponse> {
    if (signal?.aborted) {
      return { outcome: "failure", error: { code: "PROVIDER_ABORTED", stage: "provider", message: "Request aborted.", retryable: false } };
    }
    this.calls += 1;
    return structuredClone(this.fixture(request, this.calls));
  }
}
