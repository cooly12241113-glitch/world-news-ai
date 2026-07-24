# End-to-End Data Flow

```mermaid
flowchart TD
  S["Source Input"] --> I["Adaptive Ingestion"]
  I -->|success| D["SourceDocument"]
  I -->|structured ingestion error| IF["No document stored"]
  D --> P["Persistent Ingestion"]
  P -->|stored / revision / duplicate| R["Stored document, revision, observation"]
  P -->|transaction failure| PF["Rollback + failed job"]
  R --> E["EventDossier"]
  E -->|valid references| Q["BriefingQuestion"]
  E -->|broken evidence/reference| EF["No invalid dossier revision"]
  Q --> A["Question Intent Analysis"]
  A --> C["BriefingContract"]
  C -->|ready| RP["RetrievalPlan"]
  C -->|clarification / unsupported| CF["Stop before retrieval"]
  RP --> CP["Candidate Providers"]
  CP --> SD["Scoring / Deduplication / Diversity"]
  SD --> X["Source-backed Excerpts + Context Budget"]
  X --> EC["EvidenceContextPackage"]
  EC -->|ready / partial / insufficient / none| F["Future ExplanationPlan"]
```

## Provenance chain

```text
ContextItem
→ SourceExcerpt
→ ProvenanceRecord
→ SourceDocument / dossier statement / claim / evidence / data
→ source fingerprint + document/dossier revision + capability observation
→ fixed original input or stored record
```

Every selected item must have an excerpt and matching provenance record.
Missing links fail package validation. SourceDocument excerpt text must be
present in its summary/body source.

## Failure semantics

- Ingestion never returns an invalid SourceDocument.
- Persistence transactions roll back partial writes.
- Dossier validation rejects broken references and invalid classifications.
- Ambiguous/personalized questions stop before retrieval.
- Context never promotes missing evidence to ready and never generates filler.
