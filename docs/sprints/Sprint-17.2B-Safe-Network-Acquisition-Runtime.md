# Sprint 17.2B — Safe Network Acquisition Runtime

## Status

**Sprint 17.2B overall: IN PROGRESS**

**Sprint 17.2B-1: IMPLEMENTED / REVIEWED / COMPLETE**

## 17.2B-1 scope

This increment establishes only the pre-acquisition authorization, target
security, DNS/IP validation, approved-target capability, and concrete Node
pinned-transport proof. It does not implement a complete response acquisition
runtime.

Baseline: `256a72333e0d102caebf0b0cc50304bab80f4f4b`
(`feat: add raw source governance boundaries`). Sprint 17.2A is complete with
79 test files, 845 tests, zero full/production audit findings, PostCSS 8.5.26,
nanoid 3.3.18, and SQLite schema v2.

## Threat model and invariant

The defended threats are SSRF to private/special-use destinations, DNS
rebinding and mixed public/private answers, URL parser ambiguity, credential or
consent bypass, connection-pool reuse, implicit post-approval DNS, TLS SNI or
hostname-verification loss, and a connected peer differing from the approved
address.

The non-negotiable invariant is:

> The address approved by the egress security layer is the address actually
> connected to. Any difference fails closed.

Resolving and validating a hostname followed by an ordinary request to the
original URL is forbidden because the runtime could resolve it again.

## Pre-acquisition authorization

`SourceAcquisitionAuthorizer` uses a separate acquisition input and decision;
it does not fabricate `RawArtifactReference` and does not add an `acquire`
operation to `RawArtifactOperation`. A shared pure
`authorizeCredentialAndConsent` primitive now owns prohibited-source,
explicit-consent, credential requirement, connector mismatch, availability
missing/unavailable, and availability-denied decisions. The existing
`RawArtifactPolicyEvaluator` retains its identity, lifecycle, operation order,
status, and reason-code behavior while using the same primitive.

Inputs reuse `SourceAccessPolicy`, `CredentialRequirement`,
`CredentialReference`, `CredentialReferenceAvailability`,
`SourceAccountAccessConsent`, and `SourceConnectorId`. Strict schemas reject
unknown and secret-bearing fields. No credential value or resolver is added.

## URL and IP policy

Only HTTP port 80 and HTTPS port 443 are admitted. Unsupported schemes,
userinfo, malformed/empty hostnames, invalid ports, custom ports, ambiguous
targets, and unsafe direct IP literals are denied. Node URL normalization occurs
before IP classification, covering runtime-supported hexadecimal, abbreviated,
octal-like, and IPv4-mapped IPv6 forms.

The deterministic classifier admits only public global-unicast destinations.
It rejects IPv4 unspecified/special-use, loopback, RFC1918, link-local, CGNAT,
benchmark/documentation, multicast, and reserved ranges. IPv6 unspecified,
loopback, ULA, link-local, multicast, documentation, transition/special-use,
and mapped unsafe IPv4 destinations are rejected.

## DNS and ApprovedEgressTarget

`DnsResolver` isolates resolution; `NodeDnsResolver` is the production built-in
adapter and tests use deterministic fakes. Every returned address is classified.
An empty/failing result is denied, an all-unsafe result is denied, and any mixed
public/unsafe set is denied in full. A deterministic public address is selected
only when the complete answer set is safe.

`ApprovedEgressTarget` is an immutable, runtime-registered capability containing
scheme, normalized original hostname, effective port, path/query required for
the request, pinned IP/family, and an approval fingerprint. It contains no
credential, header, response, or arbitrary metadata. Callers cannot construct a
transport-authoritative object through an exported constructor; the transport
also checks runtime membership before use.

## Concrete Node pinned-transport proof

`NodePinnedTransport` uses `http.request`/`https.request` with the original
hostname as authority, a custom lookup callback returning only the selected
pinned address, `agent:false`, and a post-connect `remoteAddress` equality
check. Node 24 `{ all:true }` lookup calls receive a one-element list containing
only the approved IP; no fallback resolver is reachable.

HTTPS additionally fixes `servername` to the original hostname and explicitly
keeps `rejectUnauthorized:true`. It does not override Node's secure default
`checkServerIdentity`. A deterministic local CA/server fixture proves successful
trusted hostname validation and observed SNI, while a trusted certificate used
with the wrong hostname is rejected. The test trust root exists only in the
test request and no production trust or verification setting is weakened.

`agent:false` creates one-request connection isolation, preventing a pooled
socket from bypassing target approval. Both IPv4 and IPv4-mapped peer forms are
normalized before exact equality; absent or different peers fail closed.

## Explicit exclusions

17.2B-1 does not implement redirects, redirect loops, retries, rate or
concurrency limiting, full response streaming/body bounds, production
cancellation, durable raw persistence, repositories, migrations, secrets,
OAuth, live connectors, real news acquisition, media processing, evidence,
reliability, genealogy, Web UI, or LLM behavior. It performs no external network
test and adds no dependency.

## Remaining work

17.2B-2 must add redirect-by-redirect reauthorization and re-resolution,
bounded retry policy, rate/concurrency gates, cancellation/deadline behavior,
and safe failure mapping into the Sprint 17.1 outcome taxonomy without reusing
an approval across a changed authority.

17.2B-3 must add bounded streaming response acquisition, content-type/size
limits, decompression safeguards, privacy-minimized attempt audit, connector
runtime integration, and deterministic end-to-end failure tests. Durable raw
storage remains Sprint 17.2C.

## Validation

- New test files: 5
- New tests: 110
- Targeted security/governance/connector suite: 9 files / 209 tests passed
- Full suite: 84 files / 955 tests passed
- skipped/only/todo: 0
- Typecheck and Web production build: passed
- Full and production npm audits: 0 vulnerabilities
- External network tests: 0
- Package/dependency changes: none
- Migration changes: none; SQLite remains v2
