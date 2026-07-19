# Contributing to DepVerdict

## Welcome and preview status

DepVerdict is a **Public Technical Preview / Alpha**. Its contracts may change as
maintainers learn from real repositories and contributor feedback. Bug reports, CLI
and decision-clarity feedback, documentation fixes, focused tests, and bounded code
contributions are welcome.

By participating, follow the [Code of Conduct](CODE_OF_CONDUCT.md). Use the
[Security Policy](SECURITY.md) for vulnerabilities and the [Support Policy](SUPPORT.md)
to choose the right channel.

DepVerdict is a decision-first CLI for evidence-bounded dependency upgrade
analysis. It is not production-stable, an autonomous migration tool, a security
scanner, or a substitute for developer review.

## Before opening an issue

1. Search existing issues for the same behavior.
2. Record the DepVerdict package version or commit you tested.
3. Decide whether the report is a product bug, an unsupported ecosystem or
   repository shape, or a provider/model quality or availability issue.
4. Reduce the case to a public or synthetic repository shape where possible.
5. Remove credentials, private source, private artifact content, and raw provider
   requests or responses.

Do not disclose a vulnerability in a public issue. Read
[SECURITY.md](SECURITY.md) first and use the configured GitHub Private Vulnerability
Reporting route.

## Development setup

DepVerdict requires Node.js 20 or newer and uses npm with a committed
`package-lock.json`.

Clone the canonical DepVerdict repository:

```sh
git clone https://github.com/thomasMinh1995/DepVerdict.git
cd DepVerdict
npm ci
npm test
npm run check:package
node ./bin/depverdict.js --help
```

`npm run check` runs the canonical tests and package guard together. The repository
does not currently define a lint or formatting script. Ordinary unit and package
tests use deterministic fixtures and do not require a real provider.

## Contribution workflow

1. Open or confirm an issue before a significant behavior or contract change.
2. Fork the repository or create a narrowly scoped branch.
3. Keep the change bounded and avoid unrelated cleanup.
4. Add or update tests for behavior changes.
5. Run the checks appropriate to the change.
6. Open a pull request using the repository template.

Descriptive branch and commit names are helpful but are recommendations, not an
enforced naming or Conventional Commits policy.

## Architecture and trust boundaries

Preserve these invariants:

- Dependency occurrences are not joined by package name alone.
- Declared, installed, and target versions remain separate facts.
- Registry latest is target discovery, not a recommendation driver.
- Missing or partial analyzer coverage cannot become `NOT_IMPACTED` or a safety
  conclusion.
- Unsupported, missing, conflicting, or invalid evidence fails closed.
- AI does not own targets, repository paths, commands, approval, recovery, or
  source changes.
- Migration Checklist v2 is experimental, opt-in, and human-reviewed.
- DepVerdict does not modify source or execute suggested verification commands.
- Artifacts remain deterministic, schema-validated, lineage-aware, and portable.

Start with the [current architecture overview](docs/architecture-overview.md),
[Version Analysis architecture](docs/version-analysis-architecture.md),
[Upgrade Decision architecture](docs/mp-r03-deterministic-upgrade-decision-architecture.md),
[Migration Checklist contract](docs/mvp-05-migration-checklist-contract.md), and
[package content policy](docs/package-content-policy.md).

## Testing expectations

| Change type | Expected validation |
| --- | --- |
| Documentation only | Review links, privacy language, examples, and `git diff --check`; run affected checks when package-visible docs change |
| Focused code change | Relevant `node --test test/<file>.test.js`, then `npm test` |
| Schema or artifact contract | Schema, lineage, tamper, deterministic serialization, and compatibility tests; update contract docs |
| Package or release boundary | Focused package-guard tests and `npm run check:package` against the actual npm tarball |
| Provider or evaluation | Deterministic fake/recorded fixtures by default; update identity and qualification tests when applicable |

Do not require or invoke a real provider for ordinary contributions. Provider and
evaluation work must never commit credentials, raw sensitive captures, proprietary
source, or provider payloads.

## Pull request expectations

A pull request should explain:

- the problem or root cause;
- the bounded solution and behavior before/after;
- tests and validation performed;
- limitations and follow-up work;
- exact files changed;
- security, privacy, provider, and package-boundary impact;
- any breaking CLI, schema, artifact, or identity change.

## Current contribution priorities

Useful feedback and contributions include:

- decision clarity and `INVESTIGATE` calibration;
- installed-version baselines in real monorepos;
- dependency occurrence selector ambiguity and UX;
- analyzer coverage clarity;
- usefulness of the human-reviewed Coding Agent handoff;
- CI completion and exit semantics;
- documentation and contributor experience.

Autonomous migration safety is outside the `0.6.0-alpha.1` contract because
DepVerdict does not autonomously migrate source.
