# Sprint 14.1 — Briefing Session Domain and Deterministic Reducer

## Delivery status

**IMPLEMENTED**

## Baseline

- Branch: `main`
- Baseline commit: `d68c8b69faac2a1f0536333f9798a7870680da54`
- Prior delivery: Sprint 13.1 complete; Sprint 14.0 design complete
- Regression baseline: 51 test files, 484 tests
- SQLite migration version: 2

## Goal

Provide a UI-independent `BriefingSession` aggregate, strict runtime contracts,
deterministic reducer, semantic fingerprint, privacy-minimized audit record,
and repository port with an in-memory adapter.

## Implemented scope

- Ten session lifecycle states and nineteen strict commands
- Explicit navigation, motion ownership, manual map view, Composer,
  follow-up/replanning lifecycle, closing, replay, end, and reset transitions
- Injected timestamps and IDs; no clock or random source inside the reducer
- Optimistic session fingerprint and operation-token stale-result rejection
- Validated replacement identities and deterministic scene mapping
- SHA-256 semantic fingerprints using the existing canonicalization policy
- Strict Zod validation at public and repository boundaries
- Privacy-minimized transition events and audit records
- In-memory repository with optimistic saves, ordered audits, and clone isolation
- Offline unit and integration tests

## Boundaries preserved

`src/session` has no React, DOM, MapLibre, OpenAI, HTTP, SQLite, browser storage,
timer, clock, or random dependency. The existing Web player reducer continues
to own presentation playback and renderer state. This Sprint adds no UI,
Composer submission adapter, real replanning, backend, persistence migration,
search, LLM call, or network call.

## State ownership

- `BriefingSession` owns lifecycle, Script lineage, scene cursor, semantic
  viewport state, Composer state, active operation, and session fingerprint.
- The Web player reducer remains the owner of frame-level playback, motion
  rendering, and renderer-specific UI state.

## Replacement policy

`REPLAN_COMPLETED` accepts only a validated replacement whose previous Script
fingerprint matches the active session. The caller supplies an explicit
preserve, replacement, preceding, opening, or first-new-scene mapping. The
reducer validates that mapping; it does not implement a replan decision engine.

## Fingerprint and audit policy

The semantic fingerprint includes lifecycle state, identity fingerprints,
scene cursor, analysis tab, meaningful viewport/manual state, Composer state,
active operation, and policy version. It excludes session identity, timestamps,
audit IDs, raw question/follow-up text, excerpts, prompts, and provider output.

Audit records contain transition identity and outcome metadata only. They do
not contain raw user or evidence content, secrets, provider payloads, reasoning,
or viewport interaction history.

## Planned follow-up

- Sprint 14.2: fixture-only follow-up and replanning adapter
- Sprint 14.3: Web session/UI integration
- Production persistence, retrieval, and generation remain outside Sprint 14

## References

- [Sprint 14.0 design](Sprint-14-Interactive-Briefing-Session.md)
- [State machine](../architecture/Briefing-Session-State-Machine.md)
- [Follow-up and replanning contract](../architecture/Follow-up-and-Replanning-Contract.md)
- [Implementation matrix](../architecture/Sprint-14-Implementation-Matrix.md)
