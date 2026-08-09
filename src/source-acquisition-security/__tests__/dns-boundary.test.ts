import { describe, expect, it, vi } from "vitest";
import type { LookupAddress } from "node:dns";
import {
  SafeNetworkAcquisitionRuntime,
  type AcquisitionAdmissionGate,
  type DnsResolver,
} from "../index";
import {
  SequenceTransport,
  lifecycleInput,
  lifecyclePolicy,
} from "./lifecycle-test-helpers";

const splitGate = () => {
  const permit = () => ({
    admitted: true as const,
    lease: { release: vi.fn() },
  });
  const gate: AcquisitionAdmissionGate = {
    admit: vi.fn(permit),
    admitRate: vi.fn(permit),
    admitConcurrency: vi.fn(permit),
  };
  return gate;
};

describe("DNS lifecycle deadline and cancellation", () => {
  it("ignores a resolver result that arrives after the overall deadline", async () => {
    let resolveDns: ((value: readonly LookupAddress[]) => void) | undefined;
    const resolver: DnsResolver = {
      resolve: vi.fn(() => new Promise<readonly LookupAddress[]>((resolve) => {
        resolveDns = resolve;
      })),
    };
    const gate = splitGate();
    const transport = new SequenceTransport([]);
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver,
      transport,
      admissionGate: gate,
      policy: lifecyclePolicy({ overallDeadlineMs: 15, attemptTimeoutMs: 15 }),
    }).execute(lifecycleInput());
    expect(result).toMatchObject({ reasonCode: "OVERALL_DEADLINE_EXCEEDED" });
    resolveDns?.([{ address: "8.8.8.8", family: 4 }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(gate.admitConcurrency).not.toHaveBeenCalled();
    expect(transport.targets).toHaveLength(0);
  });

  it("ignores a resolver result arriving after cancellation", async () => {
    let resolveDns: ((value: readonly LookupAddress[]) => void) | undefined;
    let cancelled = false;
    const resolver: DnsResolver = {
      resolve: vi.fn(() => new Promise<readonly LookupAddress[]>((resolve) => {
        resolveDns = resolve;
        cancelled = true;
      })),
    };
    const gate = splitGate();
    const transport = new SequenceTransport([]);
    const input = lifecycleInput();
    input.cancellation = { isCancellationRequested: () => cancelled };
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver, transport, admissionGate: gate, policy: lifecyclePolicy(),
    }).execute(input);
    expect(result).toMatchObject({ reasonCode: "ACQUISITION_CANCELLED" });
    resolveDns?.([{ address: "8.8.8.8", family: 4 }]);
    await Promise.resolve();
    expect(gate.admitConcurrency).not.toHaveBeenCalled();
    expect(transport.targets).toHaveLength(0);
  });
});
