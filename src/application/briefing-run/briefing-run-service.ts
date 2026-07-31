import { createBriefingSessionFingerprint, BriefingSessionSchema } from "../../session";
import {
  briefingScriptFingerprint,
  BriefingScriptSchema,
  type ValidatedBriefingScript,
} from "../../script";
import {
  BriefingRunOutcomeSchema,
  CreateBriefingRequestSchema,
} from "./schemas";
import type {
  BriefingRunFailureCategory,
  BriefingRunOutcome,
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

export class BriefingRunService {
  constructor(private readonly dependencies: BriefingRunServiceDependencies) {}

  async execute(input: unknown): Promise<BriefingRunOutcome> {
    const request = CreateBriefingRequestSchema.safeParse(input);
    if (!request.success) {
      return this.outcome({
        kind: "failed",
        finalStage: "received",
        technical: true,
        category: "request-invalid",
        reason: "REQUEST_INVALID",
      });
    }

    let activeStage: BriefingRunStage = "received";
    try {
      return await this.executeValidated(request.data, (stage) => {
        activeStage = stage;
      });
    } catch {
      return this.failure(activeStage, "unexpected", "UNEXPECTED_FAILURE");
    }
  }

  private async executeValidated(
    request: CreateBriefingRequest,
    setStage: (stage: BriefingRunStage) => void,
  ): Promise<BriefingRunOutcome> {
    setStage("contract-building");
    const contractResult = this.dependencies.contractCompiler.compile(request.question);
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
    setStage("context-building");
    const contextResult = this.dependencies.contextBuilder.build(
      this.dependencies.createContextRequest(request, contract),
    );
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
    setStage("plan-generating");
    const generationResult = await this.dependencies.generationCoordinator.generate(
      this.dependencies.createGenerationInput(request, contract, contextPackage),
    );
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
    setStage("script-compiling");
    const scriptResult = this.dependencies.scriptCompiler.compile({
      plan,
      contract,
      contextPackage,
      preference: request.presentationPreference,
    });
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

    setStage("session-creating");
    const sessionCandidate = this.dependencies.initializeSession({
      question: request.question,
      contract,
      contextPackage,
      plan,
      script,
    });
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

    setStage("completed");
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
}

function isValidatedScript(
  script: import("../../script").BriefingScriptDraft,
): script is ValidatedBriefingScript {
  return script.status === "validated" || script.status === "static-only";
}
