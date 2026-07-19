# DIFF-03 — Repository, Documentation, and Community Identity Migration

- Status: Accepted for implementation
- Date: 2026-07-19
- Scope: `0.6.0-alpha.1`
- Product identity: DepVerdict
- Repository at the DIFF-03 implementation checkpoint: `thomasMinh1995/UpgradeLens`
- Current canonical repository: `thomasMinh1995/DepVerdict`
- Post-rename status updated: 2026-07-19

## Context and two-phase boundary

DIFF-02 established the DepVerdict package, executable, artifact-root, and
environment identities. DIFF-03 originally made the repository experience use
that identity before the separate GitHub rename. The rename has since completed:
`https://github.com/thomasMinh1995/DepVerdict` is canonical. The former URL is
retained only as historical truth, migration explanation, and a redirect
compatibility aid. npm publication, runtime compatibility, and historical evidence
remain separate boundaries.

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

After the completed manual rename:

- relative links remain preferred for repository files;
- clone, issue, metadata, badge, and security URLs use the canonical
  `thomasMinh1995/DepVerdict` route;
- the former `thomasMinh1995/UpgradeLens` route may appear only in historical or
  migration context.

GitHub redirects are a continuity aid, not the permanent documentation strategy.

## 4. Security advisory URL rule

Vulnerability reports use:

`https://github.com/thomasMinh1995/DepVerdict/security/advisories/new`

This canonical private route remains in `SECURITY.md` and the issue-form
configuration. No vulnerability report is routed through a public issue.

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
Source setup uses the canonical DepVerdict clone URL and
`node ./bin/depverdict.js`.

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

Workflow display text uses DepVerdict. Any README workflow badge uses the
canonical repository URL. No npm badge is shown until a preview package has
actually been published. Hosted CI must be rerun at the exact post-remediation
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

Post-rename status:

1. GitHub repository rename, canonical origin, former-URL redirect, pull requests,
   issues, Releases, Actions history, branch settings, and Private Vulnerability
   Reporting were externally verified by DIFF-04.
2. `package.json`, clone examples, advisory routes, current release/migration
   status, and identity tests are remediated by DIFF-04-FIX.
3. Historical GitHub Release presentation was remediated by the explicitly
   approved DIFF-04-FIX live metadata edit.
4. Identity checks, link checks, package guard, clean-install smoke, and hosted CI
   must run on the exact post-remediation commit/configuration.

The verified conduct address remains unchanged until a separately created
DepVerdict address has been tested. Removal of the UpgradeLens compatibility
identity requires the end of the documented preview window, usage review, a
separate compatibility decision, release notes, passing canonical-only tests, and
no remaining supported consumer dependency on the legacy interfaces.
