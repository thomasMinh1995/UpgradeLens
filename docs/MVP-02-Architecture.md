# MVP-02 — Knowledge Research Architecture

Status: architecture discovery for MVP-02-00. This document defines contracts and boundaries only; it does not specify production code, a prototype, networking implementation, or an AI runtime.

## 1. Architecture Overview

MVP-02 adds an external knowledge boundary after deterministic repository discovery:

```text
Repository
        │
        ▼
Project Discovery (MVP-01)
        │
        ▼
Project Manifest
        │
        ▼
Knowledge Research (MVP-02)
   ┌────┼───────────────┐
   ▼    ▼               ▼
Registry metadata   Official sources   Release metadata
   └────┼───────────────┘
        ▼
Knowledge Store
        │
        ▼
Knowledge Manifest
        │
        ▼
Version Analysis (MVP-03)
        │
        ▼
Impact Analysis (MVP-04)
        │
        ▼
Migration Planning (MVP-05)
```

The sole repository-derived input to MVP-02 is the versioned Project Manifest produced by MVP-01. MVP-02 reads project identifiers, ecosystems, normalized dependency names, declaration types, declared version strings, and relative manifest paths from that artifact. It must validate the Project Manifest before doing any research. An unsupported Project Manifest schema version or structurally invalid manifest is a fatal input error; an individual dependency with incomplete data is a package-level warning.

MVP-02 must not read `package.json`, `requirements.txt`, source files, lockfiles, or any other repository content. Rescanning would create two competing discovery implementations, make later runs dependent on local filesystem state, and break provenance between stages. If later analysis needs a repository fact that the current Project Manifest does not contain, the correct response is to evolve the discovery contract in MVP-01 and version that contract—not to add an implicit scan inside MVP-02.

Knowledge Research first populates a reusable, content-addressed Knowledge Store, then projects the relevant normalized facts into a Knowledge Manifest. The store is an internal implementation detail. The manifest is the portable, deterministic, versioned output consumed by later MVPs. Raw or large upstream responses stay in the store; the manifest retains portable content digests and provenance but never exposes store paths, keys, envelope layout, validators, or storage APIs.

Determinism means that the same Project Manifest, policy configuration, clock, and source snapshots produce the same Knowledge Manifest bytes. Arrays are sorted by stable identifiers, maps use canonical key order, duplicates are merged only by documented identity rules, and asynchronous completion order never affects output. `generatedAt`, upstream publication timestamps, and cache acquisition timestamps are explicit rather than hidden. Transient headers such as request IDs and server dates are excluded. A later online run may legitimately produce a new snapshot when upstream knowledge changes; reproducibility comes from recorded provenance and content digests, not from pretending external data is immutable.

### Research lifecycle

```text
Project Manifest
        │
        ▼
Resolve Packages
        │
        ▼
Resolve Sources
        │
        ▼
Fetch Metadata
        │
        ▼
Normalize
        │
        ▼
Validate
        │
        ▼
Cache in Knowledge Store
        │
        ▼
Assemble Knowledge Manifest
```

The stages have explicit responsibilities:

1. **Resolve Packages** validates the Project Manifest, groups occurrences by registry and normalized identity, and rejects identities that cannot be researched safely.
2. **Resolve Sources** selects registry endpoints and derives typed documentation, repository, and release candidates from explicit metadata. It does not use package-name similarity as evidence.
3. **Fetch Metadata** obtains fresh or conditionally validated source representations under the approved network and retry policy. Offline mode substitutes available store entries and performs no network access.
4. **Normalize** translates source-specific fields into common package, release, source, and trust records while retaining provenance.
5. **Validate** checks normalized records, source relationships, required status/count invariants, and warning consistency before persistence or output.
6. **Cache** writes validated response envelopes atomically to the content-addressed Knowledge Store. Invalid responses may retain sanitized diagnostics but never become successful facts.
7. **Assemble Knowledge Manifest** selects facts relevant to the input Project Manifest, sorts them canonically, adds execution metadata, validates the artifact contract, and writes it atomically.

Package/source resolution, normalization, validation, and manifest assembly are deterministic functions of their declared inputs. Fetching and cache freshness depend on network state, policy, and time; those influences are made explicit through source snapshots and research metadata. Cache lookup must not alter output based on filesystem enumeration order or asynchronous completion order.

## Artifact Ownership

```text
Repository
        │
        ▼
Project Manifest             owned by MVP-01
        │
        ▼
Knowledge Manifest           owned by MVP-02
        │
        ▼
Version Analysis Manifest    owned by MVP-03
        │
        ▼
Impact Analysis Manifest     owned by MVP-04
        │
        ▼
Migration Plan               owned by MVP-05
```

Each artifact is immutable after successful validation and publication. A stage may consume outputs from one or more earlier stages, but it may not modify, repair, or silently enrich them in place. If a later stage needs a missing upstream fact, the owning stage evolves its versioned contract and regenerates a new artifact. The Knowledge Store is owned by MVP-02 but is not a pipeline artifact and is never consumed directly as a contract by MVP-03–05.

Within MVP-02, registry adapters own source-specific translation and error classification, source resolvers own source identification and provenance, the store owns response envelopes and freshness validators, and the manifest writer owns canonical ordering and artifact validation. None owns version conclusions or repository mutation.

## 2. Responsibilities

MVP-02 is responsible for:

- validating and fingerprinting the input Project Manifest;
- deriving one research identity per unique supported package while retaining every project occurrence;
- resolving Node.js packages against the npm Registry and Python packages against PyPI;
- collecting package descriptions, licenses, publisher-provided links, canonical registry URLs, repository URLs, documentation URLs, latest registry-designated versions, and minimal release indexes;
- identifying official release feeds when the repository relationship is sufficiently supported by registry metadata;
- collecting release metadata such as version or tag, publication date, release URL, prerelease/yanked/deprecated indicators, and source provenance;
- recording which fields came from which source and whether that source was fetched, cached, stale, missing, or unavailable;
- maintaining deterministic, conditional, offline-friendly caches;
- producing partial package records and structured warnings when some sources fail;
- writing and validating the Knowledge Manifest atomically.

MVP-02 must not:

- infer the installed version from a version range;
- choose a recommended target version;
- compare current and latest versions;
- interpret semantic-version or PEP 440 compatibility;
- summarize changelogs or decide whether a change is breaking;
- map release changes to repository code;
- produce migration steps, patches, or code transformations;
- modify the Project Manifest or target repository;
- perform AI or LLM reasoning;
- introduce MCP, LangGraph, LangChain, an agent runtime, or a server;
- treat search results or community pages as equivalent to official evidence.

The boundary can be summarized as “collect facts with provenance, but draw no upgrade conclusions.”

## 3. Knowledge Manifest

The Knowledge Manifest is a new contract with its own lifecycle. Its initial `schemaVersion` should be `1.0.0`, independent of Project Manifest schema `2.0.0` and independent of the npm package version. A future JSON Schema should define it, but this architecture task does not implement that schema.

The proposed default artifact is `.upgradelens/knowledge-manifest.json`. The name is an architecture decision for downstream consistency, not a CLI design in this task.

### Knowledge Store versus Knowledge Manifest

The **Knowledge Store** is MVP-02's internal, reusable cache of fetched representations. It is content-addressed, may contain raw or normalized response bodies, and owns HTTP validators, TTL state, atomic storage envelopes, and implementation-specific lookup keys. Store entries are package/source-centric so unchanged external knowledge can be reused across research executions. The store can be discarded and rebuilt; its layout is not a public contract.

The **Knowledge Manifest** is the immutable output for one Project Manifest research execution. It embeds normalized facts needed downstream, package occurrences, source trust and provenance, warnings, portable content digests, and execution/cache summaries. It does not expose absolute paths, internal cache keys, ETags, storage envelope fields, directory layout, or cache APIs. MVP-03–05 consume the manifest, never the Knowledge Store. This boundary allows the store implementation to evolve without changing the manifest schema or downstream consumers.

### Top-level contract

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Knowledge Manifest contract version, initially `1.0.0` |
| `generatedAt` | ISO 8601 UTC time at which the complete manifest was assembled |
| `generator` | `name: UpgradeLens` and the producing package version |
| `input` | Project Manifest schema version, relative artifact name, full artifact SHA-256, and repository identity copied from the input |
| `policy` | Non-secret research policy: online/offline mode, registry bases, TTL policy version, prerelease inclusion policy, and source allowlist version |
| `research` | Execution metadata: research ID, start/completion times, duration, counts, retries, and partial failures |
| `summary` | Counts of input occurrences, unique research packages, resolved/partial/unresolved packages, sources, cache hits, and warnings |
| `packages` | Stable list of researched package records |
| `sources` | Stable source catalog and provenance records referenced by packages/releases |
| `cache` | Portable cache summary: mode, policy version, hit/miss/revalidation/stale counts; no store internals |
| `warnings` | Deterministically sorted non-fatal problems |

The `input.artifactDigest` hashes the exact Project Manifest bytes for provenance. Package cache keys do not use that digest; otherwise a changed `generatedAt` would invalidate unrelated package research. Research keys derive from ecosystem, registry, normalized package identity, resource kind, request representation, and adapter version.

### Package record

Each package record should contain:

- `id`: stable identity such as `npm:react` or `pypi:fastapi`;
- `ecosystem`: `node` or `python` in MVP-02;
- `status`: `resolved`, `partial`, `notFound`, `invalid`, or `unavailable`;
- `identity`: declared names observed, normalized registry name, registry type, registry base URL, and canonical package page/API URL;
- `occurrences`: every Project Manifest occurrence with project ID, manifest path, dependency type, declared name, and declared version/reference;
- `metadata`: description, license expression/string, homepage, documentation URL, repository URL, issue URL, and deprecation/project-status facts when available;
- `latest`: the registry-designated latest version, how it was selected, publication time when available, registry release URL, and prerelease/yanked/deprecated facts;
- `releaseIndex`: minimal entries containing opaque version/tag, publication time, URL, status flags, and source IDs;
- `sourceIds`: references into the top-level source catalog;
- `warningCodes`: package-scoped warning codes, duplicated in full only in top-level `warnings`.

Occurrences preserve why a package was researched and prevent deduplication from losing project context. Package records are sorted by `id`; occurrences are sorted by project ID, manifest, dependency type, and declared version. Release identifiers are stored as provided by the source and sorted lexically in MVP-02. Semantic ordering is explicitly an MVP-03 responsibility.

`latest.selection` records registry semantics instead of an UpgradeLens recommendation. For npm it is `dist-tag:latest`; for PyPI it is `project-info-version`. MVP-02 must never compute “latest” by taking the maximum version string.

### Source record

Every external fact must reference a source record containing:

- a stable `id`, for example `npm:react:registry` or `github:facebook/react:releases`;
- `kind`: `registry`, `officialDocumentation`, `sourceRepository`, `releaseFeed`, or `community`;
- `authority`: `registryAuthoritative`, `officialProject`, `publisherProvided`, or `community`;
- `trust`: `official`, `publisher`, `verified`, `community`, or `unknown`, with evidence references when corroborated;
- canonical HTTPS `url` and optional API URL;
- `status`: `available`, `notFound`, `unavailable`, `unverified`, or `stale`;
- `supports`: fields or evidence roles supplied by the source;
- `discoveredFrom`: source ID and field path that produced the link;
- `snapshot`: portable content digest, media type, retrieval time, and freshness state;
- optional `conflictsWith` source IDs when authoritative sources disagree.

Secrets, authorization headers, signed query parameters, local absolute paths, and raw transient error responses must never appear in this record.

### Research and cache metadata

`research` describes the execution, not an upgrade conclusion. It contains `researchId`, `startedAt`, `completedAt`, derived `durationMs`, `inputOccurrenceCount`, `inputPackageCount`, `researchedPackageCount`, `sourceCount`, `cacheHitCount`, `cacheMissCount`, `cacheRevalidationCount`, `retryCount`, and `partialFailureCount`. `researchId` is deterministically derived from the input artifact digest, policy fingerprint, and ordered source content digests; a separate transient run ID may exist in logs but not in the manifest. Timestamps and duration are explicitly variable execution facts, while arrays and counts remain canonically derived from the completed execution.

Top-level `cache` repeats only the portable operational summary needed to explain online/offline and stale behavior. Essential normalized facts are embedded in package records, so the manifest remains useful when copied alone. Large evidence bodies remain in the Knowledge Store and are represented only by content digests; a future portable evidence bundle may copy those digest-addressed objects under a separately defined format. This does not make store keys or layout part of the Knowledge Manifest contract.

## 4. Registry Strategy

MVP-02 officially supports exactly two registry adapters.

### Node.js → npm Registry

The npm adapter uses the public npm Registry package metadata endpoint, `GET https://registry.npmjs.org/:package`. npm calls the response package metadata or a “packument”; the full representation includes `dist-tags`, a version map, publication times, homepage, repository, license, and other publisher-supplied fields. The [npm package metadata documentation](https://github.com/npm/registry/blob/master/docs/responses/package-metadata.md) is the primary contract reference.

The adapter must preserve scoped identities and correctly encode scoped package paths. `dist-tags.latest` is the authoritative latest channel because npm publishers control distribution tags; npm documents that normal publication assigns the `latest` tag by default in its [dist-tag documentation](https://docs.npmjs.com/adding-dist-tags-to-packages/). Other tags are collected as registry facts but do not become recommendations.

The full packument is preferred over the abbreviated installation representation because knowledge research needs publication timestamps and source links. Individual version endpoints may be used only when full version-specific metadata is required. npm search is not an identity fallback: fuzzy search can return a different package and would make resolution non-deterministic.

### Python → PyPI

The PyPI adapter looks up normalized names using the PyPA rule: lowercase the name and replace each run of `.`, `_`, or `-` with `-`, as specified by [Python package name normalization](https://packaging.python.org/en/latest/specifications/name-normalization/).

`GET /pypi/<project>/json` supplies latest project metadata, `info.version`, project URLs, and release information. PyPI notes that upload metadata is publisher-provided and may not exactly match distribution contents. PyPI also marks the project-level JSON `releases` field as deprecated for complete file discovery, so the adapter should use the JSON form of the [Index API](https://docs.pypi.org/api/index-api/) for the release/file index and the [PyPI JSON API](https://docs.pypi.org/api/json/) for project/latest-release metadata. No HTML scraping is required.

Project URLs must be classified through the PyPA [well-known Project-URL labels](https://packaging.python.org/en/latest/specifications/well-known-project-urls/), including documentation, source, changelog, release notes, and issues aliases. `info.version` is recorded as the registry-designated latest release; MVP-02 does not apply PEP 440 ordering or choose a non-yanked target.

### Future registries

The architecture can later admit Maven Central, NuGet, the Go module proxy, crates.io, RubyGems, Packagist, and ecosystem-specific AL catalogs. They are not supported by MVP-02. A future adapter must provide the same conceptual operations—normalize identity, fetch registry facts, translate release metadata, expose source hints, define cache representation, and classify errors—without changing orchestration or the Knowledge Manifest’s common package fields.

Private npm registries and private Python indexes require authentication, registry selection, and trust-policy design. They remain deferred; public npm and PyPI are the deterministic defaults.

## 5. Knowledge Sources

MVP-02 records both authority and provenance because availability does not imply reliability. Registry metadata is authoritative for what was published to that registry, but homepage and repository fields are supplied by package maintainers and can be stale or incorrect. Official documentation is strongest for usage and migration guidance, while a source repository is strongest for tags and source history. GitHub Releases are authoritative only when the repository relationship is credible, and the GitHub API explicitly omits ordinary tags that have no Release object.

### Node.js example: React

For `react`, the source set should be:

1. npm Registry for package identity, `dist-tags`, published versions, npm timestamps, license, and publisher-provided URLs;
2. [React official documentation](https://react.dev/) for canonical documentation;
3. the official [React Versions page](https://react.dev/versions) and [React blog](https://react.dev/blog) for project-maintained release and deprecation material;
4. the `facebook/react` repository and its release/tag metadata when linked from official package/project metadata.

React illustrates why sources cannot be merged blindly: its documentation is maintained by major line rather than for every minor/patch version, while npm has package-level release facts. MVP-02 records both without claiming the documentation describes every published patch.

### Python example: FastAPI

For `fastapi`, the source set should be:

1. PyPI JSON/Index APIs for normalized identity, latest project metadata, distributions, publication times, and Project-URL hints;
2. [FastAPI official documentation](https://fastapi.tiangolo.com/) and its release/version pages for project-maintained guidance;
3. the official `fastapi/fastapi` repository and published GitHub Releases when the PyPI source URL supports that mapping.

FastAPI documents its version conventions separately from PyPI publication facts. MVP-02 stores those sources and their roles; it does not interpret whether a FastAPI release is safe for the discovered project.

### Source trust model

Source priority answers which source is authoritative for a field; trust describes the established relationship between a source and the package/project. Every source receives one categorical trust value, without numeric scoring:

| Trust | Meaning |
| --- | --- |
| `official` | Documentation, repository, or release source demonstrably controlled by the project or governing organization |
| `publisher` | Registry record or URL supplied by an authorized package publisher; authoritative for registry publication but not automatically official for documentation claims |
| `verified` | A source relationship corroborated through independent official or publisher-controlled links, but not itself classified as official ownership |
| `community` | Third-party material with no project authority |
| `unknown` | Ownership or relationship cannot be established deterministically |

Trust matters because later analysis must distinguish a project's own compatibility statement from a maintainer-entered registry link or third-party interpretation. Official documentation is preferred for usage, policy, deprecation, and migration statements. Registries remain authoritative for package identity and publication facts, but descriptions, homepages, and repository links inside registry metadata are publisher-controlled fields and retain `publisher` trust until corroborated. Community and unknown sources may provide leads only when future policy enables them; they never override official, publisher-authoritative, or verified facts.

Trust assignment is rule-based and provenance-bearing. A source record states the classification and evidence source IDs; MVP-02 does not calculate confidence scores or infer ownership from naming similarity. Trust does not alter the field-specific priority rules in Section 8.

### Reliability rules

- A URL from registry metadata is `publisherProvided` until corroborated by an official project or repository source.
- Repository ownership is not inferred from package-name similarity.
- Redirects are recorded at their final canonical HTTPS URL, subject to fetch safety rules.
- Conflicting values remain separate source assertions with `SOURCE_CONFLICT`; later stages do not receive a silently chosen value.
- Community resources are disabled by default in MVP-02 and can never override official or registry facts.

## 6. Fetch Strategy

Research proceeds in deterministic phases:

1. Validate the Project Manifest and extract Node/Python dependency occurrences.
2. Group occurrences by `(registry, normalizedName)` while preserving all references.
3. Validate registry eligibility. Unnamed direct references, local editable paths, and unsupported ecosystems remain visible but are not guessed into public registry identities.
4. Resolve cache entries before scheduling network work.
5. Fetch or conditionally revalidate registry metadata with bounded concurrency.
6. Normalize registry responses into the common package/release contract.
7. Resolve documentation, repository, changelog, and release URLs from authoritative metadata.
8. Fetch GitHub release metadata only for corroborated GitHub repositories; ordinary tags remain a distinct source capability.
9. Merge facts by field-specific authority, sort all output, validate the Knowledge Manifest, and write atomically.

For each supported registry package, MVP-02 should collect:

- canonical name and registry/package URLs;
- description and license as reported by the registry;
- registry-designated latest version and selection mechanism;
- minimal release index: version, published time if known, yanked/deprecated/prerelease indicators exposed directly by the source, and release URL;
- homepage, official documentation, source repository, issue tracker, changelog, and release-note URLs when explicitly provided;
- GitHub Release tag, title, URL, publication time, prerelease flag, and digest reference for the body snapshot;
- source retrieval status, validators, and content digests.

The release index should include all registry-published version identifiers but not every version’s full dependency graph or tarball. Large raw payloads and release bodies belong in cache objects. Output ordering is lexical because parsing and comparing version schemes belongs to MVP-03.

MVP-03, not MVP-02, determines which declared version is current, whether a range admits a release, which target is preferable, how prereleases/yanked versions should affect an upgrade, or which releases lie between current and target. MVP-02 may report the registry’s latest channel as a fact, but it cannot label it an upgrade recommendation.

Fetching must respect upstream services. GitHub recommends conditional requests using ETag or Last-Modified; a valid `304` avoids transferring an unchanged body and can avoid primary rate-limit cost when authenticated. GitHub also requires clients to handle `403`/`429`, `Retry-After`, and rate-limit reset headers rather than retrying aggressively. See the official [REST API best practices](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api), [rate-limit guidance](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api), and [release endpoints](https://docs.github.com/en/rest/releases/releases).

Only fixed registry/API hosts are fetched automatically. Publisher-provided documentation URLs require HTTPS, public-network resolution, bounded redirects, response size/type limits, and credential redaction. Loopback, link-local, private-network, and embedded-credential URLs are not fetched. Authentication is supplied out of band and never persisted in manifests or cache keys.

## 7. Cache Strategy

The default cache root should be `.upgradelens/cache/knowledge/v1/`. Each entry is an atomic JSON envelope containing a canonical request identity, selected response headers, normalized or raw body, body SHA-256, `fetchedAt`, `validatedAt`, `expiresAt`, ETag, Last-Modified, and adapter version. No absolute path appears in the Knowledge Manifest.

A cache key is the SHA-256 of a canonical tuple:

```text
adapter version
source kind
canonical registry/API base
normalized package or repository identity
endpoint/resource variant
Accept/API version
non-secret request parameters
```

Authorization, user-agent, retry count, and volatile headers are excluded. Changing response translation rules increments the adapter/cache representation version, preventing old envelopes from being interpreted under new semantics.

Recommended initial TTLs are policy defaults, recorded in the manifest:

| Resource | TTL |
| --- | --- |
| Registry package metadata and release index | 24 hours |
| GitHub release metadata | 6 hours |
| Documentation/repository URL discovery | 7 days |
| Confirmed package/source `404` | 1 hour |
| Transient failures and rate limits | Not cached as successful data; honor retry metadata |

TTL indicates when to revalidate, not when facts become invalid. In online mode, a fresh hit is used directly; an expired entry is conditionally revalidated when validators exist, otherwise refetched. `304 Not Modified` updates validation/expiry metadata while retaining the same body digest. A changed `200` response creates a new snapshot.

In offline mode, no network call is attempted. Fresh entries are used normally. Expired entries may be used as stale facts, with source status `stale` and `CACHE_EXPIRED`; this is more useful than erasing known data and remains explicit. A missing entry produces `OFFLINE_CACHE_MISS` and an unresolved/partial package. Offline mode must never silently fall back to networking.

Manual invalidation is a policy operation, not a new CLI command in this architecture task. It can later support refreshing all entries, one registry, or one package. Deleting cache entries is always safe because the Knowledge Manifest is rebuilt from the Project Manifest and sources; however, reproducing an older snapshot requires retaining the referenced digest objects or exporting a future bundle.

### Future multi-project reuse

Knowledge is package-centric rather than repository-centric. If Project A and Project B both reference `npm:react`, registry and source requests use the same package/source cache identity even though each Knowledge Manifest retains its own repository-specific occurrences and declared versions. A fresh representation can therefore satisfy both research executions without duplicating network work, and canonical normalization produces the same package facts for the same source snapshot.

The MVP-02 default remains a repository-local Knowledge Store. The package-centric key contract deliberately permits a future caller to point multiple repositories at one local store, but shared-store configuration and concurrency policy are not implemented here. Repository paths, Project Manifest digests, and occurrence data never enter reusable source keys, preventing one project's context from leaking into another project's cached knowledge.

## 8. Knowledge Source Priority

Priority is field-specific, because no single source is best for all facts:

```text
Official project documentation
        ↓
Package registry
        ↓
Official source repository / GitHub Releases
        ↓
Community resources
```

For documentation, upgrade guides, deprecations, and policy statements, official project documentation has highest authority. For package identity, publication, registry latest channel, and registry timestamps, the package registry is authoritative and overrides documentation. For source tags and published GitHub Release bodies, a corroborated official repository is authoritative for what it hosts but does not override registry publication facts. Community resources are contextual leads only, disabled by default, and never override higher levels.

The resolver stores assertions with source IDs rather than flattening conflicting values prematurely. A preferred display URL may be selected deterministically by role and authority, but conflicting facts remain inspectable. This provenance is essential for MVP-03: an analysis must be able to explain whether a claim came from npm, PyPI, official docs, or a repository release.

## 9. Error Model

Project Manifest validation failures are fatal and prevent output replacement. All external failures are isolated by package/source so one unavailable registry record does not erase successful research for other packages. A Knowledge Manifest with warnings is still valid if its package statuses and source statuses reflect missing data.

| Warning code | When emitted |
| --- | --- |
| `INVALID_PACKAGE_REFERENCE` | A dependency cannot form a supported public registry identity, including unnamed/local references |
| `PACKAGE_NOT_FOUND` | The authoritative registry returns a confirmed `404` for a valid identity |
| `REGISTRY_UNAVAILABLE` | Registry access fails after bounded retry handling because of network or server failure |
| `REGISTRY_RATE_LIMITED` | Registry/API returns a rate limit response; include retryability without embedding credentials/headers |
| `REGISTRY_RESPONSE_INVALID` | A successful response violates the adapter’s expected shape or media type |
| `DOCUMENTATION_NOT_FOUND` | Metadata claims an official documentation URL but it is invalid or confirmed missing |
| `REPOSITORY_NOT_FOUND` | A claimed source repository is invalid, inaccessible, or confirmed missing |
| `RELEASE_METADATA_NOT_FOUND` | A corroborated repository is expected to provide release metadata but none is available; absence of GitHub Releases alone is not automatically an error because projects may publish tags only |
| `CACHE_EXPIRED` | Offline mode uses an expired cache entry explicitly as stale knowledge |
| `OFFLINE_CACHE_MISS` | Offline mode has no cache entry for a required source |
| `SOURCE_CONFLICT` | Two authoritative/publisher-supported sources disagree on a field that cannot be safely merged |

Warnings should contain `code`, stable `packageId` when known, optional `sourceId`, a sanitized deterministic message, and `retryable`. They do not contain stack traces, local paths, tokens, or occurrence timestamps. Sort order is package ID, code, source ID, then message.

Statuses follow facts: registry success plus missing optional docs is usually `partial`; registry `404` is `notFound`; invalid identity is `invalid`; transient registry failure without usable cache is `unavailable`; complete required registry facts are `resolved`. “Resolved” does not mean “safe to upgrade.”

## 10. Extension Model

MVP-02 uses an implementation extension model, not a runtime plugin system. The orchestration pipeline depends on three conceptual boundaries:

- **Registry adapter:** recognizes supported Project Manifest records, canonicalizes identities, describes requests, translates responses, and classifies registry errors.
- **Source resolver:** converts registry/source hints into typed, provenance-bearing documentation, repository, changelog, and release sources.
- **Cache abstraction:** stores and revalidates source envelopes without understanding npm, PyPI, or GitHub business fields.

Adding an ecosystem means supplying a registry adapter and source rules plus conformance fixtures for identity, response normalization, warnings, caching, and deterministic sorting. Common package/source contracts remain unchanged. Ecosystem-specific data may live in a namespaced `extensions` object only when it cannot be represented by common fields; promotion into the common contract requires a schema version change.

Adapters are selected from a static internal registry at build time. There is no dynamic loading, marketplace, arbitrary code execution, or plugin manifest. This keeps packaging and security simple while allowing Java, .NET, Go, Rust, Ruby, PHP, and AL support to be developed independently later.

## 11. MVP Boundary

MVP-02 ends when external package knowledge has been collected, normalized, cached, attributed, and written to a valid Knowledge Manifest. Its success criterion is factual completeness and explicit uncertainty—not an upgrade recommendation.

MVP-03 begins with version semantics and release analysis:

- interpret npm semver and Python/PEP 440 declarations;
- determine current/resolved baselines only from explicit artifacts and policy;
- compare current, candidate, and registry-designated latest versions;
- select releases relevant to an upgrade path;
- analyze release notes, changelogs, compatibility, and breaking-change evidence;
- produce semantic conclusions with citations and confidence.

This separation prevents network availability and source discovery from being entangled with semantic reasoning. MVP-02 can be replayed, cached, tested against fixtures, and run offline. MVP-03 can then operate on a frozen evidence set, making conclusions reproducible and auditable.

Breaking-change labels do not belong in the Knowledge Manifest. Even when a release source uses the words “breaking change,” MVP-02 records the source/body as evidence; MVP-03 determines the semantic meaning and relevance.

## 12. Future Integration

The long-term artifact pipeline is:

```text
Project Manifest (MVP-01)
        │ repository facts and dependency occurrences
        ▼
Knowledge Manifest (MVP-02)
        │ package facts, releases, source provenance, evidence digests
        ▼
Version Analysis Manifest (MVP-03)
        │ baselines, targets, relevant releases, change findings and citations
        ▼
Impact Analysis Manifest (MVP-04)
        │ affected project components, severity, evidence and uncertainty
        ▼
Migration Plan (MVP-05)
          ordered actions, validation strategy, rollback and unresolved risks
```

MVP-03 consumes both Project and Knowledge Manifests so every version conclusion retains the originating dependency occurrence. It must not alter either input. Its output references package IDs, source IDs, release IDs, and evidence digests from MVP-02.

MVP-04 consumes the Project Manifest and Version Analysis Manifest. If source-level impact analysis needs imports, API usage, configuration, or framework facts not present in the Project Manifest, the discovery artifact must be extended upstream through a new versioned contract. MVP-04 must not silently rescan the repository; otherwise impact results would not be traceable to the deterministic discovery snapshot.

MVP-05 consumes version and impact findings and emits a plan. It does not need registry access or repository scanning. Every plan item should trace back through impact/change findings to Knowledge Manifest sources and ultimately to a Project Manifest occurrence.

This chain establishes a central invariant: AI may interpret versioned artifacts and cited evidence, but raw repository traversal remains owned by deterministic discovery.

## Open questions

These questions are non-blocking for the base architecture; recommended defaults are stated:

1. **Complete versus bounded release indexes:** default to complete minimal registry indexes, measure manifest size, and introduce an explicit truncation policy only if evidence shows a need.
2. **Portable evidence bundles:** keep digest references and normalized facts now; design a manifest-plus-cache export format only when offline downstream execution requires transfer between machines.
3. **Authenticated public API usage:** support credentials out of band when implementation reaches GitHub rate limits, while preserving identical manifest contracts for authenticated and unauthenticated fetches.
4. **Private registries:** defer registry selection/authentication semantics until public npm/PyPI behavior is stable.
5. **Official documentation verification:** begin with publisher-provided and corroborated URLs; avoid general web search until its trust and reproducibility policy is explicitly designed.
6. **Source-level facts for MVP-04:** decide in MVP-04 architecture discovery whether MVP-01 needs a new static usage-inventory contract.

## Architecture decisions

- The Project Manifest is the only repository-derived input.
- The Knowledge Store is internal and reusable; the Knowledge Manifest is the only portable MVP-02 contract for downstream stages.
- Knowledge Manifest schema versioning is independent and begins at `1.0.0`.
- Public npm and PyPI are the only MVP-02 registries.
- Registry-designated latest versions are facts, not recommendations.
- Authority is field-specific, source trust is categorical, and all material facts retain provenance.
- Essential normalized metadata is embedded; large raw evidence is cached by digest.
- Partial external failure produces package/source statuses and warnings, not loss of successful results.
- Cache keys are package/source based and independent of Project Manifest generation timestamps.
- Pipeline artifacts are immutable and may be replaced only by a new validated output from their owning stage.
- All later stages consume versioned artifacts; no downstream repository rescans are permitted.
- The extension model is static and implementation-level, not a runtime plugin system.

## Risks

- Publisher-provided registry links may be stale, malicious, or unrelated to the actual project.
- Monorepositories can publish many packages whose GitHub tags/releases do not map one-to-one to registry versions.
- npm/PyPI/GitHub schemas and deprecations can evolve independently of UpgradeLens.
- Complete release indexes can make the Knowledge Manifest large for long-lived packages.
- GitHub rate limits and network failures can produce partial snapshots.
- Mutable documentation means the same URL may serve different content over time; digests and cache retention are necessary for auditability.
- Stale offline data may be mistaken for current data unless status and warnings remain visible in every consumer.
- A Project Manifest without source-usage facts may be insufficient for future source-level impact analysis.

## Future improvements

- Additional official registry adapters after Node/Python conformance is stable.
- Signed or portable evidence bundles containing manifest and digest-addressed cache objects.
- Mirror-aware and private-registry policies.
- Better corroboration between registry ownership, official domains, and source repositories.
- Selective collection of official upgrade guides without broad website crawling.
- Supply-chain provenance and vulnerability sources under a separately versioned contract.
- Shared artifact lineage tooling across Knowledge, Version, Impact, and Migration manifests.

## Recommended implementation order

1. Define and review the Knowledge Manifest JSON Schema and representative fixtures.
2. Implement Project Manifest validation, canonical fingerprinting, package grouping, and deterministic output ordering.
3. Implement the cache envelope, key policy, atomic persistence, conditional validation state, and offline behavior.
4. Implement npm registry normalization against recorded fixtures, including scoped packages, dist-tags, timestamps, and errors.
5. Implement PyPI JSON/Index normalization, name rules, Project-URL classification, yanked files, and errors.
6. Implement source provenance and URL safety rules, then official documentation/repository discovery.
7. Implement GitHub release metadata collection with pagination, conditional requests, and rate-limit handling.
8. Add orchestration, partial-status propagation, warning sorting, manifest validation, and atomic write.
9. Add reproducibility, offline, stale-cache, corrupted-cache, source-conflict, and cross-ecosystem conformance tests.
10. Validate the complete stage against real Node/Python Project Manifests while keeping network responses recorded and repeatable in tests.

## Technical debt intentionally deferred

- Private npm registries and private Python indexes.
- Community-source search and trust scoring.
- Full documentation-site crawling or semantic indexing.
- Version-range resolution, target selection, and breaking-change analysis.
- Installed-environment and lockfile resolution not represented by the Project Manifest.
- Vulnerability databases and package-signature verification.
- Dynamic plugins or third-party runtime adapters.
- Distributed/shared caches, databases, servers, and background workers.
- LLM, MCP, LangGraph, or agent-runtime integration.

## Architecture Refinement Summary

This refinement adds a strict Knowledge Store/Knowledge Manifest boundary, an explicit research lifecycle, categorical source trust, portable research execution metadata, immutable artifact ownership, and a package-centric path for future multi-project cache reuse. These concepts remove ambiguity about internal state, provenance, stage responsibilities, and downstream contracts without adding a plugin system or operational infrastructure.

No MVP scope, supported ecosystem, registry strategy, fetch policy, cache policy, warning model, Project Manifest contract, extension model, or MVP boundary has changed. MVP-02 remains deterministic knowledge collection for public npm and PyPI. Its implementation can begin from this architecture without another structural redesign.
