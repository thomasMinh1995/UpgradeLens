# RR02-RERUN — CLI Qualification, Progress UX and Package Validation

## 1. Executive Verdict

Final verdict: **`NO_GO_QUALIFICATION_OR_PROGRESS`**.

The fresh packaged CLI passed canonical parallel regression, the separately
reported serial suite, package-content validation, clean installation, public
import, version/help, and the default TTY/non-TTY/plain workflows.

RERUN-005 nevertheless reproduced a High progress defect. Repository Usage
Discovery remained quiet for 8.4 seconds after its start activity. The next
line was completion activity; no five-second heartbeat was emitted. This
violates the production heartbeat contract and can make a long CPU-bound stage
look stalled. Validation stopped at that reproducible public-CLI evidence.

No production, test, fixture, package, qualification, or progress file was
changed to make the run pass.

## 2. Why the Rerun Was Required

RR-02 ended `NO_GO_UX_OR_WORKFLOW`. RR02-FIX-01 added persisted,
single-decision qualification resolution. RR02-FIX-02 added stage-aware
progress, monotonic elapsed time, and a heartbeat after five quiet seconds.
RR02-FIX-03A then completed package exclusion and committed validation
evidence.

This rerun started at RERUN-001 on the committed remediation snapshot and was
required to distinguish focused timer behavior from the behavior of the
clean-installed public CLI under real stage work.

## 3. Environment and Packaged CLI Identity

- Branch: `feat/mvp-05-evidence-migration-checklist`
- Commit: `a24899dee1714c8b6f7c20cd9a129e9e80a97261`
- Subject: `fix: complete package evidence exclusion`
- Initial worktree and index: clean
- Package: `upgradelens@0.4.0`
- Node captured by the clean install: `v26.0.0`
- Platform: macOS, arm64
- Real-provider requests: 0

The tarball was freshly produced for this rerun under a new isolated
validation root. No RR02-FIX-03 or RR02-FIX-03A tarball was reused.

Fresh tarball identity:

- files: 205;
- compressed size: 482,238 bytes;
- unpacked size: 1,914,450 bytes;
- npm SHA-1: `ac2dc3de07922c5057cddef0920b0515b97eb595`;
- SHA-256:
  `4fb18ddc056687f239d74630b56914f55cf95f37839249008d0c1faee59e9e7a`.

## 4. Qualification Identity and Integrity Check

The expected FIX-01 and FIX-02 reports exist and retain
`READY_FOR_RR02_FIX_02` and `READY_FOR_RR02_RERUN`.

No persisted `migration-planning-qualification.json` was discoverable in the
UpgradeLens repository, the new validation targets, the available temporary
validation roots, or repository roots under Desktop. The rerun did not
reconstruct a record from prose, copy a test qualification, use a fake
qualification for the real runtime, rewrite a digest, or requalify.

The historical RR-01 report identifies the most recent qualified tuple, but
that prose is not a persisted record and was not treated as executable
qualification input. Therefore RERUN-006 and RERUN-007 could not provide
current identity/integrity evidence. Negative qualification scenarios were not
started after the High progress stop.

This missing input would independently prevent a release GO from this
environment, but the selected verdict is based on the earlier reproduced High
progress defect rather than misclassifying absence as identity drift.

## 5. Targeted Scenario Matrix

| Scenario | Packaged CLI | Qualification state | Progress mode | Stage/activity/elapsed | Exit code | Provider calls | Result | Capture |
| --- | --- | --- | --- | --- | ---: | ---: | --- | --- |
| RERUN-001 install/version/help | Yes | N/A | N/A | N/A | 0 / 0 | 0 | Pass | [version](rr02-rerun-cli-captures/001-rerun-001-packaged-version/final-screen.png), [help](rr02-rerun-cli-captures/002-rerun-001-packaged-help/final-screen.png) |
| RERUN-002 default TTY auto | Yes | Not resolved, as required | Interactive | Stage/activity/final visible | 0 | 0 | Pass | [capture](rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/final-screen.png) |
| RERUN-003 non-TTY auto | Yes | Not resolved, as required | Plain | Stable lifecycle and final | 0 | 0 | Pass | [capture](rr02-rerun-cli-captures/004-rerun-003-default-nontty-auto/final-screen.png) |
| RERUN-004 plain in TTY | Yes | Not resolved, as required | Plain | Lifecycle visible; 80-column detail truncated | 0 | 0 | Pass with UX limitation | [capture](rr02-rerun-cli-captures/005-rerun-004-plain-tty/final-screen.png) |
| RERUN-005 heartbeat attempt 1 | Yes | Not resolved | Interactive | Longest stage 0.3s | 0 | 0 | Insufficient duration | [capture](rr02-rerun-cli-captures/006-rerun-005-long-heartbeat/final-screen.png) |
| RERUN-005 controlled retry | Yes | Not resolved | Interactive | Usage quiet from 0.0s to 8.4s; no heartbeat | 0 | 0 | **High failure** | [progress](rr02-rerun-cli-captures/007-rerun-005-long-heartbeat-retry/02-progress.png) |
| RERUN-006 persisted qualification | Not run | Record unavailable | N/A | N/A | N/A | 0 | Stopped after RERUN-005 | manifest |
| RERUN-007 relative override | Not run | Record unavailable | N/A | N/A | N/A | 0 | Stopped | manifest |
| RERUN-008 missing qualification | Not run | Not evaluated | N/A | N/A | N/A | 0 | Stopped | manifest |
| RERUN-009 mismatch | Not run | Not evaluated | N/A | N/A | N/A | 0 | Stopped | manifest |
| RERUN-010 corrupted | Not run | Not evaluated | N/A | N/A | N/A | 0 | Stopped | manifest |
| RERUN-011 `NOT_QUALIFIED` | Not run | Not evaluated | N/A | N/A | N/A | 0 | Stopped | manifest |
| RERUN-012 cancellation | Not run | N/A | N/A | N/A | N/A | 0 | Stopped | manifest |
| RERUN-013 fatal failure | Not run | N/A | N/A | N/A | N/A | 0 | Stopped | manifest |
| RERUN-014 CI-like | Not run | Not evaluated | N/A | N/A | N/A | 0 | Stopped | manifest |
| RERUN-015 package contents | Tar inspected | N/A | N/A | N/A | N/A | 0 | Pass | This report |

## 6. Qualification Consistency Results

Default packaged analysis correctly scheduled seven stages, did not schedule
Migration Checklist, and did not require or resolve qualification.

Focused qualification tests passed 27/27 when grouped with orchestration and
progress tests. They confirm persisted loading, one-decision consistency,
missing, mismatch, corruption, fake, and matching `NOT_QUALIFIED` behavior at
the deterministic test boundary.

The rerun does not promote those focused results into packaged persisted-record
evidence. Guard/progress/console/Markdown consistency for a real persisted
`QUALIFIED` record remains unverified because the required record was absent
and product validation stopped at RERUN-005.

## 7. Progress and Heartbeat UX Results

TTY auto selected interactive presentation. Non-TTY auto selected stable plain
events. Explicit plain remained append-only inside a PTY. All completed
default runs showed stage order, activity, elapsed fields, completed history,
and final summaries. No spinner, carriage-return rewrite, percentage, ETA,
token stream, retry claim, model-thinking claim, or safety claim appeared.

The controlled long target contained 12,000 nested package manifests and
60,000 supported source files. It used the clean-installed public CLI,
`--offline`, production progress settings, no provider, and no shortened
heartbeat interval.

Observed sequence:

```text
START Repository Usage Discovery [0.0s]
WORKING Repository Usage Discovery — Scanning supported source files [0.0s]
WORKING Repository Usage Discovery — Writing Repository Usage Index [8.4s]
DONE Repository Usage Discovery completed [8.4s]
```

There is no `WAITING` or heartbeat record between the two activity lines.
Focused timer tests pass because their manual scheduler can fire; the packaged
scenario shows that synchronous CPU-bound scanning prevents the production
timer from running. Event-loop starvation is an inference from the observed
gap and implementation architecture, not a new business-logic claim.

RERUN-004 also showed a non-blocking readability limitation: an 80-column PTY
truncated plain activity detail with an ellipsis. Lifecycle identity and
elapsed time remained readable.

## 8. Cancellation and Failure Results

RERUN-012 and RERUN-013 were not run after the High defect triggered the
validation-only stop rule. Focused cancellation, failure scheduling, callback
isolation, timer cleanup, and exit-130 tests passed inside the 27-test focused
set, but this report does not present them as packaged PTY evidence.

No partial artifact or provider request resulted from the heartbeat scenario.
The scenario itself completed successfully; its failure is the missing
required progress signal during the long quiet interval.

## 9. CLI Capture Inventory

- Direct packaged CLI invocations: 7
- Manifest entries: 7
- Screenshots expected: 13
- Screenshots created: 13
- Missing final screens: 0
- Raw transcripts: 7
- Clean transcripts: 7
- Sanitization failures: 0
- Real-provider requests: 0

Every direct CLI invocation has command, constrained environment, raw and clean
transcript, metadata, exit code, and final screen. RERUN-002 and the long
RERUN-005 retry additionally include start/progress/final screenshots.

The evidence is indexed by
[manifest.json](rr02-rerun-cli-captures/manifest.json). The npm exclusion
keeps the entire capture tree out of the tarball.

## 10. UX Scorecard

| Criterion | Score | Evidence |
| --- | ---: | --- |
| Current activity | 2 | RERUN-002 and RERUN-005 |
| Meaningful detail | 1 | Useful labels, but narrow plain detail truncates |
| Elapsed time | 0 | No live five-second heartbeat during an 8.4s quiet interval |
| Completed history | 2 | TTY and plain completed-stage trails |
| Warnings in context | 1 | No misleading warning; failure scenario not reached |
| Final summary | 2 | Default TTY and non-TTY final summaries |
| Visual stability | 2 | Append-only, no cursor rewrite |
| TTY awareness | 2 | Auto interactive versus auto plain observed |
| Honest progress | 2 | No invented percentage, ETA, count, retry, or thinking |
| Failure recovery | 0 | Packaged cancellation/fatal scenarios stopped before execution |
| **Total** | **14/20** | Below the 16/20 gate |

The score is based only on observed packaged behavior and is not copied from
the FIX-02 self-validation score.

## 11. Package Contents and Clean Install

The isolated offline installation added 12 packages and loaded the public
package successfully. Packaged version and help exited zero. Help exposes:

- `--progress auto|interactive|plain`;
- `--experimental-migration-checklist`;
- `--migration-qualification <path>`;
- the default persisted qualification path.

Actual tar inspection found:

- zero `docs/*-cli-captures` entries;
- zero PNGs or raw/clean transcripts;
- zero capture helpers;
- qualification-record schema present;
- Extractive Contract v2 candidate schema present;
- v1/v2 Migration Planning datasets present;
- progress, qualification-resolution, and package-policy docs present;
- executable and public runtime files present.

The package guard reported 205 files, zero capture evidence, and all 15
required assets.

## 12. Regression and Privacy Validation

Canonical parallel `npm run check`:

- 538 tests;
- 537 passed;
- 0 failed;
- 1 sandbox-only skip;
- package guard passed.

Separate serial `npm test -- --test-concurrency=1`:

- 538 tests;
- 537 passed;
- 0 failed;
- 1 sandbox-only skip.

The serial result is reported separately and is not used as a replacement for
the canonical result. In this rerun, both passed.

Focused results:

- qualification/progress/orchestration: 27 passed, 0 failed;
- MP-01 through MP-05, duplicate occurrence, and Extractive v2 group:
  107 passed, 0 failed.

The skipped test is the known local-loopback-listener sandbox case and is not
counted as a pass. Captures passed relative-link, invocation-count, secret,
private-path, ANSI/control, and PNG metadata checks. No raw provider payload,
credential, endpoint, source body, or hidden reasoning was retained.

## 13. Defects and Remaining Limitations

### High — heartbeat cannot fire during synchronous CPU-bound stage work

- Reproduction: RERUN-005 packaged retry.
- Expected: first quiet heartbeat at approximately five seconds.
- Actual: Usage Discovery had no output from 0.0s until 8.4s completion
  activity.
- User impact: a long repository scan can appear hung despite the heartbeat
  contract.
- Scope: progress/runtime scheduling, not package composition or business
  artifacts.

Smallest remediation:

**RR02-FIX-04 — Event-loop-safe Heartbeat for CPU-bound Discovery and Usage**

The task should make long scanning work yield or otherwise schedule heartbeat
delivery without changing business artifacts, add a real packaged regression
with production five-second semantics, and retain cancellation/timer cleanup.

### Medium — plain PTY detail truncation

At 80 columns, plain activity detail is shortened with an ellipsis. Stage ID,
state, and elapsed time remain visible. This is not the release blocker.

### Environment limitation — persisted real qualification unavailable

The current validation environment contains no executable persisted
qualification record. Qualification success and negative packaged scenarios
remain unexecuted; no synthetic replacement was used.

## 14. Release Decision

1. **v0.5.0 readiness:** `NO_GO_QUALIFICATION_OR_PROGRESS`.
2. **Migration Checklist default enablement:** `KEEP_EXPERIMENTAL`.

The canonical and serial suites both pass and package composition is correct,
but a reproduced High progress defect blocks v0.5.0. The next task is exactly
RR02-FIX-04; release execution must not start.

## 15. Scope Confirmation

This rerun did not modify production source, tests, fixtures, historical
reports, package configuration, qualification records/digests, schemas,
datasets, action criteria, comparator, policy, thresholds, Extractive
Contract semantics, or VinGrade source.

It did not call a provider, requalify, use a fake record for a real runtime,
change the heartbeat interval, add a retry, enable Migration Checklist by
default, commit, push, tag, publish, or release.

Only this validation report and
`docs/rr02-rerun-cli-captures/**` were updated as permitted evidence.
