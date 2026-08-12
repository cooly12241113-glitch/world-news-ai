import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  SafeNetworkAcquisitionRuntime,
  type AcquisitionAdmissionGate,
  type PinnedResponseHeadTransport,
} from "../index";
import { FakeResolver, lifecycleInput, lifecyclePolicy } from "./lifecycle-test-helpers";

const transportWithBody = (body: Readable): PinnedResponseHeadTransport => ({
  requestHead: vi.fn(),
  requestResponse: vi.fn(async () => ({
    head: { statusCode: 200, contentType: "text/plain" },
    body,
    destroy: () => body.destroy(),
  })),
});

describe("body lifecycle concurrency lease", () => {
  it.each(["split", "combined"] as const)(
    "holds and releases the %s gate lease through body completion",
    async (mode) => {
      let active = 0;
      const release = vi.fn(() => { active -= 1; });
      const lease = () => ({ admitted: true as const, lease: { release } });
      const gate: AcquisitionAdmissionGate = mode === "split"
        ? {
            admit: vi.fn(lease),
            admitRate: vi.fn(() => ({
              admitted: true as const,
              lease: { release: vi.fn() },
            })),
            admitConcurrency: vi.fn(() => { active += 1; return lease(); }),
          }
        : { admit: vi.fn(() => { active += 1; return lease(); }) };
      const body = new Readable({
        read() {
          expect(active).toBe(1);
          this.push("bounded");
          this.push(null);
        },
      });
      const result = await new SafeNetworkAcquisitionRuntime({
        resolver: new FakeResolver().set("a.example", "8.8.8.8"),
        transport: transportWithBody(body),
        admissionGate: gate,
        policy: lifecyclePolicy(),
      }).execute(lifecycleInput());
      expect(result).toMatchObject({ success: true, body: { text: "bounded" } });
      expect(active).toBe(0);
      expect(release).toHaveBeenCalledTimes(1);
    },
  );

  it("releases exactly once after oversize and does not retry", async () => {
    let active = 0;
    const release = vi.fn(() => { active -= 1; });
    const gate: AcquisitionAdmissionGate = {
      admit: vi.fn(() => ({ admitted: true as const, lease: { release } })),
      admitRate: vi.fn(() => ({ admitted: true as const, lease: { release: vi.fn() } })),
      admitConcurrency: vi.fn(() => {
        active += 1;
        return { admitted: true as const, lease: { release } };
      }),
    };
    const transport = transportWithBody(Readable.from(["12345"]));
    const result = await new SafeNetworkAcquisitionRuntime({
      resolver: new FakeResolver().set("a.example", "8.8.8.8"),
      transport,
      admissionGate: gate,
      policy: lifecyclePolicy({ maxEncodedBodyBytes: 4, maxDecodedBodyBytes: 4 }),
    }).execute(lifecycleInput());
    expect(result).toMatchObject({ success: false, reasonCode: "ENCODED_BODY_TOO_LARGE" });
    expect(transport.requestResponse).toHaveBeenCalledTimes(1);
    expect(active).toBe(0);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
