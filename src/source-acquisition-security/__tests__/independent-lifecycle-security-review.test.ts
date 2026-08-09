import { describe, expect, it, vi } from "vitest";
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

const unresolvedDns = (): Promise<never> => new Promise(() => undefined);

describe("independent lifecycle security review", () => {
  it("lets cancellation terminate an in-flight DNS resolution", async () => {
    let cancelled = false;
    const resolver: DnsResolver = {
      resolve: vi.fn(() => {
        cancelled = true;
        return unresolvedDns();
      }),
    };
    const input = lifecycleInput();
    input.cancellation = { isCancellationRequested: () => cancelled };
    const execution = new SafeNetworkAcquisitionRuntime({
      resolver,
      transport: new SequenceTransport([]),
      policy: lifecyclePolicy(),
    }).execute(input);

    const observed = await Promise.race([
      execution,
      new Promise<"dns-still-pending">((resolve) =>
        setTimeout(() => resolve("dns-still-pending"), 100)
      ),
    ]);

    expect(observed).toMatchObject({
      success: false,
      reasonCode: "ACQUISITION_CANCELLED",
    });
  });

  it("lets the overall deadline terminate an in-flight DNS resolution", async () => {
    const resolver: DnsResolver = { resolve: vi.fn(unresolvedDns) };
    const execution = new SafeNetworkAcquisitionRuntime({
      resolver,
      transport: new SequenceTransport([]),
      policy: lifecyclePolicy({
        overallDeadlineMs: 20,
        attemptTimeoutMs: 20,
      }),
    }).execute(lifecycleInput());

    const observed = await Promise.race([
      execution,
      new Promise<"dns-still-pending">((resolve) =>
        setTimeout(() => resolve("dns-still-pending"), 100)
      ),
    ]);

    expect(observed).toMatchObject({
      success: false,
      reasonCode: "OVERALL_DEADLINE_EXCEEDED",
    });
  });

  it("rejects a rate-limited request before starting DNS work", async () => {
    const resolver: DnsResolver = {
      resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
    };
    const admissionGate: AcquisitionAdmissionGate = {
      admit: () => ({ admitted: false, reasonCode: "RATE_LIMIT_EXCEEDED" }),
    };
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver,
      transport: new SequenceTransport([]),
      admissionGate,
      policy: lifecyclePolicy(),
    }).execute(lifecycleInput());

    expect(result).toMatchObject({
      success: false,
      reasonCode: "RATE_LIMIT_EXCEEDED",
    });
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("keeps a combined admission gate concurrency lease across transport", async () => {
    let activePermits = 0;
    let activePermitsObservedByTransport = -1;
    const admissionGate: AcquisitionAdmissionGate = {
      admit: () => {
        activePermits += 1;
        let released = false;
        return {
          admitted: true,
          lease: {
            release: () => {
              if (released) return;
              released = true;
              activePermits -= 1;
            },
          },
        };
      },
    };
    const resolver: DnsResolver = {
      resolve: vi.fn(async () => [{ address: "8.8.8.8", family: 4 }]),
    };
    const transport = new SequenceTransport([
      () => {
        activePermitsObservedByTransport = activePermits;
        return { statusCode: 204 };
      },
    ]);

    const result = await new SafeNetworkAcquisitionRuntime({
      resolver,
      transport,
      admissionGate,
      policy: lifecyclePolicy(),
    }).execute(lifecycleInput());

    expect(result.success).toBe(true);
    expect(activePermitsObservedByTransport).toBe(1);
    expect(activePermits).toBe(0);
  });
});
