# MVP-02 Knowledge Manifest Generation and CLI

MVP-02-08 turns the validated internal `KnowledgeResearchResult` into the portable Knowledge Manifest consumed by MVP-03. The public artifact is written only after JSON Schema and runtime invariant validation pass.

```text
Project Manifest → Research Plan → Knowledge Research
                                      │
                                      ▼
                         KnowledgeResearchResult
                                      │
                                      ▼
                      Knowledge Manifest builder
                                      │
                                      ▼
                    schema + runtime validation
                                      │
                                      ▼
                 atomic knowledge-manifest.json write
```

## Builder and public contract

The builder creates Knowledge Manifest schema `1.0.0` without mutating the internal research result. It preserves package and source IDs, occurrences, registry facts, provenance, warnings, execution timestamps, and public cache totals. Internal execution-only fields such as adapter invocation detail, cache corruption bookkeeping, invalid occurrence evidence, unsupported ecosystem aggregates, and source-candidate field paths do not enter the public artifact.

Research occurrences contain internal ecosystem and normalized-name fields while planning and orchestration run. The builder projects them onto the public occurrence contract, which retains project path, manifest path, dependency type, declared name, and declared version only.

The builder validates with the existing Draft 2020-12 [Knowledge Manifest schema](../schemas/knowledge-manifest.schema.json) and `validateKnowledgeManifestInvariants`. Invalid input throws before any writer is called.

## Deterministic research identity

`research.researchId` is `sha256` over canonical JSON containing:

1. the exact Project Manifest artifact digest;
2. a canonical fingerprint of the public research policy; and
3. source digests ordered by source ID.

A source uses its snapshot content digest when available. An unfetched source has a digest of its canonical public provenance fields instead. Timestamps, temporary filenames, adapter completion order, and random values do not affect the ID.

## Atomic serialization

The writer uses UTF-8, two-space JSON indentation, and one final newline. It creates the parent directory, writes a sibling temporary file, flushes it, closes it, then renames it over the destination. Existing manifests are replaced atomically; a failed write never exposes a partial target file.

The default artifact location is:

```text
.upgradelens/knowledge-manifest.json
```

## CLI

Run discovery first, then research the generated Project Manifest:

```bash
upgradelens discover .
upgradelens research .
```

`research` supports:

```bash
upgradelens research .
upgradelens research . --output artifacts/knowledge.json
upgradelens research . --stdout
upgradelens research . --offline
```

`--stdout` emits only pretty Knowledge Manifest JSON. Normal execution reports concise progress to standard error. `--output` is a portable path relative to the repository root.

## Offline mode

`--offline` configures npm and PyPI adapters for fresh-cache-only research. No registry request is attempted. Fresh cache entries normalize normally. Missing, expired, or corrupted entries do not fall back to networking or stale data; the package becomes `unavailable` with an `OFFLINE_CACHE_MISS` warning. Existing cache details, paths, keys, headers, validators, and response bodies remain private.

## Boundary

MVP-02-08 writes the public Knowledge Manifest but does not implement version comparison, release analysis, GitHub APIs, documentation crawling, source-content fetching, breaking-change analysis, impact analysis, migration planning, AI, or a new analysis artifact. MVP-03 consumes the immutable manifest as its input.
