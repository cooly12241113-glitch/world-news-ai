# Sprint 14.2 — Follow-up Classification and Fixture Replan

## Delivery status

**IMPLEMENTED**

## Baseline

- Branch: `main`
- Baseline commit: `8f8fc3bb8534a5483ec643f03b2951d1668ca7d5`
- Prior delivery: Sprint 14.0 design and Sprint 14.1 implementation complete
- Regression baseline: 55 test files, 522 tests
- SQLite migration version: 2

## Goal

Classify bounded Korean and English follow-up requests deterministically, then
prepare validated fixture-only answer or Script replacement results that can be
applied through the existing Sprint 14.1 reducer.

## Implemented scope

- Strict `FollowUpRequest` and identity-only `FollowUpContext`
- NFC and whitespace normalization, control-character and length limits
- Seven `ReplanScope` values and ordered deterministic classification
- Explicit unsupported, ambiguity, compound-request, and fallback handling
- Allowlisted `FollowUpAnswerPlan` without generated prose
- Strict `ReplanRequest` and five-outcome `ReplanResult`
- Eight injected synthetic fixture scenarios, including safe failure rollback
- Existing `BriefingScriptValidator` replacement gate
- Evidence continuity assessment and five existing scene mapping strategies
- Session integration through existing `REPLAN_COMPLETED`/`REPLAN_FAILED`
  commands, including stale operation and fingerprint protection
- Privacy-minimized replan audit metadata

## Classification precedence

1. Unsupported safety or policy action
2. Ambiguous referent or target
3. Explicit full rebuild
4. Explicit remaining-scene replacement
5. Explicit append
6. Explicit current-scene revision
7. Current-context source/evidence answer
8. Clarification fallback

Requests matching more than one content scope return
`clarification-required`; the classifier does not invent a compound replan.

## Fixture boundary

Fixture scenarios are injected into `FixtureReplanAdapter`. Production code
contains no real event, country, or publisher-specific scenario. Fixture
metadata explicitly marks all scenarios as synthetic test data.

The adapter performs no retrieval or generation. A replacement is returned
only after the existing Script validator verifies Contract, Context Package,
Plan, scene, evidence, visual, and policy constraints.

## Evidence and privacy

Current-context answers can reference only captured allowlist IDs. Unknown IDs
and unsupported confirmed-fact promotion are rejected. Continuity records
preserved, removed, added, invalidated, and unresolved IDs without copying
source excerpts.

Fingerprints use normalized content hashes and semantic metadata. Audit records
exclude raw follow-up text, user questions, excerpts, prompts, provider
responses, reasoning, secrets, OS commands, and browser contents.

## Excluded scope

- React or Composer UI
- live OpenAI or other provider calls
- real search, retrieval, ingestion, or replanning
- backend API or SQLite persistence
- timer-based navigation
- renderer-specific coordinates or components

## Planned follow-up

- Sprint 14.3: Web session and UI integration

## References

- [Sprint 14 design](Sprint-14-Interactive-Briefing-Session.md)
- [Sprint 14.1 delivery](Sprint-14.1-Briefing-Session-Domain.md)
- [Follow-up and replanning contract](../architecture/Follow-up-and-Replanning-Contract.md)
- [Implementation matrix](../architecture/Sprint-14-Implementation-Matrix.md)
