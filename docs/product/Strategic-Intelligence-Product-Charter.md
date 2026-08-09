# Strategic Intelligence Product Charter

## Authority and purpose

This Charter defines the product identity and durable decision principles for
World News AI. Future roadmap, architecture, discovery, evidence, analysis,
scenario, and presentation work must remain consistent with it. Sprint
documents may define delivery scope but must not silently redefine the product.

World News AI is not primarily a globe news viewer, news summarizer,
mainstream-media aggregation feed, or an attempt to indiscriminately collect
all information on Earth.

Its primary purpose is:

> A Korea-centered strategic intelligence system that identifies domestic and
> international developments relevant to South Korea, selectively gathers the
> information needed to understand them, reconstructs evidence from primary and
> raw sources where possible, and connects those findings into a broader,
> revisable strategic model.

The globe, briefing player, My Lens, future War Room, search, and similar
surfaces are downstream presentation and navigation layers over the
intelligence system.

## Korea relevance

Korea relevance is a first-class future prioritization concept. It must not be
reduced to the presence of the word “Korea.” Direct and multi-hop pathways may
involve:

- national security, diplomacy, alliances, and regional balance;
- China, the United States, Japan, North Korea, and other consequential actors;
- semiconductors, strategic technology, trade, and supply chains;
- energy, shipping, logistics, currency, and financial conditions;
- major Korean companies, industries, regulation, and sanctions;
- domestic political or institutional effects and social/economic spillovers.

Future systems should identify explicit impact paths, for example:

```text
Middle East disruption
→ energy prices
→ Korean import costs
→ trade balance
→ KRW
→ industry and household impact
```

Korea relevance prioritizes investigation; it does not predetermine truth,
risk, value, or a recommended response.

## Articles are discovery signals

**News articles are discovery signals, not automatic ground truth.**

When an article identifies a potentially important event, the preferred
investigation flow is:

1. extract its factual claims;
2. identify cited institutions, documents, data, and speakers;
3. trace toward the original material;
4. retrieve primary sources or underlying data where reasonably available;
5. map claims to evidence;
6. seek contradiction and independent corroboration; and
7. retain the article as attributed narrative or contextual evidence.

The following depth model guides acquisition but is not an absolute ranking:

- L0 — tip or social signal;
- L1 — news report;
- L2 — specialist analysis;
- L3 — primary source; and
- L4 — underlying raw dataset.

L0–L2 sources must not be discarded automatically. They may contain unique
leads, observations, or attributed claims that initiate deeper investigation.

## Raw, primary, and secondary sources

- **Raw data:** statistics, measurements, market/trade/logistics datasets, and
  structured records.
- **Primary source:** laws, regulations, court decisions, government records,
  corporate filings, official transcripts, speeches, original audio/video, and
  first-party releases.
- **Secondary source:** news reporting, commentary, research interpretation,
  and media analysis.

World News AI should seek primary or raw evidence whenever reasonably
available. A secondary claim without retrievable primary support remains an
attributed claim; it must not silently become a confirmed fact.

Media organizations are one source class, not privileged truth authorities.
Government, corporate, and institutional sources are likewise not
automatically true. Every source contributes claims or evidence with explicit
provenance. Future dossier quality may report media dependency and primary
source coverage.

## Independent analytical dimensions

The following concepts must never collapse into one score:

- statement or epistemic posture;
- hypothesis strength;
- source reliability;
- evidence strength;
- political or ideological posture;
- editorial extremity;
- value assessment;
- risk;
- Korea impact; and
- personal impact.

High-reliability conservative and progressive sources must both remain
possible, as must low-reliability sources of either posture. Political
agreement with the user must never increase evidence reliability, and political
disagreement must never reduce it. User values may influence downstream value
or risk interpretation, never upstream truth determination.

## Ideological and editorial posture

Future source analysis may use multiple uncertain, evidence-backed dimensions
rather than a universal left/right label, including:

- market-oriented ↔ state-directed;
- liberal-democratic ↔ authoritarian;
- progressive ↔ conservative;
- internationalist ↔ nationalist;
- accommodation-oriented ↔ security-hawkish; and
- institutional ↔ anti-establishment.

Country-specific context is mandatory. Political systems must not be forced
into a US-style left/right model.

Extremity must not be inferred merely from unpopular views. Relevant observable
behaviors include repeated fact/opinion collapse, source distortion,
headline/source mismatch, unsupported factual certainty, absent correction
practice, misleading repost independence, and systematic exclusion of contrary
evidence.

## Source posture and quarantine

Future source handling may use a posture such as:

- **CORE:** may contribute normally, subject to evidence verification;
- **CAUTION:** usable with explicit reliability or editorial warnings; and
- **QUARANTINED:** normally cannot independently establish a factual claim but
  may serve as a discovery sensor or weak-signal lead.

A quarantined source alleging a document does not confirm the document. It may
trigger origin tracing; an independently authenticated primary document can
then become evidence on its own merits.

## Cross-perspective retrieval

Politically contested or strategically important events should be investigated
across relevant information ecosystems: primary/official, conservative,
progressive, institutional/centrist where meaningful, international,
regional/local-language, specialist/domain, and datasets.

The goal is not artificial ideological balance. It is to detect shared facts,
disputed facts, framing differences, omitted evidence, and source-specific
narratives. Evidence may legitimately support an asymmetric conclusion; false
equivalence is forbidden.

## Macro frame as falsifiable hypothesis

The product may retain an evolving macro strategic model covering topics such
as US–China competition, technology blocs, supply chains, regional military
balance, alliances, financial conditions, and Korean industrial exposure.

The Macro Frame is a hypothesis model, not a conclusion generator. New evidence
must be classifiable as:

- SUPPORTS;
- CONTRADICTS;
- COMPLICATES;
- UNRELATED; or
- UNKNOWN.

The system must be able to revise or reject an existing interpretation. Search
or retrieval designed only to confirm the prior frame is forbidden.

## Coverage, gaps, and genealogy

Analysis must ask both “What evidence did we find?” and “What evidence should
exist that we have not found?” Relevant gaps include missing primary documents,
local-language evidence, contrary views, datasets, regional perspectives, and
independent origins. Coverage is orthogonal to confidence; a high-confidence
finding may still have incomplete coverage.

One hundred reports are not one hundred independent pieces of evidence. Future
genealogy must track original publication, wire redistribution, quotation
chains, translations, reposts, and derivative commentary. Independence is
assessed through provenance, never article count.

## AI resource priority

Premium reasoning and tool capacity should be prioritized approximately as:

1. event and Korea-relevance discovery;
2. origin tracing;
3. primary/raw source retrieval;
4. Korea impact-path analysis;
5. gap detection;
6. contradiction and corroboration;
7. source posture and interest analysis;
8. competing hypotheses;
9. scenarios and early warning; and
10. final prose summarization.

The system should spend comparatively less premium capacity on cosmetic
summary generation than on finding, tracing, and verifying information.

## Globe and presentation role

The globe is an **Intelligence Navigator**. It may visualize events, countries,
actors, evidence, source origins, impact paths, scenarios, and early-warning
indicators. It is not the primary product ontology, and intelligence
architecture must not be redesigned merely to fit the globe UI.

Globe, Briefing, Search, My Lens, Council, and War Room experiences consume the
validated intelligence foundation; they do not become semantic authority.

## Lawful and authorized acquisition

“Hidden,” “ignored,” “under-covered,” and long-tail information means material
available through lawful, public, or explicitly authorized acquisition. World
News AI must not bypass authentication, evade access controls, compromise
systems, or acquire private data without authorization. Its objective is better
discovery of difficult-to-find but legitimately accessible information.

## Roadmap consequences

The intended logical dependency flow is:

```text
Safe Acquisition
→ Durable Raw Layer
→ Live Source Connectors
→ Source Discovery / Origin Tracing
→ Multilingual / Long-tail Collection
→ Source Genealogy
→ Coverage Gap Detection
→ Evidence Verification
→ Competing Hypotheses
→ Korea Impact Graph
→ Council / Red Team
→ Scenarios
→ Early Warning
→ War Room
```

Globe, Briefing, Search, and My Lens remain downstream presentation surfaces.
This flow does not assign or renumber Sprints; later roadmap design determines
delivery placement while preserving these dependencies.

## Decision test

Future work is consistent with this Charter only if it preserves all of the
following:

1. Korea relevance guides selective prioritization through direct and indirect
   impact paths.
2. Articles remain discovery signals and attributed evidence, not automatic
   truth.
3. Primary/raw evidence is pursued without treating institutional origin as a
   guarantee of truth.
4. Reliability, ideology, extremity, evidence, value, risk, and impact remain
   separate.
5. Macro interpretations are falsifiable and contradiction-seeking.
6. Coverage gaps and source genealogy are explicit.
7. Acquisition remains lawful, public, or authorized.
8. Presentation layers remain downstream of the intelligence ontology.
