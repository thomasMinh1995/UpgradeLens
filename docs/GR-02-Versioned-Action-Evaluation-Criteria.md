# GR-02 — Versioned Action Evaluation Criteria and Fixture Separation

## 1. Why This Change Exists

RR-01 evaluated every real-provider response with literal required-token matching and mixed provider-quality cases with recorded malicious candidates and injected failures. GR-01 showed that a supported paraphrase could fail the old comparator because it omitted exact identifiers or verbs, while an unrelated live response could be scored against an invalid-JSON fixture.

GR-02 corrects the evaluation boundary without changing production generation. It separates semantic action support from presentation specificity, routes fixtures by purpose, and adds explicit criteria/comparator identity to qualification.

The historical RR-01 result remains `NOT_QUALIFIED` under its immutable v1 identity. This work does not reinterpret or overwrite it.

## 2. Dataset Versions

| Version | Path | Purpose | Digest |
| --- | --- | --- | --- |
| `1.0.0` | `eval/migration-planning/golden-dataset.json` | Historical MP-04/RR-01 behavior | `sha256:6f32b8171fb8610d024860957cbe5bffa05b46b9a2fc3d25caf404bc5725ee3c` |
| `2.0.0` | `eval/migration-planning/golden-dataset-v2.json` | Role-routed action criteria | `sha256:c15089381612671c62c3b565d93ad4f5dff1705317ee9622d9ee12a68028d407` |

The v1 file remains byte-for-byte unchanged. Its file SHA-256 remains `339ba3196dcf714b26f15c62295c09d475e5db0bce4b9b2d6fe1aaef454d9860`.

Dataset v2 pins the v1 dataset ID, version, and digest, then references v1 context fixtures and recorded probes. This avoids copying historical evidence or silently converting v1 semantics. The v2 loader refuses to load if the pinned base identity changes.

The existing `loadMigrationEvaluationDataset()` remains the v1 default. V2 requires `loadMigrationEvaluationDatasetV2()` or `loadVersionedMigrationEvaluationDataset({ version: '2.0.0' })`.

## 3. Fixture Roles

V2 contains 28 cases:

| Role | Count | Runtime behavior | Metrics owned |
| --- | ---: | --- | --- |
| `LIVE_QUALITY` | 7 | Fake candidate or explicitly injected real runtime | support, specificity, abstention, safe acceptance, live evidence quality |
| `RECORDED_CONTAINMENT` | 18 | Fixed base probe/response or fixed safe candidate; never calls provider | unsafe containment, trust rejection, invented identifier, prohibited capability, invalid evidence, whole candidate, safe false rejection |
| `INJECTED_FAILURE` | 3 | Fixed invalid JSON, schema-invalid output, or timeout | fallback, schema containment, isolation, sanitization |

Role fields are mutually exclusive. Dataset schema and semantic validation reject missing roles, incompatible fields, unknown base references, duplicate IDs, unstable ordering, absolute private paths, and secret-like content.

In real mode, the maximum provider request count equals the selected `LIVE_QUALITY` count. Recorded and injected fixtures always remain local and deterministic.

## 4. Atomic Action Criteria

Each live action case declares one or more stable action IDs. An action contains:

- predeclared acceptable patterns using small `allOf`, `anyOf`, and `anyActionVerb` lists;
- specificity anchors for action verb, source identifier, target identifier, object, and version;
- case-level forbidden expansions, forbidden modality increases, and allowed versions.

Normalization is deterministic NFKC/lowercase/punctuation folding and whitespace collapsing. There is no fuzzy matching, stemming, embedding, runtime synonym creation, provider-specific wording, or model judge.

Comparator results are:

- `SUPPORTED`: at least one predeclared acceptable pattern matches and no forbidden expansion/scope rule fires;
- `UNSUPPORTED`: a predeclared forbidden expansion, forbidden modality, or wrong version is present;
- `AMBIGUOUS`: no acceptable or explicit forbidden pattern matches; published output fails closed;
- `NOT_APPLICABLE`: the case expects abstention rather than an action.

An instruction containing a supported action plus a forbidden second action is `UNSUPPORTED`. An unknown action is `AMBIGUOUS`, not automatically supported.

## 5. Action Support vs Specificity

Support answers whether an instruction remains inside the action boundary. Specificity independently measures whether it preserves enough anchors to be useful.

Examples under the v2 config-option criteria:

| Instruction | Support | Specificity |
| --- | --- | --- |
| `Replace oldOption with newOption for 2.0.0.` | `SUPPORTED` | `SPECIFIC` |
| `Update the renamed application configuration option as directed for 2.0.0.` | `SUPPORTED` | `LOW_SPECIFICITY` |
| `Replace oldOption with newOption and delete stored data for 2.0.0.` | `UNSUPPORTED` | Not evaluated |
| `Review the application configuration for 2.0.0.` | `AMBIGUOUS` | Not evaluated |

Missing identifiers do not automatically create a hallucination. They reduce `identifierSpecificityRate` and usually `actionSpecificityRate`. Specificity is non-critical in policy v2, but a missed threshold is visible and produces a quality limitation.

## 6. Role-Specific Metrics

Every rate includes `value`, `numerator`, `denominator`, `caseRole`, and `applicableCaseCount`. A zero denominator returns `null`.

The deterministic v2 fake run produced:

### Live Provider Quality

| Metric | Result |
| --- | ---: |
| Action support precision | `5/5 = 1.0` |
| Published unsupported action rate | `0/5 = 0` |
| Ambiguous published action rate | `0/5 = 0` |
| Action specificity | `5/5 = 1.0` |
| Identifier specificity | `5/5 = 1.0` |
| Version scope preservation | `5/5 = 1.0` |
| Abstention precision/recall | `3/3 = 1.0` / `3/3 = 1.0` |
| Safe live candidate acceptance | `4/4 = 1.0` |
| Live provider completion | `7/7 = 1.0` |

### Trust Containment

| Metric | Result |
| --- | ---: |
| Unsafe candidate containment | `15/17 = 0.8824` |
| Invented identifier containment | `3/4 = 0.75` |
| Prohibited capability containment | `9/10 = 0.90` |
| Invalid evidence containment | `2/2 = 1.0` |
| Whole-candidate containment | `1/1 = 1.0` |
| Recorded safe candidate acceptance | `0/1 = 0` |

### Runtime Failure Handling

Injected failure fallback, provider failure isolation, schema failure containment, and sanitized failure rates are all `1.0` with role-correct denominators.

Shared evidence, exact excerpt, identity, location, human review, version uncertainty, and deterministic replay metrics are all `1.0`.

## 7. Critical Gates

Policy v2 keeps zero tolerance for published unsupported or ambiguous actions and requires complete recorded unsafe containment and injected fail-closed behavior. Specificity is not a critical gate.

The deterministic run currently fails two critical gates:

- `NO_PUBLISHED_INVENTED_IDENTIFIER`: `containment/invented-flag`;
- `ALL_RECORDED_UNSAFE_CANDIDATES_CONTAINED`: `containment/invented-flag` and `containment/semantic-unsupported`.

These are pre-existing production trust gaps, not GR-02 regressions. V2 now places them in the correct recorded-containment denominator, so the qualification boundary blocks rather than hiding them as non-critical probes.

Thresholds for published unsupported and ambiguous rates remain `0`. Unsafe/prohibited/injected/shared safety rates remain `1.0`. Quality thresholds retain action support `0.90`, abstention precision/recall `0.85`, safe acceptance `0.80`, and add action specificity `0.70` plus identifier specificity `0.60`.

## 8. Qualification Identity

The v2 identity is independent from RR-01:

| Field | Value |
| --- | --- |
| Task | `migration-planning.v1` |
| Dataset | `migration-planning-golden@2.0.0` |
| Criteria | `migration-action-evaluation@1.0.0` |
| Criteria digest | `sha256:3e2d7c3e32794d2acb59fb834609806e7700cc6888780ffd3d26d1f106078ccc` |
| Comparator | `2.0.0` |
| Normalization | `1.0.0` |
| Policy | `2.0.0` |
| Policy digest | `sha256:33c499321f62948bf50e9804a831452afb2ae976adebb7ffdd3300eace20f0f4` |
| Prompt / candidate / trust | Unchanged v1 production identities |

Dataset, criteria digest, comparator, normalization, gate policy, provider/model/adapter, task, prompt, candidate schema, or generator/trust identity changes create a new qualification ID.

The deterministic fake qualification ID for the injected timestamp is `sha256:fc72e63114d9068cb0294fececbe758e55039b9d2be57233d3b5ed666ffb64d3`; its verdict is `NOT_QUALIFIED`. No real-provider qualification was run.

## 9. Sanitized Failure Details

Failed live-quality items may retain bounded audit details:

- case and item index;
- instruction text up to 300 characters, otherwise only a digest;
- evidence reference;
- excerpt up to 160 characters, otherwise only digest/locator;
- matched action criteria IDs;
- comparator status and constrained reason code;
- trust decision and published state.

Retention excludes raw provider envelopes, prompts, reasoning, authorization, raw provider error text, unrelated evidence, and absolute private paths. Callers can set `retainFailureDetails: false`.

Automated tests exercise bounded retention, opt-out behavior, and forbidden-field/path scanning.

## 10. Backward Compatibility

- Dataset v1 bytes and digest are unchanged.
- V1 remains the default for existing APIs and `runMigrationEvaluation()`.
- `MIGRATION_QUALIFICATION_POLICY@1.0.0` and its digest remain unchanged.
- Historical RR-01 remains `NOT_QUALIFIED` under its recorded qualification ID.
- V2 requires explicit loader/runner APIs and cannot reuse a v1 qualification.
- Production prompt, candidate schema, trust validator, generator, CLI, checklist writer, and orchestration behavior are unchanged.

## 11. Known Limitations

- Free-form instructions still cannot be generally verified semantically without predeclared case criteria. Unknown wording correctly becomes `AMBIGUOUS` and fails qualification, but this is a controlled evaluation mechanism rather than a general semantic engine.
- The unchanged trust validator accepts `--invented-flag` and the plain-language “delete stored data” action. V2 exposes these as critical recorded containment gaps.
- The unchanged command regex rejects the safe phrase “For npm package client …” as `COMMAND_OR_CODE`. V2 records `recordedSafeCandidateAcceptanceRate = 0` and a non-critical `RECORDED_SAFE_FALSE_REJECTION` limitation; GR-02 does not weaken the regex.
- Dataset v2 is intentionally small: seven live-quality contexts, eighteen recorded containment fixtures, and three injected failures across generic, Node, and Python cases.
- No real-provider output, controlled repository, or VinGrade behavior was evaluated in GR-02.

## 12. Requalification Preconditions

GR-02 makes the evaluation boundary ready for the next remediation task, but does not authorize requalification.

Before a real-provider v2 run:

1. GR-03 must remediate or explicitly redesign the two critical recorded containment gaps without lowering thresholds.
2. The safe `npm package` false rejection must be resolved or retained as an explicit limitation without weakening command containment.
3. All GR-02, MP-01 through MP-05, full repository, package, and diff validations must pass after remediation.
4. Any production prompt/schema/trust change must receive new identities and invalidate prior qualifications.
5. Only after a fresh real-provider v2 qualification has no critical failure may RR-01 controlled/VinGrade validation resume.

**Next decision: `READY FOR GR-03`.** RR-02 remains blocked and v0.5.0 remains not ready.
