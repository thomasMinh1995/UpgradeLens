# RR02-RERUN — CLI Qualification, Progress UX and Package Validation

## 1. Executive Verdict

Final verdict: **`NO_GO_PACKAGE_OR_REGRESSION`**.

The resumed rerun stopped before RERUN-001. Committed HEAD contains the
package-content guard, but not the capture exclusion or two documentation
assets that the guard itself declares required. `npm run check:package`
therefore fails on a clean worktree. The validation-only stop rule prohibits
repairing that input inside this rerun.

## 2. Why the Rerun Was Required

RR-02 originally ended `NO_GO_UX_OR_WORKFLOW` because qualification status
could drift and long pipeline stages could appear stalled. RR02-FIX-01 and
RR02-FIX-02 implemented those remediations. The first RR02-RERUN then found
capture evidence in the npm package, and RR02-FIX-03 attempted to add an
actual-tarball package guard.

This resumed run was meant to execute the complete packaged CLI matrix after
RR02-FIX-03. Instead, it found that the committed remediation input is
incomplete.

## 3. Environment and Packaged CLI Identity

- Repository: UpgradeLens
- Branch: `feat/mvp-05-evidence-migration-checklist`
- HEAD: `e0c05b62536b76315c9d19dbe38a48f98b19b3c8`
- HEAD subject: `fix: package content guard`
- Package: `upgradelens@0.4.0`
- Initial worktree: clean
- Platform date: 2026-07-17, Asia/Ho_Chi_Minh

Fresh preflight tarball:

- files: 197;
- compressed size: 471,310 bytes;
- unpacked size: 1,881,500 bytes;
- npm SHA-1: `76eadf38bf7c50ebd9c4a90397789fb7075f1336`;
- SHA-256:
  `04e737d90630674f7a6633b196c1d6a00a33ebd7876a25410301902a0590db70`.

The tarball was produced with a fresh isolated npm cache and inspected by
actual tar entries.

## 4. Qualification Identity and Integrity Check

Qualification was not re-evaluated in this resumed attempt because the earlier
remediation-report/package gate failed first. No qualification record was
loaded, rewritten, injected, or requalified, and no provider was called.

The current failure is not classified as identity drift. It is a deterministic
package/remediation-input failure that must be fixed before qualification and
packaged surface validation can proceed.

## 5. Targeted Scenario Matrix

| Scenario | Packaged CLI | Qualification state | Progress mode | Stage/activity/elapsed | Exit code | Provider calls | Result | Capture |
| --- | --- | --- | --- | --- | --- | ---: | --- | --- |
| RERUN-001 install/help | Not invoked | N/A | N/A | Not observed | N/A | 0 | Blocked by preflight | [manifest](rr02-rerun-cli-captures/manifest.json) |
| RERUN-002 default TTY | Not invoked | Not resolved | auto | Not observed | N/A | 0 | Not run | manifest |
| RERUN-003 non-TTY auto | Not invoked | Not resolved | auto | Not observed | N/A | 0 | Not run | manifest |
| RERUN-004 plain in TTY | Not invoked | Not resolved | plain | Not observed | N/A | 0 | Not run | manifest |
| RERUN-005 heartbeat | Not invoked | N/A | interactive | Not observed | N/A | 0 | Not run | manifest |
| RERUN-006 persisted qualification | Not invoked | Not evaluated | interactive | Not observed | N/A | 0 | Not run | manifest |
| RERUN-007 relative override | Not invoked | Not evaluated | plain | Not observed | N/A | 0 | Not run | manifest |
| RERUN-008 missing qualification | Not invoked | Not evaluated | plain | Not observed | N/A | 0 | Not run | manifest |
| RERUN-009 identity mismatch | Not invoked | Not evaluated | plain | Not observed | N/A | 0 | Not run | manifest |
| RERUN-010 corrupted record | Not invoked | Not evaluated | plain | Not observed | N/A | 0 | Not run | manifest |
| RERUN-011 `NOT_QUALIFIED` | Not invoked | Not evaluated | plain | Not observed | N/A | 0 | Not run | manifest |
| RERUN-012 cancellation | Not invoked | N/A | interactive | Not observed | N/A | 0 | Not run | manifest |
| RERUN-013 fatal failure | Not invoked | N/A | plain | Not observed | N/A | 0 | Not run | manifest |
| RERUN-014 CI-like | Not invoked | N/A | auto | Not observed | N/A | 0 | Not run | manifest |
| RERUN-015 package contents | Tarball inspected | N/A | N/A | N/A | N/A | 0 | **Failed** | This report |

## 6. Qualification Consistency Results

No packaged qualification surface was invoked, so this rerun makes no new
guard/progress/console/Markdown consistency claim. The stopped matrix does not
override earlier focused remediation results.

## 7. Progress and Heartbeat UX Results

No packaged TTY, plain, non-TTY, CI, or long-running public CLI scenario was
run after the failed preflight. This rerun does not copy the RR02-FIX-02
self-score as new packaged evidence.

## 8. Cancellation and Failure Results

Packaged cancellation and fatal-stage scenarios were not invoked. The
preflight failure itself was constrained and reproducible:

```text
npm package content guard failed.
Missing required package assets (2):
  - package/docs/migration-planning-qualification-resolution.md
  - package/docs/package-content-policy.md
```

## 9. CLI Capture Inventory

- Planned packaged CLI invocations: at least 15.
- Actual packaged CLI invocations: 0.
- Manifest entries: 0.
- Screenshots expected for executed invocations: 0.
- Screenshots created: 0.
- Missing final screens among manifest entries: 0.
- Raw transcripts: 0.
- Clean transcripts: 0.
- Sanitization failures: 0.
- Real-provider requests: 0.

The empty [manifest](rr02-rerun-cli-captures/manifest.json) records the
validation-only stop. It does not fabricate CLI evidence.

## 10. UX Scorecard

No packaged UX score is assigned because none of the required product
scenarios ran.

| Criterion | Rerun score |
| --- | ---: |
| Current activity | Not scored |
| Meaningful detail | Not scored |
| Elapsed time | Not scored |
| Completed history | Not scored |
| Warnings in context | Not scored |
| Final summary | Not scored |
| Visual stability | Not scored |
| TTY awareness | Not scored |
| Honest progress | Not scored |
| Failure recovery | Not scored |

The release decision is nevertheless conclusive because a clean package guard
fails before product validation.

## 11. Package Contents and Clean Install

Committed `package.json.files` includes the complete `docs` directory and has
no `!docs/*-cli-captures` entry. The current worktree happened to contain no
capture trees before this report was created, so the initial tarball had zero
capture entries; that absence is accidental rather than an effective
exclusion contract.

Actual tar inspection found:

| Assertion | Result |
| --- | --- |
| CLI progress documentation | Present |
| Persisted qualification schema | Present |
| Extractive v2 candidate schema | Present |
| Migration Planning v2 dataset | Present |
| Qualification-resolution documentation | **Missing** |
| Package-content policy documentation | **Missing** |
| Effective future capture exclusion | **Missing** |

The remediation reports required by preflight are also absent from the current
repository. After the allowed stopped-run manifest was created, the guard
failed with both the same two missing assets and:

```text
Forbidden capture evidence (1):
  - package/docs/rr02-rerun-cli-captures/manifest.json
```

This directly proves the capture exclusion is not effective in committed HEAD.
A clean install and CLI smoke were not run after the guard failed.

## 12. Regression and Privacy Validation

Only validation necessary to establish the stopping condition was run:

- clean worktree inventory: pass;
- commit/remediation inventory: incomplete;
- fresh `npm pack --json`: completed;
- actual tar entry inspection: completed;
- pre-evidence `npm run check:package`: failed with two missing required
  assets;
- post-evidence `npm run check:package`: failed with one forbidden capture
  entry and the same two missing assets;
- product CLI invocations: 0;
- real-provider requests: 0.

Focused and full tests were not run after the earlier gate failed. The new
manifest contains no transcripts, screenshots, endpoints, credentials, raw
payloads, or private paths.

## 13. Defects and Remaining Limitations

### High — incomplete committed package remediation

The RR02-FIX-03 commit contains the guard and npm script wiring but omits:

1. the effective `docs/*-cli-captures` package exclusion;
2. `docs/migration-planning-qualification-resolution.md`;
3. `docs/package-content-policy.md`;
4. remediation reports/evidence needed by the rerun preflight.

The guard correctly detects two missing assets. Because the exclusion is also
absent, any newly created direct `docs/*-cli-captures` evidence becomes
pack-eligible.

Smallest remediation task:

**RR02-FIX-03A — Complete Package Exclusion and Validation Evidence Commit**

- add the negated capture convention to `package.json.files`;
- restore the two guard-required user docs;
- persist the FIX-01/FIX-02/FIX-03 remediation reports needed by preflight;
- retain capture evidence in the repository while excluding it from npm;
- run the existing actual-tarball guard, clean install, and package smoke;
- then resume RR02-RERUN from RERUN-001.

No remediation was implemented in this validation task.

## 14. Release Decision

1. **v0.5.0 readiness:** `NO_GO_PACKAGE_OR_REGRESSION`.
2. **Migration Checklist default enablement:** `KEEP_EXPERIMENTAL`.

This is not a qualification or progress regression finding. Release is
blocked because the committed packaging remediation cannot pass its own
authoritative guard.

## 15. Scope Confirmation

This rerun did not modify production source, tests, fixtures, qualification
records or digests, package configuration, progress implementation, schemas,
datasets, policy, thresholds, Extractive Contract semantics, or VinGrade
source.

It did not run a provider, requalify, enable Migration Checklist by default,
commit, push, tag, publish, or release. Only this stopped-run report and
capture manifest were created.
