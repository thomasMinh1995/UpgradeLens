# RR-01-RERUN — Extractive Contract Real-Provider Qualification and Pipeline Resume

## 1. Executive Summary

RR-01-RERUN reached a conclusive `NO-GO`.

The extractive v2 contract itself qualified successfully on the configured real runtime:

- qualification verdict: `QUALIFIED`;
- provider/model/adapter: `openai-compatible` / `openai/gpt-5.5` / `openai-compatible`;
- seven expected live-quality requests and exactly seven observed requests;
- seven successful completions, one attempt each, zero retries, and zero fallbacks;
- all critical gates and all policy `3.0.0` thresholds passed;
- four actionable live cases and three correct abstentions;
- recorded unsafe containment remained `17/17`, recorded safe acceptance `1/1`, and injected-failure fallback `3/3`.

The controlled `commander` 14.0.0 to 15.0.0 pipeline also completed. It produced four breaking findings, four exact publisher-guidance selections, one constrained abstention, zero trust rejection, zero provider failure, and no executable-looking published instruction. Every item requires human review.

The isolated VinGrade pipeline did not complete. Project Discovery through Repository Impact Evidence succeeded, including 44 successful Version Analysis provider calls. Migration Checklist then failed before creating a context or calling the provider:

```text
Migration Checklist input error: Usage identity python:./pypi:langchain-openai maps to 2 Version Analysis occurrences.
```

VinGrade legitimately contains two `langchain-openai` declarations in the same Python project and manifest: one unpinned and one `>=0.3.0`. Upstream artifacts preserve both occurrences. The Migration Checklist input loader rejects the valid one-to-many occurrence identity because it keys usage identity only by `projectId/packageId`. No `migration-checklist.json` or Markdown report was written. This is a release-blocking product defect, so the final verdict is `NO-GO` even though the exact real runtime is qualified for `migration-planning.v2`.

## 2. Scope and Environment

### UpgradeLens

| Field | Observation |
|---|---|
| Repository | UpgradeLens |
| Branch | `feat/mvp-05-evidence-migration-checklist` |
| Commit | `159905f53ea0897ea6a98a12c4e97197697d8e50` |
| Worktree | Dirty before validation; all existing changes preserved |
| Node.js | `v26.0.0` |
| npm | `11.12.1` |
| Package engine | Node.js `>=20` |
| CLI | Experimental Migration Checklist and `auto`, `interactive`, `plain` progress modes present |

The repository already contained the GR-03/GR-04 implementation changes. RR-01-RERUN did not modify, reset, stage, or discard them.

### Real runtime

| Field | Sanitized value |
|---|---|
| Environment file | `.env`, present |
| Authorization | set; value never printed or retained |
| Provider | `openai-compatible` |
| Model | `openai/gpt-5.5` |
| Adapter | `openai-compatible` |
| Endpoint host | `openrouter.ai` |
| Timeout | `180000 ms` |
| Debug | unset/disabled |
| Retry policy observed | no retry |

The full endpoint, authorization value, request payloads, raw envelopes, and reasoning were not retained.

### VinGrade

| Field | Observation |
|---|---|
| Source branch | `feat/knowledege-rubric-criteria` |
| Source commit | `25811ef997fcf45810105e89e4500688f28f7ba5` |
| Source worktree | Dirty before validation |
| Validation location | isolated temporary copy |
| Excluded from copy | `.git`, existing `.upgradelens`, `.env*`, virtualenvs, `node_modules`, build outputs, caches, logs, and data |
| Clean-copy footprint | 1,534 files, 46 MB before generated artifacts |

The VinGrade source checkout was not modified. Its pre-existing deleted `Makefile` and untracked files remained untouched.

## 3. Deterministic Baseline

### Identity and drift checks

| Identity | Observed |
|---|---|
| Task | `migration-planning.v2` |
| Prompt | `2` |
| Candidate | `migration-checklist-extractive-candidate.v2` |
| Trust | `migration-checklist-trust.extractive.v2` |
| Generator result | `2` |
| Presentation | `migration-checklist-extractive-presentation.v1` |
| v1 dataset digest | `sha256:6f32b8171fb8610d024860957cbe5bffa05b46b9a2fc3d25caf404bc5725ee3c` |
| v1 file SHA-256 | `339ba3196dcf714b26f15c62295c09d475e5db0bce4b9b2d6fe1aaef454d9860` |
| v2 dataset digest | `sha256:c15089381612671c62c3b565d93ad4f5dff1705317ee9622d9ee12a68028d407` |
| v2 file SHA-256 | `1000fa268a7ff4254cdccd161ed5d9cfdf2458adcb6af82dc8c654a96a7d44b6` |
| v2 role coverage | 7 live, 18 recorded containment, 3 injected failure |

The historical v1 identity and the GR-04 v2 identity did not drift.

### Test and package results

| Check | Result |
|---|---|
| Focused MP-01 through MP-05, GR-02, GR-03, GR-04, qualification, and orchestration tests | 108 passed, 0 failed |
| Offline production extractive evaluation | `QUALIFIED_WITH_LIMITATIONS` fake result |
| Offline provider requests | 0 |
| Offline unsafe containment | 17/17 |
| Offline recorded safe acceptance | 1/1 |
| Offline injected failures | 3/3 |
| Offline published unsupported actions | 0 |
| Offline published ambiguous actions | 0 |
| Offline critical gates | all passed |
| Full `npm run check` | 504 passed, 0 failed, 1 sandbox skip |
| Baseline `npm pack --dry-run` before this report | 191 files, 447.8 kB |
| Final `npm pack --dry-run` including this report | 192 files, 456.1 kB |
| `git diff --check` | passed |

The one full-suite skip is the existing local-loopback-listener sandbox condition, not a product test failure.

## 4. V2 Qualification Identity

The real qualification was generated at `2026-07-17T03:32:16.710Z`.

| Component | Exact identity |
|---|---|
| Task | `migration-planning.v2` |
| Dataset | `migration-planning-golden@2.0.0` |
| Dataset digest | `sha256:c15089381612671c62c3b565d93ad4f5dff1705317ee9622d9ee12a68028d407` |
| Evaluation criteria | `migration-action-evaluation@1.0.0` |
| Criteria digest | `sha256:3e2d7c3e32794d2acb59fb834609806e7700cc6888780ffd3d26d1f106078ccc` |
| Comparator | `2.0.0` |
| Normalization | `1.0.0` |
| Policy | `3.0.0` |
| Policy digest | `sha256:b463a30d8044aed5aa8565fc08824b9f430145527da35142e452c3dad544c747` |
| Prompt version | `2` |
| Prompt digest | `sha256:68c227c7951cd9ad6e60283fc9d54416f7c7e76ebaaa85ce17acfe30252cfdd2` |
| Candidate schema digest | `sha256:6ac9e1477e206ab082ac38cdb263254c996ee4684e04c80af6b9a08ceae0375d` |
| Runtime mode | `real` |
| Declared provider/model | `openai-compatible` / `openai/gpt-5.5` |
| Observed provider/model | `openai-compatible` / `openai/gpt-5.5` |
| Adapter | `openai-compatible` |
| Qualification ID | `sha256:4fa4954d6f254d94859bce17aec6209394d380e4635155a6f3ce23a7e9b70765` |

## 5. Real-Provider Qualification

### Routing and outcomes

Only the seven `LIVE_QUALITY` cases called the provider. All 18 recorded containment cases and all three injected-failure cases stayed local. There were no duplicate requests.

| Live case | Elapsed | Provider/schema | Candidate outcome | Items | Support/exactness | Published |
|---|---:|---|---|---:|---|---|
| `generic/ambiguous-evidence` | 4,086 ms | success | abstain | 0 | pass | abstained |
| `generic/explicit-action` | 2,030 ms | success | actionable | 1 | supported, exact, specific | generated |
| `generic/release-announcement` | 2,213 ms | success | abstain | 0 | pass | abstained |
| `node/multi-action` | 2,249 ms | success | actionable | 2 | both supported, exact, specific | generated |
| `node/no-action-breaking` | 1,922 ms | success | abstain | 0 | pass | abstained |
| `python/unknown-registry-action` | 1,555 ms | success | actionable | 1 | supported and exact; low version specificity | generated |
| `python/unsupported-usage-action` | 1,711 ms | success | actionable | 1 | supported, exact, specific | generated |

Each request had `attemptCount: 1`, `retryCount: 0`, and `fallbackCount: 0`. There were four generated live cases, three abstained live cases, zero rejected live cases, and zero failed live cases.

### Quality metrics

| Metric | Result |
|---|---:|
| Action support precision | 5/5 |
| Published unsupported action rate | 0/5 |
| Published ambiguous action rate | 0/5 |
| Action specificity | 4/5 |
| Identifier specificity | 5/5 |
| Version-scope preservation | 5/5 |
| Abstention precision | 3/3 |
| Abstention recall | 3/3 |
| False abstention rate | 0/4 |
| Safe candidate acceptance | 4/4 |
| Live-provider completion | 7/7 |
| Exact excerpt pass | 5/5 |
| Evidence reference precision | 5/5 |

All 15 critical gates passed. No unsupported or ambiguous action, invalid reference, non-exact excerpt, invented identifier, prohibited capability, AI-owned location, false safety claim, recommendation leak, or identity drift was published. No threshold failed and the qualification had no limitation.

## 6. Qualification Guard Verification

The produced record was accepted only for the exact task/runtime tuple:

- exact record and exact provider/model/adapter: `QUALIFIED`;
- fake v2 qualification against the real runtime: `EXPERIMENTAL` with `FAKE_QUALIFICATION_NOT_REAL_PROVIDER`;
- model mismatch: `EXPERIMENTAL` with `MIGRATION_QUALIFICATION_IDENTITY_MISMATCH`;
- prompt digest mutation: identity mismatch;
- candidate schema digest mutation: identity mismatch;
- trust identity mutation: identity mismatch;
- presentation identity mutation: identity mismatch;
- corrupted qualification ID: fatal `MIGRATION_QUALIFICATION_IDENTITY_CORRUPT`;
- historical free-form/v1 record: identity mismatch;
- matching `NOT_QUALIFIED`: fatal `MIGRATION_RUNTIME_NOT_QUALIFIED`;
- missing record without explicit experimental policy: blocked.

The CLI still has no persistent qualification store. Qualified pipeline assertions therefore used the supported application API to inject the exact in-memory record. This is distinct from the CLI missing-record experimental warning path.

## 7. Controlled Positive Pipeline

### Target selection

An initial temporary `react-router-dom` 6.30.1 target completed operationally but Version Analysis truthfully produced no breaking finding from the selected near-target evidence. It was not treated as a positive result. That setup run made one Version Analysis request and no Migration Checklist request.

The final controlled target used:

- `commander` 14.0.0 to registry latest 15.0.0;
- publisher release evidence from the official Commander repository;
- four explicit breaking findings and a `Migration Tips` section;
- one JavaScript named import of `Command`.

### Full flow

```text
Discover
→ Knowledge Research
→ Version Analysis
→ Usage Discovery
→ Repository Impact
→ Impact Evidence
→ Extractive Migration Checklist
→ Markdown Report
```

All stages completed with exit code 0 in 48.315 seconds.

| Count | Result |
|---|---:|
| Dependencies / analyzed / skipped / failed | 1 / 1 / 0 / 0 |
| Breaking findings | 4 |
| Impact Evidence records | 4 |
| Eligible contexts | 4 |
| Version Analysis requests | 1 |
| Migration v2 requests | 4 |
| Generated contexts | 3 |
| Abstained contexts | 1 |
| Rejected / failed contexts | 0 / 0 |
| Selected exact spans | 4 |
| Candidate locations | 0 |
| Items requiring human review | 5 |

All five provider calls used one attempt, zero retries, and zero fallbacks. The Migration Checklist artifact passed schema `1.0.0`, exact seven-artifact lineage, cross-reference validation, and immutable input loading.

The artifact preserves these limitations:

- experimental Migration Checklist;
- exact evidence spans do not prove repository applicability;
- no positive exact usage match is not evidence of unused/safe;
- registry latest is not a recommendation;
- upstream high-risk result requires human review;
- one `NO_EXPLICIT_ACTION` model abstention became a deterministic manual-review fallback.

The console and Markdown output did not claim that Commander was safe to upgrade.

## 8. VinGrade Full Pipeline

### Stage observations

| Stage | Result | Duration | Output/observation |
|---|---|---:|---|
| Project Discovery | completed | 40 ms | 47 dependency occurrences, duplicate declaration warning |
| Knowledge Research | completed | 47,983 ms | 46 packages, 45 resolved, 1 unavailable |
| Version Analysis | completed | 590,530 ms | 47 results: 44 analyzed, 3 skipped, 0 failed |
| Usage Discovery | completed | 379 ms | 17 dependencies, 152 symbols, 79 files |
| Repository Impact | completed | 46 ms | 47 dependency occurrences, 10 breaking findings, 0 exact matches |
| Impact Evidence | completed | 35 ms | 10 findings, 0 affected files |
| Migration Checklist | failed | 194 ms | `AMBIGUOUS_REFERENCE` before context generation |
| Markdown Report | not run | — | correctly stopped after prior-stage failure |

Total duration was 639,212 ms. Version Analysis made 44 provider requests; all 44 succeeded with exact provider/model identity, one attempt each, zero retries, and zero fallbacks. Migration Checklist made zero provider requests because preparation failed first.

Plain progress was stable and line-oriented, used the correct stage order, contained no cursor control, and stopped after the failed stage. The default failure output contained no stack trace and pointed to a portable log path. The failure event exposed `reason=AMBIGUOUS_REFERENCE`, although its qualification state was `UNKNOWN` because failure occurred before guard completion.

### Failure evidence

Project Discovery reported:

```text
DUPLICATE_DEPENDENCY_DECLARATION requirements.txt: langchain-openai is declared multiple times.
```

The source declarations are:

```text
langchain-openai>=0.3.0
langchain-openai
```

Version Analysis correctly retained two results for the same `python:.` / `pypi:langchain-openai` identity:

- an unpinned, skipped `unsupportedBaseline` occurrence;
- an analyzed `declaredConstraint` occurrence for `>=0.3.0`.

The Migration Checklist input loader counts occurrences by only `projectId/packageId`, sees two results, and throws:

```text
Usage identity python:./pypi:langchain-openai maps to 2 Version Analysis occurrences.
```

No existing source or generated artifact was corrupted. `migration-checklist.json` and `repository-impact.md` remained absent, demonstrating correct fail-fast and no-partial-publication behavior.

## 9. IA-05 Baseline Comparison

| Metric | IA-05 baseline | RR-01-RERUN | Delta | Explanation |
|---|---:|---:|---:|---|
| Dependencies | 47 | 47 | 0 | Same occurrence count |
| Analyzed | 44 | 44 | 0 | Same |
| Skipped | 3 | 3 | 0 | Same |
| Failed | 0 | 0 | 0 | Same |
| Human review | 46 | 47 | +1 | Current registry/evidence/model result; all current results require review |
| Breaking findings | 6 | 10 | +4 | Registry and publisher evidence changed since IA-05 |
| Impact evidence | 6 | 10 | +4 | Mirrors current breaking findings |
| Affected files | 0 | 0 | 0 | No exact symbol match |
| Eligible migration contexts | N/A | not produced | — | Input loader failed before context construction |
| Selected guidance spans | N/A | 0 | — | No Migration Checklist provider call |
| Abstentions | N/A | 0 | — | No context generated |
| Trust rejections | N/A | 0 | — | No context generated |
| Manual-review fallbacks | N/A | 0 | — | No context generated |
| Candidate locations | N/A | 0 | — | No context generated |

The current ten breaking findings span `pdfjs-dist`, `react`, `eslint-plugin-react-refresh`, `langsmith`, `pytest-asyncio`, `python-dotenv`, and `python-jose`. The count change is not by itself classified as a regression because online registry/release evidence is time-dependent. The duplicate-occurrence failure is independent of that drift.

## 10. Migration Checklist Review

### Controlled published spans

Every selected span was an exact substring of its cited publisher evidence, retained the deterministic prefix, had a known evidence reference, owned no location, and required human review.

| Finding | Selected guidance | Manual classification |
|---|---|---|
| ESM-only change | “Commander 15 is ESM only, but this does not mean you need to migrate to ESM to use it.” | supported and useful |
| ESM-only change | “If you have problems using Commander 15 in your environment, one option is stay on Commander 14 for now.” | supported and useful |
| Node runtime requirement | same “stay on Commander 14” span | supported but low specificity |
| Removed deprecated ESM export | same “stay on Commander 14” span | supported but low specificity |
| Negative option default | no span selected | correct abstention; manual review fallback |

No selected span was ambiguous or unsupported. The repeated fallback guidance is publisher-supported but does not directly describe the specific runtime or removed-export remediation. The existing `EXTRACTIVE_SEMANTIC_APPLICABILITY_NOT_VERIFIED` limitation and mandatory human review keep this truth visible.

### VinGrade

No VinGrade checklist exists to review. In particular:

- Python coverage was not converted into unused/safe;
- zero affected files was not converted into safe-to-upgrade;
- registry latest remained a fact, not a recommendation;
- no package-local record was silently dropped after a provider failure;
- no command-like guidance or source location was published.

The absence is caused by the release-blocking input identity defect, not by qualification or model behavior.

## 11. Progress and Operational Visibility

Plain-mode observations:

- stable, portable, line-oriented output;
- correct scheduler order;
- processed/total counts for controlled Migration Checklist contexts;
- no invented percentage;
- no ANSI cursor control;
- bounded reason codes only;
- no prompt, evidence body, source code, raw provider error, secret, or absolute source path;
- stage failure stopped all later stages;
- failure log was sanitized and portable.

Interactive progress behavior was covered by the passing deterministic TTY-aware tests. A second live-provider controlled run was intentionally not made solely for UX inspection. Full interactive UX remains RR-02 scope.

Two visibility limitations remain:

1. a preparation failure reports qualification state `UNKNOWN`, even when an exact qualification was injected;
2. the final controlled `migration-checklist.json` retains the qualification-derived limitations but does not serialize the qualification ID/runtime tuple, so portable audit linkage depends on the external validation record.

## 12. Failure and Re-run Behavior

Passing focused tests reconfirmed:

- provider failure is package-local;
- non-exact excerpts, invalid schema, trust rejection, and model abstention fail closed;
- command-like official spans fail closed;
- zero eligible contexts do not initialize the AI runtime;
- one context failure preserves other contexts;
- missing qualification requires explicit experimental policy;
- fake, v1, and identity-mismatched records cannot replace v2 real qualification;
- matching `NOT_QUALIFIED` blocks;
- corrupt qualification identity is fatal;
- atomic writer failure preserves the existing target and cleans its temporary attempt;
- same context and recorded candidate produce stable normalized output, IDs, and ordering.

The real qualification was not repeated to claim model determinism. Only deterministic post-processing and recorded-candidate replay were tested for determinism.

The VinGrade run was not retried or altered after `AMBIGUOUS_REFERENCE`. This preserves the conclusive defect evidence and avoids duplicate provider calls.

## 13. Security and Privacy Review

A state-only scan covered 128 temporary validation and generated product files. Results:

| Check | Matches |
|---|---:|
| Exact configured authorization value | 0 |
| Full configured endpoint | 0 |
| Authorization header field | 0 |
| Bearer-token pattern | 0 |
| Raw envelope keys | 0 |
| Prompt/reasoning payload keys | 0 |
| Private user path in portable `.upgradelens` artifacts | 0 |

The sanitized validation data stores only allowlisted identity, counts, reason codes, elapsed time, attempts, retries, and bounded failure details. It does not store raw provider envelopes, chain-of-thought, `.env` values, or unrelated VinGrade content.

No security or privacy blocker was found.

## 14. Documentation Consistency

Two contributor-facing inconsistencies were found and intentionally not edited:

1. `docs/mvp-05-migration-checklist-orchestration.md` still lists leading-dash flags and unsupported plain-language instructions as current gaps. GR-04 extractive v2 contains those fixtures; the remaining current limitation is that exact provenance does not prove repository applicability.
2. `docs/mvp-05-migration-evaluation-and-qualification.md` opens and presents “current qualification” primarily in historical free-form v1 terms, including “real-provider qualification has not been run.” A later v2 addendum is correct, but the mixed chronology is easy to misread now that this exact v2 runtime has been qualified.

The terms evaluation criteria, action support, specificity, containment, comparator, and selected evidence span are otherwise defined consistently in GR-02 through GR-04.

## 15. Defects and Limitations

### RR01R-001 — Duplicate dependency occurrences abort Migration Checklist

| Field | Value |
|---|---|
| Classification | `PRODUCT_DEFECT` |
| Severity | `BLOCKER` |
| Phase | VinGrade Migration Checklist |
| Evidence | Two valid Version Analysis occurrences for `python:./pypi:langchain-openai`; input loader keys only by `projectId/packageId` and throws `AMBIGUOUS_REFERENCE` |
| Impact | Full pipeline cannot create Migration Checklist or Markdown for a repository with duplicate package declarations in one project |
| Reproduction | Analyze an isolated VinGrade copy with the exact real qualification and experimental checklist enabled |
| Suggested remediation | Define an occurrence-stable identity that includes manifest/declaration identity, or deterministically reconcile duplicate declarations before cross-artifact matching; add an end-to-end duplicate-declaration regression |
| Release blocking | yes |

### RR01R-002 — Exact-span applicability remains intentionally unverified

| Field | Value |
|---|---|
| Classification | `EVALUATION_LIMITATION` |
| Severity | `MEDIUM` |
| Phase | Controlled checklist review |
| Evidence | “Stay on Commander 14” was valid exact publisher guidance but low-specificity for two distinct findings |
| Impact | Human review must decide finding-specific applicability |
| Suggested remediation | Keep experimental/human-review policy; consider a future deterministic applicability gate without weakening exact-span containment |
| Release blocking | no while experimental |

### RR01R-003 — Qualification linkage is not portable in the checklist artifact

| Field | Value |
|---|---|
| Classification | `PRODUCT_DEFECT` |
| Severity | `MEDIUM` |
| Phase | Controlled artifact audit |
| Evidence | Console exposes qualification availability and artifact exposes limitations, but `migration-checklist.json` does not serialize qualification ID/runtime identity |
| Impact | A consumer cannot independently bind a checklist file to the exact qualification record |
| Suggested remediation | Decide and version a non-secret qualification lineage field in a future artifact contract |
| Release blocking | no for the current experimental scope |

### RR01R-004 — Failure progress loses known qualification state

| Field | Value |
|---|---|
| Classification | `CLI_UX_OBSERVATION` |
| Severity | `LOW` |
| Phase | VinGrade failure visibility |
| Evidence | Migration failure event reported `qualificationState: UNKNOWN` although an exact qualification was injected |
| Impact | Failure diagnostics are less precise |
| Suggested remediation | Carry prevalidated/injected qualification state into preparation-failure events in RR-02 |
| Release blocking | no |

### RR01R-005 — Current docs mix historical v1 and production v2 limitations

| Field | Value |
|---|---|
| Classification | `DOCUMENTATION_INCONSISTENCY` |
| Severity | `LOW` |
| Phase | Documentation audit |
| Evidence | Stale leading-dash/plain-language “current gaps” and “real-provider not run” wording |
| Impact | Contributors may misunderstand the active contract and qualification status |
| Suggested remediation | Separate a clearly labeled historical v1 section from current extractive v2 status |
| Release blocking | no, but clean up before release |

### RR01R-006 — First controlled target lacked boundary evidence

| Field | Value |
|---|---|
| Classification | `DATA_LIMITATION` |
| Severity | `LOW` |
| Phase | Controlled-target setup |
| Evidence | React Router major upgrade selected only near-target release evidence and produced no breaking finding |
| Impact | A nominal major target may not be a usable positive validation target |
| Suggested remediation | Pre-qualify controlled fixtures against exact boundary evidence; separately review bounded interval evidence selection |
| Release blocking | no |

## 16. Release Risks

1. Repositories with duplicate declarations for one package in one project can pass IA-01 through IA-03 and then fail the experimental checklist before any package-local isolation is possible.
2. Exact selected text proves provenance and structural safety, not finding-specific applicability; mandatory review must remain visible.
3. Qualification provenance is not self-contained in the checklist artifact.
4. Online registry and publisher data are time-dependent; IA-05 finding counts changed from 6 to 10 without a source-code change.
5. Python still lacks a Usage Analyzer, so zero affected files cannot be interpreted as safe or unused.

## 17. Final Verdict

### `NO-GO`

Rationale:

- the exact provider/model/adapter is genuinely `QUALIFIED` for extractive v2;
- every real qualification critical gate passed;
- the controlled positive pipeline passed without unsupported or ambiguous publication;
- security and privacy checks passed;
- the VinGrade full pipeline failed at Migration Checklist on a valid duplicate-declaration repository shape;
- no checklist or Markdown report was produced for VinGrade.

Release decisions:

| Question | Decision |
|---|---|
| May RR-02 start as the next release-readiness gate? | `BLOCKED` until RR01R-001 is fixed and VinGrade is rerun |
| Is v0.5.0 technically ready? | `NOT READY` |
| Enable Migration Checklist by default? | `NO` |
| Keep Migration Checklist experimental? | `YES` |
| Is the current provider/model/adapter qualified for v2? | `YES` |
| Is there a blocker before release? | `YES`: duplicate-occurrence identity handling |

The qualification result does not override the pipeline blocker and does not authorize default enablement.

## 18. Commands Executed

Representative exact commands, with sensitive locations and values omitted:

```bash
node --version
npm --version
node bin/upgradelens.js analyze --help

node --test \
  test/migration-checklist-context-runtime.test.js \
  test/migration-checklist-contract.test.js \
  test/migration-checklist-evaluation-v2.test.js \
  test/migration-checklist-evaluation.test.js \
  test/migration-checklist-extractive-experiment.test.js \
  test/migration-checklist-extractive-production.test.js \
  test/migration-checklist-generator.test.js \
  test/migration-checklist-orchestration.test.js \
  test/analysis-orchestration.test.js

env npm_config_cache=/tmp/upgradelens-npm-cache npm run check
npm pack --dry-run --cache /tmp/upgradelens-npm-cache
git diff --check

node --env-file=.env /private/tmp/upgradelens-rr01-rerun-real-evaluation.mjs
node --env-file=.env /private/tmp/upgradelens-rr01-controlled-runner.mjs
node --env-file=.env /private/tmp/upgradelens-rr01-vingrade-runner.mjs
```

The controlled and VinGrade runners called the public application/runtime APIs, injected the exact qualification record, disabled provider debug output, retained only sanitized request metadata, and used the ordinary pipeline scheduler and stage runtimes.

## 19. Scope Confirmation

- No production code was changed.
- No test, dataset, fixture, prompt, schema, trust rule, comparator, policy, or threshold was changed.
- No dependency was upgraded.
- No VinGrade source was modified.
- No source patch, migration command, rollback instruction, or release artifact was created.
- No fake or v1 qualification was used as real v2 evidence.
- No retry was used to seek a favorable provider output.
- No real qualification rerun was performed.
- No secret, full endpoint, raw provider envelope, prompt, or reasoning was logged.
- No push, tag, commit, or release was performed.
- The historical RR-01 report was not overwritten.
- The only repository file added by RR-01-RERUN is this validation report.
