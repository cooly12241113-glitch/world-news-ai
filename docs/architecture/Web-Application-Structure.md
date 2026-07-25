# Web Application Structure

`apps/web` is a separate DOM/JSX TypeScript boundary extending the strict core
configuration. Vite aliases only the browser-safe Script contracts and Domain
public entry.

```text
apps/web/src
├── app          demo selection and application composition
├── components   composer, playback, caption, analysis, conflict UI
├── fixtures     runtime-validated BriefingScript demos
├── hooks        keyboard and reduced-motion behavior
├── map          ports, MapLibre/fake adapters, catalog, motion, viewport
├── player       state, reducer, playback timing
├── renderer     presentation adapter and scene dispatch
├── surfaces     chart/document/evidence/text prototypes
├── styles       tokens, responsive layout, focus and motion policy
└── tests        browser-environment setup
```

`VITE_MAP_STYLE_URL` is optional public configuration.
`VITE_MAP_DEMO_STYLE_ENABLED=true` enables a prototype OpenStreetMap raster
style with attribution. No secret belongs in a `VITE_` variable. Style failure
shows a retryable map fallback while the rest of the briefing remains usable.

Desktop uses a map-first stage with a contextual right panel. Mobile uses a
full-viewport stage and bottom-sheet panel. Composer, playback controls,
captions, panels, and safe-area values feed semantic viewport insets.
