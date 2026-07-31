import { describe, expect, it } from "vitest";
import { BriefingContractCompiler, type BriefingQuestion } from "../../../briefing";
import {
  EvidenceContextBuilder,
  InMemoryEvidenceCandidateProvider,
  type ContextBuildRequest,
} from "../../../context";
import type { SourceDocument } from "../../../domain";
import { RuleBasedExplanationPlanAssembler } from "../../../explanation";
import {
  DeterministicFakeStructuredProvider,
  StructuredExplanationPlanCoordinator,
  type ExplanationPlanGenerationInput,
  type ProviderCapabilities,
  type ProviderMetadata,
  type StructuredGenerationProvider,
} from "../../../generation";
import { proposalFromPlan } from "../../../generation/__tests__/fixtures";
import {
  presentationPreference,
  RuleBasedBriefingScriptCompiler,
} from "../../../script";
import { withBriefingSessionFingerprint } from "../../../session";
import { BriefingRunService } from "../briefing-run-service";
import {
  BriefingRunOutcomeSchema,
  BriefingRunStageSchema,
  CreateBriefingRequestSchema,
} from "../schemas";
import type {
  BriefingRunServiceDependencies,
  CreateBriefingRequest,
} from "../types";

const NOW = "2026-07-31T00:00:00.000Z";

function question(text = "Why did the energy disruption raise market costs?"): BriefingQuestion {
  return {
    id: "question:runtime",
    text,
    language: "en",
    submittedAt: NOW,
    referencedEventIds: ["event:energy"],
    referencedEntityIds: [],
    personalizationRequested: false,
  };
}

function documents(): SourceDocument[] {
  return [
    {
      id: "document:primary",
      sourceId: "source:agency",
      documentType: "GovernmentDocument",
      canonicalUrl: "https://agency.example/energy-report",
      title: "Energy disruption report",
      languageCode: "en",
      publishedAt: NOW,
      retrievedAt: NOW,
      authorNames: ["Agency"],
      contentText: "The disruption constrained supply and increased transport costs.",
      entityIds: [],
      topicIds: [],
      eventIds: ["event:energy"],
    },
    {
      id: "document:independent",
      sourceId: "source:independent",
      documentType: "NewsArticle",
      canonicalUrl: "https://news.example/energy-analysis",
      title: "Independent energy analysis",
      languageCode: "en",
      publishedAt: NOW,
      retrievedAt: NOW,
      authorNames: ["Reporter"],
      contentText: "Independent evidence links constrained supply to higher market costs.",
      entityIds: [],
      topicIds: [],
      eventIds: ["event:energy"],
    },
  ];
}

function createGenerationInput(
  request: CreateBriefingRequest,
  contract: Parameters<BriefingRunServiceDependencies["createGenerationInput"]>[1],
  contextPackage: Parameters<BriefingRunServiceDependencies["createGenerationInput"]>[2],
): ExplanationPlanGenerationInput {
  return {
    question: request.question,
    briefingContract: contract,
    evidenceContextPackage: contextPackage,
    generationPolicy: {
      id: "generation:runtime",
      version: "generation-v1",
      promptTemplateId: "explanation-plan",
      promptTemplateVersion: "1.0.0",
      proposalSchemaVersion: "proposal-v1",
      planSchemaVersion: "explanation-plan-v1",
      allowRepair: true,
      retryBaseDelayMs: 0,
    },
    providerSelection: {
      providerId: "deterministic-fake",
      modelId: "fixture-v1",
    },
    generationBudget: {
      maximumInputCharacters: 100_000,
      maximumOutputTokens: 8_000,
      timeoutMs: 5_000,
      maximumTransportRetries: 0,
      maximumRepairAttempts: 1,
    },
    requestedAt: NOW,
    requestId: "generation-request:runtime",
  };
}

function dependencies(
  providerOverride?: StructuredGenerationProvider,
): BriefingRunServiceDependencies {
  let currentGenerationInput: ExplanationPlanGenerationInput | undefined;
  const provider = providerOverride ?? new DeterministicFakeStructuredProvider(() => {
    if (!currentGenerationInput) throw new Error("Generation input was not prepared.");
    const built = new RuleBasedExplanationPlanAssembler({
      now: () => new Date(NOW),
      createId: () => "plan:runtime",
    }).generate({
      question: currentGenerationInput.question,
      contract: currentGenerationInput.briefingContract,
      contextPackage: currentGenerationInput.evidenceContextPackage,
    });
    if (!built.success || !("plan" in built)) throw new Error("Plan fixture failed.");
    return {
      outcome: "proposal",
      proposal: proposalFromPlan(built.plan),
      providerResponseId: "provider-response:runtime",
    };
  });
  const generationCoordinator = new StructuredExplanationPlanCoordinator({
    provider,
    now: () => new Date(NOW),
    sleeper: async () => undefined,
  });

  return {
    contractCompiler: new BriefingContractCompiler({
      now: () => new Date(NOW),
      createId: () => "contract:runtime",
    }),
    contextBuilder: new EvidenceContextBuilder({
      provider: new InMemoryEvidenceCandidateProvider(),
      now: () => new Date(NOW),
      createId: () => "context:runtime",
    }),
    generationCoordinator,
    scriptCompiler: new RuleBasedBriefingScriptCompiler(() => new Date(NOW)),
    createContextRequest(request, contract): ContextBuildRequest {
      return {
        question: request.question,
        briefingContract: contract,
        referencedEventIds: request.question.referencedEventIds,
        referencedDossierIds: [],
        callerProvidedRecords: documents(),
        corpusRevision: "corpus:runtime-v1",
        requestedAt: NOW,
        retrievalPolicyVersion: "retrieval-v1",
      };
    },
    createGenerationInput(request, contract, contextPackage) {
      currentGenerationInput = createGenerationInput(request, contract, contextPackage);
      return currentGenerationInput;
    },
    initializeSession({ question: inputQuestion, contract, contextPackage, plan, script }) {
      const firstScene = script.scenes[0];
      if (!firstScene) throw new Error("Script has no opening scene.");
      return withBriefingSessionFingerprint({
        sessionId: "session:runtime",
        status: "briefing-ready",
        originalQuestionId: inputQuestion.id,
        currentQuestionId: inputQuestion.id,
        contractId: contract.id,
        contractFingerprint: contract.semanticFingerprint,
        contextPackageFingerprint: contextPackage.fingerprint,
        planId: plan.id,
        planFingerprint: plan.fingerprint,
        scriptId: script.id,
        scriptFingerprint: script.fingerprint,
        sceneCursor: {
          sceneId: firstScene.id,
          sceneIndex: 0,
          totalScenes: script.scenes.length,
          visitedSceneIds: [firstScene.id],
        },
        presentationPreference: script.presentationPreference,
        selectedAnalysisTab: "key",
        manualMapViewState: { status: "inactive" },
        composerState: "compact",
        policyVersion: "runtime-session-v1",
        createdAt: NOW,
        updatedAt: NOW,
      });
    },
  };
}

function request(text?: string): CreateBriefingRequest {
  return {
    question: question(text),
    presentationPreference: presentationPreference("auto"),
  };
}

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
    expect(result.kind).toBe("clarification-required");
    expect(result.finalStage).toBe("contract-building");
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
    expect(result.kind).toBe("policy-rejected");
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
    expect(result.kind).toBe("completed");
    expect(calls).toEqual({ contract: 1, context: 1, generation: 1, script: 1, session: 1 });
    if (result.kind !== "completed") throw new Error("Expected completed outcome.");
    expect(result.lineage).toEqual({
      contractFingerprint: result.session.contractFingerprint,
      contextFingerprint: result.session.contextPackageFingerprint,
      explanationPlanFingerprint: result.session.planFingerprint,
      scriptFingerprint: result.script.fingerprint,
      sessionFingerprint: result.session.semanticFingerprint,
    });
  });

  it("keeps semantic fingerprints deterministic for identical fixture runs", async () => {
    const first = await new BriefingRunService(dependencies()).execute(request());
    const second = await new BriefingRunService(dependencies()).execute(request());
    if (first.kind !== "completed" || second.kind !== "completed") {
      throw new Error("Expected completed outcomes.");
    }
    expect(second.lineage).toEqual(first.lineage);
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
    expect(result).toMatchObject({
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
    expect(result).toMatchObject({
      kind: "failed",
      finalStage: "session-creating",
      technical: true,
      category: "session-invalid",
    });
  });

  it("maps an unconfigured existing provider to generation-unavailable", async () => {
    const provider = unconfiguredProvider();
    const result = await new BriefingRunService(dependencies(provider)).execute(request());
    expect(result).toMatchObject({
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
