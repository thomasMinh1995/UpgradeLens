# Structured Output Compatibility Report

Execution status: EXECUTED

## Configuration

- Generated: 2026-07-15T17:36:38.582Z
- Provider: openai-compatible
- Model: openai/gpt-5.5
- Endpoint: https://openrouter.ai/api/v1/chat/completions
- Prompt: fixed minimal isolation prompt; content intentionally omitted.
- Retry/fallback: disabled (one request per executed probe).

## Documentation Findings

- OpenRouter errors use an `error` envelope; canonical `error.metadata.error_type` takes precedence over HTTP status, and `error.metadata.provider_code` may retain the upstream code.
- `debug.echo_upstream_body = true` returns the transformed upstream request only on a streaming request. The echoed body is privacy-sensitive and is summarized structurally here, never stored raw.
- Routing context was requested only in this isolation path with the current `X-OpenRouter-Metadata: enabled` header.
- Official references: https://openrouter.ai/docs/api/reference/errors-and-debugging and https://openrouter.ai/docs/guides/features/router-metadata

## Independent Keyword Probes

| Probe | Isolated feature | Schema digest | HTTP | error_type | Provider code | Result |
|---|---|---|---:|---|---|---|
| baseline | minimal json_schema | sha256:4528a3c79c4aaee242a31e586366657f8e9a3f11cc8d2cb040d9bf61ab1bbb63 | 200 | — | — | PASS |
| probe-a | array + items | sha256:df782155601ed20f5438b2e86340f8142b4765153d0eb25cfdce811137546d39 | 200 | — | — | PASS |
| probe-b | uniqueItems | sha256:591d86d172b2e9f93c3802f1205003356e84fb8901cf838c1fd005da0f6e4b0e | 400 | — | — | FAIL |
| probe-f | minItems | sha256:4ff1491b983e8191f04df88d33d53c33bd817e726d0fda1bf216d97827b701bb | 200 | — | — | PASS |
| probe-c | pattern | sha256:2f8a77dcda994253630e0973a604b3a1fd5f0f7736a0bf51be09ab4d9e8f01d5 | 200 | — | — | PASS |
| probe-d | nested object | sha256:e4d470b91273f1c4e6ff08da25d0fe1a6200ccf6dbe72f0433afb97ef86dd5d8 | 200 | — | — | PASS |
| probe-e | array + items + nested object | sha256:994c5342dd2a6fc6a8c8034274bee6a4f4fc033e9b9dba254b974d6fab550f2e | 200 | — | — | PASS |
| probe-g | remove uniqueItems | sha256:b1939f9b6c06c65670b60388b3160412f714bd3996bc60a9c31f7075ad3b49a7 | 200 | — | — | PASS |
| probe-h | remove pattern | sha256:ee6016eff1cf98dffb26d8f5f1038396c5b141a39afa519acfc4c320d633c4ec | — | — | — | SKIPPED_POLICY |
| probe-i | remove uniqueItems + pattern | sha256:9bde9b6c0364cac6b4b355879e1e59c9d5d53606a41400c8c8d085b0413bb89f | — | — | — | SKIPPED_POLICY |
| probe-j | remove generation-time constraints | sha256:9bde9b6c0364cac6b4b355879e1e59c9d5d53606a41400c8c8d085b0413bb89f | — | — | — | SKIPPED_DUPLICATE |

## Canonical Error Diagnostics

| Probe | HTTP | error_type | Provider code | Allowlisted message | Routing summary |
|---|---:|---|---|---|---|
| probe-b | 400 | — | — | Provider returned error | {"requestedModel":"openai/gpt-5.5","strategy":"direct","attempt":2,"endpointCount":3,"availableEndpointCount":2} |

## OpenRouter Upstream Debug

| Probe | HTTP | Echo observed | Origin assessment | error_type | Provider code | Notes |
|---|---:|---|---|---|---|---|
| baseline | 200 | YES | CONFIRMED_UPSTREAM_BODY_OBSERVED | — | — | Echo observed and top-level Responses-style input/text transform captured; nested input and text.format were not decoded in the first safe summary, so semantic preservation is INCONCLUSIVE for this capture. |
| exact-schema | 400 | NO | LIKELY_UPSTREAM_REJECTION | — | — | No echo body was exposed. Routing attempt=2 makes upstream rejection LIKELY, but missing error_type/provider_code prevents confirmation. |

| Field | Original | Upstream transformed |
|---|---|---|
| baseline / Structural digest | sha256:bcd97ef54fb72f1337366b3d1c04282ee443550c85cdf630c1a7c66b7f5ba5d0 | sha256:41d1982e3c31f7d9d1d992216e5afa457465b81a2fae5f489c42ca6dca1076b2 |
| baseline / Model | openai/gpt-5.5 | gpt-5.5-2026-04-23 |
| baseline / Top-level keys | debug, messages, model, response_format, stream | include, input, model, reasoning, safety_identifier, store, stream, text, truncation, user |
| baseline / Nested input and text.format | Present in transformed top-level shape | INCONCLUSIVE — not decoded in the first safe summary |
| exact-schema / Structural digest | sha256:113446ef13992aa9cb56ab219a296301ac1405403b1c79fdf7b20d5a8af6880e | — |
| exact-schema / Model | openai/gpt-5.5 | — |
| exact-schema / Stream | true | — |
| exact-schema / Message count | 2 | — |
| exact-schema / Message roles | system, user | — |
| exact-schema / Message character counts | 72, 24 | — |
| exact-schema / Message digests | sha256:08705068fd2c562b509ec13682b498b0334e6e72d54fe89b9e51b5f79a307d6b, sha256:657c5bdc9e94221ebdceb1ed8243dba0b3d76d30feb8e585d4ac8f0aeff07c91 | — |
| exact-schema / Response format type | json_schema | — |
| exact-schema / Schema name | upgradelens_debug_exact_schema | — |
| exact-schema / Strict | true | — |
| exact-schema / Schema digest | sha256:c69fee2c69c7bdb79d582f9c2afde8e777093f03f82cd3a705be7dd67df51469 | — |
| exact-schema / Schema bytes | 1067 | — |
| exact-schema / Schema keyword counts | {"$schema":1,"type":14,"properties":2,"required":2,"additionalProperties":2,"enum":2,"items":5,"minItems":1,"maxItems":0,"uniqueItems":4,"pattern":3,"minLength":4,"maxLength":0} | — |
| exact-schema / Top-level keys | debug, messages, model, response_format, stream | — |

## Transformation Comparison

- baseline: Echo observed and top-level Responses-style input/text transform captured; nested input and text.format were not decoded in the first safe summary, so semantic preservation is INCONCLUSIVE for this capture.
- exact-schema: No echo body was exposed. Routing attempt=2 makes upstream rejection LIKELY, but missing error_type/provider_code prevents confirmation.

## Causal Conclusion

- arrayWithItems: CONFIRMED — array with items is supported.
- uniqueItems: CONFIRMED — uniqueItems is incompatible because Probe A passed and otherwise-identical Probe B failed.
- pattern: CONFIRMED — pattern is supported.
- nestedObject: CONFIRMED — nested strict objects are supported.
- arrayOfObjects: CONFIRMED — arrays of strict nested objects are supported.
- minItems: CONFIRMED — minItems is supported.
- exactSchema: CONFIRMED — the unchanged exact schema was rejected while the exact clone with only uniqueItems removed passed.

## Recommended Production Fix

Create a separately reviewed provider-facing generation schema projection that recursively removes only `uniqueItems`. Keep `pattern`, `minItems`, the unchanged candidate schema, and local Ajv validation; local validation remains authoritative for uniqueness and the full output contract. Do not implement that production change in RT-02D.

## Request Count and Cost Boundary

- Independent probe requests: 8/10.
- Upstream debug requests: 2/2.
- Total OpenRouter requests: 10/12.
- Retry count: 0.
- Fallback requests initiated by this script: 0. OpenRouter-internal routing attempts, if any, are only represented by sanitized routing metadata.

## Security

The artifact excludes credentials, prompt content, full schemas, raw provider responses, raw SSE events, raw upstream bodies, generation/request IDs, account data, billing data, and repository context.
