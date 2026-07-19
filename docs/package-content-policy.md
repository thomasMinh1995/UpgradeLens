# npm package content policy

DepVerdict treats the tarball produced by `npm pack` as the authoritative public
package boundary. Repository evidence can remain tracked without becoming npm
consumer content.

## Documentation categories

Documentation has an explicit ownership and distribution category:

| Category | Purpose | npm policy |
| --- | --- | --- |
| Runtime-required | Files required for executable, schema, dataset, or API behavior | Required |
| User-operational | Installation, CLI, compatibility, troubleshooting, and feedback help useful without GitHub access | Included when current and sanitized |
| Trust/provenance evidence | Stable architecture, identity, release, and package-boundary decisions needed to interpret shipped behavior | Included selectively and may be required |
| Maintainer review | Readiness reports, rerun inventories, release gates, and operational evidence | Repository-only under `docs/reviews/` |
| Announcement/promotional | Reusable launch copy and community announcements | Repository-only under `docs/announcements/` |
| Capture/private/transient | Screenshots, transcripts, environment captures, secrets, local artifacts, and runtime output | Forbidden |

New maintainer reviews and announcements must use their category directories.
Historical technical studies at the root of `docs/` retain their existing paths
as bounded trust/provenance records; this decision does not rename historical
evidence.

## Included content

`package.json.files` includes executables, public runtime source, schemas,
evaluation datasets, user-facing documentation, stable trust/provenance
documents, the license, and README. It explicitly excludes maintainer reviews,
announcements, and CLI capture trees.

The package guard requires 32 critical assets, including:

- `bin/depverdict.js`, the bounded `bin/upgradelens.js` compatibility wrapper,
  and public runtime entry points;
- schemas and datasets required for runtime validation and offline evaluation;
- current architecture, CLI progress, package policy, release, compatibility,
  and qualification-resolution documentation;
- the Technical Preview feedback guide;
- the REL-03 package-documentation and qualification-evidence decisions.

The guard reads actual gzip tar entries from a fresh
`npm pack --json --ignore-scripts`; it does not infer package contents from the
working tree. Lifecycle scripts are disabled for manifest production so a
future `prepack` hook cannot recurse into the guard.

## Repository-only documents and captures

These paths are repository-only:

```text
docs/reviews/**
docs/announcements/**
docs/*-cli-captures/
```

The matching `package.json.files` exclusions are:

```text
!docs/reviews/**
!docs/announcements/**
!docs/*-cli-captures
```

The package guard independently rejects those categories if a future manifest
change leaks them into a tarball. Capture helper programs under `scripts/` or
`tools/` are also repository-only because those directories are outside the
package allowlist.

## Qualification evidence

The public qualification-record schema and resolution documentation are shipped.
A live or project-local machine-readable qualification record is not. Until a
separate provenance contract is accepted, the guard rejects qualification JSON
outside schema directories.

See
[`rel-03-packaged-qualification-evidence.md`](decisions/rel-03-packaged-qualification-evidence.md)
for the architecture decision.

## Validation

Run:

```text
npm run check:package
```

The check fails when an actual tarball:

- contains a maintainer review, announcement, capture, environment, credential,
  local-machine, or private qualification artifact;
- omits any required public asset;
- contains an invalid, traversing, absolute, or duplicate normalized entry;
- contains numeric-copy, parenthesized-copy, copy/duplicate-label, or backup
  filenames in packaged runtime, executable, schema, or evaluation areas; or
- contains a protected implementation file that is not tracked by Git during a
  strict release check.

Git correlation is supplemental. In a source archive without Git metadata, the
structural tarball rules still run and Git absence does not fail by itself.
Documentation is outside strict copy-name matching so intentional historical
document identities remain valid.

`npm run check` runs the repository tests and this package check. Focused guard
tests verify category exclusions, stable path normalization, capture conventions,
missing required assets, invalid paths, deterministic diagnostics,
tracked/untracked policy, valid numeric-name false positives, and isolated actual
tarballs.

The guard reports findings and exits non-zero; it never deletes or rewrites them.
Package validation should inspect real tar entries, perform an isolated install,
and smoke-test both CLI names, the ESM API, exports, and schemas. Generated
tarballs, installation directories, caches, and raw provider data are never
committed.

## Privacy and compatibility

Repository evidence must still be sanitized before staging. Exclusion from npm is
a package-size and privacy boundary, not a substitute for repository privacy
review.

This policy affects future packages only. It does not modify the already published
`0.6.0-alpha.1` artifact and does not alter qualification, progress, impact,
evidence, migration-planning, provider, or CLI semantics.
