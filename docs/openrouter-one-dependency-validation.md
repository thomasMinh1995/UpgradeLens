# OpenRouter One-Dependency Enriched Evidence Validation

**IMPLEMENTED — NOT YET EXECUTED**

## 1. Purpose

This procedure validates one real dependency with its enriched release/changelog evidence through the existing OpenAI-compatible runtime and Version Analysis path. It is a bounded manual transport and integration check, not a model benchmark, qualification, or production certification.

The intended path is:

```text
one real dependency
→ enriched evidence
→ exact OpenRouter model slug
→ structured output
→ JSON Schema/Ajv validation
→ Trust Layer
→ version-analysis.json
```

## 2. Prerequisites

- An OpenRouter API key and sufficient credit/quota for the exact selected model.
- A repository in which `discover` and `research` have already completed.
- An enriched Knowledge Evidence Bundle produced by the current UpgradeLens research flow.
- One exact OpenRouter model slug chosen by the maintainer.
- A Node.js version supported by UpgradeLens.
- The current UpgradeLens binary, or an existing local `npm link` installation.

## 3. Local `.env`

From the UpgradeLens checkout, create an ignored local file:

```bash
cp .env.example .env
```

Then replace the placeholders locally:

```dotenv
UPGRADELENS_AI_MODEL=<exact-model-slug>
UPGRADELENS_AI_AUTHORIZATION=Bearer <real-key>
```

Do not send the key to Codex, chat, logs, or issue reports. Never commit `.env`.

UpgradeLens does not load `.env` automatically and does not search parent directories for runtime configuration. Node `--env-file` should not be assumed to interpolate `${OPENROUTER_API_KEY}` inside `.env`. Put the complete local value directly in that ignored file:

```dotenv
UPGRADELENS_AI_AUTHORIZATION=Bearer <REAL_OPENROUTER_KEY>
```

## 4. Configurations Maintainer Must Add

The manual run requires exactly these runtime settings:

```text
UPGRADELENS_AI_PROVIDER=openai-compatible
UPGRADELENS_AI_ENDPOINT=https://openrouter.ai/api/v1/chat/completions
UPGRADELENS_AI_MODEL=<exact-model-slug>
UPGRADELENS_AI_AUTHORIZATION=Bearer <real-openrouter-key>
UPGRADELENS_AI_TIMEOUT_MS=180000
```

- `UPGRADELENS_AI_PROVIDER` remains `openai-compatible`; OpenRouter is not hardcoded into the AI core.
- `UPGRADELENS_AI_ENDPOINT` is the OpenRouter Chat Completions endpoint.
- `UPGRADELENS_AI_MODEL` is one exact model slug selected by the maintainer. Do not use `openrouter/auto` or `openrouter/free`.
- `UPGRADELENS_AI_AUTHORIZATION` is `Bearer` followed by the real local OpenRouter key.
- `UPGRADELENS_AI_TIMEOUT_MS` is the bounded runtime deadline; `180000` is the suggested validation value.

No `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GOOGLE_API_KEY` is required by this procedure.

## 5. Loading Environment

### Option A — Node env file

Use the local ignored `.env` without relying on any automatic application loader:

```bash
node --env-file=.env /path/to/UpgradeLens/bin/upgradelens.js \
  analyze-version . \
  --package pypi:langsmith
```

Replace `/path/to/UpgradeLens` with the maintainer's local checkout path.

### Option B — Shell exports

If the OpenRouter key is already present in a private shell variable, export the five UpgradeLens settings explicitly:

```bash
export UPGRADELENS_AI_PROVIDER="openai-compatible"
export UPGRADELENS_AI_ENDPOINT="https://openrouter.ai/api/v1/chat/completions"
export UPGRADELENS_AI_MODEL="<exact-model-slug>"
export UPGRADELENS_AI_AUTHORIZATION="Bearer ${OPENROUTER_API_KEY}"
export UPGRADELENS_AI_TIMEOUT_MS="180000"

upgradelens analyze-version . --package pypi:langsmith
```

The placeholders above are documentation only; never paste a real key into a committed file or shared command transcript.

## 6. Preparing Enriched Evidence

The maintainer should prepare the target repository before loading the cloud runtime configuration:

```bash
upgradelens discover .
upgradelens research .
```

Confirm that these artifacts exist without printing their full contents:

```text
.upgradelens/project-manifest.json
.upgradelens/knowledge-manifest.json
.upgradelens/knowledge-evidence-bundle.json
```

The `analyze-version` command reads these artifacts but does not modify them.

## 7. Recommended First Dependency

The recommended initial selector is:

```text
pypi:langsmith
```

KR-10 found an exact baseline, a target, nearby release notes, and real enriched context for this package. The package is not hardcoded in UpgradeLens; another exact canonical ID can be supplied with `--package`.

The selector is exact and case-sensitive. Bare names, wildcard/regex selectors, multiple package values, and automatic package choice are not supported. If one package ID maps to multiple dependency occurrences, the command stops before creating the runtime so the run cannot exceed one dependency call.

## 8. Manual Validation Command

With the ignored `.env` populated locally:

```bash
node --env-file=.env /path/to/UpgradeLens/bin/upgradelens.js \
  analyze-version . \
  --package pypi:langsmith
```

When UpgradeLens is already linked, the equivalent command is:

```bash
upgradelens analyze-version . --package pypi:langsmith
```

## 9. Expected Checks

After the maintainer runs the command, verify all of the following rather than assuming success:

- Exactly one runtime call occurred.
- The selected result has status `analyzed`.
- The candidate passed structured JSON Schema/Ajv validation.
- The Trust Layer passed.
- Every evidence reference belongs to the enriched Evidence Bundle.
- The output contains no invented URL, API, migration step, or evidence reference.
- The risk assessment has evidence support.
- The human-review decision follows the current policy.
- `.upgradelens/version-analysis.json` is valid.
- No retry or fallback occurred.

These are post-run checks, not claims that the validation has already passed.

## 10. Security

- Do not log the key or include it in errors, artifacts, fixtures, documentation, or chat.
- Do not store the Authorization header in `version-analysis.json` or another report.
- Do not commit `.env`; only `.env.example` is intended for version control.
- Do not persist the raw prompt, full evidence payload, or raw provider response in a report.
- Do not use an automatic model router for this validation.
- Enriched evidence is sent to a cloud service. The maintainer must explicitly accept this disclosure and use only repositories/evidence permitted to leave the local environment.

## 11. Interpretation

One successful request demonstrates only this combined path:

```text
OpenRouter transport
+ exact selected model
+ enriched evidence
+ structured-output/trust path
```

It does not prove that:

- the model is `CERTIFIED`;
- the upstream provider route is reproducible;
- this is the best model;
- the model is ready for MVP-04 or MVP-05;
- benchmark quality gates pass.

An exact model slug prevents model-level automatic selection, but OpenRouter may still route that model through multiple upstream providers. This setup does not add `provider.only`, `allow_fallbacks: false`, or other OpenRouter-specific request fields because the current adapter has no generic safe request-extra contract. Provider pinning and fallback control belong to a separate gateway-conformance task. This run is therefore not a reproducible locked-provider benchmark.

## 12. Status

```text
Execution status: NOT RUN
Qualification status: EXPERIMENTAL
Production certification: NONE
```

Tests and live OpenRouter validation were intentionally deferred to the maintainer.
