# RR02-RERUN — After FIX-04 CLI Qualification, Progress and Package Validation

## 1. Executive Verdict

Final v0.5.0 verdict: **`BLOCKED_BY_QUALIFICATION_INPUT`**.

The committed FIX-04 snapshot passed focused preflight, fresh packaging,
offline clean installation, public import/version/help, default TTY/plain/CI
workflows, the production CPU-bound heartbeat gate, cancellation, controlled
failure, normalized artifact equivalence, canonical parallel regression, and
the separately executed serial suite.

A persisted real-provider Migration Planning qualification record was not
available through either supported source. The validation did not synthesize,
copy, repair, or reconstruct one from prose. RERUN-006 and RERUN-007 therefore
could not establish the required exact identity and integrity evidence, and a
release GO is not permitted.

Migration Checklist default-enablement decision: **`KEEP_EXPERIMENTAL`**.

## 2. Committed Snapshot Precondition

- Branch: `feat/mvp-05-evidence-migration-checklist`
- HEAD: `44eb942e21ea78550700990a00bd74635ce48bcc`
- Subject: `fix: event-loop starvation`
- Expected pre-FIX-04 baseline: `a24899dee1714c8b6f7c20cd9a129e9e80a97261`
- Initial index: clean
- Initial worktree: clean
- Initial untracked files: none

Committed-tree inspection confirmed:

- `src/cooperative-scheduler.js` is present;
- Discovery and Usage import and call the scheduler at safe boundaries;
- abort checks are part of the committed scheduler integration;
- `test/cooperative-scheduling.test.js` is present;
- the package contains the scheduler module;
- `package.json` retains `!docs/*-cli-captures`.

All post-preflight product evidence used this exact committed HEAD.

## 3. Why This Rerun Was Required

The prior RR02-RERUN on `a24899d` stopped at RERUN-005 with
`NO_GO_QUALIFICATION_OR_PROGRESS`: a CPU-bound Usage stage was quiet for 8.4
seconds and did not allow the five-second heartbeat timer to run. FIX-04 added
event-loop-safe cooperative scheduling. Its remediation evidence was not
itself a release verdict, so this run restarted with a new tarball at
RERUN-001.

Historical evidence remains in capture sequences 001–007 and retains the old
no-go verdict. The current attempt is sequences 008–018.

## 4. Environment and Fresh Package Identity

- Package: `upgradelens@0.4.0`
- Platform: macOS arm64
- Node: `v26.0.0`
- Fresh isolated validation root: yes
- Fresh UpgradeLens tarball: yes; no prior UpgradeLens tarball reused
- Clean install: offline, isolated consumer, exact local dependency tarballs
- Installed packages: 12
- Public package import: passed; 408 exports observed
- Provider requests: 0

Installed/exercised tarball:

- file count: 207;
- compressed size: 491,143 bytes;
- unpacked size: 1,940,721 bytes;
- npm SHA-1: `c8277090a5d8996b3a46c1ef4284cbee3e1534d4`;
- SHA-256:
  `72ee68a2d06c8a2b9f226a006a73851ac3c595db68783abaccd889924b74cb1c`.

The first isolated-cache install correctly returned `ENOTCACHED`. A new
consumer was then installed offline with the exact local dependency tarballs;
the UpgradeLens tarball itself remained the newly packed HEAD artifact.

## 5. Qualification Input and Identity Check

No `migration-planning-qualification.json` exists in the repository default
location, under the available Desktop repositories, or under the available
temporary validation roots. No supported relative override was supplied.

Consequences:

- strict schema, record integrity, and exact real-provider identity could not
  be established for RERUN-006;
- the relative override path could not be exercised with a real persisted
  record in RERUN-007;
- identity mismatch/corruption/`NOT_QUALIFIED` product scenarios were not
  manufactured from test data;
- no provider was constructed or called.

RERUN-008 independently confirmed that an actually missing default record is
presented as `MISSING`, source `defaultPath`, qualification ID `none`, and
experimental override `YES`. It was never presented as qualified.

## 6. Preflight Results

| Gate | Result |
| --- | --- |
| Scheduler, Discovery, Usage, progress, orchestration and CLI | 45 passed, 0 failed |
| Qualification resolver/guard and Migration Checklist runtime | 75 passed, 0 failed |
| MP, duplicate occurrence, governance and Extractive Contract v2 | 75 passed, 0 failed |
| Package content guard before matrix | 207 files, 0 captures, 15/15 required assets |
| Committed snapshot | Clean and newer than `a24899d` |

No focused non-sandbox failure occurred.

## 7. Scenario Matrix

| Scenario | Packaged CLI | Qualification | Mode | Duration | Heartbeats | Exit | Provider calls | Result | Capture |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |
| RERUN-001 version | Yes | N/A | non-TTY | 1.1s | 0 | 0 | 0 | Pass | `008-...-version` |
| RERUN-001 help | Yes | N/A | non-TTY | 0.6s | 0 | 0 | 0 | Pass | `009-...-help` |
| RERUN-002 default auto | Yes | Not resolved by design | TTY interactive | 0.8s | 0 | 0 | 0 | Pass, seven stages | `010-...-default-tty-auto` |
| RERUN-003 default auto | Yes | Not resolved by design | non-TTY plain | 1.4s | 0 | 0 | 0 | Pass | `011-...-default-nontty-auto` |
| RERUN-004 explicit plain | Yes | Not resolved by design | 80-column PTY | 0.8s | 0 | 0 | 0 | Pass | `012-...-plain-tty` |
| RERUN-005 CPU heartbeat | Yes | Not resolved | TTY interactive | 22.1s total; Usage 16.0s | 3 | 0 | 0 | **Pass** | `013-...-cpu-heartbeat` |
| RERUN-006 persisted qualified | No | Record unavailable | N/A | N/A | N/A | N/A | 0 | Blocked by input | manifest |
| RERUN-007 relative override | No | Record unavailable | N/A | N/A | N/A | N/A | 0 | Blocked by input | manifest |
| RERUN-008 missing | Yes | `MISSING` | non-TTY plain | 1.0s | 0 | 0 | 0 | Pass | `014-...-missing-qualification` |
| RERUN-009 mismatch | No | No persisted fixture authorized | N/A | N/A | N/A | N/A | 0 | Not manufactured | manifest |
| RERUN-010 corrupted | No | No persisted fixture authorized | N/A | N/A | N/A | N/A | 0 | Not manufactured | manifest |
| RERUN-011 `NOT_QUALIFIED` | No | No persisted fixture authorized | N/A | N/A | N/A | N/A | 0 | Not manufactured | manifest |
| RERUN-012 cancellation | Yes | N/A | non-TTY plain | 5.8s total | 0 | 130 | 0 | Pass | `015-...-usage-cancellation` |
| RERUN-013 fatal failure | Yes | N/A | non-TTY plain | 0.6s | 0 | 1 | 0 | Pass | `016-...-fatal-stage-failure` |
| RERUN-014 CI-like | Yes | Not resolved by design | non-TTY/no color | 0.7s | 0 | 0 | 0 | Pass | `017-...-ci-like` |
| Artifact repeat | Yes | Not resolved by design | non-TTY plain | 0.8s | 0 | 0 | 0 | Pass | `018-artifact-determinism-repeat` |
| RERUN-015 final package | Tar inspection | N/A | N/A | N/A | N/A | N/A | 0 | Pass | this report |

## 8. CPU-bound Heartbeat Evidence

The clean-installed public binary ran the controlled 60,000-file workload
using the production five-second threshold:

```text
Repository Usage Discovery — Scanning supported source files [0.0s]
Repository Usage Discovery — Scanning supported source files [5.0s]
Repository Usage Discovery — Scanning supported source files [10.0s]
Repository Usage Discovery — Scanning supported source files [15.0s]
Repository Usage Discovery — Writing Repository Usage Index [16.0s]
Repository Usage Discovery completed [16.0s]
```

The three heartbeat records occur after the quiet threshold and before the
terminal record. Elapsed values are monotonic. There is no percentage, ETA,
token stream, model-thinking claim, scanner-forged heartbeat, or heartbeat
after terminal state.

## 9. Qualification Consistency Results

- Default analysis ran seven stages and did not resolve qualification.
- Default analysis did not schedule Migration Checklist.
- Missing qualification was resolved once for the experimental run and was
  consistently shown as `MISSING`.
- Console output reported source, path, ID and override state without claiming
  qualification.
- The experimental missing-record policy completed with mandatory review and
  zero eligible contexts/provider calls.
- Focused tests passed persisted `QUALIFIED`, mismatch, corruption,
  `NOT_QUALIFIED`, one-source, immutable-decision and zero-provider-call
  contracts.

Focused tests are not substituted for the missing packaged real-provider
record. That distinction is the release blocker.

## 10. Cancellation and Failure Results

RERUN-012 sent the first `SIGINT` after Usage emitted
`SCAN_SUPPORTED_SOURCE`. Usage reached `STAGE CANCELLED` at 0.1 seconds of that
stage, the run exited 130, later stages were absent, no success summary was
printed, and `.upgradelens/usage-index.json` was absent.

RERUN-013 passed a file where a repository directory was required. Project
Discovery emitted one constrained `STAGE FAILED`, the run emitted
`completed=0/7 next=REVIEW_FAILURE_DETAILS`, exited 1, and did not schedule
later stages or print a success summary. No raw stack was exposed.

## 11. Artifact Determinism

The same packaged command was repeated against the same target. Project
Manifest, Usage Index, Repository Impact and Repository Impact Evidence were
equivalent after removing only runtime timestamps and the exact-byte lineage
digests that necessarily change when those timestamps change. All dependency,
symbol, file, finding, evidence, ordering, IDs, statuses and presentation data
were identical.

The committed cooperative test independently proves exact-byte equality with
fixed clocks for yield-disabled, yield-enabled and alternate batch policies.

## 12. CLI Capture Inventory

- Historical invocations retained: 7
- Current attempt invocations: 11
- Total manifest entries: 18
- Current sequences: 008–018
- Current final screens: 11/11
- Current additional progress screens: 9
- Missing final screens: 0
- Raw transcripts: 18
- Clean transcripts: 18
- Real-provider requests: 0
- Sanitization failures: 0

The stable-sorted manifest is
`docs/rr02-rerun-cli-captures/manifest.json`. Every new UpgradeLens CLI
invocation has command, environment, raw/clean transcript, metadata, exit
code, and final screen. TTY scenarios used a real PTY; non-TTY images were
rendered from their actual transcripts.

## 13. UX Scorecard

| Criterion | Score | Evidence |
| --- | ---: | --- |
| Current activity | 2 | RERUN-002 and RERUN-005 |
| Meaningful detail | 2 | Stable stage/activity labels |
| Elapsed time | 2 | 5/10/15-second production heartbeats |
| Completed history | 2 | Interactive and plain lifecycle trails |
| Warnings in context | 1 | Missing qualification is contextual; limited warning variety |
| Final summary | 2 | Default TTY, plain and CI |
| Visual stability | 2 | Append-only; no cursor rewrite |
| TTY awareness | 2 | Auto interactive versus auto plain |
| Honest progress | 2 | No invented percentage, ETA, retry or thinking |
| Failure recovery | 2 | Cancellation and fatal failure captures |
| **Total** | **19/20** | UX release target met |

The historical Medium 80-column detail-truncation limitation remains a
non-blocking follow-up. It was not changed or used to alter this validation.

## 14. Package Contents and Clean Install

The exercised tarball contained the committed scheduler and all 15
authoritative runtime/schema/dataset/documentation assets. Inspection and the
package guard found:

- 207 files;
- zero `docs/*-cli-captures` entries;
- zero capture helper entries;
- all 15 required assets;
- executable CLI and public runtime present;
- clean offline install and public import passed.
- `npm pack --dry-run --json` passed with the isolated validation cache.

An initial dry-run without the isolated-cache argument hit the host's
root-owned default npm cache (`EPERM`). The required rerun with the isolated
validation cache passed; this was an environment permission issue, not a
package-content failure.

RERUN capture trees, FIX-04 capture trees, PNGs, transcripts and temporary
capture helpers are absent from the package.

Fresh RERUN-015 tarball created after the report/capture tree existed:

- file count: 207;
- compressed size: 491,159 bytes;
- unpacked size: 1,940,925 bytes;
- npm SHA-1: `97fca29e73ee63d806857deca9c3d38a8e5b31c0`;
- SHA-256:
  `dff64ad860a346e3d5c5db76c9102941779c50fd6e2c07df3d18dbc438f43746`.

## 15. Canonical and Serial Regression Results

Canonical parallel `npm run check`:

- 546 tests;
- 545 passed;
- 0 failed;
- 1 known sandbox-only local-loopback skip;
- package guard passed with 207 files, zero captures and 15/15 assets.

Separate serial `npm test -- --test-concurrency=1`:

- 546 tests;
- 545 passed;
- 0 failed;
- 1 known sandbox-only local-loopback skip.

The serial pass is reported separately and is not a replacement for the
canonical result. The canonical parallel run passed on its first attempt.

## 16. Defects and Remaining Limitations

### Release blocker — persisted qualification input unavailable

The exact real-provider qualification record required by RERUN-006/007 is not
available. This is an evidence-input blocker, not an inferred
`NOT_QUALIFIED` result and not identity drift.

### Non-blocking technical debt

1. Migration Checklist remains experimental and requires a separate
   default-enablement review.
2. Narrow 80-column activity detail may truncate while stage and elapsed
   identity remain readable.
3. The local-loopback lifecycle case is skipped by this sandbox and is not
   counted as a pass.
4. Runtime-generated timestamps intentionally alter exact bytes and downstream
   exact-byte lineage between separate CLI runs; fixed-clock tests retain the
   exact deterministic contract.

## 17. Release Decision

**v0.5.0 readiness: `BLOCKED_BY_QUALIFICATION_INPUT`.**

The FIX-04 heartbeat remediation is release-ready on the observed packaged
workflows. Package, progress, cancellation, failure, deterministic contract,
and regressions do not block this candidate. Release GO remains prohibited
until the existing real-provider qualification record is materialized through
the supported persisted contract and exact identity/integrity can be checked.

**Migration Checklist default enablement: `KEEP_EXPERIMENTAL`.**

Next task: materialize/persist the existing qualified record without
reconstructing it from prose, then rerun only the qualification-dependent
release gates before a v0.5.0 Release Execution Checklist.

## 18. Scope Confirmation

- No production, test, fixture, package, qualification, dataset, policy,
  prompt, schema, trust, generator, or VinGrade file was changed.
- No lifecycle timeout, heartbeat interval, yield policy, expected transcript,
  or test infrastructure was changed.
- No record was synthesized, repaired or requalified.
- No old UpgradeLens tarball was reused.
- No network or real-provider call occurred.
- No file was staged or committed.
- No push, tag, publish or release occurred.
- Only this canonical report and new canonical capture evidence changed.
- Migration Checklist remains experimental.

## FIX-05 Qualification Completion Attempt

FIX-05 located the original machine-readable RR-01-RERUN real-provider
evaluation, validated its complete v2 qualification against current identity,
and materialized the unchanged `QUALIFIED` object through the supported atomic
writer. Packaged RERUN-006 through RERUN-011 passed with zero new provider
requests. Final decision is now
`GO_V0_5_0_WITH_NON_BLOCKING_UX_FOLLOWUPS`; Migration Checklist remains
`KEEP_EXPERIMENTAL`. Full evidence is in
`RR02-FIX-05-Materialize-Persisted-Qualification.md`.
