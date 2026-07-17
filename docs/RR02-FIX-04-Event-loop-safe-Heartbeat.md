# RR02-FIX-04 — Event-loop-safe Heartbeat for CPU-bound Discovery and Usage

## 1. Root Cause

The progress runtime already scheduled an unref'd five-second heartbeat, but
Project Discovery and Repository Usage Discovery could execute long sequential
scan/parse chains without a macrotask boundary. Promise continuations and
synchronous parsing did not guarantee that the Node.js timer phase could run.

```text
stage adapter
    ↓
recursive directory traversal
    ↓
file selection
    ↓
read one file
    ↓
synchronous parse/analyze
    ↓
aggregate deterministic records
    ↓
sort / validate / atomic write
```

The stage adapter checked cancellation only before and after the complete
runtime. A due heartbeat and the first `SIGINT` could therefore remain pending
until the scan returned.

The progress timer, renderer, lifecycle version, heartbeat interval, stage
order, and business runtimes were not the root cause.

## 2. Pre-fix Starvation Evidence

RR02-RERUN recorded a packaged Repository Usage Discovery stage that remained
quiet from 0.0 seconds until its 8.4-second completion activity. No `WAITING`
or `STAGE_HEARTBEAT` occurred.

A controlled pre-fix pipeline reproduction executed 24 synchronous per-file
CPU units with a real ten-millisecond heartbeat timer and no I/O boundary. It
exited 1 with:

```text
["RUN_STARTED","STAGE_SCHEDULED","STAGE_STARTED","STAGE_ACTIVITY",
 "STAGE_COMPLETED","RUN_COMPLETED"]
PRE_FIX_STARVATION_REPRODUCED: heartbeat timer did not run before terminal event
```

This reproduction used the actual Node.js event loop. It did not use a fake
clock to make a timer callback run while work remained synchronous.

## 3. Implementation Summary

The remediation adds one internal operation-local cooperative scheduler:

- production yield: `setImmediate`;
- deterministic hybrid policy: 64 completed units or 50 milliseconds since
  the prior yield, whichever occurs first;
- injected monotonic clock and yield implementation for tests;
- abort checks before every boundary and after every actual yield;
- immutable metrics snapshot for controlled test/benchmark observation;
- no global mutable state and no dependency;
- no public package export.

Project Discovery and Repository Usage Discovery create the scheduler and pass
it through their traversal and processing loops. The CLI stage adapters now
pass their existing `AbortSignal` into both runtimes.

No scanner emits or renders heartbeat text. Heartbeats remain owned by the
existing orchestration progress runtime.

## 4. Cooperative Scheduling Contract

A scheduler boundary means one unit is completely processed. The scheduler:

1. checks the caller signal;
2. counts the completed unit;
3. returns immediately when neither policy limit is due;
4. otherwise awaits one `setImmediate`;
5. resets its local budget;
6. checks the caller signal again.

`enabled: false` retains abort checks but performs no yield. Different batch
sizes and enabled/disabled modes were used to prove exact output equivalence.

The 50-millisecond value is a boundary budget, not a preemptive deadline. A
single synchronous unit can exceed it and is allowed to finish atomically
before yielding.

The implementation does not use `setTimeout` sleeps, `process.nextTick`,
microtask-only yields, `Atomics.wait`, Worker Threads, child processes, scanner
parallelism, or direct scanner heartbeats.

## 5. Yield Boundaries and Cancellation

Safe yield/check boundaries:

- after one directory entry is fully handled;
- after one manifest group is inspected;
- after one pnpm workspace input is handled;
- after one workspace relationship unit is complete;
- after one Usage dependency scope is indexed;
- after one source file is skipped, read, parsed/analyzed, and aggregated.

No yield occurs:

- inside Babel parser state;
- between usage record construction and aggregation;
- inside a sort comparator;
- during schema/invariant validation;
- after an atomic artifact writer begins publication.

On cancellation, the boundary throws `AbortError` with
`code=ANALYSIS_CANCELLED`. The existing pipeline emits one cancelled current
stage, skips later stages, disposes its heartbeat timer, emits no success
summary, and returns 130. The stage writer is never reached, so no partial
Usage Index is published.

The packaged cancellation capture delivered `SIGINT` after the Usage start
event, emitted `STAGE CANCELLED id=usageDiscovery` at 0.1 seconds, returned
130, and left `usage-index.json` absent.

## 6. Determinism and Artifact Equivalence

The representative fixture contained 501 project manifests and 4,000
JavaScript source files. All clocks were fixed and lineage digests used the
exact serialized upstream bytes.

| Artifact | Yield disabled hash/result | Yield enabled hash/result | Equivalent |
| --- | --- | --- | --- |
| Project Manifest | `sha256:eb2aadff4190362c89c6201a98c5feafcb0197383e3d24802ab7af019945dece` | `sha256:eb2aadff4190362c89c6201a98c5feafcb0197383e3d24802ab7af019945dece` | Yes, exact JSON bytes |
| Usage Index | `sha256:200df004f8c8872b3fc8727691f9f852d562fdbe143ffa0743d32e76d94c1e4b` | `sha256:200df004f8c8872b3fc8727691f9f852d562fdbe143ffa0743d32e76d94c1e4b` | Yes, exact JSON bytes |
| Repository Impact | `sha256:6daf4e107005d6054d5fd993b81972d42cc1181c1ca636824412d5bfc3eded12` | `sha256:6daf4e107005d6054d5fd993b81972d42cc1181c1ca636824412d5bfc3eded12` | Yes, exact JSON bytes |
| Impact Evidence | `sha256:ae5ab31daa5efa5b47c5d6c958fc2e7c214e71deb5cdda2470151168001f8cb7` | `sha256:ae5ab31daa5efa5b47c5d6c958fc2e7c214e71deb5cdda2470151168001f8cb7` | Yes, exact JSON bytes |

Different batch sizes of 1, 5, and 7 also produced byte-identical Discovery
and Usage artifacts. Existing exclusion, symlink, maximum-depth, analyzer,
warning, stable ordering, ID, digest, and lineage tests pass.

No provider, network, or filesystem scan scope was added. Discovery and Usage
provider call counts remain zero.

## 7. Heartbeat Evidence

The fresh packaged CLI used the production five-second quiet threshold.

TTY auto mode:

```text
↳ Repository Usage Discovery — Scanning supported source files [0.0s]
… Repository Usage Discovery — Scanning supported source files [5.0s]
… Repository Usage Discovery — Scanning supported source files [10.0s]
… Repository Usage Discovery — Scanning supported source files [15.0s]
↳ Repository Usage Discovery — Writing Repository Usage Index [19.4s]
✓ Repository Usage Discovery completed [19.4s]
```

Plain/non-TTY mode:

```text
[5.0s] STAGE HEARTBEAT id=usageDiscovery detail="Scanning supported source files"
[10.0s] STAGE HEARTBEAT id=usageDiscovery detail="Scanning supported source files"
[15.0s] STAGE HEARTBEAT id=usageDiscovery detail="Scanning supported source files"
[17.1s] STAGE COMPLETE id=usageDiscovery label="Repository Usage Discovery"
```

No Usage heartbeat occurred after terminal state. The short 0.7-second default
run emitted no heartbeat noise and did not schedule Migration Checklist.

| Scenario | Duration | Yield count | Max quiet interval | Heartbeats | Cancellation latency | Artifact equivalent | Capture |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| Controlled Discovery, 501 manifests | 88.465 ms median | 102 | 50 ms boundary budget | N/A | N/A | Yes | Test/benchmark |
| Controlled Usage, 4,000 files | 541.933 ms median | 141 | 50 ms boundary budget | 0, below threshold | N/A | Yes | Test/benchmark |
| Packaged TTY Usage | 19.4 s | Not persisted by design | 5.0 s observed | 3 | N/A | Same validated artifact contract | [capture](rr02-fix-04-cli-captures/001-packaged-default-tty-long-heartbeat/03-heartbeat.png) |
| Packaged plain Usage | 17.1 s | Not persisted by design | 5.0 s observed | 3 | N/A | Same validated artifact contract | [capture](rr02-fix-04-cli-captures/002-packaged-plain-nontty-long-heartbeat/03-heartbeat.png) |
| Packaged Usage cancellation | 0.1 s in stage | Not persisted by design | 0.1 s | 0 | Approximately 0.1 s | No partial artifact | [capture](rr02-fix-04-cli-captures/003-packaged-usage-cancellation/final-screen.png) |
| Packaged short default | 0.7 s total | Not persisted by design | Below threshold | 0 | N/A | Yes | [capture](rr02-fix-04-cli-captures/004-packaged-default-short-no-heartbeat/final-screen.png) |

## 8. Performance Before/After

Five alternating enabled/disabled samples were measured after warm-up. Medians
avoid the filesystem-cache bias seen when disabled mode always ran first.

| Runtime | Yield disabled median | Yield enabled median | Relative overhead | Units | Yields |
| --- | ---: | ---: | ---: | ---: | ---: |
| Project Discovery | 86.700 ms | 88.465 ms | +2.04% | 6,506 | 102 |
| Repository Usage Discovery | 541.499 ms | 541.933 ms | +0.08% | 9,004 | 141 |

The policy therefore has bounded low overhead on the representative fixture.
No zero-overhead claim is made.

The supported source sample in this repository parsed 169 files in 169.498 ms.
The slowest individual synchronous parse was 14.656 ms. No real supported
single-file fixture approached the five-second threshold.

## 9. Files Changed

Production/runtime:

- `src/cooperative-scheduler.js`;
- `src/files.js`;
- `src/discovery.js`;
- `src/usage/source-files.js`;
- `src/usage/runtime.js`;
- `src/cli.js`.

Tests and documentation:

- `test/cooperative-scheduling.test.js`;
- `docs/cli-progress.md`;
- this completion report;
- `docs/rr02-fix-04-cli-captures/**`.

The dirty RR02-RERUN report and capture evidence already present at task start
remain historical evidence. FIX-04 did not revise its verdict.

## 10. Regression Coverage

Final focused results:

- scheduler, Discovery, Usage, progress, orchestration, Impact, and Evidence:
  56 passed, 0 failed;
- cooperative scheduling file alone: 8 passed, 0 failed;
- qualification/progress/orchestration: 27 passed, 0 failed;
- MP-01 through MP-05 group: 107 passed, 0 failed;
- Extractive Contract experiment/production: 21 passed, 0 failed;
- duplicate occurrence reconciliation cases passed inside the MP context
  regression;
- package content guard: passed.

Coverage includes a real Node event-loop test, deterministic injected
scheduler, abort before/after yield, scheduler error propagation, every-file
processing, enabled/disabled/different-batch equivalence, cancellation without
partial output, no duplicate terminal event, no post-terminal heartbeat,
callback isolation, downstream hash equality, and unchanged default stage
selection.

## 11. Packaged CLI Capture Evidence

A fresh worktree tarball, not an RR02-FIX-03, RR02-FIX-03A, or RR02-RERUN
tarball, was installed and used for all product scenarios.

Capture manifest:

`docs/rr02-fix-04-cli-captures/manifest.json`

The manifest represents five scenarios and 13 screenshots:

1. exact replay of the initial no-dependency calibration after write-first
   capture was enabled;
2. default TTY auto long heartbeat;
3. plain/non-TTY long heartbeat;
4. Usage cancellation;
5. short default/no-noise analysis.

The initial calibration process completed before the first harness version
persisted its in-memory transcript. No transcript was fabricated. Its exact
command and workload were replayed with write-first capture; the replay
observed a 9.3-second Usage stage and a correct five-second heartbeat. The two
separate long proof scenarios remain the acceptance evidence.

Every persisted entry has command, environment, raw/clean transcript,
metadata, final screen, and exit code. Both long runs additionally have
`01-start.png`, `02-before-heartbeat.png`, `03-heartbeat.png`, and
`04-final.png`.

## 12. Package and Privacy Validation

Fresh tarball:

- identity: `upgradelens@0.4.0`;
- files: 206;
- compressed size: 485,962 bytes;
- unpacked size: 1,924,523 bytes;
- npm SHA-1: `18cbe2f81b50bd9ac5b6e65d55475d90a62ed1de`;
- SHA-256:
  `56dc6da33a18392b8dfe6e5409db4e92cb85f4cac49a15cc50d50ff8166fdfa6`;
- cooperative scheduler source present;
- capture evidence entries: 0;
- required assets: 15/15;
- clean offline install: 12 exact local packages installed;
- packaged public import: passed;
- `npm pack --dry-run --json`: passed.

After this completion report was added, the final worktree dry-run contained
207 files, remained at zero capture-evidence entries, retained 15/15 required
assets, and passed. The installed validation tarball identity above remains
the 206-file artifact actually exercised by the packaged CLI captures.

The first isolated-cache install attempt correctly failed `ENOTCACHED`.
Validation then packed the already-installed exact dependency versions into
local tarballs and completed a fresh install with `--offline`; no registry or
provider request was made.

Capture validation:

- manifest: 5 entries;
- raw transcripts: 5;
- clean transcripts: 5;
- screenshots: 13;
- missing final screens: 0;
- deterministic final-screen replay: passed;
- plain/non-TTY ANSI and cursor scan: passed;
- clean transcript control-character scan: passed;
- private path, endpoint, credential, and secret scan: passed;
- PNG metadata scan: 13 passed;
- real-provider requests: 0.

## 13. Canonical/Serial Test Results

The first canonical parallel `npm run check` run produced:

- 546 total;
- 544 passed;
- 1 failed;
- 1 sandbox-only skip.

The failure was the existing `http-lifecycle-cli.test.js` child-process
deadline: the harness sent `SIGKILL`. No FIX-04 test failed. Lifecycle timeout
and test infrastructure were not changed.

A second canonical parallel `npm run check`, run with the machine idle,
produced:

- 546 total;
- 545 passed;
- 0 failed;
- 1 sandbox-only skip;
- package guard passed.

The separate serial suite produced:

- 546 total;
- 545 passed;
- 0 failed;
- 1 sandbox-only skip.

The serial pass is not used as a silent replacement for the first parallel
failure. Both parallel results and the serial result are retained. The skip is
the known local-loopback sandbox limitation.

## 14. Compatibility and Scope Confirmation

- lifecycle contract remains `1.0.0`;
- production heartbeat interval remains 5,000 ms;
- stage order and stop/cancel semantics are unchanged;
- no provider retry, timeout, identity, qualification, dataset, comparator,
  policy, threshold, schema, or Extractive Contract behavior changed;
- no scanner parallelism, Worker Thread, child-process heartbeat, network
  call, provider call, or dependency was added;
- Project Manifest, Usage Index, Impact, Evidence, warnings, ordering, IDs,
  digests, and lineage remain deterministic;
- package version remains `0.4.0`;
- Migration Checklist remains experimental, opt-in, and absent from default
  analysis;
- the Medium 80-column plain-detail truncation was not changed because it is
  outside the narrow heartbeat remediation;
- no commit, push, tag, publish, or release was performed.

## 15. Remaining Risks

1. Babel parsing remains synchronous within one file. Cancellation and a due
   heartbeat can run only after that parse completes. Current supported-source
   evidence has a 14.656-ms maximum, so there is no demonstrated single-file
   blocker.
2. The 50-ms scheduler budget is evaluated at safe completed-unit boundaries;
   it is not preemptive.
3. The HTTP lifecycle child timeout remains load-sensitive in parallel runs.
   It passed the canonical rerun and serial run, but the first canonical
   failure remains technical debt. FIX-04 intentionally did not change it.
4. Plain progress detail may still truncate at an 80-column TTY. This remains
   a non-blocking Medium follow-up.

## 16. Next Decision

**Verdict:
`READY_TO_RESUME_RR02_RERUN_FROM_RERUN_001`.**

The packaged heartbeat defect is fixed, cancellation is responsive at safe
boundaries, artifacts are exact-hash equivalent, performance overhead is
bounded, the canonical rerun and serial suite pass, and capture/package/privacy
gates pass.

RR02-RERUN must:

- create a new fresh tarball rather than reuse the FIX-04 tarball;
- restart from `RERUN-001`;
- inspect qualification identity again without reconstructing it from prose;
- require the persisted real-provider record for qualification scenarios;
- capture every new CLI invocation;
- keep Migration Checklist experimental.

FIX-04 does not start that rerun.
