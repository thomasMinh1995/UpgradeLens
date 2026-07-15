# UpgradeLens Golden Evaluation Dataset

This directory contains provider-independent golden cases for AI Version Analysis quality evaluation.

AE-01 only defines dataset contracts and sample cases. It does not add an evaluation runner, metrics, telemetry, prompt optimization, or model comparison.

## Structure

```text
eval/
  schemas/
    golden-case.schema.json
    expected-result.schema.json
  datasets/
    node/
    python/
    generic/
```

Each file under `eval/datasets/**` is one JSON golden case. The first path segment groups cases by ecosystem or cross-ecosystem behavior. Future ecosystems such as Maven, NuGet, Cargo, Go, or Ruby should add sibling folders without changing the core case schema.

## Golden Case Contract

A case describes:

- repository fixture identity;
- ecosystem and dependency identity;
- current and target version facts;
- selected evidence that the AI is allowed to use;
- expected result assertions.

Cases are portable and provider-neutral. They must not store prompts, raw model outputs, chain-of-thought, provider names, model names, latency, token usage, or telemetry.

## Expected Result Contract

Expected results store only machine-checkable outcomes:

- expected `riskLevel`;
- expected human review boolean and reason codes;
- expected evidence coverage and validation state;
- expected evidence references;
- expected finding kinds, applicable versions, evidence refs, and optional required keywords;
- forbidden claim categories such as `source-code impact`.

The expected result is not a transcript of what a model should say. Summaries and prose are intentionally not golden-string matched.

## Naming

Use lowercase kebab-case:

```text
eval/datasets/<group>/<dependency>-<scenario>.json
```

Examples:

```text
eval/datasets/node/react-major-breaking.json
eval/datasets/python/pydantic-major-breaking.json
eval/datasets/generic/missing-evidence.json
```

The case `id` must match the dataset grouping style, such as `node/react-major-breaking`.

## Contributor Guidelines

When adding a case:

1. Keep evidence bounded and directly relevant to the current → target analysis.
2. Use stable fake digests that match the `sha256:<64 hex>` shape.
3. Do not include provider-specific fields or prompts.
4. Do not encode chain-of-thought or hidden reasoning.
5. Prefer one behavioral focus per case.
6. Use `generic/` for cross-ecosystem behavior such as missing evidence, declared constraints, conflicts, and validation edge cases.
7. Add new ecosystem folders only when the case needs ecosystem-specific version behavior.

## Validation

Dataset validation is schema-only in AE-01. The test suite loads every `eval/datasets/**/*.json` file and validates it against `eval/schemas/golden-case.schema.json`, which references `expected-result.schema.json`.

AE-02 can build on this by adding an evaluation runner, metrics, fake-model replay, and model/prompt comparison. AE-01 deliberately stops before those steps.
