import { describe, expect, it, vi } from "vitest";
import {
  InMemoryAcquisitionAdmissionGate,
  LIFECYCLE_REASON_CODES,
  SafeNetworkAcquisitionRuntime,
  TargetSecurityError,
  createLifecycleFailure,
  mapLifecycleReasonToOutcome,
  mappedLifecycleReasonCodes,
  type AcquisitionAdmissionGate,
  type AdmissionLease,
} from "../index";
import type { SourceAcquisitionFailureOutcome } from "../../source-connector";
import {
  FakeClock,
  FakeResolver,
  FakeSleeper,
  RecordingAuthorizer,
  SequenceTransport,
  lifecycleInput,
  lifecyclePolicy,
} from "./lifecycle-test-helpers";

const publicOutcomes = new Set<SourceAcquisitionFailureOutcome>([
  "unsupported", "access-denied", "authentication-required", "rate-limited",
  "unavailable", "cancelled", "failed",
]);

describe("safe lifecycle bounded retry", () => {
  it.each([429, 502, 503, 504])(
    "reauthorizes, re-resolves, and creates a fresh target after HTTP %i",
    async (statusCode) => {
      const resolver = new FakeResolver().set("a.example", "8.8.8.8");
      const authorizer = new RecordingAuthorizer();
      const transport = new SequenceTransport([{ statusCode }, { statusCode: 204 }]);
      const clock = new FakeClock();
      const sleeper = new FakeSleeper(clock);
      const result = await new SafeNetworkAcquisitionRuntime({
        resolver, transport, authorizer, clock, sleeper,
        policy: lifecyclePolicy(),
      }).execute(lifecycleInput());

      expect(result.success).toBe(true);
      expect(authorizer.inputs).toHaveLength(2);
      expect(resolver.calls).toEqual(["a.example", "a.example"]);
      expect(transport.targets).toHaveLength(2);
      expect(transport.targets[0]).not.toBe(transport.targets[1]);
    },
  );

  it("retries transient transport failures only up to the configured bound", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const transport = new SequenceTransport([
      new TargetSecurityError("PINNED_TRANSPORT_FAILED"),
      new TargetSecurityError("PINNED_TRANSPORT_FAILED"),
    ]);
    const clock = new FakeClock();
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver,
      transport,
      clock,
      sleeper: new FakeSleeper(clock),
      policy: lifecyclePolicy({ maxAttemptsPerTarget: 2 }),
    }).execute(lifecycleInput());

    expect(result).toMatchObject({
      success: false, outcome: "unavailable", retryable: true,
      reasonCode: "PINNED_TRANSPORT_FAILED",
    });
    expect(transport.targets).toHaveLength(2);
    expect(resolver.calls).toHaveLength(2);
  });

  it.each([
    "EGRESS_TARGET_MISMATCH",
    "TLS_VALIDATION_FAILED",
    "RESPONSE_HEADERS_INVALID",
  ] as const)("does not retry security failure %s", async (reasonCode) => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const transport = new SequenceTransport([new TargetSecurityError(reasonCode)]);
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver, transport, policy: lifecyclePolicy(),
    }).execute(lifecycleInput());
    expect(result).toMatchObject({ success: false, reasonCode });
    expect(transport.targets).toHaveLength(1);
  });

  it("does not retry an authorization policy denial", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const transport = new SequenceTransport([]);
    const input = lifecycleInput();
    input.request.accessPolicy = { access: "prohibited" };
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver, transport, policy: lifecyclePolicy(),
    }).execute(input);
    expect(result).toMatchObject({
      success: false, outcome: "access-denied",
      reasonCode: "SOURCE_ACCESS_PROHIBITED",
    });
    expect(resolver.calls).toHaveLength(0);
    expect(transport.targets).toHaveLength(0);
  });

  it("lets the overall deadline dominate retry delay", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const clock = new FakeClock();
    const sleeper = new FakeSleeper(clock);
    const transport = new SequenceTransport([{ statusCode: 503 }]);
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver, transport, clock, sleeper,
      policy: lifecyclePolicy({
        overallDeadlineMs: 50,
        attemptTimeoutMs: 50,
        retryBaseDelayMs: 50,
      }),
    }).execute(lifecycleInput());
    expect(result).toMatchObject({
      success: false, reasonCode: "OVERALL_DEADLINE_EXCEEDED",
    });
    expect(sleeper.delays).toEqual([]);
  });

  it("clamps delta-seconds Retry-After and ignores non-numeric dates", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const clock = new FakeClock();
    const sleeper = new FakeSleeper(clock);
    const transport = new SequenceTransport([
      { statusCode: 429, retryAfter: "999999" },
      { statusCode: 503, retryAfter: "Wed, 21 Oct 2030 07:28:00 GMT" },
      { statusCode: 204 },
    ]);
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver, transport, clock, sleeper,
      policy: lifecyclePolicy({ maxRetryDelayMs: 100 }),
    }).execute(lifecycleInput());
    expect(result.success).toBe(true);
    expect(sleeper.delays).toEqual([100, 20]);
  });

  it("stops while sleeping when cancellation is requested", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const clock = new FakeClock();
    const sleeper = new FakeSleeper(clock);
    sleeper.result = "cancelled";
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver,
      transport: new SequenceTransport([{ statusCode: 503 }]),
      clock, sleeper, policy: lifecyclePolicy(),
    }).execute(lifecycleInput());
    expect(result).toMatchObject({
      success: false, outcome: "cancelled", reasonCode: "ACQUISITION_CANCELLED",
    });
  });
});

describe("per-connector and per-origin admission", () => {
  const policy = {
    maxConcurrentPerConnector: 2,
    maxConcurrentPerOrigin: 1,
    maxRequestsPerConnectorWindow: 3,
    maxRequestsPerOriginWindow: 2,
    rateWindowMs: 1_000,
    maxTrackedConnectorRateBuckets: 4,
    maxTrackedOriginRateBuckets: 4,
  };

  it("separates origin concurrency while enforcing connector concurrency", () => {
    const gate = new InMemoryAcquisitionAdmissionGate(policy);
    const first = gate.admitConcurrency({ connectorId: "web", originKey: "https://a:443", nowMs: 0 });
    expect(first.admitted).toBe(true);
    expect(gate.admitConcurrency({ connectorId: "web", originKey: "https://a:443", nowMs: 0 }))
      .toEqual({ admitted: false, reasonCode: "CONCURRENCY_LIMIT_EXCEEDED" });
    const secondOrigin = gate.admitConcurrency({ connectorId: "web", originKey: "https://b:443", nowMs: 0 });
    expect(secondOrigin.admitted).toBe(true);
    expect(gate.admitConcurrency({ connectorId: "web", originKey: "https://c:443", nowMs: 0 }))
      .toEqual({ admitted: false, reasonCode: "CONCURRENCY_LIMIT_EXCEEDED" });
    if (first.admitted) first.lease.release();
    if (secondOrigin.admitted) secondOrigin.lease.release();
  });

  it("enforces independent rate buckets and resets the fixed window", () => {
    const gate = new InMemoryAcquisitionAdmissionGate({ ...policy, maxConcurrentPerOrigin: 2 });
    const admitAndRelease = (connectorId: "web" | "rss", originKey: string, nowMs: number) => {
      const decision = gate.admit({ connectorId, originKey, nowMs });
      if (decision.admitted) decision.lease.release();
      return decision.admitted;
    };
    expect(admitAndRelease("web", "https://a:443", 0)).toBe(true);
    expect(admitAndRelease("web", "https://a:443", 1)).toBe(true);
    expect(admitAndRelease("web", "https://a:443", 2)).toBe(false);
    expect(admitAndRelease("rss", "https://b:443", 2)).toBe(true);
    expect(admitAndRelease("web", "https://a:443", 1_000)).toBe(true);
  });

  it("releases the permit after a failed attempt before retrying", async () => {
    let active = 0;
    const observedActive: number[] = [];
    const releases: AdmissionLease[] = [];
    const gate: AcquisitionAdmissionGate = {
      admit: vi.fn(() => {
        active += 1;
        let released = false;
        const lease = { release: vi.fn(() => {
          if (!released) { active -= 1; released = true; }
        }) };
        releases.push(lease);
        return { admitted: true as const, lease };
      }),
    };
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const clock = new FakeClock();
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver,
      transport: new SequenceTransport([
        () => {
          observedActive.push(active);
          throw new TargetSecurityError("PINNED_TRANSPORT_FAILED");
        },
        () => {
          observedActive.push(active);
          return { statusCode: 204 };
        },
      ]),
      admissionGate: gate,
      clock,
      sleeper: new FakeSleeper(clock),
      policy: lifecyclePolicy(),
    }).execute(lifecycleInput());
    expect(result.success).toBe(true);
    expect(active).toBe(0);
    expect(observedActive).toEqual([1, 1]);
    expect(releases).toHaveLength(2);
    expect(releases.every((lease) => vi.mocked(lease.release).mock.calls.length === 1))
      .toBe(true);
  });

  it("releases a combined permit after terminal DNS failure", async () => {
    let active = 0;
    const release = vi.fn(() => { active -= 1; });
    const gate: AcquisitionAdmissionGate = {
      admit: () => {
        active += 1;
        return { admitted: true, lease: { release } };
      },
    };
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver: new FakeResolver(),
      transport: new SequenceTransport([]),
      admissionGate: gate,
      policy: lifecyclePolicy({ maxAttemptsPerTarget: 1 }),
    }).execute(lifecycleInput());
    expect(result).toMatchObject({ reasonCode: "DNS_RESOLUTION_FAILED" });
    expect(active).toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases a combined permit when cancellation detaches pending DNS", async () => {
    let active = 0;
    let cancelled = false;
    const release = vi.fn(() => { active -= 1; });
    const gate: AcquisitionAdmissionGate = {
      admit: () => {
        active += 1;
        return { admitted: true, lease: { release } };
      },
    };
    const input = lifecycleInput();
    input.cancellation = { isCancellationRequested: () => cancelled };
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver: {
        resolve: () => {
          cancelled = true;
          return new Promise(() => undefined);
        },
      },
      transport: new SequenceTransport([]),
      admissionGate: gate,
      policy: lifecyclePolicy(),
    }).execute(input);
    expect(result).toMatchObject({ reasonCode: "ACQUISITION_CANCELLED" });
    expect(active).toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases a combined permit after terminal transport failure", async () => {
    let active = 0;
    const release = vi.fn(() => { active -= 1; });
    const gate: AcquisitionAdmissionGate = {
      admit: () => {
        active += 1;
        return { admitted: true, lease: { release } };
      },
    };
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver: new FakeResolver().set("a.example", "8.8.8.8"),
      transport: new SequenceTransport([
        new TargetSecurityError("PINNED_TRANSPORT_FAILED"),
      ]),
      admissionGate: gate,
      policy: lifecyclePolicy({ maxAttemptsPerTarget: 1 }),
    }).execute(lifecycleInput());
    expect(result).toMatchObject({ reasonCode: "PINNED_TRANSPORT_FAILED" });
    expect(active).toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("uses and releases a fresh combined permit for each redirect hop", async () => {
    let active = 0;
    const releases: Array<ReturnType<typeof vi.fn>> = [];
    const gate: AcquisitionAdmissionGate = {
      admit: () => {
        active += 1;
        let released = false;
        const release = vi.fn(() => {
          if (released) return;
          released = true;
          active -= 1;
        });
        releases.push(release);
        return { admitted: true, lease: { release } };
      },
    };
    const observedActive: number[] = [];
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver: new FakeResolver().set("a.example", "8.8.8.8"),
      transport: new SequenceTransport([
        () => {
          observedActive.push(active);
          return { statusCode: 302, location: "/next" };
        },
        () => {
          observedActive.push(active);
          return { statusCode: 204 };
        },
      ]),
      admissionGate: gate,
      policy: lifecyclePolicy(),
    }).execute(lifecycleInput());
    expect(result.success).toBe(true);
    expect(observedActive).toEqual([1, 1]);
    expect(active).toBe(0);
    expect(releases).toHaveLength(2);
    expect(releases.every((release) => release.mock.calls.length === 1)).toBe(true);
  });

  it("keeps concurrency capacity correct after double release", () => {
    const gate = new InMemoryAcquisitionAdmissionGate({
      ...policy,
      maxConcurrentPerConnector: 1,
      maxConcurrentPerOrigin: 1,
    });
    const request = {
      connectorId: "web" as const,
      originKey: "https://a.example:443",
      nowMs: 0,
    };
    const first = gate.admitConcurrency(request);
    expect(first.admitted).toBe(true);
    if (first.admitted) {
      first.lease.release();
      first.lease.release();
    }
    const second = gate.admitConcurrency(request);
    expect(second.admitted).toBe(true);
    expect(gate.admitConcurrency(request)).toEqual({
      admitted: false,
      reasonCode: "CONCURRENCY_LIMIT_EXCEEDED",
    });
    if (second.admitted) second.lease.release();
  });

  it("maps an admission denial without opening transport", async () => {
    const gate: AcquisitionAdmissionGate = {
      admit: () => ({ admitted: false, reasonCode: "RATE_LIMIT_EXCEEDED" }),
    };
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const transport = new SequenceTransport([]);
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver, transport, admissionGate: gate, policy: lifecyclePolicy(),
    }).execute(lifecycleInput());
    expect(result).toMatchObject({
      success: false, outcome: "rate-limited", retryable: false,
      reasonCode: "RATE_LIMIT_EXCEEDED",
    });
    expect(transport.targets).toHaveLength(0);
  });

  it("consumes pre-DNS rate quota even when DNS subsequently fails", async () => {
    const gate = new InMemoryAcquisitionAdmissionGate({
      ...policy,
      maxRequestsPerConnectorWindow: 1,
      maxRequestsPerOriginWindow: 1,
    });
    const resolver = new FakeResolver();
    const first = await new SafeNetworkAcquisitionRuntime({
      resolver,
      transport: new SequenceTransport([]),
      admissionGate: gate,
      policy: lifecyclePolicy({ maxAttemptsPerTarget: 1 }),
    }).execute(lifecycleInput());
    expect(first).toMatchObject({ reasonCode: "DNS_RESOLUTION_FAILED" });
    const secondTransport = new SequenceTransport([]);
    const second = await new SafeNetworkAcquisitionRuntime({
      resolver,
      transport: secondTransport,
      admissionGate: gate,
      policy: lifecyclePolicy({ maxAttemptsPerTarget: 1 }),
    }).execute(lifecycleInput());
    expect(second).toMatchObject({ reasonCode: "RATE_LIMIT_EXCEEDED" });
    expect(resolver.calls).toHaveLength(1);
    expect(secondTransport.targets).toHaveLength(0);
  });

  it("prunes expired buckets, retains active history, and fails closed at capacity", () => {
    const gate = new InMemoryAcquisitionAdmissionGate({
      ...policy,
      maxRequestsPerOriginWindow: 1,
      maxTrackedOriginRateBuckets: 2,
    });
    const admit = (originKey: string, nowMs: number) =>
      gate.admitRate({ connectorId: "web", originKey, nowMs });
    expect(admit("https://active:443", 0).admitted).toBe(true);
    expect(admit("https://second:443", 1).admitted).toBe(true);
    expect(admit("https://third:443", 2)).toEqual({
      admitted: false,
      reasonCode: "RATE_LIMIT_STATE_CAPACITY_EXHAUSTED",
    });
    expect(admit("https://active:443", 3)).toEqual({
      admitted: false,
      reasonCode: "RATE_LIMIT_EXCEEDED",
    });
    expect(admit("https://third:443", 1_000).admitted).toBe(true);
    expect(admit("https://active:443", 1_001).admitted).toBe(true);
    expect(admit("https://overflow:443", 1_002)).toEqual({
      admitted: false,
      reasonCode: "RATE_LIMIT_STATE_CAPACITY_EXHAUSTED",
    });
  });

  it("fails capacity exhaustion before DNS or network", async () => {
    const gate = new InMemoryAcquisitionAdmissionGate({
      ...policy,
      maxTrackedOriginRateBuckets: 1,
    });
    gate.admitRate({
      connectorId: "web", originKey: "https://occupied.example:443", nowMs: 0,
    });
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const transport = new SequenceTransport([]);
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver,
      transport,
      admissionGate: gate,
      clock: { nowMs: () => 1 },
      policy: lifecyclePolicy(),
    }).execute(lifecycleInput());
    expect(result).toMatchObject({
      success: false,
      outcome: "rate-limited",
      reasonCode: "RATE_LIMIT_STATE_CAPACITY_EXHAUSTED",
    });
    expect(resolver.calls).toHaveLength(0);
    expect(transport.targets).toHaveLength(0);
  });
});

describe("Sprint 17.1 failure compatibility", () => {
  it("maps every lifecycle reason to an authoritative public outcome", () => {
    const mapped = new Set(mappedLifecycleReasonCodes());
    for (const reasonCode of LIFECYCLE_REASON_CODES) {
      expect(mapped.has(reasonCode)).toBe(true);
      expect(publicOutcomes.has(mapLifecycleReasonToOutcome(reasonCode))).toBe(true);
      const failure = createLifecycleFailure(lifecycleInput().request, reasonCode);
      expect(Object.keys(failure).sort()).toEqual([
        "connectorId", "locator", "outcome", "reasonCode", "requestId",
        "retryable", "success",
      ]);
    }
  });

  it("does not expose native error details or URL query data", () => {
    const failure = createLifecycleFailure(
      lifecycleInput("https://a.example/path?secret=token#fragment").request,
      "PINNED_TRANSPORT_FAILED",
    );
    expect(failure.locator).toEqual({ kind: "web", url: "https://a.example/path" });
    expect(JSON.stringify(failure)).not.toContain("secret");
    expect(JSON.stringify(failure)).not.toContain("native");
  });
});
