import { describe, expect, it } from "vitest";
import {
  SafeNetworkAcquisitionRuntime,
  TargetSecurityError,
  type AcquisitionAdmissionGate,
} from "../index";
import {
  FakeClock,
  FakeResolver,
  FakeSleeper,
  RecordingAuthorizer,
  SequenceTransport,
  lifecycleInput,
  lifecyclePolicy,
} from "./lifecycle-test-helpers";

const runtime = (
  resolver: FakeResolver,
  transport: SequenceTransport,
  options: {
    clock?: FakeClock;
    authorizer?: RecordingAuthorizer;
    admissionGate?: AcquisitionAdmissionGate;
    policy?: ReturnType<typeof lifecyclePolicy>;
    sleeper?: FakeSleeper;
  } = {},
) => new SafeNetworkAcquisitionRuntime({
  resolver,
  transport,
  clock: options.clock,
  authorizer: options.authorizer,
  admissionGate: options.admissionGate,
  policy: options.policy ?? lifecyclePolicy(),
  sleeper: options.sleeper,
});

describe("safe redirect lifecycle", () => {
  it.each([301, 302, 303, 307, 308])(
    "supports GET redirect status %s with fresh DNS and approval",
    async (statusCode) => {
      const resolver = new FakeResolver().set("a.example", "8.8.8.8");
      const transport = new SequenceTransport([
        { statusCode, location: "/next" },
        { statusCode: 200 },
      ]);
      const result = await runtime(resolver, transport).execute(lifecycleInput());
      expect(result).toMatchObject({ success: true, redirectHop: 1 });
      expect(resolver.calls).toEqual(["a.example", "a.example"]);
      expect(transport.targets).toHaveLength(2);
      expect(transport.targets[0]).not.toBe(transport.targets[1]);
    },
  );

  it("resolves a relative redirect and reauthorizes cross-origin targets", async () => {
    const resolver = new FakeResolver()
      .set("a.example", "8.8.8.8")
      .set("b.example", "1.1.1.1");
    const transport = new SequenceTransport([
      { statusCode: 302, location: "https://b.example/final" },
      { statusCode: 204 },
    ]);
    const authorizer = new RecordingAuthorizer();
    const result = await runtime(resolver, transport, { authorizer })
      .execute(lifecycleInput("https://a.example/path/start"));
    expect(result).toMatchObject({
      success: true,
      finalTarget: { hostname: "b.example" },
      redirectHop: 1,
    });
    expect(authorizer.inputs).toHaveLength(2);
    expect(resolver.calls).toEqual(["a.example", "b.example"]);
  });

  it("denies HTTPS to HTTP downgrade before DNS for the new target", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const result = await runtime(resolver, new SequenceTransport([
      { statusCode: 302, location: "http://b.example/" },
    ])).execute(lifecycleInput());
    expect(result).toMatchObject({
      success: false,
      outcome: "access-denied",
      reasonCode: "HTTPS_DOWNGRADE_DENIED",
    });
    expect(resolver.calls).toEqual(["a.example"]);
  });

  it.each([
    ["http://127.0.0.1/", "UNSAFE_IP_ADDRESS"],
    ["https://b.example:8443/", "CUSTOM_PORT_NOT_ALLOWED"],
    ["file:///etc/passwd", "UNSUPPORTED_NETWORK_PROTOCOL"],
  ])("denies unsafe redirect %s", async (location, reasonCode) => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const result = await runtime(resolver, new SequenceTransport([
      { statusCode: 302, location },
    ])).execute(lifecycleInput());
    expect(result).toMatchObject({ success: false, reasonCode });
  });

  it("denies a redirect whose fresh DNS answer is mixed", async () => {
    const resolver = new FakeResolver()
      .set("a.example", "8.8.8.8")
      .set("b.example", "1.1.1.1", "10.0.0.1");
    const result = await runtime(resolver, new SequenceTransport([
      { statusCode: 302, location: "https://b.example/" },
    ])).execute(lifecycleInput());
    expect(result).toMatchObject({
      success: false,
      reasonCode: "DNS_MIXED_ADDRESS_SET",
    });
  });

  it.each([
    [{ statusCode: 302, location: "/start" }],
    [
      { statusCode: 302, location: "/second" },
      { statusCode: 302, location: "/start" },
    ],
  ])("detects canonical redirect loops", async (...actions) => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const result = await runtime(
      resolver,
      new SequenceTransport(actions.flat()),
    ).execute(lifecycleInput());
    expect(result).toMatchObject({
      success: false,
      reasonCode: "REDIRECT_LOOP_DETECTED",
    });
  });

  it("detects canonical-equivalent loops without logging the raw query", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const result = await runtime(resolver, new SequenceTransport([
      { statusCode: 302, location: "https://A.EXAMPLE:443/start?x=1#different" },
    ])).execute(lifecycleInput("https://a.example/start?x=1#original"));
    expect(result).toMatchObject({
      success: false,
      reasonCode: "REDIRECT_LOOP_DETECTED",
      locator: { kind: "web", url: "https://a.example/start" },
    });
  });

  it("normalizes percent-encoded unreserved characters but preserves reserved ones", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const equivalent = await runtime(resolver, new SequenceTransport([
      { statusCode: 302, location: "/%7euser" },
    ])).execute(lifecycleInput("https://a.example/~user"));
    expect(equivalent).toMatchObject({ reasonCode: "REDIRECT_LOOP_DETECTED" });

    const distinct = await runtime(resolver, new SequenceTransport([
      { statusCode: 302, location: "/a%2fb" },
      { statusCode: 204 },
    ])).execute(lifecycleInput("https://a.example/a/b"));
    expect(distinct.success).toBe(true);
  });

  it("enforces a finite redirect limit", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const result = await runtime(resolver, new SequenceTransport([
      { statusCode: 302, location: "/one" },
      { statusCode: 302, location: "/two" },
    ]), { policy: lifecyclePolicy({ maxRedirects: 1 }) })
      .execute(lifecycleInput());
    expect(result).toMatchObject({
      success: false,
      reasonCode: "REDIRECT_LIMIT_EXCEEDED",
    });
  });
});

describe("safe cancellation and deadline lifecycle", () => {
  it("cancels before DNS", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const input = lifecycleInput();
    input.cancellation = { isCancellationRequested: () => true };
    const result = await runtime(resolver, new SequenceTransport([])).execute(input);
    expect(result).toMatchObject({ outcome: "cancelled" });
    expect(resolver.calls).toEqual([]);
  });

  it("cancels after DNS and before admission/transport", async () => {
    let cancelled = false;
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    resolver.onResolve = () => { cancelled = true; };
    const input = lifecycleInput();
    input.cancellation = { isCancellationRequested: () => cancelled };
    const transport = new SequenceTransport([]);
    const result = await runtime(resolver, transport).execute(input);
    expect(result).toMatchObject({ outcome: "cancelled" });
    expect(transport.targets).toEqual([]);
  });

  it("rejects a late transport result after cancellation", async () => {
    let cancelled = false;
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const input = lifecycleInput();
    input.cancellation = { isCancellationRequested: () => cancelled };
    const transport = new SequenceTransport([
      () => {
        cancelled = true;
        return { statusCode: 200 };
      },
    ]);
    const result = await runtime(resolver, transport).execute(input);
    expect(result).toMatchObject({ outcome: "cancelled" });
  });

  it("cancels before following a redirect", async () => {
    let cancelled = false;
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const input = lifecycleInput();
    input.cancellation = { isCancellationRequested: () => cancelled };
    const result = await runtime(resolver, new SequenceTransport([
      () => {
        cancelled = true;
        return { statusCode: 302, location: "/next" };
      },
    ])).execute(input);
    expect(result).toMatchObject({ outcome: "cancelled" });
    expect(resolver.calls).toHaveLength(1);
  });

  it("maps attempt timeout without leaking native errors", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const result = await runtime(resolver, new SequenceTransport([
      new TargetSecurityError("ATTEMPT_TIMEOUT"),
    ]), { policy: lifecyclePolicy({ maxAttemptsPerTarget: 1 }) })
      .execute(lifecycleInput("https://a.example/path?token=hidden"));
    expect(result).toMatchObject({
      success: false,
      outcome: "unavailable",
      reasonCode: "ATTEMPT_TIMEOUT",
      locator: { kind: "web", url: "https://a.example/path" },
    });
    expect(JSON.stringify(result)).not.toContain("hidden");
  });

  it("enforces the overall deadline", async () => {
    const clock = new FakeClock();
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    resolver.onResolve = () => clock.advance(10_000);
    const result = await runtime(resolver, new SequenceTransport([]), {
      clock,
      policy: lifecyclePolicy({ overallDeadlineMs: 10_000 }),
    }).execute(lifecycleInput());
    expect(result).toMatchObject({
      success: false,
      reasonCode: "OVERALL_DEADLINE_EXCEEDED",
    });
  });

  it("releases an admission permit after cancellation", async () => {
    let active = 0;
    const admissionGate: AcquisitionAdmissionGate = {
      admit: () => ({
        admitted: true,
        lease: { release: () => { active -= 1; } },
      }),
    };
    const originalAdmit = admissionGate.admit;
    admissionGate.admit = (...arguments_) => {
      active += 1;
      return originalAdmit(...arguments_);
    };
    let cancelled = false;
    const input = lifecycleInput();
    input.cancellation = { isCancellationRequested: () => cancelled };
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    await runtime(resolver, new SequenceTransport([
      () => {
        cancelled = true;
        return { statusCode: 200 };
      },
    ]), { admissionGate }).execute(input);
    expect(active).toBe(0);
  });

  it("releases the old-origin permit before admitting a redirect target", async () => {
    let active = 0;
    let maximumActive = 0;
    const admissionGate: AcquisitionAdmissionGate = {
      admit: () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        return {
          admitted: true,
          lease: { release: () => { active -= 1; } },
        };
      },
    };
    const resolver = new FakeResolver()
      .set("a.example", "8.8.8.8")
      .set("b.example", "1.1.1.1");
    const result = await runtime(resolver, new SequenceTransport([
      { statusCode: 302, location: "https://b.example/final" },
      { statusCode: 204 },
    ]), { admissionGate }).execute(lifecycleInput());
    expect(result.success).toBe(true);
    expect(maximumActive).toBe(1);
    expect(active).toBe(0);
  });
});
