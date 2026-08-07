import {
  BriefingRunService,
  type BriefingRunCancellation,
  type BriefingRunResult,
  type CreateBriefingRequest,
} from "@world-news-ai/application-briefing-run";
import { BriefingContractCompiler } from "@world-news-ai/briefing";
import {
  EvidenceContextBuilder,
  InMemoryEvidenceCandidateProvider,
  type ContextBuildRequest,
} from "@world-news-ai/context";
import { RuleBasedExplanationPlanAssembler } from "@world-news-ai/explanation";
import {
  DeterministicFakeStructuredProvider,
  StructuredExplanationPlanCoordinator,
  type ExplanationPlanGenerationInput,
} from "@world-news-ai/generation";
import {
  presentationPreference,
  RuleBasedBriefingScriptCompiler,
  type PresentationMode,
} from "@world-news-ai/script";
import type { PersonalImpactContext } from "@world-news-ai/personalization";
import { withBriefingSessionFingerprint } from "@world-news-ai/session";
import { PersonalizedImpactAnalyzer } from "@world-news-ai/personalization";
import { PersonalizedImpactCoordinator } from "@world-news-ai/application-personalized-impact";
import { createCanonicalMapImpactProposal } from "./canonical-map-impact-proposal";
import {
  createLocalPersonalImpactContext,
  localPersonalizedImpactPolicy,
} from "./local-personalized-impact-fixture";
import {
  createLocalFixtureDocuments,
  createLocalFixtureDataPoint,
  createLocalFixtureLocationCandidates,
  createLocalFixtureLocationDocuments,
  createLocalFixtureQuestion,
} from "./local-briefing-fixture";

export interface LocalBriefingRuntimeHandle {
  runId: string;
  result: Promise<BriefingRunResult>;
  cancel(): void;
}

export interface BrowserRuntimeAdapters {
  nextRunId(): string;
  now(): string;
}

export const browserRuntimeAdapters: BrowserRuntimeAdapters = {
  nextRunId: () => `run:${crypto.randomUUID()}`,
  now: () => new Date().toISOString(),
};

export function createLocalBriefingRuntime(
  adapters: BrowserRuntimeAdapters = browserRuntimeAdapters,
) {
  return {
    start(
      mode: PresentationMode = "auto",
      personalized: boolean | PersonalImpactContext = false,
    ): LocalBriefingRuntimeHandle {
      const runId = adapters.nextRunId();
      const abortController = new AbortController();
      const cancellation: BriefingRunCancellation = {
        isCancellationRequested: () => abortController.signal.aborted,
      };
      const service = createService(runId, adapters, abortController.signal);
      const now = adapters.now();
      const personalImpactContext = personalized === true
        ? createLocalPersonalImpactContext()
        : personalized || undefined;
      const request: CreateBriefingRequest = {
        question: createLocalFixtureQuestion(now, Boolean(personalImpactContext)),
        presentationPreference: presentationPreference(mode),
        ...(personalImpactContext ? { personalImpactContext } : {}),
      };
      return {
        runId,
        result: service.execute(request, { cancellation }),
        cancel: () => abortController.abort(),
      };
    },
  };
}

function createService(runId: string, adapters: BrowserRuntimeAdapters, signal: AbortSignal) {
  let generationInput: ExplanationPlanGenerationInput | undefined;
  const asDate = () => new Date(adapters.now());
  const provider = new DeterministicFakeStructuredProvider(() => {
    try {
      if (!generationInput) throw new Error("Local generation input is unavailable.");
      const built = new RuleBasedExplanationPlanAssembler({
        now: asDate,
        createId: () => `plan:${runId}`,
      }).generate({
        question: generationInput.question,
        contract: generationInput.briefingContract,
        contextPackage: generationInput.evidenceContextPackage,
      });
      if (!built.success || !("plan" in built)) throw new Error("Local plan fixture failed.");
      return {
        outcome: "proposal" as const,
        proposal: createCanonicalMapImpactProposal(
          built.plan,
          generationInput.evidenceContextPackage,
          generationInput.personalizedImpactPlanningContext,
        ),
        providerResponseId: `provider-response:${runId}`,
      };
    } catch (error) {
      return {
        outcome: "failure" as const,
        error: {
          code: "PROVIDER_RESPONSE_INVALID" as const,
          stage: "local-fixture-proposal",
          message: error instanceof Error ? error.message : "Local fixture proposal failed.",
          retryable: false,
        },
      };
    }
  });
  return new BriefingRunService({
    runtimeIdGenerator: { nextRunId: () => runId },
    runtimeClock: adapters,
    contractCompiler: new BriefingContractCompiler({ now: asDate, createId: () => `contract:${runId}` }),
    contextBuilder: new EvidenceContextBuilder({
      provider: new InMemoryEvidenceCandidateProvider(
        createLocalFixtureLocationCandidates(adapters.now()),
      ),
      now: asDate,
      createId: () => `context:${runId}`,
    }),
    generationCoordinator: new StructuredExplanationPlanCoordinator({
      provider,
      now: asDate,
      sleeper: async () => undefined,
    }),
    personalizedImpactCoordinator: new PersonalizedImpactCoordinator(
      new PersonalizedImpactAnalyzer(localPersonalizedImpactPolicy),
    ),
    scriptCompiler: new RuleBasedBriefingScriptCompiler(asDate),
    createContextRequest(request, contract): ContextBuildRequest {
      return {
        question: request.question,
        briefingContract: contract,
        referencedEventIds: request.question.referencedEventIds,
        referencedDossierIds: [],
        callerProvidedRecords: [
          ...createLocalFixtureDocuments(request.question.submittedAt),
          ...createLocalFixtureLocationDocuments(request.question.submittedAt),
          createLocalFixtureDataPoint(request.question.submittedAt),
        ],
        corpusRevision: "corpus:local-fixture-v1",
        requestedAt: request.question.submittedAt,
        retrievalPolicyVersion: "retrieval:local-fixture-v1",
      };
    },
    createGenerationInput(request, contract, contextPackage, personalizedImpactPlanningContext) {
      generationInput = {
        question: request.question,
        briefingContract: contract,
        evidenceContextPackage: contextPackage,
        generationPolicy: {
          id: "generation:local-fixture",
          version: "generation-v1",
          promptTemplateId: "explanation-plan",
          promptTemplateVersion: "1.0.0",
          proposalSchemaVersion: "proposal-v1",
          planSchemaVersion: "explanation-plan-v1",
          allowRepair: true,
          retryBaseDelayMs: 0,
        },
        providerSelection: { providerId: "deterministic-fake", modelId: "fixture-v1" },
        generationBudget: {
          maximumInputCharacters: 100_000,
          maximumOutputTokens: 8_000,
          timeoutMs: 5_000,
          maximumTransportRetries: 0,
          maximumRepairAttempts: 1,
        },
        requestedAt: request.question.submittedAt,
        requestId: `generation-request:${runId}`,
        abortSignal: signal,
        ...(personalizedImpactPlanningContext ? { personalizedImpactPlanningContext } : {}),
      };
      return generationInput;
    },
    initializeSession({ question, contract, contextPackage, plan, script }) {
      const firstScene = script.scenes[0];
      if (!firstScene) throw new Error("Local Script has no opening scene.");
      const now = adapters.now();
      return withBriefingSessionFingerprint({
        sessionId: `session:${runId}`,
        status: "briefing-ready",
        originalQuestionId: question.id,
        currentQuestionId: question.id,
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
        policyVersion: "demo-session-v1",
        createdAt: now,
        updatedAt: now,
      });
    },
  });
}
