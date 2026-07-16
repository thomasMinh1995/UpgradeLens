# IA-05-RERUN — Real Provider Validation on VinGrade

## 1. Executive verdict

**GO WITH KNOWN LIMITATIONS**

The existing OpenAI-compatible HTTP runtime successfully invoked a configured remote provider, parsed strict structured output, and produced schema-valid Version Analysis results. The progressive validation analyzed three selected frontend dependencies, then the complete VinGrade pipeline analyzed 44 of 47 dependency occurrences with no provider/runtime failures.

IA-04-FIX-01 rendered the mixed result truthfully: 44 analyzed occurrences were `NOT_IMPACTED`, three skipped occurrences were `NOT_ANALYZED`, and the report was `INCOMPLETE`. No skipped occurrence was presented as not impacted.

The principal limitation is the declared IA-01 MVP scope: Usage Discovery currently indexes JavaScript/TypeScript only. Five of the six real breaking findings were for Python dependencies. Manual inspection found that the changed APIs in the sampled findings are not used, but IA-03's `DEPENDENCY_NOT_USED` reason for those Python packages means “absent from the supported usage index,” not proof that the repository does not import the package. MVP-04 is therefore validated for its current JS/TS usage-analysis scope, not as complete polyglot impact coverage.

## 2. Provider configuration

UpgradeLens does not automatically load `.env`. Validation explicitly used the existing ignored local file with `node --env-file=.env`; no secret value was printed or copied into an artifact, command transcript, source file, or this report.

| Setting | Environment variable | Required by selected adapter | Secret | Validation value/status |
| --- | --- | ---: | ---: | --- |
| Provider adapter | `UPGRADELENS_AI_PROVIDER` | Yes, to select OpenAI-compatible mapping | No | `openai-compatible` |
| Endpoint | `UPGRADELENS_AI_ENDPOINT` | Yes | No | configured; host `openrouter.ai` |
| Model | `UPGRADELENS_AI_MODEL` | Yes | No | `openai/gpt-5.5` |
| Authorization | `UPGRADELENS_AI_AUTHORIZATION` | Provider-dependent | Yes | configured |
| Timeout | `UPGRADELENS_AI_TIMEOUT_MS` | No; default is 60000 ms | No | `180000` ms |

The endpoint URL path and authorization value are intentionally not recorded. `UPGRADELENS_AI_DEBUG` was not enabled.

## 3. Commands executed

No command contained a key or authorization value.

```bash
git -C /Users/nguyenducminh/github-classroom/C2-App-008 status --short
git -C /Users/nguyenducminh/github-classroom/C2-App-008 diff --name-only

node ./bin/upgradelens.js discover \
  /Users/nguyenducminh/github-classroom/C2-App-008

node ./bin/upgradelens.js research \
  /Users/nguyenducminh/github-classroom/C2-App-008

node --env-file=.env ./bin/upgradelens.js analyze-version \
  /Users/nguyenducminh/github-classroom/C2-App-008 \
  --package npm:react-router-dom

node --env-file=.env ./bin/upgradelens.js analyze-version \
  /Users/nguyenducminh/github-classroom/C2-App-008 \
  --package npm:react \
  --output .upgradelens/validation/version-analysis-react.json

node --env-file=.env ./bin/upgradelens.js analyze-version \
  /Users/nguyenducminh/github-classroom/C2-App-008 \
  --package npm:axios \
  --output .upgradelens/validation/version-analysis-axios.json

node --env-file=.env ./bin/upgradelens.js analyze \
  /Users/nguyenducminh/github-classroom/C2-App-008
```

Read-only `jq`, `rg`, `sed`, and `find` checks were then used to inspect artifact references, evidence content, report states, source usages, and Git safety. UpgradeLens verification used `npm test`, `npm pack --dry-run --cache /tmp/upgradelens-npm-cache`, and `git diff --check`.

## 4. Progressive validation

### Preparation

The VinGrade `.upgradelens` directory was absent at the start of this rerun, so Project Discovery and online Knowledge Research were run before the provider probe.

The preparation Research run planned 46 unique packages from 47 occurrences. It reported 45 resolved packages, one unavailable package (`npm:vite`), 581 evidence records, zero cache hits, and 46 cache misses.

### Level A — one dependency

Selected `npm:react-router-dom` because it had one clear occurrence, declared constraint `^7.16.0`, registry target `7.18.1`, and publisher release/changelog evidence.

Result:

- one real remote request completed without timeout or retry;
- result status: `analyzed`;
- artifact validation: `valid`, with no validation warning codes;
- target: `7.18.1` from registry evidence;
- baseline: unresolved because the manifest declaration is a constraint, so risk remained `unknown` and required human review;
- finding: a concrete compatibility finding describing the 7.18.1 patch fixes;
- evidence: publisher changelog reference `sha256:4b82f43a882325c485526aaa805ef33a85efb355b09a7688fb3d895ec11575a5` directly contains those fixes.

No unsupported URL or evidence reference survived validation.

### Level B — small frontend set

The cumulative set was `react-router-dom`, `react`, and `axios`. `vite` was excluded because Knowledge Research marked its target unavailable. Three dependencies met the requested minimum, so `pdfjs-dist` was not added merely to increase request volume.

| Dependency | Declared | Target | Status | Findings |
| --- | --- | --- | --- | ---: |
| `npm:react-router-dom` | `^7.16.0` | `7.18.1` | analyzed | 1 compatibility |
| `npm:react` | `^19.2.6` | `19.2.7` | analyzed | 5 compatibility |
| `npm:axios` | `^1.17.0` | `1.18.1` | analyzed | 3 compatibility |

All three outputs were schema-valid and had valid evidence references. There was no timeout, malformed response, schema mismatch, authentication failure, or provider compatibility error. The React output included some low-value compatibility records derived from registry status or unscoped changelog sections; this is model-quality noise, but it did not create breaking impact findings.

### Level C — full VinGrade run

The complete pipeline ran in online Research mode. Research reused 45 fresh registry cache entries and had one miss; it again produced 45 resolved and one unavailable unique package.

Full Version Analysis produced 44 analyzed, three skipped, and zero failed occurrences. Under the one-call-per-eligible-context contract, this is 44 remote AI requests for Level C. Together with Level A and the two additional Level B calls, the progressive exercise made 47 remote requests. No retries or alternative models were used.

The runtime does not publish an aggregate duration, per-result latency, token usage, or billing data in `version-analysis.json`; none is estimated here.

The three skipped occurrences were:

- `npm:vite`: target missing;
- `pypi:langchain-core`: unsupported baseline;
- one occurrence of `pypi:langchain-openai`: unsupported baseline.

Another exact-baseline occurrence of `pypi:langchain-openai` was analyzed, confirming occurrence-level accounting.

## 5. Pipeline counts

| Metric | Count |
| --- | ---: |
| Dependency occurrences | 47 |
| Analyzed | 44 |
| Skipped | 3 |
| Failed | 0 |
| Requires human review | 46 |
| Impacted | 0 |
| Not impacted | 44 |
| Not analyzed | 3 |
| Breaking findings | 6 |
| Impacted findings | 0 |
| Evidence records | 6 |
| Matched symbols | 0 |
| Affected files | 0 |

Version Analysis validation statuses were 44 `valid` and three `validWithWarnings`. The only warning codes were two `BASELINE_UNSUPPORTED` and one `TARGET_MISSING`. Across all results, 217 evidence references resolved to 111 unique included evidence records.

## 6. Manual finding matrix

Five of the six breaking findings were selected. Every selected claim is supported by the referenced publisher release evidence.

| Dependency | Finding | Analyzed | Matched symbol | Source confirmed | Verdict |
| --- | --- | ---: | --- | ---: | --- |
| `pdfjs-dist` | `PageViewport.convertToViewportRectangle` removed in 6.1.200 | Yes | None | Yes: package is used, removed API is not | `CORRECT_NON_IMPACT` |
| `langsmith` | `AsyncClient.projects` accessor removed in 0.10.0 | Yes | None | Yes: repository imports `Client`, not this accessor | `CORRECT_NON_IMPACT` |
| `langsmith` | `online_evaluator` renamed to `evaluator` in 0.9.8 | Yes | None | Yes: no use of either SDK component was found | `CORRECT_NON_IMPACT` |
| `python-dotenv` | `set_key`/`unset_key` symlink behavior changed in 1.2.2 | Yes | None | Yes: repository uses `find_dotenv`/`load_dotenv`, not mutation APIs | `CORRECT_NON_IMPACT` |
| `python-jose` | Python 3.8 support removed in 3.5.0 | Yes | None | Yes: deployed Docker runtime is Python 3.11 | `CORRECT_NON_IMPACT` |

Detailed observations:

- VinGrade imports `pdfjs-dist` in `FE/src/components/shared/SubmissionDocumentPreview.jsx` and uses `GlobalWorkerOptions`, `Util`, `getDocument`, and the namespace value. Neither `PageViewport` nor `convertToViewportRectangle` is used. IA-02/IA-03 correctly returned `NO_EXACT_SYMBOL_USAGE_FOUND`.
- VinGrade imports LangSmith `Client`; no LangSmith `AsyncClient.projects` or `online_evaluator` use was found.
- VinGrade imports python-dotenv's loading helpers only; neither breaking mutation API is used.
- VinGrade imports python-jose's `JWTError` and `jwt`, while its Dockerfile uses Python 3.11. The Python 3.8 platform removal does not affect that runtime.

The unselected sixth finding concerns python-dotenv file-mode preservation and has the same manual non-impact result as the selected symlink finding.

## 7. False positives and false negatives

No confirmed false positive was found among the six breaking findings: each claim is specific and directly supported by publisher evidence.

No confirmed false negative was found in the five manually inspected findings. However, there is a material false-negative risk for Python because IA-01 does not index Python imports in this MVP. `langsmith`, `python-dotenv`, and `python-jose` are demonstrably used in VinGrade source, while IA-03 reports `DEPENDENCY_NOT_USED` for their findings. The sampled changed APIs are not used, so the final non-impact conclusions happen to be correct, but the evidence reason is not a repository-wide Python usage assertion.

## 8. Model and knowledge quality

### Runtime correctness

- OpenAI-compatible request mapping worked with the configured remote endpoint and exact model.
- Strict JSON Schema output parsed successfully.
- There were no provider, authentication, timeout, truncation, or malformed-response failures.
- Package-local skipped states were produced before runtime invocation when target or baseline facts were insufficient.

### Evidence support

- All six breaking findings cite evidence present in the Knowledge Evidence Bundle.
- Manual checks confirmed the cited release content supports each selected claim.
- No invented evidence reference or unsupported URL survived the Trust Layer.

### Finding specificity

- Breaking findings were concrete: removed methods/accessors, renamed SDK surface, changed dotenv mutation behavior, and removed Python runtime support.
- Some non-breaking compatibility findings were noisy or weakly actionable, especially registry-status observations and changelog items without exact release applicability.

### Knowledge/version limitations

- Forty-two results retained `unknown` risk, and 46 required human review.
- Many declarations are ranges, so current versions remain unresolved despite lockfiles being present in the repository. For example, VinGrade's `pdfjs-dist` lock entry is already 6.1.200 while Version Analysis treats the baseline as unresolved and target as 6.1.200.
- The Trust Layer correctly retained uncertainty instead of converting these cases into precise delta claims.

## 9. Report validation

The generated `.upgradelens/repository-impact.md` contains:

- `Status: INCOMPLETE`;
- 44 `NOT_IMPACTED` dependency sections;
- three `NOT_ANALYZED` dependency sections;
- zero `IMPACTED` dependency sections;
- an explicit incomplete-analysis warning;
- six non-impacted breaking finding records matching IA-02/IA-03.

The skipped `vite`, `langchain-core`, and unresolvable `langchain-openai` occurrence use `NOT_ANALYZED` and the safe deterministic skipped message. They do not contain `Impacted: No`. The six `Impacted: No` lines in the report belong only to breaking findings under analyzed dependencies and agree with Repository Impact Evidence.

No report claim was found that was absent from the presentation view model or upstream artifacts.

## 10. Repository safety

Before validation, VinGrade already had a deleted tracked `Makefile` and multiple untracked user files/directories. `.upgradelens` was absent. `git diff --name-only` returned only `Makefile`.

After validation, the same pre-existing changes remained and `.upgradelens/` was newly untracked. `git diff --name-only` still returned only `Makefile`.

Validation did not modify tracked source, `package.json`, requirements files, lockfiles, or manifests, and did not install dependencies. All validation writes were confined to `.upgradelens/`.

## 11. Known limitations

- Usage Discovery is JS/TS-only in IA-01 MVP; Python impact evidence is not source-aware.
- Range declarations do not use lockfiles as exact baselines, leaving most risk classifications unknown.
- No real-provider breaking finding matched a used symbol in this run, so the positive `IMPACTED`/affected-file path was not exercised with live model output; its deterministic implementation remains unit-tested.
- The public Version Analysis artifact omits provider/model identity, latency, and token usage, so those operational facts must be recorded from the controlled configuration/run rather than derived from the artifact.
- Three occurrences remained legitimately not analyzed because of missing target/baseline facts.

## 12. Final recommendation

MVP-04 meets **GO WITH KNOWN LIMITATIONS** for its current JS/TS usage-discovery scope:

- the real provider runtime works;
- real Version Analysis results are produced and evidence-grounded;
- deterministic impact/evidence stages preserve all breaking findings;
- the IA-04 report distinguishes analyzed and not-analyzed states correctly;
- manual inspection found no confirmed false impact conclusion in the sampled findings.

MVP-05 can begin provided product claims continue to state the current language-coverage limitation and do not present Python `DEPENDENCY_NOT_USED` as proof of repository non-use. There is no remaining real-provider blocker. Stable-ID work, Python Usage Discovery, and lockfile baseline resolution remain outside this validation and were not changed.

## 13. Verification

- `npm test`: 403 tests, 402 passed, zero failed, one existing sandbox-related skip because local loopback listeners were unavailable.
- `npm pack --dry-run --cache /tmp/upgradelens-npm-cache`: passed; 132 files, approximately 321.3 kB packed.
- `git diff --check`: passed with no output.
- Secret check: the configured authorization value was absent from all 113 generated/report files inspected.
- VinGrade post-run `git diff --name-only`: only the pre-existing deleted `Makefile`; validation artifacts remained untracked under `.upgradelens/`.
