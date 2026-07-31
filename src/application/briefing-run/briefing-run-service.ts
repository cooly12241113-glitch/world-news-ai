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
    const contractResult = this.dependencies.contractCompiler.compile(request.question);
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
      return this.nonTechnical(
        "insufficient-evidence",
        "context-building",
        contextResult.outcome,
      );
    }

    const contextPackage = contextResult.contextPackage;
    state.stage = "plan-generating";
    if (this.cancelled(executionContext)) {
      return this.nonTechnical("cancelled", state.stage, "CANCELLATION_REQUESTED");
    }
    const generationResult = await this.dependencies.generationCoordinator.generate(
      this.dependencies.createGenerationInput(request, contract, contextPackage),
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
    if (outcome.kind !== "failed") return undefined;
    switch (outcome.category) {
      case "request-invalid": return "invalid-request";
      case "contract-invalid": return "contract-invalid";
      case "context-failed": return "context-unavailable";
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
