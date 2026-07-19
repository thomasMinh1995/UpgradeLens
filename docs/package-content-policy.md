# npm package content policy

UpgradeLens treats the tarball produced by `npm pack` as the authoritative
public package boundary. Repository evidence can remain tracked without
becoming npm consumer content.

## Included content

`package.json.files` explicitly includes the executable, public runtime source,
schemas, evaluation datasets, user-facing documentation, license, and README.
The package guard additionally requires critical assets such as:

- `bin/upgradelens.js` and the public runtime entry points;
- Migration Planning qualification and extractive-candidate schemas;
- Migration Planning v1 and v2 golden datasets;
- CLI progress, qualification-resolution, and package-policy documentation.

The guard reads actual gzip tar entries from a fresh `npm pack --json`; it does
not infer package contents from the working tree.

## Repository-only CLI capture evidence

CLI transcripts, screenshots, environment summaries, and manifests use the
direct-child convention:

```text
docs/*-cli-captures/
```

They are retained in Git for release review but excluded by the path-specific
`package.json.files` rule:

```text
!docs/*-cli-captures
```

The rule intentionally does not exclude all documentation. User-facing
Markdown remains package-visible.

Capture helper programs under `scripts/` or `tools/` are also repository-only.
Those directories are outside the package allowlist. The guard recognizes
known release capture trees, the future direct-child naming convention, and
capture-helper path patterns as forbidden tarball entries.

## Validation

Run:

```text
npm run check:package
```

The check fails when an actual tarball:

- contains a capture evidence path or capture helper; or
- omits any required public asset.

`npm run check` runs the repository tests and this package check. Focused guard
tests also verify stable path normalization, the future capture convention,
missing-required-asset failures, injected forbidden-path failures, and the
actual npm tarball.

Package validation for a release should inspect the real tar entries, perform
an isolated install of the produced tarball, and smoke-test the packaged
version, help, public import, and default analysis command. Generated tarballs,
installation directories, caches, and raw provider data are never committed.

## Privacy and compatibility

Capture evidence must be sanitized before staging: no credentials,
authorization material, private endpoints, raw provider payloads, hidden
reasoning, or machine-specific absolute paths. Exclusion from npm is a package
size and privacy boundary, not a substitute for repository privacy review.

This policy changes only package composition. It does not alter qualification,
progress, impact, evidence, migration-planning, or provider semantics.
