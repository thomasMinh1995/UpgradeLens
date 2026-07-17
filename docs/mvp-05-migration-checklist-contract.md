# MVP-05 Migration Checklist Contract

## Purpose and boundary

`.upgradelens/migration-checklist.json` is a versioned, provider-neutral, human-review artifact. It records evidence-grounded review actions and deterministic fallback records. It is not an autonomous migration plan, safety certificate, patch, command runner, or migration execution log.

The initial schema is [`migration-checklist.schema.json`](../schemas/migration-checklist.schema.json), version `1.0.0`. MP-01 provides a pure builder, schema validator, invariant validator, stable item IDs, deterministic serialization, and grounding/eligibility policy. MP-02 exact-byte loading and upstream joins are documented in [`mvp-05-deterministic-context-runtime.md`](./mvp-05-deterministic-context-runtime.md).

`COMPLETE` never means “migration complete” or “safe to upgrade.” It only means all dependency checklist records in the normalized valid input contain structurally grounded actionable records.

## Artifact identity and lineage

The artifact contains `schemaVersion`, `generatedAt`, `generator`, repository identity, overall `status`, summary, dependency records, and limitations. `generatedAt` is mandatory input to `buildMigrationChecklist`; the builder does not read the clock.

`input` records the schema version, portable artifact path, and exact-byte digest for all seven required artifacts:

- Project Manifest, including repository identity;
- Knowledge Manifest, including `researchId`;
- Knowledge Evidence Bundle;
- Version Analysis;
- Usage Index;
- Repository Impact;
- Repository Impact Evidence.

MP-01 validates the lineage object shape and repository identity consistency. MP-02 calculates these digests from exact input bytes and verifies cross-artifact lineage before calling the builder. MP-03 generation and trust validation are documented in [`mvp-05-provider-neutral-generator.md`](./mvp-05-provider-neutral-generator.md). MP-04 task-specific gates are documented in [`mvp-05-migration-evaluation-and-qualification.md`](./mvp-05-migration-evaluation-and-qualification.md).

## Status taxonomy

| Status | Meaning |
| --- | --- |
| `COMPLETE` | Every normalized dependency record is `COMPLETE` and contains grounded actionable items. This is checklist completeness only. |
| `INCOMPLETE` | At least one record needs manual review, has unsupported usage coverage, conflicted/invalid evidence, or is mixed with a non-complete record. |
| `NO_GROUNDED_ACTION` | Analyzed input contains no structurally grounded action. It does not imply no migration work is required. |
| `NOT_ANALYZED` | All represented dependency results were skipped or failed. No migration action is present. |

Dependency and overall statuses are derived by the builder, not supplied as trusted input. A mixed artifact is fail-closed as `INCOMPLETE`.

## Eligibility taxonomy

Eligibility is not boolean. Each normalized context has a constrained `status` and `reasonCode`:

| Reason code | Eligibility status | Checklist status | Policy |
| --- | --- | --- | --- |
| `ELIGIBLE` | `ELIGIBLE` | `COMPLETE` | May contain deterministic items or AI-selected, deterministic-rendered migration guidance. |
| `NOT_ANALYZED` | `INELIGIBLE` | `NOT_ANALYZED` | Skipped/failed Version Analysis; no generated finding/action. |
| `NO_GROUNDED_ACTION` | `INELIGIBLE` | `NO_GROUNDED_ACTION` | Only deterministic `MANUAL_REVIEW_REQUIRED` fallback is permitted for a represented finding. |
| `UNSUPPORTED_USAGE_COVERAGE` | `INELIGIBLE` | `INCOMPLETE` | Absence from the Usage Index is not interpreted as dependency non-use or safety. |
| `INVALID_OR_CONFLICTED_EVIDENCE` | `INELIGIBLE` | `INCOMPLETE` | No AI-authored action; deterministic manual review only. |
| `MANUAL_REVIEW_REQUIRED` | `REVIEW_REQUIRED` | `INCOMPLETE` | No AI-authored action; deterministic manual review only. |

An analyzed dependency with multiple finding states is aggregated conservatively. Any mixed complete/no-action state is `INCOMPLETE`; invalid/conflicted evidence takes precedence, followed by unsupported usage coverage, then manual review.

## Checklist item taxonomy and basis

Item `kind` is limited to:

- `REVIEW_MIGRATION_INSTRUCTION` — review an instruction grounded in selected evidence;
- `REVIEW_CANDIDATE_USAGE` — review a deterministic positive symbol/file candidate;
- `VERIFY_OFFICIAL_REQUIREMENT` — verify an evidence-linked official requirement;
- `MANUAL_REVIEW_REQUIRED` — non-actionable deterministic fallback.

Item `basis` is either:

- `DETERMINISTIC`; or
- `AI_AUTHORED`.

All items have `requiresHumanReview: true`. The artifact has no approved/completed state. The legacy `AI_AUTHORED` wire value means AI-selected, deterministic-rendered guidance in extractive v2. Such an item is valid only when it:

- belongs to an `ELIGIBLE` finding;
- has kind `REVIEW_MIGRATION_INSTRUCTION`;
- references the enclosing `findingId`;
- carries at least one evidence ref declared by that finding and its dependency selected-evidence allowlist;
- has no repository location;
- requires human review.

All actionable item kinds require evidence. Ineligible contexts may contain deterministic manual-review fallbacks only.

## Grounding and cross-reference rules

Each dependency record preserves the upstream Version Analysis `analysisResultId`, dependency occurrence identity, analysis status, selected evidence allowlist, and version facts. Each finding preserves its upstream ID, summary, evidence refs, and declared positive impact locations.

MP-01 enforces:

- unique Version Analysis result IDs, finding IDs per result, and checklist item IDs across the artifact;
- stable item IDs derived from result, finding, item basis/kind/text, sorted evidence refs, sorted locations, and review state;
- stable ordering of dependencies, findings, evidence refs, items, locations, and limitations;
- finding evidence refs are in the dependency selected-evidence allowlist;
- item evidence refs are in both the finding and selected-evidence allowlists;
- item `findingId` equals the enclosing finding;
- each candidate location exactly matches a declared positive triple of `impactEvidenceId`, `symbol`, and `file`;
- repository locations are allowed only on deterministic `REVIEW_CANDIDATE_USAGE` items;
- AI-authored and manual fallback invariants;
- status, eligibility, version semantics, repository identity, and summary counts;
- schema rejection of additional properties.

Citation existence is structural grounding, not semantic entailment. MP-01 cannot prove that an instruction is actually supported by the cited text.

## Candidate location semantics

A location contains only:

- `impactEvidenceId`;
- `symbol`;
- `file`.

It is a candidate review location copied from positive Repository Impact Evidence. It is not a proven call site or semantic impact. The contract intentionally has no line, column, snippet, call count, or semantic-impact field. AI-authored items cannot own locations.

## Version uncertainty

The contract preserves Version Analysis version facts without recommendation semantics:

- `currentVersion` and `currentVersionSource` may be null;
- `exactBaseline` requires both values;
- `declaredConstraint` and `unsupportedBaseline` require both values to remain null;
- unknown baselines keep an unknown delta;
- `targetPolicy: registryLatest` identifies a registry fact, not a recommended target;
- no field can mark a target as recommended.

The contract does not infer a migration path from a version range or unknown installed version.

## Explicit exclusions

The schema has no fields for dependency ordering, inferred prerequisites, generated code, patches, auto-fix, shell/package-manager commands, rollback, effort, numeric confidence, migration execution status, safety certification, or transitive dependency completeness. Additional properties are rejected.

`instruction` is bounded text. MP-01 applies a small deterministic guard against obvious URLs, code/patch blocks, shell/package-manager commands, and safety claims. This is intentionally not NLP moderation and is not semantic proof. Later trust validation must still reject prohibited capabilities expressed indirectly.

## Deferred checks

### MP-02 — deterministic loader and context

Implemented as a separate read-only runtime. It validates all seven exact-byte artifacts, the full lineage/reference graph, bounded official evidence, independent action/location eligibility, immutable MP-03 contexts, and MP-01-compatible deterministic fallbacks.

### MP-03 — generator and trust validation

Implemented as a provider-neutral, package-local runtime. New application runs use the versioned extractive v2 schema: the model selects an exact allowlisted evidence span and deterministic code renders the human-review text. Conservative prohibited-capability guards, whole-candidate fail-closed rejection, and safe abstention/failure fallbacks remain. Exact excerpts establish provenance, not repository applicability. Historical free-form v1 remains for evaluation reproducibility. See [`GR-04-Versioned-Production-Extractive-Contract.md`](./GR-04-Versioned-Production-Extractive-Contract.md).

### MP-04 — evaluation and qualification

Implemented as a separate offline-first evaluation runtime. It measures raw candidate, trust containment, and published behavior with a strict multi-ecosystem dataset, versioned metrics and critical gates, transparent scorecard, and provider/model/task-specific qualification. The fake result is `QUALIFIED_WITH_LIMITATIONS`; no real provider has been qualified.

### MP-05 — presentation and orchestration

Implemented as an experimental opt-in application stage. It assembles MP-02/MP-03 output strictly through this MP-01 builder, enforces the MP-04 qualification identity, atomically writes the artifact, and renders a shared presentation-only view model. See [`mvp-05-migration-checklist-orchestration.md`](./mvp-05-migration-checklist-orchestration.md). Real-provider generation is not enabled by default.

No MP-01 module calls AI, network, filesystem loaders, source scanners, writers, CLI commands, or orchestration stages.
