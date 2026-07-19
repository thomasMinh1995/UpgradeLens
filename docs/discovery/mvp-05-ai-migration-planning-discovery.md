# MVP-05 AI Migration Planning Discovery

## 1. Executive Summary

**Verdict: GO WITH REDUCED SCOPE.**

UpgradeLens hiện trả lời khá tốt câu hỏi “dependency nào có breaking change được dẫn chứng, và breaking change đó có trùng với symbol JavaScript/TypeScript đang dùng hay không?”. Hệ thống chưa trả lời được câu hỏi tiếp theo ở mức hữu dụng cho triển khai: “developer cần kiểm tra hoặc thay đổi gì, dựa trên hướng dẫn chính thức nào?”. Khoảng trống sản phẩm này là có thật và đủ giá trị để mở một MVP riêng.

Tuy nhiên, implementation hiện tại chưa đủ dữ liệu cho **AI Migration Planning đầy đủ**. `Version Analysis` chỉ lưu finding dạng free text, không có `affectedSymbols`, replacement API, prerequisite hoặc migration action có cấu trúc ([`AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA`](../../src/ai-version-analysis.js#L39), [`finding`](../../schemas/version-analysis.schema.json#L239)). `Repository Impact` suy ra symbol bằng exact lexical match trên chính free-text summary và chỉ trả vị trí ở mức file ([`matchFindingToUsage`](../../src/impact/matcher.js#L26), [`symbolMatch`](../../schemas/repository-impact.schema.json#L105)). VinGrade validation cũng cho thấy 42 kết quả có risk `unknown`, 46/47 occurrences cần human review, Python chưa có Usage Analyzer, và positive `IMPACTED` path chưa được kiểm chứng bằng real-provider output ([`docs/IA-05-Real-Provider-Validation.md`](../IA-05-Real-Provider-Validation.md#L113)).

MVP được khuyến nghị là **Evidence-Grounded Migration Checklist**, không phải autonomous plan. Deterministic code phải quyết định eligibility, join artifact, giữ identity/version/status, chọn refs hợp lệ, copy symbol/file đã xác nhận và fail closed. AI chỉ được viết lại hoặc nhóm những hướng dẫn migration đã tồn tại trong selected official/publisher evidence thành checklist draft có step-level references. Mọi AI-authored step bắt buộc human review.

Không nên hỗ trợ trong MVP này: dependency upgrade ordering, inferred prerequisites, generated code examples, patches, rollback plans, effort estimates, numeric confidence hoặc tuyên bố `NOT_IMPACTED` đồng nghĩa với “safe to upgrade”.

**MP-01 có thể bắt đầu ngay** để định nghĩa contract và grounding policy. Chưa nên bắt đầu generator trước khi contract, eligibility rules và task-specific evaluation gates được chốt.

## 2. Current UpgradeLens Capabilities

### 2.1 Capability thực tế

| Câu hỏi | Trạng thái | Bằng chứng implementation | Giới hạn tin cậy |
| --- | --- | --- | --- |
| Dependency nào có breaking change? | **Đã hoạt động** cho occurrence đủ baseline, target và evidence | [`analyzeDependencyAiContext`](../../src/ai-version-analysis.js#L393) gọi provider-neutral runtime; finding taxonomy có `breakingChange`, `deprecation`, `compatibility` trong [`AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA`](../../src/ai-version-analysis.js#L39). | Finding là AI inference dạng free text. Missing baseline/target/evidence tạo `skipped`, không tạo claim. Range declaration thường để delta/risk `unknown`. |
| Breaking change dựa trên evidence nào? | **Đã hoạt động ở mức reference/provenance** | Mỗi finding có `evidenceRefs`; [`trustValidateAiVersionAnalysisCandidate`](../../src/ai-version-analysis.js#L250) allowlist selected evidence IDs, loại finding không còn ref hợp lệ và chặn URL ngoài context. Public result giữ evidence metadata trong [`version-analysis.schema.json`](../../schemas/version-analysis.schema.json#L207). | Ref hợp lệ chứng minh source đã được chọn, chưa chứng minh semantic entailment. Existing `unsupportedClaimRate` chỉ là proxy dựa trên `CLAIMS_DROPPED`, không phải entailment proof ([`metricsFromReport`](../../src/metrics-engine.js#L111), [`ai-runtime-governance-discovery.md`](../ai-runtime-governance-discovery.md#L395)). |
| Dependency/symbol có được dùng trong repository không? | **Đã hoạt động cho JS/TS; chưa tồn tại cho Python/Java/Go/Rust** | Plugin registry dispatch theo ecosystem/extension trong [`createUsageAnalyzerRegistry`](../../src/usage/analyzer-registry.js#L29). Default registry chỉ đăng ký [`createJavaScriptUsageAnalyzer`](../../src/usage/runtime.js#L40). JS analyzer theo dõi binding references, shadowing, re-export và dynamic import trong [`analyzeJavaScriptUsage`](../../src/usage/js/analyzer.js#L180). | “Không có trong Usage Index” không phải repository-wide proof khi project/language chưa có analyzer. VinGrade xác nhận `DEPENDENCY_NOT_USED` sai về lý do đối với một số Python package dù kết luận sampled non-impact tình cờ đúng ([`IA-05`](../IA-05-Real-Provider-Validation.md#L154)). |
| File/vị trí nào có khả năng bị ảnh hưởng? | **Đã hoạt động nhưng chỉ là candidate file** | [`matchFindingToUsage`](../../src/impact/matcher.js#L26) exact-match symbol trong finding summary với Usage Index; Impact Evidence trả `matchedSymbols[].usages[].file` trong [`repository-impact-evidence.schema.json`](../../schemas/repository-impact-evidence.schema.json#L118). | Không có line, call site, member chain đầy đủ, snippet hay data/control flow. File chỉ là nơi imported symbol có reference; không chứng minh code path thực tế bị breaking change tác động. |
| Kết quả skipped có bị trình bày như non-impact không? | **Đã hoạt động ở presentation layer** | [`impactStatus`](../../src/renderers/impact-presentation.js#L94) đổi mọi version result khác `analyzed` thành `NOT_ANALYZED`; view model đánh dấu run `INCOMPLETE` nếu có kết quả này ([`buildImpactPresentationViewModel`](../../src/renderers/impact-presentation.js#L117)). | `Repository Impact Evidence` nội bộ vẫn có reason `DEPENDENCY_NOT_USED` khi không có usage record; consumer mới phải join Version Analysis status, không được đọc reason code đơn lẻ. |
| Hệ thống đã đưa ra migration action cụ thể chưa? | **Chưa tồn tại** | Prompt hiện cấm migration plan ([`buildVersionAnalysisPrompt`](../../src/ai-version-analysis.js#L219)); `nextAction` chỉ là enum điều hướng coarse-grained như `collectEvidence`, `reviewBeforeImpactAnalysis` ([`version-analysis.schema.json`](../../schemas/version-analysis.schema.json#L349)); Markdown report chỉ render status, finding, reason, symbol và file ([`renderMarkdownReport`](../../src/renderers/markdown.js#L56)). | Không có action, prerequisite, replacement API, command, validation step, rollback hoặc plan artifact. |

### 2.2 Capability mới chỉ có contract hoặc architectural seam

- Provider-neutral `AiRuntime.generateStructured()` và stable task request shape đã có trong [`src/ai-runtime.js`](../../src/ai-runtime.js#L1). Đây là seam có thể reuse, không phải Migration Planning implementation.
- Usage Analyzer registry đã multi-language-ready về interface, nhưng default runtime chỉ có JS/TS analyzer. Các analyzer Python/Java/Go/Rust là **not evidenced in repository**.
- Knowledge Evidence có `migrationGuide` kind ([`knowledge-evidence-bundle.schema.json`](../../schemas/knowledge-evidence-bundle.schema.json#L91)), nhưng không có structured migration instruction contract.
- Governance documentation dự kiến task ID `migration-planning.v1`, nhưng task-specific schema, dataset, metrics và qualification chưa tồn tại; tài liệu tự đánh dấu MVP-05 chỉ là `EXPERIMENTAL` cho đến khi có chúng ([`ai-runtime-governance-discovery.md`](../ai-runtime-governance-discovery.md#L412)).
- README mô tả migration planning là hướng tương lai, không phải capability hiện hành. Fixed pipeline chỉ có bảy stage và kết thúc ở Markdown Report ([`ANALYSIS_STAGES`](../../src/orchestration/pipeline.js#L1)).

## 3. Product Gap

### 3.1 UpgradeLens đang trả lời “rủi ro gì?”

Với một occurrence đủ điều kiện, hệ thống có thể cung cấp:

1. declared/current/target facts và mức chắc chắn của baseline;
2. evidence-grounded release findings;
3. breaking findings còn sống sau trust validation;
4. exact lexical symbol match với JS/TS usage;
5. candidate files và lý do deterministic;
6. trạng thái `IMPACTED`, `NOT_IMPACTED` hoặc `NOT_ANALYZED` ở report layer.

### 3.2 Hệ thống chưa trả lời “developer làm gì tiếp theo?”

Các dữ liệu sau **not evidenced in repository** dưới dạng operational migration output:

- action được trích từ official guide cho từng finding;
- replacement API/configuration có cấu trúc;
- prerequisite và dependency graph để sắp xếp upgrade;
- câu lệnh build/test/validation đã xác minh;
- before/after code example phù hợp exact source/target version;
- rollback procedure gắn với deployment/package-manager state;
- effort estimate đã calibrated;
- completion/verification state cho từng step.

Khoảng trống này đủ lớn cho một MVP vì report hiện buộc developer tự quay lại source evidence, tự tìm action và tự chuyển finding thành checklist. Tuy nhiên, phần giá trị gần nhất không đòi hỏi một “planner” tự do: report có thể liên kết official evidence, deterministic logic có thể dựng skeleton, và AI chỉ cần chuyển official instructions thành draft checklist.

Vì vậy:

- chỉ cải thiện report/official links (phương án C) tạo giá trị nhanh nhưng vẫn để developer tự tổng hợp;
- full AI plan (phương án A) vượt xa độ sẵn sàng input;
- reduced checklist (phương án B) lấp đúng khoảng trống có thể kiểm chứng;
- upstream improvements (phương án D) vẫn cần song song trước khi mở rộng checklist thành full plan.

## 4. Input Artifact Readiness

### 4.1 Đánh giá từng artifact

| Artifact | Dữ liệu dùng được | Thiếu / nullable / unreliable | Fact, inference và lineage |
| --- | --- | --- | --- |
| `project-manifest.json` | Repository/project identity, ecosystem, languages, package manager, manifest, dependency type/name và declared version ([`project-manifest.schema.json`](../../schemas/project-manifest.schema.json#L121)). | `declaredVersion` nullable; không có installed/resolved version, dependency graph, scripts/test commands, runtime/deployment constraints hay transitive inventory. Lockfile chỉ có thể giúp detector nhận package manager, không được parse thành dependency baseline. | Chủ yếu deterministic source facts. Artifact có schema/invariants; là lineage root. |
| `knowledge-manifest.json` | Package identity, occurrences, registry-designated latest, release index, official/publisher sources, trust, freshness và conflicts ([`knowledge-manifest.schema.json`](../../schemas/knowledge-manifest.schema.json#L311), [`source`](../../schemas/knowledge-manifest.schema.json#L474)). | `latest` có thể null; publication/deprecation metadata nullable; chỉ npm/PyPI package contracts; không có structured migration action. `latest` là registry fact, không phải recommended target. | Registry/source facts với provenance. Knowledge input lineage truy về exact Project Manifest digest. |
| `knowledge-evidence-bundle.json` | Bounded text, kind gồm `migrationGuide`, content digest, locator, release versions và source ID ([`evidenceItem`](../../schemas/knowledge-evidence-bundle.schema.json#L102)). | Text có thể broad, unversioned hoặc thiếu action; không có structured API replacement, prerequisite, command, code block semantics hay section range. Source discovery là bounded heuristic: tối đa năm source candidates và có thể thử repository-head `CHANGELOG.md`/`MIGRATION.md` ([`src/evidence-source-adapter.js`](../../src/evidence-source-adapter.js#L9), [`discoverEvidenceSourceRequests`](../../src/evidence-source-adapter.js#L179)). | Content/provenance là fact; ý nghĩa migration cần extraction/inference. Bundle lineage có exact Knowledge Manifest digest/research ID, nhưng chưa có step-level consumer refs. |
| `version-analysis.json` | Occurrence identity, analysis status, baseline/target/delta, release findings, evidence refs, evidence metadata, coverage/validation/human-review state ([`result`](../../schemas/version-analysis.schema.json#L291)). | `currentVersion` và `targetVersion` nullable; range baseline tạo unknown delta; target mặc định là registry latest fact; finding thiếu `affectedSymbols`, replacement API, migration action và prerequisites. `affectedSymbols` là **not evidenced in repository**. | Dependency/version fields deterministic; summaries/findings/risk là AI inference đã qua syntactic/ref guardrails. Manifest lineage giữ exact Project/Knowledge/Evidence digests. |
| `usage-index.json` | Deterministic dependency → symbol → files, analyzer IDs, scan counts và warnings ([`buildUsageIndex`](../../src/usage/usage-index.js#L127)). | Không line number, span, snippet, usage kind, call graph hoặc full API/member path. Chỉ JS/TS analyzer tồn tại; analyzer metadata trong artifact không biểu diễn coverage theo từng project/language. | Positive usage record là static-analysis fact trong supported scope. Absence ngoài supported scope không phải non-use fact. Exact Project/Version digests được kiểm tra bởi [`loadUsageDiscoveryInputs`](../../src/usage/input-loader.js#L86). |
| `repository-impact.json` | Mọi breaking finding, impacted flag, exact matched symbol và candidate files; deterministic sorting/invariants ([`buildRepositoryImpact`](../../src/impact/repository-impact.js#L129)). | Chỉ xét `breakingChange`; loại `default`/`*`; matcher case-sensitive exact lexical search trên free-text summary. Finding impact không giữ Version Analysis `evidenceRefs`. Không có line/snippet hoặc semantic use proof. | `impacted` là deterministic **inference** từ lexical coincidence, không phải semantic fact. Input lineage khóa Project/Version/Usage digests. |
| `repository-impact-evidence.json` | Stable evidence ID cho mỗi impact finding, reason code, matched symbol và file ([`buildRepositoryImpactEvidence`](../../src/impact-evidence/repository-impact-evidence.js#L168)). | Không chứa upstream version evidence refs/content; không phân biệt language coverage trong `DEPENDENCY_NOT_USED`; vẫn không có line/snippet. Consumer phải join Version Analysis và Knowledge Evidence Bundle. | Deterministic explanation của matcher, không phải proof rằng upgrade an toàn. Loader recompute matches và kiểm tra exact input lineage trong [`validateReferences`](../../src/impact-evidence/input-loader.js#L81). |

### 4.2 Các câu hỏi readiness bắt buộc

- **Structured `affectedSymbols`: chưa có.** Symbol được phát hiện ngược bằng cách tìm tên Usage Index trong finding summary.
- **Impact matcher còn lexical:** có, [`summaryContainsExactSymbol`](../../src/impact/matcher.js#L17) dùng Unicode-boundary regex và không semantic/fuzzy match.
- **Affected files thực tế:** chưa. Artifact chỉ xác nhận file có reference tới imported symbol trùng tên; gọi đây là *candidate affected file* là chính xác hơn.
- **Evidence đủ đề xuất code change:** đôi khi có thể chứa official migration instruction, nhưng không được đảm bảo hoặc cấu trúc hóa. Không đủ cho generated code/patch nói chung.
- **Target version và migration path:** target có thể biết chính xác nếu explicit hoặc registry latest, nhưng current thường unresolved; release interval chỉ đáng tin ở `exactBaseline`. Registry latest không phải recommended target, và không có multi-hop migration path/prerequisite graph.
- **Lineage:** đủ mạnh để truy exact input artifact bytes xuyên pipeline. Chưa có lineage contract từ một migration step tới `findingId` + `evidenceRef` + `impactEvidenceId`, vì output đó chưa tồn tại.

### 4.3 Kết luận readiness

Input **đủ cho một checklist giới hạn và fail-closed**, nếu mỗi repository-specific item chỉ dùng positive exact matches và mỗi AI-authored instruction chỉ dùng selected official/publisher evidence. Input **không đủ cho full migration plan**, đặc biệt với negative impact conclusions, polyglot repositories, ordering, code generation và rollback.

## 5. AI Suitability Analysis

| Responsibility | Phân loại khuyến nghị | Lý do và boundary |
| --- | --- | --- |
| Sắp xếp dependency upgrade order | **Chưa nên hỗ trợ** | Không có dependency/transitive graph, compatibility constraints hay prerequisite model. AI ordering sẽ là unsupported inference. Deterministic topological order cũng chưa thể tính. |
| Xác định prerequisite | **AI-generated, bắt buộc human review**, chỉ khi official evidence nói rõ | Deterministic layer phải giữ nguyên evidence refs và không tự suy ra prerequisite. Nếu evidence không explicit, output phải là `not available`, không được đoán. |
| Nhóm breaking changes | **Deterministic** | Có thể nhóm theo project/package/finding kind/target/evidence ID bằng identity sẵn có. AI không cần thiết cho grouping; chỉ có thể tạo display label không mang fact mới. |
| Đề xuất migration steps | **AI-generated, bắt buộc human review** | AI phù hợp để paraphrase bounded official instructions thành checklist ngắn. Không được tạo step khi evidence chỉ mô tả change mà không nêu action. |
| Đề xuất file/symbol cần sửa | **Deterministic** | Chỉ copy positive `matchedSymbols` và `usages.file` từ Impact Evidence. AI không được thêm/xóa/đổi location. Phải gọi đây là candidate review location. |
| Tạo code example | **Chưa nên hỗ trợ** | Exact source context, types, framework configuration và structured before/after examples không có trong artifacts. Version-correct example không thể bảo đảm. |
| Tạo patch tự động | **Chưa nên hỗ trợ** | Pipeline không đọc lại source sau IA-01 và không có semantic edit/compile/test loop. Patch vượt xa trust boundary. |
| Tạo validation checklist | **Deterministic + AI-assisted** | Deterministic skeleton có thể yêu cầu review exact finding/symbol/file và xác nhận project tests. AI chỉ được thêm official verification instruction có evidence ref; không bịa command. |
| Tạo rollback plan | **Chưa nên hỗ trợ** | Không có deployment state, package transaction, data migration hoặc rollback evidence. “Pin previous version” cũng có thể sai với schema/data migrations. |
| Ước lượng effort | **Chưa nên hỗ trợ** | Không có calibrated history, code complexity/call-site count hoặc organization context. Numeric estimate sẽ tạo false precision. |
| Đánh giá confidence | **Deterministic, không dùng AI score** | Giữ categorical facts như evidence coverage, validation status, source freshness/conflict, version certainty và analyzer coverage. Không sinh numeric confidence từ self-report của model. |

### Recommended responsibility split

**Deterministic layer** chịu trách nhiệm:

- validate schema, exact-byte lineage và cross-artifact identities;
- classify `eligible`, `not analyzed`, `unsupported coverage`, `no grounded action`;
- select only package/version-relevant official or publisher evidence;
- preserve target/current uncertainty and all human-review reasons;
- copy finding IDs, evidence IDs, exact positive symbol/file matches;
- generate stable IDs, stable ordering, limits và safe fallback records;
- reject unknown refs/URLs/locations and fields outside contract.

**AI layer** chỉ chịu trách nhiệm:

- paraphrase explicit official migration instruction thành concise checklist text;
- optionally merge duplicate instructions that share the same package, target and evidence basis;
- state unresolved questions in a dedicated review field, never resolve them by guessing.

**Human reviewer** phải approve mọi AI-authored instruction và quyết định code change, upgrade order, test command, rollout và rollback.

## 6. Trust and Hallucination Risks

| Failure mode | Vì sao hiện có thể xảy ra | Minimum guardrail |
| --- | --- | --- |
| Bịa replacement API/flag/command | Existing validator chỉ allowlist evidence refs/URLs; một câu sai vẫn có thể cite ref hợp lệ. | MVP output không có generated code/command fields. Drop AI step không có explicit official instruction; task eval đo invented API/command rate. |
| Bịa file hoặc affected symbol | Model có thể suy ra từ package conventions. | Location fields do deterministic join copy từ positive Impact Evidence; model không được emit location identities. |
| Đề xuất change không có evidence | Finding ref không tự chứng minh action. | Mỗi AI step cần ít nhất một selected evidence ID, `findingId`, claim type và human-review flag; missing/invalid ref làm drop toàn step. |
| Suy luận sai upgrade order/prerequisite | Không có dependency graph hoặc structured prerequisite. | Không hỗ trợ ordering. Chỉ giữ deterministic display order; prerequisite chỉ được paraphrase nếu evidence explicit. |
| Bỏ qua transitive dependency | Project Manifest inventory là declared dependencies, không có resolved transitive graph. | Nêu limitation ở artifact/report; không tuyên bố plan complete cho transitive graph. |
| Code snippet không đúng version/repository | Không có source spans/type/config context; current version thường unresolved. | Không generate code snippet/patch trong MVP. Official code example chỉ được link tới evidence, không biến thành repo-specific edit. |
| Biến `NOT_IMPACTED` thành “safe to upgrade” | Exact matcher có false-negative surface và JS/TS-only coverage. | Không sinh safety claim. `NOT_ANALYZED` blocks; `NOT_IMPACTED` chỉ có nghĩa “không có exact supported-scope match”. |
| Trình bày inference như fact | Version finding là AI inference; impact là lexical inference. | Mỗi output field có `basis`/status rõ: upstream fact, deterministic match, AI-authored instruction. Renderer giữ wording “candidate/review”, không “must change” nếu chưa được evidence xác nhận. |
| Dùng registry latest như recommendation | CLI hiện chọn `registryLatest` làm target fact. | Report target policy rõ ràng; không gọi latest là recommended version. Full target selection ngoài scope. |
| Python absence bị hiểu là dependency không dùng | Default registry chỉ có Node analyzer. | Repository-specific checklist chỉ dựa positive usage match. Negative conclusion cần explicit analyzer coverage; nếu không có, emit `UNSUPPORTED_USAGE_COVERAGE`. |
| Provider output không được task-qualified | Evaluation hiện gọi trực tiếp `analyzeDependencyAiContext` và schema MVP-03 ([`runEvaluation`](../../src/evaluation-runner.js#L193)). | Tạo migration-specific golden dataset, comparator, metrics và qualification record trước production enablement. MVP-03 qualification không được kế thừa tự động. |

### Điều kiện tối thiểu để một checklist item được coi là evidence-grounded

Một item chỉ được publish khi đồng thời thỏa:

1. mọi input artifact hợp lệ, cùng lineage và đúng package/project occurrence;
2. Version Analysis result là `analyzed`, không `invalid`, có non-null target và finding còn tồn tại;
3. item trỏ tới exact `analysisResultId`, `findingId` và ít nhất một upstream `evidenceRef` có trong selected context;
4. evidence source thuộc official/publisher allowlist, không stale/conflicted nếu policy không cho phép review-only output;
5. action được evidence nói rõ; chỉ “breaking change exists” không đủ để tạo migration action;
6. repository location, nếu có, phải trỏ tới exact positive `impactEvidenceId`/matched symbol/file; AI không tạo location;
7. URLs chỉ được copy từ Knowledge source metadata; không nhận URL từ model;
8. item ghi rõ AI-authored, `requiresHumanReview: true` và không được renderer nâng thành fact;
9. thiếu action evidence phải tạo deterministic `NO_GROUNDED_ACTION`/`MANUAL_REVIEW_REQUIRED`, không gọi AI để lấp khoảng trống;
10. output vượt schema, ref allowlist hoặc content policy phải bị drop/fail closed và để lại limitation code.

## 7. Alternative Options

| Phương án | User value | Input readiness | Complexity | Hallucination risk | Testability | Open-source demo | Multi-ecosystem |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A. Full AI Migration Planning ngay** | Cao nếu đúng, nhưng dễ tạo false confidence | **Thấp**: thiếu structured actions, graph, source spans, resolved baselines | Cao | **Rất cao** | Thấp; correctness/order/patch khó oracle | Hấp dẫn bề ngoài nhưng một sai API làm giảm trust mạnh | Thấp; Usage chỉ JS/TS và ecosystem semantics khác nhau |
| **B. Evidence-Grounded Migration Checklist** | **Cao và tập trung**: chuyển finding thành next-review actions | **Trung bình**: đủ evidence/ref/positive location cho bounded cases | Trung bình | Trung bình, có thể giảm bằng excluded fields + fail closed | **Cao** với step refs, invented-token cases và golden official instructions | **Tốt**: demo minh bạch “source → finding → checklist → file” | Khá tốt cho dependency-level instructions; location phụ thuộc analyzer coverage |
| **C. Report + official migration references** | Trung bình; giảm navigation cost nhưng developer vẫn tự tổng hợp | **Cao** | Thấp | Thấp | Rất cao | Tốt nhưng ít khác biệt sản phẩm | Cao nếu chỉ render source metadata |
| **D. Defer, cải thiện Version/Impact trước** | Giá trị migration bị chậm; tăng precision dài hạn | Không áp dụng | Trung bình–cao upstream | Thấp trong ngắn hạn | Cao | Demo ít tiến triển về end-to-end user action | Tốt nếu ưu tiên analyzer/lockfile contracts |

**Recommendation:** chọn B, dùng C làm deterministic fallback/presentation. Không chọn A. Không cần defer toàn bộ MVP-05, nhưng mọi capability tiến gần code change/order/rollback phải chờ D hoàn thành các prerequisite tương ứng.

## 8. Recommended MVP Boundary

### 8.1 Tên và mục tiêu

**MVP-05 — Evidence-Grounded Migration Checklist**

Mục tiêu: từ artifacts hiện có, tạo một checklist review có thể truy vết cho từng analyzed breaking finding; với positive exact usage match, đính kèm candidate symbols/files; với explicit official migration instruction, AI có thể tạo concise draft action bắt buộc human review.

### 8.2 Conceptual runtime flow

```text
Validated immutable artifacts
        ↓
Deterministic lineage + eligibility + context builder
        ↓
Bounded official/publisher evidence + exact finding/impact refs
        ↓
Provider-neutral structured AI draft (eligible contexts only)
        ↓
Task-specific trust validator and deterministic normalization
        ↓
Migration Checklist artifact
        ↓
Presentation-only Markdown/console section
```

Pipeline phải reuse [`AiRuntime`](../../src/ai-runtime.js#L27) nhưng dùng task/schema/prompt riêng, không mở rộng prompt MVP-03. Existing stages và artifacts không bị sửa logic.

### 8.3 Conceptual inputs

MVP đọc, không mutate:

- Project Manifest: occurrence/project/ecosystem facts;
- Knowledge Manifest: source authority, trust, URLs, freshness/conflict;
- Knowledge Evidence Bundle: exact evidence content;
- Version Analysis: target/baseline status, findings và evidence refs;
- Usage Index: supported positive usage facts;
- Repository Impact: deterministic match result;
- Repository Impact Evidence: stable match explanation/location.

Đọc đủ bảy artifacts là cần thiết: Impact artifacts hiện không giữ upstream evidence refs/content, còn Version Analysis không giữ evidence content.

### 8.4 Conceptual output

Output artifact ở mức khái niệm gồm:

- schema/generator/generated-at và exact input digests;
- overall completeness (`COMPLETE`, `INCOMPLETE`, `NO_GROUNDED_ACTION`), không có “safe” status;
- dependency occurrence identity, source/target facts và uncertainty;
- finding records với `analysisResultId`, `findingId`, upstream evidence refs;
- checklist items với stable ID, constrained kind, instruction text, basis, evidence refs, optional positive impact-evidence/location refs, limitations và mandatory review state;
- deterministic records cho `NOT_ANALYZED`, unsupported usage coverage và missing action evidence.

Đây không phải production schema proposal; field names chỉ mô tả boundary discovery.

### 8.5 Included

- official/publisher evidence-linked review checklist;
- deterministic grouping theo occurrence/finding;
- exact positive JS/TS symbol/file candidate locations;
- preservation of unknown/skipped/conflict/stale/human-review states;
- provider-neutral structured generation;
- report rendering không thêm business inference.

### 8.6 Explicit exclusions

- automatic target recommendation;
- cross-dependency ordering;
- inferred prerequisites không có official evidence;
- source rescanning/parsing trong planning stage;
- code examples, patches hoặc auto-fix;
- shell/package-manager commands do AI tạo;
- migration execution, test execution hoặc source modification;
- rollback plan;
- effort/severity/numeric confidence scoring;
- transitive dependency coverage claims;
- `NOT_IMPACTED` → safe-to-upgrade claim.

## 9. Proposed Tasks

Tối đa năm implementation tasks, theo thứ tự:

### MP-01 — Checklist Contract and Grounding Policy

Định nghĩa versioned conceptual/production contract, status taxonomy, constrained item kinds, step-level refs, lineage/invariants, eligibility matrix và explicit exclusions. Chốt semantics cho `NOT_ANALYZED`, `NOT_IMPACTED`, unsupported analyzer coverage và `NO_GROUNDED_ACTION` trước khi có prompt.

### MP-02 — Deterministic Context and Eligibility Runtime

Load/validate bảy artifacts, kiểm tra cross-artifact lineage/identity, join finding → source evidence → impact evidence, select bounded official/publisher content, và dựng immutable task context. Không gọi AI cho ineligible context.

### MP-03 — Provider-Neutral Generator and Trust Validation

Tạo task-specific prompt/schema dùng existing `AiRuntime`; chỉ cho model emit constrained instruction/review-question text và upstream refs. Implement allowlist, invented URL/ref/location rejection, no-action fallback, deterministic IDs/sort và mandatory human-review policy.

### MP-04 — Migration-Specific Evaluation and Qualification

Tạo golden datasets Node/Python/generic cho explicit action, missing action, stale/conflict, wrong ref, invented API/command, skipped result, positive impact và unsupported coverage. Metrics tối thiểu: step evidence-reference precision/coverage, unsupported/invented action rate, location preservation, eligibility correctness, schema/deterministic post-processing pass rate và human-review correctness. Qualification phải task-scoped `migration-planning.v1`.

### MP-05 — Orchestration and Presentation

Thêm stage sau Impact Evidence chỉ khi MP-04 gates đạt; render checklist + official refs + limitations, không tính lại business data. Pipeline fail-stop theo [`runAnalysisPipeline`](../../src/orchestration/pipeline.js#L27), đồng thời có package-local safe records cho ineligible findings theo contract MP-01.

## 10. Acceptance Criteria

MVP reduced scope chỉ đạt khi:

1. loader từ chối schema/lineage/identity mismatch trước model invocation;
2. `skipped`/`failed` Version Analysis không sinh migration action và được trình bày `NOT_ANALYZED`/incomplete;
3. mỗi AI-authored item có valid `analysisResultId`, `findingId`, selected evidence refs và `requiresHumanReview`;
4. mỗi repository-specific location khớp byte-for-byte với positive Impact Evidence symbol/file; model không sở hữu location field;
5. không có evidence instruction thì sinh deterministic no-action/manual-review record, không có generic guessed step;
6. output không có generated API replacement, code, patch, shell command, upgrade order, rollback hoặc effort/confidence score;
7. URL chỉ đến từ validated Knowledge source metadata; unknown evidence/URL/location làm item bị drop hoặc context fail closed;
8. target policy và nullable/unknown current baseline được hiển thị trung thực; `registryLatest` không được gọi là recommendation;
9. negative usage không được dùng làm safety proof nếu analyzer coverage không explicit; Python hiện phải mang coverage limitation;
10. post-processing, IDs, sorting và serialization deterministic với cùng validated input và cùng candidate output. Không tuyên bố live model text deterministic;
11. fake-runtime/unit/golden tests cover success, missing evidence, conflict/stale, invented ref/URL/API/command, not-analyzed, not-impacted, positive impact và multi-ecosystem contexts;
12. task-specific evaluation gates được chốt và pass trước khi default CLI orchestration enable stage;
13. renderer chỉ đọc checklist artifact/view model và không tạo claim/action mới;
14. source repository không bị sửa và planning stage không scan/parse source lần nữa;
15. documentation gọi output là human-review checklist, không phải autonomous migration plan.

## 11. Blockers and Prerequisites

### 11.1 Blockers của full AI Migration Planning

- Không có structured changed/replacement symbols, action, prerequisite hoặc migration path trong Version Analysis.
- Không resolve lockfile/current installed versions; common range baselines làm interval/delta chưa chắc chắn.
- Usage coverage chỉ JS/TS và không có explicit per-project coverage contract trong artifact.
- Exact lexical impact không chứng minh semantic affected call site; không có lines/snippets/member chains.
- Không có resolved dependency/transitive graph để order upgrades.
- Không có repository build/test commands hoặc deployment/data-migration state cho validation/rollback.
- Existing evaluation/scorecard chỉ chấm Version Analysis; migration semantic entailment và invented command/API rate chưa được đo.
- Không real provider/deployment nào được task-certified cho `migration-planning.v1`; **not evidenced in repository**.

### 11.2 Prerequisites của reduced checklist

- MP-01 contract phải định nghĩa step-level grounding và fail-closed status semantics.
- Task-specific trust policy phải mạnh hơn ref allowlisting hiện tại; citation tồn tại không đủ chứng minh action.
- Evaluation fixtures phải có explicit official instruction và adversarial unsupported candidates.
- Consumer phải join Version Analysis status trước Impact Evidence reason, không diễn giải `DEPENDENCY_NOT_USED` độc lập.
- Positive repository locations có thể ship trong current JS/TS scope; negative/safety claims phải chờ explicit analyzer coverage và thêm analyzer theo ecosystem.

### 11.3 Technical debt quan sát được

- README roadmap/capability text chưa phản ánh đầy đủ pipeline hiện hành; dùng implementation/contracts làm source of truth.
- Impact/Impact Evidence không preserve Version finding `evidenceRefs`; MVP-05 phải join lại Version Analysis thay vì giả refs tồn tại downstream.
- Usage Index ghi global analyzer IDs nhưng không mô tả per-project/per-language completeness, làm negative evidence khó dùng an toàn.
- `DEPENDENCY_NOT_USED` hiện conflates “không có usage record trong supported analyzer output” với “repository không dùng dependency”. Presentation đã bảo vệ skipped Version Analysis, nhưng artifact-level semantics vẫn cần thận trọng.
- Current unsupported-claim metric dựa trên validation warnings, chưa đo claim-evidence entailment.

Các debt này không chặn MP-01/MP-02. Chúng chặn việc mở rộng output thành full plan hoặc safety claim.

## 12. Final Verdict

### Verdict: GO WITH REDUCED SCOPE

**Fact:** UpgradeLens đã có provider-neutral structured AI runtime, exact artifact lineage, bounded source evidence, trust ref validation, deterministic JS/TS usage indexing, exact impact matching và truthful presentation states.

**Fact:** Current contracts không có structured migration action/replacement/prerequisite, current version thường nullable, Impact chỉ lexical/file-level, Usage chưa polyglot, và evaluation chưa task-specific cho migration planning.

**Inference:** Các artifacts đủ để tạo checklist draft có refs cho một tập bounded cases, nhưng không đủ để đảm bảo correctness/completeness của full migration plan.

**Recommendation:** Bắt đầu **MP-01 — Checklist Contract and Grounding Policy** ngay. Xây MVP-05 thành **Evidence-Grounded Migration Checklist**, kết hợp phương án B với official-reference fallback của phương án C. Chỉ enable CLI stage sau khi MP-04 task-specific gates pass. Hoãn vô thời hạn trong MVP này mọi capability order/prerequisite inference, code generation/patch, rollback, effort và autonomous execution.

Điều kiện để đánh giá lại full AI Migration Planning:

1. structured change/action/replacement contracts tồn tại;
2. exact current-version resolution và migration interval đáng tin hơn;
3. analyzer coverage được biểu diễn rõ và mở rộng cho ecosystem mục tiêu;
4. semantic affected-location precision/recall được đo;
5. dependency/prerequisite graph tồn tại;
6. migration-specific evaluation chứng minh near-zero invented API/command, step-level evidence grounding và correct human-review behavior.
