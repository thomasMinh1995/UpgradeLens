# LR-00 — OpenAI-Compatible Runtime Architecture Discovery

Ngày khảo sát: 2026-07-15

Phạm vi: discovery kiến trúc. Tài liệu này không thay đổi runtime behavior, không triển khai adapter, không thêm dependency, không dùng API key và không gọi model.

## 1. Executive Summary

Generic HTTP provider hiện tại **không tương thích trực tiếp** với OpenAI-compatible protocol. CLI mặc định gửi `POST` tới nguyên URL trong `UPGRADELENS_AI_ENDPOINT`, body `{ prompt, outputSchema }`, không gửi model, và đọc kết quả từ `body.output`. OpenAI-compatible Chat Completions cần `model`, `messages`, thường thêm `response_format`, và trả nội dung trong `choices[0].message.content`. Vì vậy trạng thái hiện tại của Ollama, vLLM, LiteLLM Proxy, LM Studio, OpenRouter và OpenAI API đều là `REQUIRES_MAPPING` nếu dùng nguyên cấu hình CLI hiện có.

Kiến trúc nhỏ nhất nên là:

```text
UpgradeLens AI core
        ↓
AiRuntime
        ↓
OpenAiCompatibleProvider
        ↓
User-selected Chat Completions endpoint
```

Adapter nên dùng protocol Chat Completions làm baseline, không dùng OpenAI SDK và không chứa nhánh theo vendor. Một cấu hình endpoint nhỏ gồm full endpoint URL, model, optional Authorization và capability `structuredOutput` là đủ. Chưa cần registry, dynamic loading, plugin SDK hoặc endpoint profile theo tên vendor. Responses API có thể được bổ sung sau nhưng không mở khóa thêm giá trị cho use case một request/response hiện tại.

Structured output nên theo thứ tự `jsonSchema → jsonMode → promptOnly`, nhưng fallback phải do capability/config đã biết quyết định, không âm thầm retry một request khác sau mọi lỗi `400`. Kết quả luôn phải được parse, validate lại bằng `AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA`, rồi đi qua trust validation hiện tại. Native schema là ràng buộc lúc sinh; local schema và trust layer mới là authority.

Runtime đầu tiên nên là **Ollama local qua OpenAI-compatible Chat Completions**, dùng model đã có trên máy contributor. Lý do: Ollama là MIT, chạy local, đã cài trên máy test, không cần cloud account, hỗ trợ `/v1/chat/completions`, `response_format` và JSON Schema. Smoke validation chỉ chứng minh transport/schema/trust pipeline; nó không chứng minh chất lượng phân tích production của `qwen3:latest` hoặc `llama3:latest`.

## 2. Current UpgradeLens Runtime Contract

### 2.1 Internal `AiRuntime` contract

Contract được định nghĩa trong `src/ai-runtime.js:1-27` và được gọi thực tế tại `src/ai-version-analysis.js:367-430`:

```js
await runtime.generateStructured({
  runId,
  contextId: context.contextId,
  promptVersion,
  context,
  outputSchema
});
```

| Field | Nguồn và behavior thực tế |
| --- | --- |
| `runId` | Mặc định `run:${context.contextId}` trong `analyzeDependencyAiContext`; được truyền qua provider nhưng generic HTTP default body loại bỏ field này. |
| `contextId` | Digest ổn định của Dependency AI Context; cũng bị generic default body loại khỏi HTTP request. |
| `promptVersion` | Mặc định `VERSION_ANALYSIS_PROMPT_VERSION = "1"`; prompt builder chép vào `prompt.promptVersion`. |
| `context` | Dependency context đầy đủ: lineage, dependency identity, version facts, evidence đã chọn và metadata. |
| `outputSchema` | `AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA`, JSON Schema draft 2020-12, strict object và không cho model viết lại deterministic dependency/version facts. |

`validateAiRuntime` chỉ kiểm tra runtime có function `generateStructured`. Nó không kiểm tra capability, timeout, model hay provider.

Kết quả nội bộ được mô tả là:

```js
{
  output: unknown,
  provider: string,
  model: string,
  latencyMs: number,
  usage?: { inputTokens?: number, outputTokens?: number }
}
```

`createProviderAiRuntime` tại `src/ai-runtime.js:49-85` chịu trách nhiệm:

1. dựng prompt từ `context`, `outputSchema`, `promptVersion`;
2. gọi provider với toàn bộ request cộng thêm `prompt`;
3. lấy `provider`/`model` từ response, rồi fallback sang metadata tĩnh của provider;
4. đo latency nếu provider không trả latency;
5. chuyển tiếp nguyên `response.usage` mà không normalize field.

`analyzeDependencyAiContext` chỉ dùng `runtimeResult.output`; provider/model/latency/usage không được chép vào trusted analysis result hay portable Version Analysis artifact. Evaluation report nhận model metadata riêng từ CLI/injection, còn Benchmark Runner quan sát runtime response qua wrapper trước khi analysis core loại metadata này. Đây là ranh giới chủ ý giữa portable artifact và execution telemetry, nhưng cũng có nghĩa model/provider từ HTTP response hiện không được audit trong artifact.

Internal provider contract không có typedef riêng nhưng behavior thực tế là:

```js
provider.generateStructured({
  runId,
  contextId,
  promptVersion,
  context,
  outputSchema,
  prompt: { promptVersion, system, user }
});
```

Provider phải trả tối thiểu `{ output }`; `provider`, `model`, `latencyMs`, `usage` là metadata được runtime fallback hoặc bổ sung.

### 2.2 Prompt và schema flow

`buildVersionAnalysisPrompt` tại `src/ai-version-analysis.js:193-221` trả object, không phải một string:

```json
{
  "promptVersion": "1",
  "system": "You are UpgradeLens AI Version Analysis.\n...",
  "user": "Rules:\n...\nStructured output schema:\n{...}\n\nDependency AI Context:\n{...}"
}
```

Schema được dùng hai lần ở boundary hiện tại:

- serialize trực tiếp vào `prompt.user` để ràng buộc bằng prompt;
- truyền riêng dưới field `outputSchema` tới provider.

CLI không chuyển `outputSchema` thành `response_format`. Vì vậy schema hiện chỉ được gửi như generic JSON data và prompt text; nó chưa kích hoạt native structured-output của OpenAI-compatible endpoint.

Sau response, `analyzeDependencyAiContext`:

1. parse `runtimeResult.output` nếu output là string;
2. validate bằng Ajv và `AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA`;
3. chạy `trustValidateAiVersionAnalysisCandidate` để allowlist evidence refs, loại claims không có evidence, phát hiện URL ngoài evidence và áp dụng human-review policy.

Local schema validation và trust validation đã là bắt buộc trong core và phải giữ nguyên với mọi runtime mới.

### 2.3 Current generic HTTP contract

`createHttpJsonAiProvider` tại `src/ai-runtime.js:93-146` có mapper tùy biến, nhưng CLI tại `src/cli.js:323-340` không cung cấp mapper. Do đó production CLI dùng đúng default sau.

Request tối giản theo code hiện tại:

```http
POST <exact UPGRADELENS_AI_ENDPOINT value>
content-type: application/json
authorization: <exact UPGRADELENS_AI_AUTHORIZATION value, if set>
```

```json
{
  "prompt": {
    "promptVersion": "1",
    "system": "...",
    "user": "...schema and dependency context..."
  },
  "outputSchema": {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object"
  }
}
```

Các điểm cần lưu ý:

- `UPGRADELENS_AI_ENDPOINT` hiện là **full endpoint URL**, không phải base URL; code không nối `/v1/chat/completions`.
- `UPGRADELENS_AI_MODEL` chỉ gắn nhãn metadata trên response; **không được gửi trong body**.
- `UPGRADELENS_AI_PROVIDER` cũng chỉ là metadata/error label.
- `UPGRADELENS_AI_AUTHORIZATION` là nguyên giá trị header; người dùng hiện phải tự thêm scheme như `Bearer `.
- Header caller truyền vào có thể ghi đè `content-type` do spread order.
- Không có `Accept`, user-agent riêng cho AI, redirect policy hay content-type validation.

Success response mà default extractor mong đợi:

```json
{
  "output": {
    "summary": "...",
    "summaryEvidenceRefs": [],
    "riskLevel": "unknown",
    "riskEvidenceRefs": [],
    "findings": []
  },
  "usage": {
    "inputTokens": 100,
    "outputTokens": 25
  }
}
```

`output` cũng có thể là JSON string. `body.usage` được chuyển tiếp nguyên trạng; provider không map OpenAI `prompt_tokens`/`completion_tokens` sang internal `inputTokens`/`outputTokens`.

### 2.4 Timeout, retry, response size và errors hiện tại

Behavior xác minh từ `src/ai-runtime.js:118-145`:

- không có timeout hoặc `AbortSignal`;
- không retry;
- gọi `response.text()` không giới hạn kích thước;
- đọc toàn bộ body trước khi kiểm tra `response.ok`;
- non-2xx chỉ tạo `Error("AI provider <provider> returned HTTP <status>.")`, bỏ error body và headers;
- success body không phải JSON tạo error `returned invalid JSON`;
- không validate response envelope; thiếu `body.output` chỉ trở thành `undefined` và bị candidate schema validation bắt ở lớp sau;
- network/abort errors từ `fetch` đi qua nguyên trạng.

Tại `src/ai-version-analysis.js:407-429`, mọi exception ngoại trừ sentinel `INVALID_JSON` đều bị biểu diễn trong analysis result như `OUTPUT_SCHEMA_INVALID`. Vì vậy auth, timeout, transport, model-not-found và provider error hiện chưa phân biệt được và CLI có thể báo một lỗi schema gây hiểu nhầm.

Repository đã có bounded transport tốt hơn cho registry tại `src/http/bounded-fetch.js` (timeout, response byte limit, redirect `error`, sanitized errors), nhưng AI provider chưa dùng các guardrail tương đương.

### 2.5 CLI, evaluation và benchmark wiring

Không có AI env constants trong `src/constants.js`; bốn tên env hiện là string literal trong `src/cli.js`:

```text
UPGRADELENS_AI_ENDPOINT
UPGRADELENS_AI_PROVIDER
UPGRADELENS_AI_MODEL
UPGRADELENS_AI_AUTHORIZATION
```

Precedence thực tế:

- `analyze-version`: `io.aiRuntime` được ưu tiên; nếu không có và ít nhất một context có evidence thì dùng env runtime; không evidence thì không tạo runtime.
- `eval`: `io.aiRuntime` → env endpoint → `golden-fake`.
- `benchmark`: mỗi run `goldenFake` không cần runtime; `environment` gọi default env runtime; type khác phải được inject bằng `benchmarkRuntimeFactory`.
- `io.env` thay hoàn toàn `process.env` khi test/injection cung cấp nó.

Evaluation Runner (`src/evaluation-runner.js:193-226`) gọi cùng `analyzeDependencyAiContext`, cùng schema và trust path. Benchmark Runner (`src/benchmark-runner.js:64-175`) wrap runtime để thu latency, token usage và cost. Collector nhận `tokenUsage`, `usage.totalTokens` hoặc `usage.total_tokens`; nó chưa cộng `inputTokens + outputTokens` và current generic provider chưa normalize usage.

Tests xác nhận contract thay vì chỉ tên function:

- `test/ai-version-analysis.test.js:362-390`: prompt được build và provider nhận `prompt.promptVersion`.
- `test/ai-version-analysis.test.js:392-419`: generic HTTP mapper là configurable và cố ý không khóa vào OpenAI shape.
- `test/evaluation-runner.test.js`: fake runtime đi qua analysis/trust/evaluation path.
- `test/benchmark-runner.test.js`: runtime response metadata được collector tổng hợp.
- `test/version-analysis-manifest.test.js`: CLI inject runtime, skip/no-call cases và per-dependency failure behavior.

`docs/live-ai-validation.md` ghi nhận pipeline real-evidence dừng đúng tại missing runtime configuration. `docs/ai-engineering-review.md` đã liệt kê timeout/retry/error taxonomy là runtime gaps. `docs/version-analysis-architecture.md:687-732` giữ telemetry ngoài portable manifest và cấm log full prompt/evidence mặc định.

## 3. OpenAI-Compatible Protocol Baseline

### 3.1 Chọn Chat Completions làm baseline

Baseline cho adapter đầu tiên nên là non-streaming `POST /v1/chat/completions`. OpenAI định nghĩa request bằng `model` và `messages`, trả `choices[].message`, cùng usage token fields; `response_format.type = "json_schema"` bật Structured Outputs. [OpenAI Chat Completions reference](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create) và [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs) là baseline tham chiếu, không phải yêu cầu dùng OpenAI service hay SDK.

Request tối thiểu do adapter đề xuất:

```json
{
  "model": "<user-selected-model>",
  "messages": [
    { "role": "system", "content": "<prompt.system>" },
    { "role": "user", "content": "<prompt.user>" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "upgradelens_version_analysis",
      "strict": true,
      "schema": { "type": "object" }
    }
  },
  "stream": false
}
```

Response tối thiểu cần map:

```json
{
  "model": "<resolved-model>",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "{\"summary\":\"...\"}"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 100,
    "completion_tokens": 25,
    "total_tokens": 125
  }
}
```

Mapping nội bộ:

```js
{
  output: body.choices[0].message.content,
  provider: configuredProviderLabel,
  model: body.model ?? configuredModel,
  usage: {
    inputTokens: body.usage?.prompt_tokens,
    outputTokens: body.usage?.completion_tokens,
    totalTokens: body.usage?.total_tokens
  }
}
```

Authorization baseline là optional `Authorization: Bearer <token>`. OpenAI và OpenRouter bắt buộc Bearer; Ollama local bỏ qua API key; vLLM và LM Studio có thể bật auth; LiteLLM Proxy thường dùng master/virtual key. Adapter không nên giả định auth luôn có hoặc luôn không có.

### 3.2 Responses API không thuộc adapter đầu tiên

Responses API hiện có ở OpenAI, Ollama, vLLM, LiteLLM, LM Studio và OpenRouter ở các mức khác nhau, nhưng statefulness, tools và structured-output field khác Chat Completions. Ví dụ Ollama chỉ hỗ trợ flavor không stateful; OpenRouter mô tả Responses API là beta/stateless; LM Studio có stateful follow-up. Những khác biệt này không giúp use case hiện tại vốn chỉ gửi một system/user prompt và nhận một JSON candidate.

Quyết định LR-00:

- implementation đầu tiên chỉ dùng Chat Completions;
- không thiết kế abstraction chung cho Chat Completions và Responses;
- chỉ xem xét Responses khi UpgradeLens có requirement cụ thể không thể giải quyết bằng Chat Completions.

### 3.3 Compatibility không có nghĩa là mọi capability giống nhau

OpenAI-compatible là wire family, không phải chứng nhận mọi model/endpoint hỗ trợ cùng JSON Schema subset, errors hoặc routing. Adapter phải cố định phần chung và giữ khác biệt nhỏ ở configuration/capability:

- full endpoint URL;
- authorization optional;
- model ID/alias;
- structured-output mode của endpoint + model;
- usage mapping defensive;
- HTTP status/error envelope mapping defensive.

Streaming đều có ở các runtime khảo sát nhưng được đặt `false` và ngoài scope.

## 4. Runtime Compatibility Matrix

Trong cột `Compatibility`, nhãn đánh giá adapter đề xuất, không phải generic HTTP provider hiện tại. Generic provider hiện tại là `REQUIRES_MAPPING` cho **tất cả** runtime trong bảng.

| Runtime | Open source / self-hosted | Compatible endpoint | Structured output | Usage metadata | Auth | Compatibility / adapter complexity | Recommended role |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Ollama | Có; MIT; local/self-hosted | `/v1/chat/completions`; `/v1/models`; Responses một phần | `response_format`; JSON mode và JSON Schema; model quality vẫn ảnh hưởng | OpenAI-style usage được endpoint compatibility hỗ trợ | Local không cần; SDK client thường yêu cầu dummy key nhưng server bỏ qua | `DIRECT` / thấp | First local smoke runtime và contributor default |
| vLLM | Có; Apache-2.0; self-hosted | `/v1/chat/completions`; `/v1/models`; `/v1/responses` | `json_object`, `json_schema`, và structured-output extensions | OpenAI-style usage | Optional `--api-key` | `DIRECT` / thấp; cần model có chat template | High-throughput/self-hosted server validation |
| LiteLLM Proxy | Có phần core MIT; self-hosted gateway; enterprise folder có license riêng | `/chat/completions` theo quick start; Responses cũng được proxy hỗ trợ | Nhận OpenAI params nhưng support thực tế phụ thuộc upstream model/provider và proxy policy | Chuẩn hóa OpenAI response, usage và có cost/observability riêng | Master key/virtual key Bearer khi cấu hình | `PARTIAL` / thấp ở wire, trung bình ở capability | Optional multi-provider gateway, không phải dependency mặc định |
| LM Studio | Self-hosted local nhưng desktop app là proprietary, không phải OSS | `/v1/chat/completions`; `/v1/models`; `/v1/responses` | JSON Schema qua `response_format`; docs cảnh báo không phải model nào cũng làm tốt | OpenAI-style usage | Mặc định none; API token Bearer có thể bật | `PARTIAL` / thấp; protocol direct nhưng OSS criterion không đạt | Optional GUI-friendly contributor runtime |
| OpenRouter | Cloud, không self-hosted | `/api/v1/chat/completions`; `/api/v1/models`; Responses beta | JSON Schema chỉ cho model/provider tương thích; có `require_parameters` để ép routing | OpenAI-like token usage; model-specific accounting | Bearer bắt buộc | `PARTIAL` / thấp-trung bình; cần chọn model/capability | Optional cloud compatibility validation |
| OpenAI API | Cloud, không self-hosted | `/v1/chat/completions`; `/v1/models`; `/v1/responses` | Native JSON Schema/JSON mode tùy model | Canonical `prompt_tokens`, `completion_tokens`, `total_tokens` | Bearer bắt buộc | `DIRECT` / thấp | Protocol baseline và optional cloud endpoint, không phải default |

Nguồn chính thức: [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [Ollama Structured Outputs](https://docs.ollama.com/capabilities/structured-outputs), [vLLM OpenAI-compatible server](https://docs.vllm.ai/en/stable/serving/openai_compatible_server/), [vLLM Structured Outputs](https://docs.vllm.ai/en/stable/features/structured_outputs/), [LiteLLM docs](https://docs.litellm.ai/), [LM Studio OpenAI compatibility](https://lmstudio.ai/docs/developer/openai-compat), [LM Studio Structured Output](https://lmstudio.ai/docs/developer/openai-compat/structured-output), [OpenRouter API overview](https://openrouter.ai/docs/api/reference/overview), và [OpenRouter Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs).

License/suitability được đối chiếu từ [Ollama MIT license](https://github.com/ollama/ollama/blob/main/LICENSE), [vLLM Apache-2.0 license](https://github.com/vllm-project/vllm/blob/main/LICENSE), [LiteLLM license](https://github.com/BerriAI/litellm/blob/main/LICENSE), và [LM Studio App Terms](https://lmstudio.ai/app-terms).

### 4.1 Mismatch cụ thể

**Request:** current provider gửi `{prompt, outputSchema}`; mọi runtime trong bảng cần `model/messages` cho Chat Completions. Current CLI model không nằm trong body. Native structured output cần `response_format`, không phải top-level `outputSchema`.

**Response:** current provider đọc `body.output`; Chat Completions trả string tại `body.choices[0].message.content`. Adapter cũng phải từ chối missing/empty choices, refusal, tool-only response và finish reason không chấp nhận được thay vì đẩy `undefined` xuống Ajv.

**Structured output:** Ollama/vLLM/LM Studio có native JSON Schema nhưng support cuối cùng vẫn chịu ảnh hưởng inference engine/model và JSON Schema subset. LiteLLM/OpenRouter thêm một lớp routing nên capability là theo selected model/provider, không theo hostname. OpenAI cũng có model cũ chỉ hỗ trợ JSON mode. Vì vậy `provider=openai-compatible` không đồng nghĩa `structuredOutput=jsonSchema` trong mọi cấu hình.

**Authentication:** OpenAI/OpenRouter bắt buộc Bearer; local Ollama thường none; vLLM/LM Studio optional; LiteLLM tùy gateway config. Không cần vendor branches—chỉ cần optional header—but không nên tiếp tục yêu cầu user nhập raw header value lâu dài.

**Errors:** OpenAI-family errors thường có `error` object, Ollama native docs cũng cho thấy `error` có thể là string, OpenRouter có typed `error.metadata.error_type`, còn upstream gateways có thể thay đổi detail. Adapter nên phân loại trước bằng transport/HTTP status, sau đó đọc bounded, sanitized `error.code/type/message`; không phụ thuộc một envelope duy nhất. [Ollama errors](https://docs.ollama.com/api/errors), [OpenRouter errors](https://openrouter.ai/docs/api/reference/errors-and-debugging), và [OpenAI error codes](https://developers.openai.com/api/docs/guides/error-codes) xác nhận khác biệt này.

**Timeout:** không có timeout contract portable trong Chat Completions wire format. Server/gateway có thể trả `408`, `429`, `502`, `503` hoặc đóng transport, nhưng thời gian chờ và retry policy là deployment-specific. Vì vậy client-side deadline của UpgradeLens phải là authority cho tất cả runtime; HTTP/provider signal chỉ giúp phân loại. Không tạo profile timeout theo vendor ở LR-01.

### 4.2 Local deployment và hardware ở mức kiến trúc

- Ollama là phù hợp nhất với laptop contributor; Apple Silicon dùng Metal native. Model phải vừa unified memory; model size/context quyết định RAM và latency, không phải adapter. [Ollama development/hardware notes](https://github.com/ollama/ollama/blob/main/docs/development.md)
- LM Studio cũng nhắm local desktop và khuyến nghị 16 GB+ RAM; app hỗ trợ Apple Silicon và local server. [LM Studio system requirements](https://lmstudio.ai/docs/app/system-requirements)
- vLLM phù hợp hơn cho server throughput và accelerator deployment; hardware/model serving là trách nhiệm operator. Mac contributor không nên phải cài vLLM để dùng UpgradeLens.
- LiteLLM Proxy không tự cung cấp inference; hardware phụ thuộc upstream. Nó thêm một service/gateway process và configuration.
- OpenRouter/OpenAI không có local hardware requirement nhưng cần network/account/cost và gửi evidence ra remote service.

## 5. OSS-First Architecture Options

### Option A — Direct Ollama Adapter

```text
UpgradeLens → OllamaProvider → Ollama
```

Ưu điểm:

- đường ngắn nhất để smoke test trên máy hiện tại;
- native Ollama `/api/chat` hỗ trợ field `format` với JSON Schema;
- contributor experience tốt và hoàn toàn local.

Nhược điểm:

- coupling với Ollama request/response native dù Ollama đã cung cấp OpenAI-compatible endpoint;
- muốn thêm vLLM/LM Studio/cloud sau đó phải thêm adapter song song;
- auth, errors và usage của native API khác protocol cloud;
- làm kiến trúc trông Ollama-first thay vì protocol-first.

Kết luận: `NOT_RECOMMENDED` làm kiến trúc chính. Chỉ cân nhắc adapter native sau này nếu OpenAI compatibility của Ollama thiếu capability cần thiết; hiện không có bằng chứng cho requirement đó.

### Option B — OpenAI-Compatible Adapter

```text
UpgradeLens
    ↓
OpenAiCompatibleProvider
    ├── Ollama
    ├── vLLM
    ├── LM Studio
    ├── LiteLLM Proxy
    ├── OpenRouter
    └── OpenAI API
```

Ưu điểm:

- giữ AI core và `AiRuntime` độc lập vendor;
- một mapper request/response mở khóa cả local và cloud;
- không cần SDK dependency vì Node đã có `fetch`;
- đúng với prompt shape hiện tại: `prompt.system` và `prompt.user` map thẳng thành messages;
- Ollama và vLLM đều có official Chat Completions compatibility và native JSON Schema.

Giới hạn thực tế:

- endpoint/model capability vẫn cần khai báo nhỏ cho structured output;
- error envelopes không hoàn toàn đồng nhất;
- OpenRouter có routing-specific option như `require_parameters` nếu muốn guarantee provider hỗ trợ schema;
- exact UpgradeLens draft-2020-12 schema cần conformance smoke test trên từng inference engine.

Kết luận: `RECOMMENDED`.

### Option C — LiteLLM làm gateway chuẩn

```text
UpgradeLens → OpenAiCompatibleProvider → LiteLLM Proxy → providers
```

Ưu điểm:

- chuẩn hóa nhiều provider, model alias, keys, errors và usage ở một gateway;
- có routing, budget, rate limit và observability cho deployment nhiều người;
- UpgradeLens vẫn chỉ biết OpenAI-compatible protocol.

Nhược điểm:

- thêm Python/Docker service, proxy config, lifecycle và một failure boundary;
- local contributor chỉ cần Ollama sẽ phải vận hành thừa một gateway;
- structured-output support vẫn không thể vượt capability của upstream model/provider;
- logging/observability của gateway có thể lưu prompt/evidence nếu operator bật callback.

Kết luận: LiteLLM nên là **optional gateway**, không phải dependency hoặc default requirement. UpgradeLens phải gọi trực tiếp Ollama/vLLM/LM Studio được bằng cùng adapter.

## 6. Recommended Architecture

### 6.1 Minimal component shape

```text
analyzeDependencyAiContext
        ↓ internal request
createProviderAiRuntime
        ↓ prompt + schema
OpenAiCompatibleProvider
        ↓ HTTP Chat Completions
configured endpoint/model
```

`AiRuntime` không đổi. Chỉ thêm một provider implementation có trách nhiệm:

- map prompt object sang `messages`;
- map schema sang `response_format` theo declared capability;
- luôn gửi `stream: false`;
- thêm model và optional Authorization;
- bounded fetch + timeout;
- map Chat Completions response và usage sang internal result;
- map transport/HTTP/provider errors sang taxonomy nhỏ;
- không validate business candidate hoặc evidence—đó vẫn là trách nhiệm AI core/trust layer.

### 6.2 Endpoint profile: cần object nhỏ, không cần registry

Chỉ `baseUrl/apiKey/model` là chưa đủ vì:

- code hiện có dùng full endpoint URL, và vendor/gateway có prefix khác nhau (`/v1` so với `/api/v1`);
- auth có thể none hoặc Bearer;
- structured output là capability theo endpoint/model;
- một số runtime trả usage thiếu field.

Tuy nhiên không cần named profiles như `ollama`, `vllm`, `openrouter`. Cấu hình construction-time nhỏ sau là đủ:

```js
{
  endpoint: "http://localhost:11434/v1/chat/completions",
  model: "qwen3:latest",
  authorization: null,
  capabilities: {
    structuredOutput: "jsonSchema",
    usage: true,
    streaming: false
  }
}
```

`endpoint` nên tiếp tục là full URL trong lần đầu để giữ backward compatibility và tránh logic join URL. `authorization` nên được adapter xây từ API key trong API programmatic tương lai; env raw Authorization có thể được giữ làm legacy compatibility. `usage` có thể chỉ điều khiển expectation/telemetry, không làm request fail nếu metadata vắng mặt.

Không cần model listing trong runtime path. `/v1/models` hữu ích cho diagnostics/smoke setup nhưng auto-select model sẽ làm behavior khó dự đoán; user phải chọn model rõ ràng.

### 6.3 Không negotiation qua probe trong request đầu tiên

Capability object nhỏ giải quyết vấn đề thật: cùng wire protocol nhưng structured-output support khác theo model. Nó không nên phát triển thành framework generic.

Không nên tự probe endpoint hoặc retry lần lượt ba modes trong mỗi analysis vì:

- tốn model calls/cost;
- một `400` có thể do schema invalid, model missing hoặc prompt too large, không chỉ do capability;
- fallback âm thầm làm benchmark giữa endpoints không còn tương đương.

Capability nên đến từ explicit config/default của validation profile. LR-01 có thể chỉ hỗ trợ `jsonSchema` để mở khóa Ollama; `jsonMode` và `promptOnly` được thêm/validate có chủ đích sau.

## 7. Structured Output Strategy

### 7.1 Strategy

```text
Native JSON Schema
        ↓ only when declared unsupported
JSON mode
        ↓ only when declared unsupported
Prompt-constrained JSON
        ↓
local Ajv schema validation
        ↓
existing trust validation
```

| Mode | External request | Guarantee trước local validation | Recommendation |
| --- | --- | --- | --- |
| `jsonSchema` | `response_format: { type: "json_schema", json_schema: { name, strict, schema } }` | Engine cố ràng buộc schema; exact subset tùy runtime/model | Default cho Ollama smoke, vLLM, supported LM Studio/OpenRouter/OpenAI models |
| `jsonMode` | `response_format: { type: "json_object" }` | JSON hợp lệ, không guarantee candidate schema | Fallback explicit khi endpoint/model không hỗ trợ JSON Schema |
| `promptOnly` | Không gửi `response_format`; prompt hiện đã chứa schema và “Return only JSON” | Không có transport-level guarantee | Last-resort compatibility; không nên là silent default |

OpenAI docs phân biệt rõ JSON Schema bảo đảm schema adherence còn JSON mode chỉ bảo đảm valid JSON. Ollama docs khuyên vừa truyền schema vừa ghi schema trong prompt; UpgradeLens đã làm phần prompt. vLLM và LM Studio đều document `response_format.type = json_schema`. OpenRouter chỉ guarantee trên model/provider có capability tương ứng.

### 7.2 Tool/function calling không phải lựa chọn chính

Tool calling có thể ép arguments theo schema nhưng không phù hợp use case này:

- UpgradeLens không cần model chọn hay gọi tool;
- response mapping phức tạp hơn (`tool_calls[].function.arguments`);
- capability/model template khác nhau nhiều hơn structured response;
- có thể sinh zero/multiple tool calls và finish reason khác.

Chỉ xem xét tool calling nếu một runtime quan trọng không có JSON Schema/JSON mode nhưng có function calling đáng tin cậy. Không có bằng chứng hiện tại cần lựa chọn này.

### 7.3 Local validation luôn bắt buộc

Mọi mode, kể cả `strict: true`, vẫn phải:

1. kiểm tra Chat Completions envelope;
2. parse `message.content` thành JSON;
3. validate exact internal `AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA` bằng Ajv;
4. chạy existing trust validation.

Lý do:

- runtime có thể hỗ trợ subset khác nhau của JSON Schema;
- model có thể refuse hoặc dừng vì length;
- gateway có thể route sang provider không giữ đủ constraint;
- schema validation không kiểm chứng evidence entailment/trust.

### 7.4 Fail-fast và fallback behavior

- `jsonSchema` được khai báo nhưng endpoint trả recognized unsupported-parameter/capability error: phát `RUNTIME_UNSUPPORTED_STRUCTURED_OUTPUT`; không publish claims.
- Không biến mọi `400` thành fallback.
- Nếu operator đã cấu hình `jsonMode` hoặc `promptOnly`, adapter gửi đúng một request theo mode đó và local validation quyết định pass/fail.
- Không tự retry bằng mode yếu hơn trong cùng analysis run.
- Truncated/refusal/tool-only/empty content là `RUNTIME_INVALID_RESPONSE`, không phải schema fallback.

### 7.5 Exact schema conformance risk

Candidate schema hiện là draft 2020-12 và dùng các keyword như `pattern`, `uniqueItems`, `minItems`, `enum`, `additionalProperties: false`. Official runtime docs xác nhận JSON Schema nói chung nhưng không chứng minh tất cả engine chấp nhận exact schema này. LR-02 phải gửi **exact current schema** trong live smoke.

Không nên sửa internal schema để chiều theo provider. Nếu một engine chỉ hỗ trợ subset, một provider-facing schema projection tối thiểu có thể được nghiên cứu sau, trong khi exact internal schema vẫn validate cuối cùng. Projection chưa được đề xuất triển khai ở LR-01 vì smoke evidence chưa cho thấy cần thiết.

## 8. Configuration and Security

### 8.1 Configuration recommendation

Giữ bốn env hiện có cho lần đầu để tránh CLI/config migration:

```text
UPGRADELENS_AI_PROVIDER=openai-compatible
UPGRADELENS_AI_ENDPOINT=<full chat-completions URL>
UPGRADELENS_AI_MODEL=<explicit model or gateway alias>
UPGRADELENS_AI_AUTHORIZATION=<optional full Authorization value>
```

Semantics đề xuất:

- `PROVIDER` chọn adapter protocol, không chọn cloud vendor; giá trị mới duy nhất là `openai-compatible`.
- `ENDPOINT` tiếp tục là full URL.
- `MODEL` trở thành required cho adapter và thực sự được gửi trong body.
- `AUTHORIZATION` optional; không log. Giá trị phải gồm scheme trong compatibility phase.

Ví dụ không chứa secret:

**Ollama local**

```text
UPGRADELENS_AI_PROVIDER=openai-compatible
UPGRADELENS_AI_ENDPOINT=http://localhost:11434/v1/chat/completions
UPGRADELENS_AI_MODEL=qwen3:latest
# UPGRADELENS_AI_AUTHORIZATION unset
```

**vLLM**

```text
UPGRADELENS_AI_PROVIDER=openai-compatible
UPGRADELENS_AI_ENDPOINT=http://localhost:8000/v1/chat/completions
UPGRADELENS_AI_MODEL=<served-model-name>
# UPGRADELENS_AI_AUTHORIZATION=Bearer <runtime-key>  # only if server enables auth
```

**LiteLLM Proxy**

```text
UPGRADELENS_AI_PROVIDER=openai-compatible
UPGRADELENS_AI_ENDPOINT=http://localhost:4000/chat/completions
UPGRADELENS_AI_MODEL=<gateway-model-alias>
UPGRADELENS_AI_AUTHORIZATION=Bearer <proxy-key>
```

Future config nên thêm explicit `structuredOutput` mode trong programmatic config hoặc `.upgradelens/config.json`, không nhất thiết thêm env ở LR-01. Nếu sau này có config file, precedence hợp lý là:

```text
injected AiRuntime / explicit API options
        ↓
environment variables
        ↓
.upgradelens/config.json non-secret fields
        ↓
defaults
```

Config file chỉ nên chứa endpoint, provider, model và capability. API key/Authorization không được lưu raw trong repository config; secret chỉ đến từ env hoặc external secret injection. Task này không triển khai config file.

Về lâu dài, `UPGRADELENS_AI_API_KEY` an toàn về UX hơn raw `AUTHORIZATION` vì adapter tự thêm `Bearer` và dễ redact. Nếu bổ sung, `AUTHORIZATION` legacy nên thắng `API_KEY` khi cả hai được set hoặc tốt hơn là fail configuration do ambiguity; không cần quyết định/migrate trong LR-01.

### 8.2 Security review

| Risk | Hiện tại | Guardrail tối thiểu đề xuất |
| --- | --- | --- |
| API key bị log | Provider không chủ động log headers; CLI chỉ log error message. Upstream gateway có thể log. | Không đưa headers/config vào error, telemetry hoặc snapshot; redact `authorization`, `api-key`, query credentials. |
| Authorization trong error | Current non-2xx error không chứa headers/body nên không leak; transport error từ fetch đi qua có thể khác nhau. | Tạo package-local sanitized errors; không append request options/raw provider body. |
| Secret trong endpoint URL | Current code chấp nhận userinfo/query và có thể để URL xuất hiện ở external logs. | Reject URL có username/password; khuyến cáo không dùng key trong query; sanitize query khi hiển thị. |
| Prompt/evidence logging | UpgradeLens runtime hiện không log prompt; remote endpoint vẫn nhận toàn bộ evidence. LiteLLM/LM Studio diagnostics có thể log input/output khi bật. | Chỉ log run/context IDs, sizes, provider label/model, latency và category; full prompt/body phải opt-in, redacted và không vào portable artifact. |
| Local HTTP | Hợp lý với loopback Ollama/vLLM/LM Studio. | Cho phép plain HTTP chỉ với loopback (`localhost`, `127.0.0.0/8`, `[::1]`) mặc định. |
| Remote HTTP | Prompt/evidence và key có thể bị nghe lén. | Require HTTPS cho non-loopback; explicit insecure override chỉ nếu có use case self-hosted private network sau này. |
| Response size | Current `response.text()` unbounded. | Giới hạn nhỏ, ví dụ 1 MiB cho non-streaming candidate/error body; cancel body khi vượt giới hạn. |
| Timeout | Không có. | Một AbortController deadline, mặc định khoảng 60–120 giây cho local LLM và configurable bounded maximum; taxonomy riêng cho timeout. |
| Redirect | Fetch mặc định follow; có thể chuyển prompt/header sang destination ngoài ý muốn tùy fetch policy. | `redirect: "error"`; user cấu hình endpoint cuối cùng rõ ràng. |
| SSRF | Endpoint do user cấu hình có thể POST evidence tới internal service/metadata host. Đây là local CLI explicit configuration nên risk thấp hơn server multi-tenant nhưng vẫn tồn tại. | Chỉ `http:`/`https:`; reject URL credentials; remote HTTPS; document trusted-user config. Nếu sau này endpoint đến từ untrusted repo config, block link-local/metadata/private targets hoặc require confirmation. |
| Prompt injection | Evidence là untrusted input, nhưng đây không phải adapter concern. | Không cho evidence điều khiển endpoint/headers; giữ prompt guardrails, schema validation và trust validation; thêm adversarial eval riêng. |

Error body chỉ nên đọc trong cùng response byte limit. Human-readable CLI có thể dùng sanitized `error.message`, nhưng không nên in raw provider metadata/body vì nó có thể echo prompt hoặc secret.

### 8.3 Retry policy

LR-01 không cần retry để mở khóa model thật. Nếu thêm sau:

- tối đa một bounded retry;
- chỉ transport reset/unreachable có dấu hiệu transient, `429`, hoặc `503` và chỉ khi deadline còn đủ;
- tôn trọng bounded `Retry-After`;
- không retry auth, model-not-found, invalid request/schema, response parse/schema/trust failures;
- local long-running timeout không tự retry mặc định vì có thể nhân đôi inference load.

OpenRouter chính thức document `Retry-After` cho `429/503`; logic này có thể áp dụng protocol-level mà không tạo OpenRouter branch.

## 9. Error Taxonomy

Đề xuất một package-local `AiRuntimeError` với stable `code`, sanitized message, optional HTTP status và `retryable`. Không đưa raw body/header/prompt vào error.

| Code | Khi nào | Retryable | Configuration/fatal | CLI message gợi ý |
| --- | --- | --- | --- | --- |
| `RUNTIME_NOT_CONFIGURED` | Thiếu endpoint, model hoặc adapter selection | Không | Fatal config | “AI runtime is not configured; set provider, endpoint and model.” |
| `RUNTIME_UNREACHABLE` | DNS/refused/reset/transport không tới endpoint | Có thể, tối đa một lần | Không nhất thiết | “Cannot reach the configured AI endpoint.” |
| `RUNTIME_TIMEOUT` | Abort deadline khi connect/read/inference | Thường không cho local; optional một retry policy | Không | “AI request timed out after <bounded duration>.” |
| `RUNTIME_AUTH_FAILED` | HTTP 401/403 với auth semantics | Không | Fatal config/permission | “AI endpoint rejected authentication or authorization.” |
| `RUNTIME_RATE_LIMITED` | HTTP 429 hoặc stable provider type | Có, một lần theo bounded Retry-After | Không | “AI endpoint rate limited the request.” |
| `RUNTIME_MODEL_NOT_FOUND` | HTTP 404/stable error cho configured model | Không | Fatal config | “Configured AI model is unavailable at this endpoint.” |
| `RUNTIME_UNSUPPORTED_STRUCTURED_OUTPUT` | Endpoint/model từ chối requested `response_format` | Không; user chọn weaker mode rõ ràng | Fatal capability config | “Model/endpoint does not support configured structured-output mode.” |
| `RUNTIME_INVALID_RESPONSE` | Non-JSON envelope, missing choice/content, refusal/tool-only unexpected, oversized/truncated response | Không | Runtime/model contract failure | “AI endpoint returned an invalid Chat Completions response.” |
| `RUNTIME_PROVIDER_ERROR` | Các 4xx/5xx/upstream error còn lại | Chỉ 502/503 có thể retry một lần | Tùy status | “AI endpoint returned provider error <status/category>.” |

`OUTPUT_JSON_INVALID` và `OUTPUT_SCHEMA_INVALID` nên vẫn là analysis/output validation errors sau khi adapter đã trả một valid Chat Completions envelope. Chúng không nên đại diện transport/provider errors nữa.

Mapping ưu tiên:

1. local configuration validation;
2. timeout/transport;
3. HTTP status (`401/403`, `404`, `429`, `5xx`);
4. bounded stable provider code/type khi có;
5. response envelope/content;
6. candidate JSON/schema trong AI core.

Không cần retry engine, nested causes portable hay provider-specific subclasses.

## 10. Recommended First Runtime

Chọn **Ollama local qua `/v1/chat/completions`**.

Lý do theo tiêu chí:

1. Ollama core là open source MIT và self-hosted.
2. Máy test đã cài Ollama và có `qwen3:latest`, `llama3:latest`.
3. Không cần account, network inference hay API key.
4. Cùng request/response mapper sau đó dùng được cho vLLM, LM Studio, LiteLLM, OpenRouter và OpenAI.
5. Official docs xác nhận JSON mode, `response_format`, streaming và OpenAI-compatible Chat Completions; native structured-output docs xác nhận JSON Schema.
6. Apple Silicon dùng local Metal path; 16 GB phù hợp smoke với model/quantization vừa bộ nhớ, dù throughput và quality không được đảm bảo.

Không chọn vLLM đầu tiên vì setup server/hardware phức tạp hơn laptop contributor. Không chọn LiteLLM vì nó thêm gateway mà không cần cho một local Ollama endpoint. Không chọn LM Studio vì app không phải OSS và Ollama đã cài. Không chọn OpenRouter/OpenAI vì cần cloud account/key, gửi evidence ra ngoài và có thể phát sinh chi phí.

### Technical smoke vs quality benchmark

**Smoke validation kỹ thuật** chỉ pass khi:

- adapter kết nối Ollama;
- exact model được chọn;
- exact candidate schema được gửi;
- response envelope/usage được map;
- candidate parse + Ajv pass;
- trust validation chạy và artifact schema hợp lệ;
- invalid model/schema/auth-like/error cases được phân loại đúng;
- không leak prompt/secret trong logs/errors.

**Quality benchmark** là task khác: chạy golden dataset đủ lớn, so risk/evidence/human-review quality, latency và stability giữa model/prompt. Việc một call `qwen3:latest` hoặc `llama3:latest` pass schema không chứng minh model đủ tốt cho production. Model tag `latest` cũng không ổn định cho benchmark reproducibility; quality run nên pin model digest/version nếu Ollama cho phép.

## 11. Minimal Implementation Plan

Tối đa ba task, theo thứ tự mở khóa nhỏ nhất.

### LR-01 — OpenAI-Compatible Chat Completions Provider

**Mục tiêu:** thêm một provider dùng `fetch` để map contract hiện tại sang non-streaming OpenAI-compatible Chat Completions với native JSON Schema.

**Phạm vi:** request/response/usage mapping, required endpoint+model, optional Authorization, timeout, response size, sanitized error taxonomy; wire vào `provider=openai-compatible` nhưng giữ generic HTTP provider nếu backward compatibility cần.

**Files/module có thể đổi:** `src/ai-runtime.js` hoặc module provider nhỏ mới; `src/cli.js`; exports; runtime/CLI unit tests; runtime configuration docs. Không sửa prompt, candidate schema hoặc trust layer.

**Test strategy:** fake fetch cho exact headers/body; no-auth/Bearer; choices/content/model/usage mapping; 401/404/429/5xx; transport; timeout; oversized/non-JSON/missing-content; assert error không chứa auth/prompt; no live network in default tests.

**Acceptance criteria:** exact current `AiRuntime` request đi qua adapter; `model/messages/response_format/stream:false` đúng; internal usage normalized; stable errors; existing fake/generic tests pass; không thêm SDK/dependency.

**Out of scope:** live model, streaming, Responses API, auto model listing/selection, retry engine, JSON-mode fallback, config file.

### LR-02 — Ollama Local Smoke Validation

**Mục tiêu:** chứng minh LR-01 hoạt động trên máy contributor với real Ollama và exact UpgradeLens candidate schema.

**Phạm vi:** manual/opt-in smoke command hoặc test, `qwen3:latest` trước và `llama3:latest` làm secondary nếu cần; capture sanitized evidence về envelope/schema/trust/latency/usage.

**Files/module có thể đổi:** live-validation docs; optional opt-in smoke fixture/script theo convention repository; không đổi production behavior trừ bug nhỏ phát hiện từ conformance test và được review riêng.

**Test strategy:** không chạy trong default CI; local endpoint only; một bounded request per selected case; test model-not-found và unsupported-schema bằng controlled input nếu không gọi thêm model.

**Acceptance criteria:** một real-evidence dependency tạo candidate schema-valid và trust-validated artifact, hoặc failure được phân loại đúng; exact schema compatibility được ghi nhận; không claim quality production.

**Out of scope:** quality score, model recommendation production, cloud, paid calls, performance tuning.

### LR-03 — Gateway/Cloud Compatibility Validation

**Mục tiêu:** kiểm chứng cùng adapter trên ít nhất vLLM hoặc LiteLLM Proxy, rồi một optional cloud endpoint (OpenRouter hoặc OpenAI) do maintainer cung cấp ngoài repository.

**Phạm vi:** conformance matrix tests cho endpoint/model capability; quyết định có cần explicit `jsonMode/promptOnly` config và OpenRouter `require_parameters` extension hay không.

**Files/module có thể đổi:** provider conformance tests, config docs, optional capability field; không thêm gateway dependency vào UpgradeLens.

**Test strategy:** recorded/fake contract tests mặc định; opt-in live validation với secret qua env; assert no secret in artifacts/logs; compare usage/error mapping.

**Acceptance criteria:** ít nhất một OSS server ngoài Ollama dùng cùng adapter; một gateway/cloud path được document hoặc deferred với evidence; mọi fallback explicit và local validation vẫn bắt buộc.

**Out of scope:** provider registry, dynamic plugins, mandatory LiteLLM, multi-provider routing, streaming, secret manager.

## 12. Acceptance Criteria for Live Smoke Validation

LR-02 chỉ được coi là pass khi tất cả điều kiện sau có evidence:

- [ ] Ollama đang chạy trên loopback; endpoint là `/v1/chat/completions` và không dùng cloud Ollama.
- [ ] Model được chọn rõ ràng từ model đã cài; model ID thực sự xuất hiện trong request.
- [ ] Không set hoặc ghi API key thật; Authorization absent cho local Ollama.
- [ ] Request có đúng hai messages từ `prompt.system`/`prompt.user`, `stream: false`, và native `response_format.json_schema` chứa exact current candidate schema.
- [ ] Request có bounded timeout; response/error body có byte limit; redirect không được follow.
- [ ] Response là Chat Completions envelope hợp lệ với đúng một usable assistant content; model/usage được map nếu có.
- [ ] Assistant content parse thành JSON và pass exact Ajv candidate schema.
- [ ] Existing trust validation chạy; invented/invalid evidence refs không xuất hiện trong final claims.
- [ ] Version Analysis artifact pass schema/invariants và không chứa execution secrets/full prompt.
- [ ] Model-not-found hoặc một controlled runtime failure tạo đúng stable category và human-readable CLI message, không bị gọi là `OUTPUT_SCHEMA_INVALID`.
- [ ] Error/log output không chứa Authorization, full prompt/evidence hoặc raw provider response.
- [ ] Smoke result ghi model tag/version, Ollama version, latency, usage availability và exact schema result.
- [ ] Tài liệu ghi rõ đây là transport/schema smoke, không phải quality benchmark.
- [ ] Không có live test trong default CI và không có paid model call.

## 13. Risks and Open Questions

1. **Exact JSON Schema subset:** Ollama, vLLM, LM Studio và cloud providers có chấp nhận `pattern`, `uniqueItems`, `$schema` và toàn bộ draft-2020-12 candidate schema không? Official docs chưa đủ để kết luận; LR-02 phải trả lời bằng exact-schema smoke.
2. **Reasoning model content:** một số local reasoning models có thể đặt reasoning ở field riêng hoặc trộn marker vào content. Adapter đầu tiên chỉ nhận `message.content` là JSON; có cần disable thinking bằng runtime-specific field sẽ chỉ được quyết định sau smoke. Không thêm vendor field trước khi có evidence.
3. **Ollama `latest` reproducibility:** local tag có thể đổi. Smoke dùng được, benchmark nên pin digest/version.
4. **Capability source:** LR-01 nên hard-code `jsonSchema` cho adapter path hay expose construction-time field ngay? Khuyến nghị expose field programmatic nhỏ nhưng CLI lần đầu có thể default `jsonSchema`; không cần env mới trước LR-03.
5. **Schema refusal/truncation:** cần quyết định accepted `finish_reason`; tối thiểu chỉ `stop` với non-empty content. `length`, refusal hoặc tool-only nên invalid response.
6. **Error detail portability:** HTTP status mapping ổn định hơn provider `error.code`. Chỉ dựa vào known code để tinh chỉnh, luôn có fallback `RUNTIME_PROVIDER_ERROR`.
7. **Timeout default:** local 7B/8B trên 16 GB có thể cold-start lâu hơn cloud. Cần đo smoke để chọn default giữa 60–120 giây và bounded maximum hợp lý; không để unbounded.
8. **Remote privacy:** evidence có thể là public registry facts hiện tại nhưng kiến trúc tương lai có thể chứa dữ liệu repository nhạy cảm. Cloud endpoint phải là explicit user choice và docs phải nói rõ dữ liệu rời máy.
9. **Config file trust:** `.upgradelens/config.json` trong repo có thể biến endpoint thành untrusted input/SSRF. Nếu triển khai sau, không tự động gửi prompt tới repo-provided remote endpoint mà không có trust/confirmation policy.
10. **Usage optionality:** một endpoint có thể thiếu hoặc ước lượng usage khác nhau. Thiếu usage không nên làm analysis fail; benchmark phải biểu diễn `null`, không fabricates zero.
11. **LiteLLM/OpenRouter routing:** capability theo downstream model/provider. Nếu cần guarantee, có thể thêm explicit extra request fields sau conformance evidence; không tạo vendor profile ngay.
12. **LM Studio role:** protocol phù hợp và UX tốt, nhưng app proprietary nên không thể là OSS-first default. Nó vẫn là endpoint optional hợp lệ.
13. **Semantic grounding:** JSON Schema và trust ref allowlist không chứng minh claim được evidence entail. Đây là quality/trust backlog, không phải lý do mở rộng adapter.

Quyết định cuối cùng của LR-00: triển khai một Chat Completions provider nhỏ, protocol-first; smoke đầu tiên với Ollama local; giữ LiteLLM optional; luôn validate exact internal schema và trust layer; không thêm SDK, plugin framework, Responses API hoặc streaming ở vòng đầu.
