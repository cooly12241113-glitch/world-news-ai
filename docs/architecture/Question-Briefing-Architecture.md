# Question Intent & Briefing Contract Architecture

## Contract before generation

An event dossier describes evidence. A question determines which evidence is
relevant and how it may be explained. `BriefingContract` establishes that
validated boundary before any model generates prose.

## Intent and ambiguity

The baseline recognizes causal explanation, impact analysis, fact verification,
comparison, forecast, personalized impact, situation summary, and exploratory
questions. Korean and English rules score multiple signals and retain
secondary intents. They do not hardcode named events or countries.

Ambiguity is clear, defaults-applied, clarification-required, or unsupported.
Unbound references and personalization without caller context request
clarification. Forecasts without a horizon record the three-month default.

## Standard policy

- Time begins at the intent-appropriate trigger, event, background, current
  state, or caller boundary.
- Geography expands only through explicit locations, connected events, impact
  paths, and the question endpoint, capped at seven.
- Every key statement needs evidence. Primary, independent, and contradicting
  evidence is requested when available.
- Facts and inference remain separate; uncertainty, confidence, forecast
  assumptions, and verification signals are explicit.
- Visuals are recommendations: spatial questions favor maps, supply chains
  map-flow, quantitative questions charts, legal questions documents/timelines,
  verification evidence boards, and personalized questions personalized-impact.
- Personalization is limited to explicit fields and information, exposure, or
  scenario analysis.
- Work stops at six causal steps, seven scenes, the answer/scope boundary, or
  weakening evidence.

## Extension boundaries

Future LLM/human analyzers implement `QuestionIntentAnalyzer` and pass the same
schema. `BriefingSessionRepository` reserves an audit seam. Context Builder,
`ExplanationPlan`, validation, and renderers consume the contract later.
