# OSS-02 Package Guard Hardening Architecture

## Decision

UpgradeLens treats the entries read from the actual gzip tarball produced by
`npm pack --json` as the package authority. The guard remains a repository release
check, not a consumer lifecycle hook or a general source-tree scanner.

## 1. Current boundary

The existing guard already invokes `npm pack --json`, reads the resulting `.tgz`,
and validates tar entry paths. It does not rely only on a working-tree walk.
However, its pure validation layer currently checks only capture exclusions and 20
required paths. It does not reject copy/backup names, invalid or duplicate manifest
paths, or packaged untracked implementation files.

## 2. Manifest production and recursion safety

`inspectNpmPackage` remains the manifest producer:

1. create isolated temporary pack and npm-cache directories;
2. run `npm pack --json --ignore-scripts`;
3. read the actual tarball entries;
4. correlate those entries with optional Git state;
5. run the pure validator;
6. delete only the task-owned temporary directory.

`--ignore-scripts` makes manifest production independent of package lifecycle
scripts. The current `package.json` has no `prepack`, `prepare`, `prepublishOnly`, or
install lifecycle hook, and `check:package` is not invoked by npm lifecycle. Thus
there is no `check:package → npm pack → prepack → check:package` recursion. Tests
call the pure validator directly, while one isolated integration test exercises
actual npm inclusion.

## 3. Protected implementation areas

Strict filename and optional untracked-file policy applies to actual packaged files
under:

- `package/bin/`: executable entry points;
- `package/src/`: runtime implementation and public exports;
- `package/schemas/`: public data contracts;
- `package/eval/datasets/`: published evaluation cases;
- `package/eval/migration-planning/`: published versioned evaluation datasets;
- `package/eval/schemas/`: published evaluation contracts.

`scripts/` and `test/` are repository-only under the current `files` allowlist, so
they cannot be checked as package entries. Their accidental inclusion would first
require an explicit package-boundary change. Documentation is still checked by the
existing capture and general forbidden-entry rules, but is excluded from the
copy-name grammar because legitimate historical names such as the TS-FIX-01
duplicate-occurrence architecture document must remain valid.

## 4. Suspicious filename grammar

Within protected areas, a basename is suspicious when it has:

- a whitespace-delimited numeric copy suffix immediately before its extension,
  including multi-extension files: `runtime 2.js`, `schema 3.schema.json`;
- a parenthesized numeric suffix: `runtime (2).js`;
- a terminal copy label delimited by whitespace, hyphen, or underscore:
  `runtime copy.js`, `runtime-copy.js`, `runtime_duplicate.js`;
- a backup/editor suffix: `~`, `.bak`, `.orig`, `.save`, `.tmp`, `.swp`, `.swo`.

The numeric rule requires a copy delimiter and terminal copy position. It therefore
accepts `sha256.js`, `oauth2.js`, `v2-runtime.js`, `schema-v2.json`,
`mp-r02-policy.js`, `python3.md`, and `fixture-2fa.json`.

## 5. Portable path policy

The pure validator first rejects absolute paths, drive-letter paths, NUL bytes,
empty/dot segments, parent traversal, and paths outside the npm `package/` root.
Backslashes are normalized to `/` only after the original path has passed the
absolute/traversal checks. It then detects duplicate normalized entries before
deduplication and sorts diagnostics by stable reason code and portable path.

## 6. Git-state policy

The release command asks Git for tracked entries and untracked non-ignored entries.
In strict release mode, an actual packaged untracked regular file under a protected
area fails with `UNEXPECTED_PACKAGED_UNTRACKED_IMPLEMENTATION_FILE`.

Git absence or a source archive without `.git` is represented explicitly as
`GIT_METADATA_UNAVAILABLE`; it does not fail package-content validation by itself.
Suspicious filename, required-asset, forbidden-entry, invalid-path, and duplicate
entry rules remain authoritative without Git. Git command errors other than
repository absence are surfaced as operational errors, not silently treated as a
clean tracked state. There is no generated-file allowlist because the current
package has no repository-owned generated public implementation path.

## 7. Diagnostics and exit contract

The validator returns a frozen structured result with normalized entries, summary,
Git state, and violations. Every violation has a stable `code` and relative portable
`path`. Policy failures render:

```text
Package guard failed.

REASON_CODE
- relative/path
```

Reasons and paths are sorted, output is bounded, totals are retained in the
structured result, file contents are never printed, and the script exits non-zero.
Pass output reports package entry count, zero suspicious artifacts, and the single
authoritative required-asset count.

## 8. Isolated adversarial tests

Pure unit tests use in-memory manifest entries. The npm-boundary integration test
creates an isolated temporary package containing an untracked `src/runtime 2.js`,
runs npm pack with lifecycle scripts disabled, proves npm includes the file, and
passes those actual tar entries to the validator. Temporary fixtures and npm caches
live outside the repository and are removed by the test. Mutation checks compare
fixture bytes before and after validation.

## 9. Manifest determinism layer

The validator sorts normalized entries and diagnostics, detects duplicate normalized
paths, and produces byte-identical structured/rendered results for reversed input.
Release validation may repeat `npm pack` and compare actual entry inventories.
Neither a file count nor a tarball digest is a permanent business invariant.

## 10. Explicit scope boundary

OSS-02 preserves the existing required assets, capture exclusion, `.env`, local
artifact, credential/authorization-file, qualification-input/record, bin, and export
target checks. It adds structural package hygiene only. It does not inspect arbitrary
file content, detect malware, scan secrets generally, alter product behavior, pin a
manifest snapshot, delete findings, or run on consumer installation.
