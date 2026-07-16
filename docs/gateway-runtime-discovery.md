# LR-00A — 9Router & OpenRouter Analysis Suitability Discovery

Ngày đánh giá: 2026-07-15
Phạm vi: discovery kiến trúc và policy. Tài liệu này không cài gateway, không gọi model, không tạo tài khoản/API key, không sửa runtime, prompt, schema, trust layer, benchmark hay production code.

## 1. Executive Summary

UpgradeLens nên giữ kiến trúc protocol-first đã chốt ở LR-00:

```text
AiRuntime
    ↓
OpenAI-Compatible Provider
    ↓
Optional Gateway
    ├── 9Router
    └── OpenRouter
```

Một OpenAI-compatible Chat Completions provider là đủ cho transport của cả 9Router và OpenRouter. Không có bằng chứng cần hai adapter vendor-specific. Khác biệt gateway chỉ nên nằm trong cấu hình endpoint, optional request headers/body extras được allowlist, routing policy và mapping execution metadata.

Quyết định vai trò:

| Runtime | Vai trò khuyến nghị | Quyết định |
| --- | --- | --- |
| Direct Ollama | Local technical smoke và baseline local có kiểm soát | Khuyến nghị đầu tiên theo LR-00; chất lượng model vẫn phải benchmark |
| 9Router | OSS multi-provider development và contributor smoke tùy chọn | Khuyến nghị có điều kiện; không làm dependency/default bắt buộc |
| OpenRouter | Cloud model comparison và benchmark production-like | Gateway cloud chính có điều kiện; phải dùng locked route |
| Direct provider | Production deployment đã chọn và validation rõ | Hợp lệ khi operator chấp nhận provider, privacy và model cụ thể |

9Router chạy local, MIT, self-hostable, có `/v1/*` OpenAI-compatible, translation, provider/model aliases, combos, account fallback, quota/usage tracking và local persistence. Tuy nhiên, combo/fusion/round-robin, account rotation, capability reordering và các token-saver có thể đổi model hoặc sửa prompt/context. Source còn cho thấy `response_format.json_schema` khi dịch OpenAI sang Claude được chuyển thành chỉ dẫn trong system prompt, không phải native schema constraint. Vì vậy 9Router chỉ đủ reproducible khi dùng profile bị khóa: provider-prefixed exact model, không combo/fusion/round-robin, một account đang enable, mọi transform tắt, gateway version cố định và execution detail được thu thập.

OpenRouter có contract phù hợp benchmark hơn: model slug, `provider.only`, `allow_fallbacks: false`, `require_parameters: true`, `response_format.json_schema`, Models API `supported_parameters`, usage/cost và opt-in `openrouter_metadata` chứa actual provider/model/attempts/pipeline. `openrouter/auto`, `openrouter/free`, model fallbacks và provider fallback mặc định không phù hợp Version Analysis benchmark vì làm route thay đổi. OpenRouter vẫn là cloud processor: evidence rời máy và đi qua OpenRouter cùng upstream provider; ZDR/data policy phải được chọn rõ.

Không gateway nào được phép làm authority cho deterministic facts. `currentVersion`, `targetVersion`, dependency identity và evidence allowlist vẫn do local pipeline quyết định. Mọi model output phải qua Ajv và trust validation. MVP-04/MVP-05 chỉ được consume trusted result có route identity đã biết và đã vượt quality gate trong tài liệu này.

## 2. Why Gateway Choice Affects Version Upgrade Analysis

### 2.1 Contract hiện có

| Contract | Ranh giới liên quan gateway |
| --- | --- |
| `AiRuntime` | Nhận `runId`, `contextId`, `promptVersion`, deterministic `context`, `outputSchema`; trả `output`, `provider`, `model`, `latencyMs`, optional `usage` |
| OpenAI-compatible architecture | Adapter map prompt/schema sang `model`, `messages`, `response_format`; gateway chỉ là endpoint tùy chọn sau adapter |
| Candidate schema | JSON Schema draft 2020-12, `additionalProperties: false`; chỉ cho summary, risk và findings có evidence refs |
| Trust validation | Local allowlist evidence refs, loại invented URL/claim không có evidence, downgrade risk, tạo human-review policy |
| Evaluation Runner | Dùng cùng `analyzeDependencyAiContext`, schema và trust path với Golden Dataset |
| Metrics & Scorecard | Đo risk, human review, evidence, unsupported claims, validation và deterministic quality |
| Benchmark Runner | Wrap runtime để thu latency, token usage, estimated cost; hiện chưa thu route/fallback identity |
| Version Analysis Manifest | Portable trusted result; cố ý không chứa provider, model, latency, usage hay secret |

Gateway thuộc runtime boundary. Gateway không được:

- quyết định hoặc sửa `currentVersion`, `targetVersion`, dependency identity hay evidence selection;
- bypass Ajv, evidence allowlist, invented-URL rejection, risk downgrade hoặc human-review policy;
- biến model-generated facts thành deterministic facts;
- cho MVP-04/MVP-05 consume raw candidate trước trust validation.

### 2.2 Chuỗi rủi ro roadmap

```text
Gateway đổi model/capability mà không báo
        ↓
MVP-03 phân loại risk hoặc evidence sai
        ↓
MVP-04 tìm sai vùng source code bị ảnh hưởng
        ↓
MVP-05 tạo migration plan sai hoặc thiếu
```

Structured JSON chỉ bảo vệ shape, không bảo vệ semantic quality. Hai model cùng trả schema-valid JSON vẫn có thể khác risk classification, cách tổng hợp release notes, multilingual comprehension và mức độ tuân thủ evidence. Provider khác nhau cho cùng model slug cũng có thể khác quantization, serving config, latency, parameter support hoặc safety behavior. Vì vậy availability fallback không trung tính với analysis quality.

### 2.3 Analysis-quality requirements

Một runtime tuple chỉ được hiểu là:

```text
(gateway, gatewayVersion, requestedModel, actualModel,
 requestedProvider, actualProvider, structuredOutputMode, routingPolicy)
```

Tuple phải chứng minh:

- instruction following và JSON Schema adherence;
- evidence-grounded synthesis và version/release reasoning;
- context window đủ cho context đã bounded;
- multilingual evidence nếu Golden Dataset có case tương ứng;
- exact requested route và actual route quan sát được;
- timeout, usage, latency, error taxonomy và fallback visibility;
- không silent downgrade từ JSON Schema sang JSON mode/prompt-only;
- không có request/response transform ngoài profile đã benchmark.

Pin route không tạo bitwise determinism. Model serving vẫn có thể nondeterministic hoặc được upstream cập nhật; evaluation phải dùng repeated runs và lưu identity/version metadata thay vì hứa tái tạo byte-for-byte.

## 3. 9Router Findings

### 3.1 Architecture và OSS suitability

9Router là local Next.js gateway/dashboard. Kiến trúc chính thức mô tả `/v1/*`, translation, model-combo fallback, account fallback, OAuth/API-key connections, usage/cost tracking, request logging và optional cloud sync. State gồm providers, credentials, aliases, combos, settings và pricing được persist local; usage/request details cũng được persist. [Architecture](https://github.com/decolua/9router/blob/master/docs/ARCHITECTURE.md)

Repository dùng MIT License, hỗ trợ chạy từ source/Docker và package global. Đây là bằng chứng đủ để xem 9Router là một OSS/self-hosted gateway phù hợp cho contributor tự nguyện cài, nhưng không phải lý do để thêm nó vào dependency tree của UpgradeLens. [License](https://github.com/decolua/9router/blob/master/LICENSE) · [README](https://github.com/decolua/9router/blob/master/README.md)

Dependency/operational footprint lớn hơn direct Ollama endpoint: Next.js dashboard, local database, provider registry, OAuth/token refresh, translators, executors, logging và optional sync/tunnel. Contributor còn phụ thuộc vào upstream provider, API key, OAuth/subscription hoặc local endpoint mà họ chọn. “Gateway local” không đồng nghĩa “inference offline”.

### 3.2 Request, model và account routing

Model string `provider-or-alias/model` được parse thành provider + model. Model string không có `/` có thể resolve qua alias; nếu không resolve được, 9Router infer provider theo model prefix và cuối cùng mặc định OpenAI. Vì vậy UpgradeLens không được dùng bare alias trong evaluation; phải dùng provider-prefixed model. [Model resolution source](https://github.com/decolua/9router/blob/master/open-sse/services/model.js)

Combos là virtual model names. Source và docs cho thấy ba dạng behavior liên quan:

- fallback: thử model theo thứ tự đến khi thành công;
- round-robin/sticky: đổi model đầu tiên theo state trong memory;
- fusion: fan-out sang nhiều model rồi dùng judge model tổng hợp.

Combo còn có capability-based auto-switch để reorder model. Capability detector hiện tập trung vào input modalities và không dùng `response_format`/JSON Schema làm hard capability. Do đó một fallback model có thể không tương đương structured-output quality với model đầu. [Combos documentation](https://github.com/decolua/9router/blob/master/gitbook/content/en/features/combos.md) · [Combo source](https://github.com/decolua/9router/blob/master/open-sse/services/combo.js)

Kết luận control:

- **Pin model/provider:** `SUPPORTED` khi request dùng exact `provider/model`, không alias/combo.
- **Disable cross-model fallback:** `PARTIAL`; có thể tránh bằng cách không dùng combo/fusion/round-robin, nhưng không thấy documented per-request `allow_fallbacks=false` tương đương OpenRouter.
- **Pin account:** `UNKNOWN`; source chứng minh account fallback/model locks nhưng không có public per-request contract để chọn exact connection và tắt account failover. Controlled benchmark phải chỉ enable một connection hoặc xem account change là invalid run.
- **Exact reproduction:** `PARTIAL`; cần khóa gateway version/config/account/model/transforms và vẫn chỉ đạt bounded, không bitwise, reproducibility.

### 3.3 Structured output

9Router nhận OpenAI `response_format` và ghi nó vào request detail. Khả năng preserve phụ thuộc đường translation:

- native OpenAI-compatible passthrough có thể giữ `response_format` nếu upstream hỗ trợ;
- OpenAI → Claude translator nhận `json_schema` nhưng chuyển schema thành system-prompt instruction “respond with valid JSON”, không phải native constrained decoding;
- docs/source không chứng minh mọi Gemini/Claude/custom provider preserve toàn bộ JSON Schema semantics;
- combo capability ordering không bắt buộc structured-output support;
- local Ajv của UpgradeLens vẫn phát hiện output sai schema, nhưng chỉ sau khi đã tốn request và không ngăn semantic drift.

Vì vậy “preserve JSON Schema qua mọi upstream provider” là **không được chứng minh** và đánh giá `PARTIAL`, không phải `SUPPORTED`. [OpenAI-to-Claude translation](https://github.com/decolua/9router/blob/master/open-sse/translator/request/openai-to-claude.js) · [Chat core](https://github.com/decolua/9router/blob/master/open-sse/handlers/chatCore.js)

Evaluation/production phải fail khi upstream không hỗ trợ schema thật; không được tự động coi prompt-only JSON là capability tương đương. Mỗi 9Router provider/model path phải qua conformance fixture và live opt-in validation riêng.

### 3.4 Token optimization và analysis integrity

9Router có RTK compression, Headroom/PXPIPE transforms, Caveman/Ponytail prompt injection và modality stripping/prefetch trong chat core. RTK sửa tool-result content; Caveman/Ponytail sửa system prompt. Dù Version Analysis hiện không dùng tool calls, policy phải tắt mọi transform cho evaluation và production-like benchmark. Nếu bật transform thì đó là một runtime tuple khác, cần benchmark riêng và trace phải ghi nhận.

Không dùng fusion cho Version Analysis: fusion bỏ tools ở panel calls, thêm judge prompt, che danh tính source model và có thể degrade sang một panel answer. Đây là một analysis pipeline khác, không còn là cùng prompt/model contract.

### 3.5 Usage, latency, cost và audit

9Router lưu provider, model, connectionId, token fields, latency, request, translated provider request, provider response và response summary trong local request detail. Điều này đủ để debug local nhưng tạo hai hạn chế:

- public OpenAI response không có documented stable field chứa actual provider/connection/fallback chain;
- returned usage có normalization/estimation và source còn thêm buffer token trong một số response paths, nên không nên coi là provider-billing truth.

Dashboard cost là tracking/estimate; README nói 9Router không bill và contributor trả upstream trực tiếp. Benchmark có thể dùng client wall-clock latency và normalized token usage, nhưng cost chỉ được ghi `null` hoặc “estimated” trừ khi upstream cung cấp authoritative cost. [Usage tracking source](https://github.com/decolua/9router/blob/master/open-sse/utils/usageTracking.js) · [README billing section](https://github.com/decolua/9router/blob/master/README.md#understanding-9router-costs--billing)

### 3.6 Security và privacy

Prompt/evidence được gửi tới upstream đã chọn. Với remote upstream, data rời máy dù gateway chạy localhost. 9Router persist provider secrets/connections và request details local; optional request logs có thể lưu thêm body/response; optional cloud sync/tunnel mở thêm trust boundary. Source không cung cấp một UpgradeLens-specific evidence redaction contract.

Policy tối thiểu:

- contributor phải explicit opt-in trước khi gửi private source/evidence;
- bind localhost và bật API-key protection nếu expose ra network;
- tắt cloud sync/tunnel/request debug logs cho private analysis;
- giới hạn quyền file database/backups và không commit chúng;
- không dùng OAuth/subscription/MITM integration nếu terms hoặc organizational policy chưa cho phép;
- không log full prompt/evidence trong UpgradeLens execution trace.

### 3.7 Suitability decision

| Use case | Đánh giá | Điều kiện |
| --- | --- | --- |
| Local contributor smoke | `SUPPORTED` | Contributor opt-in; route cụ thể; không coi smoke là quality proof |
| Daily multi-provider development | `SUPPORTED` | Fallback/transforms được phép và trace route khi debug |
| Deterministic evaluation | `PARTIAL` | Exact `provider/model`, một account, no combo, all transforms off, version/config pinned |
| Quality benchmark baseline | `NOT_RECOMMENDED` mặc định | Chỉ thành candidate sau LR-03 conformance; direct route làm control tốt hơn |
| Production-like analysis | `PARTIAL` | Allowlisted tuple đã vượt quality gate, privacy accepted, actual route recoverable |
| Multi-provider fallback | `SUPPORTED` cho availability | Không được dùng làm quality-equivalent fallback nếu từng tuple chưa validation |

Quyết định: 9Router nên là **OSS gateway khuyến nghị tùy chọn cho contributor và daily development**, không phải default runtime/dependency và không phải canonical benchmark route.

## 4. OpenRouter Findings

### 4.1 API, models và default routing

OpenRouter cung cấp hosted OpenAI-compatible `/api/v1/chat/completions` và Models API. Model được chọn bằng slug; Models API trả `supported_parameters`, context, pricing và provider information. Mặc định OpenRouter load-balances/fallback giữa provider endpoints để tăng uptime. [API overview](https://openrouter.ai/docs/api/reference/overview) · [Models](https://openrouter.ai/docs/guides/overview/models) · [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)

Default routing phù hợp availability nhưng không đủ benchmark reproducibility. Locked route cho UpgradeLens phải gửi:

```json
{
  "model": "<exact-model-slug>",
  "provider": {
    "only": ["<provider-slug>"],
    "allow_fallbacks": false,
    "require_parameters": true,
    "zdr": true
  },
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "upgrade_lens_version_analysis",
      "strict": true,
      "schema": {}
    }
  }
}
```

`zdr: true` là privacy policy đề xuất, không phải capability requirement và có thể làm route không còn provider phù hợp. Nếu không có route thỏa model + provider + schema + privacy, evaluation phải fail fast.

### 4.2 Structured output và fail-fast behavior

OpenRouter document `response_format.type=json_schema` cho compatible models. Models API dùng `supported_parameters` với `structured_outputs`/`response_format`; `require_parameters: true` giới hạn route vào provider hỗ trợ toàn bộ parameters trong request. [Structured Outputs](https://openrouter.ai/docs/guides/features/structured-outputs) · [Model API](https://openrouter.ai/docs/api/api-reference/models/get-model)

Đây là capability tốt hơn 9Router cho benchmark, nhưng vẫn cần local Ajv/trust validation. “Supported” không chứng minh semantic grounding và provider implementation có thể lỗi. Policy không bật response-healing hoặc context-compression plugin trong baseline vì chúng materially alter response/request; nếu dùng, router metadata phải ghi pipeline stage và tuple phải benchmark riêng.

OpenRouter có thể fail fast thay vì route yếu hơn bằng tổ hợp:

- exact model slug, không dùng alias `latest`;
- `provider.only` đúng một provider;
- `allow_fallbacks: false`;
- `require_parameters: true`;
- không gửi `models`/`fallbacks`;
- reject response nếu actual identity hoặc routing metadata khác policy.

### 4.3 Reproducibility và actual identity

OpenRouter response trả actual model; generation stats trả model, `provider_name`, latency, native token counts và total cost. Tốt hơn nữa, request header `X-OpenRouter-Metadata: enabled` thêm `openrouter_metadata` vào response với requested route, strategy, selected endpoint, attempt number, attempts và pipeline transforms. [Router Metadata](https://openrouter.ai/docs/guides/features/router-metadata) · [Generation stats](https://openrouter.ai/docs/api/api-reference/generations/get-generation)

Locked route vì vậy audit được tốt, nhưng không bitwise reproducible: upstream model/provider có thể cập nhật serving stack và exact weights/revision không phải lúc nào cũng nằm trong slug. Benchmark phải lưu timestamp, model slug, provider slug, generation ID, route metadata và lặp lại samples.

### 4.4 Auto/free/fallback routes

Không dùng các route sau làm Version Analysis quality benchmark hoặc input production mặc định:

- `openrouter/auto`: router chọn model;
- `openrouter/free`: chọn ngẫu nhiên trong tập free models sau capability filtering;
- `models` hoặc `fallbacks`: có thể đổi model khi rate limit, downtime, moderation hoặc context error;
- provider fallback mặc định: có thể đổi serving provider cho cùng model.

OpenRouter docs xác nhận response `model` là model cuối cùng dùng và model fallback có thể kích hoạt bởi nhiều loại lỗi. Free router tự mô tả là random selection. Hai cơ chế hữu ích cho smoke/availability, nhưng `NOT_RECOMMENDED` cho quality comparison và roadmap input. [Model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks) · [Free router](https://openrouter.ai/openrouter/free/api)

### 4.5 Usage, latency, cost và errors

Non-streaming completion có `usage`; generation stats có native token counts, latency và `total_cost`. Không cần suy đoán bảng giá hiện tại. Cost benchmark lấy authoritative per-generation field khi có, nếu không để `null`; không tự tính từ marketing price.

OpenRouter document error types/status, `Retry-After`, pre-stream retry/fallback và giới hạn không thể fail over sau khi stream đã phát token. UpgradeLens baseline vẫn là non-streaming; client deadline và bounded retry mới là authority. [Errors and debugging](https://openrouter.ai/docs/api/reference/errors-and-debugging)

### 4.6 Privacy

Evidence đi qua OpenRouter và upstream provider. Official docs nói OpenRouter không lưu prompt/response trừ khi người dùng opt in logging/data use, nhưng vẫn lưu request metadata; upstream providers có policy riêng. `zdr: true` chỉ route tới ZDR endpoints. [Data collection](https://openrouter.ai/docs/guides/privacy/data-collection) · [Zero Data Retention](https://openrouter.ai/docs/guides/features/zdr) · [Provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging)

Vì source/evidence tương lai có thể chứa private code, OpenRouter không được là OSS default. UI/CLI phải có explicit cloud opt-in và cảnh báo trước khi private material rời máy. Input/output logging và data-discount logging phải off cho UpgradeLens analysis; route cần ZDR/data policy phù hợp organization.

### 4.7 Suitability decision

| Use case | Đánh giá | Điều kiện |
| --- | --- | --- |
| Cloud smoke | `SUPPORTED` | Có account/key, contributor opt-in, không suy ra quality |
| Model comparison | `SUPPORTED` | Mỗi exact model/provider là một run riêng |
| Prompt/quality benchmark | `SUPPORTED` | Locked route, metadata enabled, no plugins/fallback/auto/free |
| Production-like analysis | `SUPPORTED` có điều kiện | Allowlist + quality gate + privacy + trace + fail on unknown identity |
| Availability fallback | `SUPPORTED` | Chỉ giữa các tuple đã validation; occurrence luôn recorded |
| Default OSS runtime | `NOT_RECOMMENDED` | Cloud/account/cost/privacy không phù hợp default contributor path |

Quyết định: OpenRouter nên là **cloud benchmark gateway chính**, không phải runtime mặc định của dự án OSS.

## 5. Compatibility and Suitability Matrix

Nhãn đánh giá capability trong mode an toàn cho Version Analysis, không phải feature marketing. `Direct provider` là category không đồng nhất nên các capability phụ thuộc provider/model cụ thể.

| Capability | 9Router | OpenRouter | Direct Ollama | Direct provider |
| --- | --- | --- | --- | --- |
| OSS/self-hosted | `SUPPORTED` | `NOT_SUPPORTED` | `SUPPORTED` | `PARTIAL` |
| OpenAI compatibility | `SUPPORTED` | `SUPPORTED` | `SUPPORTED` | `PARTIAL` |
| JSON Schema | `PARTIAL` — translation có thể thành prompt-only | `SUPPORTED` — compatible endpoint + required parameter | `SUPPORTED` — model quality vẫn ảnh hưởng | `PARTIAL` — provider/model-specific |
| Model pinning | `SUPPORTED` — exact `provider/model` | `SUPPORTED` — exact slug | `SUPPORTED` — dùng immutable tag/digest nếu có | `SUPPORTED` |
| Provider pinning | `SUPPORTED` — provider prefix | `SUPPORTED` — `provider.only` | `SUPPORTED` — endpoint fixed | `SUPPORTED` — endpoint fixed |
| Fallback control | `PARTIAL` — tránh combo; account failover per-request chưa rõ | `SUPPORTED` — `allow_fallbacks:false`, no model fallbacks | `SUPPORTED` — không router fallback | `PARTIAL` — client/provider-specific |
| Actual model identity | `PARTIAL` — local detail tốt, public stable contract chưa đủ | `SUPPORTED` — response + router metadata/generation | `SUPPORTED` — configured/response model | `SUPPORTED` thường có; verify per provider |
| Actual provider identity | `PARTIAL` — local detail, không stable response field | `SUPPORTED` — selected endpoint/provider metadata | `SUPPORTED` — local endpoint identity | `SUPPORTED` — endpoint identity |
| Token usage | `PARTIAL` — normalized/estimated/buffered paths | `SUPPORTED` — response + native generation counts | `SUPPORTED` | `PARTIAL` — provider-specific |
| Latency | `PARTIAL` — local detail/client wall clock | `SUPPORTED` — generation + client wall clock | `PARTIAL` — client/runtime fields | `PARTIAL` — provider-specific |
| Cost | `PARTIAL` — dashboard estimate, upstream billing external | `SUPPORTED` — generation `total_cost` | `NOT_SUPPORTED` — không per-request bill | `PARTIAL` — billing API-specific |
| Offline capability | `PARTIAL` — server local, upstream quyết định | `NOT_SUPPORTED` | `SUPPORTED` | `PARTIAL` — local provider only |
| Privacy | `PARTIAL` — local persistence nhưng remote upstream/log/sync risks | `PARTIAL` — cloud; ZDR/data controls | `SUPPORTED` nếu local-only | `PARTIAL` — policy-specific |
| Reproducibility | `PARTIAL` — locked profile bắt buộc | `PARTIAL` — locked route, upstream vẫn mutable | `PARTIAL` — pin model artifact/config | `PARTIAL` — pin revision/config nếu có |
| Evaluation suitability | `PARTIAL` | `SUPPORTED` có điều kiện | `SUPPORTED` có điều kiện | `SUPPORTED` có điều kiện |
| Benchmark suitability | `PARTIAL` — không baseline mặc định | `SUPPORTED` có điều kiện | `SUPPORTED` làm local control | `SUPPORTED` có điều kiện |
| Production-analysis suitability | `PARTIAL` | `SUPPORTED` có điều kiện | `PARTIAL` — model quality quyết định | `SUPPORTED` có điều kiện |

Các `UNKNOWN` discovery còn lại:

- **9Router exact account pinning:** thiếu documented public request field để chọn một connection và disable account fallback.
- **9Router universal schema preservation:** thiếu conformance evidence cho mọi translator/upstream; source đã chứng minh ít nhất Claude path là prompt instruction thay vì native constraint.
- **9Router stable public fallback metadata:** thiếu documented response contract chứa toàn bộ attempted/selected provider-model-account chain.
- **Direct provider category:** không thể kết luận chung về retention, revisions, usage/cost và retry nếu chưa chọn provider/model cụ thể.

## 6. Routing Policy

### Development mode

- Direct Ollama là đường smoke local đơn giản nhất.
- 9Router được phép combo/fallback để tăng availability trong daily development, nhưng output chỉ là development signal.
- OpenRouter auto/free/fallback chỉ được dùng cho cloud smoke, không gắn nhãn benchmark/production-quality.
- Luôn chạy local schema/trust validation; route failure không được đổi deterministic facts.
- Log route identity khi có, nhưng không log full prompt/evidence.

### Evaluation mode

- Pin exact model; pin provider khi gateway có provider router.
- 9Router: exact `provider/model`, no alias/combo/fusion/round-robin, một enabled account, RTK/Headroom/PXPIPE/Caveman/Ponytail và other transforms off.
- OpenRouter: exact non-`latest` slug, một `provider.only`, `allow_fallbacks:false`, `require_parameters:true`, no `models`/`fallbacks`, no auto/free/plugins; bật `X-OpenRouter-Metadata: enabled`.
- Native `json_schema` là bắt buộc. Capability rejection phải fail, không retry với JSON mode/prompt-only.
- Actual provider/model phải khớp requested policy. Unknown/mismatch làm run invalid.
- Gateway version/config digest, fallback attempts, latency, usage/cost được ghi ở execution trace ngoài portable manifest.

### Production analysis mode

- Chỉ allowlist runtime tuple đã vượt cùng Golden Dataset/scorecard gate.
- Structured-output capability là precondition; không silent downgrade.
- Fallback chỉ sang exact tuple đã validation độc lập; fallback occurrence bắt buộc ghi trace và trigger human review trước MVP-04.
- Fail closed nếu actual provider/model không xác định, route ngoài allowlist hoặc pipeline transform ngoài policy.
- Cloud runtime cần explicit user/operator opt-in, private-data warning và privacy policy phù hợp.
- `requiresHumanReview`/`nextAction` từ trust layer vẫn là authority; gateway không được override.

## 7. Benchmark Strategy

### 7.1 Controlled comparison

So sánh ba route:

```text
Direct Ollama exact model artifact
vs
9Router exact provider/model, locked profile
vs
OpenRouter exact model/provider, locked route
```

Giữ nguyên cho mọi run:

- Golden Dataset version và case order;
- prompt version;
- candidate output schema/digest;
- local Ajv validation, trust validation, comparator, Metrics và Scorecard;
- timeout/retry policy;
- non-streaming request;
- versioned repeat count lớn hơn một để đo variance.

Không so một router alias với một exact model rồi gọi đó là model comparison. Mỗi actual `(model, provider)` là một candidate riêng. Sample có route mismatch, unexpected fallback, cache replay thiếu route metadata hoặc capability downgrade bị loại/invalidate, không trộn vào average.

### 7.2 Metrics

Quality metrics:

- schema-valid/validation pass rate;
- risk classification accuracy;
- human-review accuracy và reason accuracy;
- evidence-reference accuracy, evidence coverage accuracy/reference coverage;
- current trust-layer unsupported-claim proxy (`CLAIMS_DROPPED`) và raw unsupported claim rate trước trust nếu runner sau này có thể quan sát an toàn;
- published unsupported claim rate sau trust;
- deterministic pass rate và cross-repeat variance.

Runtime metrics:

- end-to-end latency và gateway/upstream latency khi có;
- prompt/completion/total tokens, cache/reasoning tokens khi có;
- authoritative cost hoặc `null`, không suy đoán;
- fallback/attempt count;
- actual model/provider changes;
- schema capability rejection, timeout và normalized error category;
- request/response transform pipeline flags.

### 7.3 Interpretation

- Direct Ollama là local control, không tự động là quality winner.
- 9Router pinned route phải được so với cùng upstream direct route khi có thể; chênh lệch chỉ ra translation/transform/observability effects.
- OpenRouter pinned route cho phép cloud model comparison; một provider khác là một run mới.
- Availability và quality được báo riêng. Fallback làm tăng success rate không được che regression về risk/evidence/schema.
- Không chạy benchmark trong LR-00A.

## 8. Artifact and Observability Requirements

`version-analysis.json` tiếp tục portable và provider-neutral. Không thêm execution telemetry vào manifest hiện tại vì nó sẽ làm artifact phụ thuộc deployment, chứa identifiers/cost và làm thay đổi downstream contract không cần thiết.

Optional execution trace ngoài portable artifact nên có shape khái niệm:

```json
{
  "schemaVersion": "1",
  "runId": "...",
  "contextId": "...",
  "startedAt": "...",
  "gateway": "9router|openrouter|none",
  "gatewayVersion": "...",
  "routingPolicyDigest": "sha256:...",
  "requestedModel": "...",
  "actualModel": "...",
  "requestedProvider": "...",
  "actualProvider": "...",
  "structuredOutputMode": "jsonSchema",
  "fallbackOccurred": false,
  "attemptCount": 1,
  "pipelineTransforms": [],
  "latencyMs": 0,
  "tokenUsage": {},
  "cost": null,
  "generationId": "...",
  "finishReason": "...",
  "errorCategory": null
}
```

Benchmark cần thêm `datasetVersion`, `promptVersion`, `outputSchemaDigest`, repeat/sample index và scorecard linkage. Audit production cần run/context IDs, timestamp, gateway version, selected route, fallback/transform flags, generation/request correlation ID, privacy mode và normalized error.

Không được lưu trong portable artifact hoặc default trace:

- API key, Authorization, OAuth/subscription token, cookie hoặc raw headers;
- full prompt, full evidence, source code, raw request/provider request;
- raw response/provider error body có thể echo input;
- credential/connection secrets, dashboard database paths hoặc proxy URLs có credentials.

Trace writer phải redact endpoint credentials/query secrets, write file mode hạn chế và cho phép disable. Gateway-native dashboard/log không thay thế UpgradeLens trace: trace phải map vào stable local vocabulary và giữ correlation ID để operator truy vấn gateway khi được phép.

## 9. Recommended Roles

| Mode/role | Primary | Secondary | Không dùng |
| --- | --- | --- | --- |
| Local technical smoke | Direct Ollama | 9Router → local/explicit upstream | Cloud auto/free route làm local proof |
| OSS multi-provider development | 9Router | Direct provider | Coi fallback output là benchmark-equivalent |
| Cloud smoke | OpenRouter | Direct cloud provider | Gửi private evidence không opt-in |
| Cloud quality benchmark | OpenRouter locked route | Direct provider control | `openrouter/auto`, `openrouter/free`, model/provider fallback |
| Canonical local comparison | Direct Ollama pinned artifact | 9Router pinned same upstream | Combo/fusion/token transforms |
| Production analysis | Explicit validated runtime tuple | Validated fallback tuple | Unknown identity/capability, unvalidated fallback |

Trả lời mười decision questions:

| # | Trả lời |
| --- | --- |
| 1 | **Có điều kiện.** 9Router nên là OSS gateway tùy chọn cho contributor/daily development, không là dependency/default bắt buộc. |
| 2 | **Không ở default config; có điều kiện ở locked profile.** Vẫn chỉ bounded reproducibility và phải qua LR-03 conformance. |
| 3 | **Pin model/provider được bằng `provider/model`; disable cross-model fallback bằng cách không dùng combo.** Per-request disable account fallback/pin exact account là `UNKNOWN`. |
| 4 | **Không.** Không có bằng chứng universal preservation; Claude translation biến schema thành prompt instruction. |
| 5 | **Có điều kiện.** OpenRouter nên là cloud benchmark gateway chính khi route bị khóa và privacy được chấp nhận. |
| 6 | **Có.** Dùng `provider.only`, `allow_fallbacks:false`, `require_parameters:true`, exact model slug và `response_format.json_schema`. |
| 7 | **Không.** Auto/free router không dùng cho Version Analysis benchmark hoặc trusted roadmap input. |
| 8 | **Có cho transport.** Một OpenAI-compatible adapter đủ cho cả hai; không đồng nghĩa cùng capability/policy. |
| 9 | **Có, nhưng nhỏ và allowlisted.** OpenRouter cần `provider` body fields và `X-OpenRouter-Metadata`; 9Router baseline không cần vendor body extras. |
| 10 | **Chỉ exact runtime tuple đã vượt quality gate**, actual identity known, native schema enforced, trust-valid; fallback tuple phải validation độc lập. |

## 10. Architecture Decision

### Decision

Giữ `AiRuntime` và thêm một OpenAI-compatible provider theo LR-00. Gateway là optional deployment hop, không phải runtime abstraction mới.

```text
Deterministic Dependency AI Context
        ↓
AiRuntime.generateStructured
        ↓
OpenAiCompatibleProvider
        ├── request: model + messages + response_format
        ├── optional allowlisted headers/body extras
        └── response: output + usage + route metadata
        ↓
Optional endpoint
        ├── Ollama direct
        ├── 9Router
        ├── OpenRouter
        └── direct provider
        ↓
Local Ajv validation
        ↓
Local trust validation
        ↓
Portable Version Analysis Manifest
        └── separate optional execution trace
```

### Gateway-specific differences được phép

- optional request body extras chỉ cho known routing keys; không được override `model`, `messages`, `response_format` hoặc `stream` do adapter sở hữu;
- optional headers, đặc biệt OpenRouter routing metadata opt-in, với secret redaction;
- gateway response metadata mapper thành stable actual provider/model/attempt/transform fields;
- explicit mode policy chọn/forbid extras.

Không thêm `NineRouterAdapter` hay `OpenRouterAdapter`. Nếu LR-03 chứng minh một gateway phá wire contract không thể map bằng configuration, cần ADR mới thay vì branch vendor rải trong adapter.

### MVP-04/MVP-05 quality gate

Một result chỉ được làm downstream input khi:

1. candidate qua local JSON parse + Ajv; published result qua trust validation;
2. `status=completed`, `validation.status` hợp lệ và `nextAction=proceedToImpactAnalysis`;
3. actual model/provider known, match allowlist và structured output không downgrade;
4. không unexpected fallback/transform; nếu fallback hợp lệ xảy ra thì `requiresHumanReview=true` trước MVP-04;
5. exact runtime tuple vượt scorecard thresholds hiện có:
   - risk classification accuracy `>= 0.90`;
   - human-review accuracy và reason accuracy `>= 0.95`;
   - evidence-reference accuracy và reference coverage `>= 0.95`;
   - validation pass rate `>= 0.98` trên evaluation corpus;
- unsupported claim rate `<= 0.05` theo metric hiện có (`CLAIMS_DROPPED` proxy); raw pre-trust rate phải báo riêng khi collector hỗ trợ;
   - deterministic pass rate `= 1.00`;
6. published unsupported claims bằng `0` cho từng downstream artifact; trust layer phải drop/downgrade hoặc block phần không grounded;
7. gateway/model/provider/prompt/schema/dataset change làm invalid approval cũ và yêu cầu re-evaluation.

Các threshold corpus không thay thế per-result gate: một candidate sai schema hoặc unknown route không được publish chỉ vì average đạt 98%. Evaluation Runner hiện chỉ nhận trusted result, nên chưa đo trực tiếp raw pre-trust claims; không được gọi metric `CLAIMS_DROPPED` hiện tại là raw claim rate.

## 11. Implementation Impact

Tối đa ba task tiếp theo; LR-00A không triển khai task nào.

### LR-01 — OpenAI-Compatible Provider

**Scope**

- triển khai non-streaming Chat Completions mapping theo LR-00;
- map `outputSchema` sang strict `response_format.json_schema`;
- parse output/usage/model, bounded timeout/response, sanitized error taxonomy;
- giữ `AiRuntime` và trust contracts không đổi.

**Acceptance criteria**

- wire-compatible request/response fixtures;
- fail rõ với missing model, invalid envelope, refusal, schema capability error, timeout và non-2xx;
- secrets/prompt không xuất hiện trong error/log;
- generic provider chạy được với endpoint không có gateway extras.

**Tests**

- unit tests request mapping, response parsing, usage normalization, timeout/error/redaction;
- existing AI Version Analysis/Evaluation/Benchmark tests pass.

**Out of scope**

- cài/cấu hình gateway, live cloud calls, routing policy, new prompt/schema/trust behavior.

### LR-02 — Ollama Direct Smoke Validation

**Scope**

- opt-in local smoke dùng model contributor đã có;
- validate transport → candidate schema → trust path;
- document hardware/model caveats và no-network behavior.

**Acceptance criteria**

- một valid structured candidate đi qua local schema/trust;
- invalid output fail closed;
- không pull model tự động, không làm Ollama/model thành dependency.

**Tests**

- automated mocked conformance; manual/local test bị skip mặc định và không chạy CI cloud.

**Out of scope**

- tuyên bố production quality, tải model, benchmark 9Router/OpenRouter.

### LR-03 — Gateway Conformance, Routing Policy & Execution Trace

**Scope**

- thêm optional allowlisted request extras/headers và stable route metadata mapping;
- định nghĩa mode profiles cho 9Router locked và OpenRouter locked;
- thêm separate redacted execution trace + gateway conformance fixtures;
- opt-in live validation, không yêu cầu account/key trong CI.

**Acceptance criteria**

- OpenRouter profile gửi exact model, `provider.only`, fallback false, required parameters và metadata header; mismatch/unknown identity fail closed;
- 9Router profile cấm alias/combo/fusion/transforms và yêu cầu recoverable actual route;
- fallback/attempt/transform được trace; portable manifest byte contract không đổi;
- mode policy không cho extras override adapter-owned fields.

**Tests**

- mocked 9Router/OpenRouter wire fixtures cho pinned success, unsupported schema, fallback, identity mismatch, metadata absence và redaction;
- contract test chứng minh MVP-04 gate chỉ nhận trusted/approved tuple.

**Out of scope**

- gateway installation, API account creation, production deployment, benchmark execution, MVP-04/MVP-05 implementation.

## 12. Risks and Open Questions

| Risk/open question | Impact | Required resolution |
| --- | --- | --- |
| 9Router packaged version/config drift | Same model string có thể qua translator/routing khác | Trace gateway version + config digest; pin release for evaluation |
| 9Router account selection chưa có public per-request pin contract | Quota/account rotation khó reproduce | LR-03 source/conformance check; single enabled connection meanwhile |
| 9Router schema translation không native trên mọi path | Schema errors hoặc semantic drift | Provider/model allowlist; native capability conformance; fail closed |
| 9Router local request-detail persistence chứa prompt/provider bodies | Private evidence có thể tồn tại trên disk | Retention/redaction review trước private production use |
| 9Router optional cloud sync/tunnel/MITM increases trust surface | Credential/data exposure và terms risk | Off by default for UpgradeLens profile; operator approval |
| OpenRouter model/provider serving revisions mutable | Locked slug vẫn không bitwise reproducible | Repeated runs, timestamps, generation metadata, re-evaluate on drift |
| OpenRouter cache replay không có router metadata | Actual route audit có thể thiếu | Treat missing metadata as invalid evaluation sample; query generation where possible |
| OpenRouter upstream provider privacy differs | Evidence may be retained/trained outside expected policy | `zdr`, data policy, provider allowlist, explicit user warning/consent |
| Free/auto/fallback routes silently alter quality | Wrong risk/evidence can propagate downstream | Forbid in eval/production; allow only smoke/dev |
| Gateway cost/usage semantics differ | Misleading benchmark economics | Preserve raw normalized fields + source; authoritative cost or `null` |
| Native JSON Schema support does not prove grounding | Schema-valid hallucination remains possible | Keep evidence/trust gate and Golden Dataset thresholds |
| MVP-04/MVP-05 may consume stale approval after runtime change | Roadmap built from unvalidated model behavior | Approval key includes gateway/model/provider/prompt/schema/dataset versions |

Open questions intentionally deferred to LR-03:

- Can current 9Router release expose a stable correlation ID/API for exact selected provider, model, connection and all attempts without reading dashboard storage directly?
- Can account fallback be disabled or exact connection selected through a supported public request/config contract?
- Which 9Router translator paths preserve native JSON Schema rather than prompt-only instructions?
- What minimal stable execution-trace schema integrates with Benchmark Runner without changing portable Version Analysis Manifest?
- Which concrete model/provider tuples meet the quality gate? Discovery cannot answer this without executing the approved benchmark.

### Official evidence consulted

9Router: [website](https://9router.com/), [repository README](https://github.com/decolua/9router/blob/master/README.md), [architecture](https://github.com/decolua/9router/blob/master/docs/ARCHITECTURE.md), [license](https://github.com/decolua/9router/blob/master/LICENSE), [model resolution](https://github.com/decolua/9router/blob/master/open-sse/services/model.js), [combo routing](https://github.com/decolua/9router/blob/master/open-sse/services/combo.js), [chat core](https://github.com/decolua/9router/blob/master/open-sse/handlers/chatCore.js), [OpenAI-to-Claude translation](https://github.com/decolua/9router/blob/master/open-sse/translator/request/openai-to-claude.js), [usage tracking](https://github.com/decolua/9router/blob/master/open-sse/utils/usageTracking.js).

OpenRouter: [API overview](https://openrouter.ai/docs/api/reference/overview), [Models API](https://openrouter.ai/docs/guides/overview/models), [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks), [router metadata](https://openrouter.ai/docs/guides/features/router-metadata), [generation stats](https://openrouter.ai/docs/api/api-reference/generations/get-generation), [errors](https://openrouter.ai/docs/api/reference/errors-and-debugging), [data collection](https://openrouter.ai/docs/guides/privacy/data-collection), [ZDR](https://openrouter.ai/docs/guides/features/zdr), [provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging).
