# DIFF-04-RERUN — DepVerdict Repository & Distribution Identity Readiness Review

Review completed: 2026-07-19T13:54:53Z
Review role: independent release-readiness review
Provider calls: 0

## 1. Executive verdict and gate

```text
Verdict: DEPVERDICT_REPOSITORY_DISTRIBUTION_IDENTITY_READY
Gate: PROCEED_TO_DIFF_05_FINAL_PREVIEW_DISTRIBUTION_QUALIFICATION
Candidate SHA: 001dd5ec9db4aa292228809ed129fb7d2db9756d
Blocker defects: 0
High defects: 0
```

The exact local, remote, pull-request, hosted-CI, and package candidate identity
is correlated. The repository and current operational metadata use DepVerdict
directly. All four required hosted jobs passed. Historical Releases are again
truthful UpgradeLens records with a direct DepVerdict rename notice, and the
approved repair preserved the recorded release identities, refs, states,
created/published timestamps, and zero-asset inventories.

The incomplete pre-rename release/asset before-state remains explicitly bounded
and must not be described as proven. The maintainer accepted that irrecoverable
evidence gap in
`docs/decisions/diff-04-release-evidence-gap-acceptance.md`; the exact
DIFF-04-FIX operation itself has a retained pre-edit and post-edit inventory.

## 2. Exact SHA correlation

| Identity | Result |
| --- | --- |
| Local branch | `feat/depverdict-rebrand` |
| Local HEAD | `001dd5ec9db4aa292228809ed129fb7d2db9756d` |
| Local commit | `001dd5e fix: complete DepVerdict distribution identity migration` |
| Remote branch | `origin/feat/depverdict-rebrand` = `001dd5ec9db4aa292228809ed129fb7d2db9756d` |
| Pull request | `#11`, open, `feat/depverdict-rebrand` → `develop` |
| PR head | `001dd5ec9db4aa292228809ed129fb7d2db9756d` |
| PR base | `develop` = `764591ec808bee7e2ff34870c5452b7dbf1e8ad9` |
| Default branch | `main` = `c91fbb0032b0e2f6209cb4a14aeeb68d9cf0c28d` |
| Merged/default candidate | Not applicable; PR `#11` is open and unmerged |
| Hosted workflow run | `29689431987` at `001dd5ec9db4aa292228809ed129fb7d2db9756d` |
| Package candidate | Clean local clone detached at `001dd5ec9db4aa292228809ed129fb7d2db9756d` |

The candidate clone did not include the pre-existing local rereview report,
RR02 captures, duplicate-suffix captures, tarballs, or temporary review data.
Those existing worktree files were inventoried and preserved.

## 3. Hosted workflow, run, and job evidence

```text
Workflow: DepVerdict CI
Run ID: 29689431987
Run number / attempt: 10 / 1
Event: pull_request
Status / conclusion: completed / success
Head branch: feat/depverdict-rebrand
Head SHA: 001dd5ec9db4aa292228809ed129fb7d2db9756d
Created: 2026-07-19T13:43:38Z
Completed: 2026-07-19T13:44:42Z
```

| Job | Job ID | Result | Completed (UTC) |
| --- | ---: | --- | --- |
| Node 20 | `88199427909` | PASS | `2026-07-19T13:44:41Z` |
| Node 22 | `88199427892` | PASS | `2026-07-19T13:44:33Z` |
| Node 24 | `88199427898` | PASS | `2026-07-19T13:44:21Z` |
| Package smoke (Node 24) | `88199427915` | PASS | `2026-07-19T13:43:56Z` |

No required job was missing, pending, skipped, or failed. Workflow inspection
also verified:

- repository permission is only `contents: read`;
- checkout uses `persist-credentials: false`;
- official actions are pinned to full commit SHAs;
- the workflow uses `pull_request`, never `pull_request_target`;
- provider and authorization environment values are explicitly empty;
- no `secrets.*`, publish, release, tag, push, deployment, or writeback step
  exists;
- the exact run uploaded zero Actions artifacts.

## 4. Repository identity and redirect

| Check | Result |
| --- | --- |
| Canonical web URL | PASS; HTTP 200 |
| API owner/name | PASS; `thomasMinh1995/DepVerdict` |
| Repository ID | `1299421234`; node ID `R_kgDOTXOYMg` |
| Visibility/state | Public, unarchived, enabled |
| Default branch | `main` |
| Local `origin` | `https://github.com/thomasMinh1995/DepVerdict.git` for fetch and push |
| Former URL | PASS; HTTP 301 directly to `https://github.com/thomasMinh1995/DepVerdict` |
| Branches | PASS; nine branches visible, including `main`, `develop`, and the candidate branch |
| Pull requests | PASS; PR history `#1`–`#11` accessible |
| Issues | PASS; no separate public issue was present |
| Actions | PASS; exact candidate run and jobs accessible |
| Tags | PASS; exactly `v0.1.1` through `v0.5.0` accessible |
| Discussions | Disabled; non-blocking preview limitation |

No retained pre-rename numeric repository-ID capture was found. Current Git
history, refs, branches, PRs, Releases, Actions, and the direct redirect support
continuity, but this review does not turn that into a numeric before/after ID
proof.

## 5. Security and community routes

The authenticated read-only GitHub endpoint
`/repos/thomasMinh1995/DepVerdict/private-vulnerability-reporting` returned
`{"enabled":true}`.

- `SECURITY.md` and both Issue Form routes point directly to
  `https://github.com/thomasMinh1995/DepVerdict/security/advisories/new`.
- Public issue forms warn users not to disclose secrets, private source,
  captures, or provider payloads.
- `SUPPORT.md` keeps security and sensitive conduct reports off public issues.
- `CODE_OF_CONDUCT.md` uses the verified private
  `upgradelens.conduct@gmail.com` address and labels it as a temporary
  legacy-named `0.6.x` transition route.
- PR and issue templates use DepVerdict identity.

The legacy-named conduct mailbox is a Medium transition limitation, not a High
defect for this preview.

## 6. GitHub Release inventory and classification

The API returned exactly five published historical releases, all with zero
assets. No `v0.6.0-alpha.1` tag, draft, or release exists.

| Release ID | Tag / peeled target | Current title | Draft / prerelease | Created / published / updated (UTC) | Assets |
| ---: | --- | --- | --- | --- | ---: |
| `353312307` | `v0.1.1` / `95cd3025c27d2c4d8e97f711625541ee0da7dbc0` | `UpgradeLens v0.1.1 — MVP-01 Project Discovery Foundation` | false / false | `2026-07-13T17:10:16Z` / `17:16:09Z` / `2026-07-19T11:17:07Z` | 0 |
| `353747096` | `v0.2.0` / `411c9e6216d9476b48d72311c9163b2a563d1e60` | `UpgradeLens v0.2.0 — Knowledge Research` | false / false | `2026-07-14T11:12:11Z` / `11:22:02Z` / `2026-07-19T11:17:46Z` | 0 |
| `354822066` | `v0.3.0` / `8fea8ec5b06dd6c85a0f600be1d566d65ef2c7a2` | `UpgradeLens v0.3.0 — AI Version Analysis` | false / false | `2026-07-16T01:40:55Z` / `01:43:27Z` / `2026-07-19T11:17:47Z` | 0 |
| `355150303` | `v0.4.0` / `734be0b9395b0bd74454badc010e4df237319cc3` | `UpgradeLens v0.4.0 — Repository Impact Analytics` | false / false | `2026-07-16T14:33:06Z` / `14:35:09Z` / `2026-07-19T11:17:48Z` | 0 |
| `356244177` | `v0.5.0` / `74d57344db254d0109ea951dc7c44853cdad9be0` | `UpgradeLens v0.5.0 — Evidence-Bounded Migration Planning` | false / false | `2026-07-19T02:55:33Z` / `02:56:50Z` / `2026-07-19T11:17:48Z` | 0 |

Each body:

- states that the release was originally published under UpgradeLens;
- identifies the project as now DepVerdict;
- links directly to `https://github.com/thomasMinh1995/DepVerdict`;
- states that the historical release remains associated with its original tag
  and commit;
- contains no dependency on the former repository URL.

Classification: PASS. The releases are truthful historical UpgradeLens records,
not retroactively presented as DepVerdict releases.

## 7. Release immutability evidence and limitations

The post-edit body bytes exactly match the accepted candidate inventory:

| ID / tag | Body bytes | Body SHA-256 |
| --- | ---: | --- |
| `353312307` / `v0.1.1` | 2227 | `17c9f1ece26eb1f6af20fb438b800d0cd74f3117aea979566ebb5b16b11c28e1` |
| `353747096` / `v0.2.0` | 4588 | `32af0823ca8199a5c041b48ceb4b126d9a0cdec369128463f4da5e9d2d560411` |
| `354822066` / `v0.3.0` | 823 | `8b264cb667a555c392f9e688e49fbf91e8145beec19ef76d2b4edb5c1eef7262` |
| `355150303` / `v0.4.0` | 1335 | `b71c108f31b1cb31d331cb89bda5fd5aec8fa63ca857d3b86825cd69c3383ff3` |
| `356244177` / `v0.5.0` | 990 | `0d556e775bff4c27e16b0090b1203d4d09567d0c3e3d8b28ce353cee16e54eba` |

For the explicitly approved DIFF-04-FIX operation, the retained pre-edit and
post-edit inventories prove:

- release IDs and tags are unchanged;
- annotated tag objects and peeled commits are unchanged;
- `target_commitish` remains `main`;
- draft/prerelease states are unchanged;
- created and published timestamps are unchanged;
- asset arrays remained empty;
- only approved titles/bodies changed;
- GitHub-managed `updated_at` changed as the direct consequence of those
  title/body edits and was not included in any PATCH payload;
- no release or tag was created, deleted, moved, or recreated.

Bounded limitation: no complete release-ID/state/timestamp/asset inventory was
retained from before the repository rename and the earlier misleading metadata
edits. The accepted evidence-gap decision explicitly classifies that before-state
as unknown and does not claim that assets never existed or never changed.
`v0.5.0` tag object/target continuity and publication state are independently
proven by retained DIFF-01 evidence. Earlier tag agreement and current zero-asset
state are supported by current state only.

This bounded, explicitly accepted limitation passes the present remediation gate
without being converted into an immutability claim.

## 8. Package metadata and npm identity

| Field | Candidate | Result |
| --- | --- | --- |
| `name` | `@thomasminh1995/depverdict` | PASS |
| `version` | `0.6.0-alpha.1` | PASS |
| description | decision-first, evidence-bounded dependency upgrade analysis | PASS |
| repository | `git+https://github.com/thomasMinh1995/DepVerdict.git` | PASS |
| homepage | `https://github.com/thomasMinh1995/DepVerdict#readme` | PASS |
| bugs | `https://github.com/thomasMinh1995/DepVerdict/issues` | PASS |
| canonical bin | `depverdict` → `bin/depverdict.js` | PASS |
| legacy bin | `upgradelens` → `bin/upgradelens.js` | PASS |
| engine | Node `>=20` | PASS |

The normalized dry-run and actual tarball retain those exact fields. Both bin
files are present with mode `0755`.

Public npm registry evidence before and after the publish dry run:

- `@thomasminh1995/depverdict`: HTTP 404; no version, `latest`, `preview`, or
  dist-tag exists;
- external `upgrade-lens`: `1.0.2` under `latest`, maintained by `zjpctt`, with
  repository `zjp123/UpgradeDepDetective-`;
- DepVerdict did not publish, mutate, or claim that external package.

Authenticated npm scope ownership was not available and is assigned to the
DIFF-05 pre-publication gate. No credential was requested or displayed.

## 9. Normative and legacy identity scan

| Classification | Representative results | Assessment |
| --- | --- | --- |
| Current normative DepVerdict identity | package URLs, README/CONTRIBUTING clone commands, security routes, Issue Forms, preview draft | PASS |
| Approved legacy compatibility | `upgradelens` bin, `.upgradelens/` complete-chain reads, `UPGRADELENS_*` fallback | PASS |
| Truthful historical record | frozen prior reports, historical release notes, protocol/schema identities | PASS |
| Migration documentation | former repository redirect, CLI/root/env compatibility map | PASS |
| Frozen protocol/test identity | `generator.name: "UpgradeLens"`, bounded prompts, fixtures, reason/task IDs | PASS |
| Stale normative identity | none found in inspected operational surfaces | PASS |

The former repository URL remains only in migration or explicitly dated
historical context. Current operational links do not rely on its redirect.
Repository identity tests, current Markdown link/fence checks, package metadata
tests, and release-remediation tests all passed.

## 10. Compatibility behavior

Focused command:

```text
node --test
  test/identity-compatibility.test.js
  test/migration-qualification-resolution.test.js
  test/ci-workflow-metadata.test.js
  test/repository-docs-identity.test.js
  test/release-identity-remediation.test.js
```

Result: 36 passed, 0 failed, 0 skipped.

Verified behavior:

- `depverdict` is canonical;
- `upgradelens` writes equivalent canonical artifacts;
- its warning is stderr-only and bounded once per process state;
- legacy `--stdout` stays machine-readable JSON;
- `.depverdict/` is the write root;
- a complete `.upgradelens/` chain may be read as fallback;
- split canonical/legacy chains fail closed with `ARTIFACT_ROOT_CONFLICT`;
- precedence is explicit option → `DEPVERDICT_*` → `UPGRADELENS_*` → default;
- secret values are not printed;
- schemas, task IDs, reason codes, and historical artifacts remain compatible;
- public export count remains 438.

## 11. Canonical suite and package guard

The exact candidate was tested in a clean clone detached at
`001dd5ec9db4aa292228809ed129fb7d2db9756d`.

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | PASS; 11 dependencies installed |
| `npm run check` | PASS |
| Canonical tests | 651 total; 650 pass; 0 fail; 1 sandbox loopback skip |
| `npm run check:package` | PASS |
| Package guard | 250 files; 0 suspicious artifacts; 32 required assets |
| `git diff --check` | PASS |
| Clean candidate status | PASS; no source modifications |

The known local skip is the real loopback listener check unavailable in the
execution sandbox. It is unrelated to distribution identity, and the same
canonical suite passed in the exact-SHA hosted Node jobs.

## 12. Tarball manifest, digest, and clean install

Dry-run and two actual isolated-cache packs produced identical metadata and
byte-identical tarballs:

```text
name: @thomasminh1995/depverdict
version: 0.6.0-alpha.1
filename: thomasminh1995-depverdict-0.6.0-alpha.1.tgz
files: 250
packed bytes: 664399
unpacked bytes: 2553288
npm shasum: 992d406797fc8741139bf8f14cfe172c327d8129
npm integrity: sha512-P6g1ryzFDsGd1/0BI0qOoGP24Z3wqg4wS+5t4dENbEFoDsFq8ZFczqq1u0//7x9wzc71D4u4lIJ9U9l6XpPTAg==
SHA-256: b2d11b6c9caf95a7e77035bb99edd8fb31d8597c6e91441d47a2cbc066fccc48
```

The official clean-install smoke passed:

```text
Package smoke passed:
@thomasminh1995/depverdict@0.6.0-alpha.1
250 extracted files
32 required assets
438 public exports
```

Additional isolated consumer checks passed:

- `depverdict --version` and `--help`;
- `upgradelens --version` and `--help` with stderr deprecation warning;
- ESM import with 438 public exports;
- package schema JSON loading;
- Migration Planning qualification-record loading;
- `.upgradelens/` qualification fallback with
  `LEGACY_ARTIFACT_ROOT_USED`;
- mismatched qualification identity remained fail-closed as
  `IDENTITY_MISMATCH`.

RR02 captures, `.depverdict/`, `.upgradelens/`, credentials, `.env` files,
duplicate copies, local paths, and nested tarballs were excluded by the clean
candidate and package guard.

## 13. npm dry run and no-publication confirmation

The only publish-shaped command was:

```text
npm publish --dry-run --access public --tag preview --ignore-scripts --json
```

It normalized the exact candidate as public
`@thomasminh1995/depverdict@0.6.0-alpha.1`, tag `preview`, 250 files, with the
same size and digests as the actual qualification pack. The public registry
returned HTTP 404 before and after the command.

No package was published. No `latest` or `preview` dist-tag was created or moved.

## 14. Product positioning

PASS. Current public content consistently positions DepVerdict as:

- Public Technical Preview / Alpha;
- decision-first dependency upgrade analysis;
- deterministic policy rather than registry-latest recommendation;
- evidence-bounded, human-reviewed migration handoff;
- strongest current coverage in JS/TS and npm with explicit limits;
- experimental opt-in Migration Checklist;
- provider/model/runtime qualification bound to exact evidence.

No current product surface claims autonomous source migration, guaranteed
safety, equal support for every ecosystem, universal provider qualification,
production stability, general availability, or npm `latest`.

## 15. Provider-call count

```text
Provider calls: 0
```

Local and hosted checks used deterministic fixtures, fakes, local test doubles,
or empty provider configuration. No real AI provider was contacted.

## 16. Blocked, skipped, and limited checks

- LIMITED: complete pre-rename release-ID/state/timestamp/asset before-state was
  not retained. The accepted decision records the gap without claiming proof.
- LIMITED: authenticated npm scope ownership was unavailable; it must be checked
  by the maintainer at DIFF-05 without sharing credentials.
- LIMITED: no pre-rename numeric repository ID was retained.
- NOT APPLICABLE: candidate SHA on merged/default branch; PR `#11` remains open.
- NOT APPLICABLE: remote `v0.6.0-alpha.1` release classification; no such tag,
  draft, or release exists.
- SKIPPED LOCALLY: one loopback listener test due to sandbox restrictions; exact
  hosted Node 20/22/24 jobs passed.
- ENVIRONMENT RETRY: the first pack attempt used an unwritable global npm cache;
  the required isolated-cache rerun passed.
- ENVIRONMENT RETRY: an unprivileged clean-install attempt was interrupted while
  sandbox networking blocked dependency retrieval; the network-enabled isolated
  rerun passed.

## 17. Defects by severity

### Blocker

None.

### High

None.

### Medium

1. The verified conduct mailbox retains the former product name for one bounded
   preview transition.
2. Authenticated npm scope ownership remains a DIFF-05 pre-publication check.
3. Branch protection is not enabled on the public branch inventory.
4. Discussions are disabled.
5. Complete pre-rename release/asset and numeric repository-ID evidence is
   unavailable and must remain explicitly bounded.

### Low

None material beyond documented preview limitations.

## 18. Exact files created or changed by this review

Created or replaced:

```text
docs/reviews/diff-04-depverdict-distribution-identity-readiness-rereview.md
```

No other tracked file was changed. Temporary clones, npm caches, tarballs, and
consumer installs were created only below `/tmp`. Pre-existing RR02 captures
were not edited, staged, or packaged.

## 19. Final acceptance matrix

| Area | Result | Evidence / reason |
| --- | --- | --- |
| Exact SHA | PASS | local, remote branch, PR head, hosted run, and package candidate are `001dd5e…`; default branch recorded separately |
| Hosted CI | PASS | Node 20/22/24 and package smoke succeeded in run `29689431987` |
| Repository | PASS | canonical owner/URL valid; former URL redirects; history and resources accessible |
| Local remote | PASS | `origin` directly uses DepVerdict |
| Security | PASS | PVR enabled; canonical private routes in current docs and forms |
| Releases | PASS | five historical releases are truthful UpgradeLens records with direct DepVerdict notices |
| Release history | PASS | exact approved repair preserved recorded IDs, tags, targets, states, created/published times, and zero assets; older evidence gap remains accepted and bounded |
| Package | PASS | scoped name/version/description/metadata and both bins are correct |
| CLI | PASS | canonical and legacy installed shims work; warning is bounded and stderr-only |
| Docs | PASS | no stale normative identity or redirect-dependent operational URL |
| Compatibility | PASS | root/env/artifact fallbacks remain deterministic and fail closed |
| Package guard | PASS | 250 files, 0 suspicious, 32 required assets |
| Clean install | PASS | CLI/help/version/import/schema/qualification checks pass |
| npm preflight | PASS | public preview dry run only; registry remained 404; authenticated ownership deferred to DIFF-05 |
| Positioning | PASS | bounded Technical Preview claims |
| Provider calls | PASS | zero |

## 20. Final verdict and recommended next task

```text
Verdict: DEPVERDICT_REPOSITORY_DISTRIBUTION_IDENTITY_READY
Gate: PROCEED_TO_DIFF_05_FINAL_PREVIEW_DISTRIBUTION_QUALIFICATION
```

Recommended next task:

```text
DIFF-05 — Final preview distribution qualification
```

That task should obtain authenticated maintainer-only npm scope ownership
evidence, repeat exact-candidate pack/install checks, and prepare the separately
approved `preview` publication decision. This review does not authorize merge,
tag mutation, Release creation/editing, npm publication, or dist-tag mutation.
