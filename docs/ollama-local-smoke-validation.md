# LR-02 — Ollama Local Real Smoke Validation

Ngày validation: 2026-07-15

## 1. Environment

| Item | Observed value |
| --- | --- |
| Host | macOS Darwin 25.5.0, arm64, Apple M5, 16 GiB unified memory |
| Local inference | Ollama 0.23.0, loopback only |
| UpgradeLens | 0.2.0, commit `27598df`, LR-01 working tree |
| Validation target | Current local VinGrade repository, commit `25811ef`; no repository path is persisted here |
| Date/time zone | 2026-07-15, Asia/Ho_Chi_Minh |

UpgradeLens was invoked against `.` from the VinGrade working repository. That repository was already dirty before LR-02. LR-02 did not mutate VinGrade source; generated `.upgradelens` artifacts remained untracked. No absolute target path was added to source or this report.

The Ollama service was not initially running. A temporary local service was started on `127.0.0.1:11434` without changing persistent system configuration, then stopped after validation; the final health check confirmed the port was no longer accepting connections.

## 2. Local Model Inventory

Sanitized output from `ollama list`:

| Model | Displayed ID | Size | Modified |
| --- | --- | ---: | --- |
| `nomic-embed-text:latest` | `0a109f422b47` | 274 MB | 9 days ago |
| `qwen2.5-coder:7b` | `dae161e27b0e` | 4.7 GB | 9 days ago |
| `qwen3:latest` | `500a1f067a9f` | 5.2 GB | 7 weeks ago |
| `llama3:latest` | `365c0bd3c000` | 4.7 GB | 2 months ago |

`/api/version` reported `0.23.0`; `/v1/models` exposed the same four exact model tags. No model was pulled, downloaded, deleted, or modified.

## 3. Selected Model

**Primary:** `qwen3:latest`, selected because the installed artifact is a Qwen3 8B Q4_K_M instruction/reasoning model and is the strongest match for structured reasoning under the stated selection policy.

**Secondary:** `llama3:latest`, an installed Meta-Llama-3-8B-Instruct Q4_0 artifact from a different family. It was invoked once on the same LangSmith context only after every primary analysis call timed out.

Both `latest` tags are mutable. This is smoke validation only and is not benchmark-reproducible. The displayed Ollama IDs above identify the artifacts observed during this run but do not create a qualification record.

## 4. Protocol Probe

The direct probe used `POST http://localhost:11434/v1/chat/completions`, `qwen3:latest`, two simple non-VinGrade messages, `stream:false`, and a small strict JSON Schema containing `required`, `enum`, and `additionalProperties:false`.

Observed retained response:

| Check | Result |
| --- | --- |
| HTTP status | 200 |
| Actual model | `qwen3:latest` |
| Choice count | 1 |
| Finish reason | `stop` |
| Content | Valid JSON with the two schema-required enum values |
| Usage | 245 input, 14 output, 259 total tokens |
| Wall time | 78.7 seconds including local model work |

Ollama accepted native `response_format.type=json_schema`; the response matched the Chat Completions envelope and parsed to the required object.

An execution-session handoff caused the same harmless direct probe to be submitted twice before the first process was observed. Ollama recorded both as HTTP 200 (approximately 131 and 79 seconds). Neither request contained VinGrade data. This was an operator/tooling duplication, not runtime retry or model fallback; only the sanitized retained response above was used for the conformance conclusion.

## 5. Real Artifact Summary

The production CLI first regenerated artifacts on the real VinGrade repository:

| Artifact | Summary |
| --- | --- |
| Project Manifest | 2 projects: one Node and one Python; 47 declarations, 46 unique packages |
| Knowledge Manifest | 46 researched; 45 resolved; 1 unavailable; 184 sources; 1 warning |
| Evidence Bundle | 45 evidence items for 45 packages; 2 warnings (`EVIDENCE_MISSING`, `REGISTRY_RESPONSE_INVALID`) |

The full repository contained 47 analysis contexts and 44 eligible model calls. Because CLI dependency filtering is not available, running all 44 calls would violate the bounded-smoke policy.

A temporary copy outside both repositories was therefore created with three declarations copied from the real VinGrade manifests: `axios`, `react`, and `langsmith`. Production `discover` and online `research` were rerun there. The bounded artifacts contained 2 projects, 3 resolved packages, 12 sources, 3 fresh registry evidence items, and no warnings. No fixture evidence was used, and no generated Knowledge Manifest or Evidence Bundle was edited manually.

## 6. Pipeline Status

| Stage | Status | Evidence |
| --- | --- | --- |
| Real VinGrade `discover` | PASS | 2 project manifest validated |
| Real VinGrade `research` | PASS | 46 packages researched; manifest and bundle validated |
| Bounded subset `discover` | PASS | 2 projects / 3 declarations |
| Bounded subset `research` | PASS | 3/3 packages resolved with real registry evidence |
| Ollama protocol probe | PASS | Native JSON Schema request returned usable Chat Completions JSON |
| Primary `analyze-version` | PARTIAL | 3 real calls reached Ollama; all hit the 60-second runtime deadline |
| Secondary one-context analysis | PARTIAL | One Llama 3 call on the same LangSmith context hit the same deadline |
| Manifest validation | PASS | Primary and diagnostic secondary manifests pass schema and runtime invariants |

The exact candidate schema, prompt version 1, local JSON/Ajv path, and existing Trust Layer were not changed or bypassed.

## 7. Runtime Result

Primary CLI configuration was `openai-compatible` with the loopback Chat Completions endpoint, exact model `qwen3:latest`, and no Authorization. The bounded batch expected and made exactly three calls. There was no retry or fallback.

| Runtime | Calls | Analyzed | Skipped | Failed | Result |
| --- | ---: | ---: | ---: | ---: | --- |
| `qwen3:latest` primary CLI batch | 3 | 0 | 0 | 3 | All `TIMEOUT` at the 60-second adapter deadline |
| `llama3:latest` secondary diagnostic | 1 | 0 | 0 | 1 | `TIMEOUT` after 60.1 seconds |

The primary manifest correctly recorded `failedCount:3`, risk `unknown`, `requiresHumanReview:true`, and package-local `TIMEOUT` limitations. The CLI still completed and wrote a valid manifest, proving that provider failure remained package-local.

Per-analysis token usage was unavailable because no analysis request completed. The successful protocol probe reported 259 total tokens. Runtime identity is recorded in this report from exact configuration, `/v1/models`, and Ollama server observations; it is intentionally absent from the portable Version Analysis Manifest.

## 8. AI Output Review

No full Version Analysis candidate completed before the deadline, so semantic quality is not assessable.

| Dependency | Declared/current → target | Mode / evidence | Published result | Review |
| --- | --- | --- | --- | --- |
| `npm:axios` | `^1.17.0` / unresolved → `1.18.1` | `declaredConstraint`; `registryFact` | Failed, unknown risk, human review, zero refs/findings | NOT_ASSESSABLE |
| `npm:react` | `^19.2.6` / unresolved → `19.2.7` | `declaredConstraint`; `registryFact` | Failed, unknown risk, human review, zero refs/findings | NOT_ASSESSABLE |
| `pypi:langsmith` | `0.8.9` → `0.10.5` | `exactBaseline`; `registryFact` | Failed, unknown risk, human review, zero refs/findings | NOT_ASSESSABLE |

The runtime requested the exact candidate schema, but no candidate reached JSON parsing or Ajv. Consequently Trust Layer had no claims to accept or drop. Fail-closed results contained no invented evidence ID, invented URL, impact analysis, migration plan, or confident-low claim. Manifest evidence-reference invariants passed.

## 9. Issues Found

| Classification | Finding |
| --- | --- |
| Local hardware/performance | Both installed 8B models exceeded the fixed 60-second analysis deadline on the full rendered prompt; Qwen3's tiny cold/warm probes also took longer than 60 seconds. |
| Configuration limitation | LR-01 has a bounded default timeout but no CLI/deployment-profile control for a qualified local timeout. This prevented technical completion without indicating an adapter protocol failure. |
| Evidence quality | The three bounded contexts contained only `registryFact`; even a completed result would require cautious interpretation and human review, especially for declared constraints. |
| Model capability | Qwen3 proved native JSON Schema on a tiny probe, but neither model demonstrated full UpgradeLens candidate completion within the allowed deadline. |
| Adapter bug | None demonstrated. Request mapping, timeout typing, package-local failure, sanitization, and manifest handling behaved as designed. |
| Operator tooling | Direct probe was duplicated once during command-session handoff; no private data was involved. |

No LR-01 code change was justified in this task. Changing prompt, schema, trust behavior, or silently weakening structured output would invalidate the smoke.

## 10. Decision

```text
TECHNICAL_SMOKE_PARTIAL
```

Proven: local Ollama discovery, exact model selection, OpenAI-compatible Chat Completions transport, native JSON Schema acceptance, real VinGrade discovery/research, real registry evidence, real local model invocation, typed timeout isolation, fail-closed artifacts, and manifest validation.

Not proven: an eligible dependency completing output → JSON parse → exact Ajv → Trust Layer → `status=analyzed`. Therefore this run is not a technical smoke pass and provides no model-quality recommendation.

Security/privacy confirmation: endpoint was loopback; Authorization was absent; no API key, cloud inference, gateway transform, auto-download, prompt/evidence logging, source mutation, or artifact commit occurred. Generated private artifacts remained in the VinGrade untracked area or a temporary directory outside repositories.

## 11. Qualification Status

```text
Certification: EXPERIMENTAL
```

This result is neither `SUPPORTED` nor `CERTIFIED`. It is not a benchmark, production qualification, model recommendation, or evidence that either model is suitable for MVP-04/MVP-05. Capability conformance and Golden Dataset evaluation remain incomplete.

## 12. Recommended Next Step

Perform **model/runtime timeout compatibility hardening** before LR-G02:

1. define an explicit, bounded local Deployment Profile timeout/output budget rather than changing the prompt or schema;
2. add offline conformance coverage for timeout configuration and preservation of the exact model/schema tuple;
3. rerun exactly one LangSmith context with `qwen3:latest` under the approved bounded profile;
4. only after one candidate reaches Ajv and Trust Layer, proceed to **LR-G02 — Offline Conformance Suite**.

Do not compensate with weaker JSON mode, prompt-only JSON, model fallback, or a larger unbounded batch.
