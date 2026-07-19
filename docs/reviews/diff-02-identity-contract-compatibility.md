# DIFF-02 — Identity Contract and Compatibility Review

## 1. Executive verdict

Verdict: `DEPVERDICT_IDENTITY_COMPATIBILITY_READY`

Gate: `PROCEED_TO_DIFF_03_REPOSITORY_DOCS_AND_COMMUNITY_MIGRATION`

DepVerdict is now the canonical runtime and package identity. The preview keeps
one bounded compatibility window for the `upgradelens` executable,
`UPGRADELENS_*` environment variables, and read-only `.upgradelens/` artifact
discovery. No schema, provider-qualification identity, historical tag, or
evidence protocol was generalized or rewritten.

## 2. Brand availability preflight

The final read-only preflight ran at `2026-07-19T08:05:34Z`, before runtime
implementation.

- npm returned not-found for exact `depverdict` and
  `@thomasminh1995/depverdict`.
- The exact future GitHub repository identity returned not-found, and GitHub
  repository search returned zero exact repositories.
- PyPI and RubyGems returned not-found.
- No `depverdict` executable was found on the local command path.
- Exact general-web software, product, company, trademark-signal, and GitHub
  queries returned no material collision.
- Crates.io returned access denied and unauthenticated GitHub code search
  returned unauthorized, so those two checks are unverified.
- Domain RDAP not-found responses were treated only as weak signals.

Classification: `BRAND_PREFLIGHT_CLEAR_WITH_LOW_RISK`.

Availability is time-sensitive, does not reserve any identity, and is not legal
or trademark advice.

## 3. Identity architecture decision

The pre-code decision is
`docs/decisions/diff-02-identity-compatibility-contract.md`.

It separates runtime identity from persisted protocol identity:

- runtime presentation: DepVerdict;
- package: `@thomasminh1995/depverdict`;
- canonical CLI: `depverdict`;
- persisted `generator.name`: historical protocol literal `"UpgradeLens"`;
- structured-output and Migration Planning task/schema identities: unchanged.

It also defines whole-chain artifact selection, environment precedence,
stderr-only diagnostics, explicit-path authority, qualification behavior, and
criteria for eventually removing compatibility.

## 4. Package and version transition

Authoritative metadata now declares:

```text
@thomasminh1995/depverdict@0.6.0-alpha.1
```

The lockfile root name, version, and bin map were synchronized without
dependency, resolved URL, integrity, or transitive lock drift. Repository,
homepage, and issue URLs still point at the current UpgradeLens repository
because repository rename is outside DIFF-02.

The package remains public-capable and has no embedded publish credential,
publish hook, or `private` flag. No `publishConfig` was added: public access and
the non-default `preview` tag are kept as explicit future publish-command
controls instead of encoding a misleading substitute for dist-tag policy.

The description now exposes DepVerdict's decision-first positioning.

## 5. Canonical and legacy CLI contract

The package has two executable entries sharing one dispatcher:

```text
depverdict  -> bin/depverdict.js
upgradelens -> bin/upgradelens.js
```

Both files have a valid Node shebang and executable mode. The canonical wrapper
injects canonical invocation identity. The thin legacy wrapper injects only
legacy invocation identity and does not duplicate or recursively invoke command
logic.

The legacy command emits one warning per process state to stderr. It names both
commands and the `0.6.x` preview removal window. It does not change stdout or
exit status. Programmatic `runCli` use is canonical unless legacy invocation is
explicitly requested.

Help, progress heading, console outcome, new Markdown report title, failure
presentation, error guidance, and user agent now present DepVerdict. Historical
files and provider prompt/task identities were not rewritten.

## 6. Artifact-root compatibility

Every implicit write now uses `.depverdict/`, including manifests, evidence,
analysis, usage, impact, decision, checklist, report, log, cache, governance,
conformance, and default qualification paths. Artifact filenames are unchanged.
Discovery ignores both generated roots.

The centralized read resolver implements:

1. complete canonical chain wins;
2. complete canonical plus any legacy data emits
   `LEGACY_ARTIFACT_ROOT_IGNORED`;
3. complete legacy with no canonical member emits
   `LEGACY_ARTIFACT_ROOT_USED`;
4. partial or split availability fails with `ARTIFACT_ROOT_CONFLICT`;
5. no artifacts preserves the established canonical missing-input behavior.

The resolver never merges, copies, moves, deletes, or timestamp-selects
artifacts. Explicit CLI/API paths bypass automatic discovery and remain exact,
including an explicitly selected `.upgradelens/` output.

The bounded fallback is applied to Project Manifest research input, the
three-artifact Version Analysis input chain, the seven-artifact decision and
Migration Checklist chain, and default Migration Planning qualification.

## 7. Environment compatibility and precedence

One resolver owns the complete discovered mapping:

| Canonical | Deprecated fallback | Secret-sensitive |
| --- | --- | --- |
| `DEPVERDICT_AI_PROVIDER` | `UPGRADELENS_AI_PROVIDER` | No |
| `DEPVERDICT_AI_ENDPOINT` | `UPGRADELENS_AI_ENDPOINT` | No |
| `DEPVERDICT_AI_MODEL` | `UPGRADELENS_AI_MODEL` | No |
| `DEPVERDICT_AI_AUTHORIZATION` | `UPGRADELENS_AI_AUTHORIZATION` | Yes |
| `DEPVERDICT_AI_TIMEOUT_MS` | `UPGRADELENS_AI_TIMEOUT_MS` | No |
| `DEPVERDICT_AI_TIMEOUT_SECONDS` | `UPGRADELENS_AI_TIMEOUT_SECONDS` | No |
| `DEPVERDICT_AI_MAX_RESPONSE_BYTES` | `UPGRADELENS_AI_MAX_RESPONSE_BYTES` | No |
| `DEPVERDICT_AI_DEBUG` | `UPGRADELENS_AI_DEBUG` | No |

Precedence is explicit override, canonical environment, legacy environment,
then established default. Canonical wins conflicts. Diagnostics name keys only,
are once-per-key bounded, and never contain values. Unknown identity-prefixed
variables are discarded. Passing an explicit empty environment remains isolated
from the host environment.

Provider request count, timeout parsing, runtime selection, and debug-output
contracts remain unchanged after resolution.

## 8. Qualification compatibility

Package and product name do not participate in Migration Planning qualification
identity. Provider, endpoint/adapter, model, dataset, task, prompt, policy,
schema, and presentation identities remain authoritative and unchanged.

The default qualification path moved to `.depverdict/`. A valid legacy record is
selected intact only when canonical storage is absent. When both exist,
canonical is selected and legacy is visibly ignored. Explicit paths never fall
back. Corrupted, tampered, runtime-mismatched, fake-runtime, and matching
`NOT_QUALIFIED` records retain their fail-closed behavior.

No external provider requalification was required or performed.

## 9. Schema and public API preservation

Schema versions, filenames, schema IDs, prompt versions, policy versions, task
IDs, status/reason codes, occurrence identities, evidence IDs, digests, and
lineage checks did not change.

New artifacts still write `generator.name: "UpgradeLens"` because current
schemas validate that literal. Generator version advances from package metadata
to `0.6.0-alpha.1`, as already permitted by the schemas. Old fixtures remain
schema-valid in the full suite.

The root ESM API remains 438 exports. No redundant identity helper was promoted
to the public surface.

## 10. Package guard and CI updates

The package guard now requires:

- both executable files;
- both compatibility resolver modules;
- the DIFF-02 decision and this review;
- the established runtime, schemas, datasets, and user-facing assets.

An untracked protected implementation file is accepted only when it is on this
exact authoritative required list; other protected untracked files still fail.
Both `.depverdict/` and `.upgradelens/` runtime output trees are explicitly
forbidden from the package. Capture, duplicate/copy, credential, environment,
qualification-record, and local-artifact protections remain active.

CI remains read-only and fork-safe on Node 20, 22, and 24. It clears both complete
environment-prefix sets and runs install, tests, actual-tarball guard, and
clean-install package smoke. There is no publish, tag, release, writeback, or
provider-secret step.

Package smoke installs the scoped tarball into an isolated consumer, exercises
the npm-generated canonical and legacy command shims, checks canonical
help/version with clean stderr and legacy version with its warning, imports the
scoped ESM package, and verifies 438 exports.

## 11. Focused and adversarial tests

Focused coverage proves:

- exact canonical name/version/help and clean canonical stderr;
- bounded legacy command warning, unchanged exit status, and JSON-only
  `--stdout`;
- canonical/alias artifact equivalence after normalizing only generation time;
- explicit legacy output authority;
- canonical, legacy, conflict, and explicit environment precedence without
  secret disclosure or host inheritance;
- complete canonical/legacy artifact selection and split-chain rejection;
- no fallback-side file rewrite;
- valid legacy qualification fallback and canonical qualification precedence;
- tamper and identity mismatch rejection;
- exact package metadata and dual-bin tarball/install behavior.

The full schema, lineage, tamper, deterministic replay, provider request
isolation, historical-fixture, and package-policy suites also passed.

## 12. Canonical validation

Final source validation:

```text
npm run check
tests: 640
passed: 639
failed: 0
skipped: 1
package guard: passed
```

The single skip is the established sandbox limitation for a local loopback
keep-alive test. The related scoped HTTP lifecycle tests and real child-process
natural-exit test passed.

`git diff --check` passed. Lockfile review found only root identity/version and
the added canonical bin mapping. No dependency integrity changed.

## 13. Actual tarball and clean-install results

The qualified filename is:

```text
thomasminh1995-depverdict-0.6.0-alpha.1.tgz
```

The final actual-tarball guard reports zero suspicious artifacts and all 25
required assets. Isolated clean install/extraction succeeds, both executable
files are mode `0755`, canonical help/version are clean, the alias warns on
stderr, and scoped import exposes 438 public exports.

Repeated `npm pack --dry-run --json --ignore-scripts` runs produce identical
metadata and integrity for the same source state. No tarball is retained in the
repository.

## 14. npm publish dry-run and bin normalization

An initial npm 11.12.1 dry-run exposed publish normalization of `./bin/...`
values. This was treated as a real metadata defect, not ignored. The bin values
were changed to equivalent portable `bin/...` paths.

The final command:

```text
npm publish --dry-run --access public --tag preview --json --ignore-scripts --offline
```

completed with no auto-correction warning, kept both executable entries and
files, retained the exact scoped name/version, selected `preview` with public
access, and performed no registry mutation. No `npm pkg fix` was run.

## 15. Provider-call count

External provider calls: `0`.

Tests used deterministic fake or local fixture runtimes only. npm registry access
during isolated consumer installation is package transport, not an AI provider
call.

## 16. Blocked and skipped checks

- Crates.io exact-name availability: unverified because the service returned
  access denied.
- Unauthenticated GitHub code search: unverified because the API returned
  unauthorized.
- Hosted CI was not dispatched because DIFF-02 forbids commit and push. The
  workflow contract and local CI-equivalent commands passed.
- Node 20/22/24 were not separately installed in the local environment; the
  existing matrix remains configured. Validation ran on Node 26.0.0, which
  satisfies the package's `>=20` engine contract.
- No repository rename, identity reservation, publish, tag, release, or external
  provider qualification was attempted.

These are non-critical availability/platform follow-ups and do not undermine
the implemented compatibility invariants.

## 17. Defects and remaining limitations

Resolved defect:

- npm publish normalization warned on `./bin/...` and would normalize those
  paths. Using `bin/...` removes the warning and retains both bins.

Open Blocker defects: none.

Open High defects: none.

Remaining Medium limitations:

- broad repository, community, historical documentation, and release-text
  migration remains intentionally deferred to DIFF-03;
- brand availability and legal-risk signals remain time-sensitive;
- automatic legacy compatibility is preview-bounded and must not be removed
  without satisfying the decision's removal criteria;
- hosted Node-matrix execution awaits an authorized pushed change.

## 18. Exact files changed or created

Package, CLI, CI, and current-use documentation:

```text
.github/workflows/ci.yml
README.md
bin/depverdict.js
bin/upgradelens.js
package-lock.json
package.json
scripts/ci-package-smoke.mjs
scripts/package-content-guard.mjs
```

Runtime:

```text
src/ai-runtime-debug.js
src/ai-scorecard.js
src/artifact-root-compatibility.js
src/benchmark-report.js
src/cli.js
src/conformance-report.js
src/constants.js
src/discovery.js
src/environment-compatibility.js
src/evaluation-report.js
src/impact-evidence/repository-impact-evidence.js
src/impact/repository-impact.js
src/knowledge-cache.js
src/knowledge-evidence-producer.js
src/knowledge-manifest-builder.js
src/metrics-engine.js
src/migration-checklist/input-loader.js
src/migration-checklist/migration-checklist.js
src/migration-checklist/qualification-resolution.js
src/migration-checklist/runtime.js
src/orchestration/failure-log.js
src/orchestration/progress-reporter.js
src/renderers/console.js
src/renderers/markdown.js
src/upgrade-decision/runtime.js
src/upgrade-decision/upgrade-decision.js
src/usage/usage-index.js
src/version-analysis-loader.js
src/version-analysis-manifest.js
```

Tests:

```text
test/analysis-orchestration.test.js
test/ci-workflow-metadata.test.js
test/cli.test.js
test/discovery.test.js
test/governance-metadata.test.js
test/http-lifecycle-cli.test.js
test/identity-compatibility.test.js
test/knowledge-manifest-generation.test.js
test/migration-checklist-contract.test.js
test/migration-checklist-orchestration.test.js
test/migration-qualification-resolution.test.js
test/package-content-guard.test.js
test/product-completion-cli.test.js
test/research-plan.test.js
test/runtime-conformance.test.js
test/version-analysis-manifest.test.js
test/version-source.test.js
test-support/environment.mjs
```

Decision and review:

```text
docs/decisions/diff-02-identity-compatibility-contract.md
docs/reviews/diff-02-identity-contract-compatibility.md
```

## 19. Pre-existing changes preserved

The task began on `main` at
`c91fbb0032b0e2f6209cb4a14aeeb68d9cf0c28d`. The origin still points to the
UpgradeLens repository, and public tags through `v0.5.0` are unchanged.

Pre-existing untracked DIFF-01/source-comparison documents, RR02 capture trees,
and duplicate capture files were left intact. They were not cleaned, rewritten,
staged, or used as provider input.

No commit, merge, tag, push, repository rename, release, or publish was
performed.

## 20. Final verdict and next gate

Verdict: `DEPVERDICT_IDENTITY_COMPATIBILITY_READY`

Gate: `PROCEED_TO_DIFF_03_REPOSITORY_DOCS_AND_COMMUNITY_MIGRATION`
