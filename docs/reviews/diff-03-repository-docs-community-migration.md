# DIFF-03 — Repository, Documentation, and Community Identity Migration

> Post-rename status update (2026-07-19): the repository rename is complete and
> `https://github.com/thomasMinh1995/DepVerdict` is canonical. References below to
> an unexecuted rename or the former live URL describe the original DIFF-03
> checkpoint unless a section explicitly gives current status.

## 1. Executive verdict

```text
Verdict: DEPVERDICT_DOCS_READY_WITH_CONTACT_OR_RENAME_GAPS
Gate: PROCEED_TO_HOSTED_CI_CHECKPOINT
```

Current normative repository content presents DepVerdict
`0.6.0-alpha.1`, `@thomasminh1995/depverdict`, `depverdict`,
`.depverdict/`, and `DEPVERDICT_*` as canonical. The remaining gaps are the
deliberately unexecuted GitHub repository rename and the verified,
legacy-named conduct address retained for one preview transition. Both routes
remain usable; neither is a Blocker or High defect.

DIFF-02 is committed and the branch was remote-aligned at baseline commit
`cae7c278c5425e4c33b2f789266ec5754dde7bae`. Hosted CI proof for the uncommitted
DIFF-03 state cannot exist and remains the next checkpoint.

## 2. Migration architecture decision

The accepted decision is recorded in
`docs/decisions/diff-03-repository-docs-community-migration.md`. It separates
current normative ownership from historical, versioned architecture, protocol,
fixture, and external-reference ownership.

The migration was explicitly two-phase:

1. DIFF-03 migrates repository content to the DepVerdict product identity while
   retaining links that work today.
2. The later maintainer operation renamed GitHub. DIFF-04-FIX updates the live
   URL/fields listed in Section 21.

The conduct decision is `KEEP_VERIFIED_LEGACY_CONTACT_FOR_ONE_PREVIEW`.

## 3. Document classification methodology

Every tracked old-name match was classified before broad editing:

| Classification | Treatment | Representative owners |
| --- | --- | --- |
| `CURRENT_NORMATIVE` | Migrated | README, community policies/templates, current architecture overview, sample, evaluation README, workflow presentation |
| `CURRENT_COMPATIBILITY_DOCUMENTATION` | Old name retained only to explain bounded fallback | README migration section, migration guide, CLI/qualification/package docs |
| `HISTORICAL_RECORD` | Preserved | MVP/MP/RR/OSS reviews, validation reports, capture evidence, `v0.5.0` release |
| `VERSIONED_ARCHITECTURE_RECORD` | Preserved; current overview now disambiguates ownership | MVP, IA, MP, GR, runtime discovery and architecture documents |
| `TEST_FIXTURE_ASSERTION` | Preserved | legacy CLI/env/artifact tests, `generator.name`, schema and qualification fixtures |
| `RUNTIME_IDENTITY_ALREADY_MIGRATED` | Regression-tested, not reimplemented | package/bin/runtime compatibility from DIFF-02 |
| `EXTERNAL_PROJECT_REFERENCE` | Preserved | source-comparison and external validation evidence |
| `UNRELATED_TEXT` | Unchanged | license attribution and unrelated identifiers |

At the DIFF-03 checkpoint, old-name matches were explained by compatibility, the
then-live GitHub/security URL, the verified conduct address, the pre-rename clone
directory, or a protocol identity. Current operational references are superseded
by this report's post-rename update and DIFF-04-FIX.

## 4. README and product positioning migration

The README now:

- visibly labels DepVerdict as **Public Technical Preview / Alpha**;
- leads with decision-first, evidence-bounded positioning;
- distinguishes registry availability from a recommendation;
- documents occurrence-aware explicit targets;
- retains deterministic Upgrade Decision and coverage-aware impact semantics;
- treats Migration Checklist as experimental, opt-in, and human-reviewed;
- states that DepVerdict does not modify source or execute verification commands;
- explains provider/model identity qualification and offline limitations;
- links a current DepVerdict architecture overview and the identity migration guide.

Differentiation is capability-based and does not name or attack another project.

## 5. Community files migration

`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `SUPPORT.md`, both Issue
Forms, issue configuration, and the pull-request template use DepVerdict current
terminology. Development examples use `npm ci` and
`node ./bin/depverdict.js --help`.

Trust invariants, privacy acknowledgement, fork-safe contribution flow,
real-provider optionality, no-source-modification, and no-command-execution
boundaries remain intact. YAML parsing passed for the workflow and all issue-form
files.

## 6. Security, conduct, and support route status

- Security: at the DIFF-03 checkpoint, the private route used the former
  repository name. The current canonical route is
  `https://github.com/thomasMinh1995/DepVerdict/security/advisories/new` and is
  present in `SECURITY.md` and the Issue Forms.
- Conduct: `upgradelens.conduct@gmail.com` remains the verified active private
  DepVerdict conduct channel for the `0.6.x` preview transition. No replacement
  address was invented or described as live.
- Support: best-effort preview scope and separate security, conduct, provider
  billing, and private-repository routes remain explicit.

The legacy-named conduct address is a bounded Medium transition gap, not a broken
route. A replacement may be documented only after the maintainer creates and tests
it.

An unauthenticated live check returned HTTP 200 for the current repository. The
private advisory route returned HTTP 200 after the expected GitHub login redirect,
with the advisory URL preserved as the post-login return target.

## 7. Package, installation, and CLI documentation

Canonical documentation uses:

```text
@thomasminh1995/depverdict@0.6.0-alpha.1
depverdict
.depverdict/
DEPVERDICT_*
```

The planned install command is:

```sh
npm install -g @thomasminh1995/depverdict@preview
```

README, migration guide, and release draft all state that npm distribution has not
yet passed its gate and do not promise that the command currently succeeds.
Source-use examples invoke `node ./bin/depverdict.js` or the linked `depverdict`
executable. No current document instructs users to install the unpublished old npm
identity.

## 8. Legacy migration guide

`docs/migrations/upgradelens-to-depverdict.md` covers the npm identity, CLI alias,
artifact root, environment prefix, and GitHub repository transition. It also
documents:

- no automatic artifact-directory move;
- no artifact-chain merge across roots;
- explicit paths remain authoritative;
- manual secret-key rename without printing values;
- historical schema/artifact validity;
- a preview-bounded, separately approved removal process.

## 9. Release draft status

`docs/releases/v0.6.0-alpha.1-depverdict-preview.md` is the current release draft.
It includes product rationale, planned scoped install, canonical CLI, compatibility
map, capabilities, supported scope, known limitations, human-review boundary, and
routes that work today. It does not claim npm `latest`, current publication,
production stability, or autonomous migration. Its mutable repository status now
records the completed rename.

## 10. Checkpoint versus current repository links

At the DIFF-03 checkpoint, operational links used
`thomasMinh1995/UpgradeLens`. The current canonical repository is
`thomasMinh1995/DepVerdict`; package `repository`, `homepage`, and `bugs`
metadata and all current operational links are updated directly to that route by
DIFF-04-FIX. The former route is retained only for migration/history.

No README npm badge was added before publication. No future-repository workflow
badge or dead security URL was published.

## 11. Historical records preserved

`docs/releases/v0.5.0-technical-preview.md` remains byte-identical with SHA-256:

```text
4a7a4b21f7867530a2dfd02b931dd85fd91a10bfb01ecc949640949ae5a2bd2a
```

Historical reports, validation commands/results, tags, version claims, RR02
captures, schema/task/reason identifiers, and external comparison evidence were not
globally replaced. A regression test locks the `v0.5.0` release bytes.

## 12. Remaining old-name references and classifications

Remaining current-file references are allowed:

| Reference owner | Classification | Reason |
| --- | --- | --- |
| README, migration guide, current architecture, release draft | `CURRENT_COMPATIBILITY_DOCUMENTATION` | Bounded CLI/artifact/env transition |
| DIFF-03 checkpoint text about the former repository | `HISTORICAL_RECORD` | Truth at the recorded pre-rename milestone; superseded for current operations |
| Migration guide | `CURRENT_COMPATIBILITY_DOCUMENTATION` | Former repository URL explains redirect continuity only |
| CODE_OF_CONDUCT | `CURRENT_NORMATIVE` verified-contact exception | Active private conduct address |
| `.gitignore`, CI environment | `RUNTIME_IDENTITY_ALREADY_MIGRATED` | Both generated roots ignored and both env prefixes scrubbed |
| schemas, runtime, tests, fixtures | `TEST_FIXTURE_ASSERTION` / protocol compatibility | Persisted and legacy contracts remain stable |
| MVP/IA/MP/RR/OSS/releases/reviews/captures | `HISTORICAL_RECORD` / `VERSIONED_ARCHITECTURE_RECORD` | Truth at the recorded milestone |

The new current architecture overview tells readers that old versioned records are
not current command documentation.

## 13. Package and tarball impact

The final tarball contains 248 files. Relative to the DIFF-02 243-file boundary,
five intentional DIFF-03 documents enter through the existing `docs` allowlist:

1. current architecture overview;
2. DIFF-03 architecture decision;
3. UpgradeLens-to-DepVerdict migration guide;
4. `v0.6.0-alpha.1` release draft;
5. DIFF-03 review report.

The package guard now requires these documents and reports 30 required assets.
Community `.github/` files, tests, scripts, `.env.example`, and the repository-only
sample remain excluded. The updated `eval/README.md`, README, and current operational
docs remain package-visible under the existing policy.

No `.depverdict/` or `.upgradelens/` runtime output, RR02 capture, credential,
environment file, qualification record, tarball, duplicate/copy artifact, or
suspicious protected filename entered the package. Historical documentation
inclusion was not silently narrowed or expanded beyond the five listed additions.

## 14. Focused and canonical validation

Focused validation:

```text
38 pass, 0 fail
```

It covers DIFF-02 compatibility, repository/docs identity, current CI/metadata, and
package guard behavior. Issue Forms and workflow YAML also parsed successfully.

Canonical validation:

```text
648 tests
647 pass
0 fail
1 known sandbox-loopback skip
```

The skip is the existing local-loopback listener limitation; it is not related to
DIFF-03.

## 15. Clean-install, CLI, and import results

- repeated `npm pack --dry-run --json --ignore-scripts`: identical 248-file
  manifests and sizes;
- package guard: 248 files, zero suspicious artifacts, 30 required assets;
- actual tar extraction: exact entry match;
- isolated lifecycle-disabled tarball install: passed;
- installed `depverdict --version` and `--help`: passed with clean stderr;
- installed `upgradelens --version`: passed with the bounded deprecation warning;
- ESM import: 438 public exports;
- `npm publish --dry-run --tag preview`: passed; no publish occurred;
- `git diff --check`: passed.

## 16. Provider calls

```text
Real provider calls: 0
```

All tests use deterministic fixtures, fakes, or injected local boundaries. No
provider credential or raw provider data was read or written.

## 17. Blocked or skipped checks

Hosted GitHub Actions cannot validate an uncommitted, unpushed DIFF-03 tree.
Commit, push, repository rename, GitHub mutation, npm publication, tag, and release
creation are explicitly outside this task.

An initial sandboxed clean-install attempt did not complete under restricted network
access and was interrupted; the same repository-owned smoke passed when rerun with
network access and isolated temporary npm caches. An initial prerelease publish dry-run correctly required
`--tag preview`; the corrected dry-run passed.

## 18. Defects and limitations

Blocker defects: none.

High defects: none.

Original medium transition gaps:

1. Repository rename: closed externally before DIFF-04-FIX.
2. The verified conduct address remains legacy-named for one preview transition.
3. DIFF-03 hosted CI gap: closed at its later hosted checkpoint; a new hosted run
   is still required for the post-remediation SHA.

These gaps are live-safe, documented, and assigned explicit follow-up checks.

## 19. Exact files changed or created

Modified:

```text
.env.example
.github/ISSUE_TEMPLATE/bug_report.yml
.github/ISSUE_TEMPLATE/config.yml
.github/ISSUE_TEMPLATE/feature_request.yml
.github/pull_request_template.md
.github/workflows/ci.yml
.gitignore
CODE_OF_CONDUCT.md
CONTRIBUTING.md
README.md
SECURITY.md
SUPPORT.md
docs/cli-progress.md
docs/migration-planning-qualification-resolution.md
docs/package-content-policy.md
eval/README.md
examples/technical-preview-node/README.md
examples/technical-preview-node/package-lock.json
examples/technical-preview-node/package.json
scripts/package-content-guard.mjs
test/ci-workflow-metadata.test.js
test/package-content-guard.test.js
```

Created:

```text
docs/architecture-overview.md
docs/decisions/diff-03-repository-docs-community-migration.md
docs/migrations/upgradelens-to-depverdict.md
docs/releases/v0.6.0-alpha.1-depverdict-preview.md
docs/reviews/diff-03-repository-docs-community-migration.md
test/repository-docs-identity.test.js
```

Total DIFF-03 files: 28.

## 20. Pre-existing changes preserved

Pre-existing untracked DIFF-01 decision material, source-comparison evidence, and
RR02 capture trees were not edited, deleted, staged, or overwritten. The two
pre-existing Markdown records were already visible to the broad `docs` npm
allowlist at baseline; DIFF-03 does not count them as package additions. RR02
capture trees remain excluded by the direct-child capture rule.

## 21. Post-rename file and field checklist

Current status:

1. Canonical repository, origin, redirect, GitHub resources, Actions history,
   branches, and Private Vulnerability Reporting: externally verified by DIFF-04.
2. Package metadata, clone instructions, advisory routes, mutable status documents,
   and identity tests: remediated by DIFF-04-FIX.
3. Historical Release titles/bodies: remediated by the explicitly approved
   DIFF-04-FIX live metadata edit; IDs, tags, targets, states, and assets were
   verified unchanged.
4. Canonical tests, package qualification, repeated pack, clean-install smoke, npm
   dry-run, and exact-SHA hosted CI: required at the DIFF-04-FIX checkpoint.

The conduct email does not change during repository rename. A later contact
migration requires a separately created and verified address.

## 22. Final verdict and next gate

```text
Verdict: DEPVERDICT_DOCS_READY_WITH_CONTACT_OR_RENAME_GAPS
Gate: PROCEED_TO_HOSTED_CI_CHECKPOINT
```

The repository, documentation, package-facing material, and community policies are
ready for a hosted CI checkpoint under the current live repository identity. Do
not proceed directly to public preview distribution until hosted CI passes and the
manual repository/distribution migration gate is separately executed and verified.
