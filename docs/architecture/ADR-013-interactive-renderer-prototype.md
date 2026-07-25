# ADR-013: Interactive Renderer Prototype

- Status: Accepted
- Date: 2026-07-25

## Decision

Use React 19 and Vite 8 in `apps/web`, with MapLibre GL JS behind a local
`MapRendererAdapter`. React state and reducers are sufficient; no routing,
global state library, CSS framework, chart library, or animation framework is
introduced.

React gives explicit component/state boundaries and accessible semantic UI.
Vite provides a small browser build boundary without migrating the core
repository. MapLibre is open-source, key-optional, and adapter-compatible.

The Web layer consumes `src/script/web-contracts.ts`, a browser-safe public
entry that excludes Node-only compilers and fingerprints. Coordinates, pixels,
duration, easing, CSS, MapLibre types, and environment configuration remain in
`apps/web`.

All demos are runtime-schema-validated fixtures. Actual provider, ingestion,
authentication, persistence, and production tile decisions remain excluded.
