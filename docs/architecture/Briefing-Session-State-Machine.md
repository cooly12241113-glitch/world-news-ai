# Briefing Session State Machine

## Status

- Sprint: 14.0 design
- Delivery: **IMPLEMENTED; WEB INTEGRATION BROWSER ACCEPTED / FINAL COMPLETE**
- Baseline: `af50333f857b5f990741fff83176efbad36a250d`

This contract extends the manual-only Sprint 13.1 player. The deterministic
Session owns semantic lifecycle and identity; the Web player retains rendering,
motion, and playback state. Sprint 14.3B synchronizes them through a dedicated
controller rather than duplicating reducer rules in components.

## Current implementation audit

The current Web prototype has no `BriefingSession` aggregate.

- `App.tsx` owns demo selection, Script adaptation, player dispatch, analysis
  panel visibility, viewport inset calculation, scene selection, keyboard
  actions, and all dock/control composition.
- `BriefingPlayerState` owns playback status, scene count/index, speed, motion
  request counters, Composer expansion, and the manual-map conflict flag.
- The current scene ID is derived from `briefing.scenes[currentSceneIndex]`.
  The Script fingerprint remains on `RenderableBriefing` and is passed to the
  Composer only as DOM context; neither is session identity.
- `BottomComposer` owns draft question text locally. Focus/cancel changes the
  player, but there is no submit, follow-up request, or replanning path.
- `AnalysisPanel` owns the selected tab locally and resets it on scene change.
- `MapSurface` owns the adapter reference and asks the adapter for its current
  camera while planning motion. The MapLibre/fake adapters own camera state.
  The reducer stores only `mapConflict`; it stores no viewport snapshot.
- Replay increments `motionRequestId`; `MapSurface` reruns scene motion for the
  same scene. Motion completion never advances the scene.
- `adaptBriefingScript` is the safe replacement boundary: it accepts only a
  validated/static Script, preserves its fingerprint, sorts scenes, and rejects
  non-contiguous scene order.
- `src/script/web-contracts.ts` is the browser-safe public Script entry point.
  `BriefingContract`, `EvidenceContextPackage`, `ExplanationPlan`, and
  `BriefingScript` already carry IDs and semantic fingerprints.

Sprint 14 should move session identity, cursor, Composer lifecycle, manual-map
snapshot, follow-up request token, replacement decision, and rollback metadata
out of `App.tsx` and into a deterministic session reducer. Rendering, map
adapter operations, and follow-up adapters remain effects outside the reducer.

## States

| State | Meaning |
| --- | --- |
| `exploration` | No active presentation; full Composer and Start action are available. |
| `briefing-ready` | A validated Script is bound and the cursor is initialized, but presentation has not started. |
| `presenting-scene` | The current scene is visible and waiting for an explicit command. |
| `scene-motion-running` | Scripted motion for the current scene is running; the scene cannot auto-advance. |
| `manual-map-view` | The user changed the map camera and the manual viewport is authoritative. |
| `composer-open` | Follow-up Composer is open over a preserved scene and viewport. |
| `replanning` | A tokenized follow-up/replan operation is pending while the old briefing stays visible. |
| `closing` | The Script closing scene is visible; completion still requires explicit action. |
| `ended` | Presentation is complete; replay, follow-up, or reset may be offered. |
| `error` | A fatal session/Script failure prevents safe presentation. |

A session factory may initialize `briefing-ready` only after receiving a
validated Script. This is construction, not a navigation command.

## Transition contract

`Same` means the transition records metadata or emits an effect without
changing the named state. “Preserve evidence” always means retaining the
current Contract, Context Package, Plan, Script, and exact reference allowlist.

| Command/event | Allowed source | Destination | Scene index | Viewport | Evidence context | Side effect | Failure handling | Forbidden transition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `START_BRIEFING` | `briefing-ready`, `exploration` with validated Script | `presenting-scene` | Set/keep `0` | Script camera may start only by explicit Start | Preserve | Request scene render; optionally request motion | Missing/invalid Script → `error` | Any other state |
| `NEXT_SCENE` | `presenting-scene`, `scene-motion-running`, `manual-map-view` | `presenting-scene` or `closing` | `+1`, bounded | Target scene camera may replace manual view because navigation is explicit | Preserve | Cancel old motion, render target scene, request motion if applicable | At final/closing scene: reject, audit | Composer, replanning, ended, error |
| `PREVIOUS_SCENE` | `presenting-scene`, `scene-motion-running`, `manual-map-view`, `closing` | `presenting-scene` | `-1`, bounded | Target scene camera may apply | Preserve | Cancel old motion, render target scene, request motion if applicable | At index `0`: reject, audit | Composer, replanning, ended, error |
| `JUMP_TO_SCENE` | `presenting-scene`, `scene-motion-running`, `manual-map-view`, `closing` | `presenting-scene` or `closing` | Set validated target | Target scene camera may apply | Preserve | Cancel old motion, render target, request motion if applicable | Unknown ID/index: reject, audit | Composer, replanning, ended, error |
| `REPLAY_SCENE_MOTION` | `presenting-scene`, `scene-motion-running` | `scene-motion-running` | Unchanged | Script camera replaces current scripted viewport | Preserve | Cancel old motion, increment request token, invoke map adapter | Motion cannot start → return `presenting-scene` with structured warning | Manual view, composer, replanning, closing, ended, error |
| `SCENE_MOTION_STARTED` | `presenting-scene`, `scene-motion-running` | `scene-motion-running` | Unchanged | Motion-owned | Preserve | Record matching motion token | Stale token: ignore and audit | All non-presentation states |
| `SCENE_MOTION_COMPLETED` | `scene-motion-running` | `presenting-scene` | Unchanged | Preserve completed scripted camera | Preserve | Record completion token | Stale token: ignore; adapter failure returns with warning | All other states |
| `USER_MAP_INTERACTION_STARTED` | `presenting-scene`, `scene-motion-running` | `manual-map-view` | Unchanged | Capture and preserve manual snapshot | Preserve | Cancel/ignore scripted motion; request camera snapshot | Snapshot failure retains state with structured warning | Exploration, ready, composer, replanning, closing, ended, error |
| `KEEP_MANUAL_VIEW` | `manual-map-view` | Same | Unchanged | Preserve manual snapshot | Preserve | Clear conflict prompt only | Missing snapshot: reject and offer return action | All other states |
| `RETURN_TO_BRIEFING_CAMERA` | `manual-map-view` | `scene-motion-running` or `presenting-scene` | Unchanged | Restore current scene camera policy | Preserve | Clear manual flag; request tokenized scene motion | Motion failure → `presenting-scene`, preserve manual snapshot for retry | All other states |
| `OPEN_COMPOSER` | `exploration`, `briefing-ready`, `presenting-scene`, `scene-motion-running`, `manual-map-view`, `closing`, `ended` | `composer-open` | Unchanged | Preserve exact snapshot | Preserve | Save return state; pause/cancel motion; expose follow-up context | Missing active context allows exploration question only | Composer, replanning, error |
| `CLOSE_COMPOSER` | `composer-open` | Saved return state | Unchanged | Restore preserved snapshot | Preserve | Discard unsent draft per UI policy | Missing return state → safe `briefing-ready` or `exploration` | All other states |
| `SUBMIT_FOLLOW_UP` | `composer-open` | `replanning` | Unchanged | Preserve | Preserve until validated result | Validate request, classify scope, create request token, invoke fake adapter | Invalid/empty → remain `composer-open`; unsupported/clarification is structured result | All other states |
| `REPLAN_STARTED` | `replanning` | Same | Unchanged | Preserve | Preserve | Record active request ID/fingerprint and lock navigation | Duplicate/stale start: ignore and audit | All other states |
| `REPLAN_COMPLETED` | `replanning` | `presenting-scene`, `manual-map-view`, `closing`, or `ended` | Policy-mapped; never implicit `+1` | Apply replacement policy; otherwise preserve | Old context retained; new context becomes active only atomically | Validate result, check token/fingerprints/allowlist, adapt Script, atomically commit | Stale/invalid result: ignore or treat as failure; never remove old Script | All other states |
| `REPLAN_RESOLVED` | `replanning` | Saved presentation state or `composer-open` | Unchanged | Preserve | Preserve old context | Complete current-context, clarification, or unsupported outcome without replacement | Stale token/fingerprint: ignore and audit | All other states |
| `REPLAN_FAILED` | `replanning` | Saved pre-submit state | Unchanged | Restore preserved snapshot | Preserve old context | Record structured error; expose retry/cancel | Roll back to old briefing; fatal corruption only → `error` | All other states |
| `REPLAY_BRIEFING` | `closing`, `ended` | `presenting-scene` | Set `0` explicitly | Reset to opening scene camera | Preserve active Script context | Clear end state and request opening render/motion | Missing active Script → `error` | Exploration, ready, composer, replanning, error |
| `END_BRIEFING` | `presenting-scene`, `scene-motion-running`, `manual-map-view`, `closing` | `ended` | Unchanged | Preserve for audit/replay until reset | Preserve | Stop motion; display ended controls; append audit record | Already ended: idempotent no-op | Composer, replanning, error |
| `RESET_SESSION` | Any state | `exploration` | Clear to `0` | Clear snapshots | Clear active session context | Cancel active tokens; clear session data; retain external audit sink only | Cleanup failure is audited; UI still returns to exploration | None |

## Global invalid-transition rule

The reducer returns the unchanged state plus a structured rejected-transition
audit record. It never guesses a destination, clamps an unknown scene ID, or
performs an effect for a rejected command.

Navigation is locked during `replanning`. This avoids changing the cursor while
a replacement is being mapped. Composer cancel before submission is allowed;
cancel after submission is represented by ignoring/canceling the request token,
not by mutating the Script.

## Required invariants

1. Scene index changes only through `START_BRIEFING`, `NEXT_SCENE`,
   `PREVIOUS_SCENE`, `JUMP_TO_SCENE`, `REPLAY_BRIEFING`, or an explicitly
   validated `REPLAN_COMPLETED` mapping policy.
2. Timer, camera completion, and overlay completion never change the scene.
3. Composer open/close never changes the current scene.
4. Manual map interaction never changes the current scene.
5. Replay scene motion never changes the current scene.
6. The existing Script and evidence package remain active before and during
   follow-up submission.
7. The old screen is not removed until a validated replacement Script is ready.
8. If a new Script invalidates earlier evidence, the invalidation is explicit
   in the replacement result and UI change summary.
9. An LLM cannot invent `SourceDocument`, `Claim`, `EvidenceLink`, or
   `DataPoint` IDs; all references must be in the exact allowlist.
10. Unsupported evidence cannot be promoted to `confirmed-fact`.
11. Replan failure can always return to the prior briefing state.
12. Random IDs and timestamps do not participate in semantic fingerprints.
13. Normal current-context, clarification, and unsupported outcomes use
    `REPLAN_RESOLVED`; `REPLAN_FAILED` is reserved for failures.

## UI behavior contract

### Exploration

- Show the full Composer and explicit Start briefing action.
- Starting requires a validated Script; there is no autoplay.

### Presenting

- Show Previous, Replay scene motion, Next, scene progress, speed, motion, and
  Ask a question controls.
- Only Previous/Next/Jump/Replay briefing may change the cursor.

### Composer open

- Preserve the current scene, Script fingerprint, evidence context, selected
  analysis tab, and viewport snapshot.
- Display the follow-up context boundary.
- Cancel returns to the exact pre-open state.

### Replanning

- Keep the old scene rendered with a loading indicator and evidence access.
- Lock navigation until completion/failure/cancel is resolved.
- Keep Composer content and active request identity available for retry/audit.

### Replan success

- `answer-current-context` does not replace the Script.
- Replacement results map the current scene by stable scene ID first, then by
  the approved replacement policy. Removed scenes are never silently selected.
- Display added, revised, removed, and evidence-invalidated scene summaries.

### Replan failure

- Keep the old Script, scene, evidence, and viewport.
- Show a structured error with Retry and Cancel.

## Reducer boundary for Sprint 14 implementation

The session reducer owns semantic state and emits declarative effects. It must
not call MapLibre, React, timers, a provider, storage, or the network. `App.tsx`
should become a composition shell around:

- session reducer and selectors;
- presentation adapter;
- map effect bridge and viewport capture;
- fake follow-up/replan adapter;
- existing renderer and controls.
