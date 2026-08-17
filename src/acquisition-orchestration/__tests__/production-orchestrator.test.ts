import { createHash, randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { IngestionPipeline } from "../../ingestion";
import {
  createRawArtifactLifecyclePolicy,
  type RawArtifactLifecyclePolicy,
  type RawArtifactOperationContext,
} from "../../source-governance";
import {
  RawArtifactPersistenceService,
  SqliteRawArtifactAdapter,
} from "../../raw-persistence";
import {
  SafeNetworkAcquisitionRuntime,
  SafeRuntimeFixtureConnector,
  type PinnedResponseHeadTransport,
  type SafeResponseHead,
} from "../../source-acquisition-security";
import {
  FakeResolver,
  lifecycleInput,
  lifecyclePolicy,
} from "../../source-acquisition-security/__tests__/lifecycle-test-helpers";
import { ProductionAcquisitionOrchestrator } from "../index";

interface Action { head: SafeResponseHead; body?: Buffer | string }
class Transport implements PinnedResponseHeadTransport {
  constructor(readonly actions: Action[]) {}
  requestHead = vi.fn(async () => ({ statusCode: 500 }));
  requestResponse = vi.fn(async () => {
    const action = this.actions.shift();
    if (action === undefined) throw new Error("missing response fixture");
    const body = Readable.from(action.body === undefined ? [] : [action.body]);
    return { head: action.head, body, destroy: () => body.destroy() };
  });
}

const now = new Date("2026-08-13T00:00:00.000Z");
const pathForTest = () => join(tmpdir(), `orchestration-${randomUUID()}.sqlite`);
const article = (suffix = "A") =>
  `Orchestration ${suffix}\n\nOne validated body flows to persistence and ingestion without refetching.`;
const policy = (
  overrides: Partial<Parameters<typeof createRawArtifactLifecyclePolicy>[0]> = {},
): RawArtifactLifecyclePolicy => createRawArtifactLifecyclePolicy({
  policyVersion: "1",
  retention: { kind: "bounded", duration: { amount: 30, unit: "day" } },
  deletion: {
    triggers: ["scheduled-expiry", "explicit-request"],
    legalHoldPreventsDeletion: false,
    normalizedDocumentAction: "review-required",
  },
  redaction: "none",
  encryption: "platform-managed",
  accessClass: "public-source",
  instructionPolicy: "UNTRUSTED_DATA",
  ...overrides,
});
const context: RawArtifactOperationContext = {
  operation: "persist",
  purpose: "retention-management",
  actorClass: "authorized-operator",
  connectorId: "web",
  sourceAccessPolicy: { access: "public-only" },
};
const request = (requestId: string, url = "https://a.example/article") => ({
  ...lifecycleInput(url).request,
  requestId,
});
const hints = {
  hints: {
    expectedDocumentType: "NewsArticle" as const,
    expectedLanguage: "en",
    sourceName: "Orchestration Fixture",
  },
};
const runtime = (transport: PinnedResponseHeadTransport, resolver =
  new FakeResolver().set("a.example", "8.8.8.8")) =>
  new SafeNetworkAcquisitionRuntime({ resolver, transport, policy: lifecyclePolicy() });
const rawService = (store: SqliteRawArtifactAdapter) =>
  new RawArtifactPersistenceService(store, {
    now: () => now,
    atRestProtection: { satisfies: () => true },
  });

describe("production acquisition orchestration", () => {
  it("accepts an injected detailed-safe connector and invokes acquisition once", async () => {
    const transport = new Transport([{
      head: { statusCode: 200, contentType: "text/plain" }, body: article(),
    }]);
    const connector = new SafeRuntimeFixtureConnector(
      runtime(transport),
      () => now.toISOString(),
    );
    const acquireDetailed = vi.spyOn(connector, "acquireDetailed");

    const result = await new ProductionAcquisitionOrchestrator(connector)
      .execute({ acquisition: request("injected"), bridgeOptions: hints });

    expect(result).toMatchObject({
      success: true,
      acquisition: {
        acquisitionId: "safe-acquisition:injected",
        rawArtifact: {
          contentHash: createHash("sha256").update(article()).digest("hex"),
          byteLength: Buffer.byteLength(article()),
        },
      },
    });
    expect(acquireDetailed).toHaveBeenCalledTimes(1);
    expect(transport.requestResponse).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, "authentication-required"],
    [403, "access-denied"],
    [404, "unavailable"],
  ] as const)(
    "never invokes persistence or ingestion after terminal HTTP %i",
    async (statusCode, outcome) => {
      const transport = new Transport([{
        head: { statusCode, contentType: "text/plain" },
        body: "PRIVATE NON-SUCCESS BODY",
      }]);
      const connector = new SafeRuntimeFixtureConnector(runtime(transport));
      const persist = vi.fn(() => ({
        success: false as const,
        reasonCode: "SHOULD_NOT_RUN",
      }));
      const pipeline = new IngestionPipeline();
      const ingest = vi.spyOn(pipeline, "ingest");

      const result = await new ProductionAcquisitionOrchestrator(connector, {
        pipeline,
      }).execute({
        acquisition: request(`status-${statusCode}`),
        bridgeOptions: hints,
        rawPersistence: {
          service: { persist },
          policy: policy(),
          context,
        },
      });

      expect(result).toMatchObject({
        success: false,
        stage: "acquisition",
        acquisition: { outcome },
      });
      expect(persist).not.toHaveBeenCalled();
      expect(ingest).not.toHaveBeenCalled();
      expect(transport.requestResponse).toHaveBeenCalledTimes(1);
    },
  );

  it("reuses one bounded result for governed persistence and SourceDocument", async () => {
    const path = pathForTest();
    const store = new SqliteRawArtifactAdapter(path);
    const transport = new Transport([{
      head: { statusCode: 200, contentType: "text/plain" }, body: article(),
    }]);
    const result = await new ProductionAcquisitionOrchestrator(runtime(transport), {
      now: () => now.toISOString(),
    }).execute({
      acquisition: request("t1"),
      bridgeOptions: hints,
      rawPersistence: { service: rawService(store), policy: policy(), context },
    });
    expect(result).toMatchObject({
      success: true,
      outcome: "persisted-and-ingested",
      persistence: { requested: true, result: { success: true } },
    });
    if (result.success) {
      expect(result.acquisition).not.toHaveProperty("locator");
      expect(result.acquisition).not.toHaveProperty("content");
      const raw = store.findActiveById(result.acquisition.rawArtifact.artifactId);
      expect(Buffer.from(raw?.bytes ?? []).toString()).toBe(article());
      expect(raw?.artifact.contentHash).toBe(
        createHash("sha256").update(article()).digest("hex"),
      );
      expect(result.ingestion.document.contentText).toBe(article());
      expect(store.listAcquisitions(raw?.artifact.artifactId ?? "")).toEqual([{
        acquisitionId: result.acquisition.acquisitionId,
        artifactId: result.acquisition.rawArtifact.artifactId,
        occurredAt: now.toISOString(),
      }]);
    }
    expect(transport.requestResponse).toHaveBeenCalledTimes(1);
    store.close(); rmSync(path, { force: true });
  });

  it("supports ingestion-only mode with no persistence audit", async () => {
    const transport = new Transport([{
      head: { statusCode: 200, contentType: "text/plain" }, body: article(),
    }]);
    const result = await new ProductionAcquisitionOrchestrator(runtime(transport))
      .execute({ acquisition: request("no-persist"), bridgeOptions: hints });
    expect(result).toMatchObject({
      success: true, outcome: "ingested", persistence: { requested: false },
    });
    expect(transport.requestResponse).toHaveBeenCalledTimes(1);
  });

  it("continues ingestion but reports intentional persistence denial as partial failure", async () => {
    const path = pathForTest();
    const store = new SqliteRawArtifactAdapter(path);
    const deniedPolicy = policy({ retention: { kind: "ephemeral" } });
    const result = await new ProductionAcquisitionOrchestrator(runtime(new Transport([{
      head: { statusCode: 200, contentType: "text/plain" }, body: article(),
    }]))).execute({
      acquisition: request("denied"),
      bridgeOptions: hints,
      rawPersistence: { service: rawService(store), policy: deniedPolicy, context },
    });
    expect(result).toMatchObject({
      success: false,
      stage: "persistence",
      persistence: { result: { reasonCode: "RAW_PERSISTENCE_NOT_ALLOWED" } },
      ingestion: { success: true },
    });
    if (!result.success && result.stage === "persistence") {
      expect(store.findActiveById(result.acquisition.rawArtifact.artifactId)).toBeUndefined();
      expect(store.listAcquisitions(result.acquisition.rawArtifact.artifactId)).toEqual([]);
      expect(store.listAudit(result.acquisition.rawArtifact.artifactId)
        .some(({ outcome }) => outcome === "persisted")).toBe(false);
    }
    store.close(); rmSync(path, { force: true });
  });

  it("reports deterministic storage failure, rolls back raw state, and does not refetch", async () => {
    const path = pathForTest();
    const store = new SqliteRawArtifactAdapter(path, now.toISOString(), {
      faultInjection: (stage) => {
        if (stage === "after-blob-write") throw new Error("storage fixture");
      },
    });
    const transport = new Transport([{
      head: { statusCode: 200, contentType: "text/plain" }, body: article(),
    }]);
    const result = await new ProductionAcquisitionOrchestrator(runtime(transport))
      .execute({
        acquisition: request("storage-failure"),
        bridgeOptions: hints,
        rawPersistence: { service: rawService(store), policy: policy(), context },
      });
    expect(result).toMatchObject({
      success: false,
      stage: "persistence",
      persistence: { result: { reasonCode: "RAW_STORAGE_FAILED" } },
      ingestion: { success: true },
    });
    if (!result.success && result.stage === "persistence") {
      expect(store.findActiveById(result.acquisition.rawArtifact.artifactId)).toBeUndefined();
    }
    expect(transport.requestResponse).toHaveBeenCalledTimes(1);
    store.close(); rmSync(path, { force: true });
  });

  it("turns retry and redirect attempts into exactly one acquisition occurrence", async () => {
    const path = pathForTest();
    const store = new SqliteRawArtifactAdapter(path);
    const transport = new Transport([
      { head: { statusCode: 503 } },
      { head: { statusCode: 302, location: "/final" } },
      { head: { statusCode: 200, contentType: "text/plain" }, body: article() },
    ]);
    const result = await new ProductionAcquisitionOrchestrator(runtime(transport))
      .execute({
        acquisition: request("retry-redirect"), bridgeOptions: hints,
        rawPersistence: { service: rawService(store), policy: policy(), context },
      });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(store.listAcquisitions(result.acquisition.rawArtifact.artifactId))
        .toHaveLength(1);
    }
    expect(transport.requestResponse).toHaveBeenCalledTimes(3);
    store.close(); rmSync(path, { force: true });
  });

  it("preserves T1/T2/T3 as three occurrences on one blob/artifact", async () => {
    const path = pathForTest();
    const store = new SqliteRawArtifactAdapter(path);
    const outputs = [];
    for (const id of ["t1", "t2", "t3"]) {
      const orchestrator = new ProductionAcquisitionOrchestrator(runtime(new Transport([{
        head: { statusCode: 200, contentType: "text/plain" }, body: article(),
      }])));
      outputs.push(await orchestrator.execute({
        acquisition: request(id), bridgeOptions: hints,
        rawPersistence: { service: rawService(store), policy: policy(), context },
      }));
    }
    const artifactIds = outputs.map((result) => result.success
      ? result.acquisition.rawArtifact.artifactId : "failed");
    expect(new Set(artifactIds).size).toBe(1);
    expect(store.listAcquisitions(artifactIds[0] ?? "")).toHaveLength(3);
    store.close(); rmSync(path, { force: true });
  });

  it("creates separate raw identities when one source changes body over time", async () => {
    const path = pathForTest();
    const store = new SqliteRawArtifactAdapter(path);
    const ids: string[] = [];
    for (const [requestId, body] of [["x", article("X")], ["y", article("Y")]] as const) {
      const result = await new ProductionAcquisitionOrchestrator(runtime(new Transport([{
        head: { statusCode: 200, contentType: "text/plain" }, body,
      }]))).execute({
        acquisition: request(requestId), bridgeOptions: hints,
        rawPersistence: { service: rawService(store), policy: policy(), context },
      });
      if (result.success) ids.push(result.acquisition.rawArtifact.artifactId);
    }
    expect(new Set(ids).size).toBe(2);
    expect(ids.every((id) => store.listAcquisitions(id).length === 1)).toBe(true);
    store.close(); rmSync(path, { force: true });
  });

  it("keeps SourceDocument available after independent raw deletion", async () => {
    const path = pathForTest();
    const store = new SqliteRawArtifactAdapter(path);
    const lifecycle = policy();
    const result = await new ProductionAcquisitionOrchestrator(runtime(new Transport([{
      head: { statusCode: 200, contentType: "text/plain" }, body: article(),
    }]))).execute({
      acquisition: request("delete"), bridgeOptions: hints,
      rawPersistence: { service: rawService(store), policy: lifecycle, context },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(rawService(store).delete(
        result.acquisition.rawArtifact.artifactId,
        lifecycle,
        { ...context, operation: "delete" },
        "explicit-request",
      ).success).toBe(true);
      expect(store.findActiveById(result.acquisition.rawArtifact.artifactId)).toBeUndefined();
      expect(result.ingestion.document.contentText).toBe(article());
    }
    store.close(); rmSync(path, { force: true });
  });

  it("fails required-at-rest persistence closed while retaining truthful ingestion result", async () => {
    const path = pathForTest();
    const store = new SqliteRawArtifactAdapter(path);
    const result = await new ProductionAcquisitionOrchestrator(runtime(new Transport([{
      head: { statusCode: 200, contentType: "text/plain" }, body: article(),
    }]))).execute({
      acquisition: request("required-at-rest"), bridgeOptions: hints,
      rawPersistence: {
        service: rawService(store),
        policy: policy({ encryption: "required-at-rest" }),
        context,
      },
    });
    expect(result).toMatchObject({
      success: false,
      stage: "persistence",
      persistence: { result: { reasonCode: "ENCRYPTION_REQUIREMENT_UNSATISFIED" } },
      ingestion: { success: true },
    });
    store.close(); rmSync(path, { force: true });
  });
});
