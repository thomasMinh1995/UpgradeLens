# MVP-02 Source Provenance Resolution

MVP-02-06 converts URL metadata already returned by the npm and PyPI registry adapters into a small, deterministic internal source graph. It does not fetch, crawl, or verify source content. It only structures and attributes source metadata already collected from registries.

```text
npm / PyPI registry result
        │
        ▼
Extract source candidates
        │
        ▼
Canonicalize and classify public URLs
        │
        ▼
Merge compatible candidates per package
        │
        ▼
Attach provenance, trust, and conflicts
        │
        ▼
Internal source graph
```

For example:

```text
npm Registry
      │
      ├── documentation candidate ──► npm:react:documentation:<sha256>
      └── repository candidate ─────► npm:react:repository:<sha256>
```

The source graph is internal composition data. It is not a Knowledge Manifest, a cache format, or a graph database. Later orchestration can assemble compatible source records into the versioned Knowledge Manifest without exposing adapter payloads, source-candidate field paths, or cache details.

## URL evidence and provenance

A URL alone is not proof that a project controls the destination. Registry metadata provides a publisher assertion about a relationship; it does not establish domain or repository ownership. Each non-registry source records its source kind, supported roles, authority, trust, status, one deterministic upstream `discoveredFrom` source ID, and all upstream source IDs in `trustEvidenceSourceIds`.

The public Knowledge Manifest contract permits one `discoveredFrom` source ID rather than a field-path object. The resolver chooses it by canonical source ID and field-path ordering. Field paths are retained only while resolving candidates and do not become a public artifact. This preserves portability while still retaining all distinct upstream source IDs as trust evidence.

## Roles, kinds, and status

| Candidate role | Knowledge Manifest kind | `supports` value |
| --- | --- | --- |
| homepage | `officialDocumentation` | `homepage` |
| documentation | `officialDocumentation` | `documentation` |
| repository | `sourceRepository` | `repository` |
| issues | `sourceRepository` | `issues` |
| changelog | `officialDocumentation` | `changelog` |
| release notes | `officialDocumentation` | `releaseNotes` |
| releases | `releaseFeed` | `releases` |

Registry sources remain adapter-owned, such as `npm:react:registry`, with `registryAuthoritative` authority and `publisher` trust. Registry facts are authoritative for their registry, but publisher-entered URL fields default to `publisherProvided`, `publisher`, and `unverified`. No URL is labelled `official` or `officialProject` from package name, organization name, or domain similarity.

`verified` is possible only when two distinct registry source IDs assert the same canonical relationship for the same package ID. Duplicate fields in one registry record are not independent corroboration. Package IDs are intentionally not merged across npm and PyPI merely because their URLs match; cross-ecosystem project equivalence is deferred.

## Canonical public URLs and source IDs

Only portable HTTPS URLs are emitted. Resolution rejects malformed values, HTTP, non-web schemes, embedded credentials, query strings, localhost, loopback, link-local and private IP literals. Fragments are removed. Hosts are normalized by the URL parser, root and path trailing slashes are normalized consistently, `git+https:` repository values become HTTPS, and a GitHub repository `.git` suffix is removed. No DNS lookup, redirect, or request occurs. Meaningful paths remain distinct: a GitHub repository and its `/issues` page are separate records.

Non-registry IDs are package-scoped and role-qualified:

```text
npm:react:documentation:<sha256(canonical-url)>
npm:react:repository:<sha256(canonical-url)>
pypi:fastapi:changelog:<sha256(canonical-url)>
```

They contain no local path, cache key, timestamp, credential, or random value. The same package, compatible role group, and canonical URL always produce the same ID. Homepage and documentation use one compatible documentation group when the URL is identical, preserving both sorted support roles. Repository and issue URLs remain separate even when hosted by the same service.

## Deduplication and conflict behavior

Candidates merge only when package ID, canonical URL, and compatible role group match. Different roles do not conflict automatically. If the same package asserts two distinct URLs for the same role, the resolver keeps both records, adds symmetric sorted `conflictsWith` references, and emits a non-retryable `SOURCE_CONFLICT` warning for each conflicting record. It never chooses one URL silently or attempts semantic conflict resolution.

All packages, source IDs, sources, supports, trust evidence, conflict references, and warnings use code-unit lexical ordering. The graph therefore does not depend on adapter completion order.

## Privacy, safety, and limitations

The graph contains normalized public URLs and no raw registry payload, response headers, source content, credentials, query tokens, local paths, or cache implementation details. Unsafe candidates are omitted without a public warning because no fetch occurred to establish that a source is missing.

MVP-02-06 intentionally does not fetch websites, crawl documentation, call GitHub APIs or Releases, follow redirects, verify ownership, discover community resources, calculate numeric trust scores, assemble a Knowledge Manifest, add a CLI command, compare versions, analyze breaking changes, or perform AI/LLM reasoning.
