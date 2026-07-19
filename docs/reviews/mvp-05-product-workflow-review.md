# UpgradeLens MVP-05 — Full Product Workflow and Feature Alignment Review

## 1. Executive Verdict

**`PARTIAL_MATCH`**

The UpgradeLens pipeline is operational, deterministic, well validated, and
safe against unsupported AI actions. It can discover a representative
polyglot repository, research public evidence, run provider-backed Version
Analysis, index JavaScript/TypeScript usage, preserve artifact lineage, and
produce a human-review-gated report.

It does not yet deliver the complete product outcome claimed for MVP-05. The
real VinGrade workflow produced no explicit upgrade recommendation, no
grounded migration action, no candidate location, no ordered roadmap, and no
verification or recovery plan. A Coding Agent had to inspect lockfiles, source,
tests, and runtime configuration to derive even “already at target” and “hold
the upgrade” conclusions.

| Decision | Result |
| --- | --- |
| v0.5.0 release readiness | **`NO_GO`** for the stated full dependency-upgrade intelligence and migration-roadmap positioning |
| Migration Checklist readiness | **`KEEP_EXPERIMENTAL`**; not ready for default enablement |
| Real-provider qualification | **`QUALIFIED`** for `openai-compatible / openai/gpt-5.5 / openai-compatible` |
| Product workflow readiness | Pipeline-ready; product outcome **partially ready** |
| Coding Agent handoff readiness | **Not ready for implementation**; useful only to start investigation |

This recommendation is based on product-output gaps reproduced on a real
repository, not on automated test failures.

## 2. Environment and Scope

| Item | Value |
| --- | --- |
| UpgradeLens branch | `feat/mvp-05-evidence-migration-checklist` |
| UpgradeLens commit | `44eb942e21ea78550700990a00bd74635ce48bcc` (`fix: event-loop starvation`) |
| Package | `upgradelens@0.4.0` |
| Node.js | `v26.0.0` |
| npm | `11.12.1` |
| Platform | macOS arm64 |
| Representative repository | VinGrade |
| VinGrade commit | `25811ef997fcf45810105e89e4500688f28f7ba5` |
| VinGrade execution target | Clean isolated `git archive` snapshot |
| Provider/model | `openai-compatible` / `openai/gpt-5.5` |
| Provider debug output | Disabled |
| Qualification | Persisted, exact identity, `QUALIFIED` |

The original VinGrade checkout had a deleted tracked `Makefile` and unrelated
untracked user files. It was not modified. All workflow writes went to
isolated temporary snapshots.

The review covered the current source, schemas, tests, fixtures, public CLI,
packaged CLI, full online and offline workflows, failure handling, occurrence
identity, provider qualification, console/Markdown presentation, and Coding
Agent handoff.

### Validation status

| Validation | Result |
| --- | --- |
| Canonical `npm run check` | 545 passed, 0 failed, 1 skipped |
| Skip | Local-loopback lifecycle test: sandbox does not expose listeners to that test |
| Package guard | 209 files after this report, 0 CLI-capture evidence, 15/15 required assets |
| Static lint | Blocked: repository defines no lint script |
| Schema validation | Passed through automated suite and runtime artifact writers/loaders |
| `git diff --check` | Passed |
| Fresh npm pack | Passed |
| Clean offline install | Passed using exact local dependency tarballs |
| Packaged version/help/import | Passed; version `0.4.0`, 408 public exports |
| Second-model comparison | Blocked: no second model configuration was available |
| Provider token/cost comparison | Blocked: production artifacts do not retain request usage/cost totals |

The canonical suite’s single skip is reported rather than counted as a pass.
No test, schema, fixture, timeout, policy, or source implementation was changed.

## 3. Full Workflow Result

The main command was:

```text
upgradelens analyze . --progress plain --experimental-migration-checklist
```

The command ran from the isolated VinGrade snapshot. Public registry research
used fresh or cached evidence. Version Analysis and the eligible Migration
Checklist context used the configured real provider.

| Stage | Status | Input | Output | Duration | User-visible result |
| --- | --- | --- | --- | ---: | --- |
| Project Discovery | Passed | VinGrade source tree | `project-manifest.json` | 0.1s | 2 projects; Node and Python |
| Knowledge Research | Passed with warnings | 47 occurrences / 46 packages | `knowledge-manifest.json`, `knowledge-evidence-bundle.json` | 9.3s | Not shown in final summary |
| Version Analysis | Passed with partial results | Project, knowledge, 577 evidence records | `version-analysis.json` | 398.8s | Final summary showed 36 analyzed, 3 skipped, 8 failed |
| Repository Usage Discovery | Passed with warning | Source tree | `usage-index.json` | 0.2s | 17 dependencies, 152 symbols, 79 files; detail not shown in final summary |
| Repository Impact Analysis | Passed | Version Analysis and Usage Index | `repository-impact.json` | <0.1s | 0 impacted, 36 not impacted, 11 not analyzed |
| Repository Impact Evidence | Passed | Impact and lineage artifacts | `repository-impact-evidence.json` | <0.1s | 4 finding records, no affected files |
| Migration Checklist | Passed but incomplete | Full lineage and exact qualification | `migration-checklist.json` | 0.2s | 4 manual-review items, 0 grounded actions, 0 locations |
| Markdown Report | Passed | Presentation view models | `repository-impact.md` | <0.1s | Report path shown |

Total CLI time was 408.6 seconds; the capture wrapper measured 409.3 seconds.
All eight stages reached terminal success, but business completeness was
`INCOMPLETE`.

### Artifact results

- Project Discovery: 2 projects, 47 dependency occurrences.
- Knowledge Research: 45 resolved packages, 1 unavailable package, 298
  sources, 577 evidence records, 84 manifest warnings.
- Version Analysis: 36 analyzed, 3 skipped, 8 failed, 46 requiring review.
- Risk: 1 medium, 46 unknown.
- Usage: JavaScript/TypeScript coverage only; 1 parse warning.
- Impact: 4 breaking findings, none reported as impacted.
- Checklist: 47 dependency records, 4 finding records, 4 deterministic
  manual-review items, no grounded action and no candidate location.

### Provider requests

The one-call-per-eligible-context contract and retained result states show:

- 44 Version Analysis attempts: 36 successful and 8 HTTP 402
  `INSUFFICIENT_CREDIT` failures;
- 3 skipped Version Analysis contexts made no request;
- 1 eligible Migration Checklist attempt failed and was contained as
  `AI_RUNTIME_FAILED`;
- total real-provider attempts: **45**;
- hidden retries: **0**.

A separate loopback invalid-output fixture received exactly one simulated
request. It is not counted as a real-provider request.

## 4. Core Feature Alignment Matrix

| Feature | Verdict | Evidence | Developer/team impact | v0.5.0 relevance |
| --- | --- | --- | --- | --- |
| Dependency Inventory | **MATCH** | Project Manifest preserved 47 occurrences across Node and Python with project, manifest, declaration, and dependency type | Team can enumerate direct declarations and distinguish occurrences | Required and ready |
| Upgrade Detection | **PARTIAL_MATCH** | Registry targets and missing-target states exist, but every resolvable declaration is analyzed; there is no separate “requires attention” selection | Teams receive broad analysis rather than a focused attention list | Required improvement |
| Upgrade Recommendation | **NOT_MATCH** | Version Analysis has status, risk, review reasons, and `nextAction`, but no `upgrade now / plan / keep / insufficient evidence` decision | A tech lead must infer whether any dependency should change | Release-critical |
| Reason and Evidence | **PARTIAL_MATCH** | Findings reference exact evidence IDs and target versions; output also clearly labels registry latest as a fact, not a recommendation | Good auditability, but reasons do not resolve the decision | Important |
| Repository Risk Assessment | **PARTIAL_MATCH** | JS/TS exact-symbol matching works; Python is not indexed, yet one LangSmith finding was reported `DEPENDENCY_NOT_USED` and `NOT_IMPACTED` despite real Python usage | False confidence is possible outside supported analyzer coverage | Release-critical |
| Dependency Classification | **NOT_MATCH** | Dependency type is recorded, but no framework/core, small package, internal package, or transitive classification exists | React and `remark-gfm` receive essentially the same decision treatment | Important |
| Prioritization | **NOT_MATCH** | No dependency or action priority, urgency, rank, or planning order is presented | Teams cannot turn the report into a work queue | Release-critical |
| Migration Roadmap | **NOT_MATCH** | Checklist had zero grounded actions/locations; the production prompt forbids prerequisites, order, rollback, and verification claims | The output is a review ledger, not a migration roadmap | Release-critical |
| Human Review | **MATCH** | 46/47 Version results required review; checklist always states human review is mandatory | Unsafe automation is prevented | Required and ready |
| Coding Agent Handoff | **PARTIAL_MATCH** | Stable IDs, evidence refs, findings, and limitations help investigation; the Agent still had to recover versions, files, tests, and runtime constraints from source | Agent cannot safely begin implementation from the artifact | Release-critical |
| Model Transparency | **PARTIAL_MATCH** | Checklist console shows qualification and runtime tuple; Version Analysis and Checklist JSON do not persist provider/model/request identity | Saved artifacts cannot independently establish which runtime produced results | Important |
| Evidence Freshness | **MATCH** | Source records retain `retrievedAt`, freshness, publication dates, and cache results | Reviewer can distinguish fresh, cached, and unavailable evidence | Required and ready |
| Offline Readiness | **MATCH** | Empty-cache offline run safely produced 47 not-analyzed results; fresh-cache offline research reused 45 packages without network | Offline limits are representable without inventing latest facts | Ready with UX caveat |
| Continuous Tracking Readiness | **MATCH** | Canonical IDs, schema versions, artifact digests, research IDs, context IDs, and lineage are stable | Future runs can be compared without name-only matching | Ready |
| CLI-first Delivery | **PARTIAL_MATCH** | One `analyze` command runs the pipeline with stable progress and CI-friendly plain mode; important decisions and failure next steps remain buried in artifacts | Operationally usable, but not yet outcome-first | Important |

**Count: 5 MATCH, 6 PARTIAL_MATCH, 4 NOT_MATCH.**

## 5. Three Core Questions Assessment

### Question 1 — Should the dependency be upgraded?

**No clear answer is produced.**

React is the decisive example:

- declared constraint: `^19.2.6`;
- lockfile installed version: `19.2.7`;
- reported target: `19.2.7`;
- Version Analysis current version: `null`;
- risk: `unknown`;
- next action: review before impact analysis.

The technically useful answer is “already at the target; do not perform a
version change.” UpgradeLens does not read the lockfile baseline and therefore
cannot produce that decision.

The small package `remark-gfm` is also locked at the reported `4.0.1` target,
but receives unknown risk and mandatory review instead of a concise “keep
current version” outcome.

### Question 2 — Why, and what is the risk?

**Partially answered.**

Strengths:

- evidence references are exact and target-scoped;
- uncertainty and registry-latest limitations are explicit;
- findings are retained separately from deterministic impact matching;
- provider failure does not invent findings.

Weaknesses:

- the unresolved baseline prevents meaningful delta risk for most packages;
- 46/47 results remain `unknown`;
- no framework/core versus small-package context changes the presentation;
- Python usage is unsupported, but the report still says LangSmith is not
  impacted because the dependency is not used.

A tech lead must inspect multiple JSON artifacts and repository source to
understand the actual risk.

### Question 3 — What is the migration roadmap?

**Not answered.**

The checklist contains:

- 4 deterministic manual-review placeholders;
- 0 grounded actions;
- 0 AI-selected official guidance items;
- 0 candidate locations;
- no order, preconditions, verification strategy, rollout, or recovery step.

The extractive production contract intentionally prevents invented actions,
which is the correct safety behavior. It also means the current artifact is
not the migration roadmap described by the product positioning.

### Planning-meeting usability

The report is useful as a safe evidence and uncertainty inventory. It is not
ready to drive an upgrade-planning meeting without additional lockfile,
source, and test investigation.

## 6. Scenario Results

### Scenario A — Representative real project

**Result: PARTIAL_MATCH**

VinGrade is a real polyglot project with 47 occurrences, 46 packages, a React
frontend, Python backend, core and small packages, and real source usage.

The main command correctly ran all stages in order and produced the complete
artifact chain. Critical loader/lineage failures stop their commands.
Package-local provider failures are retained without deleting successful
results.

The workflow still ends with no recommendation and no roadmap.

### Scenario B — Core framework: React

**Result: NOT_MATCH**

React is already locked at the reported target `19.2.7`. UpgradeLens treats
the baseline as unresolved, assigns unknown risk, and produces a private
React Server Components path finding that does not match repository usage.
It does not say “already current,” propose no change, identify architecture
areas, or provide framework-level verification.

### Scenario C — Small package: `remark-gfm`

**Result: NOT_MATCH**

`remark-gfm` is also already locked at its target `4.0.1`. The output lists
type/documentation changes, leaves risk unknown, and requires human review.
There is no concise keep-current conclusion. Dependency type is preserved,
but there is no small-package classification or proportional UX.

### Scenario D — Insufficient evidence

**Result: MATCH for safety; PARTIAL_MATCH for UX**

With an empty offline cache:

- 46 packages were unavailable;
- evidence count was 0;
- all 47 Version Analysis results were skipped;
- no model was called;
- all 47 required review;
- Migration Checklist generated no grounded action.

No latest version, command, source location, or migration instruction was
invented. The final console output does not tell the user to populate the
cache or rerun research online; that next step remains inside artifacts.

### Scenario E — Mixed occurrences

**Result: MATCH for identity; PARTIAL_MATCH for presentation**

The duplicate `langchain-openai` declarations remained separate:

- unversioned occurrence: distinct context/result ID, skipped with
  `BASELINE_UNSUPPORTED`;
- `>=0.3.0` occurrence: distinct context/result ID, analyzed.

No occurrence was silently chosen or merged, and one skipped occurrence did
not change the other result. Markdown shows two identical
`langchain-openai` headings without the declaration/context identity, which is
ambiguous for a human reviewer.

### Scenario F — Failure and recovery

| Failure | Exit | Result |
| --- | ---: | --- |
| Missing upstream Project Manifest | 1 | Correct stop; raw `ENOENT` path, no stage label or concrete next command |
| Missing AI runtime configuration | 1 | Clear configuration message; does not explain provider/model setup beyond endpoint |
| Invalid artifact lineage | 1 | Precise digest and repository-name mismatch; no artifact replacement |
| Invalid structured response | 0 | Fail-closed result artifact with `OUTPUT_JSON_INVALID`, but CLI prints “complete” and exits success |
| Real provider insufficient credit | 0 for full workflow | 8 package failures retained; final summary shows failure count, but credit recovery is not shown |
| Migration Checklist provider failure | 0 for full workflow | Contained as manual review; no unsupported action |
| Pipeline cancellation | 130 | Existing same-HEAD packaged capture proves controlled cancellation and no partial Usage Index |

The runtime performs no automatic retry. The invalid-output fixture received
one request.

### Coding Agent handoff

**Result: NOT READY**

Using only the source repository and Migration Checklist, the Agent concluded:

- React, React DOM, and PDF.js were already at target;
- LangSmith should be held pending API evidence;
- Node runtime compatibility and real test prerequisites need review.

Those conclusions required repository re-research. The checklist itself
provided no concrete change, test, file, location, or target approval.

### Cross-model readiness

**Execution blocked.** Only `openai-compatible / openai/gpt-5.5` was
configured. No Claude Sonnet configuration was available, so no cross-model
quality claim is made.

The qualification resolver distinguishes exact qualified, missing, mismatch,
corrupted, insufficient, and rejected records. It does not expose a separate
user-facing compatible/qualified/experimental/rejected/unknown model taxonomy
in saved Version Analysis artifacts.

### Offline readiness

**Result: MATCH**

The empty-cache offline run safely represented external verification as
unavailable. A separate offline fresh-cache run reused 45 packages, retained 1
cache miss, performed no registry request, and preserved evidence freshness.

Project-only discovery and usage analysis continue to work offline. The final
console summary should state the offline evidence limitation more directly.

## 7. CLI UX Review

### What works

- `upgradelens analyze` is the correct single workflow command.
- Stage order and plain progress are stable and CI-friendly.
- Heartbeats make the long provider stage visibly active.
- Final summary clearly shows analyzed/skipped/failed/review counts.
- Qualification status, source, ID, runtime tuple, and experimental override
  are visible when Migration Checklist runs.
- Secret-like provider values are not printed.
- Missing configuration and lineage failures are concise.
- Output paths are portable relative paths in the success summary.

### What is difficult

- The summary leads with counts, not “upgrade / keep / investigate” decisions.
- `--help` describes commands and artifacts, not the three product outcomes.
- Provider setup is not explained beyond environment variable errors.
- Research warnings and unavailable-package identity are absent from final
  output.
- `NOT_IMPACTED` appears without analyzer-coverage context.
- A package-local provider/output failure can exit 0 and print “complete.”
- Migration Checklist exposes internal qualification details before any useful
  action.
- The developer must open multiple JSON artifacts to find next steps and
  limitations.
- The full help page exposes evaluation, scorecard, benchmark, conformance,
  and governance commands at the same level as the primary workflow.

### Recommended default output

Lead with a dependency decision table:

```text
Dependency    Decision               Current → Target    Risk     Why / next step
react        Keep current           19.2.7 → 19.2.7    Low      Already at target
axios        Insufficient evidence  1.17.0 → 1.18.1    Unknown  Review release delta
vite         Not analyzed           unknown            Unknown  Collect target evidence
```

Then show affected areas, human approvals, and the report/checklist paths.
Keep qualification digests and detailed reason codes behind a verbose or
diagnostic view.

### Capture references

Captures are stored locally under:

```text
.upgradelens/review/mvp-05-workflow/
```

Important entries:

- `003-vingrade-full-offline-qualified/`
- `007-vingrade-full-online-qualified/`
- `008-missing-ai-runtime-config/`
- `009-invalid-artifact-lineage/`
- `010-invalid-structured-response/`
- `013-packaged-version/`
- `014-packaged-help/`
- `016-agent-handoff-assessment.md`
- `017-offline-fresh-cache-research/`
- `018-post-report-npm-pack/`
- `019-final-package-guard/`

Each command entry retains command, working directory, safe runtime identity,
exit code, exact stdout/stderr, duration, and artifact inventory. Eight
important final screens were rendered from exact raw transcripts; they are
not presented as native terminal screenshots.

## 8. Defects and Gaps

### Blocker

#### B-01 — The workflow does not produce an upgrade decision or migration roadmap

- Reproduction: run the qualified online VinGrade workflow.
- Expected: explicit upgrade/plan/keep/insufficient decision plus a safe,
  ordered roadmap for actionable dependencies.
- Actual: 47 dependencies, 4 breaking findings, 4 manual-review placeholders,
  0 grounded actions, 0 locations, and no roadmap.
- Product impact: Questions 1 and 3 are unanswered; the headline MVP-05
  product value is not delivered.
- Evidence: capture `007`; `migration-checklist.json`; Coding Agent handoff.

### High

#### H-01 — Lockfile baselines are ignored

- Reproduction: inspect React, React DOM, PDF.js, and `remark-gfm` in VinGrade.
- Expected: use the exact package-lock version as current baseline.
- Actual: current version is `null`; target versions already installed are
  treated as uncertain registry facts.
- Product impact: unnecessary provider work, unknown risk, and no keep-current
  decision.
- Evidence: `FE/package-lock.json` versus `version-analysis.json`.

#### H-02 — Unsupported Python usage can be presented as not impacted

- Reproduction: the LangSmith breaking finding in the online run.
- Expected: usage coverage unknown because no Python analyzer exists.
- Actual: `DEPENDENCY_NOT_USED`, `NOT_IMPACTED`; VinGrade imports and uses
  `langsmith.Client`.
- Product impact: false repository-risk confidence.
- Evidence: `repository-impact-evidence.json`, VinGrade
  `evaluation/langsmith/*.py`, capture `007`.

#### H-03 — Package-level provider/output failures can look successful

- Reproduction: invalid structured-response capture and the real provider
  credit exhaustion.
- Expected: nonzero or explicit partial-success exit with failed package and
  recovery action in CLI output.
- Actual: exit 0 and “AI Version Analysis complete”; failed result exists only
  in JSON. The full run also exits 0 with 8 failed dependencies.
- Product impact: CI or a developer can treat incomplete analysis as success.
- Evidence: captures `007` and `010`.

### Medium

#### M-01 — Runtime identity is not self-contained in analysis artifacts

- Reproduction: inspect the saved Version Analysis and Migration Checklist
  artifacts from capture `007`.
- Expected: saved provider, model, runtime mode, and qualification status.
- Actual: console checklist presentation shows that identity, while the JSON
  retains only UpgradeLens generator identity and lineage.
- Product impact: a later reviewer cannot independently establish which AI
  runtime produced the saved result.
- Evidence: capture `007`; `version-analysis.json`;
  `migration-checklist.json`.

#### M-02 — Failure recovery guidance is inconsistent

- Reproduction: run the missing-upstream, missing-configuration, and invalid-
  lineage scenarios.
- Expected: stage name, plain-language cause, and a concrete safe next step.
- Actual: missing upstream input exposes a raw `ENOENT` path; missing
  configuration names a variable; lineage failure gives no next command.
- Product impact: recovery depends on internal CLI knowledge.
- Evidence: captures `004`, `008`, and `009`.

#### M-03 — Duplicate occurrences are hard to distinguish in Markdown

- Reproduction: open the two `langchain-openai` sections in the VinGrade
  Markdown report.
- Expected: occurrence labels that identify manifest, declaration, or context.
- Actual: JSON identity is correct, but duplicate headings omit declared
  version, manifest occurrence, and context ID.
- Product impact: a reviewer can attach a result to the wrong declaration.
- Evidence: capture `007`; `repository-impact.md`;
  `version-analysis.json`.

#### M-04 — The required review report is publishable by default

- Reproduction: run the post-report npm pack in capture `018`.
- Expected: internal review reports excluded unless they are intentional
  public package documentation.
- Actual: the package includes `docs/**` except CLI-capture trees, so this
  report is present in the 209-file tarball.
- Product impact: internal review conclusions can be published unintentionally.
- Evidence: captures `018` and `019`.

### Low

#### L-01 — Snapshot directory name becomes the repository name

- Reproduction: run discovery from the isolated `vingrade-online` snapshot.
- Expected: repository identity derived from project metadata or clearly
  labeled as the directory name.
- Actual: the displayed repository name is `vingrade-online`, not VinGrade.
- Product impact: report identity is noisy in temporary and CI workspaces.
- Evidence: captures `005` and `007`.

#### L-02 — Help is command-first rather than outcome-first

- Reproduction: run the packaged `--help` smoke test.
- Expected: the primary upgrade decision, risk, and roadmap outcomes are
  explained before diagnostic commands.
- Actual: commands and artifact contracts dominate the help output.
- Product impact: a first-time user must infer the intended product workflow.
- Evidence: capture `014`.

#### L-03 — Final summary omits the best next action

- Reproduction: inspect the online and empty-cache offline final summaries.
- Expected: name the unavailable or failed dependency and state the most useful
  safe recovery step.
- Actual: summaries show aggregate counts and artifact paths only.
- Product impact: the developer must open JSON before knowing what to do next.
- Evidence: captures `003` and `007`.

### Future scope

- Cross-model comparison once a second valid model configuration exists.
- Explicit framework/core/small/internal/transitive classification.
- Historical trend presentation using the existing stable identities.

## 9. Over-engineering Assessment

### Complexity that should remain

- strict schemas and invariant validation;
- exact-byte lineage and canonical identities;
- atomic private artifact writers;
- occurrence-level identity;
- fail-closed provider and trust behavior;
- qualification integrity and exact runtime matching;
- deterministic progress and controlled cancellation;
- evidence freshness and cache state.

These controls directly prevent unsupported recommendations and corrupted
handoffs.

### Complexity that should be hidden from the default user

- qualification IDs and identity digests;
- internal reason codes when a plain-language next step exists;
- evaluation, scorecard, benchmark, conformance, and governance commands in
  the primary help path;
- the eight-artifact implementation chain.

The default CLI should present decisions, reasons, risks, and next steps, then
link to diagnostic details.

### Complexity not yet proving product value

Migration Planning has extensive schemas, qualification policy, prompt
identity, evaluation criteria, trust validation, and artifact lineage. In the
representative workflow this complexity produced zero grounded actions and a
handoff that still required full repository investigation.

This does not justify removing the safety architecture. It means default
enablement and further abstraction should wait until the product can produce
a useful, evidence-bounded roadmap on representative repositories.

## 10. Release Recommendation

**`NO_GO`**

Automated regression, packaging, integrity, privacy, and provider
qualification gates pass. Those results establish engineering safety; they do
not establish product alignment.

For a v0.5.0 release positioned as full dependency-upgrade intelligence with
AI Migration Planning, the real workflow must first:

1. know the actual baseline;
2. state whether to upgrade, keep, or investigate;
3. avoid non-impact claims outside analyzer coverage;
4. produce an implementation-usable bounded roadmap; and
5. signal partial provider failure correctly.

Migration Checklist should remain experimental.

## 11. Next Tasks

1. Resolve exact current versions from supported lockfiles and environments,
   then prove React and `remark-gfm` already-at-target decisions.
2. Add a deterministic decision layer and outcome-first console/Markdown
   summary: upgrade now, plan, keep, insufficient evidence, or not analyzed.
3. Make repository-impact conclusions coverage-aware by ecosystem; never emit
   dependency-not-used/not-impacted when the language has no analyzer.
4. Define and validate a bounded handoff roadmap containing evidence-supported
   actions, areas, verification, approvals, and ordering; keep Migration
   Checklist experimental until it passes a real-project handoff test.
5. Make partial provider/output failures explicit in exit semantics and CLI
   recovery guidance, while retaining successful occurrence results.
