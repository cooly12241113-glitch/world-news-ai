import { createBriefingSessionFingerprint, BriefingSessionSchema } from "../../session";
import {
  briefingScriptFingerprint,
  BriefingScriptSchema,
  type ValidatedBriefingScript,
} from "../../script";
import {
  BriefingRunOutcomeSchema,
  BriefingRunResultSchema,
  CreateBriefingRequestSchema,
  RuntimeRunIdSchema,
} from "./schemas";
import type {
  BriefingRunExecutionContext,
  BriefingRunFailureCategory,
  BriefingRunOutcome,
  BriefingRunReceipt,
  BriefingRunReceiptFailureCategory,
  BriefingRunResult,
  BriefingRunServiceDependencies,
  BriefingRunStage,
  CreateBriefingRequest,
} from "./types";

const GENERATION_UNAVAILABLE_CODES = new Set([
  "PROVIDER_NOT_CONFIGURED",
  "PROVIDER_DISABLED",
  "PROVIDER_TIMEOUT",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_QUOTA_EXCEEDED",
  "PROVIDER_AUTHENTICATION_FAILED",
  "PROVIDER_PERMISSION_DENIED",
  "PROVIDER_TRANSIENT_ERROR",
]);

interface ExecutionState {
  stage: BriefingRunStage;
  contractFingerprint?: string;
  contextFingerprint?: string;
  explanationPlanFingerprint?: string;
  scriptFingerprint?: string;
  sessionFingerprint?: string;
  evidenceCount?: number;
  sceneCount?: number;
  personalizationRequested?: true;
  personalizationUsed?: true;
  exposureCount?: number;
  personalContextFingerprint?: string;
  personalizedImpactAnalysisFingerprint?: string;
}

export class BriefingRunService {
  constructor(private readonly dependencies: BriefingRunServiceDependencies) {}

  async execute(
    input: unknown,
    executionContext: BriefingRunExecutionContext = {},
  ): Promise<BriefingRunResult> {
    const runId = RuntimeRunIdSchema.parse(
      this.dependencies.runtimeIdGenerator.nextRunId(),
    );
    const startedAt = this.dependencies.runtimeClock.now();
    const state: ExecutionState = { stage: "received" };
    const request = CreateBriefingRequestSchema.safeParse(input);
    if (!request.success) {
      return this.finish(runId, startedAt, state, this.outcome({
        kind: "failed",
        finalStage: "received",
        technical: true,
        category: "request-invalid",
        reason: "REQUEST_INVALID",
      }));
    }

    if (this.cancelled(executionContext)) {
      return this.finish(
        runId,
        startedAt,
        state,
        this.nonTechnical("cancelled", "received", "CANCELLATION_REQUESTED"),
      );
    }

    try {
      const outcome = await this.executeValidated(
        request.data,
        executionContext,
        state,
      );
      return this.finish(runId, startedAt, state, outcome);
    } catch {
      return this.finish(
        runId,
        startedAt,
        state,
        this.failure(state.stage, "unexpected", "UNEXPECTED_FAILURE"),
      );
    }
  }

  private async executeValidated(
    request: CreateBriefingRequest,
    executionContext: BriefingRunExecutionContext,
    state: ExecutionState,
  ): Promise<BriefingRunOutcome> {
    state.stage = "contract-building";
    if (this.cancelled(executionContext)) {
      return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
    }
    let contractResult = this.dependencies.contractCompiler.compile(request.question);
    if (
      contractResult.success &&
      contractResult.contract.intentAnalysis.primaryIntent === "personalized-impact" &&
      request.personalImpactContext
    ) {
      contractResult = this.dependencies.contractCompiler.compile(
        questionWithPersonalContextBridge(request),
      );
    }
    if (contractResult.success) {
      state.contractFingerprint = contractResult.contract.semanticFingerprint;
    }
    if (this.cancelled(executionContext)) {
      return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
    }
    if (!contractResult.success) {
      return this.failure(
        "contract-building",
        "contract-invalid",
        contractResult.error.code,
      );
    }
    if (contractResult.outcome === "clarification-required") {
      if (contractResult.contract.intentAnalysis.primaryIntent === "personalized-impact") {
        if (request.personalImpactContext && !request.personalImpactContext.consent.enabled) {
          return this.nonTechnical(
            "personalized-impact-unavailable",
            "contract-building",
            "personalization-disabled",
          );
        }
        if (request.personalImpactContext?.exposures.length === 0) {
          return this.nonTechnical(
            "personalized-impact-unavailable",
            "contract-building",
            "enabled-no-exposures",
          );
        }
        return this.nonTechnical(
          "personalization-context-required",
          "contract-building",
          "PERSONAL_CONTEXT_REQUIRED",
        );
      }
      return this.nonTechnical(
        "clarification-required",
        "contract-building",
        contractResult.clarificationQuestion ?? "CLARIFICATION_REQUIRED",
      );
    }
    if (contractResult.outcome === "unsupported") {
      return this.nonTechnical(
        "policy-rejected",
        "contract-building",
        "QUESTION_UNSUPPORTED",
      );
    }

    const contract = contractResult.contract;
    state.stage = "context-building";
    if (this.cancelled(executionContext)) {
      return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
    }
    const contextResult = this.dependencies.contextBuilder.build(
      this.dependencies.createContextRequest(request, contract),
    );
    if (contextResult.success) {
      state.contextFingerprint = contextResult.contextPackage.fingerprint;
      state.evidenceCount = contextResult.contextPackage.selectedItems.length;
    }
    if (this.cancelled(executionContext)) {
      return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
    }
    if (!contextResult.success) {
      return this.failure(
        "context-building",
        "context-failed",
        contextResult.error.code,
      );
    }
    if (
      contextResult.outcome === "insufficient-evidence" ||
      contextResult.outcome === "no-relevant-context"
    ) {
      if (contract.intentAnalysis.primaryIntent !== "personalized-impact") {
        return this.nonTechnical(
          "insufficient-evidence",
          "context-building",
          contextResult.outcome,
        );
      }
    }

    const contextPackage = contextResult.contextPackage;
    let personalizedImpactPlanningContext:
      import("../../personalization").PersonalizedImpactPlanningContext | undefined;
    if (contract.intentAnalysis.primaryIntent === "personalized-impact") {
      state.stage = "impact-analyzing";
      state.personalizationRequested = true;
      if (request.personalImpactContext) {
        state.personalContextFingerprint = request.personalImpactContext.semanticFingerprint;
        state.exposureCount = request.personalImpactContext.exposures.length;
      }
      if (this.cancelled(executionContext)) {
        return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
      }
      const coordinator = this.dependencies.personalizedImpactCoordinator;
      if (!coordinator) {
        return this.nonTechnical(
          "personalized-impact-unavailable",
          state.stage,
          "PERSONALIZED_IMPACT_COORDINATOR_UNAVAILABLE",
        );
      }
      const impactResult = await coordinator.coordinate({
        personalContext: request.personalImpactContext,
        contract,
        evidenceContextPackage: contextPackage,
      });
      if (this.cancelled(executionContext)) {
        return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
      }
      if (impactResult.outcome === "context-required") {
        return this.nonTechnical(
          "personalization-context-required",
          state.stage,
          impactResult.reason,
        );
      }
      if (impactResult.outcome === "unavailable") {
        return this.nonTechnical(
          "personalized-impact-unavailable",
          state.stage,
          impactResult.reason,
        );
      }
      if (impactResult.outcome === "policy-rejected") {
        return this.nonTechnical("policy-rejected", state.stage, impactResult.reason);
      }
      if (impactResult.outcome !== "completed") {
        return this.failure(state.stage, "personalization-failed", "IMPACT_ACTIVATION_INVALID");
      }
      if (impactResult.analysis.evidenceContextFingerprint !== contextPackage.fingerprint) {
        return this.failure(state.stage, "lineage-mismatch", "IMPACT_EVIDENCE_LINEAGE_MISMATCH");
      }
      if (!request.personalImpactContext ||
          impactResult.analysis.personalContextFingerprint !==
            request.personalImpactContext.semanticFingerprint ||
          impactResult.planningContext.personalContextFingerprint !==
            request.personalImpactContext.semanticFingerprint ||
          impactResult.planningContext.analysisFingerprint !==
            impactResult.analysis.semanticFingerprint ||
          impactResult.planningContext.evidenceContextFingerprint !==
            contextPackage.fingerprint) {
        return this.failure(state.stage, "lineage-mismatch", "IMPACT_LINEAGE_MISMATCH");
      }
      personalizedImpactPlanningContext = impactResult.planningContext;
      state.personalizationUsed = true;
      state.personalizedImpactAnalysisFingerprint = impactResult.analysis.semanticFingerprint;
    }
    state.stage = "plan-generating";
    if (this.cancelled(executionContext)) {
      return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
    }
    const generationResult = await this.dependencies.generationCoordinator.generate(
      this.dependencies.createGenerationInput(
        request,
        contract,
        contextPackage,
        personalizedImpactPlanningContext,
      ),
    );
    if (generationResult.success && generationResult.outcome === "validated-plan") {
      state.explanationPlanFingerprint = generationResult.plan.fingerprint;
    }
    if (this.cancelled(executionContext)) {
      return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
    }
    if (!generationResult.success) {
      if (generationResult.error.code === "PROVIDER_ABORTED") {
        return this.nonTechnical("cancelled", "plan-generating", "PROVIDER_ABORTED");
      }
      if (GENERATION_UNAVAILABLE_CODES.has(generationResult.error.code)) {
        return this.nonTechnical(
          "generation-unavailable",
          "plan-generating",
          generationResult.error.code,
        );
      }
      return this.failure(
        "plan-generating",
        "generation-failed",
        generationResult.error.code,
      );
    }
    if (generationResult.outcome === "clarification-required") {
      return this.nonTechnical(
        "clarification-required",
        "plan-generating",
        "GENERATION_CLARIFICATION_REQUIRED",
      );
    }
    if (generationResult.outcome === "unsupported") {
      return this.nonTechnical(
        "policy-rejected",
        "plan-generating",
        "GENERATION_POLICY_REJECTED",
      );
    }
    if (generationResult.outcome === "insufficient-context") {
      return this.nonTechnical(
        "insufficient-evidence",
        "plan-generating",
        "GENERATION_CONTEXT_INSUFFICIENT",
      );
    }
    if (generationResult.outcome === "provider-refusal") {
      return this.nonTechnical(
        "generation-unavailable",
        "plan-generating",
        "PROVIDER_REFUSAL",
      );
    }
    if (generationResult.outcome !== "validated-plan") {
      return this.failure(
        "plan-generating",
        "generation-failed",
        "GENERATION_OUTCOME_INVALID",
      );
    }

    const plan = generationResult.plan;
    state.stage = "script-compiling";
    if (this.cancelled(executionContext)) {
      return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
    }
    const scriptResult = this.dependencies.scriptCompiler.compile({
      plan,
      contract,
      contextPackage,
      preference: request.presentationPreference,
      ...(personalizedImpactPlanningContext
        ? { personalizedImpactPlanningContext }
        : {}),
    });
    if ("script" in scriptResult) {
      state.scriptFingerprint = scriptResult.script.fingerprint;
      state.sceneCount = scriptResult.script.scenes.length;
    }
    if (this.cancelled(executionContext)) {
      return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
    }
    if (!scriptResult.success) {
      return this.failure(
        "script-compiling",
        "script-failed",
        scriptResult.error.code,
      );
    }
    if (!("script" in scriptResult)) {
      return this.nonTechnical(
        "insufficient-evidence",
        "script-compiling",
        scriptResult.outcome,
      );
    }

    const parsedScript = BriefingScriptSchema.safeParse(scriptResult.script);
    if (
      !parsedScript.success ||
      !isValidatedScript(parsedScript.data) ||
      briefingScriptFingerprint(parsedScript.data) !== parsedScript.data.fingerprint
    ) {
      return this.failure("script-compiling", "script-failed", "SCRIPT_INVALID");
    }
    const script = parsedScript.data;
    if (
      script.contractFingerprint !== contract.semanticFingerprint ||
      script.contextPackageFingerprint !== contextPackage.fingerprint ||
      script.explanationPlanFingerprint !== plan.fingerprint
    ) {
      return this.failure("script-compiling", "lineage-mismatch", "SCRIPT_LINEAGE_MISMATCH");
    }

    state.stage = "session-creating";
    if (this.cancelled(executionContext)) {
      return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
    }
    const sessionCandidate = this.dependencies.initializeSession({
      question: request.question,
      contract,
      contextPackage,
      plan,
      script,
    });
    if (this.cancelled(executionContext)) {
      return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
    }
    const parsedSession = BriefingSessionSchema.safeParse(sessionCandidate);
    if (
      !parsedSession.success ||
      createBriefingSessionFingerprint(sessionCandidate) !== sessionCandidate.semanticFingerprint
    ) {
      return this.failure("session-creating", "session-invalid", "SESSION_INVALID");
    }
    const session = parsedSession.data;
    if (
      session.contractFingerprint !== contract.semanticFingerprint ||
      session.contextPackageFingerprint !== contextPackage.fingerprint ||
      session.planFingerprint !== plan.fingerprint ||
      session.scriptId !== script.id ||
      session.scriptFingerprint !== script.fingerprint
    ) {
      return this.failure("session-creating", "lineage-mismatch", "SESSION_LINEAGE_MISMATCH");
    }

    state.sessionFingerprint = session.semanticFingerprint;
    state.stage = "completed";
    return this.outcome({
      kind: "completed",
      finalStage: "completed",
      technical: false,
      script,
      session,
      lineage: {
        contractFingerprint: contract.semanticFingerprint,
        contextFingerprint: contextPackage.fingerprint,
        explanationPlanFingerprint: plan.fingerprint,
        scriptFingerprint: script.fingerprint,
        sessionFingerprint: session.semanticFingerprint,
        ...(state.personalContextFingerprint
          ? { personalContextFingerprint: state.personalContextFingerprint }
          : {}),
        ...(state.personalizedImpactAnalysisFingerprint
          ? { personalizedImpactAnalysisFingerprint: state.personalizedImpactAnalysisFingerprint }
          : {}),
      },
    });
  }

  private nonTechnical(
    kind: Exclude<BriefingRunOutcome["kind"], "completed" | "failed">,
    finalStage: BriefingRunStage,
    reason: string,
  ): BriefingRunOutcome {
    switch (kind) {
      case "clarification-required":
        return this.outcome({ kind, finalStage, technical: false, reason });
      case "insufficient-evidence":
        return this.outcome({ kind, finalStage, technical: false, reason });
      case "generation-unavailable":
        return this.outcome({ kind, finalStage, technical: false, reason });
      case "personalization-context-required":
        return this.outcome({ kind, finalStage, technical: false, reason });
      case "personalized-impact-unavailable":
        return this.outcome({ kind, finalStage, technical: false, reason });
      case "policy-rejected":
        return this.outcome({ kind, finalStage, technical: false, reason });
      case "cancelled":
        return this.outcome({ kind, finalStage, technical: false, reason });
    }
  }

  private failure(
    finalStage: BriefingRunStage,
    category: BriefingRunFailureCategory,
    reason: string,
  ): BriefingRunOutcome {
    return this.outcome({
      kind: "failed",
      finalStage,
      technical: true,
      category,
      reason,
    });
  }

  private outcome(value: BriefingRunOutcome): BriefingRunOutcome {
    return BriefingRunOutcomeSchema.parse(value);
  }

  private cancelled(context: BriefingRunExecutionContext): boolean {
    return context.cancellation?.isCancellationRequested() === true;
  }

  private finish(
    runId: string,
    startedAt: string,
    state: ExecutionState,
    outcome: BriefingRunOutcome,
  ): BriefingRunResult {
    const receipt: BriefingRunReceipt = {
      runId,
      startedAt,
      completedAt: this.dependencies.runtimeClock.now(),
      finalStage: outcome.finalStage,
      outcomeKind: outcome.kind,
      ...(state.contractFingerprint
        ? { contractFingerprint: state.contractFingerprint }
        : {}),
      ...(state.contextFingerprint
        ? { contextFingerprint: state.contextFingerprint }
        : {}),
      ...(state.explanationPlanFingerprint
        ? { explanationPlanFingerprint: state.explanationPlanFingerprint }
        : {}),
      ...(state.scriptFingerprint
        ? { scriptFingerprint: state.scriptFingerprint }
        : {}),
      ...(state.sessionFingerprint
        ? { sessionFingerprint: state.sessionFingerprint }
        : {}),
      ...(state.personalizationRequested
        ? { personalizationRequested: true as const }
        : {}),
      ...(state.personalizationUsed ? { personalizationUsed: true as const } : {}),
      ...(state.exposureCount !== undefined ? { exposureCount: state.exposureCount } : {}),
      ...(state.personalContextFingerprint
        ? { personalContextFingerprint: state.personalContextFingerprint }
        : {}),
      ...(state.personalizedImpactAnalysisFingerprint
        ? { personalizedImpactAnalysisFingerprint: state.personalizedImpactAnalysisFingerprint }
        : {}),
      ...(state.evidenceCount !== undefined
        ? { evidenceCount: state.evidenceCount }
        : {}),
      ...(state.sceneCount !== undefined ? { sceneCount: state.sceneCount } : {}),
      ...(this.receiptFailureCategory(outcome)
        ? { failureCategory: this.receiptFailureCategory(outcome) }
        : {}),
    };
    return BriefingRunResultSchema.parse({ runId, outcome, receipt });
  }

  private receiptFailureCategory(
    outcome: BriefingRunOutcome,
  ): BriefingRunReceiptFailureCategory | undefined {
    if (outcome.kind === "generation-unavailable") {
      return "generation-unavailable";
    }
    if (outcome.kind === "personalization-context-required" ||
        outcome.kind === "personalized-impact-unavailable") {
      return "personalization-unavailable";
    }
    if (outcome.kind !== "failed") return undefined;
    switch (outcome.category) {
      case "request-invalid": return "invalid-request";
      case "contract-invalid": return "contract-invalid";
      case "context-failed": return "context-unavailable";
      case "personalization-failed": return "personalization-unavailable";
      case "generation-failed": return "invalid-proposal";
      case "script-failed": return "script-invalid";
      case "session-invalid": return "session-invalid";
      case "lineage-mismatch": return "invariant-violation";
      case "unexpected": return "unexpected";
    }
  }
}

function isValidatedScript(
  script: import("../../script").BriefingScriptDraft,
): script is ValidatedBriefingScript {
  return script.status === "validated" || script.status === "static-only";
}

function questionWithPersonalContextBridge(
  request: CreateBriefingRequest,
): CreateBriefingRequest["question"] {
  const current = request.question.userProvidedContext ?? {};
  const locations = [...(current.locations ?? [])];
  const industries = [...(current.industries ?? [])];
  const watchlist = [...(current.watchlist ?? [])];
  for (const exposure of request.personalImpactContext?.exposures ?? []) {
    switch (exposure.dimension) {
      case "geography": locations.push(exposure.countryCode); break;
      case "currency": watchlist.push(`currency:${exposure.currencyCode}`); break;
      case "industry": industries.push(exposure.industry); break;
      case "asset-class": watchlist.push(`asset-class:${exposure.assetClass}`); break;
      case "employment-business": industries.push(exposure.industry); break;
      case "consumption": watchlist.push(`consumption:${exposure.category}`); break;
      case "supply-chain": industries.push(exposure.industry); break;
    }
  }
  return {
    ...request.question,
    userProvidedContext: {
      ...current,
      ...(locations.length ? { locations: [...new Set(locations)].sort() } : {}),
      ...(industries.length ? { industries: [...new Set(industries)].sort() } : {}),
      ...(watchlist.length ? { watchlist: [...new Set(watchlist)].sort() } : {}),
    },
  };
}
