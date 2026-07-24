# ADR-007: Evidence-First Event Dossier

- Status: Accepted
- Date: 2026-07-24

## Decision

Add `EventDossier` as a separate, UI-independent aggregate referencing existing
Event, SourceDocument, Claim, EvidenceLink, DataPoint, and Entity IDs.

Statements are classified as confirmed fact, attributed claim, interpretation,
inference, forecast, or unknown. Facts require evidence, attributed claims
require Claim IDs, forecasts require assumptions, and unknowns must have low
confidence. Unsupported AI text may only be inference or unknown.

Confidence stores a score, deterministic level, reasons, evidence/source
metrics, contradiction count, assessor, and timestamp. Score bands are
0.00–0.19 very-low, 0.20–0.39 low, 0.40–0.59 medium, 0.60–0.79 high, and
0.80–1.00 very-high.

The deterministic builder validates references, groups evidence, detects only
explicit rule-based contradictions, computes baseline completeness, and emits
warnings. It does not generate prose or infer natural-language opposition.

A semantic fingerprint excludes timestamps and input order. Identical input
returns the current revision; semantic changes create a linked revision and
bounded change set.

Migration 2 adds `event_dossiers` and `dossier_revisions`. In-Memory and SQLite
adapters share repository contracts and validate JSON snapshots on read/write.

## URL identity correction

Sprint 06 removed every query parameter, potentially merging `?id=1` and
`?id=2`. Sprint 07 separates logging sanitization, identity normalization,
sensitive-query redaction, and canonical resolution. Identity retains ordinary
parameters, removes explicit tracking and sensitive parameters, sorts the
remainder, and removes fragments. Logs redact sensitive values.

Existing Sprint 06 rows are not rewritten. Deployments should audit identities
whose query values were previously removed because those values cannot be
reconstructed.
