# ADR-009: Contract-Driven Evidence Context

- Status: Accepted
- Date: 2026-07-24

## Context

Sprint 08 defines what a briefing may cover. The next boundary must select
stored evidence without turning retrieval into answer generation or hiding
missing evidence.

## Decision

Compile each ready contract into a deterministic `RetrievalPlan`. Candidate
providers expose normalized evidence records without leaking database
technology. A repository-backed provider reads EventDossiers and combines them
with strictly validated caller records; an in-memory implementation supports
tests and composition.

Candidates receive normalized lexical and metadata scores in `[0,1]`. Stable
ties prefer primary sources, newer revisions, publication time, then record ID.
Selection deduplicates record/fingerprint/canonical identities, caps source and
document concentration, and reserves capacity for primary, contradicting, and
quantitative evidence.

Only source-backed sentences or paragraphs become excerpts. Offsets, precision,
hashes, record references, selection reasons, and provenance are retained.
Budgets cap characters, items, documents, excerpts, sections, and sources.

Missing required coverage creates explicit gaps and one of `partial`,
`insufficient-evidence`, or `no-relevant-context`; the builder does not invent
content. Package fingerprints exclude IDs, timestamps, and provider order.

## Persistence decision

SQLite remains migration version 2. Existing repositories already provide
EventDossier snapshots, while not all Claim/Evidence/DataPoint/Entity records
are independently persisted. Sprint 09 therefore uses explicit caller records
through a strict provider boundary rather than adding incomplete tables. A
future complete knowledge-store migration can implement the same provider.

## Consequences

- Downstream ExplanationPlan generation receives bounded, auditable context.
- Discovery agents can consume suggested gap queries later.
- Lexical retrieval is transparent but less capable than future semantic
  retrieval; the provider/scorer boundaries permit replacement.
