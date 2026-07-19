# DIFF-03 — Repository, Documentation, and Community Identity Migration

- Status: Accepted for implementation
- Date: 2026-07-19
- Scope: `0.6.0-alpha.1`
- Product identity: DepVerdict
- Current live repository: `thomasMinh1995/UpgradeLens`
- Future repository identity: `thomasMinh1995/DepVerdict`

## Context and two-phase boundary

DIFF-02 established the DepVerdict package, executable, artifact-root, and
environment identities. DIFF-03 makes the current repository experience use that
identity without renaming the GitHub repository, publishing npm, changing runtime
compatibility, or rewriting historical evidence.

The repository is still live at
`https://github.com/thomasMinh1995/UpgradeLens`. Links that must work today remain
on that verified route until the maintainer performs the repository rename.
DepVerdict is the product name; UpgradeLens remains historical truth and a bounded
compatibility identity.

## 1. Normative and historical ownership

Each old-name reference is assigned one ownership class before editing:

| Class | Ownership and migration rule |
| --- | --- |
| `CURRENT_NORMATIVE` | Describes the current product or contributor workflow; migrate to DepVerdict. |
| `CURRENT_COMPATIBILITY_DOCUMENTATION` | Keep the old identity only while explaining the bounded `0.6.x` compatibility window. |
| `HISTORICAL_RECORD` | Preserve the name, command, version, path, URL, and result that were true when the record was produced. |
| `VERSIONED_ARCHITECTURE_RECORD` | Preserve when it defines a completed version or milestone; current operational documents may receive a narrowly scoped migration note or canonical example update. |
| `TEST_FIXTURE_ASSERTION` | Preserve when it protects schema, protocol, compatibility, or historical behavior. |
| `RUNTIME_IDENTITY_ALREADY_MIGRATED` | Do not change except to keep current documentation and checks aligned with DIFF-02. |
| `EXTERNAL_PROJECT_REFERENCE` | Preserve the external project's actual identity and comparison evidence. |
| `UNRELATED_TEXT` | Leave unchanged. |

Current normative owners include the root README and community policies, current
issue and pull-request templates, current operational documentation, the current
Technical Preview sample, package-facing metadata, and workflow presentation.
Milestone reports under `docs/reviews/`, RR/MP/MVP/OSS reports, capture evidence,
and `docs/releases/v0.5.0-technical-preview.md` remain historical records.

## 2. Product-name migration rule

Current prose uses **DepVerdict**. Canonical examples use:

- package `@thomasminh1995/depverdict`;
- executable `depverdict`;
- artifact root `.depverdict/`;
- environment prefix `DEPVERDICT_*`.

The old executable, artifact root, and environment prefix appear in current
material only to document compatibility or a verified transition route. The
persisted protocol identifier `generator.name: "UpgradeLens"`, schema names,
task IDs, reason codes, qualification identities, and old fixtures remain
unchanged under the DIFF-02 compatibility contract.

## 3. Live repository URL rule

Before the manual rename:

- relative links are preferred for repository files;
- clone, issue, metadata, badge, and security URLs use the current verified
  `thomasMinh1995/UpgradeLens` route;
- the future `thomasMinh1995/DepVerdict` route may be described only as a future
  target, never as an available link.

After the manual rename, the explicit fields listed in the post-rename checklist
must be changed and reverified. GitHub redirects are a continuity aid, not the
permanent documentation strategy.

## 4. Security advisory URL rule

Until the rename, vulnerability reports use:

`https://github.com/thomasMinh1995/UpgradeLens/security/advisories/new`

This verified private route remains in `SECURITY.md` and the issue-form
configuration. Immediately after rename, update both locations to the new
repository name and verify the reporter flow from a non-maintainer context or API.
No vulnerability report is routed through a public issue.

## 5. Conduct contact strategy

Decision: `KEEP_VERIFIED_LEGACY_CONTACT_FOR_ONE_PREVIEW`.

`upgradelens.conduct@gmail.com` remains the verified private conduct channel for
the DepVerdict community during the `0.6.x` preview transition. It is not described
as deprecated because no replacement exists and has been tested. A maintainer may
later create and verify a DepVerdict-named contact; documentation changes only
after that channel is proven usable. No new email is invented by this migration.

## 6. README, CLI, package, and installation contract

The README must:

- identify DepVerdict as a decision-first CLI for evidence-bounded dependency
  upgrade analysis and visibly label it Public Technical Preview / Alpha;
- distinguish target availability from a recommendation;
- show `depverdict analyze .`, `--offline`, `--fail-on-incomplete`, and exact
  supported target-selector examples;
- describe deterministic decisions, coverage-aware impact, evidence-bounded
  handoff, and mandatory human review;
- state that source is not modified and suggested verification commands are not
  executed;
- keep Migration Checklist experimental and opt-in;
- explain model/provider qualification as identity-specific and describe offline
  limitations.

The planned npm command is
`npm install -g @thomasminh1995/depverdict@preview`. It must remain explicitly
pre-publication until distribution qualification confirms the preview exists.
Source setup uses the current live clone URL and `node ./bin/depverdict.js`; the
temporary checkout directory name is identified as repository state, not product
identity.

## 7. Legacy compatibility window

The `upgradelens` executable, `.upgradelens/` read fallback, and
`UPGRADELENS_*` environment fallback remain for one bounded `0.6.x` preview
window. Canonical values win conflicts and legacy use warns without printing
values. The migration guide must state that removal requires a separate decision
and release note; the window is not an indefinite support promise.

## 8. Release and version ownership

`docs/releases/v0.5.0-technical-preview.md` remains an immutable UpgradeLens
historical release record. The current preview is owned by
`docs/releases/v0.6.0-alpha.1-depverdict-preview.md`. The new file is a release
draft, does not claim npm availability or `latest`, and does not claim autonomous
migration.

## 9. Badge and workflow-link strategy

Workflow display text uses DepVerdict. Any README workflow badge added before the
rename must use the current live repository URL. No npm badge is shown until a
preview package has actually been published. After rename, workflow and badge
links are updated explicitly and hosted CI is rerun at the exact post-rename
commit.

## 10. Package boundary

The migration guide, this decision, the current release draft, current operational
documentation, and the DIFF-03 report are intentionally package-visible under the
existing `docs` allowlist. Community `.github/` files and the repository-only
sample remain excluded. Package guard required assets will include the current
migration decision and guide without treating a total tarball file count as a
business invariant.

Generated `.depverdict/` and `.upgradelens/` trees, RR02 captures, credentials,
environment files, duplicate/copy artifacts, and private qualification data remain
forbidden package content.

## 11. Post-rename manual checklist

After DIFF-03 is merged and hosted CI passes, the maintainer must:

1. Rename GitHub repository `UpgradeLens` to `DepVerdict`.
2. Change the local `origin` fetch and push URLs.
3. Verify the old repository URL redirects.
4. Verify pull requests, issues, releases, Actions history, and branch settings.
5. Verify Private Vulnerability Reporting remains enabled.
6. Verify the new non-maintainer reporting route.
7. Update `package.json` fields `repository.url`, `homepage`, and `bugs.url`.
8. Update clone/directory examples in `README.md` and `CONTRIBUTING.md`.
9. Update the advisory URL in `SECURITY.md`,
   `.github/ISSUE_TEMPLATE/bug_report.yml`, and
   `.github/ISSUE_TEMPLATE/config.yml`.
10. Update any README badge and current CI-status URLs.
11. Update current release and migration documentation that labels the rename as
    pending; preserve historical records.
12. Re-run identity checks, link checks, package guard, clean-install smoke, and
    hosted CI on the exact post-rename commit/configuration.

The verified conduct address remains unchanged until a separately created
DepVerdict address has been tested. Removal of the UpgradeLens compatibility
identity requires the end of the documented preview window, usage review, a
separate compatibility decision, release notes, passing canonical-only tests, and
no remaining supported consumer dependency on the legacy interfaces.
