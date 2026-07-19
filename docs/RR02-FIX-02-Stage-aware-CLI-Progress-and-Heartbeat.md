# RR02-FIX-02 — Stage-aware CLI Progress and Long-running Heartbeat

## Historical decision

Verdict: **`READY_FOR_RR02_RERUN`**.

Commit `3eb51d9` introduced versioned progress events, deterministic stage
lifecycle scheduling, TTY-aware append-only renderers, bounded safe activity,
real elapsed time, quiet-stage heartbeats, cancellation propagation, and
observer/output isolation.

The progress contract does not invent percentages, ETA, retry state, token
streaming, or provider “thinking”. The first interrupt cancels the active
stage, later stages are skipped, timers are cleaned, and the CLI returns 130.
Stop-on-first-failure remains deterministic. The current contract and
limitations are documented in `cli-progress.md`.

Focused coverage lives in `test/progress-orchestration.test.js` together with
qualification and orchestration regression tests. This remediation authorized
a packaged RR02 rerun; it did not itself qualify npm package composition or
enable Migration Checklist by default.

## Evidence status

The original capture output was not present in committed history at the
RR02-FIX-03A baseline and is not recreated. The implementation, public
contract, focused tests, and subsequent stopped rerun are the authoritative
repository evidence retained here.
