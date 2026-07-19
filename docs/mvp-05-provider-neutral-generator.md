# MVP-05 Provider-Neutral Generator and Trust Validation

## Scope and runtime boundary

MP-03 turns only MP-02 `eligibleContexts` into human-review migration checklist drafts. New experimental application runs use the extractive task identity `migration-planning.v2` and call the existing provider-neutral `AiRuntime.generateStructured()` contract once per eligible context. The historical free-form `migration-planning.v1` path remains only for evaluation reproducibility. The generator does not read artifacts or source files, access the network directly, scan a repository, write the final checklist, or invoke CLI/orchestration code.

The public multi-context API is `generateMigrationChecklistDrafts(prepared, { aiRuntime })`. The lower-level APIs expose prompt construction, candidate validation, trust validation, and one-context generation for MP-04 evaluation and MP-05 assembly.

## Model-visible prompt boundary

The model receives a bounded projection containing:

- package/ecosystem/registry identity;
- declared, current, and target version facts, including baseline certainty and target policy;
- existing analysis result and breaking-finding identity;
- the bounded finding summary;
- selected official/publisher evidence content and exact allowlist;
- eligibility, location-coverage state, limitations, and mandatory human-review policy.

Source URLs, positive candidate locations, repository source/snippets, fallback records, unrelated evidence/dependencies, and provider configuration are excluded. Locations remain deterministic even when MP-02 has a positive usage match.

The prompt describes the model as an evidence transformation component, not an autonomous planner. It requires abstention when evidence lacks an explicit action and preserves two important uncertainties: an unknown current version remains unknown, and `registryLatest` is a registry fact rather than a recommendation. Unsupported usage coverage is never presented as unused, not impacted, or safe.

## Candidate contract

The strict JSON Schema has no additional properties and contains only:

- `status`: `ACTIONABLE` or `ABSTAIN`;
- up to four bounded items, each with a bounded instruction, one to six unique selected evidence refs, and one exact bounded excerpt per ref;
- `abstentionReason`: null for `ACTIONABLE`, or one constrained reason for `ABSTAIN`.

In v2 the model emits only `status`, exact `(evidenceRef, actionExcerpt)` selections, and a constrained abstention reason. It cannot emit the final instruction, item IDs, package/finding/result identity, kind, basis, status/eligibility ownership, review state, URL, location, code, command, patch, prerequisite graph, ordering, rollback, effort, confidence, or completion/approval state.

## Evidence and excerpt validation

Every evidence ref must exist in both the context allowlist and selected evidence. Each ref requires exactly one excerpt from that same record. Excerpt verification normalizes only line endings (`CRLF` and `CR` to `LF`) and then requires an exact substring; it does not trim, fold case, fuzzy match, search semantically, or accept a paraphrase.

An exact excerpt proves that the quoted text exists in selected evidence. It does not prove that the entire generated instruction is semantically entailed. This limitation is why every AI-authored item remains a draft requiring human review and why MP-04 must evaluate instruction-level evidence precision.

## Trust policy

The validator reuses MP-01 instruction guards and adds small deterministic checks for obvious:

- URLs, Markdown code fences, code/diff/patch material, and shell/package-manager commands;
- rollback plans, effort estimates, numeric confidence, and dependency ordering/prerequisites;
- repository paths/files and safety/readiness/verification/completion claims;
- technical identifiers introduced as facts.

Backticked identifiers, flags, member names, common camel/snake-case API tokens, and call-form identifiers must occur exactly in a verified supporting excerpt. This conservative lexical check prevents common invented API/config claims; it is a guardrail, not semantic entailment or an NLP moderation framework.

MP-03 uses whole-candidate rejection. If any item fails trust validation, no item from that candidate is published. This avoids representing partially rejected model output as complete checklist coverage.

## Deterministic ownership and construction

For a valid candidate, deterministic code supplies:

- `basis: AI_AUTHORED`;
- `kind: REVIEW_MIGRATION_INSTRUCTION`;
- the existing finding/package/version identity;
- stable item IDs and sorted evidence refs/items;
- `requiresHumanReview: true`;
- an empty AI-owned location list.

When MP-02 provides positive locations, MP-03 separately creates deterministic `REVIEW_CANDIDATE_USAGE` items. The model never receives or owns those locations. MP-02 limitations and fallback records are preserved and merged by analysis-result identity.

For identical normalized context and candidate output, parsing, trust checks, record construction, IDs, ordering, warnings, and summaries are deterministic. Model generation itself is not claimed to be deterministic. Core generation does not read the clock, and returned results are deeply immutable.

## Abstention and failure behavior

A valid `ABSTAIN` candidate becomes a deterministic `NO_GROUNDED_ACTION` manual-review fallback with its constrained reason recorded as a limitation. It contains no AI-authored action.

Invalid JSON/schema/semantics, non-exact spans, trust rejection, and provider/runtime failure become `MANUAL_REVIEW_REQUIRED` deterministic fallbacks with constrained, sanitized warnings. Raw provider messages are not copied. A failure is package-local: other eligible contexts continue and all MP-02 fallback records remain available. Invalid context shape, duplicate identity, missing runtime, and programming invariants remain fatal. See [`GR-04-Versioned-Production-Extractive-Contract.md`](./GR-04-Versioned-Production-Extractive-Contract.md).

## Deferred work

- MP-04 now provides migration-specific golden/adversarial evaluation, metrics, critical gates, a scorecard, and provider-specific qualification; see [`mvp-05-migration-evaluation-and-qualification.md`](./mvp-05-migration-evaluation-and-qualification.md). Qualification from Version Analysis is not inherited, and the fake runtime does not qualify a real provider.
- MP-05 implements final checklist assembly/writing, experimental pipeline/CLI orchestration, and presentation-only console/Markdown rendering; see [`mvp-05-migration-checklist-orchestration.md`](./mvp-05-migration-checklist-orchestration.md).

MP-03 adds no provider adapter, writer, renderer, source analyzer, code generator, patch/auto-fix, command generation, dependency graph, ordering, rollback, effort, confidence, or safety certification.
