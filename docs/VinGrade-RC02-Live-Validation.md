# VinGrade RC-02 Live Validation

Validation date: 2026-07-14 (Asia/Ho_Chi_Minh)

## 1. Environment

| Item | Value |
| --- | --- |
| VinGrade repository | `<VINGRADE_REPO>` |
| VinGrade branch | `feat/knowledege-rubric-criteria` |
| UpgradeLens repository | `<UPGRADELENS_REPO>` |
| UpgradeLens branch | `feat/mvp-02-knowledge-research` |
| UpgradeLens version | `0.1.1` |
| Node.js | `v26.0.0` |
| Platform | Darwin 25.5.0 arm64 |
| CLI under test | `node <UPGRADELENS_REPO>/bin/upgradelens.js` |
| Operating mode | Direct local CLI; clean online scoped HTTP runtime, cache-heavy online, offline, stdout, and custom output |

VinGrade had no tracked modifications. The following unrelated untracked state existed before validation and was not modified: `.agents/skills/`, `.aider.chat.history.md`, `.aider.input.history`, `.aider.tags.cache.v4/`, `FE/public/pitch/`, `PROJECT_DESCRIPTION.md`, `docs/architecture/legacy-architecture-audit.md`, `docs/architecture/prompt-management-audit.md`, `docs/architecture/teaching-intelligence-roadmap.md`, `docs/architecture/teaching-intelligence-systematic-review.md`, `docs/migration/`, `docs/reports/ai-quality-architecture-review.md`, `docs/reports/project-discovery-report.md`, `presentation/vingrade-pitch-speaker-notes.md`, and `skills-lock.json`.

UpgradeLens already contained the RC-02 working-tree implementation and tests. No UpgradeLens or VinGrade source file was changed during this validation.

## 2. Commands executed

Repository paths below are sanitized. The direct CLI was used throughout.

```bash
cd <VINGRADE_REPO>
git branch --show-current
git status --short
node --version
pwd

cd <UPGRADELENS_REPO>
git branch --show-current
git status --short
npm test
npm_config_cache=/tmp/upgradelens-npm-cache npm run check
git diff --check
node <UPGRADELENS_REPO>/bin/upgradelens.js --version
node <UPGRADELENS_REPO>/bin/upgradelens.js --help

cd <VINGRADE_REPO>
find .upgradelens -maxdepth 5 -type f 2>/dev/null | sort
rm -rf /tmp/vingrade-upgradelens-before-rc02
if [ -d .upgradelens ]; then
  cp -R .upgradelens /tmp/vingrade-upgradelens-before-rc02
fi
rm -rf .upgradelens
node <UPGRADELENS_REPO>/bin/upgradelens.js discover .

/usr/bin/time -p node <UPGRADELENS_REPO>/bin/upgradelens.js research . \
  > /tmp/vingrade-rc02-online.stdout \
  2> /tmp/vingrade-rc02-online.stderr
pgrep -af "bin/upgradelens.js research"
lsof -nP -p <PID>

/usr/bin/time -p node <UPGRADELENS_REPO>/bin/upgradelens.js research . \
  > /tmp/vingrade-rc02-second.stdout \
  2> /tmp/vingrade-rc02-second.stderr

/usr/bin/time -p node <UPGRADELENS_REPO>/bin/upgradelens.js research . --offline \
  > /tmp/vingrade-rc02-offline.stdout \
  2> /tmp/vingrade-rc02-offline.stderr

rm -rf /tmp/vingrade-rc02-cache-backup
mv .upgradelens/cache /tmp/vingrade-rc02-cache-backup
node <UPGRADELENS_REPO>/bin/upgradelens.js research . --offline \
  > /tmp/vingrade-rc02-offline-empty.stdout \
  2> /tmp/vingrade-rc02-offline-empty.stderr
rm -rf .upgradelens/cache
mv /tmp/vingrade-rc02-cache-backup .upgradelens/cache

node <UPGRADELENS_REPO>/bin/upgradelens.js research . --stdout \
  > /tmp/vingrade-rc02-stdout.json \
  2> /tmp/vingrade-rc02-stdout.stderr

mkdir -p artifacts
node <UPGRADELENS_REPO>/bin/upgradelens.js research . \
  --output artifacts/vingrade-knowledge-rc02.json
node <UPGRADELENS_REPO>/bin/upgradelens.js research . \
  --output artifacts/vingrade-knowledge-rc02.json
node <UPGRADELENS_REPO>/bin/upgradelens.js research . \
  --output /tmp/vingrade-invalid-output.json
rm -rf artifacts
rm -f /tmp/vingrade-invalid-output.json
```

The first online command ran under a bounded observer. The observer detected the `Wrote:` completion line, then used `ps` and `lsof` to record exact UpgradeLens process and established-TCP counts immediately, after 5 seconds, after 15 seconds, and after 30 seconds. It was authorized to terminate only if the CLI was still alive after the final observation; no termination was needed.

Strict validation used UpgradeLens's existing `loadProjectManifestInput`, `createResearchPlan`, and `validateKnowledgeManifest` functions. Recursive `rg`/`jq` audits checked paths, URLs, private fields, runtime details, and ordering. A size-only `curl` request discarded the Vite response body to `/dev/null`.

## 3. Automated gate

The first sandboxed invocation had 121 passes and one intentional skip because local loopback listeners were unavailable. The gate was rerun with local-loopback access so the RC-02 real keep-alive lifecycle test executed.

| Gate | Result |
| --- | --- |
| `npm test` | 122 tests, 122 passed, 0 failed/skipped/cancelled/todo |
| `npm run check` | Passed; reran 122/122 tests and `npm pack --dry-run` |
| `git diff --check` | Passed with no output |
| Direct CLI version/help | `0.1.1`; `discover` and `research` documented |

The real-loopback automated test confirmed that the online CLI closes its scoped dispatcher after concurrent keep-alive requests. Other RC-02 tests confirmed one owned runtime per online command, idempotent close, cleanup on success/failure, no global mutation, and no runtime creation for offline/discovery/help/version.

## 4. Discovery result

Discovery exited 0 and wrote a strict-valid Project Manifest.

| Metric | Actual |
| --- | ---: |
| Project Manifest schema | `2.0.0` |
| Generator | `UpgradeLens 0.1.1` |
| Repository / branch | `C2-App-008` / `feat/knowledege-rubric-criteria` |
| Projects | 2 |
| Node / Python projects | 1 / 1 |
| Node declarations / unique / duplicates | 19 / 19 / 0 |
| Python declarations / unique / duplicates | 28 / 27 / 1 |
| Research occurrences / unique packages | 47 / 46 |
| Warnings | 1 |

The warning was `DUPLICATE_DEPENDENCY_DECLARATION` for `langchain-openai`. The Project Manifest preserves both declarations; the Research Plan contains one `pypi:langchain-openai` identity with two dependency occurrences.

`loadProjectManifestInput` passed Draft 2020-12 schema validation and runtime dependency invariants. Runtime validation confirmed canonical inventory ordering. All paths are repository-relative, and no absolute local path or `file://` URL appears. The exact Project Manifest digest is `sha256:34b956cc16adb5f96cd20129838241a7bd8737674d21ed3fe4126e88db636b74`.

## 5. First clean online run

The clean run started after removing all prior `.upgradelens/` content, so no old cache entry could hide lifecycle or payload behavior.

### Contract and summary

| Field | Actual |
| --- | --- |
| Knowledge Manifest schema / generator | `1.0.0` / `UpgradeLens 0.1.1` |
| Policy mode | `online` |
| Project Manifest digest | `sha256:34b956cc16adb5f96cd20129838241a7bd8737674d21ed3fe4126e88db636b74` |
| Research ID | `sha256:6a2723984b6619bef60a46a2bba19fe3867a7cdd91bcfe76cb69dc9b5910de74` |

| Metric | Actual |
| --- | ---: |
| Input occurrences / packages | 47 / 46 |
| Resolved / partial / not found | 45 / 0 / 0 |
| Invalid / unavailable | 0 / 1 |
| Sources / warnings | 184 / 1 |
| Cache hits / misses | 0 / 46 |
| Researched packages | 46 |
| Retries / partial failures | 0 / 1 |

Warnings grouped by code: `REGISTRY_RESPONSE_INVALID` = 1 for `npm:vite`.

### Timing

| Measurement | Actual |
| --- | ---: |
| Exit code | 0 |
| Manifest duration | 13,484 ms |
| Process `real` / `user` / `sys` | 14.17 / 13.90 / 0.44 seconds |
| Real minus manifest duration | 0.686 seconds |
| Manifest completion to process exit | 0.361 seconds |
| Manual termination | No |
| Shell prompt / wrapper wait | Returned normally, exit 0 |

## 6. HTTP lifecycle evidence

| Observation | UpgradeLens processes | Established TCP sockets |
| --- | ---: | ---: |
| Immediately after completion | 0 | 0 |
| Completion +5 seconds | 0 | 0 |
| Completion +15 seconds | 0 | 0 |
| Completion +30 seconds | 0 | 0 |

RC-02 fixes the previously reproduced VinGrade lifecycle behavior. The clean online command exited naturally approximately 0.361 seconds after manifest completion. No scoped Agent socket, child process, or UpgradeLens research process remained. No manual signal was sent.

Source inspection and tests show that the CLI constructs a command-scoped Undici `Agent`, passes it only as the request dispatcher, and closes it in CLI cleanup. No `setGlobalDispatcher`, global fetch mutation, or `process.exit()` workaround exists. This validates scoped ownership and absence of global dispatcher mutation; it does not claim any undocumented internal Undici root cause for the former RC-01 behavior.

## 7. Package spot checks

| Package | Status | Occurrences | Declared version(s) | Latest | Selection | Releases | Sources | Warnings |
| --- | --- | ---: | --- | --- | --- | ---: | ---: | --- |
| `npm:react` | resolved | 1 | `^19.2.6` | `19.2.7` | `dist-tag:latest` | 2,865 | 4 | none |
| `npm:react-dom` | resolved | 1 | `^19.2.6` | `19.2.7` | `dist-tag:latest` | 2,820 | 4 | none |
| `npm:vite` | unavailable | 1 | `^8.0.12` | n/a | n/a | 0 | 1 | `REGISTRY_RESPONSE_INVALID` |
| `npm:@vitejs/plugin-react` | resolved | 1 | `^6.0.1` | `6.0.3` | `dist-tag:latest` | 84 | 4 | none |
| `npm:@playwright/test` | resolved | 1 | `^1.61.1` | `1.61.1` | `dist-tag:latest` | 3,276 | 4 | none |
| `npm:eslint` | resolved | 1 | `^10.3.0` | `10.7.0` | `dist-tag:latest` | 424 | 4 | none |
| `npm:eslint-plugin-react-hooks` | resolved | 1 | `^7.1.1` | `7.1.1` | `dist-tag:latest` | 2,706 | 4 | none |
| `npm:posthog-js` | resolved | 1 | `^1.390.2` | `1.399.5` | `dist-tag:latest` | 1,246 | 4 | none |
| `npm:pdfjs-dist` | resolved | 1 | `^6.1.200` | `6.1.200` | `dist-tag:latest` | 1,563 | 4 | none |
| `pypi:fastapi` | resolved | 1 | `>=0.115.0` | `0.139.0` | `project-info-version` | 299 | 6 | none |
| `pypi:pydantic` | resolved | 1 | `>=2.10.0` | `2.13.4` | `project-info-version` | 203 | 5 | none |
| `pypi:sqlalchemy` | resolved | 1 | `>=2.0.0` | `2.0.51` | `project-info-version` | 325 | 3 | none |
| `pypi:ruff` | resolved | 1 | `>=0.8.0` | `0.15.21` | `project-info-version` | 414 | 4 | none |
| `pypi:langchain-openai` | resolved | 2 | unpinned; `>=0.3.0` | `1.3.5` | `project-info-version` | 132 | 6 | none |

All resolved npm packages use the registry `dist-tag:latest`; all resolved PyPI packages use `project-info-version`. UpgradeLens generated factual registry data only—no SemVer recommendation, PEP 440 recommendation, or maximum-version substitution.

Exactly one `pypi:langchain-openai` package record contains the two ordered occurrences and one registry source identity.

### Vite limitation

A size-only live request returned HTTP 200 JSON with 38,902,327 bytes. This exceeds the intentional 16 MiB npm response policy. Combined with the sole `REGISTRY_RESPONSE_INVALID` warning and absence of a cache entry, this confirms the known response-too-large path. Vite is classified as a **known payload-policy limitation**, not an RC-02 lifecycle, transport, or external-registry failure. The limit was not changed.

## 8. Cache and offline behavior

| Run | Exit | Real / manifest duration | Hits / misses | Resolved / unavailable | Warnings | Exit behavior |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| Second online | 0 | 11.06 s / 10,299 ms | 45 / 1 | 45 / 1 | 1 | Natural |
| Offline fresh cache | 0 | 5.49 s / 4,872 ms | 45 / 1 | 45 / 1 | 1 | Natural |
| Offline empty cache | 0 | 0.35 s / 19 ms | 0 / 46 | 0 / 46 | 46 | Natural |

The populated cache contains 45 valid entries. The online cache-heavy miss and warning are Vite only. The offline fresh-cache warning is one `OFFLINE_CACHE_MISS` for Vite. The empty-cache run produced 46 `OFFLINE_CACHE_MISS` warnings and no network fallback. Both offline commands ran without network access; automated RC-02 coverage separately confirms offline mode does not create the CLI HTTP runtime. The populated cache was restored after the empty-cache test.

## 9. Determinism

```text
firstResearchId  sha256:6a2723984b6619bef60a46a2bba19fe3867a7cdd91bcfe76cb69dc9b5910de74
secondResearchId sha256:6a2723984b6619bef60a46a2bba19fe3867a7cdd91bcfe76cb69dc9b5910de74
equal             true
```

The Project Manifest digest, policy, source facts, warnings, and canonical ordering were unchanged. The scoped HTTP runtime implementation does not appear in or affect the research ID.

## 10. stdout and custom output

- `--stdout` exited 0 naturally in 5.87 seconds and emitted 8,565,466 bytes of JSON only. JSON parsing, Knowledge Manifest schema validation, and runtime invariants passed. No progress, Agent-close, dispatcher-cleanup, or other message contaminated stdout.
- The repository-relative custom output exited 0 naturally and validated. Repeating the command changed the target inode (`17879684` to `17879906`), left only the final manifest, and left no temporary file, confirming atomic replacement.
- Absolute output rejection exited 1 before writing `/tmp/vingrade-invalid-output.json`. No final or partial file remained. The known stack-trace UX was observed only on stderr and was not changed.
- The temporary `artifacts/` directory was removed.

## 11. Privacy and portability

Recursive audits of the Project Manifest and first/second/custom Knowledge Manifests found:

| Prohibited value | Hits |
| --- | ---: |
| User-home or other absolute local paths | 0 |
| `file://` or non-HTTPS public source URLs | 0 |
| Cache keys, cache filenames, or Knowledge Store paths | 0 |
| ETag or Last-Modified values | 0 |
| Authorization, Cookie, credentials, or query tokens | 0 |
| Raw registry bodies or HTTP headers | 0 |
| Stack traces | 0 |
| Undici Agent or dispatcher configuration | 0 |
| Payload-limit constants | 0 |

All artifact, repository, project, and manifest paths are portable repository-relative paths. All public source URLs are HTTPS and have no query strings. CLI runtime internals do not enter the public artifact.

## 12. Acceptance checklist

- [x] UpgradeLens automated gate passes.
- [x] VinGrade discovery passes.
- [x] First clean online process exits naturally.
- [x] Exit code is 0.
- [x] No manual termination.
- [x] Post-completion delay is under a few seconds (0.361 seconds).
- [x] No UpgradeLens-owned HTTPS sockets remain.
- [x] Knowledge Manifest schema passes.
- [x] Runtime invariants pass.
- [x] Cache-heavy online run exits naturally.
- [x] Offline runs exit naturally and create no HTTP runtime/network fallback.
- [x] stdout remains JSON-only.
- [x] Research ID remains deterministic.
- [x] Privacy and portability checks pass.
- [x] No global dispatcher mutation is observed.
- [x] No `process.exit()` workaround is used.

## 13. Final verdict

**PASS WITH KNOWN LIMITATIONS**

RC-02 fixes the real VinGrade CLI lifecycle blocker. The first clean online process exited 0 without intervention approximately 0.361 seconds after manifest completion, and no UpgradeLens process or established socket remained at any observation point. The cache-heavy online, offline, stdout, and custom-output commands also exited naturally; schema, runtime invariants, determinism, privacy, and portability passed.

The sole known limitation is Vite: its current 38,902,327-byte full npm packument exceeds the intentional 16 MiB safety policy and remains unavailable with `REGISTRY_RESPONSE_INVALID`. This is a known payload-policy limitation, not an RC-02 lifecycle failure. No source code was changed, nothing was published or committed, and MVP-03 was not started.
