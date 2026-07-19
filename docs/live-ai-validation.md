# Live AI Validation — Model + Real Evidence

Date: 2026-07-15

## Executive Summary

Live AI Validation is **not complete**.

UpgradeLens successfully ran the real-evidence portion of the production pipeline:

```text
discover
  ↓
research
  ↓
knowledge-manifest.json
knowledge-evidence-bundle.json
```

The validation then stopped at `analyze-version` because no real AI runtime was configured in the environment. The run did **not** use a fake runtime, golden runtime, registry fixtures, or manually edited evidence.

This means the MVP-02-09 blocker is resolved for real registry evidence, but the live model gate is still blocked by runtime configuration.

## Repository

Preferred repository: `VinGrade`

Result: `VinGrade` was not available in the local filesystem during validation.

Fallback repository: `UpgradeLens`

Validation root:

```text
<TEMPORARY_LIVE_VALIDATION_REPOSITORY>
```

The fallback repository was a temporary copy containing the real `UpgradeLens` package manifest. This avoided modifying the working repository while still exercising the production CLI against real npm registry metadata.

Repository dependencies discovered:

| Dependency | Declared Version | Ecosystem |
| ---------- | ---------------- | --------- |
| `ajv` | `^8.18.0` | npm |
| `ajv-formats` | `^3.0.1` | npm |
| `undici` | `^6.27.0` | npm |

The repository has only three discovered dependencies, so the requested random review of at least five dependencies could not be completed with this repository.

## Model

Model: **not available**

Runtime environment:

```text
UPGRADELENS_AI_ENDPOINT       unset
UPGRADLENS_AI_ENDPOINT        unset
UPGRADELENS_AI_PROVIDER       unset
UPGRADELENS_AI_MODEL          unset
UPGRADELENS_AI_AUTHORIZATION  unset
OPENAI_API_KEY                unset
OPENAI_BASE_URL               unset
OPENAI_MODEL                  unset
ANTHROPIC_API_KEY             unset
GOOGLE_API_KEY                unset
```

The CLI requires a configured `UPGRADELENS_AI_ENDPOINT` or an injected `AiRuntime`. Injection was intentionally not used because this validation forbids fake or golden runtimes.

## Prompt Version

Prompt version: `1`

Source: `VERSION_ANALYSIS_PROMPT_VERSION` in `src/ai-version-analysis.js`.

## Pipeline Result

| Step | Result | Notes |
| ---- | ------ | ----- |
| `discover` | PASS | Project Manifest was generated in the temporary repository. |
| `research` | PASS | Real npm registry evidence was fetched after running with network permission. |
| `analyze-version` | FAIL | Blocked because no real AI runtime was configured. |
| `eval` | NOT RUN | Would fall back to golden fake without a configured runtime; skipped to respect validation rules. |
| `scorecard` | NOT RUN | Depends on evaluation output; skipped. |
| `benchmark` | NOT RUN | Depends on model/runtime validation; skipped. |

Command evidence:

```text
node bin/upgradelens.js discover <TEMPORARY_LIVE_VALIDATION_REPOSITORY>
```

Result:

```text
Discovered 1 project(s).
Manifest: <TEMPORARY_LIVE_VALIDATION_REPOSITORY>/.upgradelens/project-manifest.json
```

```text
node bin/upgradelens.js research <TEMPORARY_LIVE_VALIDATION_REPOSITORY>
```

Result:

```text
✓ Loaded Project Manifest
✓ Planned research (3 packages)
✓ Research complete
✓ Knowledge Manifest validated
✓ Wrote:
<TEMPORARY_LIVE_VALIDATION_REPOSITORY>/.upgradelens/knowledge-manifest.json
✓ Knowledge Evidence Bundle validated
✓ Wrote:
<TEMPORARY_LIVE_VALIDATION_REPOSITORY>/.upgradelens/knowledge-evidence-bundle.json
```

```text
node bin/upgradelens.js analyze-version <TEMPORARY_LIVE_VALIDATION_REPOSITORY>
```

Result:

```text
upgradelens: AI runtime is not configured. Set UPGRADELENS_AI_ENDPOINT or provide an AiRuntime.
```

## Artifact Summary

### Project Manifest

Generated:

```text
<TEMPORARY_LIVE_VALIDATION_REPOSITORY>/.upgradelens/project-manifest.json
```

### Knowledge Manifest

Generated:

```text
<TEMPORARY_LIVE_VALIDATION_REPOSITORY>/.upgradelens/knowledge-manifest.json
```

Package resolution:

| Package | Status | Registry Latest |
| ------- | ------ | --------------- |
| `npm:ajv` | resolved | `8.20.0` |
| `npm:ajv-formats` | resolved | `3.0.1` |
| `npm:undici` | resolved | `8.7.0` |

Warnings: `0`

### Knowledge Evidence Bundle

Generated:

```text
<TEMPORARY_LIVE_VALIDATION_REPOSITORY>/.upgradelens/knowledge-evidence-bundle.json
```

Summary:

```json
{
  "schemaVersion": "1.0.0",
  "evidenceCount": 3,
  "warningCount": 0
}
```

Evidence references:

| Package | Evidence ID | Kind | Release Versions |
| ------- | ----------- | ---- | ---------------- |
| `npm:ajv` | `sha256:4857f89db56ac95775a1fcb4fdac2aff719481300f1e0d79ece558190c117273` | `registryFact` | `8.20.0` |
| `npm:undici` | `sha256:4b0e9da799e844dff7e608252d103e6c49260b35bda6f0a88753d7d55f7ffac3` | `registryFact` | `8.7.0` |
| `npm:ajv-formats` | `sha256:b8e04856e6cafc92fe70e2b15d36fcdfb952494e003fbd63f0c3b168f7269bef` | `registryFact` | `3.0.1` |

## AI Output Review

AI output was not produced because `analyze-version` could not construct a real runtime.

Validation answers:

| Question | Answer |
| -------- | ------ |
| Artifact được sinh đầy đủ? | NO — Project, Knowledge Manifest, and Evidence Bundle were generated; Version Analysis was not. |
| AI có trả structured output hợp lệ? | NO — no model call occurred. |
| Trust Layer có pass? | NO — trust validation could not run without AI output. |
| Evidence references hợp lệ? | PARTIAL — bundle references are valid before AI; AI evidence references could not be assessed. |
| Invented evidence reference? | Not assessable — no AI output. |

## Trust Review

Trust layer execution was blocked by missing AI runtime.

Pre-AI checks that did pass:

- real registry evidence bundle was generated;
- bundle schema validated;
- evidence IDs were deterministic digests;
- evidence referenced known package IDs and source IDs;
- no bundle-level evidence conflicts were present;
- no manually edited or injected evidence was used.

Trust checks not reached:

- invented evidence reference detection;
- invented URL detection;
- deterministic field mutation protection;
- risk downgrade;
- human-review policy on model output.

## Human Review

Human review policy could not be evaluated against AI output.

Manual dependency review from available repository dependencies:

| Dependency | Observed Version Situation | Manual Review |
| ---------- | -------------------------- | ------------- |
| `ajv` | Declared `^8.18.0`, registry latest `8.20.0` | Likely low-to-medium operational risk, but declared constraint means installed version is unresolved and should require review under current policy. |
| `ajv-formats` | Declared `^3.0.1`, registry latest `3.0.1` | Likely no upgrade delta if installed version is already compatible, but exact installed version is unresolved. |
| `undici` | Declared `^6.27.0`, registry latest `8.7.0` | Major-version target from 6 to 8 appears higher risk and should require human review. |

The requested sample size of five dependencies was not possible because the fallback repository exposes only three dependencies.

## Evaluation Result

`upgradelens eval` was intentionally not run.

Reason: with no configured real runtime, the current CLI would use the golden fake runtime by default. That would violate this validation's rule:

```text
Không dùng Fake Runtime
Không dùng Golden Runtime
```

## Benchmark Result

`upgradelens benchmark` was intentionally not run.

Reason: benchmark must validate a real model/runtime for this task. No model runtime was configured.

## Known Issues

### Critical

- Live AI validation cannot complete until a real `UPGRADELENS_AI_ENDPOINT` is configured.

### High

- No local `VinGrade` repository was available, so the preferred real repository could not be used.
- The fallback `UpgradeLens` dependency set has only three dependencies, which is insufficient for the requested five-dependency manual review sample.

### Medium

- The real Evidence Bundle currently contains registry facts only. This proves portability and lineage, but it is still thin evidence for high-quality risk analysis.
- If `eval` is run without a configured endpoint, it falls back to golden fake runtime. That is useful for CI but unsafe for live-model validation unless explicitly called out.

### Low

- The first sandboxed `research` run produced `REGISTRY_UNAVAILABLE`; the registry run succeeded only after network permission was granted.

## Recommended Backlog

1. Provide a real AI runtime configuration for validation:

   ```text
   UPGRADELENS_AI_ENDPOINT
   UPGRADELENS_AI_PROVIDER
   UPGRADELENS_AI_MODEL
   UPGRADELENS_AI_AUTHORIZATION, if required
   ```

2. Re-run this validation on `VinGrade` or another repository with at least five dependencies.

3. Add a documented live-validation benchmark config that uses `runtime.type = "environment"` so benchmark can run against the configured provider without relying on golden fake.

4. Expand Evidence Bundle production beyond registry facts when release notes, changelog, or migration-guide source candidates are available.

5. Add a CLI safety option for live validation to fail if evaluation would fall back to golden fake runtime.

## MVP-04 Readiness Decision

Decision: **NO GO for Live AI Validation completion**.

Reason:

- Real evidence generation works.
- Portable Evidence Bundle exists and validates.
- The live model step did not run because no real runtime is configured.
- Therefore there is no evidence yet that structured model output, trust validation, human-review policy, evaluation, scorecard, and benchmark work end-to-end with a real model.

This is not a source-code blocker discovered in UpgradeLens. It is an environment/configuration blocker for live validation.
