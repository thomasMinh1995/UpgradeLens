# TS-FIX-01 — Exact Duplicate Occurrence Target Selection

## Status

Accepted before implementation.

## Discovery

The persisted artifact chain does not currently expose a standalone
dependency-occurrence ID:

- Project Manifest dependencies are identified by project plus declaration
  facts.
- Knowledge Manifest occurrences persist project, repository-relative
  manifest, dependency type, declared name, and declared version.
- Version Analysis persists the same dependency facts and includes declared
  version in its versions record. Its result ID is target/context-specific, so
  it is not a suitable pre-target selector identity.
- Upgrade Decision and Migration Checklist preserve the Version Analysis
  occurrence/result lineage.

The canonical occurrence identity used by analysis and cross-artifact loaders
is the tuple:

```text
projectId
canonical packageId
repository-relative manifest
dependencyType
declaredName
declaredVersion (including null)
```

These facts are deterministic under repeated discovery, portable between
repository locations, and independent of array order, absolute paths,
timestamps, and random values. Exact duplicate tuples are not independently
addressable and must be rejected as an identity collision.

The public target selector currently parses in `src/target-selector.js`.
`src/cli.js` resolves all dependency inputs, resolves selectors before AI
runtime construction, and assigns explicit targets by the fuller internal
occurrence key. Ambiguity retry guidance is also built in
`src/target-selector.js`. This creates the defect: retry syntax omits declared
identity even though target assignment includes it.

The exact flow is:

```text
Project Manifest dependency
→ resolveDependencyAnalysisInputs
→ parseTargetSelector
→ resolveTargetSelectors
→ explicit target assignment by occurrence key
→ DependencyAiContext / Version Analysis result
→ Upgrade Decision (USER_SELECTED_TARGET only for explicit target)
→ Migration Checklist v2 (decision/result identity preserved)
```

Repeated selectors are reconciled by the canonical target occurrence key.
Selecting one occurrence more than once currently fails with
`TARGET_SELECTOR_CONFLICT`; that contract remains unchanged. Scoped npm
package IDs are parsed as field values rather than split on `@`, and Python
packages use their canonical `pypi:<normalized-name>` ID.

## Decision

Add the optional public field:

```text
occurrence=sha256:<64 lowercase hexadecimal characters>
```

The token is the SHA-256 digest of canonical JSON containing a versioned
identity envelope and the canonical occurrence tuple above. The hash is
derived from already-persisted portable facts; it is not a newly persisted
schema field and does not change artifact schemas or business policy.

Ambiguity errors will:

1. sort candidates by canonical occurrence facts;
2. emit one copy/paste-ready selector per candidate containing the token;
3. display project, manifest, type, and a safely redacted declared value so a
   human can associate each opaque token with the declaration;
4. never print an absolute path or credential-bearing URL.

Raw declared constraints are not inserted into the comma-separated selector
grammar. This avoids ambiguous parsing for commas, equals signs, whitespace,
environment markers, workspace references, and URLs. An array index is not
used because it changes with discovery order. A target-specific Version
Analysis result ID is not used because it does not exist before target
assignment.

## Resolution contract

- Without `occurrence`, existing `package + target` and
  `package + target + project + manifest + type` selectors retain their
  current behavior when unique.
- With `occurrence`, the resolver first resolves exactly one canonical
  occurrence token, then verifies package/project/manifest/type facts. A stale
  token is `TARGET_SELECTOR_NOT_FOUND`; conflicting facts are
  `TARGET_SELECTOR_CONFLICT`.
- Ambiguous, stale, conflicting, invalid-version, or duplicate-identity input
  fails before AI runtime construction.
- One selected duplicate receives the explicit target; every other duplicate
  retains its independent registry-default state.
- Selector and dependency input ordering cannot change target assignment.

The token is intentionally opaque but not ambiguous in UX: every generated
token is paired with the visible, redacted declaration facts from which the
human chooses. It contains no secret material and cannot reveal the original
constraint.
