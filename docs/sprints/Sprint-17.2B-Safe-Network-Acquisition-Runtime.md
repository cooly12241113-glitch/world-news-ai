# Sprint 17.2B — Safe Network Acquisition Runtime

## Status

**Sprint 17.2B overall: IMPLEMENTED / REVIEWED / COMPLETE**

**Sprint 17.2B-1: IMPLEMENTED / REVIEWED / COMPLETE**

**Sprint 17.2B-2: IMPLEMENTED / REVIEWED / COMPLETE**

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

Durable raw storage remains Sprint 17.2C. It must not be introduced into the
network runtime or connector adapter.

## 17.2B-2 safe request lifecycle

Every actual HTTP GET attempt begins from the original acquisition input and
performs fresh credential/consent authorization, fresh URL validation, pre-DNS
rate admission, fresh complete-set DNS/IP validation, creation of a new
`ApprovedEgressTarget`, post-approval network-concurrency admission, and a new
isolated pinned connection. No approval or socket is reused by a retry or
redirect. A concurrency lease is released as soon as the response head is
accepted or the attempt fails.

The built-in gate uses those split phases. A legacy gate exposing only combined
`admit` semantics instead holds one conservative lease continuously from its
pre-DNS admission through DNS, target approval, pinned transport, and response
head. It releases that lease exactly once on every success, failure, redirect,
retry, timeout, or cancellation path; each later attempt obtains a new lease.
This compatibility mode may hold concurrency during DNS but never runs
transport after releasing its permit.

Redirect handling is manual for 301, 302, 303, 307, and 308. Relative locations
are resolved against the current URL, then pass through the complete lifecycle
again. The default hop limit is five, normalized target identity detects loops,
HTTPS-to-HTTP downgrade is denied, and cross-origin redirects receive no
authorization or cookie header forwarding because the runtime accepts no such
headers.

The default lifecycle limits are three attempts per target, a 30-second overall
deadline, a 10-second attempt timeout, 100-millisecond bounded retry backoff,
a 2-second maximum retry delay, and a 16-KiB absolute response-header ceiling.
Runtime policy may lower but never raise that header ceiling. Only DNS,
pinned-transport, timeout, HTTP 429, and HTTP 502/503/504 failures retry. TLS,
peer mismatch, target-policy denial, malformed headers, and cancellation fail
closed without retry. Delta-seconds `Retry-After` is clamped; date forms are not
interpreted. The overall deadline always dominates retry delay and attempt
timeouts. One absolute overall deadline is created at acquisition start and is
never reset; it covers authorization, URL/rate processing, DNS, approval,
concurrency admission, connect/TLS, response head, redirects, and retry delay.
The attempt timeout covers only pinned connect/TLS and response-head wait.

DNS itself is not claimed to be abortable. A reusable async boundary races its
promise against cancellation and the absolute overall deadline. Once either
boundary wins, the lifecycle stops awaiting DNS; late resolution or rejection
is consumed and ignored, cannot reach IP approval or transport, and cannot
become success.

An in-memory admission gate separately enforces connector and normalized-origin
fixed-window rates before DNS and active-network concurrency after target
approval. Rate quota is consumed even if later DNS or transport fails; it is
not refunded. Expired rate buckets are pruned on admission. Connector and
origin bucket maps have validated capacities of 64 and 4,096 by default; when
only active buckets fill capacity, a new key fails closed as
`RATE_LIMIT_STATE_CAPACITY_EXHAUSTED` and maps to `rate-limited` without DNS.
Active buckets are never evicted to create bypassable fresh quota.

The response-head transport
retains only status, Location, Retry-After, Content-Type, and Content-Length,
then destroys the response stream without buffering body bytes. All lifecycle
reasons map explicitly into the authoritative Sprint 17.1 failure outcomes;
public failures omit native errors and remove query/fragment data from Web
locators.

17.2B-2 adds no full-body acquisition, decompression, persistence, migration,
dependency, live connector, external network test, Web, or LLM behavior.

Loop fingerprints normalize percent encodings only for RFC unreserved
characters and normalize hex case for retained encodings. Reserved characters
such as encoded `/` are deliberately not decoded; the finite redirect limit
remains the second defense against other URI-equivalence edge cases.

## 17.2B-2 validation

- New test files: 6 (plus one shared test helper), including the retained
  independent lifecycle security review
- New tests: 70
- Targeted security/governance/connector suite: 15 files / 279 tests passed
- Full suite: 90 files / 1,025 tests passed
- skipped/only/todo: 0
- Typecheck and Web production build: passed
- Full and production npm audits: 0 vulnerabilities
- External network tests: 0
- Package/dependency changes: none
- Migration changes: none; SQLite remains v2

## 17.2B-3 bounded response acquisition

**Sprint 17.2B-3: IMPLEMENTED / REVIEWED / COMPLETE**

The pinned transport now has an explicit full-response API that returns the
validated response head and live body stream without weakening the existing
head-only API. Redirect and retry responses are destroyed without body
buffering. A terminal response is processed while the same split concurrency
lease—or conservative combined-gate lease—remains active through streaming,
decompression, validation, hashing, and terminal result creation. Every exit
releases the lease exactly once.

`Content-Length` is only an early encoded-size rejection hint. Missing length
is allowed, conflicting or malformed lengths fail at the bounded Node parser,
and actual streamed bytes remain authoritative. The operational defaults are
2 MiB encoded and 5 MiB decoded; absolute policy ceilings are 8 MiB encoded and
16 MiB decoded. These are resource-safety defaults, not claims about all future
source sizes. Values must be positive finite integers within those ceilings.
The collector uses Node `pipeline`, preserves stream backpressure, increments
counters before retaining chunks, and stores no more than the decoded limit.

The content-encoding allowlist is `identity`, `gzip`, `deflate`, and `br` using
Node built-ins. Stacked and unknown encodings fail closed. Encoded transport
bytes and decoded output bytes are counted independently; crossing either
limit destroys the response and decompressor, preventing compression bombs.
Decoded bytes are incrementally SHA-256 hashed, and that exact decoded-byte
hash becomes the bounded artifact content hash.

The MIME allowlist is `text/html`, `text/plain`, `application/json`,
`application/xml`, `text/xml`, `application/rss+xml`, and
`application/atom+xml`. MIME comparison is case-insensitive and accepts only a
UTF-8 charset parameter. Missing, malformed, binary, or other MIME values fail
closed without sniffing. `html` requests require HTML; `text` requests accept
the listed non-HTML textual families. Existing inline acquisition and ingestion
support remains limited to text and HTML. Bytes are decoded once with a fatal
UTF-8 decoder; no universal charset transcoder or silent legacy-charset guess
is introduced.

The default body-idle timeout is five seconds, with a 60-second hard policy
ceiling. Each encoded body chunk resets only the idle timer. The one absolute
overall deadline from acquisition start never resets and spans the complete
body and decompression pipeline, so slow trickles cannot extend acquisition.
Cancellation, deadline, idle timeout, size violation, stream error, or zlib
error destroys all pipeline stages and cannot promote partial bytes.

Attempt audit is a caller-injected sink plus a bounded result-attached success
view. Cardinality is bounded by existing redirect/attempt limits. Events contain
only connector, scheme, hostname, port, attempt/hop, safe outcome/reason, safe
MIME, byte counts, and success hash. They contain no body, raw query, Location,
arbitrary headers, credentials, native exception, stack, or socket detail, and
there is no global or durable audit log.

The independent privacy review established a stricter metadata rule: response
header values are never copied directly into audit. Canonical MIME appears only
after successful MIME validation (`Text/HTML; Charset=UTF-8` becomes
`text/html`). Failed or retrying attempts omit `contentType`; malformed,
unsupported, or secret-bearing MIME parameters therefore cannot cross the
audit boundary. Raw Content-Encoding, Retry-After, Location, and charset
parameters are likewise absent.

`SafeRuntimeFixtureConnector` adapts bounded runtime success and existing
failure results into the authoritative Sprint 17.1 `SourceAcquisitionResult`.
Its deterministic tests pass that result through the existing
`SourceAcquisitionIngestionBridge`; no second ingestion path, raw persistence,
live connector, or external network call is introduced.

Body/resource/MIME/encoding/decompression failures are non-retryable and map
explicitly to the existing top-level taxonomy. Cancellation remains
`cancelled`; idle/deadline/stream infrastructure failures are `unavailable`;
unsupported MIME, kind, charset, or encoding are `unsupported`; bounded-size
and decompression integrity failures are `failed`. Native stream/zlib messages
never become public reason codes.

## 17.2B-3 validation

- New test files: 4, including the retained independent body security review
- New tests: 51
- Targeted security/governance/connector suite: 19 files / 330 tests passed
- Full suite: 94 files / 1,076 tests passed
- skipped/only/todo: 0
- Typecheck and Web production build: passed
- Full and production npm audits: 0 vulnerabilities
- External network tests: 0
- Package/dependency changes: none
- Migration changes: none; SQLite remains v2

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
