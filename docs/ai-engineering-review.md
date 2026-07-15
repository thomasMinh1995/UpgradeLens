# VA-05 — AI Engineering Review & Validation

This document reviews MVP-03 — AI Version Analysis from an AI Engineering perspective. It is a review artifact only: no runtime behavior, prompt, schema, manifest, CLI, or tests were changed as part of VA-05.

## Executive Summary

MVP-03 has a strong deterministic foundation. The implementation separates deterministic context construction from model reasoning, constrains model output with JSON Schema, validates evidence references after the model call, derives human-review requirements deterministically, and publishes a portable `version-analysis.json` artifact for downstream stages.

The main architectural shape is sound enough for MVP-04 to begin against the manifest contract. The biggest readiness gap is operational rather than conceptual: the real CLI pipeline currently requires `.upgradelens/knowledge-evidence-bundle.json`, but the current Knowledge Research CLI does not produce that artifact yet. In validation, `discover` and `research` completed on a real repository copy, while `analyze-version` failed before AI analysis because the Evidence Bundle was missing.

The second major gap is grounding depth. MVP-03 prevents invented evidence IDs and invented URLs, but it does not semantically verify that a cited evidence snippet actually entails the AI claim. That is acceptable for MVP-03, but MVP-04 should treat MVP-03 risk and findings as evidence-grounded release-level inputs, not as project-impact truth.

Overall assessment: **MVP-03 is conditionally ready for MVP-04 implementation**, provided MVP-04 starts by consuming schema-valid `version-analysis.json` fixtures and the backlog item for producing Evidence Bundles is treated as a release blocker for real end-to-end usage.

## AI Engineering Scorecard

| Category | Score (/10) | Review |
| --- | ---: | --- |
| Context Engineering | 8 | Context is deterministic, bounded, per occurrence, and reproducible. It includes selected evidence content only. Missing: token estimates, conflict propagation, and richer package status limitations. |
| Prompt Engineering | 7 | Role and guardrails are clear and ecosystem-generic. Prompt is versioned in code. Injection handling is mostly instruction-based; evidence should be more explicitly framed as untrusted quoted data. |
| Structured Output | 9 | Candidate schema is strict, small, and has `additionalProperties: false`. Manifest schema is versioned and machine-readable. Some max-size constraints are still absent. |
| Grounding | 7 | Evidence IDs are allowlisted and invented refs are removed. Invented URLs are detected. Semantic entailment of claims vs evidence is not verified. Source conflict handling is incomplete. |
| Trust Layer | 8 | Human review is deterministic. Unknown/high risk, missing/partial evidence, declared constraints, and dropped claims are handled. More review rules are needed for conflict and stale applicability. |
| Runtime Architecture | 7 | Provider-neutral runtime exists and is not ecosystem-specific. Real provider path is generic HTTP. Missing timeout, retry, cancellation, and provider error taxonomy. |
| Extensibility | 8 | AI core is mostly ecosystem-neutral. New ecosystems need Project Discovery, Knowledge Research, and version adapter support, not prompt/core rewrites. |
| Developer Experience | 7 | CLI exists and tests use fake runtime cleanly. Real runtime configuration is minimal and under-documented. Missing Evidence Bundle producer makes E2E surprising. |
| Testability | 9 | Unit tests cover valid/invalid AI output, trust validation, manifest invariants, writer, stdout, and CLI happy/failure paths without live model calls. |
| Maintainability | 8 | Code is modular and follows repo conventions. Some logic is still embedded in JS objects instead of external prompt/schema assets, but this is acceptable for MVP. |

**Total score: 7.8 / 10**

## Strengths

### Context Engineering

- `DependencyAiContext` is one dependency occurrence and one target, which keeps prompts scoped and traceable.
- Context IDs are based on canonical JSON and stable digests.
- Context includes lineage for Project Manifest, Knowledge Manifest, research ID, and Evidence Bundle digest.
- Selected evidence is bounded by item count and character count.
- The builder does not read source code, lockfiles, cache internals, or network resources.
- `declaredConstraint` mode correctly keeps `currentVersion: null` and `delta: unknown`.

### Prompt Engineering

- Prompt has a clear role: release-level dependency version analysis.
- Guardrails explicitly prohibit source-code impact, migration planning, invented URLs, invented evidence, and current-version guessing.
- Prompt is generic across ecosystems because it speaks in terms of context fields, evidence, versions, and findings rather than npm/Python-specific language.
- Prompt version is present and propagated into the manifest.

### Runtime Architecture

- `AiRuntime` is provider-neutral.
- `createProviderAiRuntime` separates prompt construction from provider call shape.
- `createHttpJsonAiProvider` can wrap multiple provider APIs through custom request/response mappers.
- Unit tests use fake runtime, so CI does not call a model.

### Structured Output

- Candidate output is JSON Schema validated.
- The candidate schema is small and excludes deterministic facts, preventing the model from rewriting dependency/version identity.
- `additionalProperties: false` is used for both AI candidate and manifest schema.
- Invalid JSON/schema results produce failed internal results rather than partially trusted claims.

### Grounding and Trust

- Evidence references are allowlisted against selected context evidence.
- Invalid refs cause claim removal or risk downgrade.
- Invented URLs outside selected evidence are detected.
- Risk can be downgraded to `unknown`.
- Human review is deterministic, not model-controlled.

### Artifact

- `version-analysis.json` is versioned, portable, schema-validated, and sorted deterministically.
- Manifest preserves dependency/version facts, AI summary/risk/findings, evidence references, selected evidence metadata, validation, limitations, and review flags.
- Evidence content is not copied into the final manifest, which keeps the artifact smaller and safer for MVP-04 consumption.

## Weaknesses

### Context Engineering

- Context size is character-bounded, not token-bounded. This is good enough for MVP, but model providers behave by tokens.
- Evidence selection currently drops duplicate content by digest, which is efficient but may lose corroboration unless provenance is preserved elsewhere.
- Source conflicts are not actively surfaced by the selector even though the human review policy knows about `SOURCE_CONFLICT`.
- Package status and source availability limitations are not always carried into context metadata unless they become selected-evidence warnings.
- `registryLatest` is the only CLI target policy. This keeps CLI minimal but limits real review scenarios where teams need explicit target versions.

### Prompt Engineering

- Evidence content is inserted as JSON inside the context, but the prompt does not explicitly label evidence text as untrusted quoted data.
- Prompt instructions are clear, but there is no prompt injection regression fixture where evidence text says “ignore previous instructions.”
- Prompt templates live in code. That is acceptable for MVP, but prompt review/change management will get harder as prompts grow.

### Runtime

- No timeout or cancellation is enforced by the generic HTTP provider.
- No retry strategy exists. This is acceptable for deterministic unit tests but thin for real provider usage.
- Provider errors are caught later as output schema failures in some paths, which may blur provider failure vs bad model output.
- No local model adapter exists yet. The abstraction can support one, but there is no conformance test for a non-HTTP provider.

### Structured Output

- Candidate schema lacks max lengths for summary/finding text.
- Manifest schema is strict, but schema evolution policy is only implicit.
- The schema captures deterministic confidence components but not calibrated model confidence, by design. This is correct, but documentation should keep clarifying it.

### Grounding

- Trust validation checks references and invented URLs, but not semantic entailment.
- A model can cite a valid evidence ID while making a stronger claim than the evidence supports.
- Finding applicability versions are validated structurally, but not checked against context target/relevant releases.
- Risk `low` is allowed if evidence refs are valid and coverage is sufficient; there is no deeper required-category policy yet.

### Artifact

- The manifest is suitable for MVP-04, but MVP-04 may also want direct lookup from result to selected evidence content. Today it has evidence metadata and refs, but must go back to the Evidence Bundle for content.
- There is no top-level manifest digest field. Digest can be computed externally, but the artifact does not self-report it.
- Execution/provider metadata is intentionally absent. That is good for portability, but debugging live provider behavior will need a separate non-portable trace later.

## Technical Debt

### Critical

1. **Evidence Bundle producer is not implemented in the real research CLI.**
   - Validation showed `analyze-version` fails because `.upgradelens/knowledge-evidence-bundle.json` is missing.
   - This blocks real end-to-end user workflow even though the MVP-03 consumer path is implemented.

### High

1. **No semantic entailment validation.**
   - Evidence refs can be valid while claims are too broad.
   - This is the largest grounding risk before relying on AI output for impact analysis.

2. **No runtime timeout/cancellation/retry policy.**
   - Real provider calls can hang, fail transiently, or return provider-specific errors.
   - The current abstraction can support this, but no policy is implemented.

3. **Source conflict propagation is incomplete.**
   - Human review policy supports `SOURCE_CONFLICT`, but context selection does not currently emit it from Knowledge Manifest source conflicts.

4. **Prompt injection tests are missing.**
   - Guardrails exist, but there is no fixture where evidence content attempts to override instructions.

### Medium

1. **Context budget is character-based only.**
   - Add token-aware estimation later when provider/runtime exposes tokenizer behavior or a conservative estimator.

2. **No max text lengths in AI candidate schema.**
   - Model output can be structurally valid but excessively verbose.

3. **Target selection in CLI is minimal.**
   - `registryLatest` is enough for MVP, but explicit target analysis is important for real migrations.

4. **Provider error taxonomy is under-specified.**
   - Runtime/provider/network/model-output failures should be separated more clearly before production usage.

5. **Applicability validation is shallow.**
   - `appliesToVersions` should be checked against target/relevant releases in a future trust hardening pass.

### Low

1. **Prompt template lives in source code.**
   - Fine for MVP, but a separate prompt asset can improve review and versioning later.

2. **No self-reported manifest digest.**
   - Digest helper exists, but the artifact does not include its own digest.

3. **No provider configuration documentation.**
   - CLI supports generic env-driven HTTP provider, but usage is not yet documented.

## Validation Result

Validation used a temporary copy of the real UpgradeLens repository at:

```text
/tmp/upgradelens-va05-ibrdGK/UpgradeLens
```

Commands run:

```bash
node bin/upgradelens.js discover /tmp/upgradelens-va05-ibrdGK/UpgradeLens
node bin/upgradelens.js research /tmp/upgradelens-va05-ibrdGK/UpgradeLens --offline
node bin/upgradelens.js analyze-version /tmp/upgradelens-va05-ibrdGK/UpgradeLens --stdout
```

Observed result:

- `discover` succeeded and found one Node project.
- Project dependencies detected: `ajv`, `ajv-formats`, `undici`.
- `research --offline` succeeded and produced a Knowledge Manifest.
- Knowledge Manifest had three packages, all `unavailable` because the temporary copy had no fresh cache and offline mode does not call registries.
- `analyze-version` failed before AI runtime invocation:

```text
ENOENT: no such file or directory, open '/tmp/upgradelens-va05-ibrdGK/UpgradeLens/.upgradelens/knowledge-evidence-bundle.json'
```

Assessment:

- The current real pipeline is not yet operational end-to-end because the Evidence Bundle artifact is not produced by MVP-02 tooling.
- This result is consistent with the architecture decision that Knowledge Evidence Bundle belongs to MVP-02.x.
- No model correctness judgement could be made from this run because AI analysis did not start.
- The output was useful as an engineering validation because it identified the highest-priority handoff blocker before MVP-04.

## Recommended Improvements

### Before production-like MVP-04 validation

1. Implement or otherwise provide the MVP-02.x Knowledge Evidence Bundle producer.
2. Add one prompt-injection regression fixture where evidence content contains adversarial instructions.
3. Add source-conflict propagation into context metadata and human-review reasons.
4. Add runtime timeout and single bounded retry policy at the provider/runtime boundary.
5. Add documentation for `analyze-version` runtime configuration.

### During MVP-04 implementation

1. Treat MVP-03 risk/findings as release-level inputs, not project impact truth.
2. Require MVP-04 to dereference evidence through the artifact lineage and Evidence Bundle when it needs content.
3. Keep MVP-04 source-code impact analysis separate from MVP-03 release analysis.
4. Add fixtures where `version-analysis.json` has `unknown`, `high`, `declaredConstraint`, missing evidence, and dropped-claims cases.

### Later hardening

1. Add semantic entailment checks or human-annotated eval cases for unsupported claim rate.
2. Add token-aware context budget estimates.
3. Add explicit target request support to CLI/API.
4. Add provider error categories and non-portable debug traces.

## MVP-04 Readiness

MVP-03 is **ready to start MVP-04 implementation against the artifact contract**:

- `version-analysis.json` is stable, schema-validated, and deterministic.
- Results include dependency identity, version facts, release-level risk/findings, evidence refs, validation state, limitations, and human-review flags.
- The artifact is ecosystem-neutral enough for MVP-04 to consume without knowing npm or Python-specific internals.
- Tests cover the important trust and manifest invariants without live model calls.

MVP-03 is **not yet ready for production-like end-to-end validation**:

- Real `discover → research → analyze-version` cannot complete without a Knowledge Evidence Bundle producer.
- Runtime provider behavior has no timeout/retry policy yet.
- Grounding prevents invented refs but does not prove semantic entailment.

Recommended readiness decision:

```text
Proceed with MVP-04 implementation using schema-valid fixtures and generated artifacts.
Do not claim real end-to-end user readiness until the Evidence Bundle producer and runtime hardening backlog are addressed.
```

