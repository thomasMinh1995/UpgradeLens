# IA-02 — Repository Impact Analysis Engine

## 1. Architecture review

Kiến trúc hiện tại phù hợp để thêm Impact Analysis như một artifact-to-artifact stage độc lập:

- Version Analysis cung cấp dependency identity và breaking-change findings.
- Usage Index cung cấp canonical `projectId`, `packageId`, symbol và portable file paths.
- IA-02 không cần biết analyzer nào đã tạo usage, ngôn ngữ source hoặc cấu trúc repository.

Boundary được giữ rõ ràng: Impact Engine không scan repository, không parse source, không gọi AI, không đọc internet, không tính severity/confidence và không tạo migration plan.

Technical debt quan trọng:

1. Version Analysis finding `1.0.0` chưa có `affectedSymbols` có cấu trúc; chỉ có free-text `summary`. Vì không được sửa artifact MVP trước, IA-02 MVP dùng lexical exact matching trên chính các symbol đã có trong Usage Index.
2. Usage Index hiện có symbol-level granularity. Với finding `Modal.info removed` và usage symbol `Modal`, engine có thể xác nhận `Modal` được dùng nhưng chưa biết repository gọi đúng member `info` hay member khác. Đây là conservative symbol-level impact, không phải member-level proof.
3. Symbol `*` và `default` là canonical/synthetic tokens của IA-01, không phải API names đủ chính xác để match free text. Matcher loại chúng khỏi automatic impact.
4. Future precision nên đến từ một Version Analysis schema mới có structured affected API paths và một Usage Index mới có optional member paths. Runtime/matcher boundary hiện tại cho phép thêm matcher đó mà không phụ thuộc source language.

IA-02 không sửa Version Analysis hoặc Usage Index để xử lý các debt này.

## 2. Runtime flow

```text
project-manifest.json ----\
version-analysis.json -----+--> schema + invariant + exact lineage validation
usage-index.json ----------/                         |
                                                       v
                                    breakingChange findings only
                                                       +
                                          dependency usage symbols
                                                       |
                                                       v
                                      exact-symbol rule matcher
                                                       |
                                                       v
                                      Repository Impact model
                                                       |
                                                       v
                              .upgradelens/repository-impact.json
```

Project Manifest được dùng tại trust boundary để xác nhận Version Analysis vẫn thuộc đúng repository/dependency declarations. Runtime matching chỉ consume Version Analysis và Usage Index đã validate.

## 3. Module structure

```text
src/impact/
  input-loader.js         three-artifact validation and lineage
  matcher.js              exact lexical symbol rule
  repository-impact.js    model builder, summary, schema/invariants
  runtime.js              pure orchestration
  writer.js               deterministic atomic publication

schemas/
  repository-impact.schema.json
```

Matcher boundary:

```js
{
  id: 'exact-symbol',
  version: '1.0.0',
  match(finding, dependencyUsage) {
    // returns [{ symbol, files }]
  }
}
```

Matcher không chứa JavaScript/TypeScript logic. Analyzer của IA-01 đã normalize mọi language về cùng Usage Index contract, nên Python/Java/Go/Rust analyzers tương lai không yêu cầu đổi Impact runtime.

## 4. Exact matching rules

- Chỉ `finding.kind === "breakingChange"` tham gia output/matching.
- Match phân biệt hoa/thường.
- Symbol phải xuất hiện nguyên vẹn với Unicode identifier boundaries.
- `Modal` match `Modal` và root của API path `Modal.info`.
- `Modal` không match `Modal2`, `LegacyModal` hoặc `modal`.
- Không stemming, lowercase normalization, edit distance, synonyms hoặc semantic inference.
- `*` và `default` không tự động match.
- Dependency lookup dùng exact pair `projectId + packageId`; không match chỉ bằng display name.
- Dependency không có Usage Index entry là `impacted: false`, không phải input error.
- Usage Index entry không có Version Analysis result là invalid artifact reference.

Mọi breaking finding được giữ trong dependency result. Finding không match có `impacted: false` và `matches: []`; vì vậy multiple findings không bị mất và not-impacted result audit được.

## 5. Output model

Artifact mặc định: `.upgradelens/repository-impact.json`, schema version `1.0.0`.

```json
{
  "analysisResultId": "sha256:...",
  "projectId": "node:.",
  "packageId": "npm:antd",
  "name": "antd",
  "impacted": true,
  "findings": [
    {
      "id": "modal-info-removed",
      "kind": "breakingChange",
      "summary": "Modal.info was removed.",
      "impacted": true,
      "matches": [
        {
          "symbol": "Modal",
          "files": ["src/components/Dialog.tsx", "src/pages/Home.tsx"]
        }
      ]
    }
  ]
}
```

Top-level summary trả lời trực tiếp repository có impacted hay không, cùng số dependency, finding, symbol match và affected file. `analysisResultId` giữ quan hệ chính xác khi cùng package có nhiều target analysis.

Dependency, finding, match và file arrays đều được sort deterministic. Writer validate schema/runtime invariants trước khi atomic rename và không thay đổi ba input artifacts.
