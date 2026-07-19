# OSS-01 — Duplicate Artifact Investigation & Cleanup

## 1. Executive verdict

**Verdict: `TARBALL_HYGIENE_RESTORED_WITH_REVIEW_ITEMS`**

The package drift was reproduced and bounded. The 304-entry tarball contained 76
unintended numeric-suffix copies; every one was an untracked, byte-identical copy of
an existing canonical source or schema file, with no path reference, Git history, or
contract identity. A further 32 exact copies in `eval/`, `scripts/`, and `test/` were
not packaged but belonged to the same artifact set. Those 108 files were removed
only after per-file evidence was collected. No canonical file was changed.

Nine exact copies inside an untracked CLI-capture tree and one ignored `.DS_Store`
remain as non-packaged review items because this task's safety boundary prohibits
deleting unrelated retained evidence or ignored metadata. Two broad-scan matches are
intentional tracked files. None of the 12 retained matches enters the final package
except the intentional TS-FIX-01 architecture document.

## 2. Release gate impact

The previous 228-file release-candidate qualification was invalidated by current
working-tree package drift and could not authorize a publish. OSS-01 restores a
fully explained package boundary and closes the duplicate-artifact blocker, but it
does not authorize a public preview, tag, release, or npm publish.

**Next gate: `PROCEED_TO_OSS_02_PACKAGE_GUARD_HARDENING`**

## 3. Initial branch, commit and dirty-worktree state

The safety-baseline commands were captured before cleanup.

| Field | Initial value |
| --- | --- |
| Branch | `fix/public-preview-readiness` |
| Commit | `74d57344db254d0109ea951dc7c44853cdad9be0` |
| Tracked diff | Clean; `git diff --stat` and `git diff --name-status` had no output |
| Untracked state | Two pre-existing release-review reports, multiple CLI-capture/evidence trees, and the duplicate-suffixed candidate set |
| Ignored relevant match | Root `.DS_Store` |
| Package version | `0.5.0` |

The worktree was not globally clean, so all existing untracked reports, captures,
qualification material, and other review output were treated as user-owned. No
reset, clean, restore, checkout, broad glob deletion, or bulk filesystem deletion was
used.

## 4. Reproduced tarball count and manifest digest

The canonical pack workflow was run with an isolated npm cache. The actual tarball
was extracted and inventoried by relative path, byte size, mode, SHA-256 content
digest, top-level directory, and repository Git state.

| Measurement | Initial reproduced package |
| --- | --- |
| Entry count | 304 |
| npm package size | 593,013 bytes |
| npm unpacked size | 2,935,134 bytes |
| npm SHA-1 | `b3e053c5fe34a7596bec8962916a84459e1fba70` |
| Deterministic content-manifest digest | `sha256:9db3d6d5c03fa349b78bb1f607aff08468e83c5586867813b2b37f0e5d16092e` |
| Suspicious packaged paths | 77: 76 exact artifacts plus one intentional architecture document |

The 228-to-304 comparison used the same npm package boundary. The full 76-entry
increase is accounted for by 9 schema copies and 67 source copies. The two
pre-existing release-review reports were already included in the verified 228-entry
candidate, so they do not explain any part of this drift. `package.json` publishes
the broad `schemas` and `src` trees; the current guard checked required and forbidden
content but did not reject duplicate-style filenames, allowing untracked copies to
enter the tarball.

## 5. Complete candidate inventory

Candidate discovery walked the repository without shell filename expansion and
checked numeric suffixes, parenthesized numeric suffixes, copy/duplicate labels,
editor backup suffixes, swap/temporary suffixes, and `.DS_Store`. It safely handled
whitespace and nested paths; no symlink candidate, newline-bearing filename, Unicode
normalization collision, case-only collision, parenthesized/copy/backup/swap match,
or tarball artifact was found.

| Classification | Count | Packaged initially | Decision |
| --- | ---: | ---: | --- |
| `EXACT_DUPLICATE` | 117 | 76 | Delete 108 task-scope artifacts; retain 9 non-packaged captures |
| `INTENTIONAL_FILE` | 2 | 1 | Retain |
| `ORPHAN_ARTIFACT` | 1 | 0 | Retain ignored OS metadata |
| `NON_SEMANTIC_DUPLICATE` | 0 | 0 | None |
| `DIVERGENT_COPY` | 0 | 0 | None |
| `REQUIRES_HUMAN_REVIEW` | 0 | 0 | None |
| **Total** | **120** | **77** | **108 deleted, 12 retained** |

The 108 deletion candidates break down as 2 `eval`, 9 `schemas`, 6 `scripts`, 67
`src`, and 24 `test` files. The 76 packaged deletion candidates are exactly the 9
schema and 67 source files.

## 6. Per-file evidence table

For each `E1` row, both files were read as bytes and independently SHA-256 hashed:
the two full hashes matched, direct byte comparison passed, normalized-text
comparison passed, and candidate-only/canonical-only unique-line counts were `0/0`.
The candidate was untracked, absent from all Git history, unreferenced by exact path
or basename, and had no import, export, schema-loader, test-discovery, package,
documentation, dataset, manifest, or qualification identity. `E2` is the same proof,
but deletion is outside scope because the path is retained non-packaged capture
evidence. `I1` denotes a tracked/history-backed intentional identity. `O1` denotes
ignored OS metadata with no canonical sibling and no package membership.

| Candidate | Canonical sibling | Git state | Packaged | Byte-identical | Normalized-identical | Unique lines | Referenced by source | Referenced by package/docs/tests | Classification | Proposed action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `.DS_Store` | — | ignored; history=no | no | n/a | n/a | n/a | none | ignore rule only | `ORPHAN_ARTIFACT` | RETAIN (O1) |
| `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/01-start 2.png` | `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/01-start.png` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | RETAIN (E2) |
| `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/02-progress 2.png` | `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/02-progress.png` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | RETAIN (E2) |
| `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/03-final 2.png` | `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/03-final.png` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | RETAIN (E2) |
| `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/command 2.txt` | `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/command.txt` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | RETAIN (E2) |
| `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/environment 2.json` | `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/environment.json` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | RETAIN (E2) |
| `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/final-screen 2.png` | `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/final-screen.png` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | RETAIN (E2) |
| `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/metadata 2.json` | `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/metadata.json` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | RETAIN (E2) |
| `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/transcript.clean 2.txt` | `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/transcript.clean.txt` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | RETAIN (E2) |
| `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/transcript.raw 2.txt` | `docs/rr02-rerun-cli-captures/003-rerun-002-default-tty-auto/transcript.raw.txt` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | RETAIN (E2) |
| `docs/ts-fix-01-exact-duplicate-occurrence-target-selection-architecture.md` | — | tracked; history=yes | yes | n/a | n/a | n/a | none | tracked historical document identity | `INTENTIONAL_FILE` | RETAIN (I1) |
| `eval/migration-planning/golden-dataset 2.json` | `eval/migration-planning/golden-dataset.json` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `eval/migration-planning/golden-dataset-v2 2.json` | `eval/migration-planning/golden-dataset-v2.json` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `schemas/migration-checklist-extractive-candidate.schema 2.json` | `schemas/migration-checklist-extractive-candidate.schema.json` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `schemas/migration-checklist.schema 2.json` | `schemas/migration-checklist.schema.json` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `schemas/migration-checklist.schema 3.json` | `schemas/migration-checklist.schema.json` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `schemas/migration-evaluation-dataset-v2.schema 2.json` | `schemas/migration-evaluation-dataset-v2.schema.json` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `schemas/migration-evaluation-dataset.schema 2.json` | `schemas/migration-evaluation-dataset.schema.json` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `schemas/migration-evaluation-dataset.schema 3.json` | `schemas/migration-evaluation-dataset.schema.json` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `schemas/migration-planning-qualification-record.schema 2.json` | `schemas/migration-planning-qualification-record.schema.json` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `schemas/migration-planning-qualification-record.schema 3.json` | `schemas/migration-planning-qualification-record.schema.json` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `schemas/upgrade-decision.schema 2.json` | `schemas/upgrade-decision.schema.json` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `scripts/mp-r05-cli-captures 2.mjs` | `scripts/mp-r05-cli-captures.mjs` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `scripts/package-content-guard 2.mjs` | `scripts/package-content-guard.mjs` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `scripts/render-cli-transcript 2.py` | `scripts/render-cli-transcript.py` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `scripts/render-cli-transcript 3.py` | `scripts/render-cli-transcript.py` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `scripts/rr02-fix-01-captures 2.mjs` | `scripts/rr02-fix-01-captures.mjs` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `scripts/rr02-fix-01-captures 3.mjs` | `scripts/rr02-fix-01-captures.mjs` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/cooperative-scheduler 2.js` | `src/cooperative-scheduler.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/cooperative-scheduler 3.js` | `src/cooperative-scheduler.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/impact/status 2.js` | `src/impact/status.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/installed-version-baseline 2.js` | `src/installed-version-baseline.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/ai-candidate 2.js` | `src/migration-checklist/ai-candidate.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/ai-candidate 3.js` | `src/migration-checklist/ai-candidate.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/assembler 2.js` | `src/migration-checklist/assembler.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/assembler 3.js` | `src/migration-checklist/assembler.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/context-runtime 2.js` | `src/migration-checklist/context-runtime.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/action-criteria 2.js` | `src/migration-checklist/evaluation/action-criteria.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/comparator 2.js` | `src/migration-checklist/evaluation/comparator.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/comparator-v2 2.js` | `src/migration-checklist/evaluation/comparator-v2.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/dataset 2.js` | `src/migration-checklist/evaluation/dataset.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/dataset-v2 2.js` | `src/migration-checklist/evaluation/dataset-v2.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/extractive-fixtures-v2 2.js` | `src/migration-checklist/evaluation/extractive-fixtures-v2.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/metrics 2.js` | `src/migration-checklist/evaluation/metrics.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/metrics-v2 2.js` | `src/migration-checklist/evaluation/metrics-v2.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/qualification 2.js` | `src/migration-checklist/evaluation/qualification.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/qualification-v2 2.js` | `src/migration-checklist/evaluation/qualification-v2.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/runner 2.js` | `src/migration-checklist/evaluation/runner.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/runner-v2 2.js` | `src/migration-checklist/evaluation/runner-v2.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/scorecard 2.js` | `src/migration-checklist/evaluation/scorecard.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/evaluation/scorecard-v2 2.js` | `src/migration-checklist/evaluation/scorecard-v2.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/extractive-candidate 2.js` | `src/migration-checklist/extractive-candidate.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/extractive-candidate 3.js` | `src/migration-checklist/extractive-candidate.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/extractive-prompt 2.js` | `src/migration-checklist/extractive-prompt.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/extractive-prompt 3.js` | `src/migration-checklist/extractive-prompt.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/generator 2.js` | `src/migration-checklist/generator.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/generator 3.js` | `src/migration-checklist/generator.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/grounding-policy 2.js` | `src/migration-checklist/grounding-policy.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/grounding-policy 3.js` | `src/migration-checklist/grounding-policy.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/input-loader 2.js` | `src/migration-checklist/input-loader.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/migration-checklist 2.js` | `src/migration-checklist/migration-checklist.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/migration-checklist 3.js` | `src/migration-checklist/migration-checklist.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/presentation 2.js` | `src/migration-checklist/presentation.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/presentation 3.js` | `src/migration-checklist/presentation.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/progress 2.js` | `src/migration-checklist/progress.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/progress 3.js` | `src/migration-checklist/progress.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/prompt 2.js` | `src/migration-checklist/prompt.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/prompt 3.js` | `src/migration-checklist/prompt.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/qualification-guard 2.js` | `src/migration-checklist/qualification-guard.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/qualification-guard 3.js` | `src/migration-checklist/qualification-guard.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/qualification-resolution 2.js` | `src/migration-checklist/qualification-resolution.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/qualification-resolution 3.js` | `src/migration-checklist/qualification-resolution.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/qualification-store 2.js` | `src/migration-checklist/qualification-store.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/qualification-store 3.js` | `src/migration-checklist/qualification-store.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/runtime 2.js` | `src/migration-checklist/runtime.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/runtime 3.js` | `src/migration-checklist/runtime.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/verification 2.js` | `src/migration-checklist/verification.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/verification 3.js` | `src/migration-checklist/verification.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/writer 2.js` | `src/migration-checklist/writer.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/migration-checklist/writer 3.js` | `src/migration-checklist/writer.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/orchestration/progress-events 2.js` | `src/orchestration/progress-events.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/orchestration/progress-events 3.js` | `src/orchestration/progress-events.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/product-completion 2.js` | `src/product-completion.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/product-completion 3.js` | `src/product-completion.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/target-selector 2.js` | `src/target-selector.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/target-selector 3.js` | `src/target-selector.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/upgrade-decision/input-loader 2.js` | `src/upgrade-decision/input-loader.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/upgrade-decision/input-loader 3.js` | `src/upgrade-decision/input-loader.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/upgrade-decision/presentation 2.js` | `src/upgrade-decision/presentation.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/upgrade-decision/presentation 3.js` | `src/upgrade-decision/presentation.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/upgrade-decision/runtime 2.js` | `src/upgrade-decision/runtime.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/upgrade-decision/runtime 3.js` | `src/upgrade-decision/runtime.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/upgrade-decision/upgrade-decision 2.js` | `src/upgrade-decision/upgrade-decision.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/usage/coverage 2.js` | `src/usage/coverage.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `src/usage/coverage 3.js` | `src/usage/coverage.js` | untracked; history=no | yes | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/cooperative-scheduling.test 2.js` | `test/cooperative-scheduling.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/cooperative-scheduling.test 3.js` | `test/cooperative-scheduling.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/ecosystem-coverage-impact.test 2.js` | `test/ecosystem-coverage-impact.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/fixtures/knowledge-manifest/duplicate-occurrence.json` | — | tracked; history=yes | no | n/a | n/a | n/a | none | exact test-fixture identity | `INTENTIONAL_FILE` | RETAIN (I1) |
| `test/installed-version-baseline.test 2.js` | `test/installed-version-baseline.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-context-runtime.test 2.js` | `test/migration-checklist-context-runtime.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-contract.test 2.js` | `test/migration-checklist-contract.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-contract.test 3.js` | `test/migration-checklist-contract.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-evaluation-v2.test 2.js` | `test/migration-checklist-evaluation-v2.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-evaluation.test 2.js` | `test/migration-checklist-evaluation.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-evaluation.test 3.js` | `test/migration-checklist-evaluation.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-extractive-experiment.test 2.js` | `test/migration-checklist-extractive-experiment.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-extractive-production.test 2.js` | `test/migration-checklist-extractive-production.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-generator.test 2.js` | `test/migration-checklist-generator.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-generator.test 3.js` | `test/migration-checklist-generator.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-orchestration.test 2.js` | `test/migration-checklist-orchestration.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-checklist-orchestration.test 3.js` | `test/migration-checklist-orchestration.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/migration-handoff.test 2.js` | `test/migration-handoff.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/package-content-guard.test 2.js` | `test/package-content-guard.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/package-content-guard.test 3.js` | `test/package-content-guard.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/product-completion-cli.test 2.js` | `test/product-completion-cli.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/progress-orchestration.test 2.js` | `test/progress-orchestration.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/progress-orchestration.test 3.js` | `test/progress-orchestration.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/target-selector.test 2.js` | `test/target-selector.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |
| `test/upgrade-decision.test 2.js` | `test/upgrade-decision.test.js` | untracked; history=no | no | yes; same SHA-256 | yes | 0/0 | none | none | `EXACT_DUPLICATE` | DELETE (E1) |

## 7. Root-cause assessment and confidence

**`PROBABLE_ROOT_CAUSE` — medium confidence.**

The evidence is a coherent, untracked set of literal `" 2"` and `" 3"` copies
spanning source, schema, tests, evaluation data, and helper scripts. Each copy is
byte-identical to a canonical sibling, no candidate ever appeared in Git history,
and repository scripts contain no generator that writes numeric-suffixed source
names. File timestamps are clustered, but were used only as correlation.

This is most consistent with an external filesystem copy/conflict event such as a
Finder duplicate, cloud-sync conflict copy, editor/file-manager copy, archive
restoration, or prior tooling operation. The repository cannot distinguish the
specific actor, so no `CONFIRMED_ROOT_CAUSE` claim is made. Merge resolution is
unlikely because Git has no index/history trace; generated output is unlikely
because the same operation copied hand-authored sources, schemas, tests, and scripts.
The packaging configuration did not create the files, but its broad directory
inclusion and missing suspicious-name rule allowed 76 of them to ship.

## 8. Files deleted, retained, recovered or escalated

| Outcome | Count | Detail |
| --- | ---: | --- |
| Deleted | 108 | Explicitly reviewed exact copies: 2 eval, 9 schema, 6 script, 67 source, 24 test |
| Retained | 12 | 9 non-packaged capture copies, 1 ignored `.DS_Store`, 2 intentional tracked files |
| Recovered/ported | 0 | No unique content existed to recover |
| Escalated | 0 | No divergent or ownership-ambiguous packaged artifact remained |

Deletion was performed with an explicit path list after evidence collection. No
canonical sibling, capture copy, ignored file, qualification record, user report, or
other pre-existing output was deleted.

## 9. Proof that no unique change was lost

All 108 deleted files met the `EXACT_DUPLICATE` contract before deletion:

- candidate and canonical SHA-256 digests matched;
- direct byte comparison succeeded, which is stronger than formatting-based
  semantic inference;
- normalized comparison also succeeded and unique-line deltas were `0/0`;
- every candidate was untracked and absent from all reachable Git history;
- exact relative-path and basename reference scans returned no references;
- canonical siblings remain present, including all package-required schemas and
  runtime modules;
- no JS import/export, schema identity, dataset registry, manifest, test-discovery,
  or qualification identity belonged to a candidate path;
- post-cleanup canonical tests, package guard, packaged import, schema/dataset
  identity checks, and clean-install smoke passed.

There were no byte-different candidates, so no semantic merge judgment or hunk port
was needed. The cleanup cannot remove a change that existed only in a candidate
because byte equality proves each candidate's content already exists in its retained
canonical sibling.

## 10. Before/after tarball comparison

| Package state | Entries | Manifest digest | Explanation |
| --- | ---: | --- | --- |
| Initial reproduced | 304 | `sha256:9db3d6d5c03fa349b78bb1f607aff08468e83c5586867813b2b37f0e5d16092e` | Included 76 unintended exact copies |
| Cleanup, before this report | 228 | `sha256:50c3d79e5a2b5b361cac105bc8d19196467279c91299f53de3e2691f897693bb` | Exactly 76 duplicate entries removed |
| Final, including this report | 229 | `sha256:50c3d79e5a2b5b361cac105bc8d19196467279c91299f53de3e2691f897693bb` for the stable 228-entry release-content subset; the self-referential report entry verified separately | One intentional public OSS-01 report added |

No required asset disappeared. The initial-to-pre-report entry delta is exactly
`-76`; the pre-report-to-final delta is exactly `+1` and is this report. The final
manifest is therefore explained by content identity rather than by forcing a target
count.

Two consecutive final `npm pack` executions from the same source state produced
byte-identical tarballs. The report records the stable digest of every package entry
other than itself because embedding a digest that includes this report would mutate
the digest it claims to record.

## 11. Remaining suspicious-file scan

| Scope | Remaining match | Classification | Package impact |
| --- | --- | --- | --- |
| Working tree | 9 numeric-suffix files under the existing RR02 CLI-capture directory | `EXACT_DUPLICATE`, retained evidence | Excluded by package `files` rules; not packaged |
| Working tree | `.DS_Store` | `ORPHAN_ARTIFACT`, ignored OS metadata | Not packaged |
| Working tree and tarball | `docs/ts-fix-01-exact-duplicate-occurrence-target-selection-architecture.md` | `INTENTIONAL_FILE`; tracked historical architecture identity | Intentionally packaged |
| Working tree and tarball | `docs/reviews/oss-01-duplicate-artifact-investigation-cleanup.md` | `INTENTIONAL_FILE`; this task's required report | Intentionally packaged |
| Working tree | `test/fixtures/knowledge-manifest/duplicate-occurrence.json` | `INTENTIONAL_FILE`; tracked fixture referenced by tests | Tests are not packaged |

The extracted final tarball has no unintended numeric/copy/backup/editor artifact,
`.DS_Store`, capture/runtime output, `.env`, credential, local qualification
input/record, unexpected tarball, or Git metadata. The only broad-word match is the
intentional architecture document and this required investigation report. Existing
historical documentation may contain previously reported local-path examples; that
known Medium package-hygiene item is not duplicate drift and was not changed in
OSS-01.

## 12. Tests, package guard, clean install and exports

| Check | Result |
| --- | --- |
| `git diff --check` | Pass |
| Canonical `npm test` | 616 total: 615 pass, 0 fail, 1 known sandbox-loopback skip |
| `npm run check:package` | Pass; required assets present and capture count zero |
| `npm pack --dry-run --json` | Pass; final entry count explained |
| Actual tarball extraction | Pass; bytes inventoried and suspicious-name scan clean |
| Repeat-pack determinism | Pass; consecutive tarballs were byte-identical |
| Clean install from final tarball | Pass |
| Packaged CLI `--version` | Pass: `0.5.0` |
| Packaged CLI `--help` | Pass |
| ESM package import | Pass |
| Public export count | Pass: 438 |
| Schema loading/validation | Pass |
| Evaluation dataset and qualification identity | Pass; deterministic, no provider call |

## 13. Blocked/skipped checks

No release-hygiene check was blocked. One canonical test remains skipped because the
sandbox does not provide the loopback listener required by that online CLI test; it
is the same known baseline skip, not introduced by cleanup. Real-provider execution
was deliberately not run because it is a non-goal. No target repository was changed
and no qualification record was regenerated.

## 14. Defects by severity

| Severity | Count | Status |
| --- | ---: | --- |
| Blocker | 0 | None |
| High | 0 | None |
| Medium | 2 | Root-cause actor remains uncertain; package guard does not yet reject duplicate-style package drift |
| Low/review | 2 | Nine unrelated capture copies and ignored `.DS_Store` remain outside the package |

The Medium items do not leave an ambiguous or unintended file in the tarball. Guard
hardening is explicitly the next gate.

## 15. Package-guard follow-up requirements

OSS-02 should add deterministic checks without treating every occurrence of words
such as `duplicate` as an error:

1. Reject numeric duplicate suffixes (`" 2"`, `" 3"`, and parenthesized variants)
   in protected packaged directories such as `src/`, `schemas/`, and published eval
   assets.
2. Reject copy, backup, editor temporary, swap, `.DS_Store`, and archive artifacts
   in the actual tarball.
3. Detect unexpected untracked packaged source, schema, and eval files while
   preserving intentional tracked names such as the TS-FIX-01 document and
   `duplicate-occurrence.json` fixture.
4. Compare an extracted actual-tarball manifest, not only source-tree expectations,
   and surface explained additions/removals with a deterministic digest.
5. Add regression fixtures for whitespace, nested paths, shell-special characters,
   Unicode/case behavior, symlinks, and intentional false positives.

No OSS-02 implementation is mixed into this cleanup.

## 16. Exact files changed/created by this task

- Created `docs/reviews/oss-01-duplicate-artifact-investigation-cleanup.md`.
- Removed 108 untracked, exact duplicate artifacts listed as `DELETE` in the
  per-file evidence table: 2 eval, 9 schema, 6 script, 67 source, and 24 test files.
- Changed no tracked production source, schema, test, package metadata, version, or
  canonical asset.

Because the removed artifacts were untracked, Git can show the new report but cannot
represent their deletion as a tracked diff.

## 17. Pre-existing changes preserved

The two untracked v0.5.0 review reports, all RR02/RR02-FIX-05 capture and rerun
evidence, the nine numeric-suffix capture copies, ignored `.DS_Store`, ignored
qualification material, and all unrelated untracked review output were preserved.
The branch, commit, `package.json` version, npm metadata, target repository, and
provider state were not changed. No commit, merge, tag, push, GitHub Release, npm
publish, or real-provider call was performed.

## 18. Final verdict and next gate

**Verdict: `TARBALL_HYGIENE_RESTORED_WITH_REVIEW_ITEMS`**

All suspicious candidates have a decision; every deletion has byte-level proof; no
unique content was lost; no unintended copy artifact remains in the actual tarball;
manifest deltas are fully explained; canonical tests, package verification, clean
installation, CLI/import/export, and schema/dataset identity checks pass; and there
is no Blocker or High defect. The retained review items are non-packaged evidence or
ignored metadata, and the precise external actor that created the copies cannot be
confirmed from repository evidence.

**Gate: `PROCEED_TO_OSS_02_PACKAGE_GUARD_HARDENING`**

This gate permits only the next hygiene task. It does not authorize a public preview,
tag, release, or publish.
