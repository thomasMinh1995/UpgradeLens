# OSS-03 — Community Scaffolding

## 1. Executive verdict

**Current verdict after OSS-03-FIX: `COMMUNITY_PRIVATE_REPORTING_READY`**

The contributor guide, security policy, Contributor Covenant, support policy,
GitHub issue forms, issue configuration, pull request template, and README community
navigation are complete and internally consistent. The project is accurately
positioned as a Public Technical Preview / Alpha with a CLI-first,
decision-first, evidence-bounded, non-autonomous contract.

The original OSS-03 review found no usable private security or conduct-reporting
channel. OSS-03-FIX closes both findings with API-verified GitHub Private
Vulnerability Reporting and a maintainer-confirmed public conduct contact.

## 2. Community positioning

All new community materials preserve this contract:

| Dimension | Position |
| --- | --- |
| Release stage | Public Technical Preview / Alpha |
| Primary interface | CLI |
| Product role | Decision-first, evidence-bounded dependency upgrade analysis |
| Execution boundary | No autonomous source migration or suggested-command execution |
| Migration Checklist | Experimental, opt-in, human-reviewed |
| Support | Best effort; no production or response SLA |

No material calls UpgradeLens production-stable, a guaranteed-safe updater, a
security scanner, an autonomous migration tool, or a replacement for developer or
Coding Agent review.

## 3. Discovery and existing gaps

| Community need | Existing coverage | Gap before OSS-03 | Owner after OSS-03 |
| --- | --- | --- | --- |
| Contributor setup/workflow | README development commands and architecture docs | No contributor guide | `CONTRIBUTING.md` |
| Vulnerability handling | Product privacy/trust docs | No security policy or private route | `SECURITY.md`; private route still required |
| Conduct | None | No policy or reporting route | `CODE_OF_CONDUCT.md`; private route still required |
| Support routing | README product scope | No channel matrix or reproduction guidance | `SUPPORT.md` |
| Bug intake | GitHub Issues enabled | No structured form/privacy acknowledgement | Bug Issue Form |
| Feature intake | GitHub Issues enabled | No workflow/trust questions | Feature Issue Form |
| Pull requests | No template | Missing validation/privacy checklist | Pull request template |
| Community navigation | No README community section | Policies undiscoverable | README links |

Discovery also confirmed Node.js `>=20`, npm with a tracked lockfile v3, the
`test`, `check`, and `check:package` scripts, no lint/format script, CLI primary
workflow, and no current repository branch-naming or Conventional Commits policy.

## 4. Files created or updated

Created:

- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `SUPPORT.md`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/pull_request_template.md`
- `docs/reviews/oss-03-community-scaffolding.md`

Updated:

- `README.md` with a four-link Community section.

No runtime, test, schema, dataset, package metadata, package allowlist, CI workflow,
or version file was changed.

## 5. Contributor workflow contract

`CONTRIBUTING.md` documents the verified source workflow:

```sh
git clone https://github.com/thomasMinh1995/UpgradeLens.git
cd UpgradeLens
npm install
npm test
npm run check:package
node ./bin/upgradelens.js --help
```

It does not invent a lint command, require a real provider, enforce an undocumented
branch/commit convention, or turn the guide into a replacement architecture manual.
It links to the authoritative architecture and package-policy documents.

The guide preserves occurrence identity, separate installed/declared/target facts,
non-recommendation registry latest, coverage-aware impact, fail-closed evidence,
deterministic artifacts, human-owned target/command/approval/recovery, and the
no-source-modification boundary.

## 6. Security reporting channel and proof it is usable

**Resolved historical finding: `PRIVATE_SECURITY_CHANNEL_REQUIRED`.**

At the original OSS-03 review, public GitHub API verification returned:

- `private-vulnerability-reporting`: HTTP 200 with `enabled: false`;
- owner profile `email: null`;
- no other public profile contact.

OSS-03-FIX rechecked the same GitHub endpoint and received HTTP 200 with
`enabled: true`. The canonical reporter route is
`https://github.com/thomasMinh1995/UpgradeLens/security/advisories/new`.
`SECURITY.md`, Issue configuration, and the bug form now direct vulnerabilities to
that private route and continue to prohibit public disclosure.

## 7. Conduct reporting channel

**Resolved historical finding: `CONDUCT_REPORTING_CHANNEL_REQUIRED`.**

`CODE_OF_CONDUCT.md` adopts Contributor Covenant 2.1, includes project-space scope,
maintainer enforcement responsibilities, four enforcement levels, privacy handling,
conflict-of-interest guidance, and upstream attribution.

The original review found no verified private conduct contact. The maintainer has
now configured and confirmed `upgradelens.conduct@gmail.com` as the public community
contact for private conduct reports. The policy states best-effort handling,
reasonable privacy, malicious-report enforcement, and routes vulnerabilities back
to `SECURITY.md`. The conduct email is intentionally public and is not a secret or a
security-reporting address.

## 8. Support routing matrix

| Request type | Route |
| --- | --- |
| Reproducible product bug | Bug Issue Form |
| Feature or product feedback | Feature Issue Form |
| Usage question | README and issue search; no dedicated Q&A channel |
| Vulnerability | Security policy; no public disclosure |
| Conduct concern | Code of Conduct; no public sensitive details |
| Provider outage/account/quota/billing | Provider support unless UpgradeLens mishandles it |
| Private repository debugging | Synthetic/public reproduction only |

GitHub Discussions is currently disabled, so no Discussions URL or unsupported
support promise was added.

## 9. Issue forms and pull request template summary

The bug form requires version/commit, installation method, OS, Node/npm versions,
sanitized repository shape, secret-free command, expected/actual behavior,
completion state and exit code, minimal reproduction, and required privacy/security
acknowledgements. It does not request a full `.upgradelens/` directory.

The feature form requires problem/workflow, target user, workaround, outcome,
ecosystem/repository shape, trust and human-review implications, scope fit,
alternatives, and privacy acknowledgement.

Blank issues are disabled. Contact links are empty because there is no verified
private security route, external support channel, or enabled Discussions instance.
No labels or assignees that may not exist are referenced.

The pull request template covers problem/root cause, changes, validation,
trust/security/privacy impact, limitations, package guard, schema/docs/tests,
determinism, fail-closed behavior, human review, and unrelated-file exclusion.

## 10. Privacy and secret safeguards

The contributor guide, support policy, security policy, bug form, feature form, and
pull request template consistently prohibit or constrain:

- API keys, tokens, authorization values, cookies, and `.env` content;
- private repository source, internal identifiers, and machine-local paths;
- full private artifacts and raw provider requests/responses;
- personal data, exploit details, and sensitive conduct reports in public issues.

Reports request minimal sanitized fragments and synthetic or public fixtures instead
of proprietary repositories. No new document contains a credential-like value,
email address, local absolute path, or raw environment/provider data.

## 11. README integration

README received a small Community section linking to:

- Contributing
- Security
- Support
- Code of Conduct

All links are repository-relative and resolve. Product positioning and feature
sections were not rewritten. The existing validation sentence was refreshed from
the pre-OSS-02 count to the verified 626-pass baseline so the newly edited README
does not retain a stale test claim.

## 12. Package and tarball impact

The current `package.json.files` boundary intentionally excludes root community
policies and `.github/`. No package allowlist change was made merely to ship
repository-governance material.

README and LICENSE remain packaged. README changed content but not identity. The
required OSS-03 report is under published `docs/`, so the explained tarball changes
from 231 to 232 entries. The single entry addition is
`docs/reviews/oss-03-community-scaffolding.md`; no issue/PR template or root policy
enters npm.

## 13. Validation results

| Check | Result |
| --- | --- |
| GitHub Issue Forms YAML parse | Pass: 3 YAML files |
| Required form fields | Pass |
| Required privacy acknowledgements | Pass |
| Pull request template structure | Pass |
| Relative Markdown links | Pass |
| External policy/owner URLs | Pass: HTTP 200 |
| Markdown code fences | Balanced |
| Placeholder scan | Zero unresolved placeholders |
| Local absolute-path scan | Zero |
| Contact/credential scan | Only the maintainer-approved conduct email; zero credential values or unexpected contacts |
| Positioning/overclaim review | Pass; negative boundary statements reviewed |
| `git diff --check` | Pass |
| Package content guard | Pass |
| Final dry-run package | 232 explained files, 0 suspicious artifacts, 20 required assets |
| Product runtime/export/version | Unchanged: 0 runtime changes, 438 exports, `0.5.0` |

## 14. Blocked or skipped checks

No test security advisory was created and no conduct email was sent, per task
boundary. GitHub API independently verified Private Vulnerability Reporting enabled;
the anonymous reporter URL correctly required GitHub sign-in. The conduct mailbox
is recorded as maintainer-confirmed usable rather than SMTP-tested by this task.

The full canonical suite was not rerun because OSS-03 changes documentation,
repository templates, and one package-visible Markdown file only; no source, test,
schema, dependency, export, script, or package-policy behavior changed. Package
content was validated through the actual npm manifest and hardened guard.

No real provider was called.

## 15. Defects and remaining limitations

| Severity | Count | Finding |
| --- | ---: | --- |
| Blocker | 0 | None |
| High readiness | 0 open | The two original contact findings are resolved by OSS-03-FIX |
| Medium | 0 | None |
| Low | 1 | No dedicated Q&A/Discussions channel; support remains issues/search only |

The optional Discussions gap is accurately documented and does not create a false
support route.

## 16. Exact files changed

Task-owned files are exactly the nine created files and README update listed in
section 4. No package metadata, runtime, schema, dataset, source test, capture,
qualification record, or CI workflow was changed.

## 17. Pre-existing changes preserved

All pre-existing OSS-01/OSS-02 reports and package-guard work, historical validation
documentation changes, RR02/RR02-FIX-05 capture and manifest evidence, nine retained
numeric-suffix captures, ignored `.DS_Store`, qualification material, and unrelated
review output were preserved.

The safety baseline was branch `fix/public-preview-readiness` at commit
`8866ae88b56dff3b822a6db977174dbfe8cd599a`. No destructive Git command, cleanup,
commit, merge, tag, push, release, publish, provider call, target-repository change,
or qualification regeneration occurred.

## 18. Final verdict and next gate

**Verdict: `COMMUNITY_PRIVATE_REPORTING_READY`**

All required community documents and templates exist, contributor setup matches the
source, YAML and links validate, privacy warnings are mandatory, product/package
contracts do not regress, and no policy overclaims support. GitHub Private
Vulnerability Reporting is enabled and the conduct contact is maintainer-confirmed.

**Gate: `PROCEED_TO_OSS_04_PUBLIC_CI_AND_PACKAGE_METADATA`**

This gate permits the next readiness task. It does not authorize a release or npm
publish.

## 19. OSS-03-FIX private reporting addendum

### 19.1 Executive verdict

`COMMUNITY_PRIVATE_REPORTING_READY`. Both original High contact gaps are closed
without routing vulnerabilities through public issues or through the conduct email.

### 19.2 Previous contact gaps

Before:

- `PRIVATE_SECURITY_CHANNEL_REQUIRED`
- `CONDUCT_REPORTING_CHANNEL_REQUIRED`

After:

- GitHub Private Vulnerability Reporting configured and API-verified enabled.
- Conduct reporting configured at `upgradelens.conduct@gmail.com` and confirmed
  usable by the maintainer.

### 19.3 Security channel configuration and verification

The reporter URL is
`https://github.com/thomasMinh1995/UpgradeLens/security/advisories/new`.
The GitHub API endpoint returned HTTP 200 with `enabled: true`. Anonymous access to
the reporter URL redirected to GitHub sign-in; no advisory was created.

Verification classification: `API_VERIFIED_PRIVATE_REPORTING`.

### 19.4 Conduct channel configuration

Private conduct reports use `upgradelens.conduct@gmail.com`. The address is a
maintainer-approved public community contact, not a secret and not a default
security-reporting address. Usability classification:
`MAINTAINER_VERIFIED_CONDUCT_REPORTING`.

### 19.5 Files updated

OSS-03-FIX updates only:

- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `CONTRIBUTING.md`
- `SUPPORT.md`
- `.github/ISSUE_TEMPLATE/config.yml`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `docs/reviews/oss-03-community-scaffolding.md`

### 19.6 Cross-document routing matrix

| Request | Route |
| --- | --- |
| Security vulnerability | GitHub Private Vulnerability Reporting |
| Conduct violation | `upgradelens.conduct@gmail.com` |
| Reproducible product bug | Public bug form with sanitized reproduction |
| Feature request | Public feature form |
| Provider billing/outage | Provider support unless UpgradeLens behavior is involved |

### 19.7 Privacy safeguards

Public forms continue to prohibit vulnerability detail, credentials, `.env`
content, private source, full private artifacts, and raw provider payloads. Neither
private route asks for passwords, OTP/2FA codes, recovery codes, authentication
cookies, or account setup details.

### 19.8 YAML, link, and placeholder validation

All three Issue Template YAML files parse; blank issues remain disabled; the single
contact link uses HTTPS and the canonical repository reporter URL; community
relative links resolve; Markdown fences balance; no unresolved contact placeholder,
local absolute path, or unexpected email remains.

Historical `PRIVATE_SECURITY_CHANNEL_REQUIRED` and
`CONDUCT_REPORTING_CHANNEL_REQUIRED` strings remain only in clearly labeled
Before/resolved review history.

### 19.9 Package impact

Root community policies and `.github/` remain outside the npm allowlist. The
package-visible OSS-03 report changes content but not path, so the tarball remains
232 explained files. Package version remains `0.5.0`.

### 19.10 Tests and checks

`git diff --check`, Issue Form YAML validation, link/contact/privacy scans,
`npm run check:package`, final `npm pack --dry-run --json`, and the focused
package-guard suite pass. The canonical suite is intentionally not rerun because no
source, schema, test, dependency, export, script, package policy, or runtime behavior
changed.

### 19.11 Remaining limitations

GitHub reporter UI was not exercised by creating an advisory, and the conduct
mailbox was not sent a test message. These are explicit non-goals, not open
Blocker/High findings. GitHub Discussions remains disabled as an optional Low
support limitation.

### 19.12 Final verdict and gate

**Verdict: `COMMUNITY_PRIVATE_REPORTING_READY`**

**Gate: `PROCEED_TO_OSS_04_PUBLIC_CI_AND_PACKAGE_METADATA`**
