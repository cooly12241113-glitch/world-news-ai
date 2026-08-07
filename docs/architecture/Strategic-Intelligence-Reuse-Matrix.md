# Strategic Intelligence Reuse Matrix

## Status

**AUDITED FOR REUSE — NO IMPLEMENTATION AUTHORIZED**

| Existing contract/module | Evidence | Decision | Strategic use | Prohibited duplication |
| --- | --- | --- | --- | --- |
| `Source`, `SourceDocument` | `src/domain/source.ts`, `source-document.ts` | REUSE | normalized source identity and text | a second normalized document model |
| Ingestion pipeline/capabilities | `src/ingestion/*` | EXTEND | normalize connector acquisitions through existing capability selection | connector-specific parsing in strategic services |
| Persistent ingestion | `src/persistence/*` | EXTEND | exact dedupe, observations, document revisions, UoW | a parallel document/job repository |
| `Claim`, `EvidenceLink`, `DataPoint` | `src/domain/*` | REUSE | evidence graph primitives | council-specific evidence types |
| `EventDossier` and revisions | `src/dossier/*` | REUSE | event evidence aggregate, contradictions, open questions, change history | a strategic event dossier fork |
| Retrieval planning/context | `src/context/*` | EXTEND | closed evidence packages, provenance, gaps, diversity | unrestricted agent retrieval or copied evidence bodies |
| Epistemic types | `src/dossier/models.ts`, `src/explanation/models.ts` | REUSE | fact/claim/inference/forecast/unknown posture | hypothesis strength or ideology encoded as epistemic type |
| Structured generation port | `src/generation/*` | EXTEND | provider-neutral bounded proposals and audits | provider SDKs inside council/domain code |
| Briefing run orchestration | `src/application/briefing-run/*` | EXTEND | thin stage composition, cancellation, receipts, stale isolation | another runtime state machine |
| Script/Session/follow-up | `src/script`, `src/session`, `src/follow-up`, `src/replan` | REUSE | validated presentation and atomic replacement | War Room as a second semantic owner |
| Personal impact domain | `src/personalization/*` | REUSE | user-relevant exposure and impact projection | strategic scenarios or preparedness stored as personal-impact scenarios |
| Personal scenario conditions | `src/personalization/impact-models.ts` | EXTEND | reuse condition/horizon design lessons | direct reuse as the strategic scenario aggregate |
| Web My Lens | `apps/web/src/features/personalized-impact/*` | REUSE | downstream presentation of validated personal impact | strategic analysis logic in React |

## New bounded aggregates

The audit justifies new contracts for acquisition envelopes and connector
capabilities, raw artifacts, source genealogy, media alignment, verification
records, source reliability assessments, hypotheses, strategic scenarios,
early-warning rules, CouncilStatements, council runs, independence scores, and
preparedness options. Each new aggregate must reference the existing evidence
spine and use strict validation and semantic fingerprints.

## Anti-reimplementation test

Before adding a new type or service, the implementing Sprint must answer:

1. Which existing public contract cannot express the requirement?
2. Why is an additive field or adapter insufficient?
3. Which existing validator remains authoritative?
4. Which IDs and fingerprints prove lineage without copying source content?
5. Which non-merger rule prevents semantic collapse?

