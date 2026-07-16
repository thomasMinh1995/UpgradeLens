# IA-05 — VinGrade Real-world Validation

## 1. Executive conclusion

**NO-GO**

The IA-04 scheduler can run all seven stages and publish a schema-valid, exact-lineage artifact chain on the real VinGrade repository. Project Discovery and JavaScript/TypeScript Usage Discovery performed well in manual source checks: all eight requested dependencies were found correctly, at least five artifact-first usage samples were confirmed, and at least five source-first searches were present in the Usage Index.

MVP-04 should not be accepted yet for two reasons:

1. The successful offline cache-miss run had 47 of 47 Version Analysis results skipped, but the console and Markdown report presented `Impacted: No` for every dependency without disclosing that no dependency had actually been analyzed. This is false reassurance, not merely a cosmetic limitation.
2. With identical repository, options, and offline cache-miss state, `researchId`, all 47 `contextId` values, and all 47 Version Analysis result IDs changed between runs. Business payloads and Markdown were deterministic, but the stable IDs were not.

The final artifacts contain no breaking findings, so real-world Impact matching and finding-level Evidence correctness could not be proven. A one-package local-model probe produced schema-valid but factually weak React findings, confirming that upstream knowledge/model quality is also a material validation constraint.

No UpgradeLens or VinGrade source fix was made during IA-05.

## 2. Environment

| Item | Value |
| --- | --- |
| UpgradeLens repository | `/Users/nguyenducminh/Desktop/UpgradeLens` |
| UpgradeLens branch | `feat/mv-04-knowledge-evidence` |
| UpgradeLens commit | `e0f0e447aa7d43defb0d97a1c1439fb858634804` |
| UpgradeLens state | IA-04 working-tree implementation present and uncommitted |
| UpgradeLens package | `upgradelens@0.2.0` |
| VinGrade repository | `/Users/nguyenducminh/github-classroom/C2-App-008` |
| VinGrade identity | README title `VinGrade`; package `vingrade-frontend` |
| VinGrade branch | `feat/knowledege-rubric-criteria` |
| VinGrade commit | `25811ef997fcf45810105e89e4500688f28f7ba5` |
| VinGrade last commit | `2026-07-10T10:47:47+07:00`, `merge develop` |
| Node.js | `v26.0.0` |
| Local Ollama | `0.23.0`; service was started for probes and stopped afterward |

This VinGrade checkout was selected over other local polyglot repositories because its README explicitly identifies VinGrade, its frontend package is named `vingrade-frontend`, and its branch and commit match prior VinGrade validation context. No second VinGrade checkout was found.

### Baseline safety state

Before validation, VinGrade already had the following Git state:

```text
 D Makefile
?? .agents/skills/
?? .aider.chat.history.md
?? .aider.input.history
?? .aider.tags.cache.v4/
?? .upgradelens/
?? FE/public/pitch/
?? PROJECT_DESCRIPTION.md
?? docs/architecture/legacy-architecture-audit.md
?? docs/architecture/prompt-management-audit.md
?? docs/architecture/teaching-intelligence-roadmap.md
?? docs/architecture/teaching-intelligence-systematic-review.md
?? docs/migration/
?? docs/reports/ai-quality-architecture-review.md
?? docs/reports/project-discovery-report.md
?? presentation/vingrade-pitch-speaker-notes.md
?? skills-lock.json
```

The deleted tracked `Makefile` and all unrelated untracked paths predated IA-05.

Four old UpgradeLens artifacts existed. Their timestamps were from 2026-07-16 01:24–01:32 local time, and the old Version Analysis contained only one result. The complete old `.upgradelens` directory was moved intact to:

```text
/private/tmp/vingrade-ia05-before-20260716-validated
```

The online research cache generated during IA-05 was later moved intact to:

```text
/private/tmp/vingrade-ia05-online-cache-20260716
```

This allowed the final two runs to exercise the same clean offline cache-miss state without mixing old artifacts.

## 3. Pipeline result

The CLI was invoked directly from the current UpgradeLens working tree:

```bash
node ./bin/upgradelens.js analyze /Users/nguyenducminh/github-classroom/C2-App-008
```

| Run | Mode | Result | Exit | Details |
| --- | --- | --- | ---: | --- |
| Initial smoke | Online research, no AI configuration | Failed at Version Analysis | 1 | Discovery and Research passed; `UPGRADELENS_AI_ENDPOINT` was unset |
| Cache retry | `--offline`, fresh cache from online run | Failed at Version Analysis | 1 | 45 cache hits; failure was independent of registry access |
| Local qwen3 attempt | Offline, `qwen3:latest`, 180 s timeout | Operator-stopped after reproducible package timeout | 130 | First request was truncated from 5,316 to 4,096 tokens and returned HTTP 500 at 180 s |
| React probe | `analyze-version --package npm:react`, `qwen2.5-coder:7b` | Completed | 0 | One schema-valid result; quality concerns documented below |
| Full qwen2.5 attempt | Offline, `qwen2.5-coder:7b`, 180 s timeout | Operator-stopped | 130 | First full-run request timed out at 180 s; continuing 46 sequential requests was not useful validation |
| Degraded end-to-end run 1 | Offline cache miss, no AI call required | Completed all seven stages | 0 | 47 deterministic skipped Version Analysis results |
| Degraded end-to-end run 2 | Same repository/options/cache state | Completed all seven stages | 0 | Used for determinism comparison |

The successful runs reported:

```text
✓ Project Discovery
✓ Knowledge Research
✓ Version Analysis
✓ Repository Usage Discovery
✓ Repository Impact Analysis
✓ Repository Impact Evidence
✓ Markdown Report
```

All required final files exist, JSON files parse, and the Markdown report is non-empty:

```text
.upgradelens/project-manifest.json
.upgradelens/knowledge-manifest.json
.upgradelens/knowledge-evidence-bundle.json
.upgradelens/version-analysis.json
.upgradelens/usage-index.json
.upgradelens/repository-impact.json
.upgradelens/repository-impact-evidence.json
.upgradelens/repository-impact.md
```

## 4. Artifact summary

| Metric | Result |
| --- | ---: |
| Projects | 2 |
| Dependency declarations / analysis occurrences | 47 |
| Unique researched packages | 46 |
| Version results analyzed | 0 |
| Version results skipped | 47 |
| Version results requiring human review | 47 |
| Usage dependencies | 17 |
| Usage symbols | 152 |
| Usage files | 79 |
| Source files scanned / analyzed | 141 / 140 |
| Usage warnings | 1 |
| Impacted dependencies | 0 |
| Breaking findings | 0 |
| Evidence records | 0 |

The console `Dependencies: 47` count is the number of dependency occurrences, not 46 unique packages. `langchain-openai` is declared twice in `requirements.txt`, explaining the difference.

### Trust-chain validation

The production loaders successfully validated all boundaries:

```text
Project + Knowledge + Knowledge Evidence -> Version Analysis
Project + Version Analysis -> Usage Index
Project + Version Analysis + Usage Index -> Repository Impact
Project + Version Analysis + Usage Index + Repository Impact -> Impact Evidence
```

Direct hash checks also passed for every exact-byte reference from Project Manifest through Repository Impact Evidence. Reference checks showed:

- all 47 Repository Impact `analysisResultId` values existed in Version Analysis;
- all 47 Impact Evidence `analysisResultId` values existed in Repository Impact;
- all 17 Usage Index package/project keys existed in Version Analysis;
- all project references resolved to `node:FE` or `python:.`;
- no dangling finding, symbol, or file references existed (the final chain contained zero findings).

## 5. Project discovery and manual correctness matrix

Project Discovery correctly found:

| Project | Path | Ecosystem | Manifest | Dependencies |
| --- | --- | --- | --- | ---: |
| `node:FE` | `FE` | Node | `FE/package.json` | 19 unique declarations |
| `python:.` | `.` | Python | `requirements.txt` | 28 declarations, 27 unique, 1 duplicate |

The nested Node project correctly owned frontend source files instead of the root Python project. No project was missing or duplicated. IA-01 only has a JavaScript/TypeScript analyzer, so Python source usage was intentionally not indexed.

### Source-to-artifact matrix

| Dependency | Real source usage | Usage Index | Result |
| --- | --- | --- | --- |
| `react` | `lazy` and `Suspense` in `FE/src/App.jsx`; `useState` across frontend files | Symbols and files found under `node:FE` | Correct |
| `react-router-dom` | `BrowserRouter`, `Routes`, `Route`, `Navigate` in `FE/src/App.jsx` | All four found in `FE/src/App.jsx` | Correct |
| `axios` | default import and `axios.create(...)` in `FE/src/services/api.js` | `default` in the same file | Correct |
| `lucide-react` | named `Loader2` in `FE/src/App.jsx` and many other named icons | `Loader2` and source file found | Correct |
| `pdfjs-dist` | namespace `pdfjsLib` plus worker default import in `SubmissionDocumentPreview.jsx` | `GlobalWorkerOptions`, `Util`, `getDocument`, and `default` in the same file | Correct |
| `posthog-js` | default import; `posthog.init/capture/...` in `FE/src/lib/analytics.js` | `default` in the same file | Correct |
| `react-markdown` | default `ReactMarkdown` used as JSX in `MarkdownView.jsx` | `default` in the same file | Correct |
| `remark-gfm` | default `remarkGfm` passed in `remarkPlugins` in `MarkdownView.jsx` | `default` in the same file | Correct |

All eight records had the correct `node:FE` ownership.

### Syntax patterns observed

| Pattern | VinGrade observation |
| --- | --- |
| Named import | Common; confirmed for React, React Router, and Lucide |
| Default import | Confirmed for Axios, PostHog, React Markdown, Remark GFM, and PDF worker subpath |
| Namespace import | `import * as pdfjsLib from 'pdfjs-dist'`; concrete member extraction was correct |
| Constant dynamic dependency import | Not present; constant dynamic imports in `App.jsx` are local relative modules |
| Non-constant dynamic import | Present for a local service path in `TeacherGrading.jsx`; correctly unrelated to dependency indexing |
| Re-export from dependency | Not found in the sampled repository |
| Side-effect dependency import | Not found in the sampled repository |
| Unused import | `React` in `VinUniLogo.jsx` was correctly excluded; unused default `React` in `TeacherDashboard.jsx` was excluded while referenced `useMemo` remained indexed |
| Shadowed dependency import | No real VinGrade example was confirmed |

One file, `FE/src/services/gradingService.js`, failed parsing because line 3 starts with `#`, which is invalid JavaScript outside a hashbang. UpgradeLens isolated it as `SOURCE_PARSE_FAILED` and continued. The file imports only local modules, so this warning did not create a sampled third-party dependency false negative. It is a VinGrade source issue, not an IA-01 parser defect.

## 6. False positives, false negatives, and Impact validation

### Usage false-positive sampling

The following artifact-first records were opened and confirmed as referenced bindings in source:

1. Axios `default` in `FE/src/services/api.js` (`axios.create`).
2. React Router `BrowserRouter` in `FE/src/App.jsx`.
3. Lucide `Loader2` in `FE/src/App.jsx`.
4. PDF.js `Util` in `SubmissionDocumentPreview.jsx` (`pdfjsLib.Util.transform`).
5. PDF.js `getDocument` in the same file.
6. PostHog `default` in `FE/src/lib/analytics.js`.
7. React Markdown `default` in `MarkdownView.jsx`.

**Confirmed usage false positives: none in the sample.**

### Usage false-negative sampling

Source-first searches for React, React Router, Axios, Lucide, PDF.js, PostHog, React Markdown, and Remark GFM all resolved to corresponding Usage Index records with the expected files and symbols.

**Confirmed usage false negatives: none in the sample.**

The parse warning means global completeness is not absolute, but the failed file contains no direct third-party import.

### Impact findings

The final exact-lineage chain had zero breaking findings because every Version Analysis result was skipped. Therefore:

- there were no five impacted findings to sample;
- there were no non-impacted findings to sample;
- the `Modal`/`Modal.info` lexical boundary could not be exercised on a real VinGrade finding;
- no Impact false positive or false negative can be honestly confirmed from the final artifacts.

This is **insufficient upstream knowledge**, not proof that VinGrade is unaffected and not an IA-02 matching bug.

The separate React model probe did return two `breakingChange` records, but both were knowledge-quality problems rather than API changes: “features and optimizations are not available” and “performance improvements ... may not be available.” The result also referred to React `19.3.0` while the artifact target was `19.2.7`. Trust validation downgraded risk to `unknown`, added `CLAIMS_DROPPED`, and required human review, but retained the findings. Since their summaries contained no concrete React API symbol, exact-symbol matching would not establish repository impact. This is an MVP-03/model-output quality issue.

### Evidence

The final Evidence artifact correctly contained:

- 47 dependency records linked to Repository Impact;
- zero finding records;
- zero matched symbols and usage records;
- zero counts for all four reason codes.

Structural lineage passed, but stable finding evidence IDs, finding summaries, reason codes, and file traceability could not be validated on real findings. This remains an uncompleted IA-05 acceptance area.

## 7. Markdown report UX review

### Strengths

- The report is deterministic and valid Markdown.
- Repository, summary counts, package IDs, and dependency ordering match artifacts.
- A developer can identify the output as belonging to directory `C2-App-008`.

### Problems

1. **False reassurance:** the report says `Impacted: No` for all 47 occurrences even though Version Analysis says `analyzedCount: 0`, `skippedCount: 47`, and `requiresHumanReviewCount: 47`.
2. **Missing completeness context:** the report does not show Knowledge availability, analyzed/skipped/failed Version counts, human-review counts, or Usage warnings.
3. **Too noisy:** it renders 47 nearly identical sections saying “No breaking findings,” including Python dependencies that IA-01 cannot inspect for source usage.
4. **Duplicate ambiguity:** `langchain-openai` appears twice without showing manifest occurrence or declared constraint.
5. **Repository naming:** `C2-App-008` is the correct directory identity but less useful to a developer than the product name VinGrade.
6. A developer must open `version-analysis.json` to discover that the apparently safe report is actually incomplete.

Reason codes and affected files would be useful when findings exist, but this run could not assess their real report presentation.

## 8. Determinism result

The two successful runs used the same repository, `--offline`, no cache, no AI runtime, and unchanged source.

### Passed

- Project business payload: identical after removing `generatedAt`.
- Knowledge packages/sources/warnings and counters: identical after removing execution time and lineage metadata.
- Version statuses, dependency facts, versions, findings, limitations, and ordering: identical after removing volatile lineage-derived IDs.
- Usage, Impact, and Evidence business payloads and ordering: identical after removing timestamps, exact-byte lineage digests, and propagated analysis result IDs.
- Markdown report: exact same SHA-256 (`b0f694bcc61e8494384d8132ec2277d0dd474a7394cc5b1b17fb104867f2efb1`).

### Failed

- `researchId`: changed.
- Stable `contextId`: 0 of 47 remained the same.
- Stable Version Analysis result ID: 0 of 47 remained the same.
- Downstream `analysisResultId` references changed accordingly.

Root cause is deterministic but time-coupled identity material: `createResearchId` includes the exact Project Manifest artifact digest; that artifact digest changes because Project Manifest contains `generatedAt`. Dependency context identity then includes exact Project/Knowledge/Evidence digests and `knowledgeResearchId`, and result identity includes `contextId`. Exact-byte lineage itself is correct, but it should not make IDs documented or expected as stable change solely because a new run has a different timestamp.

## 9. Repository safety result

After validation, VinGrade Git status was identical to the baseline status shown in Section 2. `git diff --name-only` still contained only the pre-existing deleted `Makefile`. A timestamp scan found no file modified during IA-05 outside `.upgradelens/`.

No source, manifest, lockfile, dependency, branch, commit, database, or environment file was changed. No package was installed in VinGrade. The only VinGrade path created or updated by validation was `.upgradelens/`.

The final `.upgradelens` contains the second deterministic offline cache-miss run. Old artifacts and the online cache are preserved in the `/private/tmp` backup paths documented above.

## 10. Bugs and technical debt

### P0 — blocks MVP-04

**Report and console conflate “not impacted” with “not analyzed.”**

Validation finding: 47/47 Version Analysis results were skipped, while console and Markdown reported zero impacted dependencies and every dependency as `Impacted: No`.

Root cause: IA-04 renderers read Repository Impact/Evidence counts but do not expose Version Analysis completeness. Repository Impact represents a lack of matched findings as `impacted: false`, even when no upstream finding exists.

Smallest proposed fix: make report input include the existing Version Analysis artifact and render analyzed/skipped/failed/human-review counts. When analysis is incomplete, show an explicit “Analysis incomplete” state and do not label skipped dependencies as a conclusive “Impacted: No.” This is presentation of existing data, not new impact reasoning.

### P1 — should fix before MVP-05

**Stable IDs change across identical runs.** Separate exact-byte lineage from semantic identity material, retain artifact digests in lineage, add a two-run regression test, and document which IDs are run-scoped versus stable if semantics cannot remain stable.

**No viable full real-world Version Analysis result set was produced.** Revalidate with a configured runtime/model that can handle the selected prompt size and 47 sequential occurrences. The local qwen3 path truncated prompts and timed out; qwen2.5 passed one probe but was too slow/unreliable for the full run and produced weak React findings.

**React probe retained non-breaking availability/performance statements as `breakingChange`.** This belongs to MVP-03 trust/output quality, not IA-02. Tighten acceptance of breaking findings so a supported concrete change is required; do not use fuzzy matching to compensate.

### P2 — follow-up improvement

- Compact dependencies with no findings instead of rendering 47 repeated sections.
- Show occurrence/manifest/declared constraint when one package has duplicate declarations.
- Surface Usage Index warning count and analyzer coverage.
- Consider a display name separate from basename-derived repository identity.
- VinGrade should replace the invalid `#` line in `gradingService.js` with valid JavaScript comment syntax, outside this UpgradeLens task.

### Known limitation — accepted for Usage Index 1.0.0

- Python source usage is not analyzed.
- Usage records do not include line, column, snippet, call count, function name, or usage kind.
- Dynamic dependency import coverage is limited to constant specifiers; VinGrade had no such dependency example.
- No real VinGrade re-export, side-effect dependency import, or shadowed import example was available.

## 11. Final recommendation

- **Is MVP-04 complete?** No. The scheduler and artifact lineage work, but the primary report can present completely skipped analysis as a clean non-impact conclusion.
- **Can MVP-05 start?** Not as the next acceptance milestone. Fix the P0 incomplete-analysis presentation first and rerun IA-05.
- **What must be fixed first?** Report/console completeness state, followed by the stable-ID contract and a viable full Version Analysis run.
- **What can be accepted?** JS/TS-only Usage Discovery, absence of line/snippet/call metadata, and lack of Python usage analysis are acceptable declared 1.0.0 limitations.
- **What must be revalidated?** At least five real impacted and five real non-impacted findings, their exact symbol matches, stable evidence IDs, reason codes, and source-file traceability. None can be inferred from the zero-finding degraded run.
