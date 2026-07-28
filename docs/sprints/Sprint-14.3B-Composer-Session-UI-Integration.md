# Sprint 14.3B — Composer, Session & Replan UI Integration

## Delivery status

**IMPLEMENTED / BROWSER ACCEPTED / FINAL COMPLETE**

## Baseline

- Baseline commit: `dc604cbf9fa50599024474b10a6d1a90e6a270cc`
- Prior delivery: Sprint 14.0–14.3A complete
- Regression baseline: 62 test files, 614 tests
- SQLite migration version: 2

## Implemented scope

The existing Bottom Composer now drives the deterministic fixture-only
follow-up pipeline:

```text
Composer
  -> Web session controller
  -> core FollowUp classifier
  -> browser fixture scenario resolver
  -> application outcome orchestrator
  -> atomic Session / Script / presentation application
  -> outcome view model
  -> AnalysisPanel
```

The Web controller owns ephemeral draft, execution status, latest operation,
retry state, current Session, current validated Script, presentation, and safe
outcome view model. `App.tsx` remains the composition root. The existing player
continues to own renderer cursor, playback, motion, and map-conflict UI.

## Safety and behavior

- Runtime IDs and timestamps are injected at the browser adapter boundary.
- Tests inject deterministic runtime values.
- No raw prompt, stack, provider response, or internal object is rendered or
  logged.
- Current-context, clarification, unsupported, failed, and stale outcomes
  preserve the active Script.
- Replacement is committed only after Script, Session, presentation, and scene
  identity checks all pass.
- True append is not simulated with the existing terminal replacement fixture;
  the UI returns structured clarification instead.
- Same-scene replacement refreshes overlays without replaying camera motion.
- Navigation remains manual-only.

## UI outcomes

The renderer-neutral view model supports current-context answer,
replacement-applied, clarification-required, unsupported, failed, and
stale-ignored outcomes. Fixture and simulated replacement labels are explicit.
The Composer supports focus, Escape, Enter, Shift+Enter, length limits,
duplicate-submit prevention, and retry-safe draft handling.

## Excluded

- live OpenAI or search
- backend API or persistence
- database or migration changes
- authentication
- automatic scene progression
- dark-globe or global UI redesign

## Acceptance status

Automated validation, Codex Chrome review, and final user browser acceptance
are complete. The review corrected Session/manual-map synchronization,
current-context uncertainty presentation, Korean acceptance-phrase
classification, Player continuity across atomic Script replacement, semantic
same-scene change accounting, and atomic Impact Path route/marker refresh.

The accepted fixture-only boundary still excludes live GPT/search, true append,
a browser failure fixture, backend persistence, and authentication. The
existing MapLibre bundle-size warning remains non-blocking debt. Dark vector
maps and a 3D globe remain future renderer work.

## References

- [Current status](CURRENT.md)
- [Sprint 14.3A](Sprint-14.3A-Follow-up-Outcome-Orchestrator.md)
- [Session state machine](../architecture/Briefing-Session-State-Machine.md)
- [Follow-up contract](../architecture/Follow-up-and-Replanning-Contract.md)
- [Interactive renderer](../architecture/Interactive-Renderer-Architecture.md)
