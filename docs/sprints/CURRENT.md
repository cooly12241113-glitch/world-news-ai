# Current Project Status

## Project

World News AI

## Current Sprint

Sprint-05 — Adaptive Source Ingestion Core

**Status:** Implementation complete, pending review

## Current objective

Accept URL and raw-content candidates from future discovery systems and convert
supported static HTML or plain text into validated Sprint 04
`SourceDocument` records.

## Completed

- Sprint 00–04 domain and validation work
- Discriminated ingestion request and result contracts
- Injectable URL/content input resolver
- deterministic content probing
- score/priority/stable-ID capability registry
- generic HTML and plain-text capabilities
- candidate-based extraction with evidence
- normalization and configurable document classification
- deterministic SHA-256 fingerprinting
- SourceDocument runtime validation and mapping
- structured errors and ingestion trace
- URL safety, redirect, timeout, retry, and response-size policies
- fixture-based unit and integration tests
- ADR-005, Sprint-05, and README documentation

## Compatibility

- Sprint 00–04 domain and validation contracts are unchanged.
- Mapping uses the existing `SourceDocumentSchema`.
- Entity, Topic, and Event relationship arrays remain empty until later
  extraction stages are implemented.

## Not implemented

- discovery/search/crawling
- source-specific parsing
- JSON/feed processing
- PDF/OCR/video/browser rendering
- AI extraction
- persistence, scheduling, workers, or deployment

## Required validation

```bash
npm run validate
git diff --check
```
