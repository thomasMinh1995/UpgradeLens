# CLI progress contract

`upgradelens analyze <repository>` exposes one presentation-only progress
stream for the complete sequential pipeline.

## Modes

- `--progress auto`: interactive when `stderr.isTTY` is true, plain otherwise.
- `--progress interactive`: append-only interactive lines even when redirected.
- `--progress plain`: stable grep-friendly lines even on a TTY.

Neither renderer uses cursor movement, carriage-return rewriting, a hidden
cursor, or spinner animation. `NO_COLOR` replaces interactive glyph semantics
with text labels such as `START`, `WORKING`, `WAITING`, and `DONE`.

## Lifecycle and ownership

```text
pipeline scheduler
      ↓
stage lifecycle
      ↓
bounded activity updates
      ↓
progress event normalization
      ↓
interactive renderer | plain renderer
      ↓
final summary / failure output
```

The pipeline owns stage order, state, terminal outcome, monotonic start time,
elapsed duration, and heartbeat scheduling. A stage adapter may only supply a
constrained activity kind, a sanitized subject, and a `completed/total` pair
when both values are deterministic and already known. Renderers do not infer
business state from display text.

Every scheduled stage terminates as `COMPLETED`, `FAILED`, `SKIPPED`, or
`CANCELLED`. Stop-on-first-failure and cancellation produce deterministic
`SKIPPED` events for remaining stages; the plain renderer suppresses those
individual lines to avoid noise and prints the run terminal summary instead.

Events use contract version `1.0.0`, a monotonic sequence, an injected wall
timestamp, monotonic elapsed milliseconds, a strict field allowlist, and
immutable objects. Progress events are transient and are never persisted in
Project, Knowledge, Version, Usage, Impact, Evidence, Migration Checklist, or
report artifacts.

## Heartbeat

A stage emits a heartbeat only after five seconds without a lifecycle or
activity update. Activity resets the quiet interval. Each timer is `unref`'d
and is removed on completion, failure, cancellation, and runtime disposal.
Tests use an injected manual clock and scheduler; production does not use fake
time.

Heartbeat reports the latest safe activity and real stage elapsed time. It
does not produce a percentage, ETA, token stream, retry claim, or model
“thinking” state. A known count is displayed as `(completed/total)` without
converting it to a percentage.

Project Discovery and Repository Usage Discovery cooperatively yield to the
Node.js event loop after 64 completed scan units or 50 milliseconds of
completed-unit work, whichever occurs first. The operation-local scheduler
uses `setImmediate`; it does not sleep, parallelize scanning, change traversal
order, or emit heartbeat events itself. Yield points occur only after a
directory entry, manifest group, or source file has completed, so timers and
cancellation can run without exposing partially constructed records.

## Cancellation and output failures

The first `SIGINT` aborts the active analysis signal, marks the current stage
`CANCELLED`, skips remaining stages, clears heartbeat timers, omits success
output, and returns exit code 130. Because rendering is append-only there is
no hidden cursor or in-place frame to restore. The one-shot handler is removed
after the first interrupt; a second interrupt follows the platform's normal
immediate behavior.

OpenAI-compatible and generic HTTP provider calls receive the caller signal.
Other stage adapters check the signal at safe boundaries and before artifact
publication. Discovery and Usage check it at every completed unit and again
after each actual cooperative yield. Artifact writers remain validate-first
and atomic, including temporary-file cleanup on write failure.

Progress callbacks and renderer writes are isolated. Throwing observers,
invalid activity updates, or renderer exceptions do not change stage results,
provider call count, artifacts, scheduling, or qualification decisions.

## Privacy and limitations

Activity subjects are chosen from bounded stage-owned labels, normalized to
one line, stripped of control characters, escaped for plain output, and
limited to 120 characters. Adapters never provide raw prompts, evidence
bodies, repository source snippets, provider payloads, authorization headers,
private endpoints, or raw error bodies.

Research currently reports a meaningful stage activity but not package
`N/M`, because its existing concurrent orchestrator does not expose a stable
per-package callback. No count is invented. Migration Checklist remains
experimental, opt-in, and mandatory-human-review; progress does not change its
persisted qualification decision.

JavaScript parsing is synchronous within one source file. Cooperative
scheduling can therefore observe cancellation and run a due heartbeat only
after that file finishes parsing; it cannot interrupt a single parser call.
Current supported validation fixtures do not contain one file whose parse
alone exceeds the five-second quiet threshold. A real supported fixture that
does so would require a separate incremental-parser or isolation experiment.
