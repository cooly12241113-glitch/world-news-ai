import { vi } from "vitest";
import {
  SourceAcquisitionAuthorizer,
  type SourceAcquisitionAuthorizationDecision,
} from "../../source-governance";
import type {
  ApprovedEgressTarget,
  CancellationAwareSleeper,
  DnsResolver,
  MonotonicClock,
  PinnedResponseHeadTransport,
  ResponseHeadAttemptContext,
  SafeLifecyclePolicy,
  SafeNetworkAcquisitionInput,
  SafeResponseHead,
} from "../index";

export class FakeClock implements MonotonicClock {
  value = 0;
  nowMs = () => this.value;
  advance(milliseconds: number) {
    this.value += milliseconds;
  }
}

export class FakeSleeper implements CancellationAwareSleeper {
  readonly delays: number[] = [];
  result: "completed" | "cancelled" = "completed";

  constructor(private readonly clock: FakeClock) {}

  sleep = vi.fn(async (delayMs: number) => {
    this.delays.push(delayMs);
    this.clock.advance(delayMs);
    return this.result;
  });
}

export class FakeResolver implements DnsResolver {
  readonly calls: string[] = [];
  readonly answers = new Map<string, string[]>();
  onResolve?: (hostname: string) => void;

  set(hostname: string, ...addresses: string[]) {
    this.answers.set(hostname, addresses);
    return this;
  }

  resolve = vi.fn(async (hostname: string) => {
    this.calls.push(hostname);
    this.onResolve?.(hostname);
    const addresses = this.answers.get(hostname);
    if (addresses === undefined) throw new Error("resolver failure");
    return addresses.map((address) => ({
      address,
      family: address.includes(":") ? 6 as const : 4 as const,
    }));
  });
}

type TransportAction = SafeResponseHead | Error | ((
  target: ApprovedEgressTarget,
  context: ResponseHeadAttemptContext,
) => Promise<SafeResponseHead> | SafeResponseHead);

export class SequenceTransport implements PinnedResponseHeadTransport {
  readonly targets: ApprovedEgressTarget[] = [];
  readonly contexts: ResponseHeadAttemptContext[] = [];

  constructor(readonly actions: TransportAction[]) {}

  requestHead = vi.fn(async (
    target: ApprovedEgressTarget,
    context: ResponseHeadAttemptContext,
  ): Promise<SafeResponseHead> => {
    this.targets.push(target);
    this.contexts.push(context);
    const action = this.actions.shift();
    if (action === undefined) throw new Error("missing transport action");
    if (action instanceof Error) throw action;
    if (typeof action === "function") return action(target, context);
    return action;
  });
}

export class RecordingAuthorizer extends SourceAcquisitionAuthorizer {
  readonly inputs: unknown[] = [];

  override authorize(input: unknown): SourceAcquisitionAuthorizationDecision {
    this.inputs.push(input);
    return super.authorize(input);
  }
}

export const lifecycleInput = (
  url = "https://a.example/start",
): SafeNetworkAcquisitionInput => ({
  request: {
    requestId: "request-lifecycle",
    connectorId: "web",
    locator: { kind: "web", url },
    accessPolicy: { access: "public-only" },
  },
  credentialRequirement: { kind: "none" },
});

export const lifecyclePolicy = (
  overrides: Partial<SafeLifecyclePolicy> = {},
): SafeLifecyclePolicy => ({
  maxRedirects: 5,
  maxAttemptsPerTarget: 3,
  overallDeadlineMs: 10_000,
  attemptTimeoutMs: 1_000,
  retryBaseDelayMs: 10,
  maxRetryDelayMs: 100,
  maxHeaderSizeBytes: 8_192,
  ...overrides,
});
