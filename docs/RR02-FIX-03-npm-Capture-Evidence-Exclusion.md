# RR02-FIX-03 — npm Capture Evidence Exclusion and Package Content Guard

## Historical decision

Reported verdict: **`READY_TO_RESUME_RR02_RERUN`**.

Commit `e0c05b6` added an actual-tarball package-content guard, guard tests,
and `npm run check:package` wiring. The guard correctly recognizes known and
future `docs/*-cli-captures` paths, capture helpers, and required public
assets.

That verdict did not survive validation against committed HEAD. The stopped
RR02-RERUN proved that the commit omitted:

- the effective `!docs/*-cli-captures` package exclusion;
- `docs/migration-planning-qualification-resolution.md`;
- `docs/package-content-policy.md`;
- the remediation reports needed by rerun preflight.

The clean committed tarball therefore failed its own guard. Creating the
stopped-run manifest also made that manifest package-eligible, directly
demonstrating that the missing exclusion was not a theoretical defect.

RR02-FIX-03A exists to complete and validate the intended remediation in one
scoped commit. This report preserves the original historical verdict while
recording why it was superseded by `NO_GO_PACKAGE_OR_REGRESSION`.

## Evidence status

The original FIX-03 capture output was not present at RR02-FIX-03A baseline.
It is not fabricated. The committed guard implementation, stopped rerun
report/manifest, and FIX-03A clean package evidence provide the authoritative
reconciliation.
