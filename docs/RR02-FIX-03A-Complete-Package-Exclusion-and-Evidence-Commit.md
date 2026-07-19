# RR02-FIX-03A — Complete Package Exclusion and Validation Evidence Commit

## 1. Root Cause

RR02-FIX-03 committed the actual-tarball guard and npm wiring but did not
commit the matching `package.json.files` exclusion, two assets required by the
guard, or its release-history reports. The implementation was validated from
a dirty snapshot rather than the authoritative committed snapshot.

Consequently, clean HEAD `e0c05b62536b76315c9d19dbe38a48f98b19b3c8`
failed its own package guard. Adding the stopped-run manifest made that
repository-only evidence package-eligible and proved that exclusion was not
effective.

## 2. Baseline HEAD and Three-state Inventory

- Branch: `feat/mvp-05-evidence-migration-checklist`
- Baseline HEAD: `e0c05b62536b76315c9d19dbe38a48f98b19b3c8`
- Subject: `fix: package content guard`
- Index: empty; no pre-existing staged user changes
- Tracked modifications: none
- Untracked task evidence: stopped RR02-RERUN report and empty manifest
- Unrelated user changes: none

| Required item | Working tree | Git index | HEAD | Action |
| --- | --- | --- | --- | --- |
| package capture exclusion | `MISSING` | `MISSING` | `MISSING` | add exact negation |
| actual-tarball guard | `PRESENT_MATCHING` | `MISSING` | `PRESENT_MATCHING` | retain and add FIX-03A exact prefix |
| guard tests/wiring | `PRESENT_MATCHING` | `MISSING` | `PRESENT_MATCHING` | retain and update exact-tree assertion |
| qualification resolution doc | `MISSING` | `MISSING` | `MISSING` | restore from current implementation |
| package content policy | `MISSING` | `MISSING` | `MISSING` | restore from actual package contract |
| FIX-01 report/evidence | `MISSING` | `MISSING` | `MISSING` | restore report; do not fabricate captures |
| FIX-02 report/evidence | `MISSING` | `MISSING` | `MISSING` | restore report; retain tracked progress contract |
| FIX-03 report/evidence | `MISSING` | `MISSING` | `MISSING` | restore reconciled historical report |
| stopped RR02-RERUN report/manifest | `UNTRACKED` | `MISSING` | `MISSING` | preserve and commit |

Historical binary capture trees were not in the working tree, index, commits,
or local report paths at baseline. They were not recreated from memory. The
restored reports explicitly preserve their original verdicts and this evidence
limitation.

## 3. Implementation Summary

- Added path-specific `!docs/*-cli-captures` npm exclusion.
- Extended the guard's reviewed exact-prefix inventory through FIX-03A while
  retaining its future naming-convention rule.
- Added qualification-resolution and package-content user documentation that
  matches the current runtime.
- Restored the RR-02, FIX-01, FIX-02, and FIX-03 release decision chain.
- Preserved the stopped RR02-RERUN report and manifest.
- Added three sanitized clean-install CLI capture bundles for version, help,
  and default offline analysis.
- Changed no `src/**` production file, schema, dataset, qualification record,
  progress semantics, migration behavior, or version.

## 4. Scoped Commit Inventory

| Category | Files staged | Files committed | Validation |
| --- | ---: | ---: | --- |
| Package config/guard | 3 | 3 | guard tests and actual tarball |
| Required user docs | 2 | 2 | required-path assertions |
| Remediation reports | 5 | 5 | historical verdict review |
| CLI capture evidence | 20 | 20 | manifest/privacy/PNG validation |
| Validation report | 1 | 1 | staged scope and Markdown review |
| Unrelated files | 0 | 0 | three-state status review |

The reviewed total is 31 files. The capture category consists of the stopped
manifest plus 19 FIX-03A capture files.

## 5. Package Exclusion and Required Assets

The package includes user-facing `docs` and then excludes only direct-child
`docs/*-cli-captures`. Actual tar inspection finds zero capture paths and zero
capture helpers while retaining:

- `docs/cli-progress.md`;
- `docs/migration-planning-qualification-resolution.md`;
- `docs/package-content-policy.md`;
- both Migration Planning datasets;
- the qualification-record and extractive-candidate schemas;
- executable and public runtime entry points.

The guard still fails on an injected forbidden capture path and on a missing
required asset. Required docs were not removed from the guard to obtain a
pass.

## 6. Working-tree Validation

| Gate | Result |
| --- | --- |
| Package guard focused tests | 7 passed, 0 failed |
| Actual-tarball package guard | passed; 0 captures; 15 required assets |
| Qualification/progress/orchestration | 27 passed, 0 failed |
| MP regression set | 107 passed, 0 failed |
| Full suite, serial | 537 passed, 0 failed, 1 sandbox-only skip |
| Isolated package install | passed; 12 packages installed offline |
| Packaged public import | passed |
| Captured packaged CLI | version/help/default analyze exited 0 |
| Default analyze | 7/7 stages; no Migration Checklist |
| Capture manifest | 3/3 entries complete |
| Secret/absolute-path/ANSI scan | passed |
| PNG metadata | 3 files; no metadata |

The default concurrent `npm test` mode was run twice and each run exposed the
same existing resource-sensitive timeout: the HTTP lifecycle child was killed
at approximately three seconds while 536 tests passed and one sandbox test was
skipped. The exact failing test passed alone and the complete repository suite
passed with `--test-concurrency=1`. No production or test timeout was changed
in this packaging-only task.

## 7. Staged-snapshot Validation

The exact Git index was exported with `git checkout-index` into an isolated
temporary directory. It did not read unstaged repository files. The staged
snapshot passed focused guard tests, actual-tarball checking, package entry
assertions, isolated install, packaged public import and smoke equivalence,
focused qualification/progress regressions, the full serial suite, privacy
checks, and whitespace checks.

Capture files exist in the staged snapshot and remain absent from its tarball.

## 8. Commit Result

Subject: `fix: complete package evidence exclusion`

The authoritative SHA is the Git commit containing this report. A file cannot
contain the cryptographic SHA of the commit that contains that same file
without changing the commit object; the exact SHA is therefore recorded in
the post-commit task handoff. No amend or second bookkeeping commit is used.

## 9. Post-commit HEAD Validation

Post-commit validation is performed after this report becomes immutable in the
single authorized commit. The handoff records the exact commit SHA, final
tarball sizes and digests, clean-snapshot checks, and final worktree status.

The committed tree is required to match the already validated index byte for
byte. A clean archive of that HEAD must pass the guard, fresh pack, entry
assertions, isolated install, package smoke equivalence, focused regressions,
full serial suite, final dry run, privacy scan, and scope checks before the
task verdict can be released.

## 10. CLI Capture Evidence

`docs/rr02-fix-03a-cli-captures/manifest.json` contains one entry per direct
UpgradeLens CLI invocation used for package smoke:

1. packaged `--version`;
2. packaged `--help`;
3. packaged default `analyze <fixture> --offline --progress plain`.

Each bundle contains command, constrained environment, raw and clean
transcripts, metadata, exit code, and final-screen PNG. All three invocations
used the clean-installed tarball, exited zero, made zero provider requests,
and contain no private path. The public import smoke is an application API
check, not a CLI invocation.

## 11. Before/After Tarball Comparison

| Metric | Failing baseline HEAD | Completed working tree before this report |
| --- | ---: | ---: |
| Files | 197 | 204 |
| Compressed bytes | 471,310 | 478,775 |
| Unpacked bytes | 1,881,500 | 1,903,779 |
| npm SHA-1 | `76eadf38bf7c50ebd9c4a90397789fb7075f1336` | `f9e6ee764cd47dc71e86a57fa66c29375b35250f` |
| SHA-256 | `04e737d90630674f7a6633b196c1d6a00a33ebd7876a25410301902a0590db70` | `f3f18ef80ec196e8dec38e3358feddf028e9a2bdae14d5971f7da7b5716c06c9` |
| Required docs missing | 2 | 0 |
| Capture entries | exclusion ineffective | 0 |

Adding this package-visible completion report changes final package byte
metrics without changing the content-policy result. Final committed metrics
are recorded after the commit in the task handoff.

## 12. Regression and Privacy Results

No real provider, registry network, requalification, VinGrade mutation, raw
provider payload, credential, authorization material, private endpoint, or
hidden reasoning was used. Reports and captures passed secret-pattern,
machine-path, ANSI/control, relative-link, and PNG metadata scans.

`git diff --check`, staged `git diff --cached --check`, forbidden-path scans,
and generated-artifact checks cover Markdown whitespace, tarballs,
`node_modules`, caches, and temporary directories.

## 13. Remaining Worktree State

The expected post-commit state is clean because both baseline untracked files
are intentionally included in the reviewed scope and there were no unrelated
changes. Final `git status --short`, index status, and untracked inventory are
reported from post-commit HEAD rather than predicted here.

## 14. Compatibility and Scope Confirmation

The remediation is package-boundary and documentation-only. It preserves the
public runtime version and exports, Node requirement, CLI defaults, sequential
pipeline, qualification precedence, fail-closed behavior, progress contract,
Impact/Evidence logic, Extractive Contract, and Migration Checklist
experimental status.

No AI call, provider call, internet research, source migration, version bump,
push, tag, publish, or release is part of this task.

## 15. Remaining Risks

- Historical RR-02/FIX-01/FIX-02/FIX-03 screenshots were never committed and
  cannot be recovered faithfully; the reports disclose this rather than
  manufacturing evidence.
- The concurrent full-suite lifecycle test has a three-second child timeout
  that is resource-sensitive under full parallel load. It passes in isolation
  and the entire suite passes serially. Any timeout/concurrency redesign is a
  separate test-infrastructure task.
- Final commit SHA and post-commit tarball digest are temporal results and must
  be retained with this report's release handoff.

## 16. Next Decision

Verdict, contingent on the recorded post-commit clean-HEAD gates:
**`READY_TO_RESUME_RR02_RERUN_FROM_COMMITTED_HEAD`**.

Resume RR02-RERUN at RERUN-001 from the new commit, build a fresh tarball,
recheck qualification identity without requalification when it has not
drifted, capture every new product invocation, and keep Migration Checklist
experimental. Do not reuse the FIX-03A validation tarball.
