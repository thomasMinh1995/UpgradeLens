# DIFF-05 — Final Preview Distribution Qualification

Review completed: 2026-07-19T14:27:07Z
Review role: independent release engineer and product qualification reviewer
Real provider calls: 0
Provider cost: USD 0

## 1. Executive verdict and gate

```text
Verdict: PREVIEW_RELEASE_EVIDENCE_COMMIT_REQUIRED
Gate: COMMIT_EVIDENCE_AND_REFRESH_HOSTED_CI
Qualified product candidate: 001dd5ec9db4aa292228809ed129fb7d2db9756d
Blocker product defects: 0
High product defects: 0
```

The exact hosted candidate passes product, package, CLI, compatibility,
decision-policy, handoff, retained-provider-qualification, security, release,
npm-authorization, and publish-dry-run gates.

It is not yet the final releasable commit. The independent DIFF-04 readiness
report is valid public evidence but remains untracked, and this DIFF-05 report is
new public release evidence. Committing either creates a new SHA and changes the
npm package manifest because the package includes `docs/`. The old hosted CI run
must not be reused for that evidence-bearing candidate.

No merge, tag, GitHub Release, npm publication, or dist-tag mutation was
performed.

## 2. Exact candidate, SHA, and CI correlation

| Identity | Result |
| --- | --- |
| Local branch | `feat/depverdict-rebrand` |
| Local HEAD | `001dd5ec9db4aa292228809ed129fb7d2db9756d` |
| Remote branch | `001dd5ec9db4aa292228809ed129fb7d2db9756d` |
| Pull request | `#11`, open, not draft, not merged |
| PR direction | `feat/depverdict-rebrand` → `develop` |
| PR head | `001dd5ec9db4aa292228809ed129fb7d2db9756d` |
| PR base | `develop` = `764591ec808bee7e2ff34870c5452b7dbf1e8ad9` |
| Default branch | `main` = `c91fbb0032b0e2f6209cb4a14aeeb68d9cf0c28d` |
| Hosted workflow | `DepVerdict CI`, run `29689431987`, attempt 1 |
| Hosted event | `pull_request` |
| Hosted run SHA | `001dd5ec9db4aa292228809ed129fb7d2db9756d` |
| Hosted conclusion | `completed` / `success` |
| Package candidate | isolated clean clone detached at the same SHA |

Required hosted jobs:

| Job | Result |
| --- | --- |
| Node 20 | PASS |
| Node 22 | PASS |
| Node 24 | PASS |
| Package smoke (Node 24) | PASS |

These results qualify only `001dd5e…`. They do not qualify the future
evidence-bearing commit.

## 3. Worktree scope and evidence-report treatment

The source worktree contained:

- the valid untracked DIFF-04 independent readiness report;
- pre-existing RR02 capture trees and duplicate-suffix captures;
- no local tarball or qualification cache in release scope;
- no unrelated tracked source modification.

Treatment:

```text
DIFF-04 readiness report: INCLUDE_IN_EVIDENCE_COMMIT
DIFF-05 qualification report: INCLUDE_IN_EVIDENCE_COMMIT
RR02 captures: KEEP_LOCAL_NON_DISTRIBUTED
Temporary clones/caches/tarballs: KEEP_OUTSIDE_REPOSITORY
```

The DIFF-04 report:

- identifies exact SHA `001dd5ec…` and hosted run `29689431987`;
- records the ready verdict and zero Blocker/High defects;
- contains no credential, authorization header, signed URL, provider payload,
  or private machine path;
- is consistent with current source and repeated live GitHub evidence.

Its generic reference to a temporary system directory is not a private machine
path. No report was silently staged, discarded, or modified during this task.

## 4. Product, repository, and distribution identity

| Field | Qualified value | Result |
| --- | --- | --- |
| Product | DepVerdict | PASS |
| Repository | `https://github.com/thomasMinh1995/DepVerdict` | PASS |
| Package | `@thomasminh1995/depverdict` | PASS |
| Version | `0.6.0-alpha.1` | PASS |
| Description | decision-first, evidence-bounded dependency upgrade analysis | PASS |
| Repository metadata | `git+https://github.com/thomasMinh1995/DepVerdict.git` | PASS |
| Homepage | `https://github.com/thomasMinh1995/DepVerdict#readme` | PASS |
| Bugs | `https://github.com/thomasMinh1995/DepVerdict/issues` | PASS |
| Canonical bin | `depverdict` | PASS |
| Legacy bin | `upgradelens` | PASS |
| License | MIT | PASS |
| Node engine | `>=20` | PASS |

The legacy executable is explicitly bounded to the `0.6.x` preview
compatibility window and emits a deprecation warning. Package keywords describe
dependency upgrades, migration planning, repository analysis, and developer
tooling. No package metadata claims ownership of the external `upgrade-lens`
package.

No `author` or `maintainers` field is declared in `package.json`; npm account
authorization is established separately. This is intentional optional metadata,
not an ownership claim.

## 5. npm authorization and public availability

Authenticated read-only checks, with private profile data suppressed:

```text
npm account: thomasminh1995
account matches personal scope: yes
profile read: authenticated
2FA mode: auth-and-writes
2FA/publish requirements understood: yes
access list query: authenticated
existing accessible packages: 0
scope publish authorization confirmed: yes, for the matching personal scope
```

The empty package access list is expected because this is the first package in
the personal scope. It is not presented as an existing-package permission.
The future real publish remains interactive and must satisfy the account's
write-time 2FA requirement.

Public registry inventory:

| Package | Status | Ownership evidence |
| --- | --- | --- |
| `@thomasminh1995/depverdict` | HTTP 404 | not yet published |
| `upgradelens` | HTTP 404 | unclaimed public identity; not the intended package |
| `upgrade-lens` | `1.0.2` under `latest` | maintained by `zjpctt`; external repository |

DepVerdict did not publish, mutate, or claim either unscoped identity.

## 6. Exact npm artifact

Two isolated-cache actual packs were byte-identical and matched the dry-run
manifest:

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
repeat byte comparison: PASS
```

Both executable shims have mode `0755`.

The tarball includes the required CLI/runtime modules, 22 schemas, evaluation
datasets, Migration Checklist assets, compatibility modules, migration guide,
preview release note, README, and license.

It excludes:

- Git metadata;
- `.env` and credentials;
- `.depverdict/` and `.upgradelens/` runtime outputs;
- RR02 capture trees and transcripts;
- npm caches and `node_modules`;
- local tarballs;
- duplicate-suffixed files;
- private machine paths.

Seven intentionally packaged RR02 policy/decision documents were distinguished
from prohibited RR02 capture trees. Package guard independently accepted the
same boundary.

The accepted 250-file count is unchanged. After the two evidence reports are
committed, the expected package file count becomes 252 because `docs/` is
package-visible. That change must be requalified and explained on the new SHA.

## 7. Package guard and clean installation

| Check | Result |
| --- | --- |
| `npm ci --ignore-scripts` | PASS |
| `npm run check` | PASS |
| `npm run check:package` | PASS |
| Package guard | 250 files, 0 suspicious, 32 required assets |
| Official package smoke | PASS |
| Extracted package files | 250 |
| Public exports | 438 |
| `git diff --check` | PASS |

A cold-cache `npm install --offline` could not resolve the declared
`@babel/parser` packument. This is a cache-availability limitation, not a
package failure. The clean consumer was rerun with network dependency resolution,
`--ignore-scripts`, no audit, no funding request, and no package lock; it passed.
The installed DepVerdict product workflow was then exercised offline without
registry or provider access.

## 8. Public CLI and compatibility results

| Check | Result |
| --- | --- |
| `depverdict --version` | `0.6.0-alpha.1` |
| `depverdict --help` | PASS; DepVerdict-first and decision-first |
| `upgradelens --version` | `0.6.0-alpha.1` |
| `upgradelens --help` | PASS; equivalent with stderr deprecation warning |
| Machine-readable stdout | PASS |
| ESM import | PASS |
| Public exports | 438 |
| Schema JSON loading | 22/22 |
| Schema compilation | 22/22 |
| Retained qualification loading | PASS |
| Legacy qualification fallback | PASS with bounded diagnostic |
| Root conflict | fail closed as `ARTIFACT_ROOT_CONFLICT` |

The legacy warning is stderr-only and bounded once per process state. Canonical
and legacy executable identities write canonical artifacts.

## 9. Zero-secret onboarding workflow

Two equivalent clean generic Node fixtures contained only:

- one declared runtime dependency;
- one declared development dependency;
- no lockfile;
- no credential;
- no provider configuration.

Packaged CLI results:

| Workflow | Result |
| --- | --- |
| Discovery with JSON stdout | PASS, exit 0 |
| Offline full analysis | PASS, truthful completion |
| Default incomplete behavior | `INSUFFICIENT_DATA`, exit 0 |
| `--fail-on-incomplete` | `INSUFFICIENT_DATA`, exit 2 |
| Artifact root | `.depverdict/` |
| Legacy write root | absent |
| Provider calls | 0 |
| Secret diagnostic scan | PASS |

The two dependencies remained `NOT_ANALYZED` with missing installed baseline,
target, and evidence. The output required human review and did not manufacture a
recommendation, confidence, impact-safe claim, migration action, path, or command.

The repeated semantic projection was identical. Wall-clock `generatedAt`,
fixture directory name, and lineage-derived IDs are intentionally variable and
were not misrepresented as byte-deterministic CLI output. Actual npm tarball
determinism is byte-for-byte proven separately.

## 10. Decision, handoff, selector, and completion scenarios

Focused deterministic suite: 177 passed, 0 failed, 0 skipped.

| Scenario | Required result | Qualification |
| --- | --- | --- |
| Registry latest only | `INVESTIGATE`, never recommendation | PASS |
| Explicit newer target plus scoped evidence | `PLAN_UPGRADE` | PASS |
| Installed equals target | `KEEP_CURRENT` | PASS |
| Provider/output failure | `PARTIAL`, exit 2 | PASS |
| Insufficient data | default 0, strict 2 | PASS |
| Unsupported/unavailable coverage | no false `NOT_IMPACTED` | PASS |
| Exact duplicate occurrence selector | exactly one occurrence | PASS |
| Stale/conflicting selector | fail before provider construction | PASS |
| Actionable Migration Checklist | evidence-bounded, review-required | PASS |
| No grounded instruction | `NO_GROUNDED_ACTION`; no invented action/path/command | PASS |
| Cancellation | exit 130 | PASS |
| Offline run | no network/provider dependency; honest limits | PASS |

Decision-first console and Markdown ordering, deterministic renderers, JSON
stdout, partial failure isolation, coverage conservatism, target intent, and
completion projection all passed.

Provider calls across these scenarios: 0 real calls.

## 11. Retained real-provider qualification

The production loader validated the retained machine-readable record rather
than relying on Markdown:

```text
record schema: 1.0.0
record digest: sha256:e55b2d6f2f82091f5ce321e3e6b3a36cab8a34ea7608464ccd08b8ef49813847
qualification ID: sha256:4fa4954d6f254d94859bce17aec6209394d380e4635155a6f3ce23a7e9b70765
verdict: QUALIFIED
generated: 2026-07-17T03:32:16.710Z
mode: real
provider: openai-compatible
model: openai/gpt-5.5
adapter: openai-compatible
critical gates: 15/15 passed
critical violations: 0
```

Resolving the record against the current task, dataset, evaluation criteria,
policy, prompt, schema, deterministic presentation, provider, model, adapter,
and runtime identity returned `QUALIFIED` and execution allowed.

The retained record currently resides under the supported legacy root and
resolved with `LEGACY_ARTIFACT_ROOT_USED`. A matching canonical record wins when
both roots are complete. Provider, model, or adapter changes each returned
`IDENTITY_MISMATCH` with execution disallowed.

No qualification was generalized to another provider, Claude, another model,
local/offline execution, or changed prompt/runtime. Migration Checklist remains
experimental, opt-in, evidence-bounded, and human-reviewed.

No provider credit was spent during DIFF-05.

## 12. GitHub Releases, repository, security, and community

| Check | Result |
| --- | --- |
| Canonical repository | HTTP 200 |
| Former repository route | HTTP 301 directly to DepVerdict |
| Private Vulnerability Reporting | enabled |
| PR and hosted CI | exact candidate correlated |
| `v0.6.0-alpha.1` tag | absent |
| `v0.6.0-alpha.1` GitHub Release/draft | absent |
| Historical release count | 5 |
| Historical release asset count | zero for each |
| Historical release metadata drift | none |

Release IDs remain `353312307`, `353747096`, `354822066`, `355150303`, and
`356244177`. Titles remain truthful UpgradeLens titles, bodies retain the direct
DepVerdict rename notices, states remain non-draft/non-prerelease, and approved
body digests remain unchanged.

Security, support, conduct, issue, and PR routes are valid and DepVerdict-first.
Sensitive reports are not directed to public issues. The verified
legacy-named conduct mailbox remains an explicit preview limitation.

## 13. Release notes, migration guide, and positioning

The current preview draft and migration guide pass:

- Technical Preview / Alpha status;
- scoped `@preview` installation command;
- no `latest` claim;
- DepVerdict-first canonical CLI and bounded legacy alias;
- canonical artifact/env identity plus bounded fallbacks;
- decision-first workflow and fail-on-incomplete semantics;
- experimental opt-in Migration Checklist;
- exact provider/model/runtime qualification boundary;
- mandatory human review;
- JS/TS and npm strengths with explicit ecosystem/coverage limits;
- no autonomous source modification;
- proposed verification commands are not executed by the product;
- recovery and rollback synthesis limitations;
- canonical security/support routes;
- UpgradeLens-to-DepVerdict upgrade path.

The draft truthfully says the preview is not yet published and has not passed the
final evidence-bearing distribution gate. No factual release-note edit was
required in this task. The later evidence commit should replace that
qualification-status sentence with publication-stable wording before CI so it
does not become stale after the final rerun.

No production-ready, universally safe, autonomous-migration, every-ecosystem,
all-model, or npm-`latest` overclaim was found.

## 14. Publish-command rehearsal and no-publication proof

The exact allowed command was run:

```text
npm publish --dry-run --access public --tag preview --ignore-scripts
```

Result:

```text
package: @thomasminh1995/depverdict@0.6.0-alpha.1
access: public
tag: preview
files: 250
packed bytes: 664399
unpacked bytes: 2553288
shasum: 992d406797fc8741139bf8f14cfe172c327d8129
exit: 0
```

The package has no publish/install lifecycle script. The public registry
returned HTTP 404 after the dry run. No package, version, or dist-tag was
created or moved.

## 15. Provider-call count and cost

```text
Real AI provider calls: 0
Provider cost: USD 0
```

All scenarios used deterministic fixtures, fake runtimes, injected failures, or
offline CLI operation. GitHub and npm network calls were metadata/authorization
checks, not AI-provider calls.

## 16. Tests, retries, skips, and blocked checks

| Suite/check | Result |
| --- | --- |
| Canonical clean-clone tests | 651 passed, 0 failed, 0 skipped |
| Package guard | PASS |
| Focused product scenarios | 177 passed, 0 failed, 0 skipped |
| Official package smoke | PASS |
| Installed schema compilation | 22 passed |
| Retained critical qualification gates | 15 passed |
| Hosted Node 20/22/24/package smoke | PASS on `001dd5e…` |

Environment retries:

1. A broad filename scan initially matched seven intentional RR02 policy
   documents. The corrected capture-tree/transcript scan found zero prohibited
   files.
2. Cold-cache offline dependency installation was unavailable. A clean
   network-resolved `--ignore-scripts` install passed, and the product workflow
   itself then ran offline.
3. An initial installed root-conflict probe called a non-public root export.
   The same packaged internal module was then exercised directly and returned
   `ARTIFACT_ROOT_CONFLICT`; public export count remained the expected 438.

Blocked release check:

- hosted CI does not yet exist for the required evidence-bearing commit.

## 17. Defects by severity

### Blocker

None.

### High product/package/security defects

None.

### Release-gating evidence condition

The two required public qualification reports are not in the exact hosted SHA.
The old SHA is not presented as final. This condition maps to
`PREVIEW_RELEASE_EVIDENCE_COMMIT_REQUIRED`, not to product readiness.

### Medium

1. The conduct mailbox retains the former product name for the bounded preview.
2. Discussions are disabled.
3. Public branches are not protected.
4. Clean installation requires registry access unless dependency packuments are
   already cached.
5. Release-note qualification-status wording should become publication-stable in
   the evidence commit.

## 18. Known limitations

- pnpm and Yarn installed baselines are unresolved;
- Python environment/lockfile installed baselines are unresolved;
- source coverage is strongest for JavaScript/TypeScript;
- partial or unavailable coverage cannot prove non-impact;
- provider qualification is exact-identity only;
- Migration Checklist is experimental and human-reviewed;
- offline mode cannot invent targets, evidence, confidence, or recommendations;
- recovery/rollback plans are not synthesized or executed;
- npm publication remains separately authorized and interactive;
- the accepted pre-rename Release evidence gap remains bounded, not proven away.

## 19. Exact files created or changed

Created:

```text
docs/reviews/diff-05-final-preview-distribution-qualification.md
```

Pre-existing and intentionally unchanged:

```text
docs/reviews/diff-04-depverdict-distribution-identity-readiness-rereview.md
RR02 capture trees
```

No source, schema, test, package metadata, GitHub setting, Release, tag, npm
package, or dist-tag was modified.

## 20. Recommended release order and rollback boundary

Do not publish from `001dd5e…`. The later workflow should be:

1. review and commit the DIFF-04 and DIFF-05 reports;
2. make the preview release-note qualification sentence
   publication-stable in the same evidence commit;
3. verify the resulting package count change from 250 to 252 and rerun package
   guard, deterministic pack, clean install, focused scenarios, and canonical
   tests;
4. push without force and wait for Node 20/22/24 plus package smoke on the exact
   evidence SHA;
5. independently correlate local, remote, PR head, package candidate, and hosted
   run SHA;
6. merge PR `#11` to `develop` only after review;
7. promote the intended immutable release commit to `main` according to branch
   policy and verify hosted CI again on that final release commit;
8. create annotated tag `v0.6.0-alpha.1` on that exact `main` commit;
9. create a GitHub prerelease from the approved release notes;
10. only with separate interactive maintainer authorization, publish
    `@thomasminh1995/depverdict@0.6.0-alpha.1` using public access and `preview`;
11. verify registry metadata, downloaded tarball SHA-256/npm integrity, dist-tags,
    both CLI shims, and a clean install;
12. if publication fails, diagnose without moving the tag; if a bad immutable
    package is published, deprecate the affected version and release a new
    version rather than replacing bytes or force-moving refs.

Never move `latest`, force-move a tag, replace published artifact bytes, or
silently rewrite a GitHub Release.

## 21. Final validation matrix, verdict, and next gate

| Area | Result | Evidence |
| --- | --- | --- |
| Exact SHA | PASS | local/remote/PR/hosted/package candidate = `001dd5e…` |
| Hosted CI | PASS | Node 20/22/24 and package smoke on current product SHA |
| Worktree scope | BLOCKED | two required evidence reports are not committed |
| Identity | PASS | repository/package/version/CLI canonical |
| npm authorization | PASS | authenticated matching personal scope; write 2FA enabled |
| Tarball | PASS | deterministic, complete, clean, 250 files |
| Clean install | PASS | both CLIs/import/22 schemas/qualification |
| Sample | PASS | zero-secret, truthful `INSUFFICIENT_DATA` |
| Decisions | PASS | registry latest never becomes recommendation |
| Selector | PASS | exact duplicate and fail-before-provider cases |
| Handoff | PASS | evidence-bounded and human-reviewed |
| Completion | PASS | full default/strict/partial/cancel exit matrix |
| Qualification | PASS | exact retained identity only, 15/15 gates |
| Releases | PASS | historical releases truthful and unchanged |
| Security | PASS | PVR and private routes valid |
| Release notes | PASS | preview scope and limitations accurate |
| Dry run | PASS | public `preview`; registry remains 404 |
| Provider calls | PASS | zero, cost USD 0 |

```text
Verdict: PREVIEW_RELEASE_EVIDENCE_COMMIT_REQUIRED
Gate: COMMIT_EVIDENCE_AND_REFRESH_HOSTED_CI
```

Next task:

```text
DIFF-05-EVIDENCE — Commit public qualification evidence, stabilize the
pre-publication release-note sentence, requalify the expected 252-file tarball,
push without force, and wait for exact-SHA hosted CI.
```

This qualification ends here. It does not authorize merge, tag, GitHub Release,
npm publication, or dist-tag mutation.
