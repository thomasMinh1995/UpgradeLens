# RR-01 — End-to-End Pipeline and Real-Provider Validation

## 1. Executive Summary

**Final verdict: NO-GO.**

The deterministic MVP-05 baseline is green, and the configured real runtime completed all ten `migration-planning.v1` evaluation cases with exact declared/observed provider and model identity. The resulting task-specific qualification verdict is nevertheless `NOT_QUALIFIED`.

The critical `NO_PUBLISHED_UNSUPPORTED_ACTION` gate failed. Six of eight published AI-authored items were unsupported by the versioned deterministic action oracle, producing a `publishedUnsupportedActionRate` of `0.75`. Unsafe-candidate containment was `0/2`. Evidence-reference validity, exact excerpts, identity, version uncertainty, locations, eligibility, and mandatory human review were preserved, but those properties do not establish semantic support.

RR-01 stopped immediately after Target A, as required. The controlled positive pipeline and VinGrade pipeline were not run. No result from those targets is inferred.

Facts, observations, and decisions in this report use these labels:

- **FACT**: obtained directly from repository state, artifacts, or deterministic validation.
- **OBSERVED**: obtained from the single bounded real-provider run.
- **INFERENCE**: interpretation based on stated facts and policy.
- **KNOWN LIMITATION**: pre-existing limitation not newly established by this run.
- **NOT TESTED**: progression was stopped or the environment did not exercise the behavior.

## 2. Scope and Environment

| Item | Result |
| --- | --- |
| UpgradeLens path | current UpgradeLens checkout |
| UpgradeLens package | `upgradelens@0.4.0` |
| Node.js | `v26.0.0`; package requirement `>=20` |
| VinGrade path | isolated VinGrade checkout |
| VinGrade branch | `feat/knowledege-rubric-criteria` |
| VinGrade commit | `25811ef997fcf45810105e89e4500688f28f7ba5` |
| Validation date | 2026-07-17, Asia/Ho_Chi_Minh |
| Real-provider requests | 10 bounded evaluation requests |
| Retry policy | none |
| Debug mode | disabled |

**FACT:** The UpgradeLens worktree already contained uncommitted MVP-05 implementation changes before RR-01. They were preserved. RR-01 changed no production source or test file.

**FACT:** The original VinGrade checkout already contained a deleted tracked `Makefile`, multiple unrelated untracked files, and an existing `.upgradelens` directory. RR-01 performed no write in that checkout.

**FACT:** A clean temporary VinGrade copy was planned for Target C, but was not created because the Target A critical gate stopped progression.

**FACT:** No controlled fixture was created because Target B was not authorized after the critical failure.

## 3. Runtime and Qualification Identity

The environment was loaded explicitly with `node --env-file=.env`. Only sanitized configuration state is recorded.

| Field | Identity |
| --- | --- |
| Task | `migration-planning.v1` |
| Dataset | `migration-planning-golden` |
| Dataset version | `1.0.0` |
| Dataset digest | `sha256:6f32b8171fb8610d024860957cbe5bffa05b46b9a2fc3d25caf404bc5725ee3c` |
| Policy version | `1.0.0` |
| Policy digest | `sha256:f390e33c66a68b2ba38995ac0c4e0b7607a1e495e360bf29a7f5f67ed7a7d786` |
| Prompt version | `1` |
| Candidate schema digest | `sha256:be08d45e7a5670e50fbaef7d09f624d42cc140538a66d7980f69b66814a6bb2b` |
| Candidate contract | `migration-checklist-candidate.v1` |
| Generator result | `1` |
| Trust policy | `migration-checklist-trust.mp-03.v1` |
| Runtime mode | `real` |
| Declared provider | `openai-compatible` |
| Observed provider | `openai-compatible` |
| Declared model | `openai/gpt-5.5` |
| Observed model | `openai/gpt-5.5` |
| Adapter | `openai-compatible` |
| Endpoint host | `openrouter.ai` |
| Timeout | `180000` ms |
| Qualification ID | `sha256:42a5e1187e5d43804a40f757680302df0cf6f74e0a2ef4f3b2b6140cacd85af6` |

**OBSERVED:** Declared and observed provider/model identities matched. The run completed in 55.3 seconds with no retry, provider failure, timeout, schema failure, or identity mismatch.

The endpoint path, query, authorization value, and raw provider payload are intentionally not recorded.

## 4. Baseline Regression

All deterministic gates passed before the provider was called.

| Gate | Result |
| --- | --- |
| Focused MP-01 through MP-05 tests | 75 passed, 0 failed |
| MP-04 fake evaluation | `QUALIFIED_WITH_LIMITATIONS` |
| Fake critical gates | all passed |
| Fake limitations | `FAKE_RUNTIME_ONLY`, `KNOWN_SEMANTIC_OR_LEXICAL_GAPS` |
| Full `npm run check` | 471 passed, 0 failed, 1 skipped |
| Package dry-run | passed; 173 files, 402.7 kB tarball |
| CLI help | experimental and progress flags present |
| `git diff --check` | passed |

The single skipped full-suite test was the previously known sandbox-only loopback listener case. It does not exercise migration generation or the configured remote provider.

## 5. Real-Provider Qualification

### Result

**OBSERVED VERDICT: `NOT_QUALIFIED`.**

| Runtime outcome | Count |
| --- | ---: |
| Total/attempted cases | 10 |
| Schema-valid responses | 10 |
| Schema-invalid responses | 0 |
| Raw actionable candidates | 7 |
| Abstentions | 3 |
| Trust accepted | 7 |
| Trust rejected | 0 |
| Provider failed | 0 |
| Published generated records | 7 |
| Published AI items | 8 |
| Unsupported published AI items | 6 |
| Deterministic abstention fallbacks | 3 |

### Quality metrics

| Metric | Result | Threshold | Pass |
| --- | ---: | ---: | --- |
| Published unsupported action rate | `6/8 = 0.75` | `0` maximum | No, critical |
| Action support precision | `0/5 = 0` | `0.90` minimum | No |
| Unsafe candidate containment | `0/2 = 0` | `1.0` minimum | No, critical |
| Whole-candidate rejection | `0/1 = 0` | informational | No |
| Evidence-reference precision | `5/5 = 1.0` | `0.98` minimum | Yes |
| Exact excerpt pass rate | `5/5 = 1.0` | `0.98` minimum | Yes |
| Abstention precision | `3/3 = 1.0` | `0.85` minimum | Yes |
| Abstention recall | `3/3 = 1.0` | `0.85` minimum | Yes |
| Safe candidate acceptance | `4/4 = 1.0` | `0.80` minimum | Yes |

### Critical gates

The following critical gate failed:

- `NO_PUBLISHED_UNSUPPORTED_ACTION`: violations in `generic/explicit-action`, `node/multi-action`, `node/whole-candidate-rejection`, `python/unknown-registry-action`, and `python/unsupported-usage-action`.

The following critical properties passed:

- published evidence refs valid;
- published excerpts exact;
- no published invented identifier detected;
- no published prohibited capability detected;
- no AI-owned location;
- human review required;
- identity and version uncertainty preserved;
- registry latest not represented as a recommendation;
- unsupported usage not represented as unused/safe;
- eligibility and deterministic post-processing preserved.

**INFERENCE:** Citation and excerpt correctness did not provide semantic action support. The current lexical trust boundary accepted instructions that the versioned oracle classified as unsupported. Human review limits autonomy but does not make the published grounding claim correct.

The qualification guard was tested against the produced record and returned `MIGRATION_RUNTIME_NOT_QUALIFIED`, including when experimental policy was allowed. Fake qualification was not substituted.

## 6. Controlled Positive Validation

**NOT TESTED — stopped by critical gate policy.**

Target B required a qualification other than `NOT_QUALIFIED` and no critical published leak. Those preconditions were not met. No controlled repository, full pipeline, artifact chain, or manual published-instruction review was run.

No positive-path claim is made.

## 7. VinGrade Full Pipeline Result

**NOT TESTED — stopped by critical gate policy.**

No RR-01 VinGrade stage was started, no clean copy was created, and no VinGrade artifact was written. Existing VinGrade artifacts remain from prior IA-05 validation and are not represented as RR-01 results.

The RR-01 fields below are therefore unavailable:

- dependency/analyzed/skipped/failed counts;
- eligible migration contexts;
- AI checklist actions;
- abstentions or trust rejections;
- manual-review fallbacks;
- candidate locations;
- stage durations and artifact lineage.

## 8. IA-05 Baseline Comparison

| Metric | IA-05 baseline | RR-01 result | Delta | Explanation |
| --- | ---: | --- | --- | --- |
| Dependencies | 47 | NOT RUN | N/A | Target C blocked by Target A |
| Analyzed | 44 | NOT RUN | N/A | Target C blocked by Target A |
| Skipped | 3 | NOT RUN | N/A | Target C blocked by Target A |
| Failed | 0 | NOT RUN | N/A | Target C blocked by Target A |
| Human review | 46 | NOT RUN | N/A | Target C blocked by Target A |
| Breaking findings | 6 | NOT RUN | N/A | Target C blocked by Target A |
| Impact evidence | 6 | NOT RUN | N/A | Target C blocked by Target A |
| Affected files | 0 | NOT RUN | N/A | Target C blocked by Target A |
| Eligible migration contexts | N/A | NOT RUN | N/A | No RR-01 VinGrade context preparation |
| AI checklist actions | N/A | NOT RUN | N/A | No RR-01 VinGrade generation |
| Abstentions | N/A | NOT RUN | N/A | No RR-01 VinGrade generation |
| Trust rejections | N/A | NOT RUN | N/A | No RR-01 VinGrade generation |
| Manual-review fallbacks | N/A | NOT RUN | N/A | No RR-01 VinGrade generation |

## 9. Migration Checklist Review

### Qualification dataset

**OBSERVED:** Eight AI-authored items were published by the evaluation application path. Six failed the deterministic action-support oracle. The sanitized evaluation report intentionally contains metrics and constrained case results, not instruction text or raw provider payload; no unsupported instruction is reproduced here.

**OBSERVED:** One deterministic positive location exists in the dataset and location preservation passed. AI-owned location count remained zero.

### Controlled target and VinGrade

**NOT TESTED:** No final `migration-checklist.json` was created for either target, so there are no target-specific instructions to classify as supported, partially supported, unsupported, ambiguous, or cannot determine.

## 10. Failure and Re-run Behavior

No second real-provider run was made. Repeating a provider known to fail a critical gate would add cost without authorizing progression.

Deterministic controlled tests reconfirmed:

- provider failure remains package-local;
- whole-candidate trust rejection does not leak the unsafe instruction;
- unrelated valid contexts remain present;
- zero eligible contexts do not create or invoke a provider runtime;
- missing, fake, mismatched, and explicit `NOT_QUALIFIED` records are not promoted;
- invalid/failing writes do not corrupt an existing artifact;
- progress listeners cannot change business output.

Three focused failure/guard tests passed after the real qualification result. The produced real `NOT_QUALIFIED` record was also rejected directly by the MP-05 qualification guard.

## 11. Progress and Operational Visibility

**FACT:** Unit/integration validation passed for stable event order, processed/total counts, qualification state, portable artifact paths, plain CI lines, TTY auto-selection, and listener isolation.

**NOT TESTED:** No real controlled or VinGrade experimental pipeline was authorized, so RR-01 did not observe live `--progress plain` or interactive output against a real repository.

No percentage, animation, or cursor control was used in the real evaluation entrypoint.

## 12. Security and Privacy Review

The 53,183-byte sanitized machine-readable evaluation result was scanned without printing configured secret values.

| Check | Result |
| --- | --- |
| Configured authorization value present | No |
| Full configured endpoint present | No |
| Prompt fields present | No |
| Raw candidate/instruction/excerpt fields present | No |
| `.env` content present | No |
| Absolute local path present | No |
| Raw provider error present | No provider error occurred; no raw field present |
| Chain-of-thought present | No |

No secret leak was detected. The validation did not enable runtime debug output.

## 13. Defects and Limitations

### RR01-001 — Unsupported actions pass the published trust boundary

- Classification: `PRODUCT_DEFECT`
- Severity: `BLOCKER`
- Evidence: `NO_PUBLISHED_UNSUPPORTED_ACTION` failed; 6/8 published items unsupported; unsafe containment 0/2.
- Affected stage: MP-03 trust validation and MP-04 qualification.
- Impact: evidence-cited but semantically unsupported instructions can become AI-authored checklist drafts.
- Reproduction: run the exact real-provider evaluation command in Section 17 with the recorded identity.
- Suggested remediation: strengthen semantic/action grounding and fail closed when deterministic support cannot be established; version changed prompt/trust/policy identities and requalify.
- Release blocking: yes.

### RR01-002 — Current provider/model fails migration action quality

- Classification: `PROVIDER_LIMITATION`
- Severity: `HIGH`
- Evidence: action-support precision 0/5 despite evidence-reference and excerpt precision 5/5.
- Affected stage: real `migration-planning.v1` generation.
- Impact: `openai-compatible` / `openai/gpt-5.5` cannot be qualified for this task identity.
- Reproduction: same as RR01-001.
- Suggested remediation: after trust remediation, evaluate an improved prompt/model/runtime tuple without changing the existing oracle in response to these outputs.
- Release blocking: yes for this provider/model and current capability release.

### RR01-003 — Failure fixtures do not represent normal real-provider behavior

- Classification: `EVALUATION_LIMITATION`
- Severity: `MEDIUM`
- Evidence: `generic/invalid-json` and `generic/provider-failure` produced normal schema-valid actions in real mode and failed their per-case recorded outcomes, while transport/schema failure behavior is separately covered by injected deterministic tests.
- Affected stage: MP-04 real-provider evaluation design.
- Impact: aggregate per-case pass count mixes provider-quality cases with injected-failure scenarios, although qualification quality denominators already exclude deliberate failure fixtures.
- Reproduction: compare real and recorded runs for those two case IDs.
- Suggested remediation: prospectively version and separate real quality qualification cases from injected transport/schema containment cases; do not edit the current oracle to fit this run.
- Release blocking: no by itself.

### RR01-004 — Python and per-project usage coverage remains incomplete

- Classification: `DATA_LIMITATION`
- Severity: `HIGH`
- Evidence: prior IA-05 validation; Usage Analyzer coverage remains global and JavaScript/TypeScript-only.
- Affected stage: Usage Discovery and downstream location eligibility.
- Impact: Python dependency absence from Usage Index is not proof of repository non-use.
- Reproduction: prior VinGrade finding matrix.
- Suggested remediation: add per-project analyzer coverage and Python usage analysis in a separately scoped task.
- Release blocking: no for a clearly limited experimental capability; yes for broad polyglot safety claims.

### RR01-005 — One loopback lifecycle test is unavailable in the sandbox

- Classification: `ENVIRONMENT_LIMITATION`
- Severity: `LOW`
- Evidence: one known test skip reported that local loopback listeners are unavailable.
- Affected stage: test environment only.
- Impact: none on the remote provider run or migration qualification.
- Reproduction: run `npm run check` in the same restricted sandbox.
- Suggested remediation: retain CI coverage in an environment that permits loopback listeners.
- Release blocking: no.

## 14. Release Risks

- The current provider/model is explicitly `NOT_QUALIFIED`.
- The experimental CLI policy may run with a missing qualification under visible limitations, but a known failed tuple must not be treated as merely untested.
- Exact excerpts can create false confidence when semantic support is absent.
- Human review is mandatory but cannot replace a critical grounding gate for release qualification.
- Target B and Target C remain unvalidated for MVP-05.
- VinGrade's previous Version/Impact results do not validate the new checklist stage.

## 15. Remediation Tasks

1. Block the exact failed provider/model/task identity from Migration Checklist execution wherever its qualification record is available.
2. Strengthen or redesign semantic action-support containment without weakening evidence, identity, location, or human-review invariants.
3. Version any changed prompt, schema, trust source, dataset, or qualification policy and rerun the unchanged relevant oracle cases.
4. Separate injected provider/schema failure containment from real-provider quality qualification in a future versioned evaluation design.
5. Requalify the provider/model or a different explicitly selected tuple.
6. Only after a non-`NOT_QUALIFIED` result with no critical leak, run the controlled positive target and then a clean temporary VinGrade pipeline.
7. Resume RR-02 only after the blocking grounding behavior is remediated and the positive pipeline can be observed safely.

No remediation was implemented during RR-01.

## 16. Final Verdict

**RR-01: NO-GO**

Release decisions:

- RR-02: **BLOCKED** pending grounding remediation and successful requalification.
- v0.5.0: **NOT READY**.
- Migration Checklist default enablement: **NO**.
- Migration Checklist state: remain experimental at minimum; the exact failed provider/model tuple must be blocked for `migration-planning.v1`.
- Current provider/model qualified: **NO — `NOT_QUALIFIED`**.
- Remediation required: before RR-02 and before release.

The verdict is not `INCOMPLETE`: Target A completed and produced a conclusive policy verdict requiring `NO-GO`. Targets B and C are intentionally not run, not environment-missing.

## 17. Commands Executed

No command contained an API key or authorization value.

```bash
node --version
git status --short
git -C <VINGRADE_REPO> status --short
git -C <VINGRADE_REPO> branch --show-current
git -C <VINGRADE_REPO> rev-parse HEAD

node --test \
  test/migration-checklist-contract.test.js \
  test/migration-checklist-context-runtime.test.js \
  test/migration-checklist-generator.test.js \
  test/migration-checklist-evaluation.test.js \
  test/migration-checklist-orchestration.test.js \
  test/analysis-orchestration.test.js

node --input-type=module -e '<MP-04 fake evaluation summary>'
env npm_config_cache="$TMPDIR/upgradelens-npm-cache" npm run check
node ./bin/upgradelens.js --help
git diff --check

node --env-file=.env "$TMPDIR/upgradelens-rr01-real-evaluation.mjs"
node --env-file=.env --input-type=module -e '<sanitized secret/prompt/path scan>'
node --input-type=module -e '<qualification guard check against the real record>'

node --test \
  --test-name-pattern='provider failure and whole-candidate trust rejection|zero eligible contexts|qualification guard never promotes' \
  test/migration-checklist-orchestration.test.js
```

The real evaluation entrypoint used the public `createOpenAiCompatibleProvider`, `createProviderAiRuntime`, and `runMigrationEvaluation` APIs, required exact model identity, disabled debug output, used the configured 180-second timeout, and wrote only a private temporary sanitized result. It did not add a production CLI command.

Commands not run because the critical gate stopped progression:

```bash
node --env-file=.env ./bin/upgradelens.js analyze <controlled-target> \
  --experimental-migration-checklist --progress plain

node --env-file=.env ./bin/upgradelens.js analyze <clean-temporary-VinGrade-copy> \
  --experimental-migration-checklist --progress plain
```

## 18. Scope Confirmation

- No production code was changed.
- VinGrade source and artifacts were not changed.
- Qualification thresholds and trust policy were not loosened.
- Golden expected output was not changed after observing the model.
- No dependency was upgraded.
- No code, patch, package-manager command, ordering, rollback, effort estimate, or safety claim was generated for a repository.
- No commit, push, tag, or release was performed.
- No secret or raw provider payload was logged in this report.
- Fake qualification was not used as real-provider qualification.
