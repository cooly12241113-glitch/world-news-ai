import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mappedLifecycleReasonCodes } from "../failure-mapping";

const runnerUrl = pathToFileURL(fileURLToPath(
  new URL("../../../scripts/run-live-web-acceptance.mjs", import.meta.url),
)).href;
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const repositoryFile = (relativePath: string): string =>
  fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url));
const diagnostics = await import(runnerUrl) as {
  parseAcceptanceDiagnostic(output: string): unknown;
  renderAcceptanceDiagnostic(diagnostic: unknown): string;
  diagnosticForExecution(
    diagnostic: unknown,
    status: number | null,
  ): unknown;
  diagnosticForChildProcessError(error: unknown): unknown | undefined;
  diagnosticForChildExecution(
    output: string,
    status: number | null,
    error?: unknown,
  ): unknown;
};

const failure = (stage: string, reason: string) => ({
  success: false,
  stage,
  reason,
});
const marker = (value: unknown): string =>
  `WORLD_NEWS_AI_LIVE_WEB_ACCEPTANCE=${JSON.stringify(value)}`;
const validSuccess = () => ({
  success: true,
  connectorId: "web",
  terminalHttpClass: "2xx",
  mediaType: "text/html",
  sourceDocumentProduced: true,
  contentHashProduced: true,
  acquisitionIdentityProduced: true,
  persistenceEnabled: false,
  refetchObserved: false,
  redecodeObserved: false,
});
const unknownFailure = [
  "Live Web acceptance failed.",
  "stage: unknown",
  "reason: UNKNOWN",
].join("\n");
const protocolFailureOutput = (reason: string): string => [
  "Live Web acceptance failed.",
  "stage: unknown",
  `reason: ${reason}`,
].join("\n");
const parsedOutput = (output: string): string =>
  diagnostics.renderAcceptanceDiagnostic(
    diagnostics.parseAcceptanceDiagnostic(output),
  );

describe("bounded live Web acceptance diagnostics", () => {
  it("captures exactly one marker from the actual injected acceptance harness", () => {
    const cases = [
      {
        outcome: "success",
        status: 0,
        markerCount: 1,
        rendered: [
          "Live Web acceptance passed.",
          "connector: web",
          "terminal-http-class: 2xx",
          "canonical-mime: text/html",
          "source-document-produced: yes",
          "content-hash-produced: yes",
          "acquisition-identity-produced: yes",
          "persistence-enabled: no",
          "refetch-observed: no",
          "redecode-observed: no",
        ].join("\n"),
      },
      {
        outcome: "acquisition",
        status: 1,
        markerCount: 1,
        rendered: [
          "Live Web acceptance failed.",
          "stage: acquisition",
          "reason: HTTP_ACCESS_DENIED",
        ].join("\n"),
      },
      {
        outcome: "ingestion",
        status: 1,
        markerCount: 1,
        rendered: [
          "Live Web acceptance failed.",
          "stage: ingestion",
          "reason: EMPTY_CONTENT",
        ].join("\n"),
      },
      {
        outcome: "throw",
        status: 1,
        markerCount: 0,
        rendered: protocolFailureOutput("ACCEPTANCE_CHILD_FAILED"),
      },
      {
        outcome: "reject",
        status: 1,
        markerCount: 0,
        rendered: protocolFailureOutput("ACCEPTANCE_CHILD_FAILED"),
      },
    ] as const;

    for (const expected of cases) {
      const execution = spawnSync(
        process.execPath,
        [
          repositoryFile("node_modules/vitest/vitest.mjs"),
          "run",
          "--config",
          repositoryFile("vitest.live-web.injected.config.ts"),
        ],
        {
          cwd: repositoryRoot,
          env: {
            ...process.env,
            LIVE_WEB_URL: "https://network-must-not-run.invalid/document",
            LIVE_WEB_ACCEPTANCE_INJECTED_OUTCOME: expected.outcome,
          },
          encoding: "utf8",
          maxBuffer: 1_048_576,
        },
      );
      const markerCount = execution.stdout.split(/\r?\n/u).filter((line) =>
        line.startsWith("WORLD_NEWS_AI_LIVE_WEB_ACCEPTANCE=")).length;
      const rendered = diagnostics.renderAcceptanceDiagnostic(
        diagnostics.diagnosticForChildExecution(
          execution.stdout,
          execution.status,
          execution.error,
        ),
      );

      expect(execution.status).toBe(expected.status);
      expect(markerCount).toBe(expected.markerCount);
      expect(rendered).toBe(expected.rendered);
      for (const forbidden of [
        "TOP_SECRET_TOKEN",
        "private.invalid",
        "secret=value",
        "workspace",
        "FAKE PASS",
        "socket",
        "TLS error",
        "stack",
      ]) {
        expect(rendered).not.toContain(forbidden);
      }
    }
  }, 30_000);

  it.each([
    ["configuration", "LIVE_WEB_URL_REQUIRED"],
    ["acquisition", "HTTP_ACCESS_DENIED"],
    ["acquisition", "HTTP_RESOURCE_UNAVAILABLE"],
    ["acquisition", "PINNED_TRANSPORT_FAILED"],
    ["ingestion", "EMPTY_CONTENT"],
  ])("renders only bounded %s / %s failure classification", (stage, reason) => {
    expect(diagnostics.renderAcceptanceDiagnostic(failure(stage, reason))).toBe([
      "Live Web acceptance failed.",
      `stage: ${stage}`,
      `reason: ${reason}`,
    ].join("\n"));
  });

  it("accepts every authoritative mapped lifecycle reason at acquisition", () => {
    for (const reason of mappedLifecycleReasonCodes()) {
      expect(diagnostics.renderAcceptanceDiagnostic(
        failure("acquisition", reason),
      )).toContain(`reason: ${reason}`);
    }
  });

  it.each([
    "TOP_SECRET_TOKEN",
    "SECRET123",
    "ACCESS_DENIED_EXTRA_SECRET",
    "C:\\PATH",
    "HTTPS_EXAMPLE_COM_TOKEN",
    "ABC_DEF_GHI",
    "A".repeat(65),
  ])("maps unrecognized reason %s to UNKNOWN", (reason) => {
    expect(diagnostics.renderAcceptanceDiagnostic(
      failure("acquisition", reason),
    )).toBe(unknownFailure);
  });

  it("enforces stage-specific reason membership", () => {
    expect(diagnostics.renderAcceptanceDiagnostic(
      failure("acquisition", "LIVE_WEB_URL_REQUIRED"),
    )).toBe(unknownFailure);
    expect(diagnostics.renderAcceptanceDiagnostic(
      failure("configuration", "HTTP_ACCESS_DENIED"),
    )).toBe(unknownFailure);
  });

  it("renders only the approved success metadata", () => {
    const success = validSuccess();
    expect(diagnostics.renderAcceptanceDiagnostic(success)).toBe([
      "Live Web acceptance passed.",
      "connector: web",
      "terminal-http-class: 2xx",
      "canonical-mime: text/html",
      "source-document-produced: yes",
      "content-hash-produced: yes",
      "acquisition-identity-produced: yes",
      "persistence-enabled: no",
      "refetch-observed: no",
      "redecode-observed: no",
    ].join("\n"));
    expect(parsedOutput(marker(success))).toBe(
      diagnostics.renderAcceptanceDiagnostic(success),
    );
  });

  it("accepts the exact success schema regardless of own-key order", () => {
    const permutedSuccess = {
      redecodeObserved: false,
      refetchObserved: false,
      persistenceEnabled: false,
      acquisitionIdentityProduced: true,
      contentHashProduced: true,
      sourceDocumentProduced: true,
      mediaType: "text/html",
      terminalHttpClass: "2xx",
      connectorId: "web",
      success: true,
    };

    expect(parsedOutput(marker(permutedSuccess))).toBe(
      diagnostics.renderAcceptanceDiagnostic(validSuccess()),
    );
  });

  it("rejects a fake success marker when the child did not exit successfully", () => {
    const success = validSuccess();
    expect(diagnostics.renderAcceptanceDiagnostic(
      diagnostics.diagnosticForExecution(success, 1),
    )).toBe(protocolFailureOutput("ACCEPTANCE_CHILD_FAILED"));
    expect(diagnostics.renderAcceptanceDiagnostic(
      diagnostics.diagnosticForExecution(success, null),
    )).toBe(protocolFailureOutput("ACCEPTANCE_CHILD_FAILED"));
    expect(diagnostics.renderAcceptanceDiagnostic(
      diagnostics.diagnosticForChildExecution(
        marker(success),
        null,
        { code: "ENOENT" },
      ),
    )).toBe(protocolFailureOutput("ACCEPTANCE_CHILD_SPAWN_FAILED"));
  });

  it.each([
    ["acquisition", "HTTP_ACCESS_DENIED"],
    ["ingestion", "EMPTY_CONTENT"],
  ])("preserves a valid %s / %s domain failure when the child exits nonzero", (
    stage,
    reason,
  ) => {
    const domainFailure = diagnostics.parseAcceptanceDiagnostic(
      marker(failure(stage, reason)),
    );
    expect(diagnostics.renderAcceptanceDiagnostic(
      diagnostics.diagnosticForExecution(domainFailure, 1),
    )).toBe([
      "Live Web acceptance failed.",
      `stage: ${stage}`,
      `reason: ${reason}`,
    ].join("\n"));
  });

  it("uses child failure only when nonzero exit has no diagnostic marker", () => {
    const missing = diagnostics.parseAcceptanceDiagnostic("ordinary child output");

    expect(diagnostics.renderAcceptanceDiagnostic(
      diagnostics.diagnosticForExecution(missing, 1),
    )).toBe(protocolFailureOutput("ACCEPTANCE_CHILD_FAILED"));
    expect(diagnostics.renderAcceptanceDiagnostic(
      diagnostics.diagnosticForExecution(missing, 0),
    )).toBe(protocolFailureOutput("ACCEPTANCE_DIAGNOSTIC_MISSING"));
  });

  it("gives spawn failure precedence over any parsed marker", () => {
    const ambiguousOutput = [
      marker(failure("ingestion", "EMPTY_CONTENT")),
      marker(failure("acquisition", "HTTP_ACCESS_DENIED")),
    ].join("\n");

    expect(diagnostics.renderAcceptanceDiagnostic(
      diagnostics.diagnosticForChildExecution(
        ambiguousOutput,
        null,
        { code: "ENOENT" },
      ),
    )).toBe(protocolFailureOutput("ACCEPTANCE_CHILD_SPAWN_FAILED"));
  });

  it("classifies ENOBUFS as oversized without parsing truncated output", () => {
    const truncatedOutput = marker(failure("ingestion", "EMPTY_CONTENT"));
    const nativeError = Object.assign(
      new Error("spawnSync ENOBUFS at C:/private/runner with secret=value"),
      { code: "ENOBUFS" },
    );
    const rendered = diagnostics.renderAcceptanceDiagnostic(
      diagnostics.diagnosticForChildExecution(
        truncatedOutput,
        null,
        nativeError,
      ),
    );

    expect(rendered).toBe(
      protocolFailureOutput("ACCEPTANCE_DIAGNOSTIC_OVERSIZED"),
    );
    expect(rendered).not.toContain("CHILD_SPAWN_FAILED");
    expect(rendered).not.toContain("EMPTY_CONTENT");
    expect(rendered).not.toContain("private");
    expect(rendered).not.toContain("secret=value");
    expect(rendered).not.toContain("ENOBUFS at");
  });

  it("classifies only known process-creation codes as spawn failures", () => {
    expect(diagnostics.renderAcceptanceDiagnostic(
      diagnostics.diagnosticForChildProcessError(
        Object.assign(new Error("private executable path"), { code: "ENOENT" }),
      ),
    )).toBe(protocolFailureOutput("ACCEPTANCE_CHILD_SPAWN_FAILED"));
    expect(diagnostics.renderAcceptanceDiagnostic(
      diagnostics.diagnosticForChildProcessError(
        Object.assign(new Error("unexpected child API failure"), { code: "EIO" }),
      ),
    )).toBe(unknownFailure);
  });

  it.each([
    ["ambiguous", [
      marker(failure("ingestion", "EMPTY_CONTENT")),
      marker(failure("acquisition", "HTTP_ACCESS_DENIED")),
    ].join("\n"), "ACCEPTANCE_DIAGNOSTIC_AMBIGUOUS"],
    ["oversized", marker({
      ...failure("ingestion", "EMPTY_CONTENT"),
      padding: "A".repeat(1_024),
    }), "ACCEPTANCE_DIAGNOSTIC_OVERSIZED"],
    ["malformed", "WORLD_NEWS_AI_LIVE_WEB_ACCEPTANCE={malformed", "ACCEPTANCE_DIAGNOSTIC_MALFORMED"],
  ])("gives %s protocol classification precedence over child exit fallback", (
    _label,
    output,
    reason,
  ) => {
    const parsed = diagnostics.parseAcceptanceDiagnostic(output);

    expect(diagnostics.renderAcceptanceDiagnostic(
      diagnostics.diagnosticForExecution(parsed, 1),
    )).toBe(protocolFailureOutput(reason));
  });

  it("extracts the bounded marker without forwarding surrounding process output", () => {
    const forbiddenNoise = [
      "https://private.example/path?secret=value#fragment",
      "<html>RAW BODY</html>",
      "Content-Type: text/html; charset=UTF-8",
      "Retry-After: 120",
      "native socket error with credential material",
      "C:/private/workspace/file.ts:10",
      "Error stack trace",
      "Live Web acceptance passed.",
    ].join("\n");
    const rendered = diagnostics.renderAcceptanceDiagnostic(
      diagnostics.parseAcceptanceDiagnostic(
        `${forbiddenNoise}\n${marker(failure("ingestion", "EMPTY_CONTENT"))}\n`,
      ),
    );

    expect(rendered).toBe([
      "Live Web acceptance failed.",
      "stage: ingestion",
      "reason: EMPTY_CONTENT",
    ].join("\n"));
    for (const forbidden of [
      "private.example",
      "secret=value",
      "RAW BODY",
      "Content-Type",
      "Retry-After",
      "socket",
      "credential",
      "workspace",
      "stack",
      "acceptance passed",
    ]) {
      expect(rendered).not.toContain(forbidden);
    }
  });

  it("accepts exactly one valid CRLF-framed marker", () => {
    expect(parsedOutput(
      `ordinary child output\r\n${marker(failure("ingestion", "EMPTY_CONTENT"))}\r\n`,
    )).toContain("reason: EMPTY_CONTENT");
  });

  it("classifies zero markers as a missing diagnostic", () => {
    expect(parsedOutput("ordinary output without marker")).toBe(
      protocolFailureOutput("ACCEPTANCE_DIAGNOSTIC_MISSING"),
    );
  });

  it.each([
    ["two valid", [
      marker(failure("ingestion", "EMPTY_CONTENT")),
      marker(failure("acquisition", "HTTP_ACCESS_DENIED")),
    ].join("\n")],
    ["duplicate", [
      marker(failure("ingestion", "EMPTY_CONTENT")),
      marker(failure("ingestion", "EMPTY_CONTENT")),
    ].join("\n")],
    ["valid then malformed", [
      marker(failure("ingestion", "EMPTY_CONTENT")),
      "WORLD_NEWS_AI_LIVE_WEB_ACCEPTANCE={malformed",
    ].join("\n")],
    ["malformed then valid", [
      "WORLD_NEWS_AI_LIVE_WEB_ACCEPTANCE={malformed",
      marker(failure("ingestion", "EMPTY_CONTENT")),
    ].join("\n")],
  ])("classifies ambiguous marker framing: %s", (_label, output) => {
    expect(parsedOutput(output)).toBe(
      protocolFailureOutput("ACCEPTANCE_DIAGNOSTIC_AMBIGUOUS"),
    );
  });

  it.each([
    ["oversized", marker({
      ...failure("ingestion", "EMPTY_CONTENT"),
      padding: "A".repeat(1_024),
    }), "ACCEPTANCE_DIAGNOSTIC_OVERSIZED"],
    ["malformed JSON", "WORLD_NEWS_AI_LIVE_WEB_ACCEPTANCE={malformed", "ACCEPTANCE_DIAGNOSTIC_MALFORMED"],
    ["embedded newline", marker(failure("ingestion", "EMPTY\nCONTENT")), "ACCEPTANCE_DIAGNOSTIC_MALFORMED"],
    ["raw newline", "WORLD_NEWS_AI_LIVE_WEB_ACCEPTANCE={\"success\":false,\"stage\":\"ingestion\",\"reason\":\"EMPTY\nCONTENT\"}", "ACCEPTANCE_DIAGNOSTIC_MALFORMED"],
    ["ANSI", marker(failure("ingestion", "\u001b[31mEMPTY_CONTENT")), "ACCEPTANCE_DIAGNOSTIC_MALFORMED"],
    ["control character", marker(failure("ingestion", "EMPTY\u0000CONTENT")), "ACCEPTANCE_DIAGNOSTIC_MALFORMED"],
    ["malicious stage", marker(failure("network", "HTTP_ACCESS_DENIED")), "ACCEPTANCE_DIAGNOSTIC_MALFORMED"],
    ["malicious reason", marker(failure("acquisition", "TOP_SECRET_TOKEN")), "ACCEPTANCE_DIAGNOSTIC_MALFORMED"],
  ])("fails closed for %s marker payload", (_label, output, reason) => {
    expect(parsedOutput(output)).toBe(protocolFailureOutput(reason));
  });

  it.each([
    ["one extra key", { ...validSuccess(), extra: "value" }],
    ["multiple extra keys", {
      ...validSuccess(),
      extraOne: "value",
      extraTwo: false,
    }],
    ["secret-named extra key", {
      ...validSuccess(),
      TOP_SECRET_TOKEN: "must-not-cross-boundary",
    }],
    ["nested extra object", {
      ...validSuccess(),
      metadata: { path: "C:/private/file", token: "secret=value" },
    }],
    ["missing required key", (() => {
      const { mediaType: _omitted, ...missing } = validSuccess();
      return missing;
    })()],
    ["wrong connector", { ...validSuccess(), connectorId: "rss" }],
    ["wrong MIME", { ...validSuccess(), mediaType: "application/json" }],
    ["wrong HTTP class", { ...validSuccess(), terminalHttpClass: "3xx" }],
    ["wrong boolean", { ...validSuccess(), persistenceEnabled: true }],
    ["wrong type", { ...validSuccess(), sourceDocumentProduced: "true" }],
    ["array extra field", { ...validSuccess(), metadata: ["secret=value"] }],
  ])("rejects invalid exact-success schema: %s", (_label, payload) => {
    const rendered = parsedOutput(marker(payload));

    expect(rendered).toBe(protocolFailureOutput("ACCEPTANCE_SUCCESS_INVALID"));
    expect(rendered).not.toContain("acceptance passed");
    expect(rendered).not.toContain("TOP_SECRET_TOKEN");
    expect(rendered).not.toContain("private");
    expect(rendered).not.toContain("secret=value");
  });

  it.each([
    ["duplicate successes", [marker(validSuccess()), marker(validSuccess())]],
    ["success plus failure", [
      marker(validSuccess()),
      marker(failure("ingestion", "EMPTY_CONTENT")),
    ]],
  ])("rejects ambiguous success framing: %s", (_label, markers) => {
    expect(parsedOutput(markers.join("\n"))).toBe(
      protocolFailureOutput("ACCEPTANCE_DIAGNOSTIC_AMBIGUOUS"),
    );
  });

  it("fails closed to unknown for free-form or malformed diagnostics", () => {
    for (const value of [
      failure("acquisition", "native socket refused"),
      failure("network", "HTTP_ACCESS_DENIED"),
      { success: false, stage: "acquisition", reason: "A".repeat(65) },
      undefined,
    ]) {
      expect(diagnostics.renderAcceptanceDiagnostic(value)).toBe(unknownFailure);
    }
  });
});
