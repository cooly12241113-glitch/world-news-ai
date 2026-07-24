# World News AI

AI-powered world news analysis platform built around an Event-Centric
Architecture.

## Project status

- Sprint 0 complete
- Sprint 1 complete
- Sprint 2 complete
- Sprint 3 complete
- Sprint 4 domain expansion implemented
- Sprint 5 adaptive source ingestion core implemented
- Sprint 6 persistent ingestion and deduplication implemented
- Sprint 7 evidence-first event dossier core implemented
- Sprint 8 question intent and briefing contract implemented

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

## Adaptive ingestion

Sprint 05 adds a source-agnostic pipeline for public HTTP(S) URLs and raw text:

```text
IngestionRequest → Resolve → Probe → Select capability → Extract
→ Normalize → Classify → Fingerprint → Validate → SourceDocument
```

Generic static HTML and plain text are processed. JSON, XML, RSS, and Atom are
detected for future capabilities. The registry selects handlers by score,
priority, then stable ID and contains no publisher-specific rules.

See [ADR-005](docs/architecture/ADR-005-adaptive-source-ingestion.md) and
[Sprint-05](docs/sprints/Sprint-05.md).

## Validation

Public domain inputs have strict Zod schemas. Schemas reject unknown fields,
invalid enum values, duplicate relationship IDs, `null` optional values, and
invalid URL or timestamp formats. Validation does not coerce or normalize data.

## Development

Requires Node.js 24 or newer. Sprint 06 uses the built-in `node:sqlite` API.

```bash
npm install
npm run typecheck
npm run test
npm run validate
```

Developed with ChatGPT (CTO) and Codex (Developer).

## Persistent ingestion

Sprint 06 adds storage-independent repository ports plus In-Memory and durable
SQLite adapters. Exact fingerprints are idempotent, changed content at the same
canonical URL becomes a revision, and every successful ingestion attempt keeps
an observation.

```ts
import { IngestionPipeline } from "./src/ingestion";
import {
  PersistentIngestionService,
  SqlitePersistenceAdapter,
} from "./src/persistence";

const storage = new SqlitePersistenceAdapter("./data/world-news-ai.sqlite");
const service = new PersistentIngestionService(
  new IngestionPipeline(),
  storage,
);
```

See [ADR-006](docs/architecture/ADR-006-persistent-ingestion-storage.md),
[Persistence Architecture](docs/architecture/Persistence-Architecture.md), and
[Sprint-06](docs/sprints/Sprint-06.md).

## Event dossiers

Sprint 07 adds deterministic, evidence-linked Event dossiers with classified
statements, confidence metrics, contradictions, completeness, open questions,
and semantic revisions. See [ADR-007](docs/architecture/ADR-007-evidence-first-event-dossier.md),
[Event Dossier Architecture](docs/architecture/Event-Dossier-Architecture.md),
and [Sprint-07](docs/sprints/Sprint-07.md).

## Question-driven briefings

Sprint 08 validates Korean/English questions, classifies primary and secondary
intents, handles ambiguity explicitly, and compiles a deterministic,
evidence-first `BriefingContract` before future retrieval or generation.

See [ADR-008](docs/architecture/ADR-008-question-intent-briefing-contract.md),
[Question Briefing Architecture](docs/architecture/Question-Briefing-Architecture.md),
and [Sprint-08](docs/sprints/Sprint-08.md).
