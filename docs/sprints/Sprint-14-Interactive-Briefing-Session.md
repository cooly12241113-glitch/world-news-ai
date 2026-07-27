# Sprint 14 — Interactive Briefing Session

## Delivery status

**DESIGNED / NOT IMPLEMENTED**

Sprint 14.0 defines the Briefing Session and follow-up/replanning architecture.
It does not implement Sprint 14 code.

## Baseline

- Branch: `main`
- Commit: `af50333f857b5f990741fff83176efbad36a250d`
- Prior delivery: Sprint 13.1 complete
- Regression baseline: 51 test files, 484 tests passed
- Navigation: manual only
- Renderer: MapLibre adapter and interactive briefing prototype complete

## Goal

Define a deterministic, auditable session boundary that preserves scene,
viewport, evidence, and Script identity while a user opens the Composer, asks a
follow-up, receives a fixture-based current-context answer, or applies a
partial/full replacement Script.

## Current implementation audit

### Existing flow

```text
Validated BriefingScript fixture
  -> presentation adapter
  -> RenderableBriefing
  -> App-selected scene by player.currentSceneIndex
  -> SceneDispatcher
  -> map or fallback surface
  -> explicit player command
```

- `App.tsx` is the composition root and currently concentrates demo selection,
  adaptation, reducer dispatch, scene selection, panel visibility, viewport
  inset calculation, keyboard behavior, and Composer/playback/closing docks.
- `BriefingPlayerState` and `playerReducer` own playback state, scene index,
  speed, animation, Composer expansion, manual-map conflict, and motion tokens.
- Scene changes are already manual. Timer and motion completion do not advance.
- `BottomComposer` keeps draft text locally. It can focus/cancel but cannot
  submit a follow-up.
- `ClosingControls` exposes replay, follow-up open, and end actions.
- `SceneDispatcher` renders the current scene and delegates map scenes to
  `MapSurface`; it does not own session identity.
- `MapSurface` and `MapRendererAdapter` own runtime camera access. Manual
  interaction reaches the reducer only as a conflict flag; no viewport snapshot
  is stored in application/session state.
- Replay scene motion increments a request counter and reruns motion for the
  same scene.
- `AnalysisPanel` owns selected tab state locally.
- The presentation adapter preserves Script ID/fingerprint and scene IDs, but
  the current reducer does not bind those identities to a session.
- `src/script/web-contracts.ts` is the browser-safe Script contract boundary.
- `BriefingContract`, `EvidenceContextPackage`, `ExplanationPlan`, and
  `BriefingScript` provide the identity/fingerprint lineage required by a
  follow-up context.

### Required extension points

- A session reducer above the existing player semantics.
- A viewport capture/restore bridge at `MapRendererAdapter.getCameraState()`.
- A Composer submit boundary that captures immutable `FollowUpContext`.
- A deterministic classifier and fake follow-up/replan adapter.
- A replacement gate before `adaptBriefingScript` and atomic App state swap.
- Session selectors/components so `App.tsx` no longer orchestrates every state.

## Architecture decisions

1. Session navigation remains manual-only.
2. The reducer is deterministic and effect-free.
3. Follow-up processing is tokenized; stale completion is ignored and audited.
4. Existing Script, context, scene, and viewport remain active until a validated
   replacement is ready.
5. Current-context answers do not replace the Script.
6. Partial/full replacements use an explicit `ScriptReplacementPolicy`.
7. Replanning locks navigation to prevent cursor/replacement races.
8. Sprint 14 implementation uses fixture/fake adapters only: zero network/LLM.
9. Evidence reference IDs remain exact allowlisted references.
10. Audit metadata excludes question/evidence prose by default.

See:

- [Briefing Session State Machine](../architecture/Briefing-Session-State-Machine.md)
- [Follow-up and Replanning Contract](../architecture/Follow-up-and-Replanning-Contract.md)
- [Sprint 14 Implementation Matrix](../architecture/Sprint-14-Implementation-Matrix.md)

## Implementation scope for Sprint 14

### Included

- `BriefingSession` domain
- deterministic session reducer
- follow-up contract
- replan decision contract
- fake follow-up/replan adapter
- current scene/context preservation
- fixture-based partial and full replan
- session transition tests
- UI state connection
- privacy-minimized audit metadata

### Excluded

- live OpenAI calls
- real search
- real ingestion
- backend API
- authentication
- billing
- persistent database
- analytics
- streaming narration
- automatic scene advancement
- Strategic Foresight
- portfolio recommendation
- conspiracy integration page

## Planned implementation sequence

1. Add framework-neutral session/follow-up/replan contracts.
2. Add pure deterministic reducer, selectors, invalid-transition results, and
   audit records.
3. Add fake adapter fixtures for current-context, partial, full, failure, stale,
   clarification, and unsupported outcomes.
4. Add scene replacement mapping and exact evidence allowlist validation.
5. Add viewport capture/restore bridge without leaking MapLibre types.
6. Connect existing Composer, controls, scene dispatcher, analysis tab, and
   closing controls to session state.
7. Split App orchestration into session hook/controller and small effect bridges.
8. Add reducer, adapter, replacement, viewport, and UI integration tests.

This sequence is a future implementation plan. No item is implemented by the
Sprint 14.0 documentation change.

## Acceptance criteria

Sprint 14 implementation is complete only when all criteria are automated and
verifiable:

- The session reducer is deterministic for identical state/command inputs.
- Invalid transitions are rejected with unchanged semantic state.
- Manual-only navigation remains enforced.
- Opening/closing the follow-up Composer preserves scene ID and index.
- Composer open/close preserves the active viewport and evidence context.
- Manual map interaction and Replay scene motion never change the scene.
- A current-context answer does not replace the Script.
- Partial replan preserves completed scenes unless explicit invalidation is
  reported.
- Full replan applies the declared replacement policy.
- Current scene maps by stable scene ID before any fallback policy.
- Removed scenes cannot remain silently selected.
- Stale replan results are ignored and audited.
- Replan failure restores the old Script, scene, viewport, and context.
- Viewport capture, manual-view preservation, and return-to-script policy are
  tested with the fake map adapter.
- `SourceDocument`, `Claim`, `EvidenceLink`, and `DataPoint` references remain
  within the validated allowlist.
- Unsupported evidence cannot be promoted to confirmed fact.
- Replanning UI keeps old evidence accessible and navigation locked.
- Mobile Composer, controls, loading, error, and change-summary layouts pass
  responsive and accessibility checks.
- Session audit metadata contains no question/evidence prose by default.
- All existing Sprint 13.1 regression tests remain passing.
- Network and LLM calls are zero.
- Database migrations are unchanged.

## Required implementation validation

Future Sprint 14 implementation must run:

```text
npm.cmd run typecheck
npm.cmd test
npm.cmd run build:web
npm.cmd audit
```

It must also report test counts, source/package/migration diff, and local/origin
ahead-behind state.

## Completion report format

1. Baseline and final commit
2. Implemented contracts/modules
3. State and command/event counts
4. Replan scopes implemented
5. Tests added and regression counts
6. Included and excluded scope confirmation
7. High risks resolved or remaining
8. Source/package/migration changes
9. Validation results
10. Push and ahead/behind status
