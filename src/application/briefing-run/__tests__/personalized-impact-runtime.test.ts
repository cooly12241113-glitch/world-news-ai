import { describe, expect, it } from "vitest";
import {
  ExplanationPlanSchema,
  ExplanationPlanValidator,
  RuleBasedExplanationPlanAssembler,
  type ValidatedExplanationPlan,
} from "../../../explanation";
import {
  DeterministicFakeStructuredProvider,
  ExplanationPlanProposalSchema,
  proposalFromExplanationPlan,
  StructuredExplanationPlanCoordinator,
  type ExplanationPlanGenerationInput,
  type ExplanationPlanLlmRequestPackage,
  type ExplanationPlanProposal,
} from "../../../generation";
import { proposalFromPlan } from "../../../generation/__tests__/fixtures";
import {
  createPersonalImpactContext,
  PersonalizedImpactAnalyzer,
  requiresPersonalizedImpactRebuild,
} from "../../../personalization";
import {
  deterministicImpactPolicy,
  impactInput,
} from "../../../personalization/__tests__/impact-fixtures";
import {
  briefingScriptFingerprint,
  BriefingScriptSchema,
  BriefingScriptValidator,
} from "../../../script";
import { PersonalizedImpactCoordinator } from "../../personalized-impact";
import { isCurrentBriefingRun } from "../briefing-run-acceptance";
import { BriefingRunService } from "../briefing-run-service";
import type { BriefingRunServiceDependencies, CreateBriefingRequest } from "../types";
import { dependencies, NOW, request as ordinaryRequest } from "./fixtures";

describe("Sprint 16.3 personalized impact runtime", () => {
  it("runs Contract -> Context -> Impact -> Plan -> Script -> Session with private receipt", async () => {
    const fixture = impactInput();
    const result = await new BriefingRunService(personalizedDependencies()).execute(
      personalizedRequest(fixture),
    );

    expect(result.outcome.kind, JSON.stringify(result.outcome)).toBe("completed");
    if (result.outcome.kind !== "completed") throw new Error("Expected completion.");
    expect(result.outcome.lineage.personalContextFingerprint)
      .toBe(fixture.personalContext.semanticFingerprint);
    expect(result.outcome.lineage.personalizedImpactAnalysisFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.receipt).toMatchObject({
      finalStage: "completed",
      personalizationRequested: true,
      personalizationUsed: true,
      exposureCount: 3,
      personalContextFingerprint: fixture.personalContext.semanticFingerprint,
    });
    expect(JSON.stringify(result.receipt)).not.toContain("USD");
    expect(JSON.stringify(result.receipt)).not.toContain("semiconductor");
    expect(JSON.stringify(result.receipt)).not.toContain("consent");

    const script = result.outcome.script;
    expect(script.contextPackageFingerprint)
      .toBe(script.personalizedImpactPlanningContext?.evidenceContextFingerprint);
    expect(script.scenes.flatMap(({ contentBindings }) => contentBindings)).not.toHaveLength(0);
    const personalBindings = script.scenes.flatMap(
      ({ personalImpactBindings }) => personalImpactBindings ?? [],
    );
    expect(personalBindings.some(({ impactChannelIds }) => impactChannelIds.length > 0)).toBe(true);
    expect(personalBindings.some(({ scenarioIds }) => scenarioIds.length > 0)).toBe(true);
    expect(script.scenes.some(({ kind }) => kind === "impact-path")).toBe(true);
    expect(script.scenes.some(({ kind }) => kind === "scenario")).toBe(true);
    expect(script.personalizedImpactPlanningContext?.scenarios[0]).toMatchObject({
      horizon: { amount: 3, unit: "month" },
      triggerConditionIds: expect.any(Array),
      counterSignalConditionIds: expect.any(Array),
      expectedDirection: "mixed",
    });
    expect(JSON.stringify(script)).not.toMatch(/"(recommendation|targetWeight|importanceScore|probability)":/u);
    expect(result.outcome.session.scriptFingerprint).toBe(script.fingerprint);
  });

  it("does not activate hidden personalization for a normal intent", async () => {
    const base = dependencies();
    let calls = 0;
    const normal = ordinaryRequest("Why did the energy disruption raise market costs?");
    normal.personalImpactContext = createPersonalImpactContext({
      contextVersion: "1",
      consent: { enabled: false, purpose: "personalized-impact-analysis" },
      callerScope: { lifetime: "request-run", propagation: "explicit-only" },
      exposures: [],
    });
    const result = await new BriefingRunService({
      ...base,
      personalizedImpactCoordinator: {
        async coordinate() {
          calls += 1;
          throw new Error("Normal intent must not activate personalization.");
        },
      },
    }).execute(normal);
    expect(result.outcome.kind, JSON.stringify(result.outcome)).toBe("completed");
    expect(calls).toBe(0);
    expect(result.receipt.personalizationRequested).toBeUndefined();
  });

  it("returns a typed context-required outcome without generic fallback", async () => {
    const fixture = impactInput();
    const request = personalizedRequest(fixture);
    delete request.personalImpactContext;
    const result = await new BriefingRunService(personalizedDependencies()).execute(request);
    expect(result.outcome).toMatchObject({
      kind: "personalization-context-required",
      finalStage: "impact-analyzing",
    });
    expect(result.receipt.failureCategory).toBe("personalization-unavailable");
    expect(result.receipt.explanationPlanFingerprint).toBeUndefined();
  });

  it("stops enabled context with no exposures before the analyzer", async () => {
    const fixture = impactInput();
    const request = personalizedRequest(fixture);
    request.personalImpactContext = createPersonalImpactContext({
      contextVersion: "1",
      consent: { enabled: true, purpose: "personalized-impact-analysis" },
      callerScope: { lifetime: "request-run", propagation: "explicit-only" },
      exposures: [],
    });
    const result = await new BriefingRunService(personalizedDependencies()).execute(request);
    expect(result.outcome).toMatchObject({
      kind: "personalized-impact-unavailable",
      reason: "enabled-no-exposures",
    });
    expect(result.receipt.personalizedImpactAnalysisFingerprint).toBeUndefined();
  });

  it("keeps disabled personalization distinct from missing or empty context", async () => {
    const fixture = impactInput();
    const request = personalizedRequest(fixture);
    request.personalImpactContext = createPersonalImpactContext({
      contextVersion: "1",
      consent: { enabled: false, purpose: "personalized-impact-analysis" },
      callerScope: { lifetime: "request-run", propagation: "explicit-only" },
      exposures: [],
    });
    const result = await new BriefingRunService(personalizedDependencies()).execute(request);
    expect(result.outcome).toMatchObject({
      kind: "personalized-impact-unavailable",
      reason: "personalization-disabled",
    });
  });

  it.each([
    [false, "personalization-disabled"],
    [true, "enabled-no-exposures"],
  ] as const)(
    "maps a real Contract clarification to the precise context state (enabled=%s)",
    async (enabled, reason) => {
      const request = ordinaryRequest("How could this affect my portfolio?");
      request.question.personalizationRequested = true;
      request.personalImpactContext = createPersonalImpactContext({
        contextVersion: "1",
        consent: { enabled, purpose: "personalized-impact-analysis" },
        callerScope: { lifetime: "request-run", propagation: "explicit-only" },
        exposures: [],
      });
      const result = await new BriefingRunService(dependencies()).execute(request);
      expect(result.outcome).toMatchObject({
        kind: "personalized-impact-unavailable",
        finalStage: "contract-building",
        reason,
      });
    },
  );

  it("bridges safe exposure descriptors into the real Contract compiler", async () => {
    const request = ordinaryRequest("How could this affect my USD assets?");
    request.question.personalizationRequested = true;
    request.personalImpactContext = impactInput().personalContext;
    const result = await new BriefingRunService(dependencies()).execute(request);
    expect(result.outcome).toMatchObject({
      kind: "personalized-impact-unavailable",
      finalStage: "impact-analyzing",
      reason: "PERSONALIZED_IMPACT_COORDINATOR_UNAVAILABLE",
    });
    expect(result.receipt.personalContextFingerprint)
      .toBe(request.personalImpactContext.semanticFingerprint);
  });

  it("keeps unsupported mapping explicit", async () => {
    const result = await new BriefingRunService(personalizedDependencies(
      deterministicImpactPolicy(() => undefined),
    )).execute(personalizedRequest(impactInput()));
    expect(result.outcome).toMatchObject({
      kind: "personalized-impact-unavailable",
      reason: "unsupported-impact-path",
    });
  });

  it("maps malformed mapping output to policy-rejected", async () => {
    const malformedPolicy = deterministicImpactPolicy((proposal) => {
      Object.assign(proposal, { recommendation: "buy" });
      return proposal;
    });
    const result = await new BriefingRunService(personalizedDependencies(
      malformedPolicy,
    )).execute(personalizedRequest(impactInput()));
    expect(result.outcome).toMatchObject({
      kind: "policy-rejected",
      reason: "impact-policy-rejected",
    });
  });

  it("maps personalized insufficient evidence without entering Plan", async () => {
    const fixture = impactInput();
    fixture.evidenceContextPackage = {
      ...fixture.evidenceContextPackage,
      status: "insufficient-evidence",
    };
    const result = await new BriefingRunService(personalizedDependencies(
      deterministicImpactPolicy(),
      fixture,
    )).execute(personalizedRequest(fixture));
    expect(result.outcome).toMatchObject({
      kind: "personalized-impact-unavailable",
      reason: "insufficient-evidence",
      finalStage: "impact-analyzing",
    });
    expect(result.receipt.explanationPlanFingerprint).toBeUndefined();
  });

  it("rejects a late impact result at the existing cancellation boundary", async () => {
    const fixture = impactInput();
    const base = personalizedDependencies();
    const real = base.personalizedImpactCoordinator!;
    let cancelled = false;
    let generationCalls = 0;
    const result = await new BriefingRunService({
      ...base,
      personalizedImpactCoordinator: {
        async coordinate(input) {
          await Promise.resolve();
          const value = await real.coordinate(input);
          cancelled = true;
          return value;
        },
      },
      generationCoordinator: {
        async generate(input) {
          generationCalls += 1;
          return base.generationCoordinator.generate(input);
        },
      },
    }).execute(personalizedRequest(fixture), {
      cancellation: { isCancellationRequested: () => cancelled },
    });
    expect(result.outcome.kind).toBe("cancelled");
    expect(result.receipt.finalStage).toBe("impact-analyzing");
    expect(result.receipt.personalizedImpactAnalysisFingerprint).toBeUndefined();
    expect(generationCalls).toBe(0);
  });

  it("rejects coordinator lineage mismatch before Plan generation", async () => {
    const base = personalizedDependencies();
    const real = base.personalizedImpactCoordinator!;
    let generationCalls = 0;
    const result = await new BriefingRunService({
      ...base,
      personalizedImpactCoordinator: {
        async coordinate(input) {
          const value = await real.coordinate(input);
          if (value.outcome !== "completed") return value;
          return {
            ...value,
            planningContext: {
              ...value.planningContext,
              evidenceContextFingerprint: "f".repeat(64),
            },
          };
        },
      },
      generationCoordinator: {
        async generate(input) {
          generationCalls += 1;
          return base.generationCoordinator.generate(input);
        },
      },
    }).execute(personalizedRequest(impactInput()));
    expect(result.outcome).toMatchObject({
      kind: "failed",
      finalStage: "impact-analyzing",
      category: "lineage-mismatch",
      reason: "IMPACT_LINEAGE_MISMATCH",
    });
    expect(generationCalls).toBe(0);
  });

  it("preserves non-personalized semantic fingerprints exactly", async () => {
    const baseline = await new BriefingRunService(dependencies()).execute(ordinaryRequest());
    const withOptionalCollaborator = await new BriefingRunService({
      ...dependencies(),
      personalizedImpactCoordinator: new PersonalizedImpactCoordinator(
        new PersonalizedImpactAnalyzer(deterministicImpactPolicy()),
      ),
    }).execute(ordinaryRequest());
    expect(withOptionalCollaborator.outcome.kind).toBe("completed");
    expect(baseline.outcome.kind).toBe("completed");
    if (baseline.outcome.kind !== "completed" || withOptionalCollaborator.outcome.kind !== "completed") {
      throw new Error("Expected non-personalized completion.");
    }
    expect(withOptionalCollaborator.outcome.lineage).toEqual(baseline.outcome.lineage);
    expect(withOptionalCollaborator.outcome.script.scenes).toEqual(baseline.outcome.script.scenes);
  });

  it("keeps stale acceptance stateless and treats context changes as full rebuilds", async () => {
    const result = await new BriefingRunService(personalizedDependencies()).execute(
      personalizedRequest(impactInput()),
    );
    expect(isCurrentBriefingRun("run:newer", result)).toBe(false);
    expect(isCurrentBriefingRun(result.runId, result)).toBe(true);
    expect(requiresPersonalizedImpactRebuild("a", "b")).toBe(true);
    expect(requiresPersonalizedImpactRebuild("a", "a")).toBe(false);
  });

  it("strict schemas reject recommendation, probability, ranking, and raw context", async () => {
    const capture: RuntimeCapture = {};
    const result = await new BriefingRunService(personalizedDependencies(
      deterministicImpactPolicy(),
      impactInput(),
      capture,
    )).execute(personalizedRequest(impactInput()));
    if (result.outcome.kind !== "completed" || !capture.plan || !capture.proposal) {
      throw new Error("Expected captured completion.");
    }
    const script = result.outcome.script;
    for (const forbidden of [
      { recommendation: "buy" },
      { probability: 0.8 },
      { ranking: 1 },
      { targetWeight: 0.5 },
      { rawContext: { note: "private" } },
    ]) {
      expect(ExplanationPlanProposalSchema.safeParse({ ...capture.proposal, ...forbidden }).success)
        .toBe(false);
      expect(ExplanationPlanSchema.safeParse({ ...capture.plan, ...forbidden }).success)
        .toBe(false);
      expect(BriefingScriptSchema.safeParse({ ...script, ...forbidden }).success).toBe(false);
    }
  });

  it("passes only the safe analysis projection to structured generation", async () => {
    const capture: RuntimeCapture = {};
    const result = await new BriefingRunService(personalizedDependencies(
      deterministicImpactPolicy(),
      impactInput(),
      capture,
    )).execute(personalizedRequest(impactInput()));
    expect(result.outcome.kind).toBe("completed");
    const serialized = JSON.stringify(capture.providerRequest);
    expect(capture.providerRequest?.personalizedImpactPlanningContext?.exposures[0])
      .toMatchObject({ exposureId: expect.any(String), dimension: expect.any(String), canonicalSubject: expect.any(String) });
    expect(serialized).not.toContain('"consent"');
    expect(serialized).not.toContain('"callerScope"');
    expect(serialized).not.toContain('"semanticFingerprint"');
  });

  it("rejects foreign Plan lineage, forged personal references, and exposure-as-evidence", async () => {
    const fixture = impactInput();
    const capture: RuntimeCapture = {};
    const result = await new BriefingRunService(personalizedDependencies(
      deterministicImpactPolicy(),
      fixture,
      capture,
    )).execute(personalizedRequest(fixture));
    if (result.outcome.kind !== "completed" || !capture.plan) {
      throw new Error("Expected captured personalized completion.");
    }
    const planning = result.outcome.script.personalizedImpactPlanningContext!;
    expect(proposalFromExplanationPlan(capture.plan).sections.flatMap(({ steps }) => steps)
      .some(({ personalImpactBindings }) => personalImpactBindings !== undefined)).toBe(true);
    const planValidator = new ExplanationPlanValidator();

    const foreignLineage = structuredClone(capture.plan);
    foreignLineage.personalizedImpactAnalysisFingerprint = "f".repeat(64);
    expect(planValidator.validate(
      foreignLineage,
      fixture.contract,
      fixture.evidenceContextPackage,
      planning,
    )).toMatchObject({ outcome: "invalid" });

    const foreignReference = structuredClone(capture.plan);
    const personalStep = foreignReference.sections.flatMap(({ steps }) => steps)
      .find(({ personalImpactBindings }) => personalImpactBindings);
    personalStep!.personalImpactBindings!.impactChannelIds = ["impact-channel:foreign"];
    expect(planValidator.validate(
      foreignReference,
      fixture.contract,
      fixture.evidenceContextPackage,
      planning,
    )).toMatchObject({ outcome: "invalid" });

    const exposureAsEvidence = structuredClone(capture.plan);
    const evidenceStep = exposureAsEvidence.sections.flatMap(({ steps }) => steps)
      .find(({ evidenceBindings }) => evidenceBindings.length > 0)!;
    evidenceStep.evidenceBindings[0]!.contextItemId = planning.exposures[0]!.exposureId;
    expect(planValidator.validate(
      exposureAsEvidence,
      fixture.contract,
      fixture.evidenceContextPackage,
      planning,
    )).toMatchObject({ outcome: "invalid" });
    expect(ExplanationPlanSchema.safeParse({ ...capture.plan, rawContext: fixture.personalContext }).success)
      .toBe(false);

    const forgedScript = structuredClone(result.outcome.script);
    const scriptBinding = forgedScript.scenes.flatMap(
      ({ personalImpactBindings }) => personalImpactBindings ?? [],
    )[0]!;
    scriptBinding.impactChannelIds = ["impact-channel:forged"];
    forgedScript.fingerprint = briefingScriptFingerprint(forgedScript);
    expect(new BriefingScriptValidator().validate(
      forgedScript,
      capture.plan,
      fixture.contract,
      fixture.evidenceContextPackage,
      planning,
    )).toMatchObject({ outcome: "invalid" });
  });
});

function personalizedDependencies(
  policy = deterministicImpactPolicy(),
  fixture = impactInput(),
  capture?: RuntimeCapture,
): BriefingRunServiceDependencies {
  let generationInput: ExplanationPlanGenerationInput | undefined;
  const provider = new DeterministicFakeStructuredProvider((requestPackage) => {
    if (capture) capture.providerRequest = requestPackage;
    if (!generationInput?.personalizedImpactPlanningContext) {
      throw new Error("Personalized planning context was not prepared.");
    }
    const built = new RuleBasedExplanationPlanAssembler({
      now: () => new Date(NOW),
      createId: () => "plan:personalized-runtime",
    }).generate({
      question: generationInput.question,
      contract: generationInput.briefingContract,
      contextPackage: generationInput.evidenceContextPackage,
    });
    if (!built.success || !("plan" in built)) throw new Error("Plan fixture failed.");
    const proposal = bindPersonalizedProposal(
      proposalFromPlan(built.plan),
      generationInput.personalizedImpactPlanningContext,
    );
    if (capture) capture.proposal = proposal;
    return {
      outcome: "proposal",
      proposal,
      providerResponseId: "provider-response:personalized-runtime",
    };
  });
  const base = dependencies(provider);
  const generationCoordinator = new StructuredExplanationPlanCoordinator({
    provider,
    now: () => new Date(NOW),
    sleeper: async () => undefined,
  });
  return {
    ...base,
    contractCompiler: {
      compile: () => ({
        success: true,
        outcome: "ready",
        intentAnalysis: fixture.contract.intentAnalysis,
        contract: fixture.contract,
      }),
    },
    contextBuilder: {
      build: () => ({
        success: true,
        outcome: fixture.evidenceContextPackage.status,
        contextPackage: fixture.evidenceContextPackage,
        warnings: [],
      }),
    },
    personalizedImpactCoordinator: new PersonalizedImpactCoordinator(
      new PersonalizedImpactAnalyzer(policy),
    ),
    generationCoordinator: {
      async generate(input) {
        const result = await generationCoordinator.generate(input);
        if (capture && result.success && result.outcome === "validated-plan") {
          capture.plan = result.plan;
        }
        return result;
      },
    },
    createGenerationInput(runtimeRequest, contract, contextPackage, planning) {
      generationInput = {
        question: runtimeRequest.question,
        briefingContract: contract,
        evidenceContextPackage: contextPackage,
        generationPolicy: {
          id: "generation:personalized-runtime",
          version: "generation-v1",
          promptTemplateId: "explanation-plan",
          promptTemplateVersion: "1.0.0",
          proposalSchemaVersion: "proposal-v1",
          planSchemaVersion: "explanation-plan-v1",
          allowRepair: false,
          retryBaseDelayMs: 0,
        },
        providerSelection: { providerId: "deterministic-fake", modelId: "fixture-v1" },
        generationBudget: {
          maximumInputCharacters: 100_000,
          maximumOutputTokens: 8_000,
          timeoutMs: 5_000,
          maximumTransportRetries: 0,
          maximumRepairAttempts: 0,
        },
        requestedAt: NOW,
        requestId: "generation-request:personalized-runtime",
        ...(planning ? { personalizedImpactPlanningContext: planning } : {}),
      };
      return generationInput;
    },
  };
}

interface RuntimeCapture {
  plan?: ValidatedExplanationPlan;
  providerRequest?: ExplanationPlanLlmRequestPackage;
  proposal?: ExplanationPlanProposal;
}

function personalizedRequest(fixture: ReturnType<typeof impactInput>): CreateBriefingRequest {
  return {
    question: {
      id: fixture.contract.questionId,
      text: "How could semiconductor policy affect my explicit exposures?",
      language: "en",
      submittedAt: NOW,
      referencedEventIds: ["event:semiconductor-policy"],
      referencedEntityIds: [],
      personalizationRequested: true,
    },
    presentationPreference: ordinaryRequest().presentationPreference,
    personalImpactContext: fixture.personalContext,
  };
}

function bindPersonalizedProposal(
  proposal: ExplanationPlanProposal,
  planning: NonNullable<ExplanationPlanGenerationInput["personalizedImpactPlanningContext"]>,
): ExplanationPlanProposal {
  const channelStep = proposal.sections.flatMap(({ steps }) => steps)
    .find(({ kind }) => kind === "explain-mechanism");
  const scenarioStep = proposal.sections.flatMap(({ steps }) => steps)
    .find(({ kind }) => kind === "expose-uncertainty");
  if (!channelStep || !scenarioStep) throw new Error("Personalized proposal steps are missing.");
  channelStep.kind = "trace-impact-channel";
  channelStep.outputRequirement.outputType = "impact-link";
  channelStep.outputRequirement.allowedEpistemicTypes = ["inference"];
  channelStep.epistemicPolicy = {
    ...channelStep.epistemicPolicy,
    allowedTypes: ["inference"],
    preferredType: "inference",
    allowInference: true,
    allowForecast: false,
    requireAssumptions: false,
  };
  channelStep.personalImpactBindings = {
    analysisFingerprint: planning.analysisFingerprint,
    exposureIds: planning.exposures.map(({ exposureId }) => exposureId),
    impactChannelIds: planning.channels.map(({ channelId }) => channelId),
    impactAssessmentIds: planning.assessments.map(({ assessmentId }) => assessmentId),
    scenarioIds: [],
  };
  scenarioStep.kind = "define-scenario";
  scenarioStep.outputRequirement.outputType = "scenario";
  scenarioStep.outputRequirement.allowedEpistemicTypes = ["forecast"];
  scenarioStep.epistemicPolicy = {
    ...scenarioStep.epistemicPolicy,
    allowedTypes: ["forecast"],
    preferredType: "forecast",
    allowInference: false,
    allowForecast: true,
    requireAssumptions: true,
  };
  scenarioStep.personalImpactBindings = {
    analysisFingerprint: planning.analysisFingerprint,
    exposureIds: planning.scenarios.flatMap(({ affectedExposureIds }) => affectedExposureIds),
    impactChannelIds: planning.scenarios.flatMap(({ channelIds }) => channelIds),
    impactAssessmentIds: [],
    scenarioIds: planning.scenarios.map(({ scenarioId }) => scenarioId),
  };
  return proposal;
}
