# Contract Compatibility Matrix

| Producer | Consumer | Required compatibility | Stop behavior |
|---|---|---|---|
| Ingestion | Persistence | SourceDocument, canonical URL, content fingerprint | ingestion/storage failure |
| Persistence | Dossier/Context | ID, identity, fingerprint, revision | missing/broken reference |
| Dossier | Context | statement IDs and evidence roles | invalid dossier not stored |
| Question | BriefingContract | question ID, explicit context, intent/status | clarification/unsupported |
| Contract | RetrievalPlan | ready status, scope, budgets, policies | stop before provider |
| RetrievalPlan | ContextPackage | plan ID, references, budgets | partial/insufficient/none |
| Context | Generation request | context fingerprint and closed allowlist | no provider on blocking context |
| Proposal | Hydrator | local keys and allowlisted references | proposal/repair failure |
| Hydrator | Plan validator | contract/context IDs and fingerprints | invalid/insufficient plan |
| Validated plan | Script compiler | validated status and identities | no script/failure |
| Script compiler | Script validator | evidence-bound draft | invalid/insufficient/static-only |
| Validated script | Future renderer | validated/static-only status | reject drafts |

Shared enums and conditional requirements are runtime-validated. Optional
references become mandatory only when a selected visual or epistemic behavior
requires them; semantic validators enforce those relationships.
