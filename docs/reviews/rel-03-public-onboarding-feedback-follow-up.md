# REL-03 Public Onboarding and Feedback Form Follow-up

Review date: 2026-07-20

Base branch: `develop`

Base SHA: `a16fe7606bbd3c16f7b84ca762387ffbd9a98d38`

Working branch: `codex/rel-03-onboarding-feedback`

## 1. Executive verdict and gate

```text
Verdict: REL_03_GIT_AUTHORIZATION_REQUIRED
Gate: AUTHORIZE_REL_03_GIT_WORKFLOW
```

The local REL-03 candidate closes the public-onboarding, feedback-form, and
package-documentation policy gaps identified by REL-02. It records, but does not
implement, a qualification-evidence architecture decision. Focused tests,
canonical tests, package guard, deterministic package dry-runs, and clean-install
smokes pass.

No Blocker or High defect remains in the local candidate. Exact-SHA hosted CI is
not available until the maintainer separately authorizes stage, commit, non-force
push, and one pull request to `develop`.

## 2. Exact base and REL-02 merge evidence

PR
[#13](https://github.com/thomasMinh1995/DepVerdict/pull/13) merged into
`develop` on 2026-07-19 with merge commit:

```text
a16fe7606bbd3c16f7b84ca762387ffbd9a98d38
```

Its head was
`4b1068a5648c29bdb3620c71489d6bf34f854ca7`. Node 20, Node 22, Node 24, and
Package smoke all completed successfully on that exact head.

Local `develop` was updated only by `git merge --ff-only origin/develop`, then
the dedicated REL-03 branch was created from the exact merge SHA. These REL-02
documents are present:

- `docs/reviews/rel-02-post-release-verification-feedback-readiness.md`;
- `docs/community/technical-preview-feedback-guide.md`;
- `docs/announcements/v0.6.0-alpha.1-technical-preview.md`.

## 3. Root causes and gaps addressed

REL-03 addresses four bounded root causes:

1. README and repository release notes retained pre-publication wording after the
   public package and GitHub Prerelease existed.
2. The bug form combined several product results into free text and did not
   explicitly collect mode, decision, handoff, or relevant provider identity.
3. `package.json.files` included all documentation except capture trees, so
   maintainer reviews and announcement copy entered development tarballs.
4. The local real-provider qualification record had integrity validation but no
   accepted package-ownership, issuer/signature, or revocation contract.

No runtime defect or source-policy change was required.

## 4. README and release-note changes

README now:

- states immediately that `0.6.0-alpha.1` is publicly available, not
  production-stable, and human-reviewed;
- presents
  `npm install -g @thomasminh1995/depverdict@preview` as the primary install;
- follows with the short `depverdict analyze .` runnable example;
- provides the project-local `--save-dev`/`npx` alternative;
- discloses the accepted npm `latest` limitation without implying stability;
- links the Technical Preview feedback guide and private-reporting guidance;
- keeps target ownership, fail-closed coverage, experimental Migration Checklist,
  provider identity, and no-autonomous-change boundaries.

The repository release note now uses stable post-publication wording, links the
GitHub Prerelease, identifies the exact package/version and `@preview` install,
records the immutable 252-file artifact hashes, discloses `latest`, and narrows
the retained qualification to the exact
`openai-compatible/openai/gpt-5.5/openai-compatible` tuple.

The published GitHub Release was not edited.

## 5. Issue Form field and privacy contract

The existing bug form was extended instead of creating an overlapping form. It
now has unique stable IDs for:

- DepVerdict version and installation source/tag;
- Node, npm, and operating-system versions;
- online/offline mode;
- command and exit code;
- completion state, Upgrade Decision, and Migration Handoff status;
- dependency occurrence;
- provider/runtime family and model only when relevant;
- sanitized repository shape, expected/actual behavior, reproduction, and
  optional artifact fragment.

Required result fields provide `Not available` or `Not applicable` options where
the CLI may have failed before producing them.

Both bug and feature forms explicitly prohibit API keys, npm tokens, PATs,
`.env`, signed URLs, private source, unsanitized manifests/artifacts, provider
payloads, and personal or organization-confidential data. Vulnerabilities route
to GitHub Private Vulnerability Reporting; sensitive conduct reports route to
the verified private Code of Conduct channel. Blank issues remain disabled.

YAML parsed successfully, item types and keys match the supported Issue Form
subset, IDs are unique, and the security route remains enabled.

## 6. Package-documentation policy

The accepted decision is:

[`rel-03-package-documentation-policy.md`](../decisions/rel-03-package-documentation-policy.md).

It defines six categories:

1. runtime-required;
2. user-operational;
3. trust/provenance evidence;
4. maintainer review;
5. announcement/promotional;
6. capture/private/transient.

The Technical Preview feedback guide remains package-visible and is required.
`docs/reviews/**` and `docs/announcements/**` are repository-only. Capture,
credential, environment, local, archive, and live qualification artifacts remain
forbidden.

The manifest excludes review and announcement prefixes. The guard independently
rejects either prefix if a future manifest regression leaks it. This is
deterministic and category-based rather than a three-filename exception.

## 7. Before/after package manifest and counts

| State | Files | Explanation |
| --- | ---: | --- |
| Published `0.6.0-alpha.1` | 252 | Immutable public artifact |
| REL-02 development state | 255 | Added feedback guide, review, and announcement |
| REL-03 local candidate | 240 | Category policy applied; two new ADRs included |

The exact REL-02-to-REL-03 delta is:

```text
255
- 16 files under docs/reviews/
-  1 file under docs/announcements/
+  2 REL-03 ADRs under docs/decisions/
= 240
```

The new REL-03 report is also under `docs/reviews/` and therefore does not alter
the tarball. The feedback guide stays included. Both package dry-runs produced
the same 240-file list, size, shasum, and integrity. No review, announcement,
capture, archive, or live qualification record appeared.

Package guard reports:

```text
240 files
0 suspicious artifacts
32 required assets
```

## 8. Qualification discovery and ADR

The accepted decision is:

```text
DEFER_PENDING_PROVENANCE_CONTRACT
```

See
[`rel-03-packaged-qualification-evidence.md`](../decisions/rel-03-packaged-qualification-evidence.md).

Discovery found the ignored, mode-`0600` retained record at the legacy-compatible
path `.upgradelens/migration-planning-qualification.json`. The current canonical
default is `.depverdict/migration-planning-qualification.json`. The public writer
validates and atomically persists project-local state; the resolver selects one
source and never merges roots.

The strict record contains generated time, exact provider/model/adapter and
evaluation identities, metrics, 15 critical gates, verdict, and canonical
SHA-256 digests. It contains no raw request/response, prompt text, endpoint,
signed URL, credential, local path, repository identifier, evaluator log, cost,
or billing field.

Current digests detect mutation but do not authenticate an issuer. The schema
does not define signer/trust root, release binding, revocation, supersession, or
package-owned versus project-local precedence. Therefore no local record was
copied, staged, or packaged. A separate provenance-contract task is required
before any implementation.

## 9. Focused and canonical validation

Passed:

- focused REL-03, repository-doc identity, and package-guard tests: 32/32;
- Issue Form YAML syntax, supported type/key, and unique-ID checks;
- `git diff --check`;
- Markdown relative-link and fence validation;
- placeholder, credential, private-data, and local-path scans;
- `npm run check`: 655 pass, 0 fail, 1 sandbox-only loopback skip;
- `npm run check:package`: 240 files, 0 suspicious, 32 required;
- two identical `npm pack --dry-run --json` results.

Provider calls were not required.

## 10. Clean-install and package results

An actual tarball was created in an isolated temporary directory and installed
with lifecycle scripts disabled. The install added 12 packages and passed:

- `depverdict --version` and `--help`;
- `upgradelens --version` and `--help`;
- executable permissions for both bins;
- ESM root import;
- 438 public exports;
- 22 of 22 schema files loaded and compiled with the repository's canonical Ajv
  strict configuration.

An exploratory schema probe using Ajv's different default
`strictRequired=true` rejected an existing schema construct. Re-running with the
repository's canonical `strict: true, strictRequired: false` configuration passed
22/22. This is not a package-policy regression.

## 11. Provider calls and cost

```text
Provider calls: 0
Provider cost: USD 0
```

## 12. Blocker/High defects and known limitations

Blocker defects: none.

High defects: none.

Known bounded limitations:

- npm `preview` and accepted first-publish `latest` both point to the immutable
  Alpha version;
- the conduct mailbox retains the legacy UpgradeLens name during `0.6.x`;
- GitHub Discussions remains disabled;
- installed-version and source-analysis coverage remains incomplete outside the
  strongest npm/JavaScript/TypeScript path;
- suggested verification commands are not executed;
- recovery plans are not synthesized;
- Migration Checklist remains experimental, opt-in, exact-identity-qualified,
  and human-reviewed;
- public machine-readable qualification evidence is deferred pending a provenance
  contract.

## 13. Exact files changed or created

Modified:

```text
.github/ISSUE_TEMPLATE/bug_report.yml
.github/ISSUE_TEMPLATE/feature_request.yml
README.md
docs/package-content-policy.md
docs/releases/v0.6.0-alpha.1-depverdict-preview.md
package.json
scripts/package-content-guard.mjs
test/package-content-guard.test.js
test/repository-docs-identity.test.js
```

Created:

```text
docs/decisions/rel-03-package-documentation-policy.md
docs/decisions/rel-03-packaged-qualification-evidence.md
docs/reviews/rel-03-public-onboarding-feedback-follow-up.md
test/rel-03-public-onboarding.test.js
```

The REL-02 feedback guide and announcement were reviewed and required no
consistency edit.

## 14. Pre-existing files preserved

All pre-existing untracked RR02 capture trees and duplicate-suffix capture files
remain untouched and untracked. The ignored local qualification record was read
only for bounded structure/privacy discovery and remains ignored. No cache, log,
transcript, `.env`, credential, tarball, or temporary install was added to the
repository.

No npm package, dist-tag, Git tag, GitHub Release, package version, provider,
runtime source, schema, decision policy, or CLI behavior was modified.

## 15. Hosted-CI status and handoff

REL-03 remains an unstaged local worktree. There is no candidate commit, remote
branch, PR head, or hosted CI SHA yet.

After separate maintainer authorization:

1. stage exactly the 13 REL-03 paths listed above;
2. re-run cached diff and package checks;
3. commit on `codex/rel-03-onboarding-feedback`;
4. push non-force and open one PR to `develop`;
5. wait for Node 20, Node 22, Node 24, and Package smoke;
6. correlate local, remote, PR head, and hosted run SHA;
7. stop before merge and announcement publication.

## 16. Final verdict and next task

```text
Verdict: REL_03_GIT_AUTHORIZATION_REQUIRED
Gate: AUTHORIZE_REL_03_GIT_WORKFLOW
```

Next task: maintainer review of this exact 13-file inventory and explicit
authorization for stage/commit/push/PR. The controlled community announcement
must remain unpublished until exact-SHA hosted CI passes and a final independent
readiness assessment returns the public-feedback gate.
