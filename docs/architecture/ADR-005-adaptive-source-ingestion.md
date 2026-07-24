# ADR-005: Adaptive Source Ingestion Core

- Status: Accepted
- Date: 2026-07-24
- Decision owners: ChatGPT (CTO), Codex (Developer)

## Context

World News AI must ingest many public document structures without coupling its
core to a publisher, hostname, government, CSS selector, discovery engine, or
fixed source list. Sprint 04 established `SourceDocument`, but did not define
how unknown URL or content inputs become validated documents.

## Decision

Build a deterministic, capability-based ingestion pipeline:

```text
IngestionRequest → InputResolver → ContentProbe → CapabilityRegistry
→ Extraction → Normalization → Classification → Fingerprint
→ Validation → SourceDocument
```

Discovery and ingestion are separate responsibilities. A future discovery
adapter supplies an `IngestionRequest`; it does not choose parsers or modify the
pipeline.

### Capability selection

Capabilities report support, a numeric score, and reasons. The registry chooses
deterministically by:

1. highest match score;
2. highest explicit priority;
3. lexicographically smallest stable capability ID.

The registry contains no source names or hostnames. Sprint 05 registers generic
HTML and plain-text capabilities. JSON, XML, RSS, and Atom are detected but have
no processor yet.

### Uncertainty

Extraction produces candidates with confidence and evidence. Hints are
additional candidates, not unconditional overrides. Conflicts are warnings.
Document classification below the configured threshold fails with
`CLASSIFICATION_UNCERTAIN`; the pipeline does not fabricate a document type.

### Provenance and errors

Results include candidate-selection evidence, capability evaluations, fetch
attempts, redirects, warnings, classification confidence, validation outcome,
and completed stages. Full source bodies are not copied into trace entries.

Failures use structured error codes, stage, retryability, safe cause names, and
bounded context. Raw response bodies and credentials are excluded.

### URL security

Only HTTP(S) URLs without credentials are accepted. Literal loopback, private,
link-local, carrier-grade NAT, multicast, and metadata endpoints are rejected.
Every redirect destination is revalidated. Timeout, response-size, redirect,
and retry limits are configurable.

Hostname resolution is deliberately separated from URL syntax policy. A future
resolver-aware transport must validate every resolved address and pin the
connection to mitigate DNS rebinding. The current policy must not be described
as complete DNS-rebinding protection.

### HTML dependency

Use `cheerio` for deterministic server-side HTML parsing and CSS-selector-based
semantic traversal.

Reasons:

- no browser or JavaScript execution;
- small conceptual surface for static HTML;
- maintained parser stack with TypeScript support;
- avoids fragile regular-expression parsing;
- supports generic metadata and semantic DOM extraction.

Cost: a parser dependency and its transitive packages are added to the runtime.
No Puppeteer, Playwright, Selenium, OCR, crawler, or LLM dependency is added.

## Compatibility

Sprint 00–04 domain models and schemas are unchanged. Mapping creates a valid
Sprint 04 `SourceDocument` and leaves relationship arrays empty because entity,
topic, and event extraction are out of scope.

## Consequences

- New handlers can be registered without changing the pipeline.
- Identical inputs select identical capabilities and produce deterministic
  fingerprints.
- Plain text needs sufficient hints to satisfy required SourceDocument fields.
- JavaScript-rendered pages, authenticated pages, PDFs, and binary formats are
  unsupported.
