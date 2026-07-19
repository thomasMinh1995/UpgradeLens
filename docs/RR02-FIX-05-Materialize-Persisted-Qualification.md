# RR02-FIX-05 — Materialize Persisted Real-provider Qualification

## 1. Executive Verdict

**`QUALIFICATION_MATERIALIZED_AND_RELEASE_GATES_PASS`**

v0.5.0 readiness: **`GO_V0_5_0_WITH_NON_BLOCKING_UX_FOLLOWUPS`**.
Migration Checklist default enablement: **`KEEP_EXPERIMENTAL`**.

## 2. Why Materialization Was Required

RR02-RERUN proved the packaged FIX-04 heartbeat, cancellation, package and UX
gates, but stopped at `BLOCKED_BY_QUALIFICATION_INPUT`. Markdown evidence was
correctly rejected as runtime input. FIX-05 located the original structured
RR-01-RERUN evaluation and projected its unchanged qualification through the
supported atomic writer.

## 3. Source Search and Provenance

Search was limited to repository artifacts, report-referenced RR-01 outputs
and scoped temporary RR-01 acceptance locations that were not retained.

| Candidate source | Machine-readable | Runtime mode | Identity match | Verdict | Selected |
| --- | --- | --- | --- | --- | --- |
| `rr01-real-migration-evaluation.json` | Full v1 report | real | No, v1 task | `NOT_QUALIFIED` | No |
| `upgradelens-rr01-rerun-real-evaluation.json` | Full v2 report | real | Exact | `QUALIFIED` | Yes |
| RR-01 controlled/VinGrade result JSON files | ID/transcript only | real | Not independently validatable | N/A | No |
| RR-01 Markdown reports | Prose only | N/A | Rejected | N/A | No |

Selected source provenance:

- artifact ID: `upgradelens-rr01-rerun-real-evaluation.json`;
- source bytes: 118,466;
- source SHA-256:
  `09fa990a934135ca94efc5ff4387c286fd52ad2d9199285f135ddb24810aa376`;
- qualification-object canonical SHA-256:
  `05613e763f7a972942761ad68a10ed976ce9e7cd5a9a296fc8a2abc94fc57b68`;
- generatedAt: `2026-07-17T03:32:16.710Z`;
- original provider requests: 7;
- source mutated before writer projection: **NO**.

Only the selected file contained the complete strict qualification object.
Other files containing the same ID were pipeline observations, not competing
qualification sources.

## 4. Current Identity

- task: `migration-planning.v2`;
- dataset: `migration-planning-golden@2.0.0`;
- dataset digest: `sha256:c15089381612671c62c3b565d93ad4f5dff1705317ee9622d9ee12a68028d407`;
- criteria: `migration-action-evaluation@1.0.0`;
- criteria digest: `sha256:3e2d7c3e32794d2acb59fb834609806e7700cc6888780ffd3d26d1f106078ccc`;
- comparator/normalization: `2.0.0` / `1.0.0`;
- policy: `3.0.0`,
  `sha256:b463a30d8044aed5aa8565fc08824b9f430145527da35142e452c3dad544c747`;
- prompt: `2`,
  `sha256:68c227c7951cd9ad6e60283fc9d54416f7c7e76ebaaa85ce17acfe30252cfdd2`;
- candidate schema:
  `sha256:6ac9e1477e206ab082ac38cdb263254c996ee4684e04c80af6b9a08ceae0375d`;
- trust: `migration-checklist-trust.extractive.v2`;
- presentation: `migration-checklist-extractive-presentation.v1`;
- runtime: real / `openai-compatible` / `openai/gpt-5.5` /
  `openai-compatible`;
- qualification identity:
  `sha256:4fa4954d6f254d94859bce17aec6209394d380e4635155a6f3ce23a7e9b70765`.

## 5. Original Qualification Validation

Current authoritative code recomputed the qualification from the full
structured dataset, metrics and runtime report. The recomputed qualification
was canonically identical to the source object:

- strict v2 schema: pass;
- real runtime and observed identity: pass;
- 19/19 thresholds: pass;
- 15/15 critical gates: pass;
- coverage/verdict invariants: pass;
- failed thresholds/gates: 0/0;
- source limitations: 0;
- secret/raw-payload prohibited keys: 0;
- verdict: `QUALIFIED`.

No provider was called and no field, digest, policy or verdict was edited.

## 6. Persisted Record Materialization

The public `writeMigrationPlanningQualificationRecord` API wrote:

`.upgradelens/migration-planning-qualification.json`

- permissions: `0600`;
- bytes: 9,622;
- record digest:
  `sha256:e55b2d6f2f82091f5ce321e3e6b3a36cab8a34ea7608464ccd08b8ef49813847`;
- file SHA-256:
  `7891afabc6979ab3f362cbdd7c312daacf84595e12a49150c709eda8e477aa69`;
- qualification ID preserved exactly;
- writer serialization/read-back exact;
- destination is ignored by `.gitignore`.

## 7. Record Integrity and Resolution

Production loader, resolver and guard confirmed:

- strict envelope and record digest;
- embedded qualification identity digest;
- default path relative to target root;
- `status: QUALIFIED`;
- `executionAllowed: true`;
- `experimentalOverrideUsed: false`;
- immutable decision;
- default and explicit source remain single-source decisions.

Focused coverage proves once-per-run resolution, writer determinism,
idempotence, invalid-source non-overwrite, manual-mutation corruption,
default analyze isolation and presentation consistency.

## 8. Qualification-dependent Scenario Matrix

| Scenario | Source | Status | Execution | Provider calls | Exit | Surface consistency | Capture |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| RERUN-006 | default path | `QUALIFIED` | Allowed, 0/0 contexts | 0 | 0 | Guard/progress/console/Markdown pass | `003-*` |
| RERUN-007 | `config/qualification.json` | `QUALIFIED` | Allowed, no fallback | 0 | 0 | Pass | `004-*` |
| RERUN-008 | absent | `MISSING` | Experimental only | 0 | 0 | No qualified claim | `005-*` |
| RERUN-009 | explicit valid mismatch | `IDENTITY_MISMATCH` | Blocked | 0 | 1 | Constrained | `006-*` |
| RERUN-010 | tampered digest | `CORRUPTED` | Blocked | 0 | 1 | Constrained | `007-*` |
| RERUN-011 | matching strict fixture | `NOT_QUALIFIED` | Blocked | 0 | 1 | Override did not bypass | `008-*` |

Negative fixtures were generated with authoritative qualification/writer APIs;
only the corruption scenario intentionally mutated its isolated temporary
record.

## 9. Provider Request Counts

New provider requests: **0**. Qualified runs had zero eligible contexts and
preserved lazy provider initialization. All negative scenarios blocked before
context/provider construction. No requalification occurred.

## 10. CLI Capture Evidence

`docs/rr02-fix-05-cli-captures/manifest.json` contains eight invocations and
11 screenshots. Every invocation has command, environment, raw/clean
transcript, metadata, exit code and final screen. RERUN-006 additionally has
start/progress/final evidence.

## 11. Regression and Package Results

- focused qualification/progress/cooperative/orchestration: 68/68 pass;
- MP-01–MP-05 and Extractive regressions: 74/74 pass;
- canonical parallel attempt 1: 544 pass, 1 lifecycle `SIGKILL` flake,
  1 sandbox-only skip;
- isolated lifecycle reproduction: 1/1 pass;
- canonical parallel attempt 2: 545 pass, 0 fail, 1 sandbox-only skip;
- serial suite: 545 pass, 0 fail, 1 sandbox-only skip;
- package guard before report: 207 files, 0 captures, 15/15 required assets;
- final dry-run/package guard after report: 208 files, 0 captures, 15/15
  required assets;
- fresh tarball: `upgradelens@0.4.0`, SHA-256
  `c3a5648a15ddcddb752b930b2d581163964cd2c26af51c418fb9ca7906411919`;
- offline clean install: 12 packages; public version/help/import pass.

The first canonical failure is retained and is not replaced silently by the
retry or serial pass. No timeout or test infrastructure changed.

## 12. Privacy and Repository Policy

The persisted record contains no key, token, authorization header, raw
provider request/response, raw candidate/error payload, endpoint or private
reasoning. It is generated output, ignored by Git, not committed and excluded
from npm. The package retains only the public record schema/docs. Capture
trees and helpers are absent from the tarball.

## 13. Files Changed

- generated, Git-ignored:
  `.upgradelens/migration-planning-qualification.json`;
- added: this report;
- added: `docs/rr02-fix-05-cli-captures/**`;
- canonical RR02-RERUN report receives a qualification-completion attempt
  note.

Pre-existing RR02-RERUN evidence changes were preserved.

## 14. Remaining Limitations

- Migration Checklist remains experimental and requires human review.
- The known narrow-terminal detail truncation is a non-blocking UX follow-up.
- Parallel lifecycle timing remains load-sensitive; isolated, canonical retry
  and serial runs passed.
- The sandbox-only local-loopback case is not counted as a pass.

## 15. Release Decision

v0.5.0: **`GO_V0_5_0_WITH_NON_BLOCKING_UX_FOLLOWUPS`**.

Migration Checklist: **`KEEP_EXPERIMENTAL`**.

The only next task is **v0.5.0 Release Execution Checklist**. This task did
not release, tag, publish or bump the package.

## 16. Scope Confirmation

No production/test/fixture/package source, evaluation identity, dataset,
criteria, comparator, normalization, policy, prompt, schema, trust,
generator, progress, scheduler, timeout or version changed. The source was
not reconstructed from Markdown and no provider requalification ran. Nothing
was staged, committed, pushed, tagged or published.
