# World News AI

AI-powered world news analysis platform built around an Event-Centric
Architecture.

## Project status

- Sprint 0 complete
- Sprint 1 complete
- Sprint 2 complete
- Sprint 3 complete
- Sprint 4 domain expansion implemented

## Domain

The platform organizes reporting and primary-source material around events,
entities, topics, analysis, and evidence.

Existing news contracts remain available:

- `Source`
- `Article`
- `Entity`
- `Topic`
- `Event`
- `Analysis`

Sprint 04 adds a general source-document layer:

- `SourceDocument`
- `Claim`
- `DataPoint`
- `EvidenceLink`

Supported `DocumentType` values:

- `NewsArticle`
- `GovernmentDocument`
- `StatisticalDataset`
- `VideoTranscript`
- `ResearchReport`
- `LegalDocument`
- `CorporateDisclosure`

`Article` and `Event.articleIds` remain unchanged for compatibility.
`SourceDocument.eventIds` connects new document types to the existing
Event-centric graph.

See [ADR-004](docs/architecture/ADR-004-source-document-domain.md) for the
architecture decision and [Sprint-04](docs/sprints/Sprint-04.md) for scope.

## Validation

Public domain inputs have strict Zod schemas. Schemas reject unknown fields,
invalid enum values, duplicate relationship IDs, `null` optional values, and
invalid URL or timestamp formats. Validation does not coerce or normalize data.

## Development

Requires Node.js 20 or newer.

```bash
npm install
npm run typecheck
npm run test
npm run validate
```

Developed with ChatGPT (CTO) and Codex (Developer).
