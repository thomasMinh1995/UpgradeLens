# IA-03 — Repository Impact Evidence Generation

## 1. Scope and architecture review

IA-03 là một artifact-to-artifact stage giải thích mọi kết luận trong Repository Impact bằng dữ liệu đã tồn tại. Stage này không scan repository, không parse source, không gọi AI/internet, không tính severity/confidence và không sinh migration plan.

Input trust chain:

```text
Project Manifest
      ↓
Version Analysis
      ↓
Usage Index
      ↓
Repository Impact
      ↓
Repository Impact Evidence
```

Contract hiện tại đủ để tạo evidence ở cấp dependency/symbol/file:

- Version Analysis có stable analysis result ID, breaking finding ID và original summary.
- Usage Index có `projectId`, `packageId`, symbol và repository-relative files.
- Repository Impact có exact matched symbols/files và giữ cả impacted lẫn non-impacted breaking findings.

Technical debt/contract gaps:

1. Usage Index `1.0.0` chưa có usage/import kind. Evidence chỉ chứa `{file}`; không tạo `kind` giả.
2. Usage Index chưa có line, column, snippet, function, call count hoặc member-level usage. Evidence schema không có các field này.
3. Version Analysis chưa có structured affected API paths. IA-02 exact matcher đã xử lý free-text summary; IA-03 không tìm hoặc suy luận match mới.
4. Repository Impact finding dùng cùng finding ID với Version Analysis và chưa có evidence-record ID riêng. IA-03 tạo stable SHA-256 ID từ `{analysisResultId, findingId}`, đồng thời giữ nguyên hai source references để trace ngược.
5. Evidence reason contract hiện hỗ trợ `exact-symbol@1.0.0`. Matcher khác phải có evidence policy/version riêng thay vì bị gắn nhãn exact sai.

Các gap trên không chặn IA-03 và không được giải quyết bằng cách sửa artifact cũ.

## 2. Runtime flow

```text
project-manifest.json --------\
version-analysis.json ---------+--> schema + invariant + exact-byte lineage
usage-index.json --------------+--> dependency/finding/symbol/file references
repository-impact.json -------/                         |
                                                          v
                                         deterministic reason selection
                                                          |
                                                          v
                                      evidence model + stable evidence IDs
                                                          |
                                                          v
                         .upgradelens/repository-impact-evidence.json
```

Không có repository path hoặc source scanner/parser trong runtime IA-03.

## 3. Module structure

```text
src/impact-evidence/
  input-loader.js                 four-artifact trust boundary
  repository-impact-evidence.js  generator, model, summary, invariants
  runtime.js                      pure orchestration
  writer.js                       validated atomic writer

schemas/
  repository-impact-evidence.schema.json
```

Infrastructure được tái sử dụng theo chuỗi: IA-03 loader gọi IA-02 loader; IA-02 loader gọi IA-01 loader. Mỗi stage chỉ bổ sung validation cho artifact mới của nó.

## 4. Artifact contract

Artifact mặc định: `.upgradelens/repository-impact-evidence.json`.

Schema version: `1.0.0`.

```json
{
  "analysisResultId": "sha256:...",
  "projectId": "node:.",
  "packageId": "npm:antd",
  "name": "antd",
  "impacted": true,
  "findings": [
    {
      "id": "sha256:...",
      "findingId": "modal-info-removed",
      "kind": "breakingChange",
      "summary": "Modal.info was removed.",
      "impacted": true,
      "reasonCode": "EXACT_SYMBOL_USAGE_FOUND",
      "matchedSymbols": [
        {
          "symbol": "Modal",
          "usages": [
            { "file": "src/components/UserDialog.tsx" },
            { "file": "src/pages/Home.tsx" }
          ]
        }
      ]
    }
  ]
}
```

Input lineage giữ exact-byte SHA-256 cho Project Manifest, Version Analysis, Usage Index và Repository Impact. Output không copy evidence refs/release notes vì chúng không cần thiết để giải thích repository usage match.

## 5. Reason codes

| Code | Điều kiện deterministic |
| --- | --- |
| `EXACT_SYMBOL_USAGE_FOUND` | Repository Impact finding impacted và có ít nhất một exact matched symbol/file record. |
| `NO_EXACT_SYMBOL_USAGE_FOUND` | Dependency có ít nhất một matchable API symbol nhưng finding không có exact match. |
| `DEPENDENCY_NOT_USED` | Không có Usage Index dependency entry cho exact `projectId + packageId`. |
| `NO_MATCHABLE_SYMBOL_FOUND` | Dependency có usage entry nhưng không có API symbol có thể exact-match, ví dụ chỉ `*`, `default` hoặc side-effect usage. |

Reason code không kèm AI prose. Consumer có thể render message bằng template riêng dựa trên enum ổn định.

## 6. Validation and invariants

Loader từ chối input khi:

- bất kỳ artifact nào sai schema/runtime invariants;
- Project/Version/Usage/Impact lineage khác artifact bytes đang load;
- repository identity hoặc artifact path không khớp lineage;
- Repository Impact dependency không trỏ tới exact Version Analysis result;
- dependency identity/name khác source result;
- thiếu/thừa/unknown breaking finding;
- original finding summary bị đổi;
- matched symbol không tồn tại trong Usage Index;
- file set khác exact symbol usage files;
- impact matcher không phải `exact-symbol@1.0.0`.

Output invariants:

- dependencies sort theo project/package/analysis result;
- findings sort theo finding ID;
- matched symbols và usage files sort lexical;
- mọi evidence ID ổn định từ analysis result + finding ID;
- impacted finding phải có `EXACT_SYMBOL_USAGE_FOUND` và non-empty matches;
- non-impacted finding không được có match;
- dependency impacted phải bằng OR của findings;
- summary và bốn reason counts phải tái tính đúng từ records;
- IDs, symbols và usage files không trùng.

## 7. Known limitations and upgrade path

- Evidence chỉ chứng minh symbol-level impact. `Modal.info` match `Modal` chưa chứng minh exact member `info` được gọi.
- Không có usage kind trong schema hiện tại, nên evidence không thể phân biệt named/default/namespace import ngoài canonical symbol facts.
- Dependency có side-effect usage nhưng không có API symbol nhận `NO_MATCHABLE_SYMBOL_FOUND`; engine không suy diễn side effect có bị breaking change ảnh hưởng hay không.
- Non-breaking Version Analysis findings không thuộc Repository Impact `1.0.0`, do đó không nằm trong evidence artifact.

Hướng nâng cấp sau MVP:

1. thêm optional structured `affectedApiPaths` vào Version Analysis version mới;
2. thêm optional `usageKind` và member paths vào Usage Index version mới;
3. thêm matcher/evidence-policy version mới để match exact API path;
4. chỉ thêm line/snippet khi source discovery artifact thực sự sở hữu và version các dữ liệu đó.

Không dùng fuzzy matching hoặc AI để bù contract gap.
