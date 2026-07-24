# Sprint-04 — SourceDocument Domain

## Status

- Owner: Codex
- Scope: Domain layer and architecture
- Depends on: Sprint-03 runtime validation

## Goal

Extend the article-centric domain with a source-document model that can represent
news, government publications, datasets, transcripts, research, legal material,
and corporate disclosures without breaking the existing Event-centric contracts.

## Deliverables

- `DocumentType`
- `SourceDocument`
- `Claim`
- `DataPoint`
- `EvidenceLink`
- Zod runtime validation for every new public type
- Unit and compatibility tests
- Architecture decision record
- README and project-status updates

## Domain contract

### DocumentType

- `NewsArticle`
- `GovernmentDocument`
- `StatisticalDataset`
- `VideoTranscript`
- `ResearchReport`
- `LegalDocument`
- `CorporateDisclosure`

### SourceDocument

`SourceDocument` identifies its `Source`, records provenance and retrieval
metadata, and links to the existing Entity, Topic, and Event models by ID.
Publication time is optional because some source material has no reliable
publication timestamp. Retrieval time and canonical URL are required.

### Claim

A `Claim` is a statement extracted from one `SourceDocument`. It records
confidence, attribution, related events, and extraction time.

### DataPoint

A `DataPoint` is a named finite number or non-empty string value originating
from one `SourceDocument`. It can include a unit, observation time, entities,
events, and confidence.

### EvidenceLink

An `EvidenceLink` connects a `SourceDocument` to a Claim, DataPoint, Event, or
Analysis with one of four relations: supports, contradicts, contextualizes, or
derived_from. Optional locators and excerpts preserve document-level provenance.

## Compatibility rules

- Do not change or remove any Sprint-03 domain field or schema.
- Keep `Article` as a supported public model.
- Keep `Event.articleIds` unchanged.
- Link new documents to Event through `SourceDocument.eventIds`.
- A news Article can be represented as a SourceDocument through an explicit
  adapter; automatic migration is outside this Sprint.
- Reuse the existing `Source` contract without modification.

## Validation rules

- All object schemas are strict.
- Required arrays must be present and contain no duplicate IDs.
- Optional fields accept omission, not `null`.
- No coercion, defaults, normalization, or transforms.
- All schema output types must equal their TypeScript domain types.

## Out of scope

- Data collectors and crawlers
- Article migration or persistence
- Databases, APIs, and UI
- AI extraction implementation
- Cross-record referential-integrity checks

## Completion criteria

- New types and schemas are barrel-exported.
- Unit and compatibility tests pass.
- Type checking passes.
- Existing Sprint-03 tests pass unchanged.
