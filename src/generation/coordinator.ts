import { createSemanticFingerprint } from "../briefing";
import { ExplanationPlanValidator } from "../explanation";
import { GenerationAuditBuilder, mergeUsage } from "./audit";
import { proposalOutputHash } from "./fingerprint";
import { ExplanationPlanProposalHydrator } from "./hydrator";
import type {
  ExplanationPlanGenerationInput, ExplanationPlanLlmRequestPackage,
  GenerationAttempt, GenerationAuditRecord, GenerationError,
  ProviderStructuredResponse, StructuredGenerationProvider,
  StructuredGenerationResult,
} from "./models";
import { callWithRetry, defaultSleeper, type Sleeper } from "./provider";
import { validateProposal } from "./proposal";
import { ExplanationPlanLlmRequestBuilder } from "./request-builder";

export interface StructuredGenerationCoordinatorOptions {
  provider: StructuredGenerationProvider; requestBuilder?: ExplanationPlanLlmRequestBuilder;
  hydrator?: ExplanationPlanProposalHydrator; validator?: ExplanationPlanValidator;
  auditBuilder?: GenerationAuditBuilder; sleeper?: Sleeper; now?: () => Date;
}

export class StructuredExplanationPlanCoordinator {
  private readonly requestBuilder: ExplanationPlanLlmRequestBuilder;
  private readonly hydrator: ExplanationPlanProposalHydrator;
  private readonly validator: ExplanationPlanValidator;
  private readonly auditBuilder: GenerationAuditBuilder;
  private readonly sleeper: Sleeper;
  private readonly now: () => Date;

  constructor(private readonly options: StructuredGenerationCoordinatorOptions) {
    this.requestBuilder = options.requestBuilder ?? new ExplanationPlanLlmRequestBuilder();
    this.hydrator = options.hydrator ?? new ExplanationPlanProposalHydrator();
    this.validator = options.validator ?? new ExplanationPlanValidator();
    this.auditBuilder = options.auditBuilder ?? new GenerationAuditBuilder();
    this.sleeper = options.sleeper ?? defaultSleeper;
    this.now = options.now ?? (() => new Date());
  }

  async generate(input: ExplanationPlanGenerationInput): Promise<StructuredGenerationResult> {
    const startedAt = this.now().toISOString();
    const stopped = this.preflight(input, startedAt);
    if (stopped) return stopped;
    let request: ExplanationPlanLlmRequestPackage;
    try {
      request = this.requestBuilder.build(input);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Invalid generation input.";
      const code = message.includes("CONTRACT_NOT_READY") ? "CONTRACT_NOT_READY"
        : message.includes("CONTEXT_NOT_READY") ? "CONTEXT_NOT_READY"
          : message.includes("REFERENCE_MISMATCH") ? "REFERENCE_MISMATCH" : "INVALID_GENERATION_INPUT";
      const error: GenerationError = { code, stage: "request", message: code, retryable: false };
      return { success: false, error, audit: this.audit(input, startedAt, "invalid", [], { warnings: [code] }) };
    }
    if (!this.options.provider.metadata.configured) {
      const error: GenerationError = { code: "PROVIDER_NOT_CONFIGURED", stage: "provider", message: "Provider is not configured.", retryable: false };
      return { success: false, error, audit: this.audit(input, startedAt, request.requestFingerprint, [], { warnings: [error.code] }, request) };
    }
    const attempts: GenerationAttempt[] = [];
    let repairCount = 0;
    let currentRequest = request;
    while (true) {
      let calls;
      try {
        calls = await callWithRetry(this.options.provider, currentRequest, this.sleeper, input.abortSignal);
      } catch {
        const error: GenerationError = { code: "PROVIDER_ABORTED", stage: "transport", message: "Request aborted.", retryable: false };
        return { success: false, error, audit: this.audit(input, startedAt, request.requestFingerprint, attempts, { warnings: [error.code] }, request) };
      }
      for (const [index, call] of calls.entries()) attempts.push(toAttempt(
        call.response, attempts.length + 1,
        repairCount > 0 ? "repair" : index === 0 ? "initial" : "transport-retry",
        call.startedAt, call.completedAt,
      ));
      const response = calls.at(-1)!.response;
      if (response.outcome === "refusal") {
        return {
          success: true, outcome: "provider-refusal", reasons: [response.refusal.reason],
          audit: this.audit(input, startedAt, request.requestFingerprint, attempts, {
            refusal: response.refusal, providerResponseId: response.providerResponseId,
            usage: mergeUsage(attempts.flatMap(({ usage }) => usage ? [usage] : [])),
          }, request),
        };
      }
      if (response.outcome === "failure") {
        return { success: false, error: response.error, audit: this.audit(input, startedAt, request.requestFingerprint, attempts, {
          usage: mergeUsage(attempts.flatMap(({ usage }) => usage ? [usage] : [])),
          warnings: [response.error.code],
        }, request) };
      }
      const proposal = validateProposal(response.proposal, request.allowedReferenceCatalog);
      if (!proposal.success) {
        if (this.repairable(input, repairCount)) {
          repairCount += 1;
          currentRequest = repairRequest(request, proposal.error);
          continue;
        }
        const error = repairCount > 0
          ? { ...proposal.error, code: "REPAIR_EXHAUSTED" as const, stage: "repair" }
          : proposal.error;
        return { success: false, error, audit: this.audit(input, startedAt, request.requestFingerprint, attempts, {
          providerOutputHash: createSemanticFingerprint(response.proposal),
          providerResponseId: response.providerResponseId, finishReason: response.finishReason,
          warnings: [error.code],
        }, request) };
      }
      const hydrated = this.hydrator.hydrate(proposal.proposal, {
        request, contract: input.briefingContract,
        contextPackage: input.evidenceContextPackage, now: this.now().toISOString(),
        generator: { type: "llm", id: this.options.provider.metadata.adapterId, version: this.options.provider.metadata.adapterVersion },
        planVersion: input.generationPolicy.planSchemaVersion,
        policyVersion: input.generationPolicy.version,
        ...(input.personalizedImpactPlanningContext
          ? { personalizedImpactPlanningContext: input.personalizedImpactPlanningContext }
          : {}),
      });
      if (!hydrated.success || !hydrated.plan) {
        return { success: false, error: hydrated.error!, audit: this.audit(input, startedAt, request.requestFingerprint, attempts, { warnings: [hydrated.error!.code] }, request) };
      }
      const validation = this.validator.validate(
        hydrated.plan,
        input.briefingContract,
        input.evidenceContextPackage,
        input.personalizedImpactPlanningContext,
      );
      if (!("plan" in validation)) {
        if (validation.outcome === "insufficient-context") {
          return {
            success: true, outcome: "insufficient-context", reasons: validation.issues.map(({ message }) => message),
            audit: this.audit(input, startedAt, request.requestFingerprint, attempts, {
              providerOutputHash: proposalOutputHash(proposal.proposal),
              hydratedDraftFingerprint: hydrated.plan.fingerprint,
              validationOutcome: validation.outcome,
            }, request),
          };
        }
        if (this.repairable(input, repairCount)) {
          repairCount += 1;
          currentRequest = repairRequest(request, {
            code: "PLAN_SEMANTIC_INVALID", stage: "semantic-validation",
            message: validation.issues.map(({ code }) => code).join(","), retryable: false,
          });
          continue;
        }
        const error: GenerationError = {
          code: repairCount > 0 ? "REPAIR_EXHAUSTED" : "PLAN_SEMANTIC_INVALID",
          stage: "semantic-validation", message: "ExplanationPlan semantic validation failed.", retryable: false,
        };
        return { success: false, error, audit: this.audit(input, startedAt, request.requestFingerprint, attempts, {
          providerOutputHash: proposalOutputHash(proposal.proposal),
          hydratedDraftFingerprint: hydrated.plan.fingerprint,
          validationOutcome: validation.outcome, warnings: validation.issues.map(({ code }) => code),
        }, request) };
      }
      return {
        success: true, outcome: "validated-plan", plan: validation.plan, validation,
        audit: this.audit(input, startedAt, request.requestFingerprint, attempts, {
          providerOutputHash: proposalOutputHash(proposal.proposal),
          hydratedDraftFingerprint: hydrated.plan.fingerprint,
          validatedPlanFingerprint: validation.plan.fingerprint,
          validationOutcome: validation.outcome,
          providerResponseId: response.providerResponseId, finishReason: response.finishReason,
          usage: mergeUsage(attempts.flatMap(({ usage }) => usage ? [usage] : [])),
        }, request),
      };
    }
  }

  private repairable(input: ExplanationPlanGenerationInput, count: number) {
    return input.generationPolicy.allowRepair && count < input.generationBudget.maximumRepairAttempts;
  }

  private preflight(input: ExplanationPlanGenerationInput, startedAt: string): StructuredGenerationResult | undefined {
    const contract = input.briefingContract;
    const context = input.evidenceContextPackage;
    if (contract.status === "clarification-required" || contract.status === "unsupported") {
      const outcome = contract.status;
      return {
        success: true, outcome, reasons: contract.intentAnalysis.ambiguity.issues.length
          ? contract.intentAnalysis.ambiguity.issues : [`Contract is ${outcome}.`],
        audit: this.audit(input, startedAt, "not-generated", [], { warnings: [`Provider not called: ${outcome}`] }),
      };
    }
    if (["no-relevant-context", "insufficient-evidence"].includes(context.status) ||
        context.evidenceGaps.some(({ blocking }) => blocking)) {
      return {
        success: true, outcome: "insufficient-context",
        reasons: context.evidenceGaps.map(({ description }) => description),
        audit: this.audit(input, startedAt, "not-generated", [], { warnings: ["Provider not called: insufficient context"] }),
      };
    }
    return undefined;
  }

  private audit(
    input: ExplanationPlanGenerationInput, startedAt: string, fingerprint: string,
    attempts: GenerationAttempt[], update: Partial<GenerationAuditRecord>,
    request?: ExplanationPlanLlmRequestPackage,
  ): GenerationAuditRecord {
    return this.auditBuilder.create({
      requestId: input.requestId, requestFingerprint: fingerprint,
      questionId: input.question.id, contractId: input.briefingContract.id,
      contextPackageId: input.evidenceContextPackage.id,
      contractFingerprint: input.briefingContract.semanticFingerprint,
      contextPackageFingerprint: input.evidenceContextPackage.fingerprint,
      provider: this.options.provider.metadata, policy: input.generationPolicy,
      promptHash: request?.promptTemplate.hash ?? "not-generated", startedAt,
    }, attempts, update);
  }
}

function toAttempt(
  response: ProviderStructuredResponse, attempt: number,
  kind: GenerationAttempt["kind"], startedAt: string, completedAt: string,
): GenerationAttempt {
  return {
    attempt, kind, startedAt, completedAt, outcome: response.outcome,
    ...(response.outcome === "failure" ? { errorCode: response.error.code } : {}),
    ...(response.outcome !== "failure" && response.providerResponseId ? { providerResponseId: response.providerResponseId } : {}),
    ...(response.outcome === "proposal" && response.finishReason ? { finishReason: response.finishReason } : {}),
    ...(response.outcome !== "failure" && response.usage ? { usage: response.usage } : {}),
  };
}

function repairRequest(request: ExplanationPlanLlmRequestPackage, error: GenerationError): ExplanationPlanLlmRequestPackage {
  return {
    ...request,
    policySummary: {
      ...request.policySummary,
      repair: { reasonCode: error.code, instruction: "Correct only the structured proposal; do not add evidence or relax policy." },
    },
  };
}
