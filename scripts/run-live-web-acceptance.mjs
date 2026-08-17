import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ACCEPTANCE_MARKER = "WORLD_NEWS_AI_LIVE_WEB_ACCEPTANCE=";
const EXPECTED_SUCCESS_KEYS = new Set([
  "success",
  "connectorId",
  "terminalHttpClass",
  "mediaType",
  "sourceDocumentProduced",
  "contentHashProduced",
  "acquisitionIdentityProduced",
  "persistenceEnabled",
  "refetchObserved",
  "redecodeObserved",
]);
const PROCESS_CREATION_FAILURE_CODES = new Set([
  "EACCES",
  "ENOENT",
  "ENOTDIR",
  "EPERM",
]);
const BOUNDED_STAGES = new Set([
  "configuration",
  "acquisition",
  "persistence",
  "bridge",
  "ingestion",
  "source-document",
  "unknown",
]);
const BOUNDED_REASONS_BY_STAGE = new Map([
  ["configuration", new Set(["LIVE_WEB_URL_REQUIRED"])],
  ["acquisition", new Set([
    "SOURCE_ACCESS_PROHIBITED",
    "CREDENTIAL_CONNECTOR_SCOPE_MISMATCH",
    "CREDENTIAL_REQUIREMENT_MISMATCH",
    "INVALID_ACQUISITION_AUTHORIZATION_INPUT",
    "SOURCE_ACCOUNT_CONSENT_REQUIRED",
    "CREDENTIAL_REFERENCE_REQUIRED",
    "CREDENTIAL_AVAILABILITY_REQUIRED",
    "CREDENTIAL_REFERENCE_UNAVAILABLE",
    "CREDENTIAL_REFERENCE_ACCESS_DENIED",
    "UNSUPPORTED_NETWORK_PROTOCOL",
    "INVALID_NETWORK_TARGET",
    "URL_USERINFO_NOT_ALLOWED",
    "CUSTOM_PORT_NOT_ALLOWED",
    "UNSAFE_IP_ADDRESS",
    "DNS_MIXED_ADDRESS_SET",
    "HTTPS_DOWNGRADE_DENIED",
    "REDIRECT_LOOP_DETECTED",
    "REDIRECT_LIMIT_EXCEEDED",
    "REDIRECT_LOCATION_REQUIRED",
    "EGRESS_TARGET_MISMATCH",
    "TLS_VALIDATION_FAILED",
    "RESPONSE_HEADERS_INVALID",
    "ACQUISITION_CANCELLED",
    "RATE_LIMIT_EXCEEDED",
    "RATE_LIMIT_STATE_CAPACITY_EXHAUSTED",
    "HTTP_RATE_LIMITED",
    "HTTP_AUTHENTICATION_REQUIRED",
    "HTTP_ACCESS_DENIED",
    "HTTP_RESOURCE_UNAVAILABLE",
    "HTTP_STATUS_NOT_ACCEPTED",
    "CONCURRENCY_LIMIT_EXCEEDED",
    "DNS_RESOLUTION_FAILED",
    "ATTEMPT_TIMEOUT",
    "OVERALL_DEADLINE_EXCEEDED",
    "PINNED_TRANSPORT_FAILED",
    "HTTP_TRANSIENT_FAILURE",
    "RESPONSE_BODY_TOO_LARGE",
    "ENCODED_BODY_TOO_LARGE",
    "DECOMPRESSED_BODY_TOO_LARGE",
    "CONTENT_TYPE_NOT_ALLOWED",
    "CONTENT_KIND_MISMATCH",
    "CONTENT_ENCODING_NOT_ALLOWED",
    "CHARACTER_ENCODING_NOT_ALLOWED",
    "DECOMPRESSION_FAILED",
    "BODY_IDLE_TIMEOUT",
    "RESPONSE_STREAM_FAILED",
    "INVALID_ACQUISITION_REQUEST",
    "TARGET_UNSUPPORTED",
    "RESPONSE_BODY_REQUIRED",
    "LIVE_WEB_MEDIA_TYPE_MISMATCH",
  ])],
  ["persistence", new Set()],
  ["bridge", new Set([
    "INVALID_ACQUISITION_RESULT",
    "UNSUPPORTED_LOCATOR",
    "UNSUPPORTED_CONTENT_KIND",
  ])],
  ["ingestion", new Set([
    "INVALID_INPUT",
    "INVALID_URL",
    "UNSAFE_URL",
    "SAFE_ACQUISITION_REQUIRED",
    "FETCH_FAILED",
    "FETCH_TIMEOUT",
    "HTTP_STATUS_ERROR",
    "TOO_MANY_REDIRECTS",
    "RESPONSE_TOO_LARGE",
    "UNSUPPORTED_CONTENT_TYPE",
    "UNSUPPORTED_FORMAT",
    "NO_CAPABILITY_MATCH",
    "PARSE_FAILED",
    "TITLE_NOT_FOUND",
    "EMPTY_CONTENT",
    "DATE_PARSE_FAILED",
    "CLASSIFICATION_UNCERTAIN",
    "VALIDATION_FAILED",
    "MAPPING_FAILED",
  ])],
  ["source-document", new Set()],
  ["unknown", new Set([
    "ACCEPTANCE_DIAGNOSTIC_MISSING",
    "ACCEPTANCE_DIAGNOSTIC_AMBIGUOUS",
    "ACCEPTANCE_DIAGNOSTIC_MALFORMED",
    "ACCEPTANCE_DIAGNOSTIC_OVERSIZED",
    "ACCEPTANCE_CHILD_FAILED",
    "ACCEPTANCE_CHILD_SPAWN_FAILED",
    "ACCEPTANCE_SUCCESS_INVALID",
    "UNKNOWN",
  ])],
]);

const protocolFailure = (reason) => ({
  success: false,
  stage: "unknown",
  reason,
});

const isBoundedFailure = (value) =>
  typeof value === "object" && value !== null && value.success === false &&
  BOUNDED_STAGES.has(value.stage) && typeof value.reason === "string" &&
  BOUNDED_REASONS_BY_STAGE.get(value.stage)?.has(value.reason) === true;

const hasExactSuccessKeys = (value) => {
  const keys = Object.keys(value);
  return keys.length === EXPECTED_SUCCESS_KEYS.size &&
    keys.every((key) => EXPECTED_SUCCESS_KEYS.has(key));
};

const isBoundedSuccess = (value) =>
  typeof value === "object" && value !== null && value.success === true &&
  !Array.isArray(value) && hasExactSuccessKeys(value) &&
  value.connectorId === "web" && value.terminalHttpClass === "2xx" &&
  value.mediaType === "text/html" && value.sourceDocumentProduced === true &&
  value.contentHashProduced === true &&
  value.acquisitionIdentityProduced === true &&
  value.persistenceEnabled === false && value.refetchObserved === false &&
  value.redecodeObserved === false;

export const parseAcceptanceDiagnostic = (output) => {
  if (typeof output !== "string") {
    return protocolFailure("ACCEPTANCE_DIAGNOSTIC_MISSING");
  }
  const candidates = output.split(/\r?\n/u).filter((candidate) =>
    candidate.startsWith(ACCEPTANCE_MARKER));
  if (candidates.length === 0) {
    return protocolFailure("ACCEPTANCE_DIAGNOSTIC_MISSING");
  }
  if (candidates.length > 1) {
    return protocolFailure("ACCEPTANCE_DIAGNOSTIC_AMBIGUOUS");
  }
  const line = candidates[0];
  if (line === undefined) {
    return protocolFailure("ACCEPTANCE_DIAGNOSTIC_MISSING");
  }
  if (line.length > 1_024) {
    return protocolFailure("ACCEPTANCE_DIAGNOSTIC_OVERSIZED");
  }
  try {
    const value = JSON.parse(line.slice(ACCEPTANCE_MARKER.length));
    if (isBoundedFailure(value) || isBoundedSuccess(value)) return value;
    return protocolFailure(
      typeof value === "object" && value !== null && value.success === true
        ? "ACCEPTANCE_SUCCESS_INVALID"
        : "ACCEPTANCE_DIAGNOSTIC_MALFORMED",
    );
  } catch {
    return protocolFailure("ACCEPTANCE_DIAGNOSTIC_MALFORMED");
  }
};

export const renderAcceptanceDiagnostic = (diagnostic) => {
  if (isBoundedSuccess(diagnostic)) {
    return [
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
    ].join("\n");
  }
  const failure = isBoundedFailure(diagnostic)
    ? diagnostic
    : { stage: "unknown", reason: "UNKNOWN" };
  return [
    "Live Web acceptance failed.",
    `stage: ${failure.stage}`,
    `reason: ${failure.reason}`,
  ].join("\n");
};

export const diagnosticForExecution = (
  diagnostic,
  status,
) => {
  if (isBoundedFailure(diagnostic)) {
    if (diagnostic.stage === "unknown" &&
        diagnostic.reason === "ACCEPTANCE_DIAGNOSTIC_MISSING" &&
        status !== 0) {
      return protocolFailure("ACCEPTANCE_CHILD_FAILED");
    }
    return diagnostic;
  }
  if (isBoundedSuccess(diagnostic)) {
    return status === 0
      ? diagnostic
      : protocolFailure("ACCEPTANCE_CHILD_FAILED");
  }
  return status === 0
    ? protocolFailure("UNKNOWN")
    : protocolFailure("ACCEPTANCE_CHILD_FAILED");
};

export const diagnosticForChildProcessError = (error) => {
  if (error === undefined) return undefined;
  const code = typeof error === "object" && error !== null &&
      "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
  if (code === "ENOBUFS") {
    return protocolFailure("ACCEPTANCE_DIAGNOSTIC_OVERSIZED");
  }
  if (code !== undefined && PROCESS_CREATION_FAILURE_CODES.has(code)) {
    return protocolFailure("ACCEPTANCE_CHILD_SPAWN_FAILED");
  }
  return protocolFailure("UNKNOWN");
};

export const diagnosticForChildExecution = (output, status, error) => {
  const childProcessDiagnostic = diagnosticForChildProcessError(error);
  if (childProcessDiagnostic !== undefined) return childProcessDiagnostic;
  return diagnosticForExecution(parseAcceptanceDiagnostic(output), status);
};

const run = () => {
  const liveWebUrl = process.env.LIVE_WEB_URL;
  if (liveWebUrl === undefined || liveWebUrl.trim() === "") {
    console.error(renderAcceptanceDiagnostic({
      success: false,
      stage: "configuration",
      reason: "LIVE_WEB_URL_REQUIRED",
    }));
    return 2;
  }
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const execution = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("../node_modules/vitest/vitest.mjs", import.meta.url)),
      "run",
      "--config",
      fileURLToPath(new URL("../vitest.live-web.config.ts", import.meta.url)),
    ],
    {
      cwd: repositoryRoot,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 1_048_576,
    },
  );
  const diagnostic = diagnosticForChildExecution(
    execution.stdout,
    execution.status,
    execution.error,
  );
  const rendered = renderAcceptanceDiagnostic(diagnostic);
  if (diagnostic?.success !== true) {
    console.error(rendered);
    return 1;
  }
  console.log(rendered);
  return 0;
};

const invokedAsScript = process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedAsScript) process.exitCode = run();
