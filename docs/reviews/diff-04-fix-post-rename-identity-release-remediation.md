# DIFF-04-FIX — Post-Rename Identity and Historical Release Remediation

## 1. Executive verdict and gate

```text
Verdict: DIFF_04_FIX_LOCAL_READY
Gate: PROCEED_TO_SEPARATELY_AUTHORIZED_GIT_WORKFLOW_AND_HOSTED_CI
```

Local package metadata, current operational documentation, release-evidence
policy, regression tests, and the approved five-release live metadata repair are
complete. The one-time evidence-gap statement was explicitly accepted.

This implementation report does not claim
`DEPVERDICT_REPOSITORY_DISTRIBUTION_IDENTITY_READY`; that verdict belongs to the
independent rereview after an exact-SHA hosted run.

## 2. Root causes

1. Package metadata and current operational documents still used the former
   repository URL or described the GitHub rename as pending.
2. GitHub Releases `v0.1.1` through `v0.5.0` had been retitled and had body-local
   branding changed as though they were originally DepVerdict releases.
3. No complete pre-rename release-ID/state/timestamp/asset inventory was retained.
   The missing past evidence cannot be reconstructed as proof.

## 3. Starting SHA and worktree scope

```text
Branch: feat/depverdict-rebrand
Starting SHA: dfe7e073b53f14be7b077b4102b64bfd78f0710a
Origin: https://github.com/thomasMinh1995/DepVerdict.git
```

The pre-existing untracked DIFF-04 rereview and RR02 capture trees were inventoried.
RR02 material was not edited, staged, or included in remediation scope. No
commit, push, merge, tag, release creation/deletion, or npm publication occurred.

## 4. Package metadata changes

`package.json` now requires:

```text
name: @thomasminh1995/depverdict
version: 0.6.0-alpha.1
repository: git+https://github.com/thomasMinh1995/DepVerdict.git
homepage: https://github.com/thomasMinh1995/DepVerdict#readme
bugs: https://github.com/thomasMinh1995/DepVerdict/issues
```

The decision-first description, both executable shims, Node engine policy,
exports, dependencies, and package allowlist remain unchanged. The lockfile does
not duplicate these URL fields and was not changed.

## 5. Normative URL and reference classification

| Surface | Classification | Result |
| --- | --- | --- |
| Package repository/homepage/bugs | `CURRENT_NORMATIVE` | Canonical DepVerdict URLs |
| README and CONTRIBUTING clone/setup | `CURRENT_NORMATIVE` | Clone and `cd DepVerdict` |
| SECURITY and Issue Forms | `CURRENT_NORMATIVE` | Canonical private advisory URL |
| Migration guide former repository URL | `CURRENT_COMPATIBILITY_DOCUMENTATION` | Redirect continuity only |
| DIFF-03 checkpoint references | `HISTORICAL_RECORD` | Explicitly dated pre-rename truth with current-status addendum |
| `upgradelens`, `.upgradelens/`, `UPGRADELENS_*` | `CURRENT_COMPATIBILITY_DOCUMENTATION` / protocol fixture | Bounded preview compatibility retained |
| `generator.name`, schemas, task/reason identifiers | `HISTORICAL_RECORD` / protocol | Frozen; unchanged |
| `upgradelens.conduct@gmail.com` | verified contact exception | Active bounded preview contact; unchanged |
| Historical v0.5 source note | `HISTORICAL_RECORD` | Byte digest remains locked |

Current operational documents do not depend on the former repository redirect.

## 6. Historical release before/after plan

Read-only GitHub API baseline collected at 2026-07-19T10:42:43Z:

| ID / tag | Current title | Approved candidate title | Current body SHA-256 | Candidate body SHA-256 |
| --- | --- | --- | --- | --- |
| `353312307` / `v0.1.1` | `DepVerdict v0.1.1 — MVP-01 Project Discovery Foundation` | `UpgradeLens v0.1.1 — MVP-01 Project Discovery Foundation` | `72c80ae81fe4432ae5c5c19f5a88db7ed3ce114a879e763bb628c2758b0025dd` | `17c9f1ece26eb1f6af20fb438b800d0cd74f3117aea979566ebb5b16b11c28e1` |
| `353747096` / `v0.2.0` | `DepVerdict v0.2.0 — Knowledge Research` | `UpgradeLens v0.2.0 — Knowledge Research` | `357a718be404db84510663d485a59d95a9670028f2be77b60de9900e6ecc3080` | `32af0823ca8199a5c041b48ceb4b126d9a0cdec369128463f4da5e9d2d560411` |
| `354822066` / `v0.3.0` | `DepVerdict v0.3.0 — AI Version Analysis` | `UpgradeLens v0.3.0 — AI Version Analysis` | `6efaeca1fa7b38601e3cb1d1eee984740b36f7ae2da06093fb211f7815da2bfc` | `8b264cb667a555c392f9e688e49fbf91e8145beec19ef76d2b4edb5c1eef7262` |
| `355150303` / `v0.4.0` | `DepVerdict v0.4.0 — Repository Impact Analytics` | `UpgradeLens v0.4.0 — Repository Impact Analytics` | `83a35b7972090f6d0e6a54db6026b605875430109071d3be56d8ef8aa89cd0a5` | `b71c108f31b1cb31d331cb89bda5fd5aec8fa63ca857d3b86825cd69c3383ff3` |
| `356244177` / `v0.5.0` | `DepVerdict v0.5.0 — Evidence-Bounded Migration Planning` | `UpgradeLens v0.5.0 — Evidence-Bounded Migration Planning` | `e06386beb973627f65ab9190415eff7577e3da6f986e370eac96f68e2e0a2f44` | `0d556e775bff4c27e16b0090b1203d4d09567d0c3e3d8b28ce353cee16e54eba` |

For each release, prepend exactly:

```markdown
> **Project rename:** This release was originally published under the
> **UpgradeLens** name. The project is now **DepVerdict**:
> https://github.com/thomasMinh1995/DepVerdict
>
> This historical release remains associated with its original tag and commit.
```

Then preserve the current body and claims, changing only body-local `DepVerdict`
product-name tokens to `UpgradeLens`. The exact before/candidate byte counts,
digests, replacement counts, IDs, states, timestamps, tag objects, targets, and
assets are recorded in
`docs/decisions/diff-04-release-evidence-gap-acceptance.md`.

## 7. Maintainer approval and live release update

```text
Approval: PROVIDED_IN_CODEX_TASK
Approval recorded: 2026-07-19T11:18:54Z
Live GitHub Release edits: 5
```

Approval explicitly covered the five IDs/titles, exact notice and body
transformation, and the bounded historical evidence-gap statement. It limited
mutation to title/body and prohibited new tags/releases, npm publication, and
changes to identity/target/state/assets. No credential was recorded.

All five PATCH operations returned HTTP 200. Payloads contained only `name` and
`body`. One initial shell wrapper used zsh's read-only `status` variable after
curl command substitution; read-only verification proved that the intended first
PATCH had completed correctly before the remaining four were attempted.

## 8. Tag, state, and asset post-update verification

Pre-edit verification found five matching local/remote annotated tag refs and
peeled targets. All current releases are public, draft false, prerelease false,
and report zero assets. GitHub API `target_commitish` reports `main`; peeled tag
commits are therefore the target-continuity authority.

Post-update read-only verification proved that only approved titles/bodies and
GitHub's API-managed `updated_at` changed. Release IDs, tags, `target_commitish`,
annotated tag objects, peeled commits, draft/prerelease states, created/published
timestamps, and complete zero-length asset arrays remained unchanged.

| Tag | Peeled target | Post-edit body SHA-256 | Assets |
| --- | --- | --- | ---: |
| `v0.1.1` | `95cd3025c27d2c4d8e97f711625541ee0da7dbc0` | `17c9f1ece26eb1f6af20fb438b800d0cd74f3117aea979566ebb5b16b11c28e1` | 0 |
| `v0.2.0` | `411c9e6216d9476b48d72311c9163b2a563d1e60` | `32af0823ca8199a5c041b48ceb4b126d9a0cdec369128463f4da5e9d2d560411` | 0 |
| `v0.3.0` | `8fea8ec5b06dd6c85a0f600be1d566d65ef2c7a2` | `8b264cb667a555c392f9e688e49fbf91e8145beec19ef76d2b4edb5c1eef7262` | 0 |
| `v0.4.0` | `734be0b9395b0bd74454badc010e4df237319cc3` | `b71c108f31b1cb31d331cb89bda5fd5aec8fa63ca857d3b86825cd69c3383ff3` | 0 |
| `v0.5.0` | `74d57344db254d0109ea951dc7c44853cdad9be0` | `0d556e775bff4c27e16b0090b1203d4d09567d0c3e3d8b28ce353cee16e54eba` | 0 |

## 9. Historical evidence search and classification

Searched retained DIFF/OSS/release reports, Git history, ignored sanitized
v0.5.0 smoke manifests, current local and remote refs, and current GitHub Release
API state. No complete pre-rename release/asset inventory was found.

| Invariant | Classification |
| --- | --- |
| `v0.5.0` tag object/peeled target continuity | `PROVEN` |
| `v0.1.1`–`v0.4.0` current tag object/target agreement | `SUPPORTED_BY_CURRENT_STATE_ONLY` |
| `v0.5.0` publication time and draft/prerelease state | `PROVEN` |
| Earlier before-state release IDs/states/timestamps | `UNKNOWN_BEFORE_STATE` |
| Before-state assets | `UNKNOWN_BEFORE_STATE` |
| Current zero-asset state | `SUPPORTED_BY_CURRENT_STATE_ONLY` |
| Conflicting evidence | none found; not equivalent to complete proof |

## 10. One-time evidence-gap acceptance

The reviewable record is
`docs/decisions/diff-04-release-evidence-gap-acceptance.md`, currently
`ACCEPTED`. It explicitly states that the past evidence was
not retained, cannot be recreated, and does not prove that assets never existed
or changed. It establishes the new baseline and a mandatory before/after rule for
future release mutations.

## 11. Focused and canonical tests

Focused coverage includes identity compatibility, qualification resolution,
CI/package metadata, repository docs, release remediation policy, and package
guard. After correcting one over-broad URL-history assertion, the new
repository/release identity subset passed 11/11 and the same tests passed in the
canonical run.

Canonical worktree result:

```text
651 tests
650 pass
0 fail
1 known sandbox-loopback skip
```

The isolated snapshot's first parallel run had one `SIGKILL` timeout in
`test/http-lifecycle-cli.test.js` under load. The test immediately passed alone,
then the complete isolated `npm run check` rerun passed:

```text
651 tests
650 pass
0 fail
1 known sandbox-loopback skip
Package guard: 250 files, 0 suspicious artifacts, 32 required assets
```

Workflow and all Issue Form YAML files parsed. Markdown links/fences passed.
Placeholder/local-path scan and `git diff --check` passed.

## 12. Tarball content and clean-install results

An isolated candidate containing starting HEAD and exactly the 17 DIFF-04-FIX
files passed canonical checks. The pre-existing DIFF-04 rereview baseline, RR02
capture trees, tarballs, and temporary data were not copied into the commit
candidate.

Repeated dry-run manifests were byte-identical:

```text
Package: @thomasminh1995/depverdict@0.6.0-alpha.1
Files: 250
Packed / unpacked: 664407 / 2553243 bytes
npm SHA-1: dd2f4653fcec1b47bbcce7e27fbfb4ce93ae7e85
Actual tarball SHA-256:
763e895ffb29222f432984cdf6cde7e9cb11bf95bee47324456e8f9975331187
```

These digests identify the qualification tarball immediately before this report's
status finalization. Because this report itself is package-visible, the exact
post-report-freeze tarball digest is recorded in the maintainer handoff rather
than inserted recursively into its own input.

The tarball has canonical repository/homepage/bugs metadata, both executable
shims at mode `0755`, required schemas/runtime/datasets/compatibility assets, and
no capture tree, runtime artifact root, credential, `.env`, duplicate artifact, or
nested tarball. An isolated-cache clean install passed. Installed checks passed
for both shims' `--version` and `--help`, ESM import with 438 exports, schema JSON
loading, qualification-record loading, and legacy `.upgradelens/` fallback
diagnostics. The fake qualification remained fail-closed as `IDENTITY_MISMATCH`;
no real provider was used.

## 13. npm read-only preflight and no-publication evidence

The public registry returned HTTP 404 before and after the dry-run: no package,
version, or dist-tag exists. The only publish-shaped command was:

```text
npm publish --dry-run --access public --tag preview --ignore-scripts
```

It passed with `preview`, both bins, 250 files, and no publication. No npm
credential was requested or used.

## 14. Hosted CI status and exact SHA

No commit or push is authorized for this task. Hosted CI for the uncommitted local
state cannot exist. A new exact-SHA Node 20/22/24 and package-smoke run is required
after the separately authorized Git workflow.

## 15. Provider calls

```text
Real provider calls: 0
```

## 16. Defects, limitations, and blocked checks

- Blocker defects: 0.
- High defects in local source remediation: 0 after validation.
- High open external gates: 0.
- Live historical release identity repair: blocked by required approval.
- Complete pre-rename release/asset proof: irrecoverably unavailable; bounded
  acceptance pending.
- Hosted CI: unavailable for an uncommitted/unpushed candidate.
- npm ownership/authentication: deferred to DIFF-05; no credentials requested.

## 17. Exact files changed or created

Modified:

```text
.github/ISSUE_TEMPLATE/bug_report.yml
.github/ISSUE_TEMPLATE/config.yml
CONTRIBUTING.md
README.md
SECURITY.md
docs/decisions/diff-03-repository-docs-community-migration.md
docs/migrations/upgradelens-to-depverdict.md
docs/releases/v0.6.0-alpha.1-depverdict-preview.md
docs/reviews/diff-03-repository-docs-community-migration.md
package.json
scripts/package-content-guard.mjs
test/ci-workflow-metadata.test.js
test/package-content-guard.test.js
test/repository-docs-identity.test.js
```

Created:

```text
docs/decisions/diff-04-release-evidence-gap-acceptance.md
docs/reviews/diff-04-fix-post-rename-identity-release-remediation.md
test/release-identity-remediation.test.js
```

Total DIFF-04-FIX files: 17. No file is staged. RR02 captures are excluded.

## 18. Pre-existing files preserved

The untracked
`docs/reviews/diff-04-depverdict-distribution-identity-readiness-rereview.md` is
the review baseline and was not created or rewritten by DIFF-04-FIX. All
pre-existing RR02 captures and duplicate-suffix capture files remain untouched.

## 19. Final verdict and next gate

```text
Verdict: DIFF_04_FIX_LOCAL_READY
Gate: PROCEED_TO_SEPARATELY_AUTHORIZED_GIT_WORKFLOW_AND_HOSTED_CI
```

The next task requires separate Git workflow authorization: stage only the 17
DIFF-04-FIX files, excluding the pre-existing DIFF-04 rereview baseline, commit,
push without force, and obtain exact-SHA Node 20/22/24 plus package-smoke hosted
success. Then rerun the independent DIFF-04 readiness review. No merge, tag, new
release, or npm publication is authorized.
