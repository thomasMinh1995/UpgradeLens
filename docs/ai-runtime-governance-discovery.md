# LR-00C — AI Runtime Governance Discovery

**Status:** Architecture discovery only

**Ngày:** 2026-07-15

**Phạm vi:** Governance cho MVP-03 Version Analysis, MVP-04 Impact Analysis và MVP-05 Migration Planning. Tài liệu này không triển khai governance tooling hoặc thay đổi behavior hiện tại.

## 1. Executive Summary

Ba discovery trước đã trả lời ba câu hỏi khác nhau:

- [`openai-compatible-runtime-discovery.md`](./openai-compatible-runtime-discovery.md) xác định transport protocol-first nhỏ nhất;
- [`gateway-runtime-discovery.md`](./gateway-runtime-discovery.md) xác định routing/fallback có thể làm mất reproducibility và quality equivalence;
- [`ai-capability-discovery.md`](./ai-capability-discovery.md) xác định capability cần có và model shortlist.

Discovery và benchmark vẫn chưa đủ để vận hành runtime lâu dài. Discovery là ảnh chụp từ documentation tại một thời điểm; benchmark chỉ đo một run configuration nếu configuration đó thực sự đúng và ổn định. Cả hai không tự chứng minh endpoint đã giữ exact JSON Schema, model alias không đổi, gateway không fallback, runtime không transform prompt, usage/finish reason có thể audit, hoặc deployment hiện tại vẫn giống deployment đã benchmark.

Repository hiện có foundation tốt nhưng chưa có governance boundary:

- [`src/ai-runtime.js`](../src/ai-runtime.js) chỉ yêu cầu `generateStructured(request)`; không kiểm tra model capability, exact revision, fallback hoặc routing.
- [`src/ai-version-analysis.js`](../src/ai-version-analysis.js) parse JSON, validate candidate schema, allowlist evidence references/URLs và áp human-review policy. Không có `src/trust-*.js` riêng; trust boundary hiện nằm trong module này.
- [`src/evaluation-runner.js`](../src/evaluation-runner.js) chạy cùng analysis/trust path trên Golden Dataset.
- [`src/benchmark-runner.js`](../src/benchmark-runner.js) thu quality score cùng latency/token/cost cơ bản, nhưng runtime settings hiện là object mở và chưa chứng nhận identity/capability.
- [`docs/live-ai-validation.md`](./live-ai-validation.md) xác nhận real evidence đã tới AI boundary nhưng chưa có live model call; do đó hiện chưa model/deployment nào được production-certified.

Governance layer tối thiểu cần ba chức năng:

```text
Capability Discovery
        ↓ declared metadata
Capability Conformance
        ↓ observed contract
Model Qualification
        ↓ task-scoped decision
Production Runtime
```

Quyết định kiến trúc:

1. **Capability Registry** là tập JSON portable, source-controlled, mô tả “model/API được document là có thể làm gì”. Nó không được runtime tự scan để chọn model.
2. **Deployment Profile** là JSON portable mô tả exact tuple “sẽ chạy như thế nào”. Nó không chứa secret.
3. **Conformance Report** chứng minh tuple đó thực hiện đúng protocol/structured-output/identity/error contract. Conformance không chấm reasoning quality.
4. **Qualification Record** liên kết exact capability profile, deployment profile, conformance report, dataset/prompt/schema và quality artifacts để quyết định trạng thái theo từng task.

Không cần database, service, plugin system, dynamic registry hay enterprise policy engine. Static files + deterministic validation + existing Evaluation/Metrics/Scorecard/Benchmark là đủ.

Trạng thái hiện tại theo thiết kế này:

- mọi real model/deployment: tối đa **EXPERIMENTAL**, vì chưa có live conformance và real model benchmark;
- golden fake runtime: dùng để regression test foundation, không phải model qualification candidate;
- chưa deployment nào **CERTIFIED** cho MVP-03;
- MVP-04/MVP-05 chưa có task-specific evaluation contract, nên chưa thể certification dù một model sau này pass MVP-03.

## 2. Capability Conformance Test

### Mục tiêu

Capability Conformance là tầng fail-fast giữa documentation và quality benchmark:

```text
Capability Discovery
        ↓
Capability Conformance
        ↓ only conformant deployments
Golden Benchmark
        ↓ only quality-qualified deployments
Production
```

Nó trả lời câu hỏi: **exact deployment tuple có thực hiện contract mà benchmark sắp dựa vào hay không?** Nó không trả lời model có phân tích release note tốt hay không.

### Boundary

Conformance được phép kiểm tra:

- profile/schema metadata hợp lệ;
- request mapping, protocol, auth mode và `stream: false`;
- exact final structured-output mode và JSON Schema keyword behavior;
- response envelope, output extraction, model/provider identity;
- finish reason, truncation, refusal, empty output;
- usage metadata, timeout, rate limit, model missing và sanitized errors;
- routing/fallback/transform policy;
- task-required operating context/output budget;
- Unicode/multilingual transport integrity.

Conformance không được:

- dùng release risk accuracy, evidence entailment hoặc migration quality làm pass/fail;
- sửa prompt, candidate schema hoặc trust behavior để làm endpoint pass;
- tự downgrade `jsonSchema → jsonMode → promptOnly`;
- auto-select model/provider;
- ghi secret, full prompt/evidence hoặc raw provider body vào portable report;
- thay thế Golden Benchmark hoặc real-repository validation.

### Input và artifacts

| Input | Vai trò |
| --- | --- |
| Capability Profile digest | Các capability được documentation khai báo. |
| Candidate Deployment Profile digest | Exact endpoint/runtime/model/config cần kiểm tra. |
| Conformance Specification version | Bộ case và required/optional policy. |
| Task ID | `version-analysis.v1`, sau này `impact-analysis.v1`, `migration-planning.v1`. |
| Exact task schema digest | Schema thực tế cần endpoint chấp nhận. |

Output portable là **Capability Conformance Report**, không phải Evaluation Report:

```json
{
  "schemaVersion": "1.0.0",
  "specVersion": "runtime-conformance.v1",
  "task": "version-analysis.v1",
  "capabilityProfileDigest": "sha256:...",
  "deploymentProfileDigest": "sha256:...",
  "taskSchemaDigest": "sha256:...",
  "result": "PASS",
  "cases": [],
  "observed": {
    "actualModel": "...",
    "actualProvider": "...",
    "structuredOutputMode": "jsonSchema",
    "fallbackOccurred": false,
    "transforms": []
  },
  "limitations": []
}
```

Report chỉ lưu bounded observations/digests. Raw request/response có thể tồn tại tạm trong opt-in diagnostic nhưng không phải portable artifact và không được chứa secret.

### Case result và overall pass/fail

Mỗi case có một trong bốn kết quả:

- `PASS`: observed behavior đúng expectation;
- `FAIL`: contract sai hoặc fail-closed behavior sai;
- `NOT_APPLICABLE`: capability không thuộc task/profile và spec cho phép bỏ;
- `NOT_RUN`: test không chạy; chỉ hợp lệ với optional case, không hợp lệ với required case.

Overall `PASS` chỉ khi:

1. tất cả required cases là `PASS`;
2. không required case nào `NOT_RUN`/`NOT_APPLICABLE`;
3. actual model/provider match deployment policy;
4. không hidden fallback, routing hoặc prompt/response transform;
5. exact task schema được giữ ở configured mode;
6. mọi negative case fail closed và error được sanitize;
7. report validate, canonicalize và có digest ổn định ngoài timestamp/observations được khai báo variable.

Một `FAIL` không được retry bằng model/mode yếu hơn rồi gộp thành pass. Retry cùng exact tuple chỉ được phép nếu Deployment Profile đã khai báo và conformance report ghi mọi attempt.

### Acceptance Criteria cho specification

- Conformance đứng trước benchmark và không gọi Evaluation Runner.
- Dùng cùng exact schema mà production task dùng; không dùng schema demo đơn giản làm certification proof.
- Có mocked protocol suite chạy offline/default CI và opt-in live suite tách biệt.
- Live suite không tự tải model, tạo account, đọc API key từ file hoặc chạy paid call ngoài explicit operator action.
- Report phân biệt declared capability với observed behavior.
- Conformance pass chỉ cấp quyền vào smoke/benchmark; không cấp quyền production.

## 3. Capability Registry

### Vai trò

Capability Registry là metadata inventory source-controlled:

```text
governance/ai/capabilities/
    gpt-5.6-sol.json
    claude-sonnet-5.json
    gemini-2.5-pro.json
    qwen3-8b.json
```

Đường dẫn chỉ là recommendation cho task triển khai sau; LR-00C không tạo registry files. Registry được load bằng explicit path/list trong qualification tooling. Production runtime không scan directory, không query database và không auto-pick “best” model.

### Capability Profile tối thiểu

```json
{
  "schemaVersion": "1.0.0",
  "id": "claude-sonnet-5",
  "subject": {
    "family": "claude-sonnet",
    "modelId": "claude-sonnet-5",
    "revisionSemantics": "providerPinnedId"
  },
  "capabilities": {
    "structuredOutput": {
      "modes": ["jsonSchema"],
      "jsonSchemaSupport": "subset",
      "toolSchemaStrict": true
    },
    "context": {
      "inputTokens": 1000000,
      "outputTokens": 128000
    },
    "toolCalling": true,
    "citation": "nativeAvailable",
    "multilingual": true,
    "reasoning": {
      "supported": true,
      "mode": "adaptive"
    },
    "transport": {
      "protocols": ["anthropicMessages"],
      "streaming": true,
      "finishReason": true,
      "usageMetadata": true
    }
  },
  "constraints": {
    "temperature": "defaultOnly",
    "assistantPrefill": false
  },
  "evidence": [
    {
      "kind": "officialDocumentation",
      "url": "https://...",
      "checkedAt": "2026-07-15"
    }
  ]
}
```

Đây là ví dụ shape, không phải file được tạo hoặc schema được chốt trong task này.

### Field policy

Registry nên mô tả:

- model family, exact public ID và revision semantics;
- supported protocols/endpoints ở mức logical offering;
- final structured-output modes, JSON Schema support/subset, JSON mode;
- tool calling/strict tool arguments;
- context input/output limits;
- reasoning/thinking modes và defaults;
- temperature/top-p/seed constraints;
- streaming support, finish reason, usage metadata;
- native citation/grounding availability;
- multilingual declaration;
- known documentation limitations;
- official evidence URLs, checked date và confidence/source type.

Registry không chứa:

- prompt text hoặc prompt version;
- benchmark/evaluation score, latency sample, cost result hoặc ranking;
- endpoint URL, API key, Authorization, account hoặc secret reference;
- gateway routing, timeout, retry, quantization hoặc runtime flags;
- vendor-specific executable logic;
- qualification/certification decision;
- claims suy ra từ unofficial benchmark.

### Registry invariants

1. Một profile mô tả một logical model offering/revision semantics; không gộp DeepSeek V4 API với DeepSeek V3.2 weights hoặc nhiều Qwen quantization.
2. Alias mutable phải ghi `revisionSemantics: mutableAlias`; không được giả thành exact revision.
3. “Supported” trong registry nghĩa là official documentation khai báo, không phải UpgradeLens đã chứng nhận.
4. Capability không được default từ family name. Missing field là `unknown`, không phải `false` hoặc `supported`.
5. Thay capability/source tạo profile revision/digest mới và trigger requalification cho deployment liên quan.
6. Registry không phải runtime allowlist. Production eligibility chỉ đến từ Qualification Record.

### Vì sao không hard-code

Hard-code capability trong adapter (`if model === ...`) sẽ trộn documentation lifecycle với transport logic, buộc release code khi model đổi và làm local/gateway deployment khó so sánh. Portable profile cho phép review diff, pin digest và re-run conformance mà không đổi Version Analysis core.

## 4. Capability Conformance Suite

Suite nên có hai lớp dùng cùng case IDs:

- **offline protocol conformance:** fake HTTP/runtime fixtures, chạy CI, không gọi model;
- **opt-in live deployment conformance:** chạy trên exact Deployment Profile, có explicit operator authorization; không chạy default CI.

### Nhóm test chuẩn

| Group | Required cases | Pass condition |
| --- | --- | --- |
| Profile integrity | schema/version, digest, exact identity, no secret, task binding | Profiles validate; mutable/unknown identity bị policy đánh dấu đúng. |
| Request contract | protocol endpoint, model, messages/input, `stream:false`, schema mode | Adapter-owned fields không bị extras override; one request mode. |
| Basic JSON | object parse, no markdown/prose wrapper | Output parse được theo configured mode. |
| JSON Schema | exact task schema accepted; dialect/subset recorded | Endpoint không silently drop/rewrite schema. |
| Required fields | bỏ từng required field | Negative output bị constrained hoặc local validation reject fail-closed. |
| Enum | invalid `riskLevel`/kind | Invalid enum không được publish. |
| Additional properties | top-level và nested extra field | `additionalProperties:false` được endpoint hoặc local validator enforce. |
| Nested objects | `findings[]` shape | Nested required/type/ref structure giữ đúng. |
| Arrays | empty/non-empty, `minItems`, `uniqueItems`, ordering-independent refs | Exact candidate rules được local validator giữ. |
| String constraints | evidence digest `pattern`, non-empty summary | Invalid values không publish. |
| Unicode | Vietnamese, package scope, emoji/non-ASCII evidence | Request/response round-trip không corrupt text/IDs. |
| Operating context | task-required context size, không phải marketing maximum | Không truncate input; token count/limit behavior quan sát được. |
| Large output | output gần configured task budget | Complete JSON hoặc explicit `length`/truncation failure; không partial publish. |
| Finish reason | stop, length, refusal, content filter, tool-only | Chỉ accepted finish state được parse; trạng thái khác fail rõ. |
| Usage | present/absent/partial usage | Normalize khi có; absence là `null`, không fabricate zero. |
| Identity | requested vs actual model/provider | Match policy; unknown/mismatch fail. |
| Routing | zero/multiple attempts, fallback metadata | Benchmark profile chỉ pass zero unexpected fallback. |
| Transform | prompt/response/plugin pipeline flags | Không transform trong baseline; unknown transform fail. |
| Streaming disabled | endpoint respects non-streaming | Một bounded response envelope; SSE bất ngờ fail. |
| Empty/invalid response | empty content, malformed envelope/JSON | Stable invalid-response/output error; no claim published. |
| Truncation | `finish_reason=length`, context overflow, body cutoff | Distinct failure; không gọi là schema support failure. |
| Error handling | structured/unstructured 4xx/5xx | Stable sanitized category; raw body/prompt không leak. |
| Auth | no-auth local, mocked 401/403, configured auth mode | Header policy đúng; error/redaction đúng; report không chứa value. |
| Model missing | 404/stable provider error | `MODEL_NOT_FOUND`-class failure, không thành output schema error. |
| Rate limit | 429 + bounded `Retry-After` | Retry đúng declared policy/same tuple hoặc fail; không route khác. |
| Timeout | connect/read/inference deadline | Abort bounded; stable timeout; không auto-switch model. |
| Response size | oversized success/error body | Abort/reject bounded; no raw body persistence. |

### Task-specific requirements

Conformance spec không nên thử toàn bộ advertised 1M context. Nó kiểm tra **operating envelope của task**:

| Task | Initial conformance envelope |
| --- | --- |
| `version-analysis.v1` | Exact current candidate schema; minimum 32K input capability; bounded context tương đương current selector + headroom; non-streaming structured result. |
| `impact-analysis.v1` | Chỉ định nghĩa sau khi MVP-04 input/output schema và source-fact bundle tồn tại. |
| `migration-planning.v1` | Chỉ định nghĩa sau khi MVP-05 plan schema, evidence/impact-ref rules và truncation policy tồn tại. |

Không dùng MVP-03 schema để “certify trước” MVP-04/05.

### Conformance không phải quality

Một model có thể pass mọi case vì grammar-constrained decoding nhưng vẫn invent API hoặc phân loại risk sai. Vì vậy conformance report không chứa `overallScore`, risk accuracy hoặc benchmark ranking. Nó chỉ cho phép candidate đi tiếp.

## 5. Capability Certification

Certification là trạng thái của tuple:

```text
(task, capabilityProfileDigest, deploymentProfileDigest,
 conformanceSpecVersion, promptVersion, taskSchemaDigest,
 datasetVersion, trust/evaluation version)
```

Không certification model family “cho mọi use case”.

### Trạng thái

| Status | Ý nghĩa | Được phép |
| --- | --- | --- |
| `NOT_SUPPORTED` | Thiếu capability bắt buộc hoặc conformance hard-fail. | Không smoke quality, không benchmark quality, không production. |
| `EXPERIMENTAL` | Profile hợp lệ nhưng conformance/smoke/quality evidence chưa đủ hoặc deployment mutable chưa pin. | Discovery và explicit developer experiment; không trusted downstream. |
| `SUPPORTED` | Conformance + technical smoke pass cho exact deployment/task. | Golden Benchmark và real-repo validation; không production. |
| `CERTIFIED` | Golden Benchmark, representative real-repo validation và production gate pass cho exact task tuple. | Production allowlist trong phạm vi task/certification validity. |
| `DEPRECATED` | Vẫn có record lịch sử nhưng có replacement, expiry hoặc trigger requalification chưa hoàn tất. | Không qualification mới; existing production chỉ trong explicit bounded migration policy. |
| `RETIRED` | Removed, unsafe, unavailable hoặc hard regression. | Bị block cho new runs; chỉ giữ artifacts để audit. |

### Chuyển trạng thái

```text
New discovery
   ├── missing hard capability ──→ NOT_SUPPORTED
   └── profile valid ────────────→ EXPERIMENTAL
                                      ↓ conformance + smoke pass
                                   SUPPORTED
                                      ↓ all qualification gates pass
                                   CERTIFIED
                                      ↓ drift/change/expiry
                                   DEPRECATED
                                      ├── requalify pass → CERTIFIED
                                      └── removal/failure → RETIRED
```

`NOT_SUPPORTED → EXPERIMENTAL` chỉ sau capability/profile revision mới hoặc conformance specification thay đổi có lý do. Hard security/identity failure có thể đưa bất kỳ state nào thẳng tới `RETIRED`.

### Qualification Record

Record portable chứa:

- scope tuple/digests ở trên;
- current status, decision timestamp và optional expiry/review trigger;
- links/digests đến Conformance Report, smoke evidence, Evaluation Report, Metrics, Scorecard, Benchmark Report và real-repository validation;
- gates pass/fail và limitations;
- `supersedes`/previous decision digest khi status đổi;
- không chứa raw prompt/evidence, secret hoặc benchmark payload duplication.

Decision record không được tự sinh `CERTIFIED` chỉ vì `overallScore` cao. Tất cả hard gates và real-repo gate phải pass.

## 6. Model Qualification Pipeline

Mỗi stage phải tạo artifact độc lập; stage sau chỉ đọc validated artifact của stage trước.

Model qualification phải inject/resolve một explicit runtime từ Deployment Profile. [`runEvaluation`](../src/evaluation-runner.js) hiện chủ ý fallback sang golden fake khi `runtime` vắng; behavior này đúng cho deterministic CI nhưng **không hợp lệ cho qualification**. Workflow phải reject artifact có provider/model `golden-fake`, missing deployment digest hoặc missing observed actual identity trước khi chấm quality gate.

| Stage | Input | Output/artifact | Quality gate | Rollback strategy |
| --- | --- | --- | --- | --- |
| 1. Discovery | Official docs/model cards + task requirements | Capability Profile | Sources official, checked date, unknowns explicit, no vendor logic | Giữ profile cũ; profile mới không active. |
| 2. Capability Conformance | Capability + candidate Deployment Profile + spec/schema digest | Conformance Report | All required cases pass; exact identity; no hidden fallback/transform | Candidate stays EXPERIMENTAL; production profile untouched. |
| 3. Smoke Validation | Conformant deployment + bounded safe fixture | Smoke Report/execution trace | One end-to-end request, local schema/trust path, sanitized metadata | Revert to mocked/offline path; no model substitution. |
| 4. Golden Benchmark | SUPPORTED tuple + versioned dataset/prompt/schema | Existing Evaluation/Metrics/Scorecard/Benchmark artifacts | Existing hard metrics all pass; no invalid samples/route drift | Keep previous certified tuple; failed candidate not promoted. |
| 5. Real Repository Validation | Benchmark-passing tuple + representative repositories/evidence | Real Validation Report + trusted artifacts | Real evidence, schema/trust pass, human review confirms usefulness/grounding | Discard candidate outputs; never feed failed results downstream. |
| 6. Production Qualification | All prior digests + privacy/SLO/ops evidence | Qualification Record `CERTIFIED` | Task-specific quality + privacy + identity + reproducibility gates pass | Active pointer remains previous certified profile. |
| 7. Continuous Evaluation | Certified tuple + canary/golden subset + runtime telemetry | Drift Evaluation Record | No hard-gate regression, identity/config unchanged | Mark DEPRECATED or RETIRED; fail closed or return to previous certified tuple. |
| 8. Requalification | Trigger + updated profiles/spec/dataset | New conformance/benchmark/qualification artifacts | Same gates as affected stages; no inherited pass without evidence | Old record remains historical; only valid old profile may stay active. |
| 9. Retirement | Deprecated/failed/unavailable record | Qualification Record `RETIRED` | Replacement/communication/data review complete, or immediate hard block | No automatic fallback; explicitly select another certified tuple. |

### Existing MVP-03 hard gates

Qualification phải reuse thresholds trong [`src/ai-scorecard.js`](../src/ai-scorecard.js), không tạo scorecard thứ hai:

| Metric | Gate |
| --- | ---: |
| Risk classification accuracy | ≥ 0.90 |
| Human review accuracy | ≥ 0.95 |
| Human review reason accuracy | ≥ 0.95 |
| Evidence reference accuracy | ≥ 0.95 |
| Evidence reference coverage | ≥ 0.95 |
| Unsupported claim rate proxy | ≤ 0.05 |
| Validation pass rate | ≥ 0.98 |
| Deterministic pass rate | = 1.00 |

Ngoài aggregate gate, qualification phải fail nếu có invented evidence/URL trong release candidate set, unknown actual identity, unexpected fallback/transform hoặc required slice regression. Current unsupported-claim metric là `CLAIMS_DROPPED` proxy, chưa phải semantic entailment proof; real-repository human review vẫn bắt buộc trước certification.

### MVP-04/MVP-05 gate

- MVP-04 cần dataset/metrics cho source-fact linkage, affected-location precision/recall, no-impact correctness và trust propagation.
- MVP-05 cần step-level evidence/impact refs, invented command/API rate, ordering/precondition correctness, rollback/verification completeness và human-review policy.
- Cho đến khi các artifacts này tồn tại, model dù CERTIFIED cho MVP-03 vẫn chỉ là EXPERIMENTAL cho MVP-04/05.

### Production rollback

Production selection là explicit reference tới một CERTIFIED Deployment Profile + Qualification Record digest. Promote candidate không overwrite record cũ. Khi regression xảy ra:

1. stop new runs trên affected profile;
2. chuyển record sang `DEPRECATED` hoặc `RETIRED` theo severity;
3. chọn lại previous still-valid certified profile bằng explicit config, không router fallback;
4. nếu không có profile hợp lệ, fail closed và yêu cầu human review;
5. đánh dấu outputs sinh trong affected window để review; rollback model không tự sửa artifacts đã publish.

## 7. Requalification Policy

### Trigger matrix

| Change/trigger | Minimum required action |
| --- | --- |
| Exact model/revision/weights change | Full conformance + smoke + Golden Benchmark + real-repo validation. |
| Mutable/latest alias resolves khác | Invalidate certification; create exact profile and full qualification. |
| Provider changes underlying model behavior | Full quality requalification even if model string unchanged. |
| Tokenizer change | Context/Unicode/large-output conformance + full benchmark; recalculate token/cost budgets. |
| Reasoning/thinking default or mode change | Structured output + latency/output conformance and full benchmark. |
| Temperature/top-p/seed policy change | Stability/conformance + Golden Benchmark repeated-run comparison. |
| Context window/input/output limit change | Context/truncation conformance; benchmark if operating envelope changes. |
| Structured-output/API/schema semantics change | Full structured-output/error conformance; benchmark only after pass. |
| Protocol/endpoint family change | Full protocol conformance + smoke; benchmark because response behavior may differ. |
| Runtime/inference-engine upgrade | Full conformance; quality benchmark for model/template/decoder-affecting changes. |
| Gateway version/config/routing update | Routing/identity/transform conformance + benchmark for any translated path. |
| Quantization/precision/KV/cache/template change | New Deployment Profile; full conformance and quality qualification. |
| Fallback/retry policy change | Routing/error conformance; full benchmark if a different tuple can answer. |
| Prompt version change | Conformance only if request/size changes; always full Golden Benchmark. |
| Candidate/task schema change | Full structured-output conformance + task benchmark. |
| Trust/evaluation/metric/dataset change | Recompute affected evaluation/qualification; do not compare unlike versions as one score. |
| Privacy/retention policy change | Re-approve deployment; no production until compliant. |
| Continuous evaluation hard-gate regression | Immediate DEPRECATED/RETIRED decision and affected-run review. |
| Model/provider deprecation or removal notice | Mark DEPRECATED, qualify replacement before cutoff; RETIRED at removal. |

### Partial vs full requalification

- **Conformance-only** chỉ cho change chắc chắn không ảnh hưởng semantic generation, ví dụ observability mapper sửa field usage mà request/model/config bytes không đổi.
- **Conformance + benchmark** khi decoding, prompt, schema, tokenizer, context, runtime/template hoặc provider behavior có thể đổi output.
- **Full qualification** khi model/revision/quantization/provider route thay đổi hoặc production task contract đổi.

Người review phải ghi lý do nếu chọn action nhỏ hơn matrix; không có silent inheritance.

### Drift và expiry

Immutable local weights với pinned digest vẫn có thể drift khi runtime/template đổi. Remote model ID có thể ổn định theo provider contract nhưng serving implementation vẫn thay đổi. Vì vậy:

- requalification chủ yếu event-driven theo profile/observed identity digest;
- remote mutable deployments cần continuous canary/golden subset ở cadence do maintainer định nghĩa trước;
- Qualification Record cần review/expiry policy cho deployment không thể pin weights;
- hết validity không tự chọn replacement; status chuyển DEPRECATED và production fail/rollback theo policy.

## 8. Deployment Profile

### Vai trò

Capability Profile trả lời **“offering được document hỗ trợ gì?”**. Deployment Profile trả lời **“UpgradeLens sẽ gọi exact tuple nào, với configuration nào?”**.

| Dimension | Capability Profile | Deployment Profile |
| --- | --- | --- |
| Subject | Logical model/API offering | Executable provider/runtime/gateway/model tuple |
| Source | Official documentation/model card | Operator-reviewed configuration + observed identity |
| Structured output | Modes có thể hỗ trợ | Exact mode sẽ dùng |
| Context | Advertised limits | Configured operating/max limits |
| Model identity | Public model ID/revision semantics | Requested ID + expected actual ID/revision/digest |
| Quantization/runtime | Không thuộc registry logical API profile | Required cho open weights/local serving |
| Routing/fallback/retry | Không | Exact policy |
| Prompt/schema/benchmark score | Không | Chỉ task/schema binding digest; không chứa prompt text/score |
| Secret | Không | Không; chỉ auth source/mode, không value |
| Certification | Không | Không tự thân; Qualification Record quyết định |

### Shape khái niệm

```json
{
  "schemaVersion": "1.0.0",
  "id": "qwen3-14b-vllm-awq-version-analysis",
  "task": "version-analysis.v1",
  "capabilityProfile": "qwen3-14b",
  "provider": "self-hosted",
  "runtime": {
    "name": "vllm",
    "version": "<exact>",
    "protocol": "openaiChatCompletions"
  },
  "endpoint": {
    "class": "loopback",
    "reference": "UPGRADELENS_AI_ENDPOINT",
    "tlsRequired": false
  },
  "model": {
    "requested": "Qwen/Qwen3-14B-AWQ",
    "expectedActual": "Qwen/Qwen3-14B-AWQ",
    "revision": "<commit-or-digest>",
    "quantization": "AWQ-4bit"
  },
  "generation": {
    "thinking": "disabled",
    "reasoningEffort": null,
    "temperature": 0,
    "topP": null,
    "seed": 1,
    "contextTokens": 32768,
    "maxOutputTokens": 4096
  },
  "structuredOutput": {
    "mode": "jsonSchema",
    "taskSchemaDigest": "sha256:..."
  },
  "routing": {
    "gateway": null,
    "fallback": "disabled",
    "transforms": []
  },
  "transport": {
    "streaming": false,
    "timeoutMs": 90000,
    "retry": { "maxAttempts": 1 }
  },
  "auth": {
    "mode": "none",
    "source": null
  },
  "observability": {
    "requireModelIdentity": true,
    "requireFinishReason": true,
    "usage": "optional"
  }
}
```

Các giá trị chỉ minh họa field boundary, không phải recommendation runtime hay file được tạo trong LR-00C.

### Profile invariants

- endpoint không có username/password/query secret; portable profile có thể dùng environment reference;
- auth chỉ mô tả `none|bearer|providerHeader` và secret source, không secret value;
- `requested`, expected actual model và revision/digest không được unknown cho benchmark;
- open-weight profile bắt buộc quantization/precision, runtime version và model digest;
- cloud profile bắt buộc provider identity/revision semantics và actual-model check;
- gateway profile bắt buộc gateway version/config digest, provider pinning, fallback/transform policy;
- `latest`, auto/free router hoặc mutable alias chỉ được EXPERIMENTAL trừ khi official semantics chứng minh ID là pinned; không đánh giá chỉ bằng hình thức tên;
- extras không được override messages/prompt, model, schema mode hoặc streaming do profile sở hữu;
- thay bất kỳ semantic field tạo profile digest mới.

## 9. Runtime Governance Policy

### Được phép

- direct local/cloud endpoint hoặc optional gateway route với exact Deployment Profile;
- protocol-neutral `AiRuntime`, provider adapter chỉ map wire/error/usage;
- native final JSON Schema hoặc runtime grammar-constrained JSON Schema đã conformance;
- non-streaming baseline cho Version Analysis;
- retry bounded trên cùng exact tuple nếu profile khai báo và mọi attempt được trace;
- missing usage biểu diễn `null`;
- local Ajv + existing trust validation luôn chạy;
- execution trace tách khỏi portable Version Analysis Manifest và đã redact;
- production chỉ dùng task-scoped CERTIFIED qualification digest.

### Bị cấm trong benchmark và production qualification

- auto-router, free-router, combo, fusion, round-robin hoặc model pool;
- `latest`/mutable alias không có exact resolution semantics;
- unknown model revision, actual provider/model hoặc open-weight quantization;
- hidden model/provider/account fallback;
- fallback sang tuple chưa qualification độc lập;
- prompt transform, system injection, context compression hoặc response healing không được profile khai báo;
- extras ghi đè model/messages/schema/streaming;
- silent schema downgrade sang JSON mode/prompt-only/tool envelope;
- runtime capability auto-probe rồi đổi request mode trong benchmark run;
- streaming khi task/profile yêu cầu non-streaming;
- retry đổi model, provider, quantization hoặc reasoning mode;
- benchmark sample thiếu route identity nhưng vẫn tính vào average;
- benchmark qua profile khác production rồi reuse certification;
- dùng Capability Registry như production allowlist;
- chép benchmark score vào registry;
- log API key, Authorization, raw headers, full prompt/evidence, source code hoặc raw provider error body;
- để gateway/runtime quyết định current/target version, evidence selection, trust hoặc human review.

### Fail-closed policy

Unknown identity, schema downgrade, unexpected fallback/transform, invalid finish reason, truncation, refusal, oversized response hoặc conformance mismatch phải làm run invalid/failed. Không được publish raw candidate và không được chuyển sang MVP-04/MVP-05. Availability không được ưu tiên hơn semantic safety.

### Environment policy

- **Development:** EXPERIMENTAL/SUPPORTED được dùng với explicit opt-in; output không được coi production-qualified.
- **Benchmark:** chỉ SUPPORTED exact profiles; all routing/transforms locked; invalid sample không được average.
- **Production:** chỉ CERTIFIED task-scoped profile; privacy policy approved; rollback target explicit.
- **Retired:** block new runs ở mọi mode ngoài controlled forensic replay.

## 10. Future Architecture

### Logical flow

```text
Static Capability Registry
        +
Candidate Deployment Profile
        ↓
Capability Conformance Specification/Runner
        ↓
Conformance Report
        ↓
Model Qualification Workflow
        ├── technical smoke
        ├── existing Evaluation/Metrics/Scorecard/Benchmark
        └── real repository validation
        ↓
Qualification Record
        ↓ only CERTIFIED for task
Existing AiRuntime
        ↓
Local schema validation + trust validation
        ↓
Portable task artifact
        ↓
Continuous evaluation / requalification / retirement
```

Deployment Profile phải tồn tại ở dạng candidate trước conformance vì không thể test một model trừu tượng. Sau conformance, cùng immutable profile digest trở thành “conformant deployment”; không tạo thêm `ValidatedDeploymentProfile` abstraction.

### Minimal components

| Component | Cần mới? | Trách nhiệm duy nhất |
| --- | --- | --- |
| Capability Profile JSON + schema | Có, sau LR-00C | Declared capability metadata/provenance. |
| Deployment Profile JSON + schema | Có | Exact non-secret runtime configuration identity. |
| Conformance Specification + Report | Có | Portable test contract và observations. |
| Qualification Record | Có | Task-scoped lifecycle decision/linkage. |
| Evaluation/Metrics/Scorecard/Benchmark | Dùng lại | Quality measurement; không duplicate. |
| `AiRuntime` và trust/manifest path | Giữ nguyên | Runtime boundary và semantic publication safety. |

Không cần:

- registry service/database/API;
- plugin loader/dynamic adapter discovery;
- policy DSL/rule engine;
- model marketplace;
- auto negotiation/auto selection;
- new production microservice;
- vendor-specific Version Analysis implementation.

### Consumption rule

Production configuration trỏ explicit tới Deployment Profile + current Qualification Record digest. Runtime không tự recompute certification và không scan registry mỗi request. CI/release qualification tooling mới đọc profiles/reports và tạo decision record. Điều này giữ production path nhỏ và provider-neutral.

## 11. Recommended MVP Roadmap

LR-00 và LR-00A đã dùng tên **LR-01, LR-02, LR-03** cho OpenAI-compatible provider, Ollama smoke và gateway conformance. Không nên reuse cùng ID cho governance. Đề xuất prefix `LR-G` để tránh collision.

### LR-G01 — Portable Governance Metadata Contracts

**Scope:** schema + examples cho Capability Profile, Deployment Profile, Conformance Report và Qualification Record; canonical digest/invariants; documentation.

**Acceptance criteria:** provider/model-neutral; no secrets; static explicit loading; profile distinction rõ; fixture validation/determinism tests.

**Out of scope:** live endpoint, CLI selection, benchmark execution, registry service/database.

### LR-G02 — Offline Capability Conformance Suite

**Scope:** implement conformance specification/runner trên mocked protocol fixtures; exact MVP-03 schema cases; error/identity/routing/redaction cases.

**Acceptance criteria:** default CI không network/model; required case semantics; deterministic report; no Evaluation Runner dependency; all current adapters can supply mocked fixtures.

**Out of scope:** quality scoring, model download, account/API key, production promotion.

### LR-G03 — Opt-in Deployment Conformance and Smoke

**Scope:** bind explicit Deployment Profile vào runtime adapter; live opt-in conformance cho direct Ollama đầu tiên, sau đó locked gateway/cloud profile khi operator cung cấp; separate sanitized trace.

**Acceptance criteria:** exact identity/schema/finish/usage/error observations; no auto pull/account creation; no default CI; report contains no secret/full evidence.

**Out of scope:** model ranking và production certification.

### LR-G04 — Qualification Workflow Integration

**Scope:** reuse existing Evaluation → Metrics → Scorecard → Benchmark artifacts; validate hard gates; add real-repo validation linkage; emit task-scoped Qualification Record.

**Acceptance criteria:** cannot certify without conformant/smoke/benchmark/real-repo artifacts; no duplicate metrics; failed candidate leaves current production selection unchanged.

**Out of scope:** MVP-04/MVP-05 metrics until their contracts exist; auto model selection.

### LR-G05 — Requalification and Retirement

**Scope:** change-impact comparison giữa profile digests, trigger matrix, continuous canary linkage, deprecation/retirement decision và explicit rollback selection.

**Acceptance criteria:** mutable alias/runtime/gateway/quantization/prompt/schema changes invalidate đúng scope; retired profile blocked; no hidden fallback.

**Out of scope:** scheduler service, monitoring platform, database, enterprise approval workflow.

### Sequencing

```text
LR-01 provider implementation (existing roadmap)
        ↓
LR-G01 metadata contracts
        ↓
LR-G02 offline conformance
        ↓
LR-02 / LR-G03 local live smoke
        ↓
LR-G04 qualification
        ↓
LR-G05 lifecycle governance
```

LR-G01/G02 có thể chuẩn bị song song với runtime implementation về mặt planning, nhưng live conformance cần một real adapter. MVP-04/05 chỉ thêm task-specific conformance/qualification criteria khi schema/evaluation của chúng được định nghĩa; không cần framework mới.

## 12. Validation

### Scope validation

- Chỉ thêm `docs/ai-runtime-governance-discovery.md` cho LR-00C.
- Không sửa production code.
- Không sửa runtime hoặc runtime behavior.
- Không thay đổi behavior.
- Không sửa CLI.
- Không sửa schema.
- Không sửa prompt.
- Không sửa trust layer.
- Không sửa benchmark.
- Không sửa evaluation, metrics hoặc scorecard.
- Không thêm dependency hoặc cài SDK.
- Không gọi model, không dùng API key và không tạo account.
- Không tạo registry files, conformance runner, qualification workflow, database, service hoặc plugin system.
- Không có secret trong tài liệu.
- Không chạy test suite vì không có executable change.

### Repository validation

- Deliverable có đúng 12 section tương ứng yêu cầu LR-00C.
- Thiết kế phục vụ trực tiếp `version-analysis.v1`; MVP-04/MVP-05 được scoped riêng thay vì thừa hưởng certification.
- Capability Registry chỉ là portable metadata; không prompt, benchmark score hoặc vendor logic.
- Conformance chỉ là portable specification/report; không quality benchmark.
- Qualification chỉ là portable workflow/decision record; không service mới.
- `git diff --check` phải pass trước handoff.
