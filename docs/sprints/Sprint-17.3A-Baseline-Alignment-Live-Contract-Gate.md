# Sprint 17.3A — Baseline Alignment + Live Contract Gate

## Status

**IMPLEMENTED / INDEPENDENTLY REVIEWED / FINAL COMPLETE**

## What and why

Sprint 17.3A prepares the completed Milestone 04 secure acquisition foundation
for future production Web and RSS connectors without implementing either live
connector. The pre-existing runtime adapter was hardcoded to the `web`
capability, the production orchestrator constructed that fixture-named adapter
internally, and non-redirect/retry HTTP statuses could reach bounded body
processing without an explicit terminal success gate.

## Boundary

- `rss` may use the existing strict Web locator; no other connector/locator
  combination is broadened.
- `SafeRuntimeSourceConnector` converts one injected safe-runtime execution
  into the existing strict `SourceAcquisitionResult` contract. It owns no DNS,
  socket, HTTP client, or other network authority.
- `SafeRuntimeFixtureConnector` remains a compatibility wrapper with its
  existing Web capability and deterministic clock.
- `ProductionAcquisitionOrchestrator` accepts a trusted
  `DetailedSafeSourceConnector` while retaining its previous runtime
  constructor path.
- Terminal acquisition proceeds to body validation only for HTTP 2xx. Existing
  redirect handling and bounded 429/502/503/504 retry behavior remain earlier
  lifecycle gates.

## Invariants

- One orchestrator execution calls acquisition exactly once.
- The same bounded result supplies exact decoded bytes/SHA-256 to optional raw
  persistence and its materialized UTF-8 text to the existing bridge.
- No refetch, re-decode, or acquisition-ID regeneration is introduced.
- Authorization precedes DNS and transport; redirects/retries re-authorize and
  re-resolve as before.
- Ingestion remains content-only; URL-only ingestion fails with
  `SAFE_ACQUISITION_REQUIRED` and performs zero network calls.
- Raw persistence remains optional, independently governed, and truthfully
  reports partial failure.
- Only the two existing safe transports possess broad network authority.

## Rejected semantics

- HTTP 401 maps to `authentication-required`.
- HTTP 403 maps to `access-denied`.
- HTTP 404/410 map to `unavailable`.
- Exhausted HTTP 429 retains `rate-limited`; exhausted retryable 5xx retains
  the existing `unavailable` result.
- Other non-2xx responses map to a bounded `failed` result.
- Non-success bodies are destroyed without decoding and cannot reach raw
  persistence or ingestion.

No raw status text, headers, body, URL query, credential, or native error is
added to public failures or audit output.

## Known limitations

No `LiveWebSourceConnector`, `LiveRssSourceConnector`, RSS/Atom parsing,
authentication, arbitrary request-header API, browser rendering, external
Internet acceptance, scheduling, discovery, or UI integration exists in this
increment. The existing Web test timing sensitivity and bundle-size warning
remain unrelated LOW debt.

## Next dependency

**Sprint 17.3B — Live Web HTML Connector** is the next implementation boundary.
It must use this injected safe connector seam and must not add independent
network authority. Sprint 17.3A itself performs no live Web or RSS acquisition.

## Test proof

Focused tests cover connector/locator compatibility, configurable capability
semantics, fixture compatibility, terminal 2xx/non-2xx mapping, bounded retry
exhaustion, prohibited-policy precedence, non-success body isolation,
orchestrator single invocation, identity/hash continuity, zero downstream
calls on acquisition failure, URL-only zero-network behavior, and the network
authority architecture guard.

- Focused Sprint 17.3A gate: 7 test files / 124 tests passed
- Integrated acquisition/security/persistence gate: 36 files / 543 tests passed
- Full suite: 100 files / 1,186 tests passed
- skipped/only/todo: 0
- Typecheck and Web typecheck: passed
- Web production build: passed; existing large-chunk warning remains
- Full and production dependency audits: 0 vulnerabilities
- External Internet calls: 0
- Dependency changes: none
- SQLite migration: schema v3, unchanged
