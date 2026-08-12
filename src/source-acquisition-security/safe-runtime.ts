import { createHash } from "node:crypto";
import { SourceAcquisitionRequestSchema } from "../source-connector";
import { SourceAcquisitionAuthorizer } from "../source-governance";
import { InMemoryAcquisitionAdmissionGate } from "./admission";
import { approveEgressTarget } from "./egress-target";
import { createLifecycleFailure } from "./failure-mapping";
import { acquireBoundedBody } from "./bounded-body";
import type {
  AcquisitionAdmissionGate,
  AdmissionDecision,
  AdmissionLease,
  AdmissionPolicy,
  AcquisitionAttemptAuditSink,
  CancellationAwareSleeper,
  MonotonicClock,
  PinnedResponseHeadTransport,
  SafeLifecyclePolicy,
  SafeNetworkAcquisitionInput,
  SafeNetworkAcquisitionResult,
  SafeResponseHead,
  SafePinnedResponse,
  SafeAcquisitionAttemptAudit,
} from "./lifecycle-models";
import {
  DEFAULT_ADMISSION_POLICY,
  DEFAULT_SAFE_LIFECYCLE_POLICY,
  HARD_MAX_RESPONSE_HEADER_BYTES,
  HARD_MAX_ENCODED_BODY_BYTES,
  HARD_MAX_DECODED_BODY_BYTES,
  HARD_MAX_BODY_IDLE_TIMEOUT_MS,
} from "./lifecycle-models";
import {
  TargetSecurityError,
  type DnsResolver,
  type ValidatedNetworkTarget,
} from "./models";
import {
  defaultCancellationAwareSleeper,
  raceAsyncOperation,
  systemMonotonicClock,
} from "./timing";
import { validateNetworkTarget } from "./url-validator";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);
const RETRYABLE_TRANSPORT_REASONS = new Set([
  "DNS_RESOLUTION_FAILED",
  "PINNED_TRANSPORT_FAILED",
  "ATTEMPT_TIMEOUT",
]);

const positiveInteger = (value: number): boolean =>
  Number.isFinite(value) && Number.isInteger(value) && value > 0;

export const validateSafeLifecyclePolicy = (policy: SafeLifecyclePolicy): void => {
  if (!Number.isInteger(policy.maxRedirects) || policy.maxRedirects < 0 ||
      policy.maxRedirects > 20 ||
      !positiveInteger(policy.maxAttemptsPerTarget) ||
      policy.maxAttemptsPerTarget > 10 ||
      !positiveInteger(policy.overallDeadlineMs) ||
      policy.overallDeadlineMs > 300_000 ||
      !positiveInteger(policy.attemptTimeoutMs) ||
      policy.attemptTimeoutMs > 60_000 ||
      policy.attemptTimeoutMs > policy.overallDeadlineMs ||
      !positiveInteger(policy.retryBaseDelayMs) ||
      !positiveInteger(policy.maxRetryDelayMs) ||
      policy.retryBaseDelayMs > policy.maxRetryDelayMs ||
      policy.maxRetryDelayMs > 30_000 ||
      !positiveInteger(policy.maxHeaderSizeBytes) ||
      policy.maxHeaderSizeBytes > HARD_MAX_RESPONSE_HEADER_BYTES ||
      !positiveInteger(policy.maxEncodedBodyBytes) ||
      policy.maxEncodedBodyBytes > HARD_MAX_ENCODED_BODY_BYTES ||
      !positiveInteger(policy.maxDecodedBodyBytes) ||
      policy.maxDecodedBodyBytes > HARD_MAX_DECODED_BODY_BYTES ||
      !positiveInteger(policy.bodyIdleTimeoutMs) ||
      policy.bodyIdleTimeoutMs > HARD_MAX_BODY_IDLE_TIMEOUT_MS) {
    throw new Error("INVALID_SAFE_LIFECYCLE_POLICY");
  }
};

const originKey = (target: ValidatedNetworkTarget): string =>
  `${target.scheme}://${target.originalHostname}:${target.effectivePort}`;

const requestTargetFingerprint = (target: ValidatedNetworkTarget): string =>
  createHash("sha256").update(JSON.stringify({
    scheme: target.scheme,
    hostname: target.originalHostname,
    port: target.effectivePort,
    pathAndQuery: target.pathAndQuery.replace(/%[0-9a-f]{2}/giu, (encoded) => {
      const decoded = String.fromCharCode(Number.parseInt(encoded.slice(1), 16));
      return /^[A-Z0-9._~-]$/iu.test(decoded) ? decoded : encoded.toUpperCase();
    }),
  })).digest("hex");

const parseRetryAfterMs = (
  value: string | undefined,
  maximumMs: number,
): number | undefined => {
  if (value === undefined || !/^\d{1,9}$/u.test(value)) return undefined;
  const milliseconds = Number(value) * 1_000;
  if (!Number.isSafeInteger(milliseconds)) return undefined;
  return Math.min(milliseconds, maximumMs);
};

const cancellationRequested = (input: SafeNetworkAcquisitionInput): boolean =>
  input.cancellation?.isCancellationRequested() === true;

interface SafeNetworkAcquisitionRuntimeDependencies {
  resolver: DnsResolver;
  transport: PinnedResponseHeadTransport;
  authorizer?: SourceAcquisitionAuthorizer;
  admissionGate?: AcquisitionAdmissionGate;
  admissionPolicy?: AdmissionPolicy;
  clock?: MonotonicClock;
  sleeper?: CancellationAwareSleeper;
  policy?: SafeLifecyclePolicy;
  auditSink?: AcquisitionAttemptAuditSink;
}

export class SafeNetworkAcquisitionRuntime {
  readonly #resolver: DnsResolver;
  readonly #transport: PinnedResponseHeadTransport;
  readonly #authorizer: SourceAcquisitionAuthorizer;
  readonly #admissionGate: AcquisitionAdmissionGate;
  readonly #clock: MonotonicClock;
  readonly #sleeper: CancellationAwareSleeper;
  readonly #policy: SafeLifecyclePolicy;
  readonly #auditSink?: AcquisitionAttemptAuditSink;

  constructor(dependencies: SafeNetworkAcquisitionRuntimeDependencies) {
    this.#resolver = dependencies.resolver;
    this.#transport = dependencies.transport;
    this.#authorizer = dependencies.authorizer ?? new SourceAcquisitionAuthorizer();
    this.#admissionGate = dependencies.admissionGate ??
      new InMemoryAcquisitionAdmissionGate(
        dependencies.admissionPolicy ?? DEFAULT_ADMISSION_POLICY,
      );
    this.#clock = dependencies.clock ?? systemMonotonicClock;
    this.#sleeper = dependencies.sleeper ?? defaultCancellationAwareSleeper;
    this.#policy = {
      ...DEFAULT_SAFE_LIFECYCLE_POLICY,
      ...dependencies.policy,
    };
    this.#auditSink = dependencies.auditSink;
    validateSafeLifecyclePolicy(this.#policy);
  }

  async execute(input: SafeNetworkAcquisitionInput):
  Promise<SafeNetworkAcquisitionResult> {
    const parsedRequest = SourceAcquisitionRequestSchema.safeParse(input.request);
    if (!parsedRequest.success) {
      return createLifecycleFailure(input.request, "UNSUPPORTED_NETWORK_PROTOCOL");
    }
    const request = parsedRequest.data;
    if (request.locator.kind !== "web") {
      return createLifecycleFailure(request, "UNSUPPORTED_NETWORK_PROTOCOL");
    }
    const startedAtMs = this.#clock.nowMs();
    const overallDeadlineAtMs = startedAtMs + this.#policy.overallDeadlineMs;
    let currentUrl = request.locator.url;
    let redirectHop = 0;
    const visitedTargets = new Set<string>();
    const audit: SafeAcquisitionAttemptAudit[] = [];

    while (true) {
      let attemptNumber = 0;
      while (attemptNumber < this.#policy.maxAttemptsPerTarget) {
        attemptNumber += 1;
        const checkpoint = this.#checkpoint(input, request, overallDeadlineAtMs);
        if (checkpoint !== undefined) return checkpoint;

        const authorization = this.#authorizer.authorize({
          connectorId: request.connectorId,
          sourceAccessPolicy: request.accessPolicy,
          credentialRequirement: input.credentialRequirement,
          credentialReference: input.credentialReference,
          credentialAvailability: input.credentialAvailability,
          sourceAccountConsent: input.sourceAccountConsent,
        });
        if (authorization.status !== "allowed") {
          return createLifecycleFailure(request, authorization.reasonCode);
        }

        let validated: ValidatedNetworkTarget;
        try {
          validated = validateNetworkTarget(currentUrl);
        } catch (error) {
          return createLifecycleFailure(request, this.#safeReason(error));
        }
        if (attemptNumber === 1) {
          const identity = requestTargetFingerprint(validated);
          if (visitedTargets.has(identity)) {
            return createLifecycleFailure(request, "REDIRECT_LOOP_DETECTED");
          }
          visitedTargets.add(identity);
        }


        const admissionRequest = {
          connectorId: request.connectorId,
          originKey: originKey(validated),
          nowMs: this.#clock.nowMs(),
        };
        const rateGate = this.#admissionGate.admitRate;
        const concurrencyGate = this.#admissionGate.admitConcurrency;
        const usesSplitAdmission = rateGate !== undefined &&
          concurrencyGate !== undefined;
        let combinedLease: AdmissionLease | undefined;
        const releaseCombinedLease = () => {
          combinedLease?.release();
          combinedLease = undefined;
        };
        const preDnsAdmission = usesSplitAdmission
          ? rateGate.call(this.#admissionGate, admissionRequest)
          : this.#admissionGate.admit(admissionRequest);
        if (!preDnsAdmission.admitted) {
          return createLifecycleFailure(request, preDnsAdmission.reasonCode);
        }
        if (usesSplitAdmission) preDnsAdmission.lease.release();
        else combinedLease = preDnsAdmission.lease;

        const beforeDns = this.#checkpoint(input, request, overallDeadlineAtMs);
        if (beforeDns !== undefined) {
          releaseCombinedLease();
          return beforeDns;
        }
        let approved;
        try {
          const boundedResolver: DnsResolver = {
            resolve: async (hostname) => {
              const resolution = await raceAsyncOperation(
                this.#resolver.resolve(hostname),
                {
                  absoluteDeadlineAtMs: overallDeadlineAtMs,
                  clock: this.#clock,
                  cancellation: input.cancellation,
                },
              );
              if (resolution.status === "cancelled") {
                throw new TargetSecurityError("ACQUISITION_CANCELLED");
              }
              if (resolution.status === "deadline-exceeded") {
                throw new TargetSecurityError("OVERALL_DEADLINE_EXCEEDED");
              }
              if (resolution.status === "failed") throw resolution.error;
              return resolution.value;
            },
          };
          approved = await approveEgressTarget(currentUrl, boundedResolver);
        } catch (error) {
          releaseCombinedLease();
          const reasonCode = this.#safeReason(error);
          const retry = await this.#retryIfPermitted(
            input,
            request,
            reasonCode,
            attemptNumber,
            overallDeadlineAtMs,
          );
          if (retry === "retry") continue;
          return retry ?? createLifecycleFailure(request, reasonCode);
        }

        const afterDns = this.#checkpoint(input, request, overallDeadlineAtMs);
        if (afterDns !== undefined) {
          releaseCombinedLease();
          return afterDns;
        }
        let admission: AdmissionDecision;
        if (usesSplitAdmission) {
          admission = concurrencyGate.call(this.#admissionGate, {
            connectorId: request.connectorId,
            originKey: originKey(validated),
            nowMs: this.#clock.nowMs(),
          });
        } else if (combinedLease !== undefined) {
          admission = { admitted: true, lease: combinedLease };
          combinedLease = undefined;
        } else {
          return createLifecycleFailure(request, "PINNED_TRANSPORT_FAILED");
        }
        if (!admission.admitted) {
          return createLifecycleFailure(request, admission.reasonCode);
        }

        let responseHead: SafeResponseHead;
        let pinnedResponse: SafePinnedResponse | undefined;
        try {
          const beforeConnect = this.#checkpoint(
            input,
            request,
            overallDeadlineAtMs,
          );
          if (beforeConnect !== undefined) {
            admission.lease.release();
            return beforeConnect;
          }
          const remainingMs = overallDeadlineAtMs - this.#clock.nowMs();
          const transportContext = {
            timeoutMs: Math.min(this.#policy.attemptTimeoutMs, remainingMs),
            maxHeaderSizeBytes: this.#policy.maxHeaderSizeBytes,
            cancellation: input.cancellation,
          };
          if (this.#transport.requestResponse !== undefined) {
            pinnedResponse = await this.#transport.requestResponse(
              approved,
              transportContext,
            );
            responseHead = pinnedResponse.head;
          } else {
            responseHead = await this.#transport.requestHead(
              approved,
              transportContext,
            );
          }
        } catch (error) {
          admission.lease.release();
          const reasonCode = cancellationRequested(input)
            ? "ACQUISITION_CANCELLED"
            : this.#safeReason(error);
          const retry = await this.#retryIfPermitted(
            input,
            request,
            reasonCode,
            attemptNumber,
            overallDeadlineAtMs,
          );
          if (retry === "retry") continue;
          return retry ?? createLifecycleFailure(request, reasonCode);
        }

        try {
          const afterTransport = this.#checkpoint(
            input,
            request,
            overallDeadlineAtMs,
          );
          if (afterTransport !== undefined) {
            pinnedResponse?.destroy();
            return afterTransport;
          }

          if (REDIRECT_STATUSES.has(responseHead.statusCode)) {
            pinnedResponse?.destroy();
            const redirected = this.#redirectTarget(
              currentUrl,
              validated,
              responseHead,
              request,
              redirectHop,
            );
            if ("success" in redirected) return redirected;
            this.#recordAudit(audit, {
              connectorId: request.connectorId,
              scheme: approved.scheme,
              hostname: approved.originalHostname,
              port: approved.effectivePort,
              attemptNumber,
              redirectHop,
              outcome: "redirected",
              encodedBytes: 0,
              decodedBytes: 0,
            });
            const beforeRedirect = this.#checkpoint(
              input,
              request,
              overallDeadlineAtMs,
            );
            if (beforeRedirect !== undefined) return beforeRedirect;
            currentUrl = redirected.url;
            redirectHop += 1;
            break;
          }

          if (RETRYABLE_HTTP_STATUSES.has(responseHead.statusCode)) {
            pinnedResponse?.destroy();
            const reasonCode = responseHead.statusCode === 429
              ? "HTTP_RATE_LIMITED"
              : "HTTP_TRANSIENT_FAILURE";
            const retry = await this.#retryIfPermitted(
              input,
              request,
              reasonCode,
              attemptNumber,
              overallDeadlineAtMs,
              responseHead.retryAfter,
            );
            if (retry === "retry") {
              this.#recordAudit(audit, {
                connectorId: request.connectorId,
                scheme: approved.scheme,
                hostname: approved.originalHostname,
                port: approved.effectivePort,
                attemptNumber,
                redirectHop,
                outcome: "retrying",
                reasonCode,
                encodedBytes: 0,
                decodedBytes: 0,
              });
              continue;
            }
            return retry ?? createLifecycleFailure(request, reasonCode);
          }

          const body = pinnedResponse === undefined
            ? undefined
            : await acquireBoundedBody({
              stream: pinnedResponse.body,
              head: responseHead,
              request,
              policy: this.#policy,
              cancellation: input.cancellation,
              overallDeadlineAtMs,
              clock: this.#clock,
            });
          if (body !== undefined) {
            this.#recordAudit(audit, {
              connectorId: request.connectorId,
              scheme: approved.scheme,
              hostname: approved.originalHostname,
              port: approved.effectivePort,
              attemptNumber,
              redirectHop,
              outcome: "succeeded",
              contentType: body.mediaType,
              encodedBytes: body.encodedBytesReceived,
              decodedBytes: body.decodedBytesProduced,
              contentHash: body.decodedSha256,
            });
          }
          return {
            success: true,
            connectorId: request.connectorId,
            requestId: request.requestId,
            finalTarget: {
              scheme: approved.scheme,
              hostname: approved.originalHostname,
              port: approved.effectivePort,
              targetFingerprint: approved.approvalFingerprint,
            },
            statusCode: responseHead.statusCode,
            attemptNumber,
            redirectHop,
            ...(body === undefined ? {} : { body, audit: [...audit] }),
          };
        } catch (error) {
          pinnedResponse?.destroy();
          const reasonCode = this.#safeReason(error);
          this.#recordAudit(audit, {
            connectorId: request.connectorId,
            scheme: approved.scheme,
            hostname: approved.originalHostname,
            port: approved.effectivePort,
            attemptNumber,
            redirectHop,
            outcome: "failed",
            reasonCode,
            encodedBytes: 0,
            decodedBytes: 0,
          });
          return createLifecycleFailure(request, reasonCode);
        } finally {
          admission.lease.release();
        }
      }
    }
  }

  #redirectTarget(
    currentUrl: string,
    currentTarget: ValidatedNetworkTarget,
    responseHead: SafeResponseHead,
    request: SafeNetworkAcquisitionInput["request"],
    redirectHop: number,
  ): { url: string } | ReturnType<typeof createLifecycleFailure> {
    if (responseHead.location === undefined) {
      return createLifecycleFailure(request, "REDIRECT_LOCATION_REQUIRED");
    }
    if (redirectHop >= this.#policy.maxRedirects) {
      return createLifecycleFailure(request, "REDIRECT_LIMIT_EXCEEDED");
    }
    let nextUrl: string;
    let nextTarget: ValidatedNetworkTarget;
    try {
      nextUrl = new URL(responseHead.location, currentUrl).toString();
      nextTarget = validateNetworkTarget(nextUrl);
    } catch (error) {
      return createLifecycleFailure(request, this.#safeReason(error));
    }
    if (currentTarget.scheme === "https" && nextTarget.scheme === "http") {
      return createLifecycleFailure(request, "HTTPS_DOWNGRADE_DENIED");
    }
    return { url: nextUrl };
  }

  async #retryIfPermitted(
    input: SafeNetworkAcquisitionInput,
    request: SafeNetworkAcquisitionInput["request"],
    reasonCode: string,
    attemptNumber: number,
    overallDeadlineAtMs: number,
    retryAfter?: string,
  ): Promise<"retry" | SafeNetworkAcquisitionResult | undefined> {
    if (cancellationRequested(input)) {
      return createLifecycleFailure(request, "ACQUISITION_CANCELLED");
    }
    const retryable = RETRYABLE_TRANSPORT_REASONS.has(reasonCode) ||
      reasonCode === "HTTP_RATE_LIMITED" ||
      reasonCode === "HTTP_TRANSIENT_FAILURE";
    if (!retryable || attemptNumber >= this.#policy.maxAttemptsPerTarget) {
      return undefined;
    }
    const delayMs = parseRetryAfterMs(
      retryAfter,
      this.#policy.maxRetryDelayMs,
    ) ?? Math.min(
      this.#policy.retryBaseDelayMs * attemptNumber,
      this.#policy.maxRetryDelayMs,
    );
    if (this.#clock.nowMs() + delayMs >= overallDeadlineAtMs) {
      return createLifecycleFailure(request, "OVERALL_DEADLINE_EXCEEDED");
    }
    const slept = await this.#sleeper.sleep(delayMs, input.cancellation);
    if (slept === "cancelled" || cancellationRequested(input)) {
      return createLifecycleFailure(request, "ACQUISITION_CANCELLED");
    }
    if (this.#clock.nowMs() >= overallDeadlineAtMs) {
      return createLifecycleFailure(request, "OVERALL_DEADLINE_EXCEEDED");
    }
    return "retry";
  }

  #checkpoint(
    input: SafeNetworkAcquisitionInput,
    request: SafeNetworkAcquisitionInput["request"],
    overallDeadlineAtMs: number,
  ): SafeNetworkAcquisitionResult | undefined {
    if (cancellationRequested(input)) {
      return createLifecycleFailure(request, "ACQUISITION_CANCELLED");
    }
    if (this.#clock.nowMs() >= overallDeadlineAtMs) {
      return createLifecycleFailure(request, "OVERALL_DEADLINE_EXCEEDED");
    }
    return undefined;
  }

  #safeReason(error: unknown): string {
    return error instanceof TargetSecurityError
      ? error.reasonCode
      : "PINNED_TRANSPORT_FAILED";
  }

  #recordAudit(
    audit: SafeAcquisitionAttemptAudit[],
    event: SafeAcquisitionAttemptAudit,
  ): void {
    audit.push(Object.freeze({ ...event }));
    try {
      this.#auditSink?.record(Object.freeze({ ...event }));
    } catch {
      // Operational audit adapters are isolated from acquisition completion.
    }
  }
}

export const supportedRedirectStatuses = (): number[] =>
  [...REDIRECT_STATUSES].sort((left, right) => left - right);

export const retryableHttpStatuses = (): number[] =>
  [...RETRYABLE_HTTP_STATUSES].sort((left, right) => left - right);
