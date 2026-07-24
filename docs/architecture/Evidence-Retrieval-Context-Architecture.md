# Evidence Retrieval & Context Architecture

## Contract-driven retrieval

`RetrievalPlanner` derives terms, target IDs, scope filters, required sections,
evidence categories, and budgets from both the question and ready contract.
Question text alone cannot broaden the contract.

## Providers and scoring

`EvidenceCandidateProvider` hides storage details. The in-memory provider
normalizes caller records; the repository-backed provider adds dossier
statements resolved by event or dossier ID.

The deterministic scorer combines exact phrase/title/body overlap with event,
entity, geography, domain, evidence quality, freshness, and language signals.
No publisher, hostname, country, or event is hardcoded.

## Diversity, excerpts, and budget

Fingerprint, canonical identity, and stable record identity remove duplicates.
Source/document caps prevent a single publisher or revision family from
dominating. Primary, contradicting, and data records receive reserved slots.

Excerpt extraction selects an existing sentence or paragraph with the strongest
lexical overlap. It never writes a sentence absent from the source. Character
offset precision, truncation warnings, hashes, and record provenance remain
available to downstream citation.

## Package and evidence gaps

The package separates direct, current, background, supporting, contradicting,
timeline, quantitative, open-question, and verification-signal sections.
Coverage considers required sections, primary sources, independent documents,
contradictions, quantitative data, timeline, and personalization—not raw item
count alone.

Gaps include a type, importance, affected records, blocking status, reasons,
and a suggested query. A future Discovery Agent may execute that query; Sprint
09 only records it. A future ExplanationPlan generator consumes the validated
package and must preserve provenance.

## Security and privacy

Caller records pass strict schemas. Raw HTML, credentials, arbitrary URL query
data, and inferred personal attributes are not accepted into context models.
Provider failures are structured and do not expose database error details.
