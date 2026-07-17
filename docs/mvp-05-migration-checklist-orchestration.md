# MVP-05 Migration Checklist Orchestration

## Scope

MP-05 closes the experimental application path from the seven validated UpgradeLens artifacts to `.upgradelens/migration-checklist.json`, console output, and the existing Markdown report. It does not broaden the MP-01 through MP-04 trust boundary and does not enable Migration Checklist by default.

The command is explicit:

```text
upgradelens analyze <repository> --experimental-migration-checklist
```

Without the flag, the existing seven-stage analysis pipeline is unchanged, no migration qualification is required, and no Migration Checklist artifact is created.

## Runtime flow

```text
Seven exact-byte artifacts
        ↓
MP-02 context preparation and deterministic fallbacks
        ↓
Task/provider/model/adapter qualification guard
        ↓
MP-03 provider-neutral generation and trust validation
        ↓
MP-01 final builder, schema and invariant validation
        ↓
Atomic migration-checklist.json write
        ↓
Pure Migration Checklist presentation view model
        ↓
Console summary + Repository Impact Markdown section
```

The optional stage is inserted after Repository Impact Evidence and before Markdown Report. `ANALYSIS_STAGES` remains the default stage list; an opt-in stage list is created only for the experimental command.

## Qualification policy

The guard binds qualification to `migration-planning.v1`, the bundled dataset digest, policy digest, prompt version, candidate schema digest, generator/trust identity, provider, model, and runtime adapter.

- A matching real-provider `QUALIFIED` or `QUALIFIED_WITH_LIMITATIONS` record is accepted for that exact identity.
- `NOT_QUALIFIED` always blocks generation.
- Missing, fake, insufficient, or mismatched qualification is never called qualified.
- Explicit experimental opt-in may proceed with visible artifact/report limitations.
- Missing provider/model/adapter metadata adds a separate limitation.

The conservative missing-record message is represented by `MIGRATION_PROVIDER_NOT_QUALIFIED`: the configured provider/model has not been qualified for `migration-planning.v1`, and every generated instruction requires human review. Version Analysis qualification is not consulted.

Real-provider migration generation remains disabled by default. Having an API key or endpoint does not enable this stage.

## Assembly and artifact writer

The assembler accepts only normalized MP-02 preparation, normalized MP-03 generation, a qualification-guard result, and an injected timestamp. It verifies the MP-02/MP-03 lineage input is identical and calls the MP-01 `buildMigrationChecklist` and validator. It does not edit AI instructions or create actions.

The writer validates before touching the target, serializes with the MP-01 serializer, writes a private temporary file in the target directory, syncs it, and atomically renames it. A failed validation or write does not replace an existing artifact. The public result is the portable path `.upgradelens/migration-checklist.json`, not an absolute local path.

## Failure model

Fatal artifact/schema/lineage/reference/programming/write errors fail the Migration Checklist stage and stop later stages. Provider errors, abstention, invalid candidate output, trust rejection, unsupported evidence, and unsupported usage coverage remain package-local deterministic fallbacks. One context cannot remove another context's safe result.

All AI-authored items remain location-free and require human review. Candidate locations remain deterministic positive `impactEvidenceId + symbol + file` records.

## Progress

Migration progress events are operational-only and bounded:

- `stage:start`, `stage:progress`, `stage:complete`, `stage:failed`;
- `migration:context-start`, `migration:context-complete`;
- `migration:abstained`, `migration:trust-rejected`, `migration:fallback`;
- `migration:artifact-written`.

Events may contain counts, package display name, constrained outcome/reason codes, qualification state, and portable artifact path. They never contain prompts, evidence content, model output, provider error text, credentials, source code, or absolute paths. Missing or failing listeners do not change generation semantics.

`--progress auto|interactive|plain` controls the experimental stage display. `auto` selects a simple symbol-based interactive view for TTY and stable line-oriented output for CI. Neither mode uses fake percentages; the implementation reports processed/total contexts. Plain mode uses no cursor control or animation.

## Presentation

Console and Markdown use the same deterministic view model built solely from the validated final artifact. They do not reload evidence or recalculate eligibility.

Required wording distinguishes:

- an “AI-authored draft” from an approved action;
- a “candidate review location” from a proven affected call site;
- unknown current versions from exact baselines;
- a `registryLatest` fact from a recommendation;
- checklist `COMPLETE` coverage from migration completion or upgrade safety.

Evidence is displayed as artifact evidence IDs because the current Migration Checklist contract contains IDs but no source URLs. Renderers do not invent links.

## Provider neutrality and limitations

The stage accepts any injected `AiRuntime`. Provider configuration continues to use the existing generic/OpenAI-compatible CLI runtime boundary; MP-05 contains no OpenRouter-specific provider, model, endpoint, or key logic.

Current limitations remain visible:

- fake qualification is not real-provider qualification;
- exact excerpts do not prove semantic entailment;
- leading-dash flags and unsupported plain-language instructions expose known lexical/semantic gaps;
- Usage Analyzer coverage is global rather than per project and Python has no usage analyzer;
- progress UX is intentionally basic pending RR-02.

RR-01 should validate the complete artifact pipeline on representative repositories. RR-02 should review interactive wording, density, failure diagnostics, and developer ergonomics. Real-provider enablement requires separate provider portability validation and task-specific qualification.
