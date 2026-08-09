# End-to-End Data Flow

Sprint 14.3B's fixture-only follow-up branch is implemented, browser accepted,
and final complete. Live GPT/search, backend persistence, true append, and a
browser failure fixture remain outside this flow.

The Interactive Briefing Milestone 02 audit and user-operated Chrome acceptance
are complete. This is the fixture-only Sprint 10–14 baseline; no live
GPT/search/backend integration is implied.

```mermaid
flowchart TD
  PA["Pre-acquisition authorization"] --> UV["URL validation"]
  UV --> RG["Pre-DNS connector + origin rate gate"]
  RG --> TV["Deadline/cancel-bound complete DNS/IP validation"]
  TV --> ET["ApprovedEgressTarget"]
  ET --> CG["Post-approval network concurrency lease"]
  CG --> PT["Fresh pinned GET + peer equality"]
  PT --> RH["Bounded response head only"]
  RH -->|redirect / bounded retry| PA
  RH -. "17.2B-3 body integration pending" .-> C["SourceConnector"]
  C --> AQ["Validated Acquisition Result"]
  AQ -. "future governed raw operation" .-> G["Raw Governance Policy Evaluation"]
  AQ --> B["Acquisition-to-Ingestion Bridge"]
  B --> S["IngestionRequest / Direct Source Input"]
  S --> I["Adaptive Ingestion"]
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
  EC -->|ready / partial| GP["Structured Generation Boundary"]
  EC -->|insufficient / none| ES["Structured stop"]
  GP --> EP["ExplanationPlan Proposal + Hydration"]
  EP --> EV["ExplanationPlan Validator"]
  EV -->|valid / warnings| VP["ValidatedExplanationPlan"]
  EV -->|invalid / insufficient| ES["Structured stop"]
  VP --> SC["BriefingScript Compiler"]
  SC --> SV["BriefingScript Validator"]
  SV -->|valid / static-only| VS["ValidatedBriefingScript"]
  SV -->|invalid / insufficient| ES
  VS --> WA["Web Presentation Adapter"]
  VS --> BS["BriefingSession + Deterministic Reducer"]
  BS --> FU["Deterministic Follow-up Classifier"]
  FU --> RA["Injected Fixture Replan Adapter"]
  RA --> AO["Follow-up Outcome Orchestrator"]
  AO --> AA["Atomic Session / Script / Presentation Application"]
  AA --> UI["Outcome View Model + AnalysisPanel"]
  RA --> FO["Follow-up Outcome Orchestrator"]
  FO -->|resolved / completed / failed command| BS
  BS -->|explicit session command| BP
  WA --> BP["Briefing Player + Scene Dispatcher"]
  BP --> F["Map / Chart / Document / Evidence Surface"]
```

## Provenance chain

```text
BriefingScene
→ SceneContentBinding
→ ExplanationPlan EvidenceBinding
→ ContextItem
→ SourceExcerpt + ProvenanceRecord
→ SourceDocument / dossier statement / claim / evidence / data
→ source fingerprint + document/dossier revision + capability observation
→ fixed original input or stored record
```

Every selected item must have an excerpt and matching provenance record.
Missing links fail package validation. SourceDocument excerpt text must be
present in its summary/body source.

## Failure semantics

- Every network attempt receives fresh authorization, DNS/IP approval, and an
  isolated pinned connection; redirects and retries never reuse approval.
- Rate quota is consumed before DNS and bounded bucket state fails closed;
  network concurrency is acquired only after target approval.
- A combined-only compatibility gate conservatively holds one active lease
  from pre-DNS admission through response-head completion.
- The overall deadline detaches lifecycle progress from non-abortable DNS;
  late resolver completion is ignored and cannot produce approval or transport.
- Cancellation and finite attempt/overall deadlines stop before the next
  security-sensitive step, while admission leases cover only active attempts.
- Response heads are bounded and privacy-minimized lifecycle failures map into
  the Sprint 17.1 outcome taxonomy; response bodies remain deferred to 17.2B-3.
- Ingestion never returns an invalid SourceDocument.
- Persistence transactions roll back partial writes.
- Dossier validation rejects broken references and invalid classifications.
- Ambiguous/personalized questions stop before retrieval.
- Context never promotes missing evidence to ready and never generates filler.
- Generation treats evidence as data, allows only closed-world references, and
  never promotes an invalid proposal to a validated plan.
- Script compilation never returns a draft as renderer-ready and enforces the
  contract scene budget, evidence closure, static fallback, and accessibility.
- Follow-up and replan results retain operation/start fingerprints; stale or
  mismatched results cannot replace the active Session.
- Same-ID scene changes are detected by semantic fingerprint, and Web
  replacement is committed only after Session, Script, presentation, cursor,
  and surface identities agree.
- Invalid evidence or replacement identity returns a structured failure and
  preserves the prior Script and cursor.
