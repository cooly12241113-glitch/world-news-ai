# Sprint 17.3B — Live Web HTML Connector

## Status

**IMPLEMENTED / MAKER VALIDATED / INDEPENDENTLY REVIEWED / REAL-WORLD ACCEPTANCE PASS / FINAL COMPLETE**

## What

Sprint 17.3B adds `LiveWebSourceConnector`, a production Web/HTML adapter over
the existing safe acquisition executor, and composes it with
`ProductionAcquisitionOrchestrator`. One public HTTP(S) URL can now produce one
bounded HTML acquisition, optional governed `RawArtifact`, and a
`SourceDocument` through the existing `GenericHtmlCapability`.

## Why

This is the first live connector vertical slice over the completed Milestone 04
security foundation. It proves that a production connector can expose real Web
HTML without gaining an alternate transport or weakening the separation between
raw acquisition and normalized ingestion.

## Boundary

- Connector ID is `web`; locator kind is `web`.
- The request must explicitly select `requestedContentKind: html` and
  `public-only` access.
- Credential requirement, pagination, and incremental fetch are all `none` or
  disabled.
- The connector delegates once to `SafeRuntimeSourceConnector`; it owns no DNS,
  socket, HTTP client, redirect, retry, decompression, browser, or parser logic.
- Production composition remains `LiveWebSourceConnector` →
  `SafeNetworkAcquisitionRuntime` → `ProductionAcquisitionOrchestrator`.
- Raw persistence is optional and independently governed. `RawArtifact` and
  `SourceDocument` remain separate lifecycle objects.

## Invariants

- All I/O stays inside the existing pinned safe transport authority.
- Authorization, full-set DNS/IP checks, pinning, peer equality, redirects,
  retries, deadlines, cancellation, header/body/decompression limits, strict
  UTF-8, MIME policy, and terminal 2xx gating remain unchanged.
- The runtime's one decoded byte sequence and SHA-256 feed both optional raw
  persistence and the materialized-content ingestion bridge.
- The orchestrator performs no refetch, re-decode, identity regeneration,
  alternate hash, or pre-persistence normalization.
- A non-success acquisition cannot reach persistence or ingestion.
- Ingestion remains zero-network and selects the existing generic HTML
  capability deterministically.

## Rejected semantics

- `text/plain`, JSON, XML, RSS, Atom, missing/malformed MIME, invalid UTF-8,
  unsupported encodings, non-2xx terminal responses, private/mixed DNS answers,
  HTTPS downgrade redirects, and exceeded limits fail closed.
- No charset transcoding, content sniffing to HTML, JavaScript execution,
  browser rendering, link following, asset retrieval, canonical-link request,
  article-semantic parsing in the connector, authentication, cookies, or
  arbitrary credential/header injection is added.
- RSS/Atom parsing and item fan-out remain outside this sprint.

## Known limitations

Only static, strict-UTF-8 `text/html` is supported. JavaScript-rendered,
authenticated, paywalled, CAPTCHA-protected, non-UTF-8, PDF, and feed content is
not supported. Minimal/non-document HTML may normalize to `EMPTY_CONTENT`, and
protected sites may return bounded `HTTP_ACCESS_DENIED`. The existing Vite
large-chunk warning remains unrelated debt.

## Test proof

Focused deterministic tests cover the connector capability, exact single
delegation, HTML-only/public-only request gate, prohibited-source precedence,
200 and representative 2xx,
canonical MIME, rejected MIME families, missing/malformed MIME, strict UTF-8,
gzip/deflate/Brotli, redirect lifecycle, non-2xx isolation, mixed DNS denial,
exact bytes/hash/acquisition identity continuity, optional persistence,
truthful persistence partial failures, SourceDocument creation, and one
acquisition/no refetch. Existing security, body, orchestration, ingestion, raw
persistence, URL-only zero-network, fixture-connector, 17.3A status, and AST
network-authority suites remain regression gates.

- Focused Sprint 17.3B, acceptance isolation, and bounded diagnostics: 4 test
  files / 87 tests passed
- Integrated connector/security/orchestration/ingestion/raw gate: 30 files /
  509 tests passed
- Full suite: 104 files / 1,273 tests passed
- skipped/only/todo: 0
- Typecheck and Web typecheck: passed
- Web production build: passed; existing large-chunk warning remains
- Full and production dependency audits: 0 vulnerabilities
- External Internet calls: 0
- Dependency changes: none
- SQLite migration: schema v3, unchanged

Automated tests make zero external Internet calls.

## Real-world acceptance method

`npm run accept:live-web` is an explicit opt-in path. `LIVE_WEB_URL` is
mandatory; an absent, empty, or whitespace-only value fails closed with exit
code 2 and a bounded configuration message. An authorized operator may later
set it to a suitable public static HTML article and run the command.
The composition uses production `NodeDnsResolver`, pinned response transport,
safe runtime, live connector, and production orchestrator. Persistence is off.
It asserts a Web connector, canonical `text/html`, acquisition identity,
SHA-256, and `SourceDocument`, while returning no URL, query, headers, body,
credentials, or native network error.

The runner exposes only overall PASS/FAIL plus a closed stage
(`configuration`, `acquisition`, `persistence`, `bridge`, `ingestion`,
`source-document`, or `unknown`) and a reason in that stage's explicit finite
allowlist. Acquisition entries mirror the authoritative mapped lifecycle
reasons plus the small connector-adapter set; bridge and ingestion entries
mirror their existing finite contracts. Unknown or wrong-stage reasons collapse
to `UNKNOWN`; uppercase shape alone never authorizes output.
Success output is limited to connector `web`, HTTP class `2xx`, canonical
`text/html`, and yes/no production assertions. Child-process output is parsed
only when exactly one bounded valid marker exists and is otherwise discarded.

Domain failures describe an authoritative bounded production outcome, for
example `acquisition / HTTP_ACCESS_DENIED` or
`ingestion / EMPTY_CONTENT`. Protocol failures describe only why the parent
could not consume a trustworthy child result and do not identify the
underlying website/network/application cause. Their finite reasons are:

- `ACCEPTANCE_DIAGNOSTIC_MISSING`
- `ACCEPTANCE_DIAGNOSTIC_AMBIGUOUS`
- `ACCEPTANCE_DIAGNOSTIC_MALFORMED`
- `ACCEPTANCE_DIAGNOSTIC_OVERSIZED`
- `ACCEPTANCE_CHILD_FAILED`
- `ACCEPTANCE_CHILD_SPAWN_FAILED`
- `ACCEPTANCE_SUCCESS_INVALID`
- defensive fallback `UNKNOWN`

Structured `ENOBUFS` output-buffer exhaustion becomes
`ACCEPTANCE_DIAGNOSTIC_OVERSIZED`; truncated stdout is not parsed for recovery.
`ACCEPTANCE_CHILD_SPAWN_FAILED` is reserved for the narrow recognized
process-creation codes `EACCES`, `ENOENT`, `ENOTDIR`, and `EPERM`. Other
structured child-process API failures fail closed to `UNKNOWN` without native
message reflection.

Precedence is buffer exhaustion, true spawn failure, marker ambiguity,
oversized/malformed marker, valid bounded domain diagnostic, exact valid
success, invalid success, then child-exit/missing-marker fallback. Consequently
a valid domain failure remains authoritative even with a non-zero child exit.
A missing marker plus non-zero/null exit becomes `ACCEPTANCE_CHILD_FAILED`; a
normal exit without a marker becomes `ACCEPTANCE_DIAGNOSTIC_MISSING`.

Success uses an exact schema containing only `success`, `connectorId`,
`terminalHttpClass`, `mediaType`, `sourceDocumentProduced`,
`contentHashProduced`, `acquisitionIdentityProduced`, `persistenceEnabled`,
`refetchObserved`, and `redecodeObserved`. All ten keys are required, additional
keys are forbidden, and every value must match its finite expected literal or
boolean. Any extra, missing, nested, or mistyped success metadata becomes
`ACCEPTANCE_SUCCESS_INVALID`. Child stdout is consumed only for the bounded
marker; stderr is ignored, and neither stream nor native error text is
forwarded.

The passing-test marker suppression root cause was confirmed in the dedicated
Vitest harness: intercepted `console.log` output was not present in
parent-captured stdout for a passing test. The dedicated config now sets
`disableConsoleIntercept: true`. The default config was modified only to
structurally exclude `*.acceptance.ts` and does not enable that bypass. The parent
still privately captures stdout, consumes exactly one finite marker, discards
all other output, and ignores stderr. A deterministic injected-success
regression over the actual acceptance file and dedicated config proves child
status 0, one captured marker, and final bounded PASS. It also preserves
acquisition and `EMPTY_CONTENT` domain failures, child-failure fallback, and
hostile-output suppression.

The acceptance specification is named `*.acceptance.ts`, is explicitly excluded
by the default Vitest config, and is included only by the dedicated exact-path
config invoked through the bounded runner. Therefore ordinary `npm test` cannot
discover it even when ambient `LIVE_WEB_URL` is populated. Automated Maker
validation performs no external request.

The authoritative real-world history is chronological:

1. The simple example page used the external network, reached 2xx canonical
   `text/html`, and produced content hash and acquisition identity, but no
   `SourceDocument`; it ended at `ingestion / EMPTY_CONTENT`.
2. The White House article used the external network and ended at
   `acquisition / HTTP_ACCESS_DENIED`; `GenericHtmlCapability` was not reached.
3. The first IANA attempt returned
   `unknown / ACCEPTANCE_DIAGNOSTIC_MISSING`. The confirmed cause was passing
   Vitest console interception suppressing the emitted marker from
   parent-captured stdout; it did not establish an IANA, network, or product
   failure.
4. After the dedicated `disableConsoleIntercept` repair, the final IANA rerun
   passed the real production safe path: external network yes, terminal class
   2xx, canonical `text/html`, connector `web`, content hash yes, acquisition
   identity yes, `SourceDocument` yes, persistence off, and refetch/redecode
   no/no.

## Next dependency

**Sprint 17.3C — Live RSS/Atom Connector**. Sprint 17.3 overall remains in
progress.
