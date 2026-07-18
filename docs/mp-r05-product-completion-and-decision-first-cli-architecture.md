# MP-R05 Product Completion and Decision-First CLI Architecture

## Decision

Keep `upgradelens analyze` as the primary product workflow and add two small,
orthogonal public controls:

- repeatable `--target <selector>` for structured caller-selected targets; and
- `--fail-on-incomplete` for CI that requires every trustworthy outcome to be
  free of review or data gaps.

Do not add a configuration framework, a new persisted domain artifact, source
editing, command execution, or provider fallback. Product completion is a
deterministic presentation/exit projection over persisted Version Analysis,
Upgrade Decision, and optional Migration Checklist v2 artifacts.

## Discovery record

1. The public CLI has no explicit-target input. `analyze` always invokes
   Version Analysis with `{ target: { policy: "registryLatest" } }`;
   `analyze-version --package` selects one canonical package but does not select
   a version.
2. The supported programmatic shape is
   `{ target: { policy: "explicit", version: "<version>" } }`. The ecosystem
   adapter normalizes the value before a context is built.
3. An occurrence cannot be selected safely by name alone. Resolution needs the
   canonical package ID and, when ambiguous, `projectId`, manifest, and
   dependency type. Declared version remains part of upstream occurrence
   identity but is not required from the user because the validated Project
   Manifest supplies it.
4. Scoped npm packages are already canonicalized as
   `npm:@scope/package`. The target parser must not split on `@`.
5. Python packages are normalized by PEP 503-style name normalization and
   represented as `pypi:normalized-name`. Versions are validated by the Python
   ecosystem adapter, not npm SemVer.
6. The same canonical package in multiple projects/workspaces produces
   multiple occurrences. An unqualified selector must fail with
   `TARGET_SELECTOR_AMBIGUOUS` and list stable candidate selectors; it must
   never choose the first occurrence or fan out implicitly.
7. The final console summary is built by `renderConsoleSummary` after the
   Markdown Report stage. Upgrade Decision and Migration Checklist renderers
   are appended after impact counts.
8. Current `COMPLETE`/`INCOMPLETE` values describe impact/checklist coverage,
   not whether the product workflow has a trustworthy terminal result. They
   remain compatible diagnostic fields and are not reused as product
   completion.
9. Fatal stage failures return 1, controlled cancellation returns 130, and
   `discover --fail-on-warning` returns 2. Package-local provider/output
   failures are persisted as failed Version Analysis results but a successful
   `analyze` pipeline currently returns 0.
10. Existing tests assert artifact retention and exit 0 for some direct
    `analyze-version` package-local failures. MP-R05 intentionally changes the
    product `analyze` exit contract; the stage command remains an artifact
    producer and reports its failed-result count without pretending that its
    result is a completed product analysis.

## Public target selector

Use a repeatable, key/value selector:

```text
--target package=<canonical-package-id>,target=<version>
--target package=<id>,target=<version>,project=<project-id>,manifest=<path>,type=<dependency-type>
```

Examples:

```text
--target 'package=npm:framework-a,target=2.0.0'
--target 'package=npm:@scope/package,target=3.1.0'
--target 'package=pypi:library-b,target=3.0.0'
--target 'package=npm:framework-a,target=2.0.0,project=node:apps/web,manifest=apps/web/package.json,type=dependency'
```

The grammar is deliberately not `name@version`, so scoped npm names require no
special-case split. Required keys are `package` and `target`; optional keys are
`project`, `manifest`, and `type`. Unknown/duplicate keys, non-portable
manifests, duplicate occurrence selection, unsupported adapters, and invalid
versions fail before provider construction.

Resolution is performed against validated `resolveDependencyAnalysisInputs`
facts. Zero matches produce `TARGET_SELECTOR_NOT_FOUND`; multiple matches
produce `TARGET_SELECTOR_AMBIGUOUS` with stable candidate guidance; invalid or
unsupported versions produce `TARGET_VERSION_INVALID`. Repeated selectors are
resolved as a set independently of CLI input order.

Selected occurrences receive an explicit target. Every unselected occurrence
continues to use `registryLatest`, so the default and mixed workflows never
convert registry facts into user intent.

## Product completion projection

The projection has closed outcomes:

```text
COMPLETED
COMPLETED_WITH_REVIEW
PARTIAL
INSUFFICIENT_DATA
FAILED
CANCELLED
```

Successful pipeline precedence is:

1. Any retained Version Analysis provider/output/runtime failure, or
   `ACTION_GENERATION_FAILED` handoff: `PARTIAL`.
2. Any selected explicit target with `INSUFFICIENT_EVIDENCE`, or more than half
   of occurrences unable to answer because of insufficient/missing analysis:
   `INSUFFICIENT_DATA`.
3. Any valid `PLAN_UPGRADE`, `UPGRADE_NOW`, `INVESTIGATE`, review-required
   decision, or coverage limitation: `COMPLETED_WITH_REVIEW`.
4. Otherwise: `COMPLETED`.

Fatal stage/config/schema/lineage errors are reported as `FAILED` and
controlled cancellation as `CANCELLED`; they do not publish a successful
completion projection.

`INVESTIGATE`, zero actions, and `KEEP_CURRENT` are not failures. Provider
failure precedence cannot be hidden by successful decision counts.

## Exit compatibility

Default `analyze` exits:

- 0 for `COMPLETED`, `COMPLETED_WITH_REVIEW`, and `INSUFFICIENT_DATA`;
- 2 for retained `PARTIAL`;
- 1 for fatal `FAILED`; and
- 130 for `CANCELLED`.

With `--fail-on-incomplete`, `COMPLETED_WITH_REVIEW` and
`INSUFFICIENT_DATA` also exit 2. The flag never fails solely because there are
zero migration actions or because all decisions are `KEEP_CURRENT`.

Exit 2 is reused as the existing non-fatal/strict public convention. This is an
intentional behavior change for `analyze` workflows that previously exited 0
despite retained provider/output failures.

## Presentation hierarchy

Console and Markdown lead with:

1. product completion and plain-language next step;
2. decision counts and occurrence table;
3. handoff counts/actions and review boundary;
4. failed occurrences, coverage/evidence/provider limitations, and recovery;
5. artifact paths; and
6. legacy impact counts and internal diagnostics.

`analyze --stdout` emits only a machine-readable completion summary on stdout;
progress remains on stderr. Qualification IDs, evidence IDs, lineage digests,
and raw reason codes remain in artifacts or diagnostic sections rather than
the default decision table.

## Experimental boundary

Migration Checklist v2 remains opt-in and experimental. The extractive
candidate/prompt identity is unchanged by the deterministic v2 envelope, but
MP-R05 does not claim new real-provider qualification or default enablement.
Public explicit targets can produce Upgrade Decisions without the experimental
stage; evidence-bounded migration actions still require the existing
experimental flag and qualification boundary.
