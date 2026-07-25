# Pre-Renderer Readiness Matrix

| Renderer input concern | Source contract | Script guarantee | Validation gate | Status |
|---|---|---|---|---|
| Identity | question, contract, context, plan IDs/fingerprints | exact copied references | mismatch is invalid | Ready |
| Scene sequence | ordered plan sections/steps | opening, grouped scenes, closing | order, DAG, maximumScenes | Ready |
| Evidence | plan evidence bindings | SceneContentBinding | plan/context/excerpt/provenance closure | Ready |
| Citation | context provenance | SceneCitationCue | cue stays inside scene bindings | Ready |
| Map | allowed intent + locations | semantic CameraIntent/overlay | bound locations and safe viewport | Ready |
| Chart | quantitative context | ChartIntent | bound DataPoint required | Ready |
| Document | SourceDocument + excerpt | DocumentIntent | bound document and excerpt required | Ready |
| Epistemics | plan epistemic policy | narration requirements | attribution/citation/uncertainty preserved | Ready |
| Playback | presentation preference | user-initiated controls | no autoplay; composer focus pauses | Ready |
| Layout | fixed product policy | bottom composer + safe viewport | mandatory literals and checks | Ready |
| Accessibility | preference/contract | captions, keyboard, labels, static fallback | mandatory policy | Ready |
| Motion | semantic visual intent | semantic camera action only | static none; reduced minimal/none | Ready |
| Failure | upstream status/outcomes | no validated script on invalid input | structured stop | Ready |
| Persistence | future repository port | in-process validated aggregate | no Milestone 02 migration | Non-blocking debt |

Sprint 13 may translate validated intents into renderer instructions. It must
not change evidence references, weaken static/reduced-motion behavior, generate
final answers, or accept a draft/invalid script.
