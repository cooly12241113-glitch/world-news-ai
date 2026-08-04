import { describe, expect, it } from "vitest";
import {
  type ProviderCapabilities,
  type ProviderMetadata,
  type StructuredGenerationProvider,
} from "../../../generation";
import {
  createPersonalImpactContext,
  createUserExposure,
} from "../../../personalization";
import { BriefingRunService } from "../briefing-run-service";
import {
  BriefingRunOutcomeSchema,
  BriefingRunStageSchema,
  CreateBriefingRequestSchema,
} from "../schemas";
import { dependencies, request } from "./fixtures";

describe("BriefingRun contracts", () => {
  it("strictly validates requests, stages, and outcomes", () => {
    expect(CreateBriefingRequestSchema.parse(request()).question.id)
      .toBe("question:runtime");
    expect(CreateBriefingRequestSchema.safeParse({ ...request(), readingLevel: "expert" }).success)
      .toBe(false);
    expect(CreateBriefingRequestSchema.safeParse({ question: {} }).success).toBe(false);
    expect(BriefingRunStageSchema.safeParse("retrieving").success).toBe(false);
    expect(BriefingRunOutcomeSchema.safeParse({
      kind: "failed",
      finalStage: "received",
      technical: true,
      category: "request-invalid",
      stack: "private",
    }).success).toBe(false);
  });

  it("transports strict personal impact context only with an explicit request", () => {
    const runtimeRequest = request("How could this affect my USD exposure?");
    runtimeRequest.question.personalizationRequested = true;
    runtimeRequest.personalImpactContext = createPersonalImpactContext({
      contextVersion: "1",
      consent: {
        enabled: true,
        purpose: "personalized-impact-analysis",
      },
      callerScope: {
        lifetime: "request-run",
        propagation: "explicit-only",
      },
      exposures: [
        createUserExposure({ dimension: "currency", currencyCode: "USD" }),
      ],
    });

    const parsed = CreateBriefingRequestSchema.parse(runtimeRequest);
    expect(parsed.personalImpactContext?.exposures[0]?.dimension).toBe("currency");
    expect(parsed.personalImpactContext?.semanticFingerprint).toHaveLength(64);
  });

  it("rejects enabled context when the question did not request personalization", () => {
    const runtimeRequest = request();
    runtimeRequest.personalImpactContext = createPersonalImpactContext({
      contextVersion: "1",
      consent: {
        enabled: true,
        purpose: "personalized-impact-analysis",
      },
      callerScope: {
        lifetime: "request-run",
        propagation: "explicit-only",
      },
      exposures: [],
    });

    expect(CreateBriefingRequestSchema.safeParse(runtimeRequest).success).toBe(false);
  });

  it("keeps legacy UserProvidedContext request compatibility", () => {
    const legacyRequest = request("What is the impact on my industry?");
    legacyRequest.question.personalizationRequested = true;
    legacyRequest.question.userProvidedContext = {
      industries: ["semiconductor"],
    };

    const parsed = CreateBriefingRequestSchema.parse(legacyRequest);
    expect(parsed.question.userProvidedContext?.industries)
      .toEqual(["semiconductor"]);
    expect(parsed.personalImpactContext).toBeUndefined();
  });
});

describe("BriefingRunService", () => {
  it("returns clarification without executing downstream stages", async () => {
    const base = dependencies();
    let contextCalls = 0;
    const service = new BriefingRunService({
      ...base,
      contextBuilder: {
        build(input) {
          contextCalls += 1;
          return base.contextBuilder.build(input);
        },
      },
    });
    const ambiguous = request("Why did that happen?");
    ambiguous.question.referencedEventIds = [];
    const result = await service.execute(ambiguous);
    expect(result.outcome.kind).toBe("clarification-required");
    expect(result.outcome.finalStage).toBe("contract-building");
    expect(contextCalls).toBe(0);
  });

  it("returns policy rejection without executing Context", async () => {
    const base = dependencies();
    let contextCalls = 0;
    const service = new BriefingRunService({
      ...base,
      contextBuilder: {
        build(input) {
          contextCalls += 1;
          return base.contextBuilder.build(input);
        },
      },
    });
    const result = await service.execute(request("???"));
    expect(result.outcome.kind).toBe("policy-rejected");
    expect(contextCalls).toBe(0);
  });

  it("runs each existing stage once and returns an atomic completed result", async () => {
    const base = dependencies();
    const calls = { contract: 0, context: 0, generation: 0, script: 0, session: 0 };
    const service = new BriefingRunService({
      ...base,
      contractCompiler: { compile(input) { calls.contract += 1; return base.contractCompiler.compile(input); } },
      contextBuilder: { build(input) { calls.context += 1; return base.contextBuilder.build(input); } },
      generationCoordinator: { async generate(input) { calls.generation += 1; return base.generationCoordinator.generate(input); } },
      scriptCompiler: { compile(input) { calls.script += 1; return base.scriptCompiler.compile(input); } },
      initializeSession(input) { calls.session += 1; return base.initializeSession(input); },
    });

    const result = await service.execute(request());
    expect(result.outcome.kind).toBe("completed");
    expect(calls).toEqual({ contract: 1, context: 1, generation: 1, script: 1, session: 1 });
    if (result.outcome.kind !== "completed") throw new Error("Expected completed outcome.");
    expect(result.outcome.lineage).toEqual({
      contractFingerprint: result.outcome.session.contractFingerprint,
      contextFingerprint: result.outcome.session.contextPackageFingerprint,
      explanationPlanFingerprint: result.outcome.session.planFingerprint,
      scriptFingerprint: result.outcome.script.fingerprint,
      sessionFingerprint: result.outcome.session.semanticFingerprint,
    });
  });

  it("keeps semantic fingerprints deterministic for identical fixture runs", async () => {
    const first = await new BriefingRunService(dependencies()).execute(request());
    const second = await new BriefingRunService(dependencies()).execute(request());
    if (first.outcome.kind !== "completed" || second.outcome.kind !== "completed") {
      throw new Error("Expected completed outcomes.");
    }
    expect(second.outcome.lineage).toEqual(first.outcome.lineage);
  });

  it("stops at insufficient Context without generating a plan or Script", async () => {
    const base = dependencies();
    let generationCalls = 0;
    let scriptCalls = 0;
    const service = new BriefingRunService({
      ...base,
      createContextRequest(runtimeRequest, contract) {
        return {
          ...base.createContextRequest(runtimeRequest, contract),
          callerProvidedRecords: [],
        };
      },
      generationCoordinator: {
        async generate(input) {
          generationCalls += 1;
          return base.generationCoordinator.generate(input);
        },
      },
      scriptCompiler: {
        compile(input) {
          scriptCalls += 1;
          return base.scriptCompiler.compile(input);
        },
      },
    });
    const result = await service.execute(request());
    expect(result.outcome).toMatchObject({
      kind: "insufficient-evidence",
      finalStage: "context-building",
      technical: false,
    });
    expect(generationCalls).toBe(0);
    expect(scriptCalls).toBe(0);
  });

  it("rejects a mismatched Session and never reports completed", async () => {
    const base = dependencies();
    const service = new BriefingRunService({
      ...base,
      initializeSession(input) {
        const session = base.initializeSession(input);
        return { ...session, scriptFingerprint: "wrong-script-fingerprint" };
      },
    });
    const result = await service.execute(request());
    expect(result.outcome).toMatchObject({
      kind: "failed",
      finalStage: "session-creating",
      technical: true,
      category: "session-invalid",
    });
  });

  it("maps an unconfigured existing provider to generation-unavailable", async () => {
    const provider = unconfiguredProvider();
    const result = await new BriefingRunService(dependencies(provider)).execute(request());
    expect(result.outcome).toMatchObject({
      kind: "generation-unavailable",
      finalStage: "plan-generating",
      technical: false,
      reason: "PROVIDER_NOT_CONFIGURED",
    });
  });
});

function unconfiguredProvider(): StructuredGenerationProvider {
  const metadata: ProviderMetadata = {
    providerId: "fixture-disabled",
    adapterId: "fixture-disabled",
    adapterVersion: "1.0.0",
    modelId: "fixture-disabled",
    supportsJsonSchema: true,
    supportsNativeStructuredOutput: true,
    supportsRefusalSignal: true,
    supportsUsageReporting: false,
    deterministicMode: "deterministic",
    configured: false,
  };
  const capabilities: ProviderCapabilities = {
    maximumInputCharacters: 100_000,
    maximumOutputTokens: 8_000,
    nativeStructuredOutput: true,
    jsonSchemaDraft: "draft-7",
    supportsAbortSignal: true,
    supportsRequestId: true,
    supportsTemperature: false,
    supportsSeed: true,
    supportsReasoningControl: false,
  };
  return {
    metadata,
    capabilities,
    async generate() {
      throw new Error("An unconfigured provider must not be called.");
    },
  };
}
