# MVP-02 Knowledge Research Orchestration

MVP-02-07 connects the validated Research Plan, injected npm/PyPI registry adapters, and Source Provenance Resolution into one deterministic internal execution. It consumes the Project Manifest lineage already captured by Research Planning; it does not rescan a repository or read package-manager files.

> Knowledge Research Orchestration executes and combines deterministic research components. It does not publish the Knowledge Manifest, compare versions, or perform AI reasoning.

```text
Loaded Project Manifest → Research Plan → bounded adapter research
                                           │
                                           ▼
                              complete registry result set
                                           │
                                           ▼
                                Source Provenance Resolution
                                           │
                                           ▼
                           internal KnowledgeResearchResult
```

## Input, adapter selection, and execution

The orchestrator first calls `validateResearchPlan`. An invalid plan is a fatal internal contract failure and no adapter is invoked. A researchable package selects its adapter solely through `package.registry`: `npm` selects the npm-compatible adapter and `pypi` selects the PyPI adapter. Package-manager, installer, manifest, dependency type, and package-name heuristics never affect selection.

Adapters are injected explicitly. The default concurrency is four and the accepted range is 1–32. A small worker pool schedules at most that many requests at once; output is sorted after all work completes, so adapter completion order does not affect the result. Cancellation is intentionally deferred because current adapters do not expose an orchestration-level signal contract.

Registry base URLs and TTLs remain adapter configuration rather than a duplicate orchestration policy. The orchestration policy presently owns only bounded concurrency; it accepts no credentials, private-registry settings, installer configuration, or source-crawling policy.

Each package is isolated. Adapter `resolved`, `partial`, `notFound`, and `unavailable` facts are preserved. A missing adapter or unexpected adapter exception becomes a sanitized `unavailable` result with `REGISTRY_UNAVAILABLE`; no stack, response, header, token, or cache path is retained. A missing adapter is a defensive integration diagnostic, not a new public warning code.

## Result contract

`KnowledgeResearchResult` is internal and starts at `resultVersion: "1"`; it is independent from the Knowledge Manifest schema version. It contains:

- immutable Project Manifest lineage and Research Plan version;
- execution timestamps, duration, concurrency, total and per-registry invocation counts, source/cache/warning counts, and a sorted per-package outcome list;
- package records close to the Knowledge Manifest package shape, with all Research Plan occurrences attached;
- normalized source records, warnings, invalid occurrences, and unsupported ecosystem aggregates;
- canonical summary totals.

Invalid references remain in `invalidOccurrences`, with an `INVALID_PACKAGE_REFERENCE` warning that has no invented package ID. Unsupported ecosystem aggregates remain in `unsupported` and do not invoke an adapter or create a fake npm/PyPI package. `partialFailureCount` counts only researched package records whose status is not `resolved`; invalid occurrences are reported separately. A registry-resolved package becomes `partial` when Source Provenance Resolution reports a `SOURCE_CONFLICT` for that package. Missing optional URLs do not make a package partial.

## Sources, cache outcomes, and warnings

Source Provenance Resolution runs once after every registry result is available. This allows source conflicts and future corroboration rules to see the complete package result set. Its package source IDs replace adapter-only package source IDs, and every source reference is validated before the result is returned.

Cache aggregation preserves current adapter meanings:

| Outcome | Counted as |
| --- | --- |
| `hit` | fresh cache hit |
| `miss` | fetched after no usable cache entry |
| `revalidated` | expired entry replaced by a normal fresh fetch, not HTTP `304` |
| `corrupted-replaced` | corrupted entry replaced after a valid fetch |
| `corrupted` | detected corruption without a successful replacement |

Adapter, provenance, and invalid-reference warnings are normalized, deduplicated, and sorted by package ID, code, source ID, and message. Unsupported planning warnings remain internal planning metadata until a later public contract explicitly adopts them.

## Invariants and privacy

The runtime validator checks Research Plan lineage, one result per researchable package, status/cache/summary arithmetic, source and warning references, occurrence attachment, canonical ordering, provenance graph validity, timestamps, and result version. It rejects absolute local paths, credentials, query tokens, cache keys, store paths, ETag/Last-Modified values, raw headers, response bodies, and stack traces.

No public artifact is written. Knowledge Manifest assembly, a research CLI, GitHub/documentation fetching, retry orchestration, version comparison, breaking-change analysis, and AI behavior remain outside MVP-02-07.
