# AE-05 — AI Engineering Production Readiness Review

## Executive Summary

UpgradeLens has a strong AI Engineering foundation for an open-source project: the core pipeline is contract-driven, deterministic where it should be deterministic, and bounded by explicit trust and evaluation layers. MVP-03 produces a schema-validated `version-analysis.json`; AE-01 through AE-04 add a golden dataset, evaluation runner, metrics, scorecard, and benchmark framework without coupling the core to a specific provider or model.

Production readiness is **PARTIAL**.

The project is ready to begin **MVP-04 — AI Impact Analysis** against the existing Version Analysis artifact contract and schema-valid fixtures. It is not ready to claim real end-to-end production readiness because the real `discover → research → analyze-version` path is blocked by the missing Knowledge Evidence Bundle producer. The consumer side exists, but the producer artifact is not yet created by MVP-02 tooling.

Recommended decision:

```text
MVP-04 implementation: GO
Production-like real repository validation: NO GO until Evidence Bundle producer exists
```

## Architecture Review

### Dependency direction

The dependency direction is mostly clean and one-way:

```text
Discovery
  ↓
Knowledge Research
  ↓
Dependency AI Context
  ↓
AI Version Analysis
  ↓
Version Analysis Manifest
  ↓
Evaluation
  ↓
Metrics
  ↓
Scorecard
  ↓
Benchmark
```

The newer AI Engineering layers reuse lower layers instead of duplicating them:

- `evaluation-runner` consumes golden cases and calls the same AI analysis path.
- `metrics-engine` consumes only `evaluation-report.json`.
- `ai-scorecard` consumes only metrics.
- `benchmark-runner` orchestrates Evaluation Runner, Metrics Engine, and Scorecard.

This direction is healthy. Benchmark does not call the AI core directly; metrics do not call evaluation; scorecard does not know about models.

### Architecture boundaries

| Boundary | Assessment |
| --- | --- |
| Project Discovery | Clear. Owns repository/project/dependency facts only. |
| Knowledge Research | Clear for package facts/provenance/cache. Incomplete for portable evidence content. |
| Knowledge Evidence Bundle | Correctly modeled as MVP-02.x output, but producer is missing. This is the main readiness blocker. |
| Dependency AI Context | Strong deterministic layer: one dependency occurrence, stable ordering, digest, ecosystem adapter boundary. |
| AI Runtime | Provider-neutral abstraction exists. Real runtime hardening is still limited. |
| Prompt Builder | Generic and scoped; currently source-code prompt template rather than external prompt asset. |
| Structured Output | Schema validation exists and rejects invalid free-form output. |
| Trust Layer | Strong for invented refs/URLs, deterministic facts, missing evidence, declared constraints, and source conflicts. Semantic entailment is not checked. |
| Manifest | Good machine contract for MVP-04; schema and invariants protect deterministic fields and evidence refs. |
| Evaluation | Golden dataset and runner are provider-neutral and CI-safe. |
| Metrics | Deterministic metrics cover key quality gates without model judgment. |
| Benchmark | Reuses evaluation/metrics/scorecard; ranking is deterministic and provider-neutral. |

### Modularity and extensibility

The design is extensible without requiring an AI core rewrite for future ecosystems or providers:

- Version adapters isolate ecosystem-specific version rules.
- `AiRuntime` isolates provider behavior from analysis/trust logic.
- Evaluation data is provider-neutral.
- Benchmark config can compare prompt versions, providers, models, and local runtimes.

Known extensibility gaps:

- Java, .NET, Go, Rust, Ruby, and other ecosystems can be represented in datasets/benchmark metadata, but production discovery/research inventory is still strongest for Node and Python.
- Runtime config documentation is thin.
- Provider timeout/retry/error taxonomy is not mature yet.

## End-to-End Validation

Validation used a temporary copy of the real UpgradeLens repository:

```text
<TEMPORARY_UPGRADELENS_CHECKOUT>
```

### Commands run

```bash
node bin/upgradelens.js discover <TEMPORARY_UPGRADELENS_CHECKOUT>
node bin/upgradelens.js research <TEMPORARY_UPGRADELENS_CHECKOUT> --offline
node bin/upgradelens.js analyze-version <TEMPORARY_UPGRADELENS_CHECKOUT> --stdout
node bin/upgradelens.js eval --dataset eval/datasets --output evaluation-report.json
node bin/upgradelens.js scorecard --report evaluation-report.json --metrics-output metrics.json --output ai-scorecard.json
node bin/upgradelens.js benchmark --config benchmark.json --output benchmark-report.json
```

### Results

| Step | Result | Evidence |
| --- | --- | --- |
| `discover` | PASS | Found 1 Node project. |
| `research --offline` | PASS with unavailable packages | Planned 3 packages and wrote Knowledge Manifest. |
| `analyze-version` | FAIL before AI | Missing `.upgradelens/knowledge-evidence-bundle.json`. |
| `eval` | PASS | 10 passed / 0 failed. |
| `scorecard` | PASS | Overall score 100/100. |
| `benchmark` | PASS | 2 golden-fake runs, deterministic ranking. |

Project dependencies discovered in the real repo copy:

```json
[
  { "name": "ajv", "version": "^8.18.0", "type": "dependency" },
  { "name": "ajv-formats", "version": "^3.0.1", "type": "dependency" },
  { "name": "undici", "version": "^6.27.0", "type": "dependency" }
]
```

Knowledge Research offline result:

```json
{
  "packageCount": 3,
  "resolvedPackageCount": 0,
  "unavailablePackageCount": 3,
  "warningCount": 3,
  "cacheMissCount": 3
}
```

The analysis blocker was:

```text
ENOENT: no such file or directory, open '<TEMPORARY_UPGRADELENS_CHECKOUT>/.upgradelens/knowledge-evidence-bundle.json'
```

This is not an AI Runtime, prompt, or benchmark failure. It is a missing upstream artifact producer.

## Real Repository Validation

VinGrade was not found under the local Desktop workspace during this review, so the real repository validation used UpgradeLens itself.

### Real repository assessment

| Area | Assessment |
| --- | --- |
| Repository discovery | Useful and correct for the real repo. Detected Node and the three runtime dependencies. |
| Knowledge research | Operational in offline mode; correctly represented unavailable packages without fabricating facts. |
| Evidence | Not available because Knowledge Evidence Bundle producer is missing. |
| AI output | Not assessable on real repo; AI analysis did not start. |
| Risk | Not assessable on real repo. |
| Trust layer | Not exercised on real repo due missing Evidence Bundle. Unit/golden tests cover trust behavior. |
| Human review | Not assessable on real repo. Golden tests cover declared constraint, missing evidence, conflict, high risk, and unknown risk. |
| Usefulness | Current real repo pipeline is useful for discovering the handoff blocker; not yet useful as a real user-facing version analysis workflow. |

The validation result is important: UpgradeLens can run the early deterministic stages on a real repository, but cannot yet produce a real `version-analysis.json` from real research output without the MVP-02.x Evidence Bundle.

## AI Engineering Scorecard

| Category | Score (/10) | Nhận xét |
| --- | ---: | --- |
| Context Engineering | 8 | Deterministic, per-dependency, bounded, digestable, and source-conflict aware. Missing token-aware budgeting and real evidence producer coverage. |
| Prompt Engineering | 7 | Prompt is clear, generic, and restrictive. Prompt is still embedded in source and lacks injection regression fixtures. |
| Grounding | 7 | Evidence refs are allowlisted, invented refs/URLs are handled, and conflicts downgrade risk. Semantic entailment is not validated. |
| Structured Output | 9 | Strict schema validation, no regex parsing, invalid output does not publish claims. |
| Trust Layer | 8 | Deterministic review policy covers unknown/high risk, missing evidence, declared constraints, dropped claims, invented URLs, and source conflicts. Missing deeper applicability/entailment rules. |
| Evaluation | 9 | Golden dataset and runner are provider-neutral, deterministic, and CI-safe. Dataset is still small. |
| Metrics | 8 | Deterministic metrics and scorecard are useful. No semantic, latency/cost real-provider metrics yet. |
| Benchmark | 8 | Config/report/ranking are clean and reuse existing layers. Real model benchmarking is not yet exercised. |
| Extensibility | 8 | Provider/model/prompt boundaries are good. More ecosystem adapters and public runtime docs are needed. |
| Developer Experience | 7 | CLI covers core flows and tests are strong. Missing docs for runtime config, benchmark config, and Evidence Bundle generation. |

Overall AI Engineering Score:

```text
7.9 / 10
```

This score reflects strong architecture and testability, with production readiness limited mainly by the missing Evidence Bundle producer and real-provider operational hardening.

## Production Readiness Checklist

| Area | Status | Explanation |
| --- | --- | --- |
| Discovery | READY | Real repo validation succeeded; schema and invariants are mature. |
| Knowledge | PARTIAL | Knowledge Manifest is mature, but portable Evidence Bundle production is missing. |
| AI Runtime | PARTIAL | Provider abstraction exists; timeout/retry/error taxonomy and real-provider docs are thin. |
| Prompt | PARTIAL | Prompt is generic and guarded; no external prompt asset or injection fixture yet. |
| Trust | READY | Core deterministic trust behavior is implemented and tested, including source conflict propagation. |
| Version Analysis | PARTIAL | Consumer pipeline and manifest work with evidence; real repo path blocked by missing Evidence Bundle. |
| Golden Dataset | READY | 10 cases cover high/medium/low/unknown/missing evidence/declared constraint/conflict. |
| Evaluation | READY | Evaluation runner works without real model calls and validates expected outcomes. |
| Metrics | READY | Deterministic metrics and scorecard exist and validate. |
| Benchmark | READY | Benchmark config/report/ranking exist and reuse evaluation/metrics/scorecard. |
| CLI | PARTIAL | Commands exist; `analyze-version` cannot complete on real repo without Evidence Bundle. Runtime/config docs need improvement. |
| Documentation | PARTIAL | Architecture docs exist; user-facing docs for Evidence Bundle, provider runtime, metrics, and benchmark configs are incomplete. |
| Test Coverage | READY | Current full suite passes with one sandbox-related skip. |
| Provider Abstraction | READY | Runtime/provider boundary is generic and not OpenAI-specific. |

Overall Production Readiness:

```text
PARTIAL
```

## Technical Debt

### Critical

1. **Knowledge Evidence Bundle producer is missing.**
   - Real `analyze-version` fails before AI analysis because `.upgradelens/knowledge-evidence-bundle.json` is absent.
   - This blocks production-like end-to-end validation and real user workflows.

### High

1. **No semantic entailment validation.**
   - A model can cite a valid evidence ID while making a claim stronger than the evidence supports.

2. **Real-provider runtime hardening is incomplete.**
   - Timeout, cancellation, retry, provider-specific error taxonomy, and rate-limit handling are not mature.

3. **Prompt injection regression tests are missing.**
   - Prompt guardrails exist, but there is no adversarial evidence fixture.

4. **Provider/runtime configuration documentation is insufficient.**
   - Generic HTTP runtime exists, but contributor/operator guidance is thin.

### Medium

1. **Golden dataset is small.**
   - It is good for foundation regression but too small for serious model selection.

2. **Context budget is character-based.**
   - Token-aware budgeting should be added before large real evidence bundles.

3. **Applicability validation is shallow.**
   - Findings are structurally valid but not deeply checked against target/relevant releases.

4. **Real benchmark metadata is sparse.**
   - Latency, token usage, and cost remain null unless runtime provides them.

5. **Prompt versioning is functional but not asset-based.**
   - Prompt versions are supported in benchmark/evaluation, but prompt text remains source-embedded.

### Low

1. **No self-reported digest in several generated artifacts.**
   - Digests can be computed externally, but embedded digest fields would improve auditability.

2. **CLI option surface is minimal.**
   - This is acceptable for foundation scope, but later users will need clearer target/runtime/config options.

3. **Documentation does not yet present an end-to-end contributor workflow.**
   - Add examples for eval, scorecard, benchmark, and future Evidence Bundle generation.

## Gap Analysis

UpgradeLens already has the core shape of an AI Engineering project:

- deterministic context construction;
- provider-neutral runtime boundary;
- prompt constraints;
- structured output validation;
- trust validation;
- artifact schemas;
- golden evaluation;
- deterministic metrics;
- scorecard;
- benchmark orchestration.

To be considered mature, it still needs:

1. **Portable Evidence Bundle production.**
   - Without this, real version analysis cannot run from normal research output.

2. **Semantic evaluation or entailment checks.**
   - Deterministic evidence ID validation is necessary but not sufficient for claim truth.

3. **Real-provider replay and traceability.**
   - Need reproducible run IDs, provider metadata, non-secret request/response traces, and replay strategy.

4. **Operational observability.**
   - Latency, token usage, cost, timeout, retry, and provider error metrics should be collected outside portable artifacts.

5. **Prompt lifecycle.**
   - External prompt assets, changelog, version comparison, and injection tests.

6. **Larger and more diverse golden dataset.**
   - More ecosystems, more dependency families, more conflict/missing/stale evidence cases, and real-world annotations.

7. **Real repository validation corpus.**
   - At least a few open-source repos with known upgrades and expected impact outcomes.

## MVP-04 Readiness

Decision:

```text
GO for MVP-04 implementation
NO GO for production-like real repository validation
```

MVP-04 can start because:

- `version-analysis.json` has a stable schema and deterministic validation.
- MVP-04 can consume dependency identity, versions, selected evidence refs, findings, risk, limitations, validation state, and human-review flags.
- Evaluation, metrics, and benchmark layers can test future MVP-04-facing changes without live model calls.
- The current architecture keeps release-level analysis separate from project-specific impact, which is exactly the boundary MVP-04 needs.

MVP-04 must not assume real end-to-end production readiness yet because:

- the real pipeline cannot produce `version-analysis.json` without a Knowledge Evidence Bundle;
- real AI output quality has not been validated on a real repository;
- semantic grounding is not mature enough for automated migration or impact decisions without human review.

Recommended MVP-04 approach:

1. Start MVP-04 using schema-valid `version-analysis.json` fixtures.
2. Treat `unknown`, `declaredConstraint`, `SOURCE_CONFLICT`, missing evidence, and high-risk results as first-class MVP-04 input cases.
3. Keep source-code impact analysis separate from release-level risk.
4. Do not claim full real-repo workflow readiness until Evidence Bundle production is implemented.

## Recommended Backlog

### Before claiming end-to-end readiness

1. Implement MVP-02.x Knowledge Evidence Bundle producer.
2. Add CLI/docs for producing and validating the Evidence Bundle.
3. Add a real repo validation fixture that reaches `version-analysis.json`.
4. Add runtime timeout/cancellation and provider error taxonomy.

### Before serious model/prompt selection

1. Expand golden dataset from 10 cases to a larger multi-ecosystem set.
2. Add adversarial prompt-injection evidence cases.
3. Add real provider benchmark runs with latency/token/cost metadata.
4. Add benchmark documentation and sample configs.

### Before automated or low-review impact workflows

1. Add semantic entailment or human-annotated claim-quality evaluation.
2. Add finding applicability validation against target/relevant releases.
3. Add replayable non-secret traces for real provider runs.
4. Add observability outside portable artifacts.

## Validation Evidence

Foundation validation from the current workspace:

```text
npm test: 192 pass, 1 skip, 0 fail
git diff --check: pass
```

Golden AI Engineering artifacts from AE-05 validation:

```json
{
  "evaluation": { "totalCases": 10, "passed": 10, "failed": 0 },
  "metrics": {
    "risk": 1,
    "humanReview": 1,
    "evidenceReferenceCoverage": 1,
    "unsupportedClaimRate": 0,
    "deterministic": 1
  },
  "scorecard": {
    "overall": 100,
    "categories": {
      "riskAnalysis": 100,
      "humanReview": 100,
      "evidenceQuality": 100,
      "trustLayer": 100,
      "deterministicQuality": 100
    }
  },
  "benchmark": {
    "runs": 2,
    "topRun": "prompt-v1-golden"
  }
}
```

These results support a `GO` decision for MVP-04 implementation, while the real repository blocker supports a `PARTIAL` production readiness rating.
