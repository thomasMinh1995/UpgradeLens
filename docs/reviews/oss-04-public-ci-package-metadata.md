# OSS-04 — Public CI and Package Metadata

## 1. Executive verdict

**Verdict: `PUBLIC_CI_READY_PENDING_HOSTED_RUN`**

UpgradeLens now has a read-only public CI contract for pull requests, `main`,
`develop`, and manual dispatch. It validates Node 20, 22, and 24, runs the canonical
suite and actual-manifest package guard, and performs a clean installed-package
smoke on Node 24. Public npm metadata now describes the decision-first,
evidence-bounded CLI and links to the canonical repository, README, and issue
tracker.

Static validation and local matrix replay pass with the documented Node 20
concurrency bound. The workflow has not been committed or pushed, so no GitHub
Actions run URL or hosted commit proof exists.

## 2. Previous CI and metadata gaps

Before OSS-04:

- `.github/workflows/` did not exist;
- pull requests and long-lived branches had no public automated gate;
- the npm description still described generic project discovery;
- keywords emphasized discovery and modernization rather than the current product;
- npm metadata had no homepage or bug-tracker URL;
- package/install/CLI/import verification existed only in release-review evidence,
  not in a public workflow.

The repository URL, version, engine, bin, export, files, type, and license were
already correct.

## 3. Architecture decision

The complete decision is recorded in
`docs/oss-04-public-ci-package-metadata-architecture.md`. The design uses one
supported-Node matrix job and one Node 24 package-smoke job. It keeps test,
packaging, and consumer-install behavior visible as ordinary npm/Node commands and
adds no deployment, publishing, release, or dependency-update automation.

## 4. Workflow triggers and permissions

| Contract | Decision |
| --- | --- |
| Pull requests | Every `pull_request` |
| Pushes | `main` and `develop`, matching verified local and remote long-lived branches |
| Manual | `workflow_dispatch` enabled |
| Schedule | None; no time-based check is in scope |
| Workflow token | `contents: read` only |
| PR model | Ordinary `pull_request`; never `pull_request_target` |
| Checkout credentials | `persist-credentials: false` |

No job has package, identity-token, security-event, issue, pull-request, or content
write permission.

## 5. Node matrix and official support evidence

The project engine remains `>=20`; OSS-04 does not narrow it.

| Node | Role at the OSS-04 decision date | Upstream end date | CI behavior |
| ---: | --- | --- | --- |
| 20 | Declared compatibility floor; upstream EOL | 2026-04-30 | Full suite with test-runner concurrency 2 |
| 22 | Maintenance LTS | 2027-04-30 | Full canonical `npm test` |
| 24 | Active LTS and primary release line | 2028-04-30 | Full canonical tests plus package smoke |

Evidence is the official
[Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json).
Node 26 is Current and is not scheduled to enter LTS until October 2026, so it is not
a mandatory Technical Preview gate.

Local replay initially found one Node 20 keep-alive lifecycle test exceeding its
unchanged three-second natural-exit budget under default full-suite concurrency. The
test passed alone in 1.25 seconds, and the complete 633-test suite passed with
`--test-concurrency=2`. CI applies that bound only to Node 20. No test is skipped,
its timeout is not increased, and Node 22/24 retain the plain canonical command.

## 6. Action pinning policy

Only GitHub-maintained actions are used:

| Action | Immutable reference | Reviewed release line |
| --- | --- | --- |
| `actions/checkout` | `df4cb1c069e1874edd31b4311f1884172cec0e10` | `v6` |
| `actions/setup-node` | `249970729cb0ef3589644e2896645e5dc5ba9c38` | `v6` |

The references were resolved from the official repositories at implementation time.
Full commit SHAs prevent a moving tag from changing executed code without a
repository diff. Updates require a reviewed pull request.

## 7. Install, test, and package-smoke flow

Every matrix entry performs:

1. checkout without persisted credentials;
2. setup of its exact Node major and npm lockfile cache;
3. `npm ci`;
4. the full canonical test script;
5. `npm run check:package` against an actual lifecycle-disabled tarball.

The primary Node 24 package job additionally performs:

1. `npm pack --dry-run --json --ignore-scripts`;
2. actual tarball creation in isolated temporary output/cache;
3. actual-manifest package-guard validation;
4. tar extraction and manifest-to-filesystem equality;
5. clean temporary install with lifecycle scripts disabled;
6. installed CLI `--version` and `--help`;
7. ESM import and the 438-public-export assertion;
8. unconditional cleanup in `finally`.

No tarball is uploaded or retained as a GitHub Actions artifact.

## 8. Fork, security, and provider isolation

The workflow uses no `secrets` expression and gives fork pull requests only the
read-only token. It does not interpolate PR title, body, branch, labels, actor input,
or other PR-controlled text into shell commands.

`CI=true` is explicit. Supported UpgradeLens provider variables are shadowed with
empty values at workflow scope, and the package-smoke subprocess environment removes
them. Deterministic tests inject their own fakes where needed. CI does not need
OpenAI, OpenRouter, Anthropic, Ollama, an API key, `.env`, a persisted qualification
record, or private repository access.

## 9. Lifecycle and side-effect review

`package.json` has no `prepack`, `prepare`, `prepublishOnly`, `preinstall`,
`install`, or `postinstall` hook. The package guard and smoke pack with
`--ignore-scripts`; clean consumer installation also disables lifecycle scripts.
There is no package-guard recursion.

The workflow contains no publish, pack upload, Git commit, tag, push, release,
deployment, PR comment, lockfile writeback, or repository API write. It has neither
the command nor permission/credential path needed to publish.

Concurrency uses the workflow name and stable Git ref with
`cancel-in-progress: true`. Each job has a 20-minute timeout. No command or provider
can hang without a finite job boundary.

## 10. Package metadata before and after

| Field | Before | After |
| --- | --- | --- |
| Description | Generic project structure/technology discovery | Decision-first CLI for evidence-bounded dependency upgrade analysis |
| Repository | Canonical GitHub Git URL | Unchanged |
| Homepage | Missing | Canonical GitHub README |
| Bugs | Missing | Canonical GitHub Issues |
| Keywords | discovery, migration, modernization, cli | cli, dependency-upgrades, migration-planning, repository-analysis, developer-tools |
| Version | `0.5.0` | `0.5.0` |
| Engine | `>=20` | `>=20` |

The npm issue URL handles ordinary bugs and does not replace the private security
route documented in `SECURITY.md`.

Name, license, type, bin, export, package files, dependency tree, and runtime
behavior are unchanged. No author email, funding URL, unsupported ecosystem claim,
or production-stability claim was invented.

## 11. Lockfile impact

`npm install --package-lock-only --ignore-scripts --no-audit --no-fund` reported the
tree up to date and produced no `package-lock.json` diff. npm's lockfile v3 root
record does not mirror description, homepage, bug URL, or keywords. Version,
dependencies, resolved URLs, integrity values, bin, license, and engine remain
unchanged.

## 12. Focused and static workflow validation

The focused CI/metadata suite passes 6/6 and verifies:

- PR, push-branch, and manual triggers;
- absence of `pull_request_target`;
- read-only permission and non-persisted checkout credentials;
- immutable official action references;
- Node 20/22/24 matrix;
- `npm ci`, canonical tests, package guard, dry-run pack, and package smoke;
- timeout, cache, concurrency, and cancellation;
- no secret expression or publish/release/write command;
- exact description, URLs, keywords, version, engine, and lockfile version.

Ruby Psych parses the workflow YAML successfully. Manual security review confirms
that all expressions are GitHub-owned matrix/ref values used by Actions keys, not
untrusted event text passed into shell.

## 13. Canonical, package, and install validation

| Check | Result |
| --- | --- |
| Focused CI/metadata tests | 6/6 pass |
| Focused package guard | 18/18 pass |
| Canonical local suite | 633 total: 632 pass, 0 fail, 1 known sandbox-loopback skip |
| Node 20 local matrix replay | Pass with concurrency 2; 633 tests executed |
| Node 22 local matrix replay | Pass; 633 tests executed |
| Node 24 local matrix replay | Pass; 633 tests executed |
| Package guard | Pass; 0 suspicious artifacts, 20 required assets |
| Actual extraction | Pass; extracted paths equal actual tar entries |
| Clean tarball install | Pass |
| Installed CLI | `--version` returns `0.5.0`; `--help` exits zero |
| ESM package import | Pass |
| Public exports | 438 |
| Schema/evaluation identity | Pass through canonical schema, dataset, lineage, and determinism coverage |
| Provider calls | 0 |

The local default-runtime canonical run retains the known skip because this sandbox
does not permit its loopback listener. Escalated Node matrix replay executes the
listener test rather than accepting an unexpected skip.

## 14. Tarball delta

The OSS-03 explained package contained 232 files. OSS-04 intentionally adds two
published documents:

- `docs/oss-04-public-ci-package-metadata-architecture.md`;
- `docs/reviews/oss-04-public-ci-package-metadata.md`.

The final explained package therefore contains 234 files. The workflow, repository
smoke helper, and focused test remain outside the `files` allowlist. Metadata changes
modify `package/package.json` content but do not add a path. Root community policies
and `.github/` remain absent from npm.

Repeated dry-run manifests, the final actual tarball, extraction, and suspicious
artifact scan are required to agree on this 234-file boundary.

## 15. Hosted CI execution status

**Local status: `LOCAL_CI_CONTRACT_VALIDATED`**

**Hosted status: `HOSTED_CI_NOT_YET_EXECUTED`**

No workflow commit was pushed, so there is no valid GitHub Actions run URL or hosted
commit SHA. This report does not claim hosted success.

## 16. Branch-protection handoff

After an authorized commit:

1. push the task branch;
2. open or update its pull request;
3. observe `Node 20`, `Node 22`, `Node 24`, and `Package smoke (Node 24)`;
4. confirm no secret prompt or permission escalation appears;
5. confirm every canonical, guard, and package-smoke step passes;
6. record the Actions run URL and exact commit SHA;
7. do not merge if a required job fails or unexpectedly skips coverage.

Only after those check names have run should maintainers consider requiring them for
merge. Recommended branch policy is required CI on `main`, appropriate up-to-date
enforcement for the repository's merge flow, and blocked force pushes/deletions.
OSS-04 does not configure branch protection through an API.

## 17. Blocked and skipped checks

Hosted CI is intentionally blocked by the no-commit/no-push task boundary, not by an
implementation failure. One default local canonical test is skipped only because
the restricted sandbox cannot bind its loopback listener; matrix diagnostics run
that test successfully.

No real provider, npm publish, GitHub Release, tag, deployment, branch-protection
mutation, or package upload was attempted.

## 18. Defects and limitations

| Severity | Count | Detail |
| --- | ---: | --- |
| Blocker | 0 | None |
| High | 0 | None after local matrix and package replay |
| Medium | 0 | None |
| Low/accepted limitation | 2 | Hosted proof pending; Node 20 is upstream EOL and remains only the declared compatibility floor |

The Node 20 concurrency bound mitigates a demonstrated test-runner resource flake
without changing behavior or suppressing a test. A hosted failure remains a
required stop condition, not an accepted baseline.

## 19. Exact files changed or created

- Created `.github/workflows/ci.yml`.
- Created `scripts/ci-package-smoke.mjs`.
- Created `test/ci-workflow-metadata.test.js`.
- Created `docs/oss-04-public-ci-package-metadata-architecture.md`.
- Created `docs/reviews/oss-04-public-ci-package-metadata.md`.
- Modified `package.json`.

No runtime, schema, dataset, evaluation fixture, package version, dependency,
lockfile, README, community route, qualification record, or historical capture was
changed.

## 20. Pre-existing changes preserved

The initial branch was `fix/public-preview-readiness` at
`b498d52aea073211b10804c8507a37895b3f543e`. The pre-existing modified RR02 rerun
manifest, RR02/RR02-FIX-05 captures, retained numeric-suffix capture copies, ignored
material, and all historical evidence were left untouched.

No destructive Git command, commit, merge, tag, push, release, publish, provider
call, target-repository mutation, or qualification regeneration was performed.

## 21. Final verdict and next gate

**Verdict: `PUBLIC_CI_READY_PENDING_HOSTED_RUN`**

The workflow contract, permissions, fork safety, provider isolation, supported Node
matrix, package boundary, clean consumer install, CLI, import/export contract,
metadata, lockfile consistency, and local validation pass. Package version remains
`0.5.0`; no Blocker or High defect is open.

**Gate: `PROCEED_TO_HOSTED_CI_VERIFICATION`**

OSS-05 qualification must not treat CI as hosted evidence until all intended jobs
pass on GitHub Actions at a recorded commit and run URL.
