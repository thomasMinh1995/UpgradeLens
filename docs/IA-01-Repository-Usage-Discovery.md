# IA-01 — Repository Usage Discovery

## 1. Architecture review

UpgradeLens đã có boundary tốt giữa các MVP:

- Project Manifest sở hữu project và dependency declarations.
- Version Analysis sở hữu tập dependency occurrences sẽ đi tiếp vào MVP-04.
- Usage Discovery chỉ sở hữu facts lấy từ source code: dependency, symbol và file.

IA-01 không đọc findings/risk/release notes trong Version Analysis, không match breaking change, không chấm severity và không tạo migration plan. Version Analysis chỉ được dùng để giới hạn dependency scope và giữ `packageId`/`projectId` nhất quán với downstream pipeline.

Các technical debt phát hiện trước khi implement:

1. `src/files.js` chỉ scan manifest candidates. Source discovery cần walker riêng nhưng phải dùng cùng ignored-directory policy, không follow symlink và sort deterministic.
2. Repository chưa có JS/TS AST parser. Regex không đủ an toàn cho JSX, TS, alias, type import và re-export. IA-01 thêm duy nhất `@babel/parser`; analyzer tự làm một lexical binding pass nhỏ nên không cần thêm traversal framework.
3. Dependency name không đủ làm identity trong monorepo. Usage Index phải giữ cả `projectId` và `packageId`.
4. Source tree hiện chưa có artifact lineage/revision digest. Index ghi portable file paths nhưng không tuyên bố reproducible theo commit khi input chưa cung cấp source revision.
5. Project Manifest đã detect nhiều ecosystem nhưng dependency inventory mới đầy đủ chủ yếu ở Node/Python. Plugin contract cho phép thêm analyzer mới; MVP chỉ đăng ký JS/TS cho `node`.

## 2. Runtime flow

```text
project-manifest.json ----\
                          +--> validate schema, lineage, dependency references
version-analysis.json ---/                         |
                                                    v
repository --> deterministic source scanner --> deepest project ownership
                                                    |
                                                    v
                                            analyzer registry
                                                    |
                                            JS/TS AST analyzer
                                                    |
                                                    v
                                              Usage Index
                                  project + dependency + symbol + file
```

Một syntax error chỉ tạo warning cho file đó. Các file còn lại vẫn được phân tích. Trong monorepo, source file thuộc project sâu nhất chứa nó; root workspace không được nhận usage của member project. File của project không có dependency occurrence trong Version Analysis không bị scan nhầm dưới scope của root.

## 3. Module structure

```text
src/usage/
  analyzer-registry.js   static plugin registry and capability selection
  input-loader.js        artifact validation, lineage, occurrence references
  runtime.js             orchestration and project ownership
  scope.js               Version Analysis occurrence to declared dependency scope
  source-files.js        deterministic source inventory
  usage-index.js         canonical index builder and validation
  writer.js              deterministic atomic artifact output
  js/
    analyzer.js          npm matching, binding/reference and usage extraction
    parser.js            Babel JS/JSX/TS/TSX AST parsing

schemas/
  usage-index.schema.json
```

Analyzer plugin contract tối thiểu:

```js
{
  id: 'javascript-typescript',
  version: '1.0.0',
  ecosystems: ['node'],
  extensions: ['.js', '.jsx', '.ts', '.tsx'],
  analyze({ source, file, projectId, dependencies }) { /* usage facts */ }
}
```

Registry là static composition, không dynamic-load arbitrary code. Thêm Python/Java/Go/Rust analyzer sau này không làm thay đổi runtime hoặc Usage Index contract.

## 4. JS/TS MVP semantics

- Hỗ trợ `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts`.
- Named import được index theo exported name; alias local không làm đổi symbol.
- Default import dùng symbol ổn định `default`.
- Namespace member như `Ant.Button` được index thành `Button`; namespace dùng như một value được index thành `*`.
- `export { Button } from`, default re-export và `export * from` là usages trực tiếp.
- Static imported binding chỉ được index khi có lexical reference; unused và shadowed binding bị loại.
- Constant dynamic import `import('antd')` dùng symbol `*`; computed dynamic import bị bỏ qua.
- Side-effect-only import vẫn tạo dependency/file location nhưng không tạo symbol giả.
- npm subpath quy về package declaration (`antd/es/button` → `antd`, `@scope/ui/button` → `@scope/ui`). Relative, absolute, URL, `node:` và package import-map specifier không được coi là external dependency.
- `.upgradelens`, `node_modules`, build outputs và các ignored directories hiện có không được scan; symlink không được follow.

Known MVP limitations:

- CommonJS `require()` chưa thuộc contract IA-01.
- Không thực hiện module resolution, path alias resolution hoặc type checker semantics.
- Dynamic import không phải string literal bị bỏ qua deterministic.
- Source parse failure không có partial usage cho file lỗi.
- Chưa lưu line/column theo đúng scope của task.

## 5. Usage Index contract

Artifact mặc định: `.upgradelens/usage-index.json`, schema version `1.0.0`.

```json
{
  "projectId": "node:.",
  "packageId": "npm:antd",
  "name": "antd",
  "files": ["src/pages/Home.tsx", "src/components/UserModal.tsx"],
  "symbols": [
    { "name": "Button", "files": ["src/pages/Home.tsx"] },
    { "name": "Modal", "files": ["src/components/UserModal.tsx"] }
  ]
}
```

Mọi dependency, symbol, file và warning đều được sort deterministic. `files` ở dependency level bao gồm cả side-effect usage; `symbols[].files` là API/symbol locations. Writer validate lại schema/invariants rồi publish atomically, không sửa Project Manifest hoặc Version Analysis.

Runtime API mặc định đọc hai input trong `.upgradelens` và không tự ghi file:

```js
const index = await runUsageDiscovery({ repositoryRoot });
await writeUsageIndex(DEFAULT_USAGE_INDEX_PATH, index);
```

Tách discovery khỏi writer giúp caller có thể validate/inspect output trước khi publish và giữ mọi filesystem mutation explicit.
