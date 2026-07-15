# LR-00B — AI Capability Discovery for Version Analysis

**Status:** Discovery only

**Ngày chốt nguồn:** 2026-07-15

**Phạm vi:** MVP-03 Version Analysis, định hướng MVP-04 Impact Analysis và MVP-05 Migration Planning

Tài liệu này chọn **benchmark candidate**, không tuyên bố model thắng benchmark. Không có tài liệu nhà cung cấp nào đo trực tiếp việc giữ đúng `evidence id`, phân loại risk theo taxonomy của UpgradeLens, hay tránh invented migration step trên corpus của UpgradeLens. Những thuộc tính đó được ghi là **suy luận** hoặc **chưa xác minh**, không được nâng thành fact.

Quy ước đánh giá:

- **HIGH / MEDIUM / LOW:** mức phù hợp dự kiến với task; không phải điểm benchmark.
- **NATIVE:** capability do API/model endpoint chính thức cung cấp.
- **RUNTIME:** capability do Ollama, LM Studio hoặc vLLM grammar-constrained decoding cung cấp, không phải bảo đảm nội tại của weights.
- **UNKNOWN:** nguồn chính thức không chứng minh capability cho Version Analysis.
- **Confidence HIGH / MEDIUM / LOW:** độ mạnh của bằng chứng cho rating; capability được suy luận từ general reasoning luôn có confidence thấp hơn capability API được document rõ.

## 1. AI Capability Requirements

### Reverse-engineering task thực tế

MVP-03 không cần một chatbot tổng quát. Từ [`src/dependency-ai-context.js`](../src/dependency-ai-context.js), [`src/ai-version-analysis.js`](../src/ai-version-analysis.js), [`src/version-analysis-manifest.js`](../src/version-analysis-manifest.js), [`src/metrics-engine.js`](../src/metrics-engine.js) và [`src/ai-scorecard.js`](../src/ai-scorecard.js), model chỉ nhận một dependency occurrence, target đã được xác định deterministic, tối đa 8 evidence item và tối đa 12.000 ký tự evidence content. Model không được chọn version, thay đổi dependency identity, đọc repository, tạo URL, hay quyết định human review.

Model phải biến bounded evidence thành đúng năm phần candidate: `summary`, `summaryEvidenceRefs`, `riskLevel`, `riskEvidenceRefs`, `findings`. Local code sau đó parse JSON, validate Draft 2020-12 schema, allowlist evidence IDs/URLs, drop unsupported claims, downgrade risk và tính human review deterministic. Structured output vì vậy là điều kiện cần; nó không thay thế semantic trust validation.

### Capability bắt buộc

| Capability | Hành vi chính xác cần có | Failure mode cần phát hiện |
| --- | --- | --- |
| Release-note reasoning | Liên kết thay đổi trong interval `(current, target]` với risk release-level; phân biệt breaking change, deprecation và compatibility. | Tóm tắt đúng câu nhưng sai version/applies-to. |
| Changelog synthesis | Tổng hợp nhiều evidence item, loại trùng, giữ khác biệt giữa release và không san bằng conflict. | Trộn thay đổi từ release ngoài interval. |
| Semantic-version reasoning | Hiểu major/minor/patch chỉ là signal; không suy ra risk chỉ từ số version. Tôn trọng `declaredConstraint`/unknown baseline. | Gọi mọi major là high hoặc tự đoán installed version. |
| Evidence-grounded summarization | Mỗi summary/risk/finding chỉ dựa vào evidence đã chọn và dùng đúng ID có sẵn. | Invented evidence, URL, API hoặc version. |
| Conflicting-evidence handling | Không âm thầm chọn một nguồn khi context có `SOURCE_CONFLICT`; diễn đạt uncertainty. | Over-confidence từ một nguồn mâu thuẫn. |
| Uncertainty expression | Cho phép `unknown`; không điền khoảng trống bằng kiến thức nền; không biến thiếu evidence thành low risk. | Unsupported certainty. |
| Strict instruction following | Tuân thủ “không source impact, không migration plan, không invent facts”. | Scope leakage sang MVP-04/05. |
| Structured JSON generation | Trả đúng candidate schema, enum, required fields, `additionalProperties: false`, không markdown wrapper. | Invalid/truncated JSON, extra fields. |
| Evidence-reference preservation | Copy chính xác digest `sha256:...`, không sửa một ký tự và không dùng ref ngoài allowlist. | Ref accuracy/coverage thấp. |
| Hallucination resistance | Không tạo migration step, API, flag/config, URL hoặc bằng chứng không có trong context. | `CLAIMS_DROPPED` hoặc semantic falsehood có ref hợp lệ. |
| Reproducible model identity | Cho phép pin model/revision và giữ config; alias/router không được thay model ngầm. | Không thể audit hoặc so sánh run. |

### Capability ưu tiên

| Capability | Vì sao ưu tiên |
| --- | --- |
| Long-context headroom từ 32K | MVP-03 hiện nhỏ hơn nhiều, nhưng prompt, schema, metadata và multilingual tokenization cần headroom. 64K–128K hữu ích cho corpus tương lai. |
| Migration-guide understanding | Không được emit plan ở MVP-03, nhưng cần nhận biết documented mandatory migration action để phân loại high risk; là core capability của MVP-05. |
| Dependency/API reasoning | Hiểu compatibility requirement giữa package, runtime, plugin/peer dependency; là core capability của MVP-04/05. |
| Multilingual documentation reasoning | Evidence có thể chứa tài liệu tiếng Anh và ngôn ngữ khác; output/contributor workflow có thể dùng tiếng Việt. |
| Stable low-variance behavior | Cùng input/config nên ít đổi risk/ref. `temperature: 0` không được coi là mathematical determinism. |
| Low refusal/empty-output rate | Một số reasoning mode có thể trả refusal, empty content hoặc tiêu tốn output budget; runtime phải coi đây là failure rõ ràng. |
| Operational telemetry | Usage, latency, finish reason, exact model/revision cần cho audit/benchmark dù không thuộc semantic manifest. |

### Capability tùy chọn

| Capability | Lý do không bắt buộc hiện tại |
| --- | --- |
| Tool calling | MVP-03 là one-shot bounded context; tool loop làm giảm reproducibility. Hữu ích về sau nhưng không thay final structured output. |
| 1M-token context | Không cần cho context 12.000 ký tự hiện tại; có thể hữu ích cho source-impact retrieval experiments, không phải lý do để dump cả repository. |
| Vision/audio | Evidence hiện là text. |
| Native web/search grounding | Knowledge Research phải thu thập evidence trước AI boundary; model không được tự bổ sung nguồn. |
| Fine-tuning | Chỉ xem xét sau khi eval chứng minh prompt + trust layer + frontier model không đạt gate. |

## 2. Capability Matrix

### Model resolution

Mọi citation trong discovery này trỏ tới documentation/API documentation, technical report hoặc model card do chính tổ chức phát hành model/runtime duy trì. Không dùng blog cá nhân, forum, Reddit, YouTube hoặc leaderboard bên thứ ba. Các benchmark trong technical report chỉ được dùng để hiểu positioning tổng quát, không được dùng làm bằng chứng model đã đạt UpgradeLens quality gate.

Tên family được resolve thành model cụ thể tại ngày chốt nguồn:

- “GPT-5” → `gpt-5`; “GPT-5 mini” → snapshot `gpt-5-mini-2025-08-07`. Đây là required reference candidates, nhưng OpenAI hiện khuyến nghị GPT-5.6 cho workload mới, nên thêm `gpt-5.6-sol` vào discovery.
- “Claude Sonnet” → `claude-sonnet-5`; “Claude Opus” → `claude-opus-4-8`. Anthropic document rằng các ID dateless từ 4.6 trở đi vẫn là pinned version, không phải convenience alias.
- “DeepSeek” được tách thành cloud `deepseek-v4-pro` và open-weight `DeepSeek-V3.2`; gộp hai deployment này sẽ làm sai structured-output và self-host rating.
- “Llama 3.x” → Llama 3.3 70B cho quality candidate và Llama 3.1 8B cho local smoke.
- “Mistral Large” → `mistral-large-2512` / Mistral Large 3 weights.

### Ma trận tóm tắt

Rating `Rel/Mig/Dep` lần lượt là release-note, migration-guide và dependency reasoning. `Ground/Cite` là evidence grounding và khả năng giữ citation/evidence ID; không phải provider web citation. `JSON` là final structured response, không phải tool arguments.

| Model | Structured output / JSON | Context | Reasoning | Rel/Mig/Dep | Ground/Cite | Instruction | Hallucination resistance | Latency | Cost | Open weights | Self-host |
| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GPT-5 | NATIVE JSON Schema; HIGH syntax | 400K | HIGH | H/H/H inferred | M/UNKNOWN | HIGH | MEDIUM-HIGH, residual risk | MEDIUM | MEDIUM | No | No |
| GPT-5 mini | NATIVE JSON Schema; HIGH syntax | 400K | MEDIUM-HIGH | M/M/M inferred | M/UNKNOWN | HIGH | MEDIUM, unverified domain | LOW | LOW | No | No |
| GPT-5.6 Sol | NATIVE JSON Schema; HIGH syntax | 1.05M | HIGH | H/H/H inferred | M/UNKNOWN | HIGH | UNKNOWN for domain | MEDIUM-HIGH | HIGH | No | No |
| Claude Sonnet 5 | NATIVE JSON Schema + strict tools; HIGH syntax | 1M | HIGH | H/H/H inferred | M/UNKNOWN | HIGH | MEDIUM-HIGH, residual risk | LOW-MEDIUM | MEDIUM | No | No |
| Claude Opus 4.8 | NATIVE JSON Schema + strict tools; HIGH syntax | 1M | HIGH | H/H/H inferred | M/UNKNOWN | HIGH | MEDIUM-HIGH, residual risk | MEDIUM-HIGH | HIGH | No | No |
| Gemini 2.5 Pro | NATIVE JSON Schema subset; HIGH syntax | 1,048,576 | HIGH | H/H/H inferred | M/UNKNOWN | HIGH | MEDIUM, residual risk | MEDIUM | MEDIUM | No | No |
| Gemini 2.5 Flash | NATIVE JSON Schema subset; HIGH syntax | 1,048,576 | MEDIUM-HIGH | M/M/M inferred | M/UNKNOWN | MEDIUM-HIGH | MEDIUM, unverified domain | LOW | LOW | No | No |
| Qwen3 8B/14B | RUNTIME grammar; model-native guarantee UNKNOWN | 32,768 native; 131,072 YaRN for 8B | MEDIUM | M/M/M inferred | L-M/UNKNOWN | MEDIUM | UNKNOWN; higher risk than shortlist until eval | Local-dependent | LOW marginal | Apache-2.0 | Yes |
| DeepSeek V4 Pro | JSON mode; strict tool schema, no documented final JSON Schema | 1M | HIGH | H/H/H inferred | M/UNKNOWN | MEDIUM-HIGH | UNKNOWN; JSON empty-output caveat | MEDIUM | LOW | No | No |
| DeepSeek V3.2 | RUNTIME grammar; parser caveat | 160K deployment profile | HIGH claimed generally | H/H/H inferred | M/UNKNOWN | MEDIUM-HIGH | UNKNOWN | HIGH self-host | MEDIUM ops | MIT | Enterprise cluster only |
| Llama 3.3 70B | RUNTIME grammar/prompt-only | 128K | MEDIUM-HIGH | M/M/M inferred | L-M/UNKNOWN | MEDIUM | UNKNOWN | HIGH on limited hardware | MEDIUM ops | Community license | Multi-GPU/server |
| Mistral Large 3 | NATIVE structured output/function call | 256K | HIGH claimed generally | H/H/H inferred | M/UNKNOWN | HIGH | UNKNOWN | MEDIUM-HIGH | MEDIUM | Apache-2.0 | Enterprise multi-accelerator |

`HIGH syntax` chỉ nói grammar/schema conformance được API/runtime constrain. Nó không chứng minh enum có ý nghĩa đúng, evidence ID đúng, summary entailed, hay risk đúng. “Citation quality” cho UpgradeLens là **UNKNOWN với confidence HIGH** ở mọi model vì không nguồn chính thức nào đo contract này.

### Evidence profile theo model

Mỗi profile dưới đây dùng đúng dạng `Capability | Rating | Evidence | Confidence`. Technical report general-purpose chỉ hỗ trợ suy luận capability, không được coi là Version Analysis benchmark.

#### GPT-5 / GPT-5 mini / GPT-5.6 Sol

| Capability | Rating | Evidence | Confidence |
| --- | --- | --- | --- |
| Structured output, function/tool calling | NATIVE | [GPT-5 model page](https://developers.openai.com/api/docs/models/gpt-5), [GPT-5 mini model page](https://developers.openai.com/api/docs/models/gpt-5-mini), [GPT-5.6 Sol model page](https://developers.openai.com/api/docs/models/gpt-5.6-sol) document support; GPT-5 mini has a dated snapshot. | HIGH |
| Long context | 400K for GPT-5/mini; 1.05M for Sol | Same official model pages. | HIGH |
| Reasoning, instruction following | HIGH GPT-5/Sol; MEDIUM-HIGH mini | OpenAI describes Sol for complex professional work and mini for well-defined precise tasks. [GPT-5 System Card](https://openai.com/index/gpt-5-system-card/) reports improved instruction following. Release/migration suitability remains an inference. | MEDIUM |
| Evidence grounding, citation quality | UNKNOWN for UpgradeLens refs | System card factuality tests are not evidence-ID preservation or dependency release analysis. | HIGH |
| Hallucination resistance | Improved relative to prior OpenAI models, not solved | [GPT-5 Deployment Safety Hub](https://deploymentsafety.openai.com/gpt-5/security-controls) reports lower hallucination rates on its evals; no result covers UpgradeLens. | MEDIUM |
| Latency/cost/open-source/self-host | mini LOW/LOW; GPT-5 MEDIUM/MEDIUM; Sol MEDIUM-HIGH/HIGH; all cloud-only | Official model catalog labels speed/price and recommends current tiers. | HIGH for availability; MEDIUM for relative operations |

#### Claude Sonnet 5 / Claude Opus 4.8

| Capability | Rating | Evidence | Confidence |
| --- | --- | --- | --- |
| Structured output, strict tool use | NATIVE | [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) documents JSON output with `output_config.format`, strict tool use and supported JSON Schema subset for both models. | HIGH |
| Long context/output | 1M / 128K | [Sonnet 5 migration/spec](https://platform.claude.com/docs/en/about-claude/models/whats-new-sonnet-5) and [models overview](https://platform.claude.com/docs/en/about-claude/models/overview). | HIGH |
| Reasoning, release/migration/dependency | HIGH inferred | [Choosing a model](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model) positions Sonnet for coding/data analysis and Opus for complex reasoning/engineering. No release-note domain test. | MEDIUM |
| Evidence grounding/citation | UNKNOWN for digest refs | Native citation blocks are not the UpgradeLens evidence-ref contract; structured output and citations also have API composition constraints. | HIGH |
| Hallucination resistance | Residual MEDIUM risk | [Anthropic system cards](https://www.anthropic.com/system-cards) publish factuality/hallucination evaluations, but Sonnet 5/Opus 4.8 results do not validate UpgradeLens claims. | MEDIUM |
| Reproducibility/operations | Pinned IDs; Sonnet faster/cheaper than Opus | [Model IDs and versioning](https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions) says dateless 4.6+ IDs are pinned. Official overview labels Sonnet fast and Opus moderate. | HIGH |

#### Gemini 2.5 Pro / Gemini 2.5 Flash

| Capability | Rating | Evidence | Confidence |
| --- | --- | --- | --- |
| Structured output/tool calling | NATIVE JSON Schema subset | [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output) documents schema-constrained JSON and explicitly requires application validation of semantically wrong values. Model pages list function calling. | HIGH |
| Long context | 1,048,576 input; 65,536 output | [Gemini 2.5 Pro](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro) and [Gemini 2.5 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash). | HIGH |
| Reasoning/document/code understanding | HIGH Pro; MEDIUM-HIGH Flash | [Gemini 2.5 technical report](https://storage.googleapis.com/deepmind-media/gemini/gemini_v2_5_report.pdf) and model pages describe thinking, long-document/codebase reasoning; no Version Analysis test. | MEDIUM |
| Evidence grounding/citation | UNKNOWN for UpgradeLens refs | Search grounding is a separate capability and must be disabled/out of boundary for this task. Official docs do not test digest preservation. | HIGH |
| Hallucination resistance | Residual MEDIUM risk | Technical report includes factuality/grounding evaluations, but Google’s structured-output docs explicitly warn that schema-valid values may still be semantically wrong. | MEDIUM |
| Operations | Flash LOW latency/cost; Pro MEDIUM | Official model catalog positions Flash for low-latency/high-volume reasoning and Pro for complex tasks. Stable IDs should be used, never `latest`/preview. | HIGH |

#### Qwen3 8B/14B

| Capability | Rating | Evidence | Confidence |
| --- | --- | --- | --- |
| Structured output | RUNTIME, not model-native guarantee | [Qwen vLLM deployment](https://qwen.readthedocs.io/en/stable/deployment/vllm.html) delegates guided JSON to vLLM and still recommends format instruction. Ollama/LM Studio can add grammar constraints. | HIGH |
| Context | 32,768 native; Qwen3-8B validated to 131,072 with YaRN | [Qwen3-8B model card](https://huggingface.co/Qwen/Qwen3-8B); YaRN can change short-context behavior and must be benchmarked as a separate profile. | HIGH |
| Reasoning/instruction/multilingual | MEDIUM expected | Official model card documents thinking/non-thinking, instruction following, agent skills and 100+ languages. It does not measure dependency releases. | MEDIUM |
| Evidence grounding/citation | LOW-MEDIUM expected / UNKNOWN actual | No official evidence-ID or release-note evaluation. | LOW |
| Hallucination/determinism | UNKNOWN; sampling-sensitive | Model card recommends sampling for thinking mode; greedy decoding can cause repetition/degradation. A fixed seed/temperature does not prove semantic determinism. | MEDIUM |
| Availability/self-host | Apache-2.0, strong local suitability at 8B; conditional at 14B | Official model card plus [Ollama Qwen3 tags](https://ollama.com/library/qwen3/tags) expose concrete quantized artifact sizes. | HIGH |

#### DeepSeek V4 Pro / DeepSeek V3.2

| Capability | Rating | Evidence | Confidence |
| --- | --- | --- | --- |
| Final structured output | V4: JSON mode only; V3.2 weights: RUNTIME | [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode) supports `json_object`, requires prompt/example and warns of occasional empty content. [Tool Calls](https://api-docs.deepseek.com/guides/tool_calls) has strict schema for tool arguments, which is not final JSON Schema. | HIGH |
| Context/reasoning | V4 Pro 1M; V3.2 long-context reasoning | [DeepSeek models](https://api-docs.deepseek.com/quick_start/pricing) documents V4 context/features. [V3.2 model card](https://huggingface.co/deepseek-ai/DeepSeek-V3.2) describes reasoning and sparse attention. | HIGH for context; MEDIUM for task quality |
| Release/migration/dependency | HIGH inferred | General reasoning/agent results do not cover this domain. | LOW |
| Grounding/citation/hallucination | UNKNOWN | No official Version Analysis grounding test; V3.2 card warns its parser does not recover malformed output and is not production-ready without robust error handling. | HIGH |
| Reproducibility | V4 explicit ID; legacy aliases are being retired; V3.2 weights pinnable | [DeepSeek changelog](https://api-docs.deepseek.com/updates) records alias transition. Pin revision/hash for weights. | HIGH |
| Open/self-host/cost | V4 cloud LOW cost; V3.2 MIT but 685B and enterprise-scale | Official API docs and model card. “Open” does not mean laptop-suitable. | HIGH |

#### Llama 3.x

| Capability | Rating | Evidence | Confidence |
| --- | --- | --- | --- |
| Structured output | RUNTIME/prompt-only | [Llama 3.3 model card](https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct) documents tool use but no native final JSON Schema. Grammar guarantee belongs to serving runtime. | HIGH |
| Context | 128K for Llama 3.3 70B and Llama 3.1 8B | Official Meta model cards; [Llama 3.1 card](https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct). | HIGH |
| Reasoning/release/migration/dependency | MEDIUM-HIGH at 70B, LOW-MEDIUM at 8B, inferred | General assistant/code evaluations are not Version Analysis. | LOW-MEDIUM |
| Multilingual | Limited for this task | Llama 3.3 officially supports eight languages; Vietnamese is not in the supported list and Meta discourages unsupported-language use without controls. | HIGH |
| Grounding/citation/hallucination | UNKNOWN | No official evidence-ref preservation result. | HIGH |
| Open/self-host | Open weights under custom Llama Community License, not OSI open source; 8B local, 70B server-scale | Model card/license and official artifact sizes. | HIGH |

#### Mistral Large 3

| Capability | Rating | Evidence | Confidence |
| --- | --- | --- | --- |
| Structured output/function calling | NATIVE on Mistral API | [Mistral structured outputs](https://docs.mistral.ai/studio-api/conversations/structured-output) and [Mistral Large 3 model page](https://docs.mistral.ai/models/model-cards/mistral-large-3-25-12). | HIGH |
| Context/reasoning | 256K; HIGH general-purpose reasoning inferred | Model page describes 41B active/675B total MoE, long-context and instruction workload. No Version Analysis eval. | HIGH for specs; MEDIUM for task quality |
| Grounding/citation/hallucination | UNKNOWN | JSON conformance is documented; semantic evidence fidelity is not. | HIGH |
| Instruction/multilingual | HIGH expected | Official model card documents system prompt, multilingual and instruction use. | MEDIUM |
| Open/self-host | Apache-2.0 weights, but enterprise hardware | [Official Hugging Face model card](https://huggingface.co/mistralai/Mistral-Large-3-675B-Instruct-2512-BF16) specifies single-node B200/H200 or H100/A100 deployment variants; not a 24GB GPU model. | HIGH |
| Cost/latency | MEDIUM cloud; HIGH self-host capital/ops | API model page and deployment requirements. | MEDIUM |

## 3. Version Analysis Suitability

### MVP-03 — Version Analysis

MVP-03 cần evidence fidelity và schema reliability nhiều hơn “agentic intelligence”. Shortlist hợp lý nhất:

1. **Claude Sonnet 5** — primary production benchmark candidate: native schema, pinned ID, strong document/reasoning profile, latency/cost cân bằng.
2. **GPT-5.6 Sol** — quality-ceiling benchmark candidate: native schema, strong complex reasoning; cost cao hơn mức cần thiết cho bounded MVP-03, nên chưa phải runtime mặc định trước benchmark.
3. **Gemini 2.5 Pro** — independent long-document reasoning candidate: native schema subset và stable model ID; cần kiểm tra candidate schema tương thích subset trước run.
4. **GPT-5 mini** và **Gemini 2.5 Flash** — cost/latency challengers cho task có prompt/schema rõ; chỉ promote nếu giữ evidence refs và risk gate ngang Tier A.
5. **Qwen3 14B** — OSS development candidate; **Qwen3 8B** chỉ là local smoke/reference floor, không phải production-quality assumption.

**GPT-5** vẫn được giữ làm required reference nhưng không nên mở một production qualification mới khi chính official catalog đã chuyển recommendation sang GPT-5.6. **DeepSeek V4 Pro** có reasoning/cost hấp dẫn nhưng thiếu documented final `json_schema`; chỉ vào benchmark sau conformance gate hoặc dùng strict tool-call envelope được thiết kế riêng trong một task khác. **Mistral Large 3** đáng benchmark nếu Mistral API mapping đã được xác nhận. Llama 3.3 70B không có lợi thế local đủ lớn và không có Vietnamese support chính thức, nên là secondary OSS comparison.

### MVP-04 — Impact Analysis

MVP-04 phải liên kết release evidence với deterministic source facts/import/API usage, nên reasoning/code-understanding quan trọng hơn MVP-03. Shortlist:

1. **GPT-5.6 Sol** — first quality-ceiling candidate.
2. **Claude Opus 4.8** — first deep-reasoning/coding comparison.
3. **Claude Sonnet 5** — production efficiency challenger; có thể thắng nếu retrieval/context đã tốt và task không cần Opus-class reasoning.
4. **Gemini 2.5 Pro** — long codebase/document candidate, nhưng không được dùng 1M context như lý do bỏ deterministic retrieval.
5. **Mistral Large 3 / DeepSeek V3.2** — enterprise OSS/on-prem research candidates, không phải contributor defaults.

### MVP-05 — Migration Planning

MVP-05 có rủi ro invented step/API cao nhất. Chỉ benchmark model đã pass MVP-03 grounding gate và MVP-04 impact gate:

1. **Claude Opus 4.8** và **GPT-5.6 Sol** làm quality-ceiling pair.
2. **Claude Sonnet 5** làm production cost/latency challenger.
3. **Gemini 2.5 Pro** làm independent architecture comparison.
4. Open-weight model chỉ được promote khi plan step bắt buộc có evidence/impact refs và đạt gate; general reasoning score không đủ.

Không có “best model thực sự” trước domain benchmark. Discovery kết luận được **best candidates**, đồng thời kết luận một số model không đủ contract để vào production benchmark ngay.

## 4. OSS Contributor Perspective

### Runtime role

| Contributor environment | Runtime phù hợp | Model/profile đề xuất | Vai trò |
| --- | --- | --- | --- |
| MacBook Air Apple Silicon 16GB | Ollama hoặc LM Studio/MLX | Qwen3 8B quantized; Llama 3.1 8B quantized làm English comparison | Local smoke, prompt/schema transport validation |
| MacBook Air 16GB, chấp nhận ít headroom | Ollama/LM Studio | Qwen3 14B Q4 **conditional**, context nhỏ/modest | Development sample, không chạy full 131K |
| NVIDIA GPU 24GB | vLLM | Qwen3 14B AWQ/Q4; Qwen3 30B-A3B Q4 **conditional** | Development benchmark candidate |
| Multi-GPU/server | vLLM | Llama 3.3 70B, Mistral Large 3, DeepSeek V3.2 tùy cluster | OSS/on-prem quality research |
| Không có local accelerator | Cloud endpoint | Sonnet 5, GPT-5.6 Sol, Gemini 2.5 Pro/Flash, DeepSeek V4 Pro | Production benchmark/runtime candidates |

[LM Studio system requirements](https://www.lmstudio.ai/docs/app/system-requirements) khuyến nghị 16GB+ RAM trên Apple Silicon. Official Ollama registry ghi Qwen3 8B package khoảng 5,2GB, Qwen3 14B Q4 khoảng 9,3GB, Qwen3 30B-A3B Q4 khoảng 19GB; Llama 3.1 8B khoảng 4,9GB. Đây chỉ là **weight artifact size**, không phải total working memory. KV cache, runtime buffers, OS và context làm tăng RAM/VRAM; vì vậy “artifact nhỏ hơn RAM” không phải chứng minh fit.

### Kết luận theo máy

- **MacBook Air 16GB:** Qwen3 8B là default contributor smoke. Qwen3 có multilingual scope rộng hơn Llama 3.x cho contributor Việt Nam. Qwen3 14B Q4 có thể chạy với context hạn chế nhưng không được coi là baseline CI hay quality reference.
- **GPU 24GB:** Qwen3 14B quantized là lựa chọn an toàn hơn. Qwen3 30B-A3B artifact 19GB là conditional vì còn KV cache/engine overhead. Llama 3.3 70B ngay cả Q2 artifact chính thức đã khoảng 26GB; không fit một GPU 24GB trước overhead. Mistral Large 3 và DeepSeek V3.2 không phù hợp single 24GB.
- **Cloud-only về thực tế:** GPT/Claude/Gemini/DeepSeek V4. Mistral Large 3 và DeepSeek V3.2 có weights nhưng cần hạ tầng enterprise; “open-weight” không đồng nghĩa contributor-local.

Ollama/LM Studio phù hợp smoke vì cài đặt và grammar JSON local. vLLM phù hợp GPU development/serving. Runtime-constrained JSON chỉ xác nhận output shape; contributor vẫn phải chạy local UpgradeLens schema/trust validation giống cloud.

## 5. Benchmark Candidate Selection

Discovery này không chạy benchmark và không sửa benchmark config. Candidate tiers đề xuất cho task benchmark sau:

### Tier A — Production quality benchmark

| Candidate | Lý do | Điều kiện trước khi chạy |
| --- | --- | --- |
| Claude Sonnet 5 | Balance quality/speed, native schema, pinned ID | Direct/pinned provider, no fallback; schema conformance probe pass. |
| GPT-5.6 Sol | Quality ceiling, native schema | Exact ID/revision behavior recorded; reasoning effort pinned. |
| Gemini 2.5 Pro | Independent provider, long-doc reasoning, stable model | UpgradeLens schema supported by Google subset; stable ID only. |
| Claude Opus 4.8 | Quality ceiling cho MVP-04/05 | Không mặc định dùng cho MVP-03 nếu Sonnet đạt cùng gate. |

### Tier B — Development/cost challenger benchmark

| Candidate | Lý do | Không được suy ra |
| --- | --- | --- |
| GPT-5 mini snapshot | Low-cost, native schema, dated snapshot | “Mini” đủ production chỉ vì JSON pass. |
| Gemini 2.5 Flash | Low latency/high volume, thinking + schema | Long context đồng nghĩa reasoning ngang Pro. |
| Mistral Large 3 API | Native schema, open-weight route, provider diversity | API behavior giống self-host weights. |
| DeepSeek V4 Pro | Strong general reasoning/cost candidate | JSON mode tương đương final JSON Schema. |
| Qwen3 14B quantized | OSS reproducible development profile | Quantization/runtime khác nhau có cùng quality. |

### Tier C — Local smoke validation

| Candidate | Mục tiêu | Không dùng để làm gì |
| --- | --- | --- |
| Qwen3 8B Q4 qua Ollama/LM Studio | Kiểm tra endpoint, request mapping, JSON parse/schema/trust failure path | Production quality ranking |
| Llama 3.1 8B Q4 | Runtime/model-family comparison, chủ yếu English evidence | Vietnamese or migration quality claim |

GPT-5 được giữ như **historical/reference run** nếu cần continuity, không ưu tiên chi phí benchmark mới. Llama 3.3 70B, DeepSeek V3.2 và Mistral Large 3 self-host là **Tier B-enterprise**, không phải Tier C: chúng không phục vụ mục tiêu contributor smoke.

Mỗi benchmark identity phải là tuple:

```text
taskProfile + promptVersion + candidateSchemaVersion
+ provider + endpoint/runtime version
+ exact model ID/revision + quantization
+ reasoning/thinking mode + sampling/seed
+ context limit + fallback policy
```

Thiếu một thành phần thì run không đủ điều kiện so sánh reproducible.

## 6. Structured Output Reliability

### So sánh support chính thức

| Model/API | JSON Schema final response | JSON mode | Prompt-only JSON | Tool calling | Đánh giá cho candidate schema |
| --- | --- | --- | --- | --- | --- |
| GPT-5 / GPT-5 mini / GPT-5.6 Sol | Yes, native Structured Outputs | Yes/covered by API modes | Possible, không dùng production | Yes | **STRONG**, vẫn local-validate |
| Claude Sonnet 5 / Opus 4.8 | Yes, `output_config.format`, subset | Via structured output | Possible, không cần | Yes; `strict: true` | **STRONG**, kiểm tra unsupported schema keywords |
| Gemini 2.5 Pro / Flash | Yes, supported subset | MIME JSON/schema | Possible | Yes | **STRONG-PARTIAL**, semantic values vẫn có thể sai |
| Qwen3 weights | Không phải model-native API contract | Runtime-dependent | Yes | Model/runtime-dependent | **RUNTIME-DEPENDENT** |
| DeepSeek V4 Pro | Không được document cho final response | Yes, `json_object`; occasional empty content caveat | Required guidance/example | Yes; strict tool schema | **PARTIAL**, chưa đủ production gate |
| DeepSeek V3.2 weights | Runtime-dependent | Runtime-dependent | Yes | Có, trừ Speciale limitation | **RUNTIME-DEPENDENT** |
| Llama 3.x weights | Runtime-dependent | Runtime-dependent | Yes | Model/runtime integration | **RUNTIME-DEPENDENT** |
| Mistral Large 3 API | Yes, custom structured outputs | Yes | Possible | Yes | **STRONG**, vẫn local-validate |

### Không nhầm bốn lớp bảo đảm

1. **JSON syntax:** parse được.
2. **Schema shape:** required/type/enum/additional properties đúng.
3. **Referential integrity:** evidence refs nằm trong selected allowlist.
4. **Semantic entailment:** claim thực sự được evidence hỗ trợ.

Provider/native JSON Schema chủ yếu giải quyết lớp 1–2. UpgradeLens local trust layer giải quyết một phần lớp 3 và invented URL, nhưng [`src/metrics-engine.js`](../src/metrics-engine.js) hiện dùng `CLAIMS_DROPPED` như unsupported-claim proxy; nó chưa chứng minh semantic entailment lớp 4. Vì vậy không model nào được ghi “hallucination-safe” chỉ vì JSON Schema pass.

### Reliability order cho UpgradeLens

```text
Native final-response JSON Schema
    > runtime grammar-constrained JSON Schema
    > JSON mode/json_object
    > prompt-only JSON
```

Thứ tự này là về **format reliability**, không phải reasoning quality. Tool calling chỉ được dùng thay final response khi một contract mới cố ý thiết kế tool envelope; không được lén đổi candidate schema trong LR-00B.

## 7. Context Window Analysis

### Nhu cầu context thực tế

MVP-03 selector mặc định tối đa 12.000 evidence characters, cộng prompt, serialized schema, dependency/version facts, evidence metadata và output budget. Không có tokenizer-independent phép đổi chính xác character → token, đặc biệt với source code và tài liệu đa ngôn ngữ. Tuy vậy, contract hiện tại nằm trong **vài nghìn đến low tens-of-thousands tokens**, không gần 128K hay 1M.

Policy sizing đề xuất:

| Task | Minimum admission | Preferred operating window | Lý do |
| --- | ---: | ---: | --- |
| MVP-03 hiện tại | 32K | 64K | Đủ bounded evidence + schema + output headroom; phải đo token thực theo tokenizer trước request. |
| MVP-03 corpus lớn hơn | 64K | 128K | Cho thêm release evidence nhưng vẫn cần deterministic selection. |
| MVP-04 Impact Analysis | 128K | 256K+ | Source facts/snippets làm context tăng; retrieval/chunking vẫn bắt buộc. |
| MVP-05 Migration Planning | 128K | 256K+ | Cần release + impact + constraints; không dump toàn repository. |

### Phù hợp theo context

- **32K native đủ MVP-03:** Qwen3 8B/14B, nếu prompt thực tế được token-count và output budget có headroom.
- **128K class:** Llama 3.1/3.3; Qwen3 8B với YaRN. YaRN là profile khác và có thể làm giảm chất lượng short context; không bật chỉ để có con số lớn.
- **256K:** Mistral Large 3, phù hợp future impact bundle nhưng quá lớn để contributor-local.
- **400K:** GPT-5/GPT-5 mini, dư nhiều cho MVP-03.
- **~1M:** GPT-5.6 Sol, Sonnet 5, Opus 4.8, Gemini 2.5 Pro/Flash, DeepSeek V4. Con số này không tạo lợi thế thực tế cho MVP-03 bounded context.

### Context lớn nhưng reasoning yếu hơn / reasoning mạnh nhưng context nhỏ hơn

- Gemini 2.5 Flash có 1M context nhưng official positioning ưu tiên price-performance/latency; không được giả định reasoning ngang Pro.
- GPT-5 mini có 400K nhưng được position cho well-defined tasks; context không nâng nó thành quality ceiling.
- Qwen3 8B có thể extend 131K nhưng size model vẫn giới hạn synthesis/grounding; long context và reasoning là hai capability độc lập.
- Qwen3 14B native 32K có thể reasoning tốt hơn một model nhỏ context lớn trong bounded MVP-03; phải đo, không suy từ window.
- Không model bắt buộc nào vừa “reasoning mạnh nhưng context quá nhỏ” cho MVP-03 hiện tại; 32K đã là admission minimum hợp lý.

## 8. Hallucination Risk

### Bốn failure mode của UpgradeLens

| Failure | Ví dụ | Có bị schema bắt? | Control cần có |
| --- | --- | --- | --- |
| Invented migration step | “Run command X” dù evidence không nói | Không, nếu field/string hợp lệ | Cấm ở MVP-03; semantic eval ở MVP-05; step-level refs. |
| Invented API/config | Tạo tên method/flag nghe hợp lý | Không | Evidence entailment + source-impact facts + human review. |
| Invented evidence | Tạo digest/URL mới | Thường không ở provider schema; có thể đúng pattern | Local allowlist/ref and URL validation. |
| Over-confidence | `low`/`high` khi evidence thiếu/conflict | Không | `unknown`, deterministic downgrade/review, conflict fixtures. |

### Risk assessment theo family

| Family | Invented step/API/evidence/over-confidence risk | Bằng chứng và giới hạn |
| --- | --- | --- |
| GPT-5 / GPT-5.6 | MEDIUM residual | Official GPT-5 system card cho thấy cải thiện relative hallucination/instruction following, không chứng minh domain safety. |
| GPT-5 mini | MEDIUM-HIGH uncertainty | Smaller/cost model cho precise tasks; chưa có UpgradeLens evidence. Native schema chỉ giảm format failures. |
| Claude Sonnet/Opus | MEDIUM residual | System cards có factuality/hallucination tests; no evidence-ID/domain test. Opus intelligence không loại bỏ confident synthesis sai. |
| Gemini Pro | MEDIUM residual | Technical report có factuality/grounding; official structured-output docs vẫn yêu cầu semantic validation. |
| Gemini Flash | MEDIUM-HIGH uncertainty | Cost/latency-optimized so với Pro; 1M context không phải grounding proof. |
| Qwen3 8B/14B | HIGH until domain eval | Runtime grammar không constrain truth; official sampling guidance cho thấy output variability. 8B đặc biệt không nên dùng migration planning. |
| DeepSeek V4/V3.2 | MEDIUM-HIGH uncertainty | Strong general reasoning claims nhưng final schema/evidence fidelity chưa được document; V4 JSON mode có empty-output caveat. |
| Llama 3.x | HIGH until domain eval | No native final schema or evidence-ref test; Vietnamese ngoài supported list của 3.3. |
| Mistral Large 3 | MEDIUM-HIGH uncertainty | Native structured output và strong general profile, nhưng không có official domain grounding result. |

Không nên xếp hạng hallucination bằng benchmark tổng quát của nhà cung cấp vì dataset, tool access và prompting khác nhau. Risk hữu hiệu nhất là **post-trust unsupported claim rate trên golden cases của UpgradeLens**, cùng human annotation cho claims có ref hợp lệ nhưng không entailed.

Các control không phụ thuộc model:

- model chỉ thấy selected evidence; không browsing/tool retrieval;
- exact evidence ID allowlist;
- invalid refs/URLs bị drop, risk bị downgrade;
- conflict/stale/missing evidence bắt human review;
- source impact và migration plan bị cấm ở MVP-03;
- MVP-04/05 cần claim/step-level refs, không chỉ summary-level citation;
- retry không được tự đổi model hoặc bỏ schema.

## 9. Cost Analysis

Không dùng bảng giá chi tiết vì giá thay đổi. `LOW/MEDIUM/HIGH` dưới đây là total operating trade-off tương đối cho bounded text analysis, không phải báo giá.

| Deployment | Cost | Phù hợp | Trade-off |
| --- | --- | --- | --- |
| Qwen3 8B local trên máy contributor đã có | LOW marginal | Smoke, development | Không có token bill; tốn RAM, điện, thời gian; quality thấp hơn cần được chấp nhận rõ. |
| Qwen3 14B / 30B local | LOW-MEDIUM marginal | Development benchmark | Hardware fit/latency và quantization variability; không “free” nếu tính máy/ops. |
| Llama 3.3 70B server | MEDIUM-HIGH | OSS comparison/on-prem | Multi-GPU, deployment, observability; license custom. |
| DeepSeek V3.2 / Mistral Large 3 self-host | HIGH | Enterprise on-prem/privacy | Open weights nhưng 685B/675B total; capital và operations cao. |
| GPT-5 mini / Gemini 2.5 Flash / DeepSeek V4 API | LOW | Cost challenger/high volume | Cần chứng minh evidence fidelity; DeepSeek final schema yếu hơn. |
| GPT-5 / Gemini 2.5 Pro / Claude Sonnet 5 / Mistral Large 3 API | MEDIUM | Production shortlist | Balance tốt hơn quality ceiling models; provider/privacy dependency. |
| GPT-5.6 Sol / Claude Opus 4.8 | HIGH | Quality ceiling, MVP-04/05 hard cases | Reasoning mạnh hơn nhưng latency/token spend cao; có thể overkill cho MVP-03. |
| Enterprise cloud contract | HIGH | SLO, capacity, privacy/governance | Có support/ZDR/regional controls tùy vendor; procurement và lock-in cao hơn. |

### Local vs cloud vs enterprise

- **Local:** privacy và offline tốt nhất, marginal cost thấp nếu đã có hardware; nhưng contributor machines tạo nhiều model/quant/runtime profiles, làm quality comparison khó hơn.
- **Cloud:** time-to-value và frontier quality tốt; cost theo usage phù hợp MVP-03 bounded context. Cần pin identity, privacy policy, rate-limit/error handling và không gateway fallback.
- **Enterprise/on-prem:** hợp lý khi evidence tương lai chứa private source code hoặc compliance yêu cầu; chỉ đáng trả giá vận hành khi workload/privacy thực tế chứng minh nhu cầu.

Cost optimization order nên là: giảm evidence thừa bằng deterministic selection → chọn effort/output budget → caching/batch nếu contract cho phép → thử model tier rẻ hơn. Không chọn model yếu trước rồi bù bằng trust bypass.

## 10. Production Recommendation

### Kiến trúc đề xuất

```text
Contributor local smoke
    Qwen3 8B Q4
    via Ollama or LM Studio
            ↓ same local schema/trust validation

GPU development challenger
    Qwen3 14B quantized
    via vLLM
            ↓ capability conformance gate

Production benchmark
    Claude Sonnet 5
    GPT-5.6 Sol
    Gemini 2.5 Pro
    (+ Opus 4.8 for MVP-04/05 ceiling)
            ↓ UpgradeLens domain quality gate

Production runtime
    Cheapest pinned candidate that passes every hard gate
    direct provider or reproducibly pinned gateway route
            ↓
    local schema validation + trust validation
```

### Recommendation cụ thể

- **MVP-03 default benchmark leader:** Claude Sonnet 5, không phải default runtime đã quyết định. Lý do: native structured output, pinned model ID, document/reasoning capability và cost/latency balance.
- **MVP-03 quality ceiling:** GPT-5.6 Sol. Nếu không cải thiện material quality so với Sonnet/Pro trên UpgradeLens metrics thì không đáng cost premium.
- **MVP-03 cost candidate:** GPT-5 mini snapshot hoặc Gemini 2.5 Flash; promote chỉ khi hard gates ngang Tier A.
- **MVP-04/05 ceiling:** pair GPT-5.6 Sol + Claude Opus 4.8; Sonnet 5 là efficiency challenger.
- **OSS contributor default:** Qwen3 8B Q4 smoke; Qwen3 14B quantized development candidate. Không quảng bá local smoke như production equivalent.
- **Enterprise OSS:** Mistral Large 3 hoặc DeepSeek V3.2 chỉ sau capacity/privacy business case và domain benchmark trên exact serving stack.

Production không nên dùng auto-router/free-router, convenience alias có thể hot-swap, cross-model fallback hoặc silent downgrade structured output. Retry được phép cùng pinned model/provider/config; model change phải trở thành run mới và audit được.

## 11. Capability Policy

### Admission policy

Không phải model chạy được là model được benchmark. Một `VersionAnalysisCapabilityProfile/v1` phải khai báo và được conformance-check:

```text
task = versionAnalysis.v1
exactModelIdentity = required
minimumContextTokens = 32768
finalStructuredOutput = nativeJsonSchema | runtimeJsonSchema
schemaCompatibility = pass
fallback = disabled
toolRetrieval = disabled
usageAndFinishReason = observable
localSchemaValidation = required
localTrustValidation = required
```

`json_object` hoặc prompt-only JSON không đủ admission cho **production benchmark**. Có thể vào experimental Tier B nếu failure được fail-closed và không thay schema/prompt. Runtime JSON Schema phải ghi runtime/version/backend vì guarantee thuộc serving stack.

### Pre-benchmark conformance gate

Trước quality benchmark, exact deployment phải pass 100% các kiểm tra không đánh giá intelligence:

1. Pin/record exact model, provider/runtime version, quantization và config.
2. Candidate schema được endpoint chấp nhận, không silently bỏ keyword.
3. Required fields/enum/`additionalProperties: false` được enforce trên probe fixtures.
4. Refusal, empty output, truncation và invalid JSON fail rõ; không parse prose/regex recovery.
5. Fallback/routing tắt; actual model identity quan sát được.
6. Usage, latency, finish reason có thể thu thập; không log secret hoặc raw private evidence ngoài policy.
7. UpgradeLens local schema và trust validation luôn chạy, kể cả provider nói “strict”.

### Quality gate

Giữ thresholds đã có trong [`src/ai-scorecard.js`](../src/ai-scorecard.js), không sửa evaluation trong task này:

| Metric | Hard gate |
| --- | ---: |
| Risk classification accuracy | ≥ 0,90 |
| Human review accuracy | ≥ 0,95 |
| Human review reason accuracy | ≥ 0,95 |
| Evidence reference accuracy | ≥ 0,95 |
| Evidence reference coverage | ≥ 0,95 |
| Unsupported claim rate proxy | ≤ 0,05 |
| Validation pass rate | ≥ 0,98 |
| Deterministic pass rate | = 1,00 |

Production promotion nên chặt hơn benchmark admission:

- mọi hard gate pass trên toàn bộ corpus và từng critical slice: breaking change, deprecation, missing evidence, conflict, stale source, declared constraint, npm/PyPI, multilingual;
- zero invented evidence ID/URL trong release candidate set;
- human review semantic audit cho claims có valid ref nhưng không entailed;
- repeated-run stability trên pinned config; risk/ref variance phải dưới ngưỡng được định nghĩa trước;
- p95 latency/cost/SLO pass sau quality, không dùng weighted average để che hard-gate failure.

Model rẻ hơn chỉ thắng khi pass tất cả hard gates; không bù hallucination bằng latency/cost score.

## 12. Future-proof Strategy

### Capability-first, protocol-first

```text
Version Analysis task contract
        ↓
Capability Profile + Admission Gate
        ↓
AiRuntime
        ↓
Protocol/Provider Adapter
        ↓
Pinned Deployment Profile
        ↓
LLM endpoint or local weights
        ↓
Local Schema Validation
        ↓
Trust Validation
        ↓
Version Analysis Manifest
```

Không thiết kế:

```text
GPT/Claude/Gemini-specific prompt
        ↓
Version Analysis
```

### Stable abstractions

- **Task contract** sở hữu semantics: inputs, evidence boundary, allowed claims, output schema, prompt version và trust rules.
- **Capability profile** mô tả yêu cầu (`finalJsonSchema`, minimum context, pinned identity, no fallback), không chứa tên vendor.
- **Deployment profile** mô tả model ID/revision, provider/runtime, quantization, reasoning mode, context và sampling. Cùng weights trên Ollama và vLLM là hai profiles khác nhau.
- **Protocol adapter** chỉ map transport/request/response/usage/error. Nó không chọn target version, sửa evidence, normalize semantic claims hoặc bypass trust.
- **Capability registry** là dữ liệu được tạo từ official documentation + conformance results; không hard-code `if model === ...` trong Version Analysis core.
- **Evaluation/benchmark** quyết định promotion; official model card chỉ quyết định shortlist/admission.

### Upgrade strategy

1. Alias mới không tự động thay production model. Tạo deployment profile mới.
2. Chạy documentation/conformance review; schema/API behavior có thể thay dù family name giống nhau.
3. Chạy cùng versioned golden dataset và prompt/schema version hiện hành.
4. So sánh hard gates trước cost/latency; không fallback giữa candidates trong một run.
5. Promote có versioned decision record; rollback về profile cũ không đổi core contract.
6. Requalify khi provider đổi model ID, tokenizer, thinking defaults, structured-output semantics hoặc deprecation policy.

### Final discovery decision

UpgradeLens nên phụ thuộc vào **capability + conformance + measured domain quality**, không phụ thuộc model name. Cloud frontier models là production candidates; Qwen3 là contributor-local reference; tất cả output vẫn đi qua cùng local schema/trust boundary. Cách này cho phép thay GPT-5.6, Claude Sonnet/Opus, Gemini, Mistral hoặc model tương lai mà không đổi deterministic facts, prompt semantics, public schema hay downstream trust contract.

### Validation statement

- Chỉ thêm tài liệu này.
- Không sửa production code.
- Không thay đổi runtime.
- Không thay đổi prompt.
- Không thay đổi schema.
- Không thay đổi trust layer hoặc CLI.
- Không thay đổi benchmark.
- Không thay đổi evaluation.
- Không gọi model hoặc API model; không dùng API key; không cài SDK.
- Không chạy test suite vì không có thay đổi executable.
- Không có secret/API key trong tài liệu.
- `git diff --check` phải pass trước khi handoff.
