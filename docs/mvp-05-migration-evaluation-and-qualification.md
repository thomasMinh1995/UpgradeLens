# MVP-05 Migration Evaluation and Qualification

## Why MP-04 exists

MP-03 proves that candidate parsing, exact excerpt checks, deterministic ownership, and fail-closed fallback work. It does not prove that a generated instruction is semantically supported by its excerpt, that a model abstains at the right time, or that a particular provider/model is suitable for `migration-planning.v1`.

MP-04 adds a task-specific quality gate before MP-05 writer/orchestration work. It does not generate the final artifact, scan a repository, or change MP-01 through MP-03 production semantics.

## Evaluation layers

1. **Deterministic policy layer** validates the dataset, candidate schema, evidence allowlist, exact excerpts, identifier and prohibited-capability guards, identity, locations, human review, and stable replay.
2. **Recorded fake-runtime layer** runs MP-03 end to end with versioned candidates and failures. It is offline, deterministic, and is the default.
3. **Real-provider layer** accepts an explicitly injected provider-neutral `AiRuntime`. It is never selected by default and is not part of `npm test` or `npm run check`.

The report keeps three views separate:

- raw candidate behavior, including unsupported attempts and abstention;
- trust acceptance/rejection and whole-candidate containment;
- final published checklist behavior after deterministic fallback.

A model hallucination that is rejected therefore hurts raw/provider quality while still passing the no-leak published-output gate.

## Dataset and coverage

The strict dataset is `eval/migration-planning/golden-dataset.json`, schema version `1.0.0`, task `migration-planning.v1`. Its JSON Schema rejects additional properties and its loader rejects duplicate or unstable case IDs, unknown evidence refs, inconsistent outcomes, inconsistent locations, missing required ecosystem/sample coverage, and invalid policy-probe expectations.

The initial 10 cases cover Node.js/npm, Python/PyPI, and generic contexts. They include explicit publisher/official actions, multiple evidence and multiple actions, abstention for change-only/announcement/ambiguous evidence, invalid output, runtime failure, whole-candidate rejection, exact positive JS/TS locations, unknown current version, `registryLatest`, and unsupported Usage Index coverage. Sixteen compact adversarial probes cover invented identifiers/config/flags, wrong or paraphrased excerpts, cross-context refs, URL/code/diff/command, ordering/prerequisite, rollback, effort, confidence/safety, and model-owned repository locations.

Acceptable action concepts use deterministic required/forbidden tokens on controlled fixtures. This is an evaluation oracle for the fixture, not a general semantic-entailment proof and not an LLM judge.

## Metrics and denominator semantics

Every rate stores `value`, `numerator`, and `denominator`. A zero denominator produces `value: null`; it never produces an artificial 100%.

Metric groups are:

- grounding: evidence-reference precision/coverage, exact excerpt rate, action-support precision;
- hallucination/safety: unsupported actions, invented identifiers/URLs, prohibited attempts, and published unsupported actions;
- abstention: precision, recall, false abstention, and missed abstention;
- trust containment: rejection precision, unsafe containment, safe acceptance, and whole-candidate rejection;
- policy preservation: locations, identity, human review, version uncertainty, eligibility, and deterministic replay;
- runtime: schema/generated/abstained/rejected/failed counts, expected versus unexpected failures, case isolation, and policy-probe counts.

Quality metrics exclude deliberate runtime-failure and oracle-unsafe fixtures. Those fixtures remain visible in runtime, containment, and gate results.

## Critical gates

The following are evaluated independently from quality averages:

- valid published evidence refs and exact excerpts;
- no published unsupported or prohibited instruction;
- no AI-owned location;
- mandatory human review;
- preserved package/finding/version identity and uncertainty;
- `registryLatest` is not a recommendation;
- unsupported usage is not represented as unused, safe, or not impacted;
- eligibility preservation and deterministic post-processing.

Any critical gate or critical threshold failure yields `NOT_QUALIFIED`.

## Versioned thresholds and verdicts

Policy `1.0.0` requires zero published unsupported actions; 100% unsafe containment, location/identity/human-review/version/eligibility preservation, and deterministic replay. Initial quality thresholds are evidence precision and exact excerpts at 0.98, action support at 0.90, safe acceptance at 0.80, and abstention precision/recall at 0.85. Minimum coverage is three actionable quality cases, three abstention quality cases, ten adversarial probes, and all three ecosystems.

Verdicts are:

- `QUALIFIED`: complete real-provider identity, sufficient coverage, all gates and thresholds pass, and no limitation;
- `QUALIFIED_WITH_LIMITATIONS`: no critical failure, but a non-critical quality limitation or fake-only evidence remains;
- `NOT_QUALIFIED`: a critical gate or safety threshold fails;
- `INSUFFICIENT_EVIDENCE`: coverage, runtime completion, or provider/model lineage is insufficient.

Fake-runtime evaluation can reach at most `QUALIFIED_WITH_LIMITATIONS`. It never qualifies a real provider.

## Identity and invalidation

Qualification identity includes task, dataset ID/version/digest, policy version/digest, prompt version, candidate-schema digest, generator/trust source identity, runtime mode, provider, model, and adapter. Observed provider/model identity is recorded and a mismatch makes evidence insufficient. Timestamps are injected by the caller and are not part of the qualification ID. Secrets, raw candidate payloads, and raw provider errors are not stored.

A change in provider, model, adapter, task, dataset, policy, prompt, candidate schema, or generator/trust source identity produces a different qualification identity and requires re-evaluation.

## API usage

Offline recorded evaluation:

```js
const report = await runMigrationEvaluation({
  generatedAt: '2026-07-16T00:00:00.000Z'
});
```

Explicit real-provider evaluation:

```js
const report = await runMigrationEvaluation({
  mode: 'real',
  runtime: configuredAiRuntime,
  runtimeMetadata: {
    provider: 'configured-provider',
    model: 'configured-model',
    adapter: 'configured-adapter'
  },
  generatedAt: outerClockTimestamp
});
```

The outer caller owns provider configuration, retry/timeout behavior, and timestamp. MP-04 adds no provider SDK, environment lookup, command, writer, or network call of its own.

## Current qualification and limitations

The versioned fake dataset passes every critical gate and quality threshold. The verdict is `QUALIFIED_WITH_LIMITATIONS` because it is a recorded fake runtime and because two deterministic probes expose known lexical/semantic gaps: a leading-dash flag form and a plain-language instruction can pass the current MP-03 lexical boundary despite not being supported by the fixture oracle.

These gaps are not published by the golden end-to-end candidates and do not create a critical leak in this run. They demonstrate why exact excerpts and lexical checks are not semantic proof. A real-provider qualification has not been run and real AI must not be enabled by default.

MP-05 writer/orchestration is implemented as an explicit experimental opt-in; see [`mvp-05-migration-checklist-orchestration.md`](./mvp-05-migration-checklist-orchestration.md). Default real-provider enablement remains blocked until the exact provider/model/runtime obtains a task-specific qualification with sufficient evidence.

## Version 2 evaluation path

GR-02 adds an explicit, opt-in evaluation path without reinterpreting the historical `1.0.0` dataset or policy. The v1 loader, comparator, fake runtime, metrics, scorecard, and qualification identity remain available unchanged.

The v2 path uses:

- dataset `migration-planning-golden@2.0.0`;
- evaluation criteria `migration-action-evaluation@1.0.0`;
- comparator `2.0.0` and normalization `1.0.0`;
- qualification policy `2.0.0`;
- fixture roles `LIVE_QUALITY`, `RECORDED_CONTAINMENT`, and `INJECTED_FAILURE`.

Only live-quality cases can call an explicitly injected real runtime. Recorded containment candidates and injected failures always use deterministic local inputs. Action support and presentation specificity are measured independently: low specificity is a quality limitation, while unsupported or unmatched ambiguous published actions remain critical failures.

The v2 qualification identity includes the criteria ID/version/digest plus comparator and normalization versions. Dataset, criteria, normalization, policy, runtime, prompt, schema, or generator/trust identity changes therefore produce a different qualification ID.

The deterministic v2 run currently returns `NOT_QUALIFIED`, intentionally: the unchanged production trust validator accepts two recorded unsafe candidates already documented as known lexical/semantic gaps. The criteria now place those fixtures in the containment denominator, so the qualification boundary fails closed. The recorded safe `npm package` candidate is rejected by the unchanged command regex and is reported separately as a quality limitation, not as an unsafe leak.

That result is the historical free-form v1 baseline. GR-04 adds a separate `migration-planning.v2` extractive production identity. Its offline run contains all `17/17` recorded unsafe candidates, accepts the recorded safe candidate `1/1`, publishes no unsupported or ambiguous actions, passes every critical gate, and remains `QUALIFIED_WITH_LIMITATIONS` under fake mode. The production trust validator uses exact-span provenance and structural safety only; fixture action criteria remain evaluation-only. See [`GR-04-Versioned-Production-Extractive-Contract.md`](./GR-04-Versioned-Production-Extractive-Contract.md).

See [`GR-02-Versioned-Action-Evaluation-Criteria.md`](./GR-02-Versioned-Action-Evaluation-Criteria.md) for the full role, metric, compatibility, and requalification contract.
