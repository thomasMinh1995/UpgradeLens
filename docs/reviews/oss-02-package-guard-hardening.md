# OSS-02 — Package Guard Hardening

## 1. Executive verdict

**Verdict: `PACKAGE_GUARD_DETECTS_ARTIFACT_DRIFT`**

UpgradeLens now validates the actual npm tarball, rejects the OSS-01 copy-artifact
class with stable reasons, correlates packaged protected implementation paths with
Git in strict release mode, preserves legitimate numeric identities, and retains
the prior required-asset and exclusion contracts. The current package, canonical
suite, clean install, CLI, ESM import, public exports, schemas, and evaluation
dataset identity all pass.

## 2. Root cause addressed

OSS-01 established that an external filesystem copy/conflict operation created
untracked `" 2"` and `" 3"` files and that broad `src/` and `schemas/` inclusion
allowed 76 copies into npm. The old guard remained green because it checked only
required assets and capture exclusions.

OSS-02 closes both enabling gaps:

- copy/backup filename policy is evaluated against actual tar entries; and
- an actual protected package entry that is not tracked by Git fails in strict
  release mode.

The guard reports findings only. It does not infer content ownership, merge, rewrite,
or delete a file.

## 3. Architecture decision summary

The complete decision is recorded in
`docs/oss-02-package-guard-hardening-architecture.md`. The implementation separates:

1. an actual-tarball producer using `npm pack --json --ignore-scripts`;
2. a pure structured package-entry validator;
3. an optional Git-state resolver;
4. deterministic policy rendering and CLI exit mapping.

The tarball is authoritative. Git is supplemental release evidence. File count and
tarball digest are observations, not business invariants.

## 4. Old guard gap

The previous guard already read gzip tar entries, so it was stronger than a
working-tree-only check. Its validator nevertheless:

- normalized through absolute/traversing input instead of rejecting it;
- deduplicated paths before it could detect duplicate normalized entries;
- recognized only CLI-capture paths and missing required assets;
- had no protected-area or suspicious-name grammar;
- had no tracked/untracked package correlation;
- emitted category-specific legacy text instead of stable reason codes;
- ran `npm pack` without an explicit lifecycle-recursion boundary.

That design could accept all 76 packaged OSS-01 copies.

## 5. New package-manifest boundary

`inspectNpmPackage` creates an isolated pack/cache directory, invokes npm with
lifecycle scripts disabled, reads the actual `.tgz`, retains the raw entry
multiplicity, resolves Git state when available, and passes structured input to the
validator. Task-owned temporary state is removed in `finally`.

The pure validator rejects:

- invalid absolute, drive-letter, traversal, outside-root, NUL, and empty paths;
- duplicate normalized package entries;
- forbidden capture, environment, credential-file, local-machine, archive, and
  private qualification artifacts;
- missing required package assets;
- suspicious artifact names in protected areas;
- packaged protected implementation paths not tracked by Git in strict mode.

## 6. Protected areas and filename grammar

Strict artifact policy follows the current public package structure:

| Protected prefix | Rationale |
| --- | --- |
| `package/bin/` | Executable entry points |
| `package/src/` | Runtime and public exports |
| `package/schemas/` | Public data contracts |
| `package/eval/datasets/` | Published evaluation cases |
| `package/eval/migration-planning/` | Versioned evaluation datasets |
| `package/eval/schemas/` | Evaluation contracts |

The grammar detects terminal copy conventions:

- whitespace numeric suffix: `runtime 2.js`, `schema 3.schema.json`;
- parenthesized numeric suffix: `runtime (2).js`;
- delimited terminal copy label: `runtime copy.js`, `runtime-copy.js`,
  `runtime_duplicate.js`;
- backup/editor suffix: `~`, `.bak`, `.orig`, `.save`, `.tmp`, `.swp`, `.swo`.

It does not treat arbitrary digits or the word `duplicate` anywhere in a path as
suspicious. Repository-only `scripts/` and `test/` are not actual package areas.
Docs keep capture/forbidden checks but are intentionally outside the strict copy-name
grammar.

## 7. Tracked/untracked policy

When Git metadata is available, every actual package entry in a protected area must
exist in `git ls-files`. This also catches ignored or otherwise untracked
implementation artifacts, not only the output of one untracked listing.

Git states are explicit:

- `available`: strict protected-path correlation runs;
- `GIT_METADATA_UNAVAILABLE`: source-archive mode; structural tarball policy still
  runs and Git absence does not fail;
- `GIT_COMMAND_UNAVAILABLE`: Git executable unavailable; structural policy still
  runs and the limitation is visible;
- unexpected Git command errors: operational failure, not a silently clean state.

No generated implementation allowlist was added because the package has no
repository-owned generated public implementation path.

## 8. False-positive protections

Focused tests accept:

- `src/sha256.js`;
- `src/oauth2.js`;
- `src/v2-runtime.js`;
- `src/mp-r02-policy.js`;
- `schemas/migration-checklist-v2.schema.json`;
- `schemas/contract-v2.json`;
- `eval/datasets/fixture-2fa.json`;
- `docs/python3.md` and `docs/mp-r02-architecture.md`;
- the intentional tracked TS-FIX-01 duplicate-occurrence architecture document;
- a valid actual source-archive package with no `.git`.

The OSS-01 retained numeric capture copies remain outside the npm package and cannot
fail the actual-manifest guard.

## 9. Diagnostics and exit contract

Every violation has a stable code and relative portable path. Results are sorted by
reason code, then path, independent of manifest enumeration order. Policy output is
bounded to ten paths per reason while retaining structured totals.

Failure format is:

```text
Package guard failed.

REASON_CODE (count)
- relative/path
```

No file content, local root, secret value, or stack trace is printed for policy
failure. CLI success returns zero; policy or operational failure returns non-zero.
The validator and CLI never delete or modify findings.

## 10. Focused tests

The focused package-guard suite contains 18 passing tests and covers:

- all required numeric, parenthesized, copy-label, and backup cases;
- multi-extension schema/test names;
- valid numeric-name false positives and the intentional document;
- absolute/traversing/outside-root paths and duplicate normalized entries;
- protected area mapping;
- strict packaged-untracked rejection;
- source archive behavior without Git;
- capture, `.env`, credential-file, local, and qualification exclusions;
- missing required assets;
- stable bounded diagnostics under reversed input;
- repeatability and input immutability;
- non-zero CLI policy mapping without stack traces;
- authoritative required assets;
- actual npm incident replay;
- actual no-Git source-archive pack;
- actual current package;
- lifecycle/consumer-hook absence.

The prior focused suite had 7 tests. OSS-02 replaces it with 18, a net increase of
11 while retaining every previous contract.

## 11. OSS-01 incident replay

An isolated temporary npm package is initialized as a Git checkout. Its canonical
`src/runtime.js` and package metadata are tracked; an untracked byte copy named
`src/runtime 2.js` is added. Actual `npm pack` includes both files.

The guard deterministically fails with:

```text
SUSPICIOUS_NUMERIC_COPY_SUFFIX
UNEXPECTED_PACKAGED_UNTRACKED_IMPLEMENTATION_FILE
```

The test verifies the copy's bytes and path still exist after validation and that
only the temporary pack/cache directory is removed. Thus the OSS-01 incident class
fails before release without guard-driven cleanup.

## 12. Current repository/package acceptance

| Contract | Result |
| --- | --- |
| Package version | `0.5.0` |
| Final explained package | 231 files: OSS-01's 229 plus the required OSS-02 architecture and report |
| Suspicious packaged artifacts | 0 |
| Required assets | 20/20 present |
| Capture evidence | 0 |
| Strict Git correlation | Pass |
| Public exports | 438 |
| Package count/digest pinning | Not used |

Both OSS-02 documents are intentional public docs under the existing `files`
contract. Production source count and product behavior are unchanged.

## 13. Canonical suite and package verification

| Check | Result |
| --- | --- |
| Focused package guard | 18/18 pass |
| Canonical suite | 627 total: 626 pass, 0 fail, 1 known skip |
| Test delta | +11 pass from the previous 616-test baseline |
| `git diff --check` | Pass |
| `npm run check:package` | Pass |
| Repeated dry-run manifests | Pass; identical normalized entry inventories |
| Repeated actual tarballs | Pass; byte-identical |
| Extracted suspicious-name scan | Pass; no unintended artifact |
| Clean install from final tarball | Pass |
| Packaged CLI `--version` / `--help` | `0.5.0` / exit 0 |
| ESM import / public exports | Pass / 438 |
| Schemas and evaluation dataset identity | Pass |

## 14. Lifecycle, recursion, and consumer-install safety

Manifest production uses `--ignore-scripts`. `package.json` has no `prepack`,
`prepare`, `prepublishOnly`, `preinstall`, `install`, or `postinstall` hook.
`check:package` is a contributor/release command only and cannot recurse through npm
pack.

The guard script and its tests remain repository-only because `scripts/` and `test/`
are outside the package `files` allowlist. They do not become production CLI
dependencies. A clean consumer install has no `.git`, does not execute the guard,
and passes.

## 15. Blocked/skipped checks

No OSS-02 acceptance check was blocked. The canonical suite retains one known
sandbox-loopback skip for the online CLI keep-alive listener; it is unchanged and
unrelated to package hygiene. Real-provider execution was deliberately not run.

## 16. Defects and remaining limitations

| Severity | Count | Detail |
| --- | ---: | --- |
| Blocker | 0 | None |
| High | 0 | None |
| Medium | 0 | None |
| Low/accepted limitation | 2 | Source archives cannot enforce Git correlation; docs intentionally use narrower filename policy |

Source archives still enforce all structural and suspicious-name policy, so the
OSS-01 numeric-copy incident remains blocked. Documentation is bounded by capture,
forbidden-artifact, path-validity, and duplicate-entry rules; broader docs filename
linting would create known false positives and is outside this release guard.

The guard is intentionally not a general malware or content-secret scanner. It does
not pin package count or digest.

## 17. Exact files changed/created

- Modified `scripts/package-content-guard.mjs`.
- Modified `test/package-content-guard.test.js`.
- Modified `docs/package-content-policy.md`.
- Created `docs/oss-02-package-guard-hardening-architecture.md`.
- Created `docs/reviews/oss-02-package-guard-hardening.md`.

No product runtime, public export, schema, dataset, package version, dependency, bin,
or package metadata file changed.

## 18. Pre-existing changes preserved

The untracked OSS-01 report, two earlier v0.5.0 review reports, all RR02 and
RR02-FIX-05 capture/rerun evidence, nine retained numeric-suffix capture copies,
ignored `.DS_Store`, ignored qualification material, and unrelated review output
were preserved. No cleanup command touched them.

The branch and commit baseline remained
`fix/public-preview-readiness` at
`74d57344db254d0109ea951dc7c44853cdad9be0`. No commit, merge, tag, push,
GitHub Release, npm publish, real-provider call, target-repository change, or
qualification regeneration occurred.

## 19. Final verdict and next gate

**Verdict: `PACKAGE_GUARD_DETECTS_ARTIFACT_DRIFT`**

The actual npm manifest is validated; OSS-01 replay fails deterministically; valid
numeric identities remain accepted; existing required and exclusion checks are
preserved and expanded; strict untracked policy is explicit; lifecycle recursion and
consumer installation are safe; current package and canonical validation pass; and
there is no Blocker or High defect.

**Gate: `PROCEED_TO_OSS_03_COMMUNITY_SCAFFOLDING`**

This gate authorizes only the next readiness task. It does not authorize commit,
merge, tag, release, public preview, or publish.
