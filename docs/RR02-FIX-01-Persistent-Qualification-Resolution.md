# RR02-FIX-01 — Persistent Qualification Resolution and Consistent CLI Status

## Historical decision

Verdict: **`READY_FOR_RR02_FIX_02`**.

Commit `bb17b8a` introduced the persisted Migration Planning qualification
record, strict schema and integrity validation, deterministic source
resolution, fail-closed status handling, and one immutable decision shared by
execution and presentation.

The implemented precedence is injected qualification, explicit portable path,
default project-local path, then missing. Only a missing default record may
use the explicit experimental exception. Corrupted, fake,
identity-mismatched, insufficient, and matching `NOT_QUALIFIED` records block
before provider use.

Focused tests in `test/migration-qualification-resolution.test.js` cover the
store, resolution, failure modes, CLI surface, presentation consistency, and
provider-call boundary. The current user-facing contract is documented in
`migration-planning-qualification-resolution.md`.

This decision advanced the review to the progress remediation; it did not
declare the complete product workflow release-ready and did not enable
Migration Checklist by default.

## Evidence status

The original capture helper remains repository-visible as
`scripts/rr02-fix-01-captures.mjs`, but the historical capture output was not
present in committed history at RR02-FIX-03A baseline. No replacement
screenshots or provider results are fabricated in this recovery report.
