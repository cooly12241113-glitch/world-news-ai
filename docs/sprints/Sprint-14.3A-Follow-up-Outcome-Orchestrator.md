# Sprint 14.3A — Follow-up Outcome Orchestrator

## Delivery status

**IMPLEMENTED**

## Baseline

- Baseline commit: `be821b17922a8350197dc00fdc10c2bee3ccf0d5`
- Prior delivery: Sprint 14.0–14.2 complete
- Regression baseline: 59 test files, 588 tests
- SQLite migration version: 2

## Goal

Normalize Sprint 14.2 results into strict application outcomes and apply them
through explicit Sprint 14.1 session commands without React or infrastructure.

## Implemented pipeline

```text
Session/request identity validation
  -> SUBMIT_FOLLOW_UP
  -> REPLAN_STARTED
  -> deterministic classification
  -> append budget gate
  -> fixture adapter
  -> result schema/fingerprint/replacement validation
  -> REPLAN_RESOLVED / REPLAN_COMPLETED / REPLAN_FAILED
  -> strict application outcome and UI-action projection
```

## Normal resolution

`REPLAN_RESOLVED` is the twentieth Session command. It handles only:

- `current-context-answer`: restore the saved presentation/manual-map state
- `clarification-required`: return to `composer-open`
- `unsupported`: return to `composer-open`

All three preserve Script identity, scene cursor, viewport, selected analysis
tab, and evidence lineage. They terminate the active operation and do not set a
technical error. `REPLAN_FAILED` is reserved for technical/domain failures.

## Application outcomes

The orchestrator returns one of six strict outcomes:

- `current-context-answer`
- `replacement-applied`
- `clarification-required`
- `unsupported`
- `failed`
- `stale-ignored`

Every outcome contains the resulting validated Session and a renderer-neutral
recommended UI action. No component or CSS is included.

## Append budget policy

Append is allowed only when requested scenes fit the declared maximum. An
over-budget request returns structured clarification and alternatives; it is
never silently converted to replacement or compression.

The Sprint 14.2 bounded fixture is now explicitly labeled a terminal
replacement fixture, not a true append.

## Concurrency, fingerprints, and privacy

Operation ID and the pre-submit Session fingerprint must match the active
operation. Stale results return `stale-ignored` with the input Session
unchanged. Outcome fingerprints include semantic result and transition
metadata, not timestamps, execution IDs, raw text, excerpts, prompts, provider
responses, stack traces, or renderer history.

## Excluded

- React, Composer components, CSS, or `apps/web` changes
- network, retrieval, OpenAI, backend, or SQLite persistence
- timers, automatic navigation, and renderer coordinates

## Next

- Sprint 14.3B: Composer and Session UI integration

## References

- [Sprint 14.1](Sprint-14.1-Briefing-Session-Domain.md)
- [Sprint 14.2](Sprint-14.2-Follow-up-and-Fixture-Replan.md)
- [Session state machine](../architecture/Briefing-Session-State-Machine.md)
- [Follow-up contract](../architecture/Follow-up-and-Replanning-Contract.md)
