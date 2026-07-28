# System Architecture Baseline

## Module inventory

| Module | Role | Input → Output | Direct dependencies | Persistence | Extension point | Not implemented |
|---|---|---|---|---|---|---|
| `domain` | Pure event/evidence contracts and URL identity policy | typed records → typed records | none | no | additive domain types | storage, HTTP, UI, LLM |
| `validation` | Runtime domain boundary | unknown → validated domain record | domain, Zod | no | new schemas | normalization |
| `ingestion` | Adaptive source conversion | URL/raw content → SourceDocument | domain, validation, Cheerio, injected fetch | no | capability registry, fetch port | discovery, scheduling |
| `persistence` | Durable ingestion lifecycle | ingestion request → stored/duplicate/revision | ingestion, validation, `node:sqlite` adapter | memory/SQLite | repository/UoW ports | knowledge graph store |
| `dossier` | Evidence assessment aggregate | event + referenced records → revision | domain, validation | memory/SQLite | repository/UoW ports | prose generation, NLP contradiction |
| `briefing` | Question scope contract | BriefingQuestion → intent + contract | Zod, crypto | port only | analyzer/session ports | LLM analysis, rendering |
| `context` | Evidence selection | ready contract + records → context package | domain, dossier port, briefing, Zod | port only | candidate/package ports, scorer | search/discovery, generation |
| `explanation` | Evidence-grounded generation plan | contract + context package → validated plan | briefing, context, Zod | port only | generator/repository ports | prose, LLM, renderer |
| `generation` | Untrusted structured provider boundary | question + contract + context → validated plan + audit | briefing, context, explanation, Zod; OpenAI SDK in adapter only | port only | provider/audit/cache ports | final prose, tools, live-by-default calls |
| `script` | Renderer-neutral briefing sequence | validated plan + contract + context + preference → validated script | briefing, context, explanation, Zod | port only | compiler/repository ports | UI, map SDK, motion timing, final prose |
| `session` | UI-independent briefing lifecycle | Script identity + command → session transition | script preference contract, Zod, crypto | memory port only | repository/effect adapters | React, MapLibre, live replan, SQLite |
| `follow-up` | Bounded deterministic follow-up classification | request + captured identity context → replan decision | briefing fingerprint, script preference, Zod | none | classifier policy | LLM, retrieval, prose |
| `replan` | Fixture-only answer/replacement preparation | decision + injected synthetic fixture → validated result | follow-up, session, script validator, Zod | none | ReplanAdapter port | live replan, network, SQLite |
| `application/follow-up` | Follow-up execution and outcome orchestration | session + request + adapter → validated application outcome | session, follow-up, replan, script fingerprint, Zod | none | orchestrator dependencies | React, HTTP, storage |
| `apps/web` | Fixture-only interactive renderer | validated script → browser presentation | React, Vite, MapLibre; browser-safe script contracts | none | map adapter, location catalog, surfaces | backend, live generation, auth |
| `integration` | Baseline verification | fixed fixtures → pipeline assertions | public module contracts | memory | scenario fixtures | external services |

## Dependency direction

```mermaid
flowchart LR
  D["domain"] --> V["validation"]
  D --> I["ingestion"]
  V --> I
  I --> P["persistence"]
  D --> E["dossier"]
  V --> E
  D --> B["briefing"]
  V --> B
  B --> C["context"]
  D --> C
  E --> C
```

Infrastructure libraries remain at adapter/boundary modules:

- Cheerio: generic HTML ingestion capability only.
- `node:sqlite`: SQLite persistence adapters and migrations only.
- Zod: runtime boundaries.
- No LLM SDK, UI framework, vector database, or network client dependency.

## Public contracts

Module `index.ts` files export their public contracts and services:

- Domain: Source, Article, Event, Entity, Topic, Analysis, SourceDocument,
  Claim, EvidenceLink, DataPoint, and shared URL identity/sanitization policy.
- Dossier: EventDossier, statements, confidence, completeness, revisions.
- Briefing: BriefingQuestion, intent analysis, BriefingContract and schemas.
- Context: RetrievalPlan, EvidenceCandidate, SourceExcerpt,
  EvidenceContextPackage, coverage, gaps, providers, and schemas.
- Explanation: plan draft/validated boundaries, sections, steps, bindings,
  epistemic/visual policies, validator, generator port, and rule assembler.
- Script: presentation preferences, scenes, content bindings, semantic visual
  and camera intents, playback/interaction/accessibility policies, compiler,
  validator, coverage, and fingerprints.
- Session: BriefingSession lifecycle, strict commands/events, deterministic
  reducer, semantic fingerprints, audit metadata, and repository port.
- Follow-up/Replan: normalized requests, bounded context allowlists,
  deterministic decisions, fixture-only results, continuity, and mapping.
- Application Follow-up: ordered execution, append budget, normal resolution,
  stale isolation, rollback, strict outcomes, and UI-action projections.

## Port and adapter boundaries

- Ingestion receives fetch through resolver options and extraction through
  capability registration.
- Persistence and dossier application services depend on repository/UoW ports.
- Context depends on `EvidenceCandidateProvider`, not SQLite.
- Future AI analysis implements `QuestionIntentAnalyzer`.
- ExplanationPlan consumes BriefingContract + EvidenceContextPackage.
- Future structured generators must return the same draft schema and pass the
  same validator.
- BriefingScript consumes only a validated plan, contract, context package, and
  presentation preference; future motion and renderer adapters consume the
  validated script without changing its evidence scope.
- BriefingSession owns lifecycle and semantic interaction state. The Web player
  retains renderer/playback state.
- Follow-up classification never enters the reducer. Replan adapters prepare
  results; only validated results cross the existing reducer command boundary.
- The outcome orchestrator coordinates effects but does not own domain
  classification, replacement validation, rendering, or persistence.

## Invalid dependency rules

Domain must not import infrastructure or application modules. Dossier and
briefing must not depend on UI/LLM providers. Context must not perform answer
generation or unrestricted retrieval. Renderers must not rewrite evidence or
contract scope. Session must not depend on React, DOM, MapLibre, network, LLM,
SQLite, browser storage, clocks, random generators, or timers. Follow-up and
replan modules preserve the same boundary.
