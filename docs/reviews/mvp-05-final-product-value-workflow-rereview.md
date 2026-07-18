# UpgradeLens MVP-05 — Final Product Value & Workflow Re-review

## 1. Executive Verdict

**`PARTIAL_MATCH`**

The remediation changes the supported workflow materially: UpgradeLens now
resolves installed baselines, distinguishes analyzer coverage from non-use,
persists a deterministic upgrade decision, projects product completion before
diagnostics, and can produce an evidence-bounded Coding Agent handoff for an
explicitly selected target.

| Decision | Result |
| --- | --- |
| Product workflow readiness | **Ready with known limitations** |
| CLI readiness | **Ready with one High selector limitation** |
| Coding Agent handoff readiness | **`PASS` / ready for review-gated planning** |
| Migration Checklist v2 | **Real-provider qualified, still experimental** |
| v0.5.0 release readiness | **`GO_WITH_KNOWN_LIMITATIONS`** for CLI/product core |

The workflow is not a registry-latest auto-upgrader, an autonomous Coding
Agent, or proof that a migration is safe. A discovered newer version becomes
`INVESTIGATE` unless another deterministic driver exists. An explicit
human-selected target can become `PLAN_UPGRADE`; every implementation action
still requires source inspection and approval.

The remaining release-relevant defect is fail-closed rather than unsafe:
duplicate occurrences that differ only by declared version can produce
identical retry selectors. This blocks selecting that exact occurrence but
does not silently fan out or select the first match.

## 2. Environment and Scope

| Item | Value |
| --- | --- |
| Branch | `feat/mvp-05-evidence-migration-checklist` |
| Commit before review | `e1ff3b38f42bfb34bb052e03a11645b17b8b892f` |
| Package | `upgradelens@0.4.0` |
| Node.js / npm | `v26.0.0` / `11.12.1` |
| Platform | macOS arm64 |
| UpgradeLens target | Current dirty working tree, reviewed without overwriting existing changes |
| Representative repository | VinGrade clean archive at `25811ef997fcf45810105e89e4500688f28f7ba5` |
| Generic repositories | Isolated single-Node, scoped-package, ambiguity, and polyglot shapes |
| Provider / model / adapter | `openai-compatible` / `openai/gpt-5.5` / `openai-compatible` |
| Qualification | `QUALIFIED`, ID `sha256:4fa4954d6f254d94859bce17aec6209394d380e4635155a6f3ce23a7e9b70765` |
| Capture directory | `.upgradelens/review/mvp-05-final-rereview/` (git-ignored) |
| Capture manifest digest | `sha256:a507c9576bb8ee107d49e163899e05fe9c8aef863402fc3f4b8a363b66d06dad` |

The working tree already contained the completed MP-R01–MP-R05 remediation
and earlier review material. This review created only this report and ignored
captures. It did not change production source, schema, tests, fixtures,
target repositories, version, git history, or credentials.

All target executions used clean isolated snapshots and the clean-installed
tarball. Captures contain safe commands, exit status, stdout/stderr, duration,
completion/count metadata, and artifact inventory where applicable. Provider
request bodies and secrets were not retained.

One canonical-suite test was skipped because the sandbox could not expose the
local loopback listener needed by the online CLI keep-alive lifecycle test.
It is reported as skipped, not passed. No required workflow scenario was
blocked: cancellation was reproduced with exit 130, and a bounded real-provider
positive run completed.

## 3. Baseline Comparison

| Area | Before remediation | Current result |
| --- | --- | --- |
| Executive verdict | `PARTIAL_MATCH` | `PARTIAL_MATCH`, now because of bounded residual gaps rather than missing core outcomes |
| Feature alignment | 5 MATCH / 6 PARTIAL / 4 NOT | **11 MATCH / 3 PARTIAL / 0 NOT / 1 OUT OF SCOPE** |
| Installed baseline | Lockfile not resolved | npm lockfile v1/v2/v3 exact version and workspace ownership are resolved; unavailable ecosystems fail closed |
| Python usage | Unsupported coverage could become unused/not impacted | `ANALYZER_UNAVAILABLE` produces coverage unavailable and never verified non-use |
| Upgrade decision | No clear keep/plan/investigate outcome | Policy 1.1.0 persists `KEEP_CURRENT`, `PLAN_UPGRADE`, `INVESTIGATE`, insufficient, and not-analyzed outcomes |
| Migration handoff | No implementation-usable handoff | Explicit positive target produced grounded action, affected source, validation commands, limitations, and approval boundary |
| Provider/output failure | Package-local failure could look fully successful | Retained failure projects `PARTIAL`, lists the failed occurrence and recovery, exits 2 |
| CLI hierarchy | Counts/artifacts before decision | Product completion and decisions lead; diagnostics/artifacts follow |
| Coding Agent | `NOT READY` | **`PASS`** without external re-research |
| Release | `NO_GO` | **`GO_WITH_KNOWN_LIMITATIONS`** for core; experimental handoff remains opt-in |

The current score is not based on schema-field presence alone. Each MATCH
below is supported by current source plus packaged runtime output or focused
runtime tests.

## 4. Workflow Results

| Scenario | Completion | Decisions | Handoff | Exit | Verdict |
| --- | --- | --- | --- | ---: | --- |
| A. Default registry | `COMPLETED_WITH_REVIEW` | 1 `INVESTIGATE`; 0 plan | No fabricated action | 0 | MATCH |
| B. Explicit target, controlled public run | `COMPLETED_WITH_REVIEW` | 1 `PLAN_UPGRADE` / `USER_SELECTED_TARGET` | 1 actionable with review | 0 | MATCH |
| B. Explicit target, real provider | `COMPLETED_WITH_REVIEW` | 1 `PLAN_UPGRADE` | 2 grounded items, 1 location, verification available | 0 | MATCH |
| C. Scoped npm selector | Selector parsed `npm:@scope/package` without splitting on `@`; package absent | None | None | 1 | MATCH for scoped parsing/fail-closed behavior |
| D. Different-project ambiguity | Unqualified selector rejected; qualified project/manifest selectors pass focused tests | None | None | 1 when ambiguous | PARTIAL because same-manifest duplicates cannot be uniquely retried |
| E. Polyglot coverage | Unsupported Python coverage remains unavailable | No false unused/not-impacted decision | No fabricated action | 0 in empty-cache run | MATCH |
| F. Installed baseline | Exact lockfile baseline; same installed/target becomes keep | `KEEP_CURRENT` where equal | `NO_VERSION_CHANGE_REQUIRED` | Contract verified | MATCH |
| G. Provider/output partial | `PARTIAL` | 1 keep retained, 1 not analyzed | Failed occurrence and recovery retained | 2 | MATCH |
| H. Insufficient data | `INSUFFICIENT_DATA` | 1 insufficient, no recommendation | No action | 0 default / 2 strict | MATCH |
| I. Offline valid cache | `COMPLETED_WITH_REVIEW` | 1 investigate | No invented external claim | 0 | MATCH |
| I. Offline empty cache | `INSUFFICIENT_DATA` | No fabricated decision/action | No action | 0 default / 2 strict | MATCH |
| J. Cancellation | `CANCELLED` | Successful completion not published | None | 130 | MATCH |
| VinGrade current empty-cache public run | `INSUFFICIENT_DATA` | 47 `NOT_ANALYZED` | 47 `NOT_ANALYZED`, 0 action | 0 | MATCH |
| VinGrade persisted partial replay | `PARTIAL` | 9 keep, 8 investigate, 19 insufficient, 11 not analyzed | 0 action | 2 | MATCH for retained-failure projection |

The controlled generic captures invoke the public `runCli` path from the
clean-installed package while supplying bounded validated upstream stage
results; they are not represented as real-provider runs. Capture 015 is the
separate real-provider public positive run. VinGrade capture 018 replays the
representative persisted decision chain through the current public completion
boundary; it is not a fresh 47-occurrence provider run.

The VinGrade empty-cache run reconciled 2 projects and 47 occurrences. Exact
lockfile baselines included PDF.js `6.1.200`, React `19.2.7`, React DOM
`19.2.7`, and `remark-gfm` `4.0.1`. LangSmith/Python remained
`NOT_ANALYZED` with `ANALYZER_UNAVAILABLE`, not unused or verified
`NOT_IMPACTED`. Cached offline research resolved 45 fresh package sources,
left 1 unavailable, recorded 1 warning, and made 0 external calls.

The completion/exit matrix was exercised:

| Product outcome | Default | Strict |
| --- | ---: | ---: |
| `COMPLETED` | 0 | 0 |
| `COMPLETED_WITH_REVIEW` | 0 | 2 |
| `PARTIAL` | 2 | 2 |
| `INSUFFICIENT_DATA` | 0 | 2 |
| `FAILED` | 1 | 1 |
| `CANCELLED` | 130 | 130 |

Zero actions, all-keep outcomes, and trustworthy `INVESTIGATE` outcomes do not
fail by themselves. A provider/output/runtime failure has precedence over
successful counts. Strict mode only changes the process exit; it does not
rewrite persisted decisions.

## 5. Three Product Questions

### Should a dependency move to the evaluated target?

The answer is now explicit and conditional. A registry-discovered newer
version alone yields `INVESTIGATE`, not a recommendation. Equal installed and
target versions yield `KEEP_CURRENT`. In the positive workflow, the human
selected React `2.0.0` from installed `1.0.0`, so the deterministic decision
was `PLAN_UPGRADE` with driver `USER_SELECTED_TARGET`.

### Why, and what is the repository-specific risk?

The selected target was considered because it was explicitly chosen and
target-scoped official evidence described a breaking `oldApi` to `newApi`
change. The repository evidence located the `oldApi` import/call in
`src/main.js`. The handoff retained `HIGH_RISK`, source coverage, official
provenance, and the limitation that extractive provenance does not prove
semantic applicability or runtime safety.

### What handoff is available?

After human approval, inspect `src/main.js`, replace `oldApi` with `newApi`
before changing React to `2.0.0`, then run the project-derived
`npm run build` and `npm run test`. These commands are available but not
executed by UpgradeLens. The checklist explicitly lacks a recovery plan; a
Coding Agent must define rollback and improve behavioral test coverage before
implementation approval.

## 6. Feature Alignment Matrix

| Feature | Verdict | Evidence | User impact | Release relevance |
| --- | --- | --- | --- | --- |
| Dependency Inventory | **MATCH** | Current discovery plus VinGrade capture: 2 projects/47 exact occurrences; lockfile versions remain separate from declarations | Teams know what is declared and installed per occurrence | Core ready |
| Upgrade Detection | **MATCH** | Default registry capture identifies a newer target but projects `INVESTIGATE` | Attention is visible without implying approval | Core ready |
| Upgrade Recommendation | **MATCH** | Policy 1.1.0 and captures produce keep/plan/investigate/insufficient/not-analyzed deterministically | Lead receives a direct decision | Core ready |
| Reason and Evidence | **MATCH** | Decision driver, reason, official evidence provenance, freshness, and limitations survive to artifacts/output | Reviewers can audit why a decision exists | Core ready |
| Repository Risk Assessment | **MATCH** | Positive Node affected area is retained; unsupported Python coverage is unavailable rather than non-use | Supported findings are useful; unsupported coverage is honest | Core ready |
| Dependency Classification | **PARTIAL_MATCH** | Direct dependency type/ecosystem/project are preserved, but framework/core/small/transitive planning classes are absent | Enough occurrence context for current planning, not richer portfolio grouping | Non-blocking |
| Prioritization | **OUT_OF_SCOPE_FOR_V0_5_0** | No rank, urgency score, or ordered multi-dependency queue | Teams order accepted work themselves | Future interface/product layer |
| Migration Handoff | **MATCH** | Real positive checklist contains installed→target, selected official action, affected source, project commands, limitations, and review gate | Coding Agent can start bounded planning | Experimental but usable |
| Human Review | **MATCH** | Explicit approval language and `ACTIONABLE_WITH_REVIEW`; no automatic source/dependency edit | Human remains the authorization boundary | Core invariant ready |
| Coding Agent Handoff | **MATCH** | Independent agent answered all requested questions from source + checklist only | No external docs/version/impact re-research was needed | Ready for planning |
| Model Transparency | **PARTIAL_MATCH** | CLI/resolver and qualification record expose exact provider/model/adapter/qualification ID, but the checklist JSON itself does not embed that runtime identity | Audit is possible with the qualification record, not from the standalone checklist | Keep experimental |
| Evidence Freshness | **MATCH** | Cached/fresh/unavailable source state is explicit; exact qualification binds prompt/candidate/runtime | Offline and provider claims are bounded in time and identity | Core ready |
| Offline Readiness | **MATCH** | Valid-cache and empty-cache captures made zero external calls and invented no latest/security/support claims | Private/offline use fails safely | Core ready |
| Continuous Tracking Readiness | **MATCH** | Stable occurrence/decision IDs, artifact digests, lineage, and deterministic replay tests | Runs can be compared and tampering rejected | Core ready |
| CLI-first Delivery | **PARTIAL_MATCH** | One packaged `analyze` command is decision-first and CI-friendly; duplicate same-manifest selector retries remain unusable | Main path is usable; one exact-selection shape is blocked | High known limitation |

**After: 11 MATCH / 3 PARTIAL_MATCH / 0 NOT_MATCH /
1 OUT_OF_SCOPE_FOR_V0_5_0.**

## 7. CLI UX Review

The packaged CLI now leads with `UpgradeLens product outcome`, then decisions,
handoff/next step, and only then diagnostics and artifact paths. Raw internal
reason codes are hidden from default presentation. This is a material
decision-first improvement over the previous counts-first output.

Default registry UX correctly says that availability is not a recommendation
and points to `--target`. Explicit target UX persists target origin and exposes
the recommendation driver. Invalid target and ambiguous selector errors fail
before provider work. Partial completion lists failed occurrences and a
specific recovery step. Strict mode is suitable for CI without changing
artifact semantics.

The exact captures are under
`.upgradelens/review/mvp-05-final-rereview/`:

- 001–002: packaged help/version.
- 003–004: default and explicit-target public workflows.
- 005–007: scoped, ambiguous, and invalid target selectors.
- 008–013: partial, insufficient, offline cached/empty, strict, cancellation.
- 014: clean-installed packaged CLI.
- 015: real-provider explicit positive.
- 016–018: VinGrade empty-cache, cached research, and partial replay.

The primary UX limitation is the High selector issue described in section 11.
The CLI fails closed, but its displayed candidates can be identical and
therefore cannot guide the user to a resolvable exact selector.

## 8. Coding Agent Handoff

An independent Coding Agent received only:

- an isolated source snapshot containing `package.json` and `src/main.js`;
- the Migration Checklist v2 from the real-provider explicit-target workflow.

It received no network/web/MCP access, raw upstream UpgradeLens artifacts,
prior reports, or source modification authority.

**Verdict: `PASS`.** The Agent recovered React `1.0.0 → 2.0.0`, explained the
explicit-selection driver and official breaking evidence, identified
`oldApi → newApi`, located the import and call in `src/main.js`, and identified
the package declaration. It correctly treated `npm run build` and
`npm run test` as available but not run.

No external re-research was required. Source inspection was still required
before patch planning, which is the intended division of responsibility. The
Agent did not invent or perform source edits. It placed API-semantic checks,
lockfile generation, installation, validation execution, behavioral tests,
and rollback definition outside the supplied handoff.

The approval/recovery boundary remained clear: human approval is required;
the checklist does not authorize code changes, does not verify semantic
applicability, and provides no recovery plan. The isolated snapshot also did
not contain the referenced lockfile, so installed-baseline provenance could
be read from the checklist but not independently revalidated by the Agent.

## 9. Offline and Model/Provider Review

With a valid offline cache, the workflow reused cached evidence, reported
freshness, made no external call, and produced a review outcome rather than
inventing a latest/security/support claim. With an empty cache, it abstained,
reported `INSUFFICIENT_DATA`, and gave an online refresh/explicit validated
target next step. VinGrade behaved the same way at representative scale.

The persisted real-provider qualification matched:

- provider/model/adapter:
  `openai-compatible / openai/gpt-5.5 / openai-compatible`;
- qualification ID:
  `sha256:4fa4954d6f254d94859bce17aec6209394d380e4635155a6f3ce23a7e9b70765`;
- prompt version `2`;
- candidate schema digest:
  `sha256:6ac9e1477e206ab082ac38cdb263254c996ee4684e04c80af6b9a08ceae0375d`;
- verdict `QUALIFIED`.

The positive path was rerun against that exact real runtime. It made 2
requests, observed 0 hidden retries, had 0 retained failures, and completed in
6.987 seconds. The result was `PLAN_UPGRADE` and
`ACTIONABLE_WITH_REVIEW`. No fake runtime is used to claim real qualification.

Qualification matching is exact across task/dataset/criteria/policy/prompt,
candidate schema, and runtime identity. A compatible model is not silently
treated as qualified. The deterministic v2 envelope is part of the bound
candidate/prompt scope rather than an untracked equivalence.

**Default-enablement decision: keep Migration Checklist v2 experimental.**
Real qualification removes the positive-path qualification blocker, but
semantic applicability remains unverified, recovery evidence is absent, and
runtime identity is not self-contained in the checklist artifact. These are
not blockers for the deterministic CLI/product core release.

## 10. Completion Threshold Assessment

Product completion schema `1.0.0` implements a documented closed-state
projection. Precedence is:

1. any retained version/provider/output/runtime or action-generation failure
   → `PARTIAL`;
2. an explicitly selected insufficient target, or strictly more than half of
   all occurrences unanswered → `INSUFFICIENT_DATA`;
3. a valid review-bearing result → `COMPLETED_WITH_REVIEW`;
4. otherwise → `COMPLETED`.

The architecture document states the rule, and runtime tests cover the closed
statuses, default/strict exits, explicit-target insufficiency, and failure
precedence. The code uses an exact `unansweredCount * 2 > occurrenceCount`
comparison, so 50% is not a majority.

The policy still has a product discontinuity: 49% unanswered produces a
review/completed projection while 51% produces `INSUFFICIENT_DATA`, even when
the unanswered absolute count differs by only one. No direct 49%/50%/51%
boundary test was found. The semantics also scale mathematically but do not
express whether one critical unanswered dependency outweighs many answered
minor dependencies.

Selected explicit-target insufficiency correctly has precedence, so unrelated
unselected occurrences cannot hide it. Provider failure always overrides the
threshold. The current rule is deterministic and safe, but its user-facing
rationale and boundary coverage are Medium product/technical debt. It is not
a core release blocker because it changes the completion label and strict
exit, not the persisted dependency decisions.

## 11. Defects and Gaps

### Blocker

None found for the CLI/product core release.

### High — Exact selector cannot disambiguate same-manifest duplicates

- **Reproduction:** Run an unqualified target selector where the same canonical
  package appears twice in one project, manifest, and dependency type but with
  different declared versions; VinGrade's duplicate
  `pypi:langchain-openai` occurrence reproduces it.
- **Expected:** Stable candidate guidance contains a selector field that makes
  each occurrence uniquely selectable.
- **Actual:** Occurrence identity includes declared version, but target-selector
  grammar does not. The error prints two identical retry selectors, and either
  retry remains ambiguous.
- **Product impact:** The public explicit-target path is unavailable for that
  occurrence shape. It fails closed—there is no wrong first-match selection or
  fan-out—but a user cannot proceed without changing the manifest or product.
- **Evidence:** Capture
  `006-ambiguous-monorepo-selector/`, `src/target-selector.js`, and the
  occurrence-identity tests.

### Medium — Completion majority boundary lacks direct boundary coverage

- **Reproduction:** Project completion with 49%, 50%, then 51% unanswered
  non-failed occurrences.
- **Expected:** A versioned, user-explainable boundary with direct tests for
  behavior immediately around it.
- **Actual:** The rule is documented and deterministic, but focused tests cover
  representative statuses rather than the 49/50/51 boundary.
- **Product impact:** A one-occurrence change can alter completion/strict-exit
  semantics without changing any individual decision.
- **Evidence:** `src/product-completion.js`, MP-R05 architecture, and
  `test/product-completion-cli.test.js`.

### Medium — Checklist runtime identity is not self-contained

- **Reproduction:** Give a reviewer only the generated
  `migration-checklist.json`.
- **Expected:** If model transparency is claimed for the standalone handoff,
  it should identify or directly link its exact qualified runtime.
- **Actual:** The CLI resolver and separate persisted qualification record show
  provider/model/adapter and qualification ID, but Checklist v2 contains
  generator and input lineage, not runtime/qualification identity.
- **Product impact:** A standalone shared checklist cannot independently prove
  which qualified runtime selected its action.
- **Evidence:** Real-provider checklist and capture 015 metadata.

### Low — Verification availability can be over-read

- **Reproduction:** Read `verificationStatus: AVAILABLE` without the command
  execution state.
- **Expected:** Users understand that project-derived commands exist but have
  not been executed.
- **Actual:** The detailed handoff preserves the state, and the Coding Agent
  interpreted it correctly; compact consumers could still over-read
  “available” as “passed.”
- **Product impact:** Presentation risk only; no test success is fabricated.
- **Evidence:** Real-provider checklist and Coding Agent reassessment.

### Future scope

Dependency portfolio classification, prioritization/ranking, dashboard/MCP/IDE
interfaces, autonomous patching, and automatic rollback are not implemented.
They are not required for the v0.5.0 CLI-first positioning.

## 12. Over-engineering Assessment

Complexity that directly protects the product outcome should remain:

- exact occurrence identity and fail-closed selection;
- artifact lineage/digests and tamper rejection;
- ecosystem-scoped coverage and installed-baseline provenance;
- deterministic decision/completion precedence;
- provider qualification bound to runtime/prompt/candidate identity;
- extractive action selection, limitations, and human-review gates.

Complexity that should stay behind the default CLI:

- raw reason codes, schema/digest detail, qualification matching diagnostics,
  stage-level counters, and provider envelope internals;
- governance/evaluation/benchmark machinery used to qualify an experimental
  model path.

The default user normally needs the Markdown report, persisted Upgrade
Decision, and—only for an eligible selected target—the Migration Checklist.
Most raw chain artifacts are audit/debug inputs, not documents a planning
meeting should open.

The product still exposes many separately runnable stages, but the supported
`analyze` command hides that orchestration adequately. The largest
not-yet-demonstrated product layers are classification and prioritization;
they should remain future scope rather than trigger a rewrite. Dashboard,
MCP, and IDE surfaces are also future interfaces, not MVP requirements.

## 13. Tests and Validation

| Validation | Result |
| --- | --- |
| Canonical `npm test` | **603 passed, 0 failed, 1 skipped; 604 total** |
| Canonical skip | Online CLI keep-alive lifecycle; local loopback listeners unavailable in sandbox |
| Focused MP-R01–MP-R05 | **82 passed, 0 failed, 0 skipped** |
| Invariant/tamper/determinism group | **188 passed, 0 failed, 0 skipped** |
| Package content guard | **Passed:** 225 files after adding this report, 0 capture evidence, 20 required assets |
| `git diff --check` | **Passed** |
| Actual `npm pack` | **Passed:** `upgradelens-0.4.0.tgz` |
| Clean install from tarball | **Passed** |
| Packaged `--version` / `--help` | **Passed** |
| Clean-installed public exports | **437** |
| Forbidden packaged names | **None:** no `.env`, `.upgradelens`, review capture, or qualification input |
| CLI captures | **18 entries**, sequential and manifest-validated |
| Cancellation | **Passed**, controlled exit 130 |
| Real-provider positive | **Passed:** 2 requests, 0 hidden retry, 0 failure, qualified runtime |

Focused coverage included supported lockfile/workspace resolution, unsupported
coverage fail-closed behavior, impact evidence, target selection, policy
1.1.0, product completion/exit semantics, migration context/contract/eval v2,
extractive generation, orchestration, qualification, package governance,
tamper rejection, and deterministic replay.

Three generic repository shapes were covered: a single Node explicit-positive
workflow, supported/unsupported polyglot coverage, and monorepo/different-project
ambiguity with qualified selection. The additional VinGrade duplicate capture
exposed the same-manifest selector gap rather than masking it.

The canonical skip is not counted as a pass. There were no blocked required
workflow scenarios. VinGrade's partial chain was replayed from persisted
representative artifacts rather than funded and rerun through all 47 current
provider contexts; the current real-provider acceptance was instead bounded
to the explicit-positive qualified path.

## 14. Release Recommendation

**`GO_WITH_KNOWN_LIMITATIONS`**

For the CLI/product core, the previous release blockers are resolved:
installed versions are trustworthy where supported, coverage limitations do
not become non-use, recommendation semantics are deterministic, partial
provider failure cannot masquerade as full success, and the CLI communicates
the product decision first. The High selector gap is narrow, reproducible, and
fail-closed; it should be documented and fixed promptly, but it does not
create a wrong recommendation or unauthorized migration.

For Migration Checklist v2 default enablement: **do not enable by default**.
Keep it opt-in and experimental. The exact real-provider path is now qualified
and its Coding Agent handoff passes, but semantic applicability, recovery
planning, and standalone runtime identity remain bounded limitations.

This recommendation does not authorize a version bump, merge, tag, push,
release, target-repository modification, or dependency migration.

## 15. Next Tasks

1. Extend target-selector grammar and stable candidate guidance with a field
   that uniquely resolves same-project/same-manifest/same-type duplicates;
   add the VinGrade-shaped regression.
2. Add direct 49%/50%/51% completion-threshold tests and document the
   user-facing rationale without changing the policy in this review.
3. Make the experimental checklist self-identify or directly link its exact
   qualification/runtime identity.
4. Clarify compact verification UX as “commands available, not executed.”
5. Keep default enablement gated until recovery semantics and semantic
   applicability expectations have an explicit product decision.
