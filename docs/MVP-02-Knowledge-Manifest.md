# MVP-02 Knowledge Manifest Contract

The Knowledge Manifest is the versioned public artifact produced by UpgradeLens Knowledge Research. It captures normalized package facts, source provenance, execution metadata, cache outcomes, and non-fatal warnings for one Project Manifest. MVP-02 collects facts; it does not compare versions, identify breaking changes, assess repository impact, or recommend migrations.

The contract is defined by the [Knowledge Manifest JSON Schema](../schemas/knowledge-manifest.schema.json). Schema version `1.0.0` is independent from Project Manifest schema `2.0.0`, the npm package version, and later analysis-artifact versions.

## Ownership and immutability

MVP-02 owns the Knowledge Manifest. Once a manifest has passed schema and runtime invariant validation and has been published atomically, it is immutable. Downstream stages consume it without repairing or enriching it in place:

```text
Project Manifest (MVP-01)
        │
        ▼
Knowledge Manifest (MVP-02)
        │
        ▼
Version Analysis Manifest (MVP-03)
```

If an upstream fact is missing, the owning stage must produce a new versioned artifact. MVP-03 may not modify the Knowledge Manifest or rescan the repository.

## Knowledge Store versus Knowledge Manifest

The Knowledge Store and Knowledge Manifest serve different purposes:

| Knowledge Store | Knowledge Manifest |
| --- | --- |
| Internal reusable cache | Portable public artifact |
| Content-addressed response envelopes | Normalized facts and provenance |
| Owns ETag, Last-Modified, TTL state, cache keys, and storage layout | Owns portable content digests, source freshness, and cache counts |
| May be deleted and rebuilt | Immutable after successful publication |
| Not consumed as an MVP-03 contract | Consumed directly by downstream MVPs |

The manifest rejects store paths, internal cache keys, HTTP validators, authorization data, and unversioned storage-envelope fields through `additionalProperties: false`. It also rejects local absolute paths. Content digests identify evidence without exposing how or where it is stored.

## Top-level contract

Every Knowledge Manifest requires these fields:

| Field | Purpose |
| --- | --- |
| `schemaVersion` | Knowledge Manifest contract version; exactly `1.0.0` |
| `generatedAt` | UTC date-time when the validated artifact was assembled |
| `generator` | UpgradeLens name and producing package version |
| `input` | Project Manifest lineage without duplicating the input artifact |
| `policy` | Non-secret research behavior for this execution |
| `research` | Execution identity, timestamps, counts, retries, and partial failures |
| `summary` | Canonical package/source/status/warning/cache totals |
| `packages` | Package-centric research records |
| `sources` | Deduplicated source and snapshot provenance records |
| `cache` | Portable cache outcome summary |
| `warnings` | Deterministically ordered non-fatal conditions |

All public objects reject undeclared fields. The schema document itself has no custom top-level `schemaVersion` keyword; the version is expressed only as `properties.schemaVersion.const`.

## Generator and schema versioning

`generator.name` is always `UpgradeLens`. `generator.version` records the package version that produced the artifact but is intentionally not a schema constant. A package release can continue producing Knowledge Manifest `1.0.0` while implementation details evolve compatibly.

An incompatible public-contract change requires a new Knowledge Manifest schema version. Project Manifest schema changes independently. Consumers must validate the version they support before reading nested records.

## Project Manifest lineage

`input.projectManifest` records:

- Project Manifest schema version `2.0.0`;
- its repository-relative artifact path;
- a `sha256:<64 lowercase hexadecimal characters>` digest;
- repository name and root `.`.

`artifactDigest` fingerprints the exact bytes of the Project Manifest, not a reserialized object. This preserves lineage without copying the complete Project Manifest into the Knowledge Manifest. Artifact, project, and dependency-manifest paths use portable forward-slash relative paths; absolute paths, Windows drive paths, backslashes, and parent traversal are rejected.

## Research policy

`policy` records execution behavior rather than an upgrade recommendation:

- `mode`: `online` or `offline`;
- `policyVersion`;
- public HTTPS `registryBases` for npm and PyPI;
- `ttlPolicyVersion`;
- `sourceAllowlistVersion`;
- `includePrereleases`.

Only public npm and PyPI bases exist in the MVP-02 contract. Tokens, authorization headers, signed URLs, credentials, and arbitrary secret fields are not allowed.

## Research execution metadata

`research` contains a deterministic `researchId`, `startedAt`, `completedAt`, derived `durationMs`, input occurrence/package counts, researched package and source counts, cache hit/miss/revalidation counts, retry count, and partial-failure count.

The research ID is a SHA-256 identity derived from the input artifact digest, policy fingerprint, and canonically ordered source content digests. It is not a transient process/run ID. Timestamps and duration are execution facts and can differ between executions even when normalized package facts are unchanged.

Runtime invariants define:

- `inputPackageCount` as the number of package records;
- `researchedPackageCount` as package records excluding `invalid` identities;
- `partialFailureCount` as package records whose status is not `resolved`;
- `durationMs` as `completedAt - startedAt` in milliseconds.

## Summary and relational invariants

The summary reports input occurrences, unique package records, every package-status count, sources, warnings, cache hits/misses, and stale sources. These are counts of known manifest structures, not placeholders for unavailable external facts.

JSON Schema validates field presence, type, and non-negative integer ranges. The focused validator in `src/knowledge-manifest.js` validates relationships JSON Schema cannot express cleanly:

- package status counts sum to `packageCount`;
- package, occurrence, source, warning, and stale-source counts match their arrays;
- research and cache counts agree with the summary;
- duration agrees with execution timestamps;
- package/source IDs are unique and references resolve;
- package IDs agree with their registry and normalized identity;
- all contract arrays use canonical ordering.

Writers must pass both layers before atomically publishing the artifact.

## Package identity and status

MVP-02 package IDs are package-centric:

```text
npm:<normalized-name>
pypi:<normalized-name>
```

Scoped npm IDs such as `npm:@scope/package` are valid. `identity.observedDeclaredNames` preserves declared spelling from the Project Manifest, while `normalizedName` is the registry lookup identity. `registryBaseUrl`, canonical package page, and API URL are HTTPS.

Package status is one of:

- `resolved`: required registry facts are available;
- `partial`: useful facts exist but one or more sources failed, conflicted, or are stale;
- `notFound`: the authoritative registry confirmed no package;
- `invalid`: the Project Manifest reference cannot form a supported public identity;
- `unavailable`: research could not obtain usable facts because a source was unavailable.

Every package contains `metadata`, `latest`, and `releaseIndex`. Missing optional metadata is omitted or represented by `null`; it is never represented by fake counts or invented values. `notFound`, `invalid`, and `unavailable` packages require `latest: null` and an empty release index, preventing unresolved facts from masquerading as valid zero values.

## Occurrences

Package deduplication never discards Project Manifest occurrences. Each occurrence retains:

- project ID and repository-relative project path;
- repository-relative dependency manifest path;
- dependency type;
- declared name;
- declared version/reference, or `null` when unversioned.

Multiple projects can reference one package record, and duplicate declarations remain separate occurrences. This preserves repository context while keeping external knowledge package-centric.

## Registry-designated latest and releases

`latest` records a registry fact, not a recommended target. npm uses `dist-tag:latest`; PyPI uses `project-info-version`. MVP-02 does not compute a maximum version or interpret npm SemVer or PEP 440.

Latest facts retain version, selection mechanism, optional publication/release URL data, source ID, and nullable prerelease/yanked/deprecated flags. `null` means the source did not provide that fact; `false` means it explicitly reported false.

Release entries contain either an opaque `version` or opaque `tag`, optional publication time/URL, nullable status flags, and source IDs. MVP-02 sorts identifiers lexically and performs no semantic ordering.

## Source authority, trust, and snapshots

Each source has a stable ID, kind, field-specific authority, categorical trust, canonical HTTPS URL, status, supported evidence roles, discovery provenance, trust evidence, and an optional portable snapshot.

Source kinds are registry, official documentation, source repository, release feed, or community. Authority is `registryAuthoritative`, `officialProject`, `publisherProvided`, or `community`. Trust is categorical—`official`, `publisher`, `verified`, `community`, or `unknown`—and has no numeric score.

Registry records are authoritative for registry publication facts, but descriptions and links inside them remain publisher-controlled. Official documentation is preferred for project policy and usage statements. Community sources never override official or registry-authoritative facts.

A snapshot contains only content digest, media type, retrieval time, and `fresh`/`stale` state. `discoveredFrom`, `trustEvidenceSourceIds`, and `conflictsWith` reference top-level source IDs and are checked at runtime.

## Warning behavior

Warnings represent non-fatal research conditions:

- `INVALID_PACKAGE_REFERENCE`
- `PACKAGE_NOT_FOUND`
- `REGISTRY_UNAVAILABLE`
- `REGISTRY_RATE_LIMITED`
- `REGISTRY_RESPONSE_INVALID`
- `DOCUMENTATION_NOT_FOUND`
- `REPOSITORY_NOT_FOUND`
- `RELEASE_METADATA_NOT_FOUND`
- `CACHE_EXPIRED`
- `OFFLINE_CACHE_MISS`
- `SOURCE_CONFLICT`

Each warning has a deterministic sanitized message and `retryable` flag. Package/source IDs are present when the condition can be scoped. A package stores warning-code references only; full records remain at the top level. Runtime validation checks both directions of that relationship.

Warnings never contain stack traces, secrets, absolute paths, raw headers, or complete upstream error bodies. A warning does not by itself make the artifact invalid; package and source statuses expose the resulting completeness.

## Cache summary

The public `cache` object includes only mode, TTL policy version, hit/miss/revalidation counts, and stale-entry count. Counts must agree with `research` and `summary`. Store paths, keys, validators, envelopes, and persistence APIs remain private to the Knowledge Store.

## Deterministic ordering

Writers use code-unit lexical comparison, not locale-sensitive comparison:

1. packages by `id`;
2. occurrences by project ID, manifest, dependency type, declared name, and declared version;
3. releases by opaque version/tag, then joined source IDs;
4. sources by `id`;
5. observed names, source ID arrays, warning codes, evidence roles, trust evidence, and conflict IDs lexically;
6. warnings by package ID, code, source ID, and message.

JSON Schema cannot assert array ordering or referential integrity. The runtime invariant validator rejects unsorted output and unknown references, preventing asynchronous completion or source payload enumeration from affecting the artifact.

## Example

This empty but complete manifest is valid:

```json
{
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-07-14T00:00:00.000Z",
  "generator": { "name": "UpgradeLens", "version": "<package version>" },
  "input": {
    "projectManifest": {
      "schemaVersion": "2.0.0",
      "artifact": ".upgradelens/project-manifest.json",
      "artifactDigest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "repository": { "name": "example-project", "root": "." }
    }
  },
  "policy": {
    "mode": "online",
    "policyVersion": "1",
    "registryBases": {
      "npm": "https://registry.npmjs.org",
      "pypi": "https://pypi.org"
    },
    "ttlPolicyVersion": "1",
    "sourceAllowlistVersion": "1",
    "includePrereleases": false
  },
  "research": {
    "researchId": "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "startedAt": "2026-07-14T00:00:00.000Z",
    "completedAt": "2026-07-14T00:00:00.000Z",
    "durationMs": 0,
    "inputOccurrenceCount": 0,
    "inputPackageCount": 0,
    "researchedPackageCount": 0,
    "sourceCount": 0,
    "cacheHitCount": 0,
    "cacheMissCount": 0,
    "cacheRevalidationCount": 0,
    "retryCount": 0,
    "partialFailureCount": 0
  },
  "summary": {
    "inputOccurrenceCount": 0,
    "packageCount": 0,
    "resolvedPackageCount": 0,
    "partialPackageCount": 0,
    "notFoundPackageCount": 0,
    "invalidPackageCount": 0,
    "unavailablePackageCount": 0,
    "sourceCount": 0,
    "warningCount": 0,
    "cacheHitCount": 0,
    "cacheMissCount": 0,
    "staleSourceCount": 0
  },
  "packages": [],
  "sources": [],
  "cache": {
    "mode": "online",
    "policyVersion": "1",
    "hitCount": 0,
    "missCount": 0,
    "revalidationCount": 0,
    "staleEntryCount": 0
  },
  "warnings": []
}
```

Additional valid examples are under `test/fixtures/knowledge-manifest/`.

## Limitations

This contract supports public npm and PyPI package facts only. It does not implement networking, registry adapters, Knowledge Store persistence, GitHub fetching, private registries, version comparison, changelog interpretation, breaking-change analysis, impact analysis, migration planning, AI/LLM reasoning, or a research CLI command.
