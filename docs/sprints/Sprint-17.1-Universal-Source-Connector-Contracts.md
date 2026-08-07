# Sprint 17.1 — Universal Source Connector Contracts

## Status

**IMPLEMENTED / REVIEWED / COMPLETE**

## Goal and baseline

Provide a provider- and platform-neutral acquisition boundary that future
source adapters can implement without replacing the existing adaptive
ingestion pipeline.

- Baseline: `f36ba954ed25f43a5aefdb6edb37a1989d64cd1c`
  (`docs: define strategic intelligence expansion`).
- Sprint 17.0: AUDIT COMPLETE / DESIGN COMPLETE / REVIEWED / COMPLETE.
- No live connector, network call, credential, raw persistence, media
  processing, evidence interpretation, genealogy, or Sprint 17.2 work exists.

## Existing ingestion reuse

The new boundary is additive:

```text
SourceConnector
  -> SourceAcquisitionResult
  -> SourceAcquisitionIngestionBridge
  -> existing IngestionRequest
  -> existing InputResolver / capability registry
  -> existing normalization / canonical URL / content fingerprint
  -> existing SourceDocument
  -> existing persistent ingestion / provenance / evidence pipeline
```

The bridge does not parse HTML, normalize text, canonicalize URLs, calculate
the existing document fingerprint, persist records, create evidence, or mutate
an EventDossier. The original URL/content ingestion entry points remain
unchanged and available.

## SourceConnector contract

`SourceConnector` exposes one validated `ConnectorCapability` and one
framework-neutral asynchronous `acquire` operation. The operation receives a
typed acquisition request plus an optional cooperative cancellation context
and returns a typed success or failure.

It cannot calculate evidence confidence, create claims, classify truth,
interpret politics, assess source reliability, or persist data. Core code has
no React, DOM, MapLibre, provider SDK, Axios, SQLite adapter, filesystem,
browser storage, or Node networking dependency.

## Connector identity

The closed, additive identity taxonomy is `web`, `rss`, `official-document`,
`youtube`, `reddit`, `x`, `telegram`, and `user-submitted`. Sprint 17.1
implements only a deterministic fixture implementing the `web` contract; the
other identifiers do not register or imply live implementations.

Enum membership never implies runtime availability. Availability requires a
registered connector instance whose validated capability ID and declared
content kinds match the strict request. Connector/locator pairs are closed:
`web` requires a Web locator and `user-submitted` requires a user-submitted
locator; vocabulary without a typed locator is rejected until a future Sprint
adds that contract explicitly.

Connector version is explicit capability metadata. Connector ID/version and
runtime request/acquisition IDs are operational provenance, not source truth or
reliability.

## ConnectorCapability

The minimal strict capability contains:

- connector ID and version;
- supported content kinds;
- credential requirement descriptor;
- pagination support (`none`, `cursor`, or `page`);
- incremental-fetch support;
- canonical-locator support; and
- timestamp support.

No speculative platform-specific capability bag exists.

## Content kinds

The contract recognizes `text`, `html`, `document`, `image`, `audio`, and
`video`. Only inline `text` and `html` are accepted by the Sprint 17.1 bridge.
The remaining enum values reserve stable vocabulary; they do not implement
binary retrieval, PDF parsing, OCR, transcription, frame extraction, or media
storage.

## SourceLocator

`SourceLocator` is a strict discriminated union rather than a URL-only string
or arbitrary metadata object:

- `web`: an HTTP(S) URL;
- `user-submitted`: a stable submission ID.

The first fixture uses Web locators. Future Sprints can add typed platform
locator variants without changing the acquisition result shape. The current
bridge returns a structured unsupported-locator outcome for a non-Web locator
because existing normalization requires a canonical/source URL.

## CredentialRequirement

The descriptor allows `none`, `api-key`, `oauth`, or `user-session`. It records
only a requirement kind. Strict schemas reject API keys, tokens, refresh
tokens, passwords, cookies, authorization headers, credential objects, and
unknown fields.

## SourceAccessPolicy

The request carries one descriptor: `public-only`,
`authenticated-explicit-consent`, or `prohibited`. This is a future runtime
enforcement input, not a network security implementation. The fixture returns
access-denied for prohibited access; it does not inspect robots rules, resolve
DNS, pin egress, follow redirects, rate-limit traffic, or access an account.

## SourceAcquisitionRequest

The strict request contains request ID, connector ID, typed locator, optional
requested content kind, and access policy. It contains no evidence demand,
briefing intent, hypothesis, political filter, personal context, LLM prompt,
credential value, page-token bag, or provider metadata.

## SourceAcquisitionResult

A success carries connector/locator identity, optional canonical locator,
semantic source identity, runtime acquisition identity/time, a bounded
transient inline-text representation, `RawArtifactReference`, and minimal trace
metadata.

A privacy-minimized failure carries connector, locator, request ID, retryable
posture, safe reason code, and one outcome:

- `unsupported`
- `access-denied`
- `authentication-required`
- `rate-limited`
- `unavailable`
- `cancelled`
- `failed`

It has no exception, stack, headers, cookies, tokens, raw credential object, or
arbitrary debug metadata.

## RawArtifactReference

The opaque reference contains artifact ID, semantic source identity, content
kind, media type, SHA-256 content hash, and byte length. It is deliberately not
a `SourceDocument`, does not contain normalized fields, and has no filesystem,
SQLite, S3, or provider-specific location. Sprint 17.1 does not persist raw
bytes or define retention/deletion.

## Raw versus normalized separation

Acquired content and its raw reference are acquisition facts. They are not
Evidence and are not normalized documents. Only the bridge's projected
`IngestionRequest` enters the existing adaptive pipeline; only that pipeline
may produce a validated `SourceDocument`.

## Ingestion bridge

`SourceAcquisitionIngestionBridge` validates a success, accepts only current
text/HTML Web acquisitions, and projects content, media type, canonical source
URL, acquisition time, and optional existing ingestion hints into the existing
`IngestionRequest`.

Its separate provenance projection retains connector ID/version, request and
acquisition IDs, semantic source identity, and raw artifact ID for a future
application/persistence integration. It does not change the existing ingestion
or persistence schema.

## Provenance and identity

The acquisition result preserves connector ID, locator, canonical locator,
acquisition time, connector version, request ID, acquisition ID, source
identity, raw artifact ID, content hash, media type, and byte length.

`createSourceIdentity` hashes only the normalized locator semantic value.
Tracking parameters, request IDs, acquisition IDs, and timestamps do not alter
source identity. Raw artifact identity combines source identity and content
hash, while acquisition identity describes one runtime attempt.

## Privacy and cancellation

All public objects are strict. No arbitrary metadata or secret-bearing field is
accepted. Cancellation follows the existing framework-neutral behavioral
convention `isCancellationRequested()` and does not expose `AbortController`,
DOM, browser, or transport types.

## Deterministic fake connector

`FixtureSourceConnector` provides fixed offline text and HTML targets plus
unsupported, authentication-required, prohibited, content-kind mismatch, and
cancelled outcomes. Its time is injected with a deterministic default. It uses
no fetch, socket, SDK, credential, timer, filesystem, or persistence service.

## Validation and tests

Strict Zod contracts validate locator discriminants, connector identity,
capability, credential requirement, access policy, request, success/failure,
inline content, trace, and raw artifact reference. Tests cover unknown-key and
secret rejection, forbidden evidence/reliability fields, semantic identity,
raw/normalized separation, every fixture path, bridge provenance, existing
text/HTML ingestion, and direct-ingestion regression.

- New test files: 2
- New tests: 45
- Final suite: 77 test files / 791 tests
- skipped/only/todo: 0
- Typecheck and Web production build: PASS
- Full audit: existing development-toolchain moderate 5, fix unavailable
- Production audit: 0 vulnerabilities
- Package/dependency changes: none
- Migration changes: none; SQLite remains v2

## Sprint 17.2 handoff

Sprint 17.2 should design and implement the production safety foundation before
any live network connector:

1. raw artifact storage lifecycle, encryption, retention, redaction, deletion,
   access control, and audit;
2. resolver-aware DNS/IP validation, connection pinning, redirect and egress
   policy;
3. credential-reference resolution and connector-scoped least privilege;
4. access-policy enforcement, rate limits, robots/platform policy, and safe
   operational trace retention; and
5. application orchestration that retains acquisition provenance when invoking
   existing persistent ingestion.

Sprint 17.2 is not started by this delivery.

## Known limitations

- The bridge currently accepts only inline text/HTML with a Web locator.
- Raw artifact references are in-memory values and do not prove durable
  retention.
- Only fixture behavior exists; no production connector is registered.
- Connector capability is descriptive; production policy enforcement is
  absent.
- No pagination/cursor or incremental-fetch request is implemented.
- Source genealogy and reliability remain future layers.

## Out of scope

Live HTTP, RSS fetching, official-document download, YouTube/X/Telegram/Reddit
APIs, OAuth, real credentials, raw byte persistence, PDF/media processing,
OCR, transcript/frame alignment, evidence or reliability logic, genealogy,
network security, scheduler, database migration, Web UI, Sprint 17.2, commit,
push, and tag are excluded.
