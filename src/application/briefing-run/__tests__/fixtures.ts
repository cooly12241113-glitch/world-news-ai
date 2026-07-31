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
  type StructuredGenerationProvider,
} from "../../../generation";
import { proposalFromPlan } from "../../../generation/__tests__/fixtures";
import {
  presentationPreference,
  RuleBasedBriefingScriptCompiler,
} from "../../../script";
import { withBriefingSessionFingerprint } from "../../../session";
import type {
  BriefingRunServiceDependencies,
  CreateBriefingRequest,
} from "../types";

export const NOW = "2026-07-31T00:00:00.000Z";

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
      id: "document:primary", sourceId: "source:agency",
      documentType: "GovernmentDocument",
      canonicalUrl: "https://agency.example/energy-report",
      title: "Energy disruption report", languageCode: "en",
      publishedAt: NOW, retrievedAt: NOW, authorNames: ["Agency"],
      contentText: "The disruption constrained supply and increased transport costs.",
      entityIds: [], topicIds: [], eventIds: ["event:energy"],
    },
    {
      id: "document:independent", sourceId: "source:independent",
      documentType: "NewsArticle",
      canonicalUrl: "https://news.example/energy-analysis",
      title: "Independent energy analysis", languageCode: "en",
      publishedAt: NOW, retrievedAt: NOW, authorNames: ["Reporter"],
      contentText: "Independent evidence links constrained supply to higher market costs.",
      entityIds: [], topicIds: [], eventIds: ["event:energy"],
    },
  ];
}

function generationInput(
  runtimeRequest: CreateBriefingRequest,
  contract: Parameters<BriefingRunServiceDependencies["createGenerationInput"]>[1],
  contextPackage: Parameters<BriefingRunServiceDependencies["createGenerationInput"]>[2],
): ExplanationPlanGenerationInput {
  return {
    question: runtimeRequest.question,
    briefingContract: contract,
    evidenceContextPackage: contextPackage,
    generationPolicy: {
      id: "generation:runtime", version: "generation-v1",
      promptTemplateId: "explanation-plan", promptTemplateVersion: "1.0.0",
      proposalSchemaVersion: "proposal-v1", planSchemaVersion: "explanation-plan-v1",
      allowRepair: true, retryBaseDelayMs: 0,
    },
    providerSelection: { providerId: "deterministic-fake", modelId: "fixture-v1" },
    generationBudget: {
      maximumInputCharacters: 100_000, maximumOutputTokens: 8_000,
      timeoutMs: 5_000, maximumTransportRetries: 0, maximumRepairAttempts: 1,
    },
    requestedAt: NOW,
    requestId: "generation-request:runtime",
  };
}

export function dependencies(
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
    runtimeIdGenerator: { nextRunId: () => "run:runtime" },
    runtimeClock: { now: () => NOW },
    contractCompiler: new BriefingContractCompiler({
      now: () => new Date(NOW), createId: () => "contract:runtime",
    }),
    contextBuilder: new EvidenceContextBuilder({
      provider: new InMemoryEvidenceCandidateProvider(),
      now: () => new Date(NOW), createId: () => "context:runtime",
    }),
    generationCoordinator,
    scriptCompiler: new RuleBasedBriefingScriptCompiler(() => new Date(NOW)),
    createContextRequest(runtimeRequest, contract): ContextBuildRequest {
      return {
        question: runtimeRequest.question,
        briefingContract: contract,
        referencedEventIds: runtimeRequest.question.referencedEventIds,
        referencedDossierIds: [], callerProvidedRecords: documents(),
        corpusRevision: "corpus:runtime-v1", requestedAt: NOW,
        retrievalPolicyVersion: "retrieval-v1",
      };
    },
    createGenerationInput(runtimeRequest, contract, contextPackage) {
      currentGenerationInput = generationInput(runtimeRequest, contract, contextPackage);
      return currentGenerationInput;
    },
    initializeSession({ question: inputQuestion, contract, contextPackage, plan, script }) {
      const firstScene = script.scenes[0];
      if (!firstScene) throw new Error("Script has no opening scene.");
      return withBriefingSessionFingerprint({
        sessionId: "session:runtime", status: "briefing-ready",
        originalQuestionId: inputQuestion.id, currentQuestionId: inputQuestion.id,
        contractId: contract.id, contractFingerprint: contract.semanticFingerprint,
        contextPackageFingerprint: contextPackage.fingerprint,
        planId: plan.id, planFingerprint: plan.fingerprint,
        scriptId: script.id, scriptFingerprint: script.fingerprint,
        sceneCursor: {
          sceneId: firstScene.id, sceneIndex: 0, totalScenes: script.scenes.length,
          visitedSceneIds: [firstScene.id],
        },
        presentationPreference: script.presentationPreference,
        selectedAnalysisTab: "key", manualMapViewState: { status: "inactive" },
        composerState: "compact", policyVersion: "runtime-session-v1",
        createdAt: NOW, updatedAt: NOW,
      });
    },
  };
}

export function request(text?: string): CreateBriefingRequest {
  return { question: question(text), presentationPreference: presentationPreference("auto") };
}

