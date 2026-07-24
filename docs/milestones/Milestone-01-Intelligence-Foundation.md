# Milestone 01 — Intelligence Foundation Integration Audit

- Status: Complete
- Audit date: 2026-07-25
- Scope: Sprint 00–09
- Foundation predecessor: `c4ead239ae29f7312f4ee61d847ac959215808aa`
- SQLite migration: 2

## Purpose and product direction

World News AI is an evidence-first world intelligence foundation. A user asks
about an international event; the system determines the question intent,
constrains scope before generation, and prepares a minimal, traceable evidence
package from reporting, official documents, statistics, legal material,
corporate disclosures, and EventDossiers. Future LLM and visual layers must
consume this package rather than inventing their own scope or evidence.

## Sprint 00–09 completion

- Sprint 00–03: Event-centric TypeScript domain and strict validation.
- Sprint 04: SourceDocument, Claim, DataPoint, and EvidenceLink.
- Sprint 05: adaptive HTML/plain-text ingestion.
- Sprint 06: durable ingestion, identity, deduplication, revisions,
  observations, and jobs.
- Sprint 07: evidence-first EventDossier, confidence, completeness,
  contradictions, and revisions.
- Sprint 08: question intent, ambiguity, and BriefingContract.
- Sprint 09: retrieval planning, candidate selection, excerpts, budgets,
  coverage, gaps, and EvidenceContextPackage.

## Integrated pipeline

```text
Source input → Adaptive ingestion → SourceDocument → Persistent ingestion
→ EventDossier → BriefingQuestion → BriefingContract → RetrievalPlan
→ EvidenceContextPackage → future ExplanationPlan
```

The integration suite proves four fixed, offline scenarios:

1. Causal explanation selects source-backed background and preserves the
   ingestion fingerprint/revision chain.
2. Korean economic impact carries geographic/domain scope, quantitative
   requirements, and explicit gaps.
3. Fact verification separates attributed claims, supporting evidence, and
   contradiction without producing a verdict.
4. Ambiguous personalization stops before candidate retrieval.

## Determinism policy

Semantic fingerprints exclude generated IDs, timestamps, repository/provider
order, temporary paths, and object property order. Semantic changes to source
content, revision, policy, selected evidence, excerpt, scope, or corpus revision
change the relevant fingerprint. Ordered sequences remain ordered only when
order itself carries meaning.

## Provenance policy

Every selected ContextItem must resolve to an excerpt and provenance record.
The chain retains record type/ID, SourceDocument ID, canonical identity,
fingerprint, revision, capability, observation time, score, and selection
reason where available. SourceDocument excerpts are selected only from summary
or body text—not titles—and sensitive URL query data is removed.

## Insufficiency policy

The system never fills evidence gaps with generated text. Contract ambiguity
stops retrieval. Context outcomes are ready, partial, insufficient-evidence, or
no-relevant-context, accompanied by typed evidence gaps and suggested future
discovery queries.

## Security and privacy policy

- Network URLs require HTTP(S), reject credentials, localhost, loopback,
  private/link-local IPs, and revalidate redirects.
- Identity retains ordinary query parameters, removes tracking/sensitive
  parameters, strips fragments, and sorts query pairs.
- Logs redact credentials and sensitive query values.
- SQL is parameterized; stored JSON is runtime-validated on read.
- Personalization uses caller-provided fields only and has no buy/sell mode.
- Context excludes raw HTML, full database dumps, credentials, and sensitive
  URL queries.

## Audit findings and fixes

| Finding | Cause | Resolution |
|---|---|---|
| SourceDocument excerpt could select title text absent from body | title and body shared `searchableText` | title remains a scoring field; excerpt source is summary/body |
| Broken ContextItem provenance could pass package shape validation | schema checked fields but not cross-references | read-back schema now verifies item/excerpt/provenance links |
| Claim origin could be removed in fact verification | two-item document cap consumed by source and dossier | bounded cap increased to three to preserve source/dossier/claim |
| Caller location order changed contract fingerprint | semantic sets were serialized as arrays | user/geographic scope lists are canonicalized |
| Package fingerprint relied on corpus revision for document changes | selected provenance revision was not a direct fingerprint input | selected source fingerprint/canonical identity/revision are included |

All are integration defects within existing contracts. No migration or broad
refactor was required.

## Architecture audit summary

- Domain has no SQLite, HTTP, Cheerio, UI, or LLM dependency.
- Ingestion separates resolve, probe, capability selection, extraction,
  normalization, fingerprinting, validation, and mapping.
- Persistence ports and adapters are separate; transactions, races, revisions,
  observations, and read validation are covered.
- Dossiers reference records by ID and preserve statement classifications.
- Briefing and context layers have no LLM or UI dependency.
- Context retrieval selects existing records and never generates conclusions.

## Known non-blocking debt

- DNS rebinding protection requires a production resolver/network policy
  beyond literal-IP checks. Recommended before unrestricted remote ingestion.
- Source/claim/evidence hydration is not yet a complete knowledge-store
  repository; caller records bridge records absent from migration 2.
- Lexical scoring lacks stemming and semantic recall. Keep deterministic
  scoring as fallback when a later semantic adapter is added.
- There is no package persistence adapter or automated retention/privacy
  policy yet.
- The repository has module-level public exports but no package-root facade.

These do not block Sprint 10 because ExplanationPlan consumes the existing
validated package in-process.

## Supported and unsupported scope

Supported: deterministic domain contracts, public HTML/plain text ingestion,
in-memory/SQLite persistence, dossiers, briefing contracts, lexical retrieval,
minimal excerpts, evidence gaps, and provenance.

Unsupported: LLMs, answer generation, web discovery, crawlers/RSS polling,
embeddings/vector databases, semantic reranking, maps/charts/UI, portfolio
calculations, PDF/OCR/video, PWA/mobile, and production penetration testing.

## Sprint 10 entry decision

Entry is approved. Offline end-to-end fixtures pass; contract-to-context
boundaries are stable; provenance, determinism, failure outcomes, and
non-generation behavior are regression-tested; no blocking architecture issue
remains.
