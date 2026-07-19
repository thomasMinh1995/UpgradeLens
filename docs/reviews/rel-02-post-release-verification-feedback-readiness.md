# REL-02 Post-release Verification and Feedback Readiness

Review date: 2026-07-19

Release: DepVerdict `0.6.0-alpha.1`

Review mode: independent, read-only public verification plus isolated consumers

## 1. Executive verdict and gate

```text
Verdict: POST_RELEASE_DOCS_CI_REQUIRED
Gate: COMMIT_DOCS_AND_REFRESH_HOSTED_CI
```

The immutable public package, annotated tag, GitHub Prerelease, clean
installations, canonical CLI, legacy alias, ESM entry point, exports, schemas,
decision policy, and fail-closed boundaries passed. No Blocker or High defect
was found.

Controlled public feedback is technically supportable after these three
package-visible documents are committed and hosted CI passes. Before broad
promotion, complete focused follow-ups for stale publication wording in the live
README/release notes, missing explicit context fields in the bug form, and the
absence of the retained real-provider qualification record from the npm package.

This review did not mutate npm, Git tags, GitHub Releases, source, schemas, or
runtime policy, and did not publish the announcement.

## 2. Public Git, tag, and release identity

| Check | Observed result |
| --- | --- |
| Canonical repository | `https://github.com/thomasMinh1995/DepVerdict`, public and HTTP 200 |
| Legacy repository URL | Redirects once to the canonical DepVerdict repository |
| Remote `main` | `0e8f69a88fa6c1c016bf7dc796f427d670adc8fd` |
| Tag | Exactly one `v0.6.0-alpha.1` |
| Annotated tag object | `a962deae339ee2a569b7156ae957b4949e4cc591` |
| Peeled tag target | `0e8f69a88fa6c1c016bf7dc796f427d670adc8fd` |
| GitHub Release | ID `356383051`, tag `v0.6.0-alpha.1` |
| Release state | `draft=false`, `prerelease=true` |
| Release title | `DepVerdict v0.6.0-alpha.1 — Technical Preview / Alpha` |
| Release assets | None; no asset drift observed |
| Private Vulnerability Reporting | Enabled and the authenticated private route responds |

The release notes contain the exact `@preview` install command and disclose that
the first version is also exposed through npm `latest`. They consistently
describe DepVerdict as an Alpha/Technical Preview and preserve the human-review
boundary. They also retain pre-publication phrases such as “Release draft,”
“planned installation,” and “does not claim that the preview package is
currently available.” That is a Medium documentation defect, not release
identity drift.

The five earlier releases remain historical UpgradeLens releases with bounded
rename notices. Their IDs, tags, state, timestamps, and lack of assets showed no
drift during this review.

The local checkout was intentionally recorded separately:

```text
Branch: feat/depverdict-rebrand
Local HEAD: 5f2b83b255759ce23cb2c30fb315a1402f658fb5
Released main/tag target: 0e8f69a88fa6c1c016bf7dc796f427d670adc8fd
```

The pre-existing untracked RR02 capture trees were preserved and excluded from
all REL-02 work.

## 3. npm metadata, dist-tags, and artifact hashes

| Field | Public registry result |
| --- | --- |
| Package/version | `@thomasminh1995/depverdict@0.6.0-alpha.1` |
| Visibility | Public |
| Versions present | Exactly `0.6.0-alpha.1` |
| `preview` | `0.6.0-alpha.1` |
| `latest` | `0.6.0-alpha.1`, accepted first-publish registry limitation |
| Published | `2026-07-19T15:38:58.569Z` |
| Maintainer identity | `thomasminh1995` |
| License / engines | MIT / Node.js `>=20` |
| Package files | 252 |
| Unpacked size | 2,595,276 bytes |
| npm shasum | `2c85925416cc3617735ee9377971aabc39b39827` |
| Tarball SHA-256 | `2715ba8f8edc4fbbd0ee446b1215baf94b8943d6cc9cc05c7c775a409870d9de` |
| npm integrity | `sha512-ajqJHVjCWIAZIx2Da6RelchulkILsztPXt3522q0dIwjM9tAsHtlYfyBzDS8i6sKXXCO3D073h7P6DBbOE2Gwg==` |

Repository, homepage, and bugs metadata point to the canonical DepVerdict
repository. The public tarball downloaded through normal npm tooling matched
the qualified tarball byte-for-byte and matched all three published digests.
No unexpected later version exists.

An isolated unqualified install resolved `0.6.0-alpha.1`, documenting the
accepted `latest` behavior. It is not the recommended installation path and is
not evidence of production stability.

## 4. Supported Node clean-install matrix

Each row used a clean temporary consumer, an isolated npm cache, and the public
registry package selected by `@preview`.

| Node | Install | Canonical CLI | Legacy CLI | ESM / schemas |
| --- | --- | --- | --- | --- |
| `20.20.2` | Pass | Pass | Pass | Pass |
| `22.23.1` | Pass | Pass | Pass | Pass |
| `24.18.0` | Pass | Pass | Pass | Pass |

Node `26.0.0` was available on the host but was not used as release
qualification evidence because it is outside the requested supported matrix.

Both installed bin files retained executable permissions. Package lifecycle
metadata has no install or postinstall script, and installation performed no
package-defined unexpected network or filesystem action.

## 5. CLI, import, exports, and schemas

For every supported Node row:

- `depverdict --version` printed exactly `0.6.0-alpha.1`;
- `depverdict --help` was readable and decision-first;
- `upgradelens --version` and `upgradelens --help` worked;
- the legacy warning was bounded to stderr while stdout stayed machine-safe;
- root ESM import succeeded;
- the public API contained exactly 438 exports;
- all 22 of 22 shipped schemas loaded and compiled strictly;
- installed metadata used canonical DepVerdict identities.

## 6. Zero-secret onboarding result

A generic disposable npm fixture was analyzed from the installed Node 24
consumer with no provider environment or secret:

```sh
depverdict analyze . --offline
depverdict analyze . --offline --fail-on-incomplete
```

Both commands used `.depverdict/` as the output root. The default run truthfully
reported `INSUFFICIENT_DATA` with exit 0; strict mode reported the same result
with exit 2. Neither produced a recommendation, invoked a provider, or modified
the fixture's source or manifest. `--stdout` produced valid JSON on stdout with
progress isolated to stderr.

The human-readable repository impact artifact was stable across repeated runs.
Timestamp-bearing JSON metadata changed between runs; this review does not treat
timestamp equality as a promised byte-determinism contract. Completion,
decisions, artifacts, and diagnostics appeared in a useful first-run order.

The live README is not currently an accurate first-run guide: it says the npm
preview has not passed its distribution gate and instructs users to use source
checkout “until then.” The valid `@preview` command is visible but described as
planned. This is a safe-workaround Medium defect.

## 7. Product-value smoke scenarios

All scenarios used the installed public package with deterministic fixtures or
fakes. Provider calls remained zero.

| Scenario | Expected boundary | Result |
| --- | --- | --- |
| Installed equals target | `KEEP_CURRENT` | Pass |
| Registry candidate only | `INVESTIGATE`, never automatic upgrade | Pass |
| Explicit target plus grounded evidence | `PLAN_UPGRADE` | Pass |
| Incomplete provider/output | `PARTIAL`, exit 2 | Pass |
| Insufficient data | Default 0, strict 2 | Pass |
| Unsupported coverage | No false-negative or safety conclusion | Pass |
| Duplicate occurrence | Exactly one selected occurrence | Pass |
| Stale/conflicting selector | Fails before provider construction | Pass |
| Evidence-bounded handoff | Human review required | Pass |
| Missing grounded instruction | No invented path, action, or command | Pass |

The observed presentation order remained decision-first: completion, decisions,
review boundary, limitations/failures, artifact paths, then legacy diagnostics.

## 8. Provider qualification boundary

No real provider was called.

The npm package does not contain a retained
`.depverdict/migration-planning-qualification.json` record. Loading the default
production path returned `MIGRATION_QUALIFICATION_RECORD_MISSING`, so REL-02
could not independently reproduce the released claim that an exact real
OpenAI-compatible `openai/gpt-5.5` identity remains `QUALIFIED` from the public
artifact alone.

A packaged deterministic fake replay passed 15 of 15 critical gates with
`QUALIFIED_WITH_LIMITATIONS` and zero provider requests. It was not accepted as
the real runtime:

- configuring `openai-compatible/openai/gpt-5.5/openai-compatible` with the fake
  record returned `MIGRATION_FAKE_QUALIFICATION_FOR_REAL_RUNTIME`;
- a missing record without the explicit experimental override remained blocked;
- provider, model, adapter, prompt, policy, schema, and presentation mismatches
  remained fail-closed;
- no result generalized qualification to Claude, another OpenRouter model, a
  local model, or offline inference;
- Migration Checklist remained experimental, opt-in, and human-reviewed.

The missing public record is a Medium auditability defect. It does not become a
High runtime defect because production execution fails closed and the feature
remains explicitly experimental.

## 9. README, npm onboarding, and link review

The live GitHub README and npm-rendered README had the same content hash. They:

- lead with Public Technical Preview / Alpha status;
- require Node.js 20 or newer;
- describe the canonical package, CLI, artifact root, and temporary legacy alias;
- explain offline/data-confidence limits, target ownership, completion states,
  strict exits, coverage, and experimental human-reviewed Migration Checklist;
- warn against committing provider credentials;
- do not claim autonomous migration, guaranteed safety, or universal coverage.

Focused link checks passed for the canonical repository, prerelease, bug and
feature forms, Private Vulnerability Reporting, Contributor Covenant, Creative
Commons license, and local community/trust documents. The legacy repository URL
redirects as compatibility evidence but is not used as a canonical link. Release
note links render to canonical repository documents.

Medium onboarding findings:

1. GitHub/npm README publication wording is stale and does not prominently
   disclose the accepted `latest` limitation.
2. Live release notes combine the correct final npm limitation note with earlier
   “draft/planned/not currently available” wording.

The smallest follow-up is a documentation-only post-release onboarding patch;
do not change product behavior or release identity.

## 10. Community, security, and support readiness

GitHub Issues is enabled, Discussions is disabled, and blank issues are disabled.
The bug and feature forms, pull request template, Support policy, Security policy,
and Code of Conduct are public and usable.

Positive controls:

- the bug form requests version, install method, OS, Node/npm, sanitized
  repository shape, command, completion/exit, reproduction, and artifact fragment;
- the feature form covers decisions, baselines/selectors, coverage, handoff, CI,
  documentation, and trust implications;
- both forms discourage credentials, private source, private identifiers, and raw
  provider payloads;
- suspected vulnerabilities use GitHub Private Vulnerability Reporting;
- sensitive conduct reports use a private route;
- support explains best-effort scope and how to create a synthetic reproduction.

The bug form does not explicitly request online/offline mode, decision/handoff
status, or provider/model identity when relevant. That is a Medium feedback
triage gap with a safe workaround in free-text fields. The legacy-named conduct
mailbox is explicitly bounded to the `0.6.x` transition. No dedicated
Discussions/support channel exists.

## 11. Feedback guide assessment

The new feedback guide is short, uses the exact ten requested primary questions,
states that autonomous migration feedback is outside this release contract, and
links public bug/feature routes plus private security/conduct routes. It includes
a sanitization checklist and the exact `@preview` installation command.

It is truthful but is not public until committed to a reachable branch and
validated by hosted CI.

## 12. Announcement assessment

The announcement draft explains why “latest exists” is not an upgrade decision,
states the evidence-bounded value proposition, emphasizes deterministic
fail-closed policy and human review, and bounds ecosystem support. It includes
the exact install command, a zero-secret CLI example, focused feedback prompts,
canonical links, the Alpha disclaimer, and the accepted npm `latest` limitation.

It does not claim autonomous migration, universal coverage, guaranteed safety,
production readiness, model independence, or generalized qualification. It was
created as a reusable draft and was not published.

## 13. Bounded 48–72-hour observation checklist

Observe only public or ordinary maintainer-accessible signals:

- [ ] `preview` and accepted `latest` remain on immutable `0.6.0-alpha.1`;
- [ ] version shasum/integrity and the public tarball remain unchanged;
- [ ] tag object, peeled target, and GitHub Prerelease state remain unchanged;
- [ ] no repeatable install failure appears on Node 20, 22, or 24;
- [ ] issue-form submissions contain enough sanitized reproduction context;
- [ ] Private Vulnerability Reporting and the conduct route remain reachable;
- [ ] no new broken onboarding, support, security, or release-note link appears;
- [ ] recurring `@preview`, offline, target, or strict-exit confusion is recorded;
- [ ] false recommendation or false impact/coverage reports are triaged;
- [ ] provider/output errors are not represented as completed success;
- [ ] accidental secrets or private source in reports are removed and rerouted.

Do not collect invasive telemetry, package users' repository contents, or infer
quality from download counts or the absence of issues.

Classify observations:

| Severity | Definition | Observation-window action |
| --- | --- | --- |
| Blocker | Security, artifact integrity, destructive, or false-safe behavior | Stop promotion and prepare an urgent bounded hotfix |
| High | Unusable install/core workflow or materially misleading decision | Stop promotion and prepare an urgent bounded hotfix |
| Medium | Confusing UX/documentation with a safe workaround | Record and prioritize after observation |
| Low | Polish or non-blocking feedback | Backlog |

Only Blocker and High findings warrant urgent hotfix work during this window.

## 14. Provider calls and cost

```text
Provider calls: 0
Provider cost: USD 0
```

## 15. Tests, blocked checks, and skipped checks

Passed:

- public npm metadata, dist-tag, hash, and integrity verification;
- public tag and GitHub Prerelease identity verification;
- clean public-package consumers on Node 20, 22, and 24;
- both CLIs, executable modes, ESM import, 438 exports, and 22/22 schemas;
- zero-secret offline default/strict workflow;
- ten deterministic product-value scenarios;
- fake qualification replay and production fail-closed boundary;
- focused public and local link checks;
- Markdown fence/link, privacy, placeholder, local-path, and credential scans;
- `git diff --check`;
- package-content guard and npm package dry-run.

Blocked:

- exact retained real-provider qualification could not be loaded because its
  persisted record is absent from the published package.

Intentionally skipped:

- real provider execution, real third-party repository migration, and invasive
  telemetry;
- full canonical source suite, because runtime checks used the published package
  and this task creates documentation only;
- Node 26 release qualification;
- announcement publication and every npm/Git/GitHub mutation.

## 16. Defects and known limitations

No Blocker or High defect was found.

Medium defects:

1. README/npm onboarding still describes publication as pending and omits a
   prominent accepted-`latest` notice.
2. Live release notes retain draft/planned availability wording beside the correct
   final registry note.
3. The retained real-provider qualification record is absent from the npm package,
   limiting independent auditability while runtime still fails closed.
4. The bug form lacks explicit online/offline, decision/handoff, and
   provider/model-when-relevant fields.

Known bounded limitations:

- npm `latest` and `preview` both map to the immutable first Alpha version;
- the conduct mailbox retains the legacy UpgradeLens name during `0.6.x`;
- GitHub Discussions is disabled;
- installed-version and source analyzers cover only part of the detected
  ecosystem surface;
- verification commands are proposed but never executed;
- recovery and rollback plans are not synthesized;
- Migration Checklist is experimental, opt-in, and human-reviewed.

## 17. Exact files created or changed

Exactly these three tracked paths were created:

```text
docs/reviews/rel-02-post-release-verification-feedback-readiness.md
docs/community/technical-preview-feedback-guide.md
docs/announcements/v0.6.0-alpha.1-technical-preview.md
```

No existing tracked file was modified. No file was staged. Pre-existing RR02
captures, caches, tarballs, and temporary consumer data were excluded.

## 18. Package-content impact

The current `package.json` deliberately includes `docs`. Therefore all three
REL-02 files are package-visible under existing policy, increasing the dry-run
inventory from 252 to 255 files. The change is explained and bounded, but it
means hosted package CI is required before these documents are used publicly.

The feedback guide is useful consumer documentation. The announcement and review
report are community/release-operation records that package policy also includes;
keeping them outside future npm tarballs would require a separate package-policy
decision and is outside REL-02.

## 19. Final verdict and next task

```text
Verdict: POST_RELEASE_DOCS_CI_REQUIRED
Gate: COMMIT_DOCS_AND_REFRESH_HOSTED_CI
```

Next task: review and commit exactly these three documents, refresh hosted Node
20/22/24 and package-smoke CI on the exact commit, then make a separate decision
on the focused README/release-note/issue-form follow-ups before publishing the
announcement. Do not republish npm, move the tag, or edit the existing release as
part of the documentation commit.
