# OSS-05 — Technical Preview Qualification

## 1. Executive verdict

**Verdict: `TECHNICAL_PREVIEW_QUALIFICATION_BLOCKED`**

**Gate: `HOSTED_CI_REFRESH_REQUIRED`**

The immutable public candidate at
`a390bac2d911a832dbd8e64e3e0a172bfd15e299` passes its product, package, hosted-CI,
install, workflow, trust, and community-route checks. No Blocker or High
product/security defect was found in that snapshot.

Qualification nevertheless cannot end at `READY_FOR_PUBLIC_TECHNICAL_PREVIEW`.
OSS-05 added the missing public-safe sample, zero-secret onboarding, focused
feedback guidance, a corrected test baseline, this report, and the release-note
draft. Those intentional changes are not part of the hosted-verified SHA. Some are
package-visible documentation. They must be reviewed, committed, pushed, and pass
hosted CI at one new exact PR-head SHA before the final public snapshot can be
qualified.

An external developer can understand, install, run, evaluate, and safely report
issues with the locally completed candidate. The public PR does not yet contain all
of that completed onboarding, so publication must wait for the refresh.

## 2. Final qualification SHA and PR

| Boundary | Observed value |
| --- | --- |
| Local `HEAD` | `a390bac2d911a832dbd8e64e3e0a172bfd15e299` |
| Remote branch | `origin/fix/public-preview-readiness` at the same SHA |
| Pull request | [#9](https://github.com/thomasMinh1995/UpgradeLens/pull/9), open |
| PR head | Same SHA |
| PR base | `develop` |
| Public API mergeability | `true`; state `clean` at observation time |
| Qualification branch | `fix/public-preview-readiness` |

The equality was established after `git fetch origin`; no stale OSS-04 SHA was
reused. The previous `b3f5880...` hosted commit is only historical context.

## 3. Hosted CI evidence for the exact SHA

[GitHub Actions CI run #2](https://github.com/thomasMinh1995/UpgradeLens/actions/runs/29676103134)
is a completed `pull_request` run for the exact qualification SHA and concluded
`success`.

| Hosted job | Required evidence | Conclusion |
| --- | --- | --- |
| Node 20 | `npm ci`, bounded canonical test command, package guard | `success` |
| Node 22 | `npm ci`, canonical suite, package guard | `success` |
| Node 24 | `npm ci`, canonical suite, package guard | `success` |
| Package smoke (Node 24) | dry-run manifest, actual pack, extraction, install, CLI, import | `success` |

The public run/job/step APIs were the evidence source. Conditional alternate test
steps were skipped as designed: Node 20 uses bounded test concurrency, while Node
22/24 use the canonical command. The run retained zero artifacts. The workflow
requests no provider secret, uses ordinary `pull_request`, grants only
`contents: read`, disables persisted checkout credentials, has concurrency and
timeouts, pins official actions by full SHA, and contains no publish, tag, release,
push, writeback, or `pull_request_target` path.

Raw log download was not needed because public structured APIs exposed the exact
SHA and every required job/step conclusion.

## 4. Clean-checkout boundary

Two isolated boundaries were made from the exact SHA:

1. a detached clean Git checkout, with no working-tree changes, `.env`, local
   `.upgradelens/` records, or capture directories;
2. a `git archive` extraction with no Git metadata, used to exercise the
   source-archive structural package mode.

Qualification ran on Node `v26.0.0`, npm `11.12.1`, Darwin arm64. Hosted CI supplies
the supported Node 20/22/24 portability evidence; Node 26 is additional local
evidence, not a declared support-floor change.

The detached checkout passed the canonical suite. Running the whole repository test
suite directly in the Git-less archive produced 631 pass, one expected
Git-correlation test failure, and one sandbox-loopback skip because that one test
asserts Git metadata is available. The dedicated source-archive package test passed
and the archive-mode guard remained fail-closed structurally. This is a test-topology
constraint, not a packaged runtime failure; contributor instructions use `git clone`.

## 5. Public product truth assessment

README, package metadata, CLI help/version, public policies, issue/PR templates,
schemas, Upgrade Decision and Migration Checklist presentation, OSS-01 through
OSS-04 reports, package policy, and CI were cross-checked.

| Claim | Assessment |
| --- | --- |
| Stage | Clearly Public Technical Preview / Alpha |
| Primary interface | `upgradelens analyze` CLI |
| Registry target | Candidate discovery only; never an implicit driver |
| Explicit target | Structured caller-selected, occurrence-scoped target |
| Upgrade Decision | Deterministic and occurrence-scoped |
| Migration handoff | Evidence-bounded and human-reviewed |
| Checklist | Experimental, opt-in, disabled by default |
| Source changes | Never performed |
| Verification commands | Proposed only; never executed |
| Recovery | Not synthesized without structured evidence |
| Provider boundary | Provider-neutral API; quality and qualification identity-specific |
| Offline mode | Explicitly limited and visibly fail-closed |

No public surface claims production readiness, autonomous migration, guaranteed
safety, full ecosystem support, model-independent quality, or freedom from human
review.

## 6. Package metadata assessment

`package.json` and lockfile root metadata agree:

- package `upgradelens`, version `0.5.0`, not marked private;
- decision-first, evidence-bounded CLI description;
- canonical repository, README homepage, and public bug-tracker URLs;
- MIT metadata matching `LICENSE`;
- Node engine `>=20`, aligned with the tested compatibility floor;
- accurate bounded keywords;
- executable `upgradelens -> bin/upgradelens.js`;
- root ESM export `src/index.js`;
- explicit `files` allowlist and capture exclusion;
- no invented maintainer email and no security-reporting misuse of `bugs.url`;
- no dependency or lockfile-root drift from OSS-04.

The four runtime dependencies and their lock entries remained unchanged.

## 7. Tarball manifest, digest, and reproducibility

The exact hosted SHA passed `npm run check:package`: 234 files, zero suspicious
artifacts, and all 20 required assets.

| Observation | Exact-SHA result |
| --- | --- |
| Dry-run entry count | 234 |
| Actual extracted file count | 234 |
| Packed size | 595,410 bytes |
| Unpacked size | 2,337,936 bytes |
| Actual tarball SHA-256 | `700a58100c3d70d43b0a2db7a12dfa7e652906c03457a3541852e3dca406173c` |
| Normalized entry inventory SHA-256 | `d753ad14685c695977726ed2a890b166e721371fc3648e75112d4db10ff798b9` |
| Repeated actual pack | byte-identical |

The move from the historical 232-file OSS-03 boundary to 234 is already explained
by the two intended OSS-04 documents:
`docs/oss-04-public-ci-package-metadata-architecture.md` and
`docs/reviews/oss-04-public-ci-package-metadata.md`.

Actual entry and byte scans found no duplicate/copy/backup runtime artifact,
capture, `.env`, credential material, local absolute path, `.upgradelens/` record,
Git metadata, dependency tree, nested archive, or unintended qualification record.
The intentional historical documentation title containing “Capture” is not capture
evidence.

The OSS-05 release note and qualification report are package-visible documents, so
the eventual committed candidate is expected to add two paths (236 total); README
content will also change in place. The sample is intentionally source-only. No
digest or hosted claim is made for that not-yet-committed candidate.

## 8. Clean install, CLI, and import results

The actual exact-SHA tarball was installed into a new isolated prefix and cache with
lifecycle scripts disabled; it did not symlink to the source checkout.

| Check | Result |
| --- | --- |
| Install | pass; 12 packages installed |
| `upgradelens --version` | `0.5.0` |
| `upgradelens --help` | exit 0; decision-first help and workflow options present |
| ESM root import | pass |
| Public exports | exactly 438 |
| Official package smoke | pass; 234 extracted files, 20 required assets |

No global user provider configuration was used for version, help, import,
discovery, or the zero-secret offline sample.

## 9. Community sample and onboarding result

No suitable user-facing sample existed in the qualification SHA. Internal fixtures
were not reused because they carry test-only shapes and lack public instructions.

OSS-05 therefore adds `examples/technical-preview-node/` with:

- a private nested package and exact `fast-deep-equal@3.1.3` declaration;
- a package-lock v3 installed baseline;
- a real default import and usage;
- zero credentials, provider configuration, cached evidence, qualification record,
  intentional vulnerability, or generated artifact.

The installed exact-SHA CLI discovered one Node project, one dependency occurrence,
and installed version `3.1.3` with no warning. The offline workflow made no provider
request and completed `INSUFFICIENT_DATA`, default exit 0, with target `null`,
`NOT_ANALYZED`, visible review requirement, and no invented evidence or
recommendation. Strict mode returned exit 2.

The sample is excluded because `package.json.files` does not include `examples/`.
This prevents nested package bloat/conflict and accidental generated-output
publication. Installed users follow the repository sample link; source evaluators
can run it directly.

## 10. Representative workflow results

Existing deterministic fixtures and public CLI tests were used; no business rule
was added for this sample and no real-provider credit was consumed.

| Scenario | Qualification result |
| --- | --- |
| A. Default registry candidate | pass: newer candidate without driver becomes `INVESTIGATE`; no automatic plan |
| B. Explicit target | pass: exact occurrence receives `USER_SELECTED_TARGET`; sufficient evidence can produce `PLAN_UPGRADE`; others remain default |
| C. Installed equals target | pass: `KEEP_CURRENT`, zero actions, successful completion |
| D. Duplicate selector | pass: ambiguity fails pre-provider; unique copy/paste selectors; exact selection isolated; stale/conflicting IDs fail with zero calls |
| E. Coverage limitation | pass: unavailable/partial coverage never becomes a verified negative; positive evidence remains visible |
| F. Provider/output failure | pass: retained failure produces `PARTIAL`, exit 2 |
| G. Insufficient data | pass: no invented fact; default 0 and strict 2 |
| H. Offline | pass: local facts only, limitations visible, no fabricated confidence |
| I. Cancellation | pass: controlled cancellation exits 130 |
| J. Migration Checklist | pass: disabled by default, opt-in, identity-gated, bounded, human-reviewed, no patch/command execution |

## 11. Completion and exit matrix

The installed-product projection contract and focused tests confirm:

| Completion | Default exit | `--fail-on-incomplete` |
| --- | ---: | ---: |
| `COMPLETED` | 0 | 0 |
| `COMPLETED_WITH_REVIEW` | 0 | 2 |
| `INSUFFICIENT_DATA` | 0 | 2 |
| `PARTIAL` | 2 | 2 |
| `FAILED` | 1 | 1 |
| `CANCELLED` | 130 | 130 |

Zero actions and an all-`KEEP_CURRENT` result remain successful.

## 12. Migration qualification boundary

The ignored machine-readable record was inspected read-only through bounded
metadata fields, never copied into the package, sample, or report. It is schema
version `1.0.0`, verdict `QUALIFIED`, generated
`2026-07-17T03:32:16.710Z`, with:

- task `migration-planning.v2`;
- runtime mode `real`;
- provider/adapter `openai-compatible`;
- exact model `openai/gpt-5.5`;
- dataset `migration-planning-golden@2.0.0` and its digest;
- evaluation-criteria, policy, prompt, candidate-schema, comparator, normalization,
  and deterministic-presentation identities/digests;
- 15/15 critical gates passed, every threshold passed, no record limitation;
- canonical record digest
  `sha256:e55b2d6f2f82091f5ce321e3e6b3a36cab8a34ea7608464ccd08b8ef49813847`.

The supported resolver/materialization tests passed for valid, missing, invalid,
tampered, mismatched, and non-qualified records. The record is ignored/local and
absent from clean checkout and npm package by policy. Public default analysis does
not require it. Experimental Checklist users must provide an exact matching record;
missing default qualification is surfaced honestly, while an invalid explicit path
never falls back.

This qualification does not generalize to another model, model version, provider,
endpoint, adapter, local runtime, or all OpenAI-compatible services. No real-provider
replay was needed because identity and retained evidence remained valid.

## 13. Community, security, conduct, and support readiness

| Surface | Result |
| --- | --- |
| `CONTRIBUTING.md` | clone/install/test/guard/help commands and trust invariants are accurate |
| Security | GitHub API returned HTTP 200 with Private Vulnerability Reporting `enabled: true` |
| Conduct | `upgradelens.conduct@gmail.com` is the maintainer-confirmed private contact |
| Support | bounded routing matrix; no production SLA or private-source request |
| Bug form | version, environment, completion, minimal sanitized reproduction, privacy acknowledgements |
| Feature form | problem/workflow, trust boundary, alternatives, privacy acknowledgement |
| PR template | scope, validation, package, schema, privacy, determinism, human ownership |
| Public disclosure safety | vulnerabilities never routed to a public issue |

Blank issues are disabled. GitHub Discussions remains unavailable, but README/issue
search is an explicit best-effort usage route. No form requests a credential, full
private artifact directory, private source, or raw provider payload.

## 14. Feedback questions

README, CONTRIBUTING, and the release-note draft now ask the Technical Preview
questions that matter:

1. Are decisions understandable and actionable?
2. Is `INVESTIGATE` too frequent or too rare?
3. Is the installed baseline correct in real npm workspaces/monorepos?
4. Is ambiguity and copy/paste selector UX usable?
5. Are coverage limitations clear enough to prevent false confidence?
6. Does the migration handoff reduce re-research?
7. Are completion states and exit codes useful in CI?
8. Which artifacts help code review and team planning?

No question implies that autonomous migration is part of v0.5.0.

## 15. npm registry and package-name check

An unauthenticated read-only request to
`https://registry.npmjs.org/upgradelens` returned HTTP 404 `Not found` on
2026-07-19. Therefore neither the package name nor `upgradelens@0.5.0` had a public
registry record at observation time. No reservation, login, ownership mutation, or
publish was attempted.

The 404 removes a known prior-owner/version collision, but it does not prove that
the maintainer's npm account is publish-ready or guarantee the name remains
available later. Recheck immediately before the authorized publish.

## 16. Recommended release strategy

**Recommendation: Option B — publish `upgradelens@0.5.0` under npm dist-tag
`preview`, never `latest`, after the refreshed exact-SHA gate passes.**

Rationale:

- `0.5.0` is already consistently committed in package metadata, lockfile, CLI,
  docs, and hosted qualification;
- the package/version is currently unpublished, so a non-default tag can introduce
  the exact qualified bytes without silently changing version metadata;
- `preview` matches the Public Technical Preview label and avoids stable-channel
  expectations;
- source-only GitHub installation remains available, but npm preview gives external
  developers a reproducible install boundary;
- Option C would require an explicit version-change task and complete
  requalification; Option A is safer than `latest` but provides a less representative
  install experience.

The maintainer still owns the release decision. The release workflow must recheck
registry state, verify the final packed digest from the committed checkout, publish
with the explicit non-default tag, and verify that `latest` was not moved. OSS-05
does none of those mutations.

## 17. Release-notes draft status

`docs/releases/v0.5.0-technical-preview.md` is created and publication-ready for the
recommended `preview` strategy. It begins with the Technical Preview label and
contains value, install/source paths, zero-secret sample, MVP-05 capabilities,
supported scope, limitations, human-review boundaries, community/security routes,
feedback questions, and validation summary. It makes no autonomous-migration or
production-safety claim and has no unresolved placeholder.

## 18. Branch-protection handoff

Unauthenticated read-only GitHub API checks for `main` and `develop` protection each
returned HTTP 401 `Requires authentication`; no PAT or repository setting was read
or changed. Protection is therefore **not verified**, rather than claimed absent.

Before or immediately after the first preview publication, the maintainer should:

- require pull requests before merging to `main`;
- require the stable hosted CI checks that actually appear on PR #9;
- block force pushes and branch deletion;
- require conversation resolution if it fits the solo-maintainer workflow;
- apply an appropriate `develop` policy without inventing a nonexistent check name.

This is a Medium governance limitation, not an automatic Technical Preview product
blocker. The immediate block is the exact-SHA hosted refresh.

## 19. Tests and validations

| Validation | Result |
| --- | --- |
| Clean detached `npm ci` | pass |
| Canonical suite | 633 total: 632 pass, 0 fail, 1 known skip |
| Representative workflow/decision/CLI focus | 90/90 pass |
| Package-guard focus | 18/18 pass |
| CI/package-metadata focus | 6/6 pass |
| Package guard | 234 files, 0 suspicious, 20 required assets |
| Repeated dry-run/actual pack | pass; normalized inventory and bytes stable |
| Actual extraction and scan | pass |
| Clean tarball install | pass |
| Installed version/help/import/exports | pass / pass / pass / 438 |
| Sample discovery/offline/default/strict | pass / `INSUFFICIENT_DATA` / 0 / 2 |
| Schema, lineage, tamper, identity, determinism | pass through canonical and focused suites |
| Hosted exact-SHA CI | all four jobs success |
| npm registry read-only check | 404, unpublished |
| Private Vulnerability Reporting | HTTP 200, enabled |

`git diff --check`, YAML parsing, Markdown relative-link checks, placeholder scans,
package guard, and package-boundary checks are rerun after report creation; their
final state is recorded in the handoff response rather than used to claim hosted
coverage for local files.

## 20. Blocked and skipped checks

- Final hosted CI for the OSS-05 documentation/sample candidate is blocked until a
  maintainer reviews, commits, and pushes those changes.
- Final tarball digest for that future commit is intentionally not claimed.
- Branch protection details require authenticated administration access and were
  not inspected with a token.
- The one canonical skip is the unchanged sandbox restriction on a local loopback
  listener; hosted Node jobs pass.
- Direct full-suite execution in a Git-less source archive has one Git-correlation
  assertion failure; the dedicated archive structural guard passes.
- No real-provider replay, advisory submission, conduct email, merge, tag, release,
  publish, external sample push, or repository-setting mutation was performed.

## 21. Defects by severity

### Blocker/High

No Blocker or High product, security, trust, package, workflow, or community-route
defect was found in the exact qualification SHA.

The qualification itself remains blocked by required evidence freshness: the
completed OSS-05 onboarding/release documents are not yet an immutable PR head with
hosted CI. This is a release-process block, not a hidden product pass.

### Medium

- Branch protection is not publicly verifiable without authentication.
- GitHub Discussions is disabled; usage questions use README and issue search.
- The sample is source-repository-only rather than npm-package content.
- Downloaded Git-less source archives cannot run one strict Git-correlation test,
  though package structural mode and packaged runtime work.

### Low

None open.

## 22. Known limitations

Technical Preview limitations remain explicit: npm lockfile v2/v3 is the primary
installed-baseline path; pnpm/Yarn and Python installed environments are
unsupported; source usage is JavaScript/TypeScript-only; detected ecosystems are
not automatically supported; offline mode may be insufficient; provider/model
quality varies; Migration Checklist qualification is exact-identity-specific;
verification commands are not executed; source is not modified; and recovery is not
invented.

Node 20 remains the declared compatibility floor and hosted matrix member even
though its upstream lifecycle has ended; Node 22/24 are also hosted-qualified.

## 23. Exact files created or changed

Created:

- `examples/technical-preview-node/README.md`
- `examples/technical-preview-node/package.json`
- `examples/technical-preview-node/package-lock.json`
- `examples/technical-preview-node/src/index.js`
- `docs/releases/v0.5.0-technical-preview.md`
- `docs/reviews/oss-05-technical-preview-qualification.md`

Changed:

- `README.md` — zero-secret sample path, corrected 632-pass baseline, and concise
  feedback guidance.

No production source, schema, policy, version, workflow, lockfile root, dependency,
branch setting, tag, or release was changed.

## 24. Pre-existing changes preserved

All pre-existing RR02 capture work remains untouched:

- the modified `docs/rr02-rerun-cli-captures/manifest.json`;
- the untracked `docs/rr02-fix-05-cli-captures/` tree;
- the untracked numeric-copy files under rerun capture 003;
- the untracked rerun capture directories 008 through 018.

Those paths were excluded from clean qualification and npm packaging. OSS-05 did
not delete, normalize, stage, rewrite, or include them.

## 25. Final gate and next human actions

**Final gate: `HOSTED_CI_REFRESH_REQUIRED`**

The maintainer should:

1. review only the seven OSS-05 files listed above, keeping RR02 work separate;
2. commit and push the intended OSS-05 candidate to PR #9;
3. confirm local, remote, PR head, and the new hosted run all equal one SHA;
4. require Node 20/22/24 and package smoke to pass again and confirm zero artifacts;
5. rerun actual pack/install/CLI/import from that committed SHA and record its final
   manifest/digest;
6. change the verdict to qualified only if no Blocker/High appears;
7. explicitly approve Option B or choose another strategy;
8. merge/tag/release/publish only in the separately authorized release workflow;
9. if Option B is chosen, recheck npm name/version state and publish with the
   explicit `preview` tag without moving `latest`;
10. configure or confirm branch protection through an authorized settings review.

Until steps 1–5 pass at one immutable SHA: **do not proceed to public preview**.
