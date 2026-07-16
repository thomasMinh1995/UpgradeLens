# LR-00D — AI Runtime Contract Discovery

**Status:** Architecture discovery and proposed runtime contract freeze

**Ngày:** 2026-07-15

**Phạm vi:** Contract chung giữa UpgradeLens AI Core và mọi local, cloud hoặc gateway-backed AI runtime. Tài liệu không triển khai contract hoặc adapter.

## 1. Executive Summary

UpgradeLens hiện có một `AiRuntime` nhỏ trong [`src/ai-runtime.js`](../src/ai-runtime.js), nhưng contract hiện tại mới đủ cho MVP-03 foundation: request chứa `context` và `outputSchema`, runtime composition helper dựng prompt, response cho phép `output` là unknown, còn transport errors cuối cùng có thể bị biểu diễn như output schema failure trong [`src/ai-version-analysis.js`](../src/ai-version-analysis.js). Nếu triển khai OpenAI-compatible adapter ngay trên shape này, task semantics, prompt construction, provider errors và execution metadata sẽ tiếp tục trộn ở runtime boundary.

Runtime Contract cần tồn tại để đóng băng một ranh giới duy nhất trước LR-01:

| Layer | Sở hữu | Không được sở hữu |
| --- | --- | --- |
| AI Core | Task semantics, deterministic context, prompt construction, exact output schema, local parsing/schema validation, trust handoff | Provider/model/endpoint/auth/routing/wire quirks |
| Runtime | Capability enforcement, Deployment Profile, execution policy, security bounds, adapter invocation, normalized response/error/telemetry | Dependency/version facts, evidence selection, risk/trust semantics |
| Provider Adapter | Provider/gateway protocol mapping, headers, response envelope, provider error mapping | Prompt meaning, schema modification, fallback policy tự phát, trust |
| Gateway | Forwarding/routing only theo locked deployment policy | Target version, evidence, quality gate, hidden transforms/fallback |
| Model | Sinh candidate content | Deterministic facts hoặc publication authority |

Contract v1 được đề xuất là một **unary, non-streaming, structured-generation operation**. Nó nhận prompt đã render cùng exact schema và correlation IDs; nó trả một normalized successful response hoặc một typed runtime error. Model/provider/endpoint/generation settings không nằm trong AI Core request mà đến từ immutable Deployment Profile.

Mục tiêu đồng thời là:

- protocol-first: contract không chứa Chat Completions, Responses, Anthropic Messages hay Gemini field names;
- capability-first: runtime phải chứng minh effective capability trước request;
- provider-neutral: AI Core không biết OpenAI, Anthropic, Gemini, Ollama, gateways hoặc local engines;
- task-neutral: runtime chỉ thấy task identity/correlation và rendered prompt, không hiểu Version/Impact/Migration semantics;
- runtime-neutral: local weights, direct API và gateway đều có cùng success/error boundary.

Quyết định tối thiểu:

1. Giữ một operation có semantics tương đương `generateStructured`; không cần plugin/API framework.
2. Di chuyển Prompt Builder lên AI Core boundary trước khi gọi runtime; runtime không nhận raw task context để tự dựng prompt.
3. Canonical successful `output` là text; AI Core parse JSON và validate exact schema.
4. Model/provider configuration thuộc Deployment Profile, không thuộc request do AI Core tạo.
5. Structured-output downgrade, model/provider fallback và prompt/response transform bị cấm nếu không có profile/qualification riêng.
6. Telemetry bắt đầu tại runtime invocation và kết thúc ở runtime response/error; telemetry không đi vào Version Analysis Manifest.
7. Trust Layer bắt đầu sau local JSON parse + exact schema validation; runtime không đưa ra trust decision.

Với các quyết định trong 12 section này, Runtime Contract **đủ ổn định để architecture freeze và bắt đầu LR-01**. Future tools, streaming, realtime và agents phải mở extension contract mới thay vì làm phình v1.

## 2. Runtime Architecture

### Standard layers

Luồng chuẩn gồm sáu layer theo thứ tự: AI Core → Runtime Contract → Runtime Execution → Provider Adapter → HTTP/local transport → model endpoint. Optional gateway nằm giữa transport và model endpoint nhưng không tạo contract mới với AI Core.

| Layer | Responsibility | Được phép biết | Không được phép biết/thay đổi |
| --- | --- | --- | --- |
| AI Core | Build deterministic task context, render prompts, select schema, call runtime, validate candidate, invoke trust | Task ID/version, context ID, prompt version/content, schema, task budgets | Provider/model ID, endpoint, auth, gateway routing, wire response |
| Runtime Contract | Stable request/success/error vocabulary | Generic prompts, structured-output requirement, safe correlation, normalized execution result | Provider request field names và task business logic |
| Runtime Execution | Bind Deployment Profile, check capability, enforce bounds/policy, measure telemetry | Effective model/runtime configuration, caller requirements, adapter result | Rewriting task input/schema, choosing evidence or interpreting claims |
| Provider Adapter | Map generic request to one protocol/provider family and normalize response/error | Endpoint wire contract, provider headers/parameters, response/error envelope | Risk taxonomy, evidence semantics, local Ajv/trust rules |
| Transport | Connect, bound, cancel, authenticate, read response | URL, TLS, headers, byte/time limits | Prompt semantics, retries that switch route/model |
| Gateway/model | Execute configured route/inference | Translated request allowed by profile | Hidden fallback/transform or authority over final artifact |

### Knowledge boundaries

AI Core may know:

- which task contract is running;
- deterministic context and its digest;
- prompt version and rendered system/user prompt;
- exact expected output schema/digest;
- whether the task requires strict structured output;
- local validation/trust result.

AI Core must not know:

- provider/gateway brand;
- model, revision, quantization or inference engine;
- endpoint URL, credentials, provider headers or request extras;
- reasoning/thinking/temperature quirks;
- retry, fallback, provider route or billing logic.

Provider Adapter may know all wire-level facts needed to call its endpoint, including how a provider represents messages, schema, reasoning mode, usage, finish reason and errors. It may not inspect the task ID to choose vendor behavior, modify prompt meaning, project a weaker schema silently, or run business validation.

### Relationship to existing code

The operation can retain the current `generateStructured` name to minimize LR-01 impact. The architectural change is request ownership:

- today `createProviderAiRuntime` invokes a `promptBuilder` inside runtime composition;
- frozen contract requires Prompt Builder to execute above the runtime boundary;
- current `context` becomes AI Core input only; runtime receives rendered prompts and `contextId` correlation, not a task-specific context object;
- current `outputSchema` becomes an explicit structured-output requirement;
- current provider/model/latency/usage result becomes the normalized response described below.

This is a bounded contract refinement, not a new framework or runtime service.

## 3. Runtime Request Contract

### Minimal mandatory fields

| Field | Mandatory | Owner | Semantics | Mutation policy |
| --- | --- | --- | --- | --- |
| `contractVersion` | Yes | AI Core/runtime interface | Selects Runtime Contract semantics, initially version 1 | Runtime validates; no mutation |
| `runId` | Yes | Invocation orchestrator | Operational correlation for one invocation/attempt group | Echo only; never sent as prompt content unless provider correlation supports a safe header |
| `contextId` | Yes | AI Core | Digest/identity of deterministic task input | Echo only; provider cannot alter |
| `task` | Yes | AI Core | Stable task contract ID such as `version-analysis.v1` | Used for trace/requirement matching, never vendor branching |
| `promptVersion` | Yes | AI Core | Version of already-rendered prompt semantics | Echo/audit only |
| `systemPrompt` | Yes | AI Core Prompt Builder | Exact system instruction text | Adapter may serialize roles but not rewrite/inject/compress |
| `userPrompt` | Yes | AI Core Prompt Builder | Exact user/task input text, including bounded context as designed by the task | Same immutability rule |
| `structuredOutput` | Yes for v1 operation | AI Core | Required output mode, schema name, exact schema and schema digest | Runtime/adapter must preserve or fail |
| `budget` | Yes | AI Core + Deployment Profile validation | Task-required input/output envelope | Runtime may enforce a stricter deployment ceiling only if it still satisfies task minimum; otherwise configuration/capability failure |

`structuredOutput` conceptually contains:

- required semantic mode (`jsonSchema` for production MVP-03 profile);
- stable schema name for provider APIs that require one;
- exact JSON Schema object;
- schema digest for trace/qualification;
- whether any weaker mode is acceptable. For Version Analysis production this value is false.

`budget` conceptually contains:

- maximum/required input operating envelope when token counting is available;
- maximum output tokens required by the task;
- optional absolute execution deadline supplied by orchestration;
- no evidence-selection policy. Evidence/context bounding remains AI Core responsibility.

### Optional caller fields

| Field | Owner | Use | Constraint |
| --- | --- | --- | --- |
| Safe correlation metadata | Evaluation/benchmark/orchestrator | Dataset case, repeat/sample ID, parent trace ID | Small allowlist of strings/numbers; no prompt/evidence/provider extras |
| Cancellation control | Invocation orchestrator | Abort an in-process request | Execution control, not portable/serialized task metadata |
| Privacy classification | AI Core/orchestrator | Inform runtime whether remote transmission is allowed | Runtime may reject; cannot downgrade classification |

### Fields intentionally excluded from AI Core request

| Excluded field | Correct owner | Reason |
| --- | --- | --- |
| Provider, model, revision | Deployment Profile/runtime | Putting them in task request leaks provider selection into AI Core and weakens reproducibility. |
| Endpoint and auth | Deployment Profile/transport | Secrets/config never belong to semantic request. |
| Quantization, runtime version, chat template | Deployment Profile | Exact deployment identity, not task semantics. |
| Temperature, top-p, seed | Deployment Profile | Support/default constraints differ by model; benchmark identity must pin effective values without task code knowing provider rules. |
| Reasoning/thinking mode and effort | Deployment Profile/capability mapping | Provider-specific controls; task may require a capability class but not a vendor parameter. |
| Retry/fallback/routing | Deployment Profile/runtime policy | Execution and availability policy; cannot be model-generated or task-selected. |
| Provider-specific metadata/extras | Adapter/profile allowlist | Generic metadata must not become an escape hatch for vendor logic. |

### Ownership and mutation rules

- Runtime must reject missing/unsupported contract version, task requirement, budget or schema mode before transport.
- Adapter may transform representation only: role/message encoding, schema wrapper, provider parameter names and safe correlation headers.
- Adapter may not change prompt text semantics, schema keywords, model selected by profile or structured-output mode.
- Gateway/request extras cannot override prompts, schema, model, streaming, routing/fallback locks or security bounds.
- Effective deployment/generation settings must be recorded in execution telemetry; they are never inferred from a task request.

## 4. Runtime Response Contract

Runtime returns a successful response only when transport/provider envelope is valid and a usable final output exists. All other outcomes use Runtime Error Contract, not a success object with ambiguous warnings.

### Normalized success fields

| Field | Required | Semantics | Consumer |
| --- | --- | --- | --- |
| `contractVersion` | Yes | Version used for response normalization | Runtime/AI Core guard |
| `runId`, `contextId` | Yes | Exact correlation echo | Core, evaluation, trace |
| `output` | Yes | Final assistant/model content as text; for structured operation this text should represent one JSON value | AI Core parser only |
| `finishReason` | Yes | Normalized terminal reason; success requires an accepted complete state | Core guard + telemetry |
| Requested identity | Yes | Deployment profile ID/digest and requested provider/model route | Benchmark/trace |
| Actual identity | Required for benchmark/production | Actual provider, model and revision/digest when observable | Qualification/identity policy |
| `usage` | Optional values, present container | Normalized token/cache/reasoning usage with unknown represented as null | Benchmark/observability |
| `timings` | Total latency required; subfields optional | Total wall time, optional queue/provider/network timing | Benchmark/observability |
| Execution summary | Yes | Attempt/retry count, fallback flag, transform list, effective schema mode | Governance/trace |
| Warnings | Optional | Non-fatal normalized execution limitations such as usage unavailable | Observability; never semantic claims |
| Provider correlation | Optional | Bounded request/generation ID or safe route correlation | Operator trace only |

### Identity semantics

- `provider` identifies configured adapter/provider boundary; `actualProvider` identifies the upstream provider that executed when a gateway is present.
- `model` is requested model from Deployment Profile; `actualModel` is provider/gateway response identity.
- `revision` is exact snapshot/digest when the platform exposes it. Unknown revision can be acceptable for development but not silently accepted for reproducible benchmark/production qualification.
- Identity mismatch is an error under locked profiles, not a warning.

### Finish reason semantics

Normalized vocabulary should distinguish at least:

- complete/stop;
- output length/truncation;
- content refusal/filter;
- tool/function call instead of final content;
- cancellation;
- unknown provider terminal state.

Only complete final content returns success in Runtime Contract v1. Every other state maps to a typed error even if provider HTTP status is 200.

### Portable vs execution-only

| Data | Portable task artifact? | Rule |
| --- | --- | --- |
| Runtime `output` | Not directly | It becomes candidate input to local parse/schema/trust; raw output is not publishable. |
| Trusted summary/risk/findings | Yes, through Version Analysis Manifest | Only after existing local validation/trust/manifest invariants. |
| Runtime/provider/model/revision | No in current Version Analysis artifact | Keep in separate execution/qualification trace. |
| Usage, latency, cost, attempts | No | Benchmark/observability only. |
| Stable mapped failure/limitation | May be represented by task failure result | Publish only local stable code/sanitized message, never raw provider detail. |
| Prompt, evidence, raw response/error | No | Sensitive execution data; default trace excludes it. |

Portable artifact boundary remains [`version-analysis-manifest.js`](../src/version-analysis-manifest.js) for MVP-03. Runtime response is execution data, not a portable semantic artifact.

## 5. Runtime Error Contract

Runtime errors need a stable provider-neutral code, sanitized message, retryability decision, optional bounded HTTP status/provider code, run/context correlation and execution summary. Raw headers/body/prompt/evidence are never fields.

### Taxonomy

| Code | Meaning | Default action | Retry policy |
| --- | --- | --- | --- |
| `CONFIGURATION_ERROR` | Missing/invalid Deployment Profile, endpoint, model, auth mode or bounds | Fail fast | Never |
| `CAPABILITY_MISMATCH` | Task requirement exceeds effective runtime capability | Fail fast before call | Never; choose another qualified profile explicitly |
| `AUTH_ERROR` | Authentication/authorization rejected | Fail fast | Never |
| `MODEL_NOT_FOUND` | Requested model/revision unavailable | Fail fast | Never |
| `NETWORK_ERROR` | DNS/connect/reset/transport failure | Fail or bounded retry | At most profile-declared retry on same tuple |
| `TIMEOUT` | Configured deadline exceeded | Fail | No default retry; optional same-tuple retry only when explicitly qualified |
| `CANCELLED` | Caller/operator cancellation | Fail without retry | Never |
| `RATE_LIMITED` | Provider returns rate/quota signal | Fail or bounded wait | Same tuple only, bounded attempts and `Retry-After` |
| `PROVIDER_UNAVAILABLE` | Transient upstream 502/503-class failure | Fail or bounded retry | Same tuple only |
| `SCHEMA_REJECTED` | Endpoint rejects exact schema/keyword combination | Fail conformance | Never downgrade/retry weaker schema |
| `STRUCTURED_OUTPUT_UNSUPPORTED` | Deployment cannot provide required mode | Fail capability/conformance | Never |
| `INVALID_RESPONSE` | Invalid envelope, missing/empty content, malformed provider success response | Fail | Never |
| `OUTPUT_TRUNCATED` | Finish reason/response indicates incomplete output | Fail | Never retry with changed budget/model silently |
| `CONTENT_REFUSED` | Refusal/content filter prevented final output | Fail | Never automatic retry |
| `RESPONSE_TOO_LARGE` | Bounded response/error body limit exceeded | Fail | Never |
| `IDENTITY_MISMATCH` | Actual provider/model/revision violates locked profile | Fail and invalidate sample | Never |
| `ROUTING_POLICY_VIOLATION` | Unexpected fallback, attempts, account/model route or transform | Fail and invalidate sample | Never |
| `PROVIDER_ERROR` | Sanitized non-transient provider failure not classified above | Fail | Default never |
| `UNKNOWN` | No safe classification possible | Fail closed | Never |

### Retry rules

Retry is Runtime Execution responsibility, not Provider Adapter improvisation. It must satisfy all conditions:

- Deployment Profile explicitly allows it;
- same provider, model, revision, quantization, reasoning mode and schema mode;
- bounded attempt count and total deadline;
- every attempt recorded;
- no retry for schema/output/trust/identity/routing/config/auth/model errors;
- no retry can change certification tuple.

### Publication and logging

- AI Core may map stable runtime code to a task-local failed result and limitation, as current analysis already does for invalid output classes.
- Portable artifact may include only stable local code and sanitized user-safe message needed to explain failure/human review.
- HTTP status, provider error code, attempts and correlation IDs stay execution-only.
- Raw provider message/body is excluded from portable artifact and default logs because it may echo prompt, evidence or credential material.
- An error marked retryable does not authorize retry; Deployment Profile policy is final.

## 6. Structured Output Contract

### Required abstraction

Runtime Contract expresses the **semantic output guarantee required by the task**, not the provider mechanism. The effective mechanism is recorded by runtime capability/deployment telemetry.

| Semantic mode | Guarantee before local validation | Qualification role |
| --- | --- | --- |
| Native/runtime JSON Schema | Generation constrained to supplied schema or documented supported subset | Required baseline for MVP-03 production benchmark |
| JSON mode | One syntactically valid JSON value, no exact schema guarantee | Explicit weaker profile only; separate conformance/qualification |
| Prompt-only JSON | No transport/decoder guarantee | Experimental compatibility only |
| Function/tool arguments | Schema may constrain tool arguments, not final task response | Outside Runtime Contract v1 final-output path |

Grammar/constrained decoding are implementation mechanisms that can satisfy JSON Schema mode only when exact task schema conformance passes. AI Core does not need to know whether enforcement came from provider-native schema, vLLM/Ollama grammar or another decoder.

### Boundary responsibilities

| Layer | Responsibility |
| --- | --- |
| AI Core | Supply exact schema/name/digest and required mode; parse returned text; validate exact schema with local Ajv. |
| Runtime | Confirm effective capability/profile; prohibit downgrade; pass exact requirement to adapter; reject invalid terminal state. |
| Provider Adapter | Map schema/mode to provider fields without semantic projection; normalize final content. |
| Local schema validation | Authority for candidate structure regardless of provider “strict” claim. |
| Trust validation | Authority for evidence refs/URLs, risk downgrade, claim filtering and human review after schema pass. |

### Fallback policy

- No silent `jsonSchema → jsonMode → promptOnly` fallback.
- No retry through function/tool calling because final JSON Schema failed.
- A weaker mode requires a different Deployment Profile, conformance report and qualification record.
- Provider-facing schema projection is forbidden in v1 unless a future discovery defines a lossless, audited mapping; exact internal schema still remains authority.
- Schema rejection is a capability/conformance failure, not a prompt problem.

### Validation order

The mandatory order is: valid runtime success envelope → complete output text → JSON parse → exact Ajv candidate validation → trust validation → task result/manifest validation. Invalid output never reaches trust as a valid candidate and raw model claims never bypass this sequence.

## 7. Streaming Contract

### Recommendation

Streaming is **not part of Runtime Contract v1**. The frozen operation is unary and non-streaming.

Version Analysis does not benefit from streaming because:

- the only consumable result is a complete JSON candidate;
- partial JSON cannot pass Ajv or trust validation;
- early chunks cannot be published or consumed by MVP-04;
- streaming complicates timeout, retry, backpressure, gateway fallback and usage/error normalization without improving analysis quality.

MVP-04 and MVP-05 should initially use the same non-streaming structured artifact model. They may have larger contexts/outputs, but downstream consumers still need a complete schema-valid and trust-valid artifact. Large output is solved with bounded task schemas/retrieval/chunked task orchestration above runtime, not by exposing untrusted token chunks.

### Partial output rules

- Partial JSON is never a successful runtime response.
- A connection closing before accepted finish state maps to `OUTPUT_TRUNCATED` or `INVALID_RESPONSE`.
- Runtime may buffer provider streaming internally only if an adapter is forced to consume such an endpoint, but the Runtime Contract still returns one final response and enforces response/deadline bounds. That deployment requires separate conformance.
- Usage/final identity unavailable until stream end means no success before terminal metadata.

### Cancellation and backpressure

- Cancellation remains a runtime invocation control for connect/read/inference, even though streaming is absent.
- Runtime must release transport resources and return `CANCELLED`; partial content is discarded.
- Backpressure is an internal transport concern while reading a bounded response, not an AI Core API.

If realtime UX or token streaming becomes a real requirement, add a separate versioned streaming operation/contract. Do not make v1 success response polymorphic between object, async iterator and event stream.

## 8. Usage & Telemetry Contract

### Normalized fields

| Category | Fields | Requirement |
| --- | --- | --- |
| Token usage | input, output, total | Nullable; total may be derived only when input/output are authoritative and derivation is labeled |
| Extended usage | cached input, reasoning/thinking, tool tokens | Optional and source-labeled; never force into base totals without provider definition |
| Timings | total latency | Required from runtime wall clock |
| Provider timings | queue, time-to-first-token, provider latency, network | Optional; preserve null rather than fabricate |
| Terminal state | normalized finish reason + raw bounded provider code | Normalized required; raw code execution-only |
| Attempts | attempt count, retry count, fallback occurrence | Required execution summary |
| Identity | requested/actual provider/model/revision, runtime/gateway profile digest | Required for qualified benchmark/production |
| Cost | amount, currency, source, authoritative/estimated | Optional; no value when not reliably available |
| Cache | hit/miss/unknown and provider cache token fields | Optional; semantics/source recorded |
| Policy | effective schema mode, generation settings digest, transform list | Required for reproducibility trace |

### Telemetry boundaries

Telemetry begins immediately when Runtime Contract invocation is accepted, before capability/preflight/transport, and ends after normalized success/error. This allows latency and failure category to include runtime overhead rather than only provider inference.

Provider Adapter contributes provider-reported usage/timings/correlation. Runtime contributes wall-clock timing, effective profile identity, retry/fallback/transform observations and normalized error. Benchmark Runner consumes a normalized subset; operational observability may consume the larger execution trace.

### Three data classes

| Class | Examples | Storage |
| --- | --- | --- |
| Portable semantic artifact | Trusted summary/risk/findings/evidence refs | Version/Impact/Migration manifest only |
| Benchmark artifact | Dataset/prompt/schema/profile digests, quality metrics, aggregate latency/usage/cost | Versioned evaluation/benchmark outputs |
| Execution trace | Run/context IDs, requested/actual identity, attempts, timings, finish/error, privacy mode | Separate redacted trace with retention policy |

No telemetry is added to `version-analysis.json`. That artifact remains provider-neutral and deterministic in its semantic fields. Benchmark/trace link by run/context/profile digests rather than embedding raw prompts or evidence.

### Cost and missing data

- Provider-reported authoritative cost is preferred.
- Gateway estimate must be labeled estimated and cannot be compared as billing truth.
- Local runtime per-request cost is null unless operator supplies a separately defined accounting model.
- Missing usage/cost is null/unknown, never zero.
- Telemetry warnings must not change risk/trust outcome; they can invalidate qualification/benchmark completeness.

## 9. Security Contract

### Runtime security responsibilities

| Risk | Required runtime/adapter behavior |
| --- | --- |
| Secrets | Inject from external secret source at runtime construction; never include in request contract, profile artifact, error, trace or portable output. |
| Authorization | Adapter/transport owns correct header; errors redact header/value and do not echo config. |
| HTTPS | Require HTTPS for non-loopback remote endpoints; allow plain HTTP only for explicit loopback/local profile by default. |
| Endpoint validation/SSRF | Accept only expected HTTP(S) forms; reject URL credentials; repo-provided/untrusted remote endpoints require separate trust/confirmation policy. |
| Redirect | Disable/fail redirects so prompt/auth are not forwarded to an unexpected origin. |
| Timeout/cancellation | Enforce bounded connect/read/total deadline and release resources on abort. |
| Response size | Bound success and error bodies; reject oversized content before full buffering/persistence. |
| Logging | Default to IDs, sizes, status, latency and sanitized categories; no full prompt/evidence/raw body. |
| Prompt/evidence leakage | Remote transmission requires explicit Deployment Profile/privacy policy; gateway locality does not imply inference locality. |
| Gateway transforms | Require transforms disabled/empty for baseline; unexpected transform is routing policy violation. |
| Model identity spoofing/drift | Compare actual identity/route metadata with locked profile; unknown/mismatch invalidates qualified run. |
| Provider errors | Parse bounded/sanitized fields only; raw body may echo sensitive data and is not logged. |

### Responsibility split

- AI Core classifies input privacy and bounds deterministic context/evidence before prompt rendering.
- Runtime enforces deployment privacy/security policy and refuses unsafe transmission.
- Adapter implements provider-specific auth/URL/error handling.
- Operator chooses/approves endpoint, secret source, retention and cloud provider policy.
- Trust Layer handles model claims and evidence relationships, not network security.

### Prompt and evidence immutability

Runtime/adapter may serialize or escape content for the wire but cannot inject vendor prompt text, compress context, heal response, remove evidence or reorder semantic content unless a separate Deployment Profile explicitly describes and qualifies the transform. Version Analysis benchmark/production baseline requires no transforms.

### Identity and gateway rules

- Direct endpoint identity comes from locked provider/model configuration plus provider response when available.
- Gateway-backed deployment must expose requested and actual model/provider, attempt count and transforms through stable metadata or it cannot be qualified.
- Hidden provider/account failover is prohibited for benchmark/production.
- A successful HTTP/schema response with unknown route is a governance failure, not a trustworthy success.

## 10. Runtime Capability Contract

### Capability snapshot

Each runtime instance must expose an immutable **effective capability snapshot** derived from its Capability Profile + Deployment Profile. This is construction/preflight metadata, not per-request dynamic negotiation and not a model-selection API.

| Capability | Minimum declaration |
| --- | --- |
| Structured output | Supported semantic modes; JSON Schema dialect/subset/known keywords; enforcement mechanism class |
| Context | Configured input and output token limits, not only model maximum |
| Streaming | Supported by endpoint and enabled/disabled in this runtime contract; v1 effective value is disabled |
| Tool/function calling | Availability only; not part of v1 final structured operation |
| Reasoning/thinking | Supported modes, configured effective mode and provider constraints |
| Generation controls | Whether temperature/top-p/seed are supported, fixed, ignored or forbidden; effective settings digest |
| Usage | Which normalized token/cache/reasoning fields can be reported |
| Finish reason | Whether reliable terminal reason is available and mapping coverage |
| Identity | Requested/actual model/provider/revision observability |
| Routing | Gateway presence, provider pinning, fallback/attempt/transform observability |
| Citations/grounding | Native provider feature availability; not evidence-ref quality proof |
| Modalities | Text input/output for v1; future image/audio declarations must not imply v1 support |
| Security/privacy | Local/remote class, TLS requirement and declared retention/privacy profile reference |

### Three capability layers

| Layer | Meaning | Authority |
| --- | --- | --- |
| Capability Registry | Official documentation says offering can support capability | Discovery metadata only |
| Runtime capability snapshot | Exact configured deployment claims it will provide capability | Preflight/config authority |
| Conformance Report | Exact deployment demonstrated required behavior | Admission authority for benchmark |

Only Qualification Record authorizes production. Registry support alone cannot.

### AI Core interaction

AI Core expresses task requirements in the request—strict schema and task budget—but does not inspect provider names or select capability fallbacks. Runtime compares requirements with its effective snapshot and either executes exactly or returns `CAPABILITY_MISMATCH`/`STRUCTURED_OUTPUT_UNSUPPORTED` before call.

Runtime must not:

- probe several modes/models during a production request;
- change profile based on task name;
- report configured capability as observed/certified capability;
- call a weaker mode and merely add a warning;
- let gateway response override effective capability without invalidating the run.

### Relationship to governance discovery

[`ai-runtime-governance-discovery.md`](./ai-runtime-governance-discovery.md) owns registry, conformance and certification lifecycle. Runtime Contract consumes a pinned Deployment Profile/capability snapshot and emits evidence needed by Conformance/Qualification. It does not implement a registry service or certification engine.

## 11. Future Runtime Extensions

Runtime Contract v1 intentionally solves one task-neutral capability: unary text-in, structured-text-out generation. Provider API shape is an adapter concern.

| Future capability | v1 treatment | Extension rule |
| --- | --- | --- |
| OpenAI Responses API | Adapter may use it only if it preserves unary v1 semantics | Stateful conversation/tools require a new operation contract |
| Anthropic Messages / Gemini generateContent | Provider Adapter mapping | No AI Core provider branches |
| Function/tool calling | Outside v1 final response | Add a separate tool-call contract only when a task requirement exists |
| MCP | Outside model runtime | Tool/resource integration layer above runtime; never hidden provider capability |
| Tool execution | Outside runtime adapter | Host-controlled sandbox/tool runtime with its own security/trust contract |
| Agent runtime | Outside v1 | New agent orchestration boundary; do not turn `generateStructured` into an event loop |
| Task orchestration | AI Core/workflow layer | Splitting/chaining Version/Impact/Migration calls is not provider runtime work |
| Streaming | Outside v1 | Separate streaming operation/version if a complete use case appears |
| Realtime | Outside v1 | Separate session/event contract |
| Multimodal image/audio | Not accepted by v1 text prompts | Add versioned typed content blocks only with task/schema requirements |
| Batch API | Outside request contract | Qualification/benchmark scheduler can batch independent unary calls and normalize results |
| Native citations/search | Disabled/outside evidence collection boundary | Knowledge Research remains source authority; no model web retrieval in analysis runtime |
| Reasoning models | Supported through Deployment Profile/capability mapping | Reasoning traces are not portable output and should not be logged by default |
| Fine-tuning/model training | Outside runtime | Produces another model/deployment profile requiring full qualification |

### Compatibility rule

An adapter for OpenAI, Anthropic, Gemini, Ollama, OpenRouter, 9Router, LiteLLM, vLLM, LM Studio or a future provider is conformant if it can preserve v1 semantics and normalized error/identity/telemetry. If a provider feature changes semantics—stateful threads, tool loops, multimodal events—it belongs to a separate extension contract, not provider-specific optional fields in the v1 request.

### Stability rule

Future contract versions may add optional response telemetry or capability declarations without changing task semantics. Changes to input content type, execution cardinality, streaming, tools or state require a new major contract/operation. V1 callers never need to know which external API implements the operation.

## 12. Validation

### Discovery validation

- Chỉ thêm `docs/runtime-contract-discovery.md`.
- Không sửa các discovery LR-00, Gateway Runtime, AI Capability hoặc Runtime Governance.
- Không sửa production code.
- Không sửa runtime hoặc runtime behavior.
- Không sửa CLI.
- Không sửa schema.
- Không sửa prompt.
- Không sửa Trust Layer.
- Không sửa Evaluation, Metrics, Scorecard hoặc Benchmark.
- Không thêm dependency hoặc cài SDK.
- Không gọi model và không dùng API key.
- Không có secret.
- Không chạy test suite vì không có executable change.
- `git diff --check` phải pass trước handoff.

### Answers to architecture-freeze questions

| # | Question | Frozen answer |
| ---: | --- | --- |
| 1 | Runtime Contract tối thiểu là gì? | Một versioned unary non-streaming structured-generation request, normalized success response, typed error contract, effective capability snapshot và execution telemetry boundary. |
| 2 | AI Core được phép biết gì? | Task/context identity, rendered prompts, exact schema/task budget và local validation/trust result; không provider/model/endpoint. |
| 3 | Provider Adapter được phép biết gì? | Wire protocol, auth/header/body mapping, provider schema/reasoning parameters, response/error/usage envelope; không task semantics/trust. |
| 4 | Runtime chịu trách nhiệm đến đâu? | Bind/verify Deployment Profile, enforce capability/security/bounds/routing/retry, call adapter, normalize success/error/identity/telemetry; không interpret claims. |
| 5 | Trust Layer bắt đầu ở đâu? | Sau successful runtime response, local JSON parse và exact Ajv schema validation; trust then validates refs/URLs/claims/risk/review. |
| 6 | Evaluation bắt đầu ở đâu? | Trên AI Core analysis/trust path với versioned dataset/prompt/schema/deployment, không ở adapter/transport. |
| 7 | Telemetry bắt đầu ở đâu? | Tại runtime invocation acceptance và kết thúc sau normalized success/error; lưu ngoài portable semantic artifact. |
| 8 | Provider-specific logic nằm ở đâu? | Provider Adapter và pinned Deployment Profile only. |
| 9 | Portable artifact kết thúc ở đâu? | Tại schema/invariant-validated task manifest sau trust; runtime response/telemetry không phải portable semantic artifact. |
| 10 | Contract đủ ổn định để freeze trước LR-01 chưa? | **YES**, nếu LR-01 giữ unary non-streaming semantics, moves rendered prompt above runtime boundary, implements exact schema/no-downgrade, typed errors, identity and telemetry normalization as specified. |

### Architecture freeze decision

Runtime Contract v1 được đề xuất **FROZEN FOR LR-01 IMPLEMENTATION** với các non-negotiable invariants:

- AI Core renders prompt and owns schema/trust;
- runtime request contains no provider/model/auth/routing logic;
- Deployment Profile owns effective model/generation/security policy;
- adapter preserves prompt/schema semantics or fails;
- success requires complete final text and accepted finish reason;
- local Ajv and trust validation remain mandatory;
- no silent structured-output downgrade, fallback or transform;
- streaming/tools/agents remain outside v1;
- telemetry and secrets never enter portable Version Analysis artifact.
