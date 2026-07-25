# Motion Planner v0

Motion Planner v0 converts semantic CameraIntent plus current renderer state
into at most one camera segment. Its output is deterministic and renderer-only.

Inputs include current/target camera, viewport insets, playback speed,
animation and camera policies, reduced-motion state, and scene timing.
Distance uses a deterministic great-circle calculation. Normal duration is:

```text
clamp((700 + sqrt(distanceKm) × 32 + zoomDelta × 180) × speedFactor,
      650, 4200)
```

Reduced motion uses a short `ease` transition clamped to 250–900 ms. Static,
disabled animation, disallowed motion, hold-current-view, and no-camera-motion
produce no segments. Long-distance movement remains a single bounded
overview-aware segment in v0; route waypoints are deferred.

Safe viewport insets are copied into every instruction. Invalid or unresolved
targets produce structured errors; coordinates are never silently replaced
with `(0, 0)`.
