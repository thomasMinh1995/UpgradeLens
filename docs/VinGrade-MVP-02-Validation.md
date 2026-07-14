# VinGrade MVP-02 Validation

## 1. Environment

Validation date: 2026-07-14 (Asia/Ho_Chi_Minh)

| Item | Value |
| --- | --- |
| UpgradeLens repository | `<UPGRADELENS_REPO>` |
| UpgradeLens branch | `feat/mvp-02-knowledge-research` |
| UpgradeLens package version | `0.1.1` |
| UpgradeLens working tree | Dirty before validation: six modified and four untracked MVP-02 files; validation made no source changes |
| VinGrade repository | `<VINGRADE_REPO>` |
| VinGrade branch | `feat/knowledege-rubric-criteria` |
| Node.js | `v26.0.0` |
| CLI under test | `node <UPGRADELENS_REPO>/bin/upgradelens.js` |
| Unused global CLI | `<GLOBAL_UPGRADELENS_PATH>` |
| Modes tested | online first run, online cache reuse, offline fresh-cache hit, offline cache miss, stdout, custom output |

VinGrade already contained unrelated untracked files. They were not modified. No pre-existing `.upgradelens/` directory was present, so no artifact backup was necessary.

## 2. Commands executed

The substantive commands below were executed without credentials. Repository paths are sanitized.

```bash
cd <UPGRADELENS_REPO>
git status
npm test
npm_config_cache=/tmp/upgradelens-npm-cache npm run check
git diff --check
npm_config_cache=/tmp/upgradelens-npm-cache npm pack --dry-run --json
which upgradelens
node <UPGRADELENS_REPO>/bin/upgradelens.js --version
node <UPGRADELENS_REPO>/bin/upgradelens.js --help

cd <VINGRADE_REPO>
find .upgradelens -maxdepth 5 -type f 2>/dev/null | sort
node <UPGRADELENS_REPO>/bin/upgradelens.js discover .
node <UPGRADELENS_REPO>/bin/upgradelens.js research .
node <UPGRADELENS_REPO>/bin/upgradelens.js research .
node <UPGRADELENS_REPO>/bin/upgradelens.js research . --offline
mv .upgradelens/cache /tmp/vingrade-knowledge-cache
node <UPGRADELENS_REPO>/bin/upgradelens.js research . --offline
mv /tmp/vingrade-knowledge-cache .upgradelens/cache
node <UPGRADELENS_REPO>/bin/upgradelens.js research . --stdout \
  > /tmp/vingrade-knowledge-stdout.json \
  2> /tmp/vingrade-knowledge-stdout.stderr
mkdir -p artifacts
node <UPGRADELENS_REPO>/bin/upgradelens.js research . \
  --output artifacts/vingrade-knowledge.json
node <UPGRADELENS_REPO>/bin/upgradelens.js research . \
  --output /tmp/knowledge.json
node <UPGRADELENS_REPO>/bin/upgradelens.js discover .
node <UPGRADELENS_REPO>/bin/upgradelens.js research .
```

Strict validation used UpgradeLens's own `loadProjectManifestInput` and `validateKnowledgeManifest` exports. Additional `jq`, Node.js recursive audits, `cmp`, `shasum`, `find`, `rg`, `lsof`, and read-only `curl` checks were used for counts, ordering, privacy, process state, and registry-response diagnostics.

### UpgradeLens gate

- Branch: `feat/mvp-02-knowledge-research`.
- `npm test`: 107 tests, 107 passed, 0 failed/skipped/cancelled.
- `npm run check`: passed; it reran all 107 tests and the npm package dry-run.
- `git diff --check`: passed with no output.
- `npm pack --dry-run --json`: passed; 42 files, 79,527-byte tarball, 316,768 bytes unpacked. Nothing was published and no tarball was written.
- The direct CLI reported version `0.1.1` and help for `discover`, `research`, the default discovery alias, `--output`, `--stdout`, `--offline`, `--max-depth`, `--no-pretty`, and `--fail-on-warning`.

## 3. Project Manifest result

Discovery exited 0 and wrote `.upgradelens/project-manifest.json`.

| Contract/count | Actual |
| --- | ---: |
| Schema version | `2.0.0` |
| Generator | `UpgradeLens 0.1.1` |
| Repository | `C2-App-008` |
| Branch | `feat/knowledege-rubric-criteria` |
| Projects | 2 |
| Node projects | 1 |
| Python projects | 1 |
| Workspaces | 0 |

| Project ID | Declarations | Unique | Duplicates |
| --- | ---: | ---: | ---: |
| `node:FE` | 19 | 19 | 0 |
| `python:.` | 28 | 27 | 1 |

The only warning was `DUPLICATE_DEPENDENCY_DECLARATION` for `langchain-openai` in `requirements.txt`. The Project Manifest contains two occurrences that research canonicalizes as `pypi:langchain-openai`.

Strict Draft 2020-12 Ajv validation passed. Runtime dependency invariants passed. All repository, project, manifest, workspace, and dependency paths are portable repository-relative paths; no absolute local path appears. Repeat discovery produced byte-for-byte identical canonical JSON after removing only `generatedAt`, confirming unchanged project IDs, dependencies, ordering, and warnings.

## 4. Knowledge Manifest first online run

The initial sandboxed preflight could not resolve external DNS and produced 46 `REGISTRY_UNAVAILABLE` results; it was excluded from the live baseline. Independent network-enabled probes returned HTTP 200 from both npm and PyPI.

The first network-enabled run completed research and atomically wrote a schema-valid artifact. Its process remained alive with established HTTPS sockets for more than two minutes after printing the completion message, so it was interrupted after the final file was confirmed safe; the observed shell exit was 130. The final equivalent post-discovery online run exited 0, but with substantial wall-clock delay after a 1.627-second manifest duration. See Findings.

### Contract

| Field | First online value |
| --- | --- |
| Knowledge schema | `1.0.0` |
| Generator | `UpgradeLens 0.1.1` |
| Project Manifest digest | `sha256:160516fd08196806f44203c160352646e6148fabc89b95a3e2787ff25e3ecad3` |
| Research ID | `sha256:6d38b75fd55c31210a73a98b5e0fe9191b8d960aa5c0feb8c3eb0db61c1668ad` |
| Policy mode | `online` |

### Summary and execution

| Metric | Value |
| --- | ---: |
| Input occurrences | 47 |
| Packages | 46 |
| Resolved | 31 |
| Partial | 0 |
| Not found | 0 |
| Invalid | 0 |
| Unavailable | 15 |
| Sources | 142 |
| Warnings | 15 |
| Cache hits | 0 |
| Cache misses | 46 |
| Stale sources | 0 |
| Manifest duration | 2,296 ms |
| Researched packages | 46 |
| Retries | 0 |
| Partial failures | 15 |

Warnings grouped by code: `REGISTRY_RESPONSE_INVALID` = 15. Affected packages were:

```text
npm:@playwright/test
npm:@types/react
npm:eslint
npm:eslint-plugin-react-hooks
npm:lucide-react
npm:pdfjs-dist
npm:posthog-js
npm:react
npm:react-dom
npm:react-router-dom
npm:vite
pypi:psycopg2-binary
pypi:pydantic
pypi:ruff
pypi:sqlalchemy
```

These were not confirmed external registry failures. Representative affected responses were valid HTTP 200 JSON but exceeded UpgradeLens's hard-coded 1,000,000-byte response limit: React was 6,787,766 bytes and Pydantic was 1,820,768 bytes. FastAPI, which resolved, was 490,414 bytes. UpgradeLens maps `*_RESPONSE_TOO_LARGE` to the public `REGISTRY_RESPONSE_INVALID` warning. This makes common, valid packages unavailable and is classified as an UpgradeLens defect/limit rather than an external condition.

The first, second, offline, stdout, custom, and final Knowledge Manifests all passed strict JSON Schema and runtime invariant validation.

## 5. Package spot checks

| Package | Status | Registry | Occurrences | Declared versions | Registry latest | Selection | Releases | Warning codes |
| --- | --- | --- | ---: | --- | --- | --- | ---: | --- |
| `npm:react` | unavailable | npm | 1 | `^19.2.6` | n/a | n/a | 0 | `REGISTRY_RESPONSE_INVALID` |
| `npm:vite` | unavailable | npm | 1 | `^8.0.12` | n/a | n/a | 0 | `REGISTRY_RESPONSE_INVALID` |
| `npm:@vitejs/plugin-react` | resolved | npm | 1 | `^6.0.1` | `6.0.3` | `dist-tag:latest` | 84 | none |
| `pypi:fastapi` | resolved | PyPI | 1 | `>=0.115.0` | `0.139.0` | `project-info-version` | 299 | none |
| `pypi:langchain-openai` | resolved | PyPI | 2 | unpinned; `>=0.3.0` | `1.3.5` | `project-info-version` | 132 | none |

Source IDs:

- React: `npm:react:registry`.
- Vite: `npm:vite:registry`.
- `@vitejs/plugin-react`: `npm:@vitejs/plugin-react:registry`, `npm:@vitejs/plugin-react:documentation:91d0a8e5c89a8658142b74499d5e875eeec667b9e5c546d4ec4e56e893aaa94b`, `npm:@vitejs/plugin-react:issues:393c227b303ea7f82cad23d7675d7dda4b9ae4de4176d710891958b3bd308388`, `npm:@vitejs/plugin-react:repository:20165e183b26f4e2183baf3f7af00e94d8bd41bebbedb07f19a396f3f5abef06`.
- FastAPI: `pypi:fastapi:registry`, `pypi:fastapi:changelog:99b394030cf8fb82194374faaa60cd2e3fd25f6def910e3e6af4d0b35ce637a9`, `pypi:fastapi:documentation:6355c1abf82e4fcf376601f7b46006cbebd218a9967846cc77b7be28e8577bff`, `pypi:fastapi:documentation:f9ecc9a5597baab2636d566e13bb342933f2b8340b57a11aebbe383d74f440a4`, `pypi:fastapi:issues:7300d73fbb3d7c7d27a77c765277ca2b64365c306702e83e222402b26ae29e96`, `pypi:fastapi:repository:f9ecc9a5597baab2636d566e13bb342933f2b8340b57a11aebbe383d74f440a4`.
- `langchain-openai`: `pypi:langchain-openai:registry`, `pypi:langchain-openai:changelog:f639e020ec7aafbe9fb9425c60215caed2d6fea389463911c1ed9404152bef22`, `pypi:langchain-openai:documentation:460f08369bb7f87a8454057ceaaef62252256e5b0824e9efd816a67ecb1bd467`, `pypi:langchain-openai:documentation:4e8c3949e160bc1b201617db0ff87d5d6aa08f8332f001afd2747ab702185c2d`, `pypi:langchain-openai:issues:a09c72f4e18e0994736d5179ca5a8cfa32194330c2202ea5cd401cd0d8b85016`, `pypi:langchain-openai:repository:c5a32632e586ab2c7c9c6b0311eaac2477d26a3be132e9c5b7f260a30728c0b7`.

The resolved npm spot check uses the registry's `dist-tag:latest`; it is not selected by maximum version. Both resolved PyPI checks use `project-info-version`; they are not selected by PEP 440 comparison or the maximum release key. React and Vite could not be live-confirmed because the response-size defect made them unavailable.

Duplicate preservation passed: exactly one `pypi:langchain-openai` package identity contains both ordered occurrences. No duplicate registry identity or second independent research request was created.

## 6. Cache validation

| Metric | First online | Second online |
| --- | ---: | ---: |
| Cache hits | 0 | 31 |
| Cache misses | 46 | 15 |
| Resolved | 31 | 31 |
| Unavailable | 15 | 15 |
| Warnings | 15 | 15 |
| Research ID | `sha256:6d38...668ad` | `sha256:6d38...668ad` |

There were 31 cache files after population. Every successfully researched package became a fresh cache hit. The 15 responses rejected before caching were fetched again and remained misses. Package facts, source records, warning records, and their ordering were exactly equal between runs.

The second online process also remained alive after safely writing its artifact and was interrupted, yielding shell exit 130. The later final online run exited 0 and retained the same package/source/warning facts.

## 7. Offline validation

### Fresh populated cache

- Exit code: 0.
- Resolved/unavailable: 31/15.
- Cache hits/misses: 31/15.
- `OFFLINE_CACHE_MISS`: 15.
- Research ID: `sha256:2a1857ee84071aaee32b2d6b0af50636e1ada7f3254d251d190931392fe82753`.
- Schema and runtime invariants: pass.
- No network-enabled execution was provided to this command, and it completed normally.

### Empty cache

- Exit code: 0.
- Unavailable packages: 46.
- Cache hits/misses: 0/46.
- `OFFLINE_CACHE_MISS`: 46.
- Total warnings: 46.
- Research ID: `sha256:7a751e6f3f088e56016c34f1a05b3a4370f061c3dc6432b86ea8462dd635364f`.
- Schema and runtime invariants: pass.
- No stale or online fallback occurred.

The populated 31-entry cache was restored after the miss test.

## 8. Determinism

```text
firstResearchId  sha256:6d38b75fd55c31210a73a98b5e0fe9191b8d960aa5c0feb8c3eb0db61c1668ad
secondResearchId sha256:6d38b75fd55c31210a73a98b5e0fe9191b8d960aa5c0feb8c3eb0db61c1668ad
equal             true
```

The Project Manifest digest, policy, ordered source digests, package records, source records, and warning records were unchanged between those online runs.

Repeat discovery changed only `generatedAt`, so the exact Project Manifest bytes and digest changed to `sha256:4679f3a71b09b140eb7af1900e77da7467a34ce1c45839ab667050cf34b196f6`. The final research ID accordingly changed to `sha256:9f465841b64bef8644fad89c3fa7fbd40944c27e7c21c1ff9599fb874d5e9c3d`. This is expected lineage behavior, not nondeterminism. Package, source, and warning arrays remained exactly equal and ordered. Runtime ordering invariants passed.

## 9. Privacy and portability

Focused recursive key/value audits of the Project and first online Knowledge Manifests found:

| Check | Hits |
| --- | ---: |
| `<USER_HOME>/` machine-path prefix | 0 |
| Absolute Unix, Windows, or `file://` paths | 0 |
| `.upgradelens/cache`, Knowledge Store paths, cache filenames/keys | 0 |
| ETag or Last-Modified | 0 |
| Authorization, cookies, credentials, or token markers | 0 |
| Raw response bodies or raw HTTP-header fields | 0 |
| Stack-trace markers | 0 |
| Query-bearing public URLs | 0 |
| Non-HTTPS URL occurrences | 0 |

All 5,119 URL occurrences in the online Knowledge Manifest used HTTPS. No release-blocking privacy leakage was found. The negative absolute-output command printed a Node stack trace containing local source paths to stderr, but no stack trace or local path entered either public manifest.

## 10. CLI behavior

- Default discovery and research paths were created as documented.
- `--stdout` wrote 1,713,123 bytes of JSON only. JSON parsing, schema validation, and invariants passed. Stderr was empty, and the default Knowledge Manifest SHA-256 remained unchanged.
- Custom relative output `artifacts/vingrade-knowledge.json` was created and validated. It did not replace the default artifact. The temporary `artifacts/` directory was removed after validation.
- Absolute output `/tmp/knowledge.json` failed before writing with exit code 1. No partial output remained. The error escaped as a full Node stack trace rather than a concise CLI error.
- Online default, stdout, and custom-output runs exhibited long post-completion process lifetimes with established HTTPS sockets. Two online file runs and the stdout/custom runs were interrupted only after their complete validated outputs were confirmed. A later equivalent final online run exited 0, but substantially later than its 1.627-second manifest duration. Offline runs exited promptly.

### Atomic replacement

The automated suite passed its Knowledge Manifest atomic writer test: validated content replaced an existing target, output ended with a newline, and no `.tmp` file remained. Invalid content failed validation before a final file appeared. The cache writer's injected rename-failure test also passed and preserved the existing entry while cleaning the temporary attempt.

A real VinGrade filesystem write fault was not forced because the writer has no injected filesystem hook and damaging the valid artifact was not justified. The final valid online artifact was never deliberately corrupted.

## 11. Findings

### Pass

- UpgradeLens test/check/package gates pass.
- The local current CLI was used directly.
- Polyglot discovery counts and duplicate preservation are correct.
- Project and Knowledge Manifest schemas and runtime invariants pass.
- Latest selection is registry-designated for the resolved npm and PyPI spot checks.
- Cache reuse, offline hit/miss behavior, research-ID determinism, semantic repeatability, ordering, stdout separation, relative custom output, absolute-output rejection, privacy, portability, and HTTPS-only URL checks pass.
- The final `.upgradelens/` contains a valid latest online Project Manifest, Knowledge Manifest, and the populated 31-entry cache.

### Expected external condition

No confirmed external package or registry condition remained after network-enabled HTTP 200 diagnostics. The 15 public warnings were generated by UpgradeLens's local response limit, not by confirmed registry invalidity.

### VinGrade dependency issue

- `requirements.txt` declares `langchain-openai` twice: once unpinned and once as `>=0.3.0`. UpgradeLens correctly preserves both occurrences under one package identity.

### UpgradeLens defects

1. **Release blocking — valid registry payloads over 1 MB become unavailable.** At least React and Pydantic returned valid HTTP 200 JSON and were rejected solely because `maxResponseBytes` defaults to 1,000,000. Fifteen of 46 VinGrade packages were unavailable, including React and Vite, preventing the requested live latest/release facts for core dependencies. The public warning also calls an oversized response “invalid,” obscuring the actual cause.
2. **Process-lifecycle defect — online CLI can linger long after output is complete.** Multiple commands retained established HTTPS sockets after writing/printing the validated artifact. Offline commands did not. The behavior was intermittent in duration; the final run eventually exited 0.
3. **CLI error-handling defect — invalid absolute output emits a stack trace.** Rejection and no-partial-write behavior are correct, but the expected argument error is not caught at the CLI boundary.

No UpgradeLens source was changed during this validation.

## 12. Final verdict

**FAIL — RELEASE BLOCKING**

The data contracts, deterministic behavior, cache/offline behavior, and privacy controls are sound, but real VinGrade research cannot resolve 15 of 46 ordinary public dependencies because valid registry documents exceed the implementation's 1 MB limit. React and Vite are among the missing core spot checks. The online process-lifecycle issue further makes command completion unreliable or excessively delayed. These are implementation issues, not external warnings.

## 13. Recommended next actions

1. Keep bounded reads, but support real npm/PyPI metadata sizes (or use smaller registry representations) and expose `REGISTRY_RESPONSE_TOO_LARGE` distinctly; add regression coverage with real-size React and Pydantic fixtures.
2. Reproduce and fix post-fetch process retention on supported Node versions, including Node 26; add a subprocess test that asserts timely CLI exit after output.
3. Catch runtime argument errors at the CLI boundary and emit a concise stderr message without a stack trace.
4. In VinGrade, remove the duplicate `langchain-openai` declaration or consolidate it to one intentional constraint.

## 14. RC-01 release-blocker remediation (2026-07-14)

This section preserves the failure evidence above as the baseline. It records the targeted remediation in UpgradeLens; it does not reinterpret the original VinGrade network run as a pass.

### Confirmed root causes and scope

- **Payload rejection was confirmed.** Both registry adapters inherited a hard-coded `1,000,000` byte default. Valid responses larger than that value were rejected before package validation, so the mapped public warning was `REGISTRY_RESPONSE_INVALID` with an internal `*_RESPONSE_TOO_LARGE` code.
- **The prior online process retention was observed, not conclusively attributed.** The baseline saw established HTTPS sockets after completion, but did not prove whether unread bodies, timeout handles, or the Node global Undici keep-alive policy was the cause. RC-01 fixes the UpgradeLens-owned lifecycle paths and adds a controlled natural-exit regression; it does not claim a global Undici defect was demonstrated.

### Code and lifecycle changes

- npm now owns `DEFAULT_NPM_MAX_RESPONSE_BYTES = 16 * 1024 * 1024` (16 MiB); full packuments include complete version metadata and can be several megabytes.
- PyPI now owns `DEFAULT_PYPI_MAX_RESPONSE_BYTES = 8 * 1024 * 1024` (8 MiB); project JSON is often smaller but can exceed 1 MB.
- Explicit adapter overrides remain supported. Values must be positive safe integers and are bounded by a documented 64 MiB safety ceiling. These remain execution settings and do not enter either manifest schema or policy.
- The common helper no longer supplies a shared registry response-size default. It retains bounded streaming reads, cancels and unlocks an oversized reader, cancels unused status/media bodies, fully consumes valid JSON, and clears its `AbortController` timeout in `finally` across all paths.
- At RC-01 completion, UpgradeLens created no Undici `Agent`, `Pool`, `Client`, dispatcher, or custom HTTP runtime; the CLI still used `globalThis.fetch`. No dispatcher was introduced in RC-01, and no forced `process.exit()` workaround was added. RC-02 subsequently introduces a scoped CLI-owned runtime; its live VinGrade retest is recorded separately when available.

### Automated regression result

The controlled suite covers:

- npm payloads above 1 MiB and near 6.8 MiB; PyPI payloads above 1 MiB and near 1.8 MiB; both resolve and are reused from cache;
- declared payloads exceeding the new adapter limits, lower explicit overrides, invalid values, and the 64 MiB ceiling; oversized bodies are rejected and not cached;
- reader cancellation and lock release; 404, 429, 5xx, and invalid-media body cancellation; success, timeout, failure, and oversize timer cleanup; and sanitized cleanup failures;
- an actual child-process invocation of the research CLI with injected normal and oversized registry responses. It writes a valid Knowledge Manifest, exits with code 0 without `process.exit()`, and is asserted to exit naturally within three seconds.

Post-remediation local automated result: `npm test` completed with **115 passed, 0 failed** in 1.28 seconds. It is independent of external registries.

### VinGrade revalidation status

The VinGrade checkout identified by the original report was not available in the local validation environment at remediation time; no alternate repository path was supplied. Consequently, RC-01 did **not** rerun online discovery/research and does not fabricate package totals, warning counts, cache totals, or timings for React, Vite, Playwright, ESLint, Pydantic, Ruff, SQLAlchemy, or Psycopg2.

The required follow-up in an environment containing `<VINGRADE_REPO>` is to run a clean online research pass, retain the original baseline separately, and record: package-status totals; every previously blocked package; warning codes; cache first/second-run totals; manifest duration; and wall-clock natural exit. Any genuine registry failure must remain separate from the historical 1 MB implementation defect.

### Revised verdict

**PASS WITH EXTERNAL WARNINGS**

The release-blocking local implementation defect has targeted limits and automated regression coverage. The remaining warning is external validation availability: the real VinGrade checkout was unavailable for the mandatory online retest, so live package outcomes and post-completion socket behavior remain to be confirmed in that environment. The original baseline failure evidence remains unchanged above.

## 15. RC-01 Live Remediation Retest

This section records the mandatory live VinGrade follow-up and supersedes only the provisional RC-01 verdict immediately above. The original failure baseline remains preserved in Sections 1–13.

### Environment and clean-cache method

Retest date: 2026-07-14 (Asia/Ho_Chi_Minh).

| Item | Actual |
| --- | --- |
| UpgradeLens branch | `feat/mvp-02-knowledge-research` |
| UpgradeLens version | `0.1.1` |
| Node.js | `v26.0.0` |
| VinGrade branch | `feat/knowledege-rubric-criteria` |
| CLI | Direct `bin/upgradelens.js`; no global installation used |

VinGrade had no pre-existing `.upgradelens/` files at the start of this retest. The retest still executed the requested backup check, removed `.upgradelens/`, reran discovery, and performed the first valid online run with network access. A sandboxed no-network preflight produced immediate transport failures and was excluded from all live results. No VinGrade source, dependency, lock, Docker, environment, or database file was changed.

### Automated gate

- `npm test`: 115 tests passed; 0 failed, skipped, cancelled, or todo.
- `npm_config_cache=/tmp/upgradelens-npm-cache npm run check`: passed; it reran all 115 tests and completed `npm pack --dry-run` with 44 files, a 90.1 kB tarball, and 347.3 kB unpacked size.
- `git diff --check`: passed with no output.
- Direct CLI version/help: `0.1.1`; commands `discover` and `research`, plus documented discovery/research options.

### Discovery

Discovery exited 0 and produced schema version `2.0.0` with generator `UpgradeLens 0.1.1`.

| Metric | Actual |
| --- | ---: |
| Projects | 2 |
| Node/Python projects | 1 / 1 |
| Node declarations / unique / duplicates | 19 / 19 / 0 |
| Python declarations / unique / duplicates | 28 / 27 / 1 |
| Total research occurrences / unique packages | 47 / 46 |
| Discovery warnings | 1 |

The sole discovery warning remained `DUPLICATE_DEPENDENCY_DECLARATION` for `langchain-openai`. Both declarations are preserved in one `pypi:langchain-openai` package record with two occurrences, and the registry identity is researched once.

### First clean online result

The first network-enabled research phase completed and wrote a valid Knowledge Manifest, but its process did not exit naturally. The process was terminated only after 427.64 seconds, when it remained alive about 414 seconds beyond its 13.801-second manifest duration.

| Contract/execution field | Actual |
| --- | --- |
| Knowledge schema / generator | `1.0.0` / `UpgradeLens 0.1.1` |
| Policy mode / version | `online` / `1` |
| Project Manifest digest | `sha256:a59c696a5f1101f47cd17baf9e62d1914c69d06c0590f74cd705d7837fb98c16` |
| Research ID | `sha256:6f415344ba50a7c427164d4d9d9d57248b98e71026f372826ec3bcb505e44d0c` |
| Manifest duration | 13,801 ms |
| Timed process | `real 427.64`, `user 13.21`, `sys 0.51` seconds |
| Real minus manifest duration | 413.839 seconds |
| Exit | Did not exit naturally; terminated with shell exit 143 |

| Summary metric | Actual |
| --- | ---: |
| Input occurrences / packages | 47 / 46 |
| Resolved / partial / not found | 45 / 0 / 0 |
| Invalid / unavailable | 0 / 1 |
| Sources / warnings | 184 / 1 |
| Cache hits / misses | 0 / 46 |
| Researched packages | 46 |
| Retries / partial failures | 0 / 1 |

Warnings grouped by code: `REGISTRY_RESPONSE_INVALID` = 1, for `npm:vite` only.

At 1 minute 51 seconds the completed process still had six established HTTPS sockets. At 5 minutes 51 seconds it still had four established HTTPS sockets and was still running. It was then terminated to allow the remaining retest phases to proceed. Therefore RC-01 did not resolve the clean online CLI lifecycle blocker, even though later low-network/cache runs exited naturally.

### Previously blocked package outcomes

| Package | Status | Latest | Selection | Releases | Warnings | Occurrences |
| --- | --- | --- | --- | ---: | --- | ---: |
| `npm:react` | resolved | `19.2.7` | `dist-tag:latest` | 2,865 | none | 1 |
| `npm:vite` | unavailable | n/a | n/a | 0 | `REGISTRY_RESPONSE_INVALID` | 1 |
| `npm:@playwright/test` | resolved | `1.61.1` | `dist-tag:latest` | 3,276 | none | 1 |
| `npm:@types/react` | resolved | `19.2.17` | `dist-tag:latest` | 705 | none | 1 |
| `npm:eslint` | resolved | `10.7.0` | `dist-tag:latest` | 424 | none | 1 |
| `npm:eslint-plugin-react-hooks` | resolved | `7.1.1` | `dist-tag:latest` | 2,706 | none | 1 |
| `npm:lucide-react` | resolved | `1.24.0` | `dist-tag:latest` | 676 | none | 1 |
| `npm:pdfjs-dist` | resolved | `6.1.200` | `dist-tag:latest` | 1,563 | none | 1 |
| `npm:posthog-js` | resolved | `1.399.5` | `dist-tag:latest` | 1,246 | none | 1 |
| `npm:react-dom` | resolved | `19.2.7` | `dist-tag:latest` | 2,820 | none | 1 |
| `npm:react-router-dom` | resolved | `7.18.1` | `dist-tag:latest` | 1,058 | none | 1 |
| `pypi:psycopg2-binary` | resolved | `2.9.12` | `project-info-version` | 26 | none | 1 |
| `pypi:pydantic` | resolved | `2.13.4` | `project-info-version` | 203 | none | 1 |
| `pypi:ruff` | resolved | `0.15.21` | `project-info-version` | 414 | none | 1 |
| `pypi:sqlalchemy` | resolved | `2.0.51` | `project-info-version` | 325 | none | 1 |

The important selection semantics also passed: `npm:react`, `npm:@vitejs/plugin-react` (`6.0.3`), and all resolved npm packages use `dist-tag:latest`; `pypi:fastapi` (`0.139.0`), `pypi:pydantic`, and `pypi:langchain-openai` (`1.3.5`) use `project-info-version`. No maximum-version or PEP 440 selection was substituted.

### Payload-limit evidence

Size-only live HTTP 200 probes discarded response bodies to `/dev/null` and did not persist raw registry payloads:

| Package | Observed body | RC-01 limit | Result |
| --- | ---: | ---: | --- |
| `npm:react` | 6,787,766 bytes | 16 MiB | accepted and cached |
| `npm:vite` | 38,902,327 bytes | 16 MiB | rejected as over the configured ceiling |
| `pypi:pydantic` | 1,820,768 bytes | 8 MiB | accepted and cached |

React, Pydantic, Ruff, and SQLAlchemy are no longer unavailable because of the former 1 MB cap. Vite's current npm packument is approximately 37.1 MiB and genuinely exceeds the new 16 MiB ceiling; this is the exact internal cause of its sanitized public warning. The limit was not increased again. Valid representative npm and PyPI bodies below their new limits were accepted.

### Cache, offline, stdout, and output-path validation

| Run | Exit | Real / manifest duration | Hits / misses | Resolved / unavailable | Warnings |
| --- | ---: | --- | ---: | ---: | ---: |
| Second online | 0 | 6.44 s / 5,833 ms | 45 / 1 | 45 / 1 | 1 |
| Offline, populated cache | 0 | 5.82 s / 5,209 ms | 45 / 1 | 45 / 1 | 1 |
| Offline, empty cache | 0 | 0.43 s / 40 ms | 0 / 46 | 0 / 46 | 46 |

- The populated cache contained 45 entries. Every successful first-run package became a fresh hit; only oversized Vite remained a miss.
- The offline populated-cache warning was one `OFFLINE_CACHE_MISS` for Vite. The empty-cache run produced 46 `OFFLINE_CACHE_MISS` warnings. Neither offline run had network permission or online fallback, and both exited naturally with valid manifests. The 45-entry cache was restored afterward.
- `--stdout` exited 0 in 6.69 seconds, emitted JSON only, parsed successfully, and passed schema and runtime invariants. No progress text entered stdout; stderr contained timing output only.
- Repository-relative custom output was created and validated. Replacing the existing target changed its inode, left only the final file, and left no temporary file. The temporary `artifacts/` directory was removed.
- Absolute output rejection exited 1 before writing `/tmp/vingrade-invalid-output.json`; no partial output remained. The existing full-stack-trace CLI error behavior remains, but no stack trace entered a public artifact.

### Determinism

```text
firstResearchId  sha256:6f415344ba50a7c427164d4d9d9d57248b98e71026f372826ec3bcb505e44d0c
secondResearchId sha256:6f415344ba50a7c427164d4d9d9d57248b98e71026f372826ec3bcb505e44d0c
equal             true
```

The Project Manifest digest, policy, package/source facts, warning, and ordering were unchanged. Timestamps and durations differed as permitted.

### Schema, invariants, privacy, and portability

The first online, second online, offline hit, offline miss, stdout, and custom-output manifests all passed UpgradeLens's existing Draft 2020-12 schema validator and runtime invariant validator. Runtime checks also confirmed deterministic package, occurrence, release, source, reference, warning, and conflict ordering.

Recursive scans of the Project Manifest and both online Knowledge Manifests found no user-home or absolute local paths, cache filenames or keys, Knowledge Store paths, ETag/Last-Modified values, authorization/cookie/credential/query-token material, raw registry bodies, raw HTTP headers, stack traces, or internal payload-limit constants. All artifact, project, and manifest paths were repository-relative. All public source URLs were HTTPS. No privacy or portability regression was found.

### Revised verdict

**FAIL — RELEASE BLOCKING**

RC-01 fixes the former 1 MB payload blocker for representative valid npm/PyPI responses below the new ecosystem limits. The only remaining live package warning is Vite, whose current 38,902,327-byte npm response demonstrably exceeds the intentional 16 MiB safety ceiling; it is not evidence of the old limit regression or an external network failure.

However, the mandatory first clean online CLI run did not exit naturally after completing and writing its validated artifact. It retained established HTTPS sockets for more than six minutes and required termination after 427.64 seconds. This directly meets the specified release-blocking criterion. Cache/offline behavior, determinism, schema/runtime validity, privacy, portability, stdout separation, and output-path behavior otherwise passed. No UpgradeLens source patch was made during this retest, and MVP-03 was not started.
