import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  SafeNetworkAcquisitionRuntime,
  type PinnedResponseHeadTransport,
  type SafeResponseHead,
} from "../index";
import {
  FakeClock,
  FakeResolver,
  FakeSleeper,
  lifecycleInput,
  lifecyclePolicy,
} from "./lifecycle-test-helpers";

class TrackedBody extends Readable {
  readStarted = false;

  constructor(private readonly value: string) {
    super();
  }

  override _read(): void {
    this.readStarted = true;
    this.push(this.value);
    this.push(null);
  }
}

class StatusBodyTransport implements PinnedResponseHeadTransport {
  readonly bodies: TrackedBody[] = [];

  constructor(readonly actions: SafeResponseHead[]) {}

  requestHead = vi.fn(async () => ({ statusCode: 500 }));

  requestResponse = vi.fn(async () => {
    const head = this.actions.shift();
    if (head === undefined) throw new Error("missing status action");
    const body = new TrackedBody("NON_SUCCESS_PRIVATE_BODY");
    this.bodies.push(body);
    return { head, body, destroy: () => body.destroy() };
  });
}

const execute = async (actions: SafeResponseHead[]) => {
  const clock = new FakeClock();
  const transport = new StatusBodyTransport(actions);
  const resolver = new FakeResolver().set("a.example", "8.8.8.8");
  const result = await new SafeNetworkAcquisitionRuntime({
    resolver,
    transport,
    clock,
    sleeper: new FakeSleeper(clock),
    policy: lifecyclePolicy(),
  }).execute(lifecycleInput());
  return { result, resolver, transport };
};

describe("terminal HTTP status gate", () => {
  it.each([200, 201])("allows terminal HTTP %i to enter bounded body validation", async (statusCode) => {
    const { result, transport } = await execute([{
      statusCode,
      contentType: "text/plain",
    }]);

    expect(result).toMatchObject({
      success: true,
      statusCode,
      body: { text: "NON_SUCCESS_PRIVATE_BODY" },
    });
    expect(transport.bodies[0]?.readStarted).toBe(true);
  });

  it.each([
    [401, "authentication-required", "HTTP_AUTHENTICATION_REQUIRED"],
    [403, "access-denied", "HTTP_ACCESS_DENIED"],
    [404, "unavailable", "HTTP_RESOURCE_UNAVAILABLE"],
    [410, "unavailable", "HTTP_RESOURCE_UNAVAILABLE"],
    [418, "failed", "HTTP_STATUS_NOT_ACCEPTED"],
  ] as const)(
    "maps terminal HTTP %i without reading its body",
    async (statusCode, outcome, reasonCode) => {
      const { result, transport } = await execute([{
        statusCode,
        contentType: "text/plain",
      }]);

      expect(result).toMatchObject({
        success: false,
        outcome,
        retryable: false,
        reasonCode,
      });
      expect(transport.bodies[0]?.readStarted).toBe(false);
      expect(transport.bodies[0]?.destroyed).toBe(true);
    },
  );

  it.each([
    [429, "rate-limited", "HTTP_RATE_LIMITED"],
    [503, "unavailable", "HTTP_TRANSIENT_FAILURE"],
  ] as const)(
    "preserves bounded retry exhaustion for HTTP %i",
    async (statusCode, outcome, reasonCode) => {
      const { result, transport } = await execute([
        { statusCode },
        { statusCode },
        { statusCode },
      ]);

      expect(result).toMatchObject({ success: false, outcome, reasonCode });
      expect(transport.requestResponse).toHaveBeenCalledTimes(3);
      expect(transport.bodies.every((body) =>
        !body.readStarted && body.destroyed)).toBe(true);
    },
  );

  it("preserves prohibited-policy precedence over DNS and transport", async () => {
    const resolver = new FakeResolver().set("a.example", "8.8.8.8");
    const transport = new StatusBodyTransport([]);
    const input = lifecycleInput();
    input.request.accessPolicy = { access: "prohibited" };

    const result = await new SafeNetworkAcquisitionRuntime({
      resolver,
      transport,
      policy: lifecyclePolicy(),
    }).execute(input);

    expect(result).toMatchObject({
      success: false,
      outcome: "access-denied",
      reasonCode: "SOURCE_ACCESS_PROHIBITED",
    });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect(transport.requestResponse).not.toHaveBeenCalled();
  });
});
