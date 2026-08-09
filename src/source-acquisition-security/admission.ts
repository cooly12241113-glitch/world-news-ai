import type {
  AcquisitionAdmissionGate,
  AdmissionDecision,
  AdmissionPolicy,
  AdmissionRequest,
} from "./lifecycle-models";

interface RateBucket {
  windowStartedAtMs: number;
  count: number;
}

const positiveInteger = (value: number): boolean =>
  Number.isFinite(value) && Number.isInteger(value) && value > 0;

export const validateAdmissionPolicy = (policy: AdmissionPolicy): void => {
  if (!positiveInteger(policy.maxConcurrentPerConnector) ||
      policy.maxConcurrentPerConnector > 10_000 ||
      !positiveInteger(policy.maxConcurrentPerOrigin) ||
      policy.maxConcurrentPerOrigin > 10_000 ||
      !positiveInteger(policy.maxRequestsPerConnectorWindow) ||
      policy.maxRequestsPerConnectorWindow > 1_000_000 ||
      !positiveInteger(policy.maxRequestsPerOriginWindow) ||
      policy.maxRequestsPerOriginWindow > 1_000_000 ||
      !positiveInteger(policy.rateWindowMs) || policy.rateWindowMs > 3_600_000 ||
      !positiveInteger(policy.maxTrackedConnectorRateBuckets) ||
      policy.maxTrackedConnectorRateBuckets > 100_000 ||
      !positiveInteger(policy.maxTrackedOriginRateBuckets) ||
      policy.maxTrackedOriginRateBuckets > 100_000) {
    throw new Error("INVALID_ADMISSION_POLICY");
  }
};

export class InMemoryAcquisitionAdmissionGate
implements AcquisitionAdmissionGate {
  readonly #policy: AdmissionPolicy;
  readonly #connectorConcurrency = new Map<string, number>();
  readonly #originConcurrency = new Map<string, number>();
  readonly #connectorRates = new Map<string, RateBucket>();
  readonly #originRates = new Map<string, RateBucket>();

  constructor(policy: AdmissionPolicy) {
    validateAdmissionPolicy(policy);
    this.#policy = { ...policy };
  }

  admit(request: AdmissionRequest): AdmissionDecision {
    const rate = this.admitRate(request);
    if (!rate.admitted) return rate;
    const concurrency = this.admitConcurrency(request);
    if (!concurrency.admitted) return concurrency;
    return concurrency;
  }

  admitRate(request: AdmissionRequest): AdmissionDecision {
    this.#pruneExpired(this.#connectorRates, request.nowMs);
    this.#pruneExpired(this.#originRates, request.nowMs);
    if (!this.#canTrack(
      this.#connectorRates,
      request.connectorId,
      this.#policy.maxTrackedConnectorRateBuckets,
    ) || !this.#canTrack(
      this.#originRates,
      request.originKey,
      this.#policy.maxTrackedOriginRateBuckets,
    )) {
      return {
        admitted: false,
        reasonCode: "RATE_LIMIT_STATE_CAPACITY_EXHAUSTED",
      };
    }
    const connectorRate = this.#rateBucket(
      this.#connectorRates,
      request.connectorId,
      request.nowMs,
    );
    const originRate = this.#rateBucket(
      this.#originRates,
      request.originKey,
      request.nowMs,
    );
    if (connectorRate.count >= this.#policy.maxRequestsPerConnectorWindow ||
        originRate.count >= this.#policy.maxRequestsPerOriginWindow) {
      return { admitted: false, reasonCode: "RATE_LIMIT_EXCEEDED" };
    }
    connectorRate.count += 1;
    originRate.count += 1;
    return { admitted: true, lease: { release: () => undefined } };
  }

  admitConcurrency(request: AdmissionRequest): AdmissionDecision {
    const connectorConcurrent = this.#connectorConcurrency.get(
      request.connectorId,
    ) ?? 0;
    const originConcurrent = this.#originConcurrency.get(request.originKey) ?? 0;
    if (connectorConcurrent >= this.#policy.maxConcurrentPerConnector ||
        originConcurrent >= this.#policy.maxConcurrentPerOrigin) {
      return { admitted: false, reasonCode: "CONCURRENCY_LIMIT_EXCEEDED" };
    }
    this.#connectorConcurrency.set(request.connectorId, connectorConcurrent + 1);
    this.#originConcurrency.set(request.originKey, originConcurrent + 1);
    let released = false;
    return {
      admitted: true,
      lease: {
        release: () => {
          if (released) return;
          released = true;
          this.#decrement(this.#connectorConcurrency, request.connectorId);
          this.#decrement(this.#originConcurrency, request.originKey);
        },
      },
    };
  }

  #rateBucket(
    buckets: Map<string, RateBucket>,
    key: string,
    nowMs: number,
  ): RateBucket {
    const current = buckets.get(key);
    if (current === undefined) {
      const replacement = { windowStartedAtMs: nowMs, count: 0 };
      buckets.set(key, replacement);
      return replacement;
    }
    return current;
  }

  #pruneExpired(buckets: Map<string, RateBucket>, nowMs: number): void {
    for (const [key, bucket] of buckets) {
      if (nowMs >= bucket.windowStartedAtMs + this.#policy.rateWindowMs) {
        buckets.delete(key);
      }
    }
  }

  #canTrack(
    buckets: Map<string, RateBucket>,
    key: string,
    maximum: number,
  ): boolean {
    return buckets.has(key) || buckets.size < maximum;
  }

  #decrement(counts: Map<string, number>, key: string): void {
    const next = (counts.get(key) ?? 1) - 1;
    if (next <= 0) counts.delete(key);
    else counts.set(key, next);
  }
}
