# ADR-004: Introduce SourceDocument Alongside Article

- Status: Accepted
- Date: 2026-07-24
- Decision owners: ChatGPT (CTO), Codex (Developer)

## Context

The original domain models news input as `Article`. World News AI must also
reason over government documents, statistical datasets, video transcripts,
research reports, legal documents, and corporate disclosures. Replacing
`Article` would break the Sprint-03 public contract and the existing
`Event.articleIds` relationship.

## Decision

Introduce `SourceDocument` as a new, general document contract while retaining
`Article` unchanged.

`SourceDocument` references the existing `Source` through `sourceId` and the
existing Event-centric graph through `eventIds`. It also links to Entity and
Topic by ID. `DocumentType` is a closed union containing the seven types defined
for Sprint-04.

Introduce three evidence-layer records:

- `Claim` captures a sourced statement.
- `DataPoint` captures a sourced finite number or non-empty textual value.
- `EvidenceLink` describes how a source document supports, contradicts,
  contextualizes, or derives a Claim, DataPoint, Event, or Analysis.

Each evidence record stores `sourceDocumentId` directly. This makes provenance
queryable without embedding full objects or introducing persistence concerns
into the domain layer.

## Compatibility

`Article`, `ArticleSchema`, `Event`, and `EventSchema` remain unchanged.
`Event.articleIds` remains the legacy news-article relationship.
`SourceDocument.eventIds` provides the new forward relationship to Event.

News articles may exist in both representations during a future migration. An
explicit adapter can map `Article.fetchedAt` to `SourceDocument.retrievedAt` and
`Article.bodyText` to `SourceDocument.contentText`. This Sprint does not provide
that adapter because it would introduce application-layer behavior.

## Consequences

Benefits:

- New document classes enter the domain without a breaking migration.
- Evidence has document-level provenance.
- Existing Event-centric consumers continue to compile and validate.
- Future collectors can target one general document contract.

Trade-offs:

- `Article` and `SourceDocument` temporarily overlap.
- Event has no `sourceDocumentIds` reverse edge in this Sprint.
- Referential integrity across IDs must be enforced by a later repository or
  application layer.

## Alternatives considered

### Replace Article with SourceDocument

Rejected because it changes existing TypeScript and runtime contracts.

### Add sourceDocumentIds to Event

Rejected for Sprint-04 because required arrays would break existing Event
objects, while optional arrays would weaken the established explicit-array
contract.

### Model Claim and DataPoint as embedded document fields

Rejected because independently addressable records are easier to link,
validate, deduplicate, and reuse as evidence.
