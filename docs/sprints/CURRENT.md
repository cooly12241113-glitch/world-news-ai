# Current Project Status

## Project

World News AI

## Current Sprint

Sprint-04 — SourceDocument Domain

**Status:** Implementation complete, pending review

## Current objective

Expand the Article-centric source model with `SourceDocument`, `Claim`,
`DataPoint`, and `EvidenceLink` while preserving the Sprint-03 contracts and
Event-Centric Architecture.

## Completed

- Sprint 0
- Sprint 1
- Sprint 2 TypeScript domain contracts
- Sprint 3 Zod runtime validation and contract tests
- Sprint 4 source-document domain types
- Sprint 4 runtime validation
- Sprint 4 unit and compatibility tests
- ADR-004 and README update

## Compatibility

- Existing `Source`, `Article`, and `Event` contracts are unchanged.
- Existing Sprint-03 validation remains public and unchanged.
- `SourceDocument.eventIds` connects new documents to existing events.
- No collector, database, API, AI extraction, or UI was implemented.

## Required validation

```bash
npm run validate
git diff --check
```
