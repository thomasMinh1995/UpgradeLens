# MVP-05 Deterministic Context Runtime

## Scope

MP-02 prepares trusted, immutable input for the later migration-checklist generator. It performs no AI call, provider/network access, source scan, artifact write, CLI integration, or migration instruction generation.

The public orchestration API is `prepareMigrationChecklistContexts(input, options)`. `input` may be a repository root or an explicit `sources` object. The lower-level APIs are `loadMigrationChecklistInputs` and `buildMigrationTaskContexts`. The MP-03 consumer of this output is documented in [`mvp-05-provider-neutral-generator.md`](./mvp-05-provider-neutral-generator.md).

## Seven input artifacts and lineage

The loader reads the raw bytes of:

1. Project Manifest;
2. Knowledge Manifest;
3. Knowledge Evidence Bundle;
4. Version Analysis;
5. Usage Index;
6. Repository Impact;
7. Repository Impact Evidence.

Every public artifact is validated with its existing schema and invariant validator. Digests are SHA-256 over the exact bytes that were read; JSON reserialization is never used as lineage proof.

The validated graph is:

```text
Project Manifest ──> Knowledge Manifest ──> Knowledge Evidence Bundle
       │                    │                         │
       └────────────────────┴─────────────────────────┴──> Version Analysis
       │                                                   │
       └───────────────────────────────────────────────────┴──> Usage Index
       │                                                        │
       └────────────────────────────────────────────────────────┴──> Repository Impact
       │                                                             │
       └─────────────────────────────────────────────────────────────┴──> Repository Impact Evidence
```

Only lineage fields that exist in the current schemas are compared. A mismatch is fatal and reports the consumer, upstream artifact, field, declared value, and actual exact-byte value with code `LINEAGE_MISMATCH`.

## Cross-artifact trust checks

Before any context is built, MP-02 verifies:

- exact Project and Knowledge dependency occurrence identity;
- one unambiguous Version Analysis occurrence per `projectId + packageId` Usage identity;
- package/ecosystem/registry identity across Project, Knowledge, and Version Analysis;
- unique finding identity within each analysis result;
- Version finding evidence refs against Version evidence metadata, bundle content, Knowledge source metadata, and package provenance;
- Usage dependency identity against Version Analysis;
- Repository Impact result/finding identity and exact matcher output against Usage symbols/files;
- Repository Impact Evidence identity, reason, symbol, and file records against Repository Impact and Usage.

Unknown, cross-package, cross-project, or ambiguous references are fatal. Corruption is not converted into a package-local fallback.

## Eligibility precedence

Action-generation eligibility is separate from location eligibility.

Action precedence is:

1. non-analyzed Version result → `NOT_ANALYZED`;
2. stale/conflicted selected evidence → `INVALID_OR_CONFLICTED_EVIDENCE`;
3. missing target, over-bound summary, or no bounded target-scoped official/publisher evidence → `NO_GROUNDED_ACTION`;
4. otherwise → `ELIGIBLE`.

An `ELIGIBLE` context is permission for MP-03 to inspect bounded evidence. It is not proof that the evidence contains an entailed migration instruction. Evidence kinds are used only as a deterministic allowlist and priority; `migrationGuide` is preferred, but its label is not semantic proof.

Location eligibility is:

- `POSITIVE_USAGE_MATCH` when an exact validated Impact Evidence symbol/file exists;
- `NO_POSITIVE_USAGE_MATCH` for a narrowly supported single Node.js-project JS/TS run with no positive match;
- `UNSUPPORTED_USAGE_COVERAGE` when project-level coverage cannot be proven;
- `NOT_ANALYZED` when Version Analysis did not complete.

Unsupported coverage never blocks a dependency-level action context when action evidence is otherwise eligible. It leaves locations empty and records an explicit limitation. No negative state is converted into “unused” or “safe.”

## Context boundary and evidence bounds

Each eligible context contains only:

- dependency occurrence and declared/current/target version facts;
- Version Analysis result and breaking-finding identity;
- bounded finding summary and applies-to versions;
- selected Knowledge evidence records and an exact evidence allowlist;
- URLs copied only from validated Knowledge source metadata;
- optional positive `impactEvidenceId + symbol + file` locations;
- action and location eligibility;
- upstream and mandatory human-review reasons;
- deterministic limitations.

It excludes repository source, unrelated dependencies/evidence, provider configuration, arbitrary URLs, commands, code/patches, prerequisites, ordering, rollback, effort, numeric confidence, and safety claims.

Default bounds are six evidence records, 24,000 total evidence characters, and a 2,000-character finding summary. Evidence is selected by stable kind priority and ID, deduplicated by content digest, and never truncated. Evidence must be official/publisher-controlled, available, fresh, action-relevant by structured kind, and explicitly scoped to the target release. Bounds are configurable positive integers for deterministic tests and future policy revisions.

## Fallback records

`fallbackRecords` use the normalized dependency/finding shape accepted by the MP-01 builder:

- skipped/failed results preserve upstream reasons and contain no generated finding/action;
- no grounded action produces only a deterministic `MANUAL_REVIEW_REQUIRED` record;
- stale/conflicted evidence fails closed to deterministic manual review;
- unsupported usage is recorded as a location limitation and does not replace otherwise eligible dependency-level action context.

Fallbacks retain only useful official evidence refs, use existing stable `analysisResultId` and finding IDs, and are sorted deterministically.

## Fatal errors versus expected ineligibility

Missing/malformed/schema-invalid artifacts, lineage mismatch, unknown reference, ambiguous identity, and inconsistent impact location are fatal input errors. Expected absence of analysis, action evidence, or supported usage coverage produces a normalized fallback or limitation.

Returned loaded artifacts, contexts, fallbacks, lineage, and summary are deep-cloned and deeply frozen. The runtime holds no mutable reference to parsed upstream values.

## Deferred work

- MP-03 implements prompt construction, structured AI output, exact excerpt and conservative trust checks, and generated migration-instruction drafts.
- MP-04 implements task-specific evaluation, adversarial cases, and provider qualification; see [`mvp-05-migration-evaluation-and-qualification.md`](./mvp-05-migration-evaluation-and-qualification.md).
- MP-05 implements final checklist assembly/writer, experimental CLI orchestration, and presentation renderers; see [`mvp-05-migration-checklist-orchestration.md`](./mvp-05-migration-checklist-orchestration.md).

The current Usage Index exposes analyzer coverage globally rather than per project. MP-02 therefore treats multi-project, non-JS/TS, warning-bearing, or otherwise unprovable negative coverage conservatively. A future analyzer-coverage schema can improve location eligibility without changing action eligibility.
