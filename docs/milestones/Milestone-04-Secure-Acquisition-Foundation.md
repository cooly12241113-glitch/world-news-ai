# Milestone 04 — Secure Acquisition Foundation

## Status

**IMPLEMENTED / REVIEWED / COMPLETE**

Sprint 17.1, 17.2A, 17.2B, and 17.2C are complete. Sprint 17.3 is
**NOT STARTED**.

## Delivered boundary

Milestone 04 establishes one production arbitrary-URL acquisition path:

```text
URL
→ SafeNetworkAcquisitionRuntime
→ one bounded validated acquisition result
→ ProductionAcquisitionOrchestrator
   ├→ optional governed RawArtifact persistence
   └→ SourceAcquisitionIngestionBridge
      → materialized-content IngestionPipeline
      → SourceDocument
```

`IngestionPipeline` and `InputResolver` have no network authority. URL-only
input without the safe runtime fails closed with `SAFE_ACQUISITION_REQUIRED`.
The orchestrator executes the runtime once and does not refetch or re-decode
the body. Exact validated decoded bytes and their SHA-256 are used for optional
raw persistence, while the existing bridge supplies materialized UTF-8 text to
normalization.

Raw persistence is separately governed and optional. A denied or failed raw
write cannot create a BLOB, RawArtifact, acquisition occurrence, or persistence
success audit. Normalized ingestion remains lifecycle-independent, and the
combined result reports a bounded persistence-stage partial failure rather
than hiding the requested persistence failure.

## Security and lineage invariants

- Authorization, URL validation, DNS/IP safety, target approval, pinning,
  bounded redirects/retries, headers, body, decompression, MIME, charset,
  cancellation, and deadlines remain owned by the safe runtime.
- Only `pinned-transport.ts` and `response-head-transport.ts` have broad
  low-level network authority.
- `ip-classifier.ts`, `url-validator.ts`, and `ingestion/url-policy.ts` may
  import only the named `isIP` symbol from `node:net` or `net`.
- An AST architecture guard rejects fetch references, module-object access,
  aliases, dynamic imports, require calls, socket modules, and common direct
  HTTP clients outside the exact allowlist.
- Retry attempts and redirect hops remain network lifecycle events and never
  become acquisition occurrences.
- One logical successful acquisition produces one acquisition identity and at
  most one new occurrence.
- `RawArtifactId`, acquisition identity, content hash, governance identity,
  and `SourceDocumentId` remain distinct.
- Raw deletion, expiry, legal hold, and tombstones do not implicitly alter a
  normalized SourceDocument.
- Transport metadata, credentials, native errors, queries, fragments, and raw
  response headers do not cross audit or persistence privacy boundaries.

## Q5 validation

- Targeted integrated gate: 35 test files / 528 tests passed
- Full suite: 99 test files / 1,168 tests passed
- skipped/only/todo: 0
- Typecheck: passed
- Web production build: passed; the existing large-chunk warning remains
- Full dependency audit: 0 vulnerabilities
- Production dependency audit: 0 vulnerabilities
- External Internet calls in tests: 0
- Dependency changes: none
- SQLite migration: schema v3, unchanged by the Milestone repair
- Findings: BLOCKER 0 / HIGH 0 / MEDIUM 0 / LOW 0

## Next boundary

Sprint 17.3 may implement the first live Web/RSS connectors only through this
safe acquisition composition. Initial acquisition remains intentionally
UTF-8-only. HTML, RSS/Atom MIME, gzip/deflate/Brotli, redirects, retries,
rate/concurrency controls, and optional governed raw persistence are supported
foundation capabilities; connector-specific scheduling, parsing, and live
registration belong to Sprint 17.3.
