# GR-04 — Versioned Production Extractive Contract

> Historical compatibility note: GR-04 originally shipped public Migration
> Checklist schema `1.0.0`. MP-R04 later upgrades the artifact to schema
> `2.0.0` for deterministic handoff fields. The extractive candidate, prompt,
> trust, and presentation identities documented here remain unchanged; v1
> checklist artifacts must be regenerated and are not actionable handoffs.

## Decision

UpgradeLens now uses the extractive v2 contract for every new experimental Migration Checklist run. The historical free-form v1 generator remains available to regression and evaluation code, but the application runtime does not select it.

The public `.upgradelens/migration-checklist.json` schema stays at `1.0.0`. Its existing `AI_AUTHORED` basis remains wire-compatible and now means that AI selected an official evidence span; deterministic code rendered the final human-review text. The model does not author that final instruction, item identity, repository location, or review state.

This change does not enable Migration Checklist in the default `analyze` pipeline. The stage is still available only through `--experimental-migration-checklist`.

## Why the free-form contract was replaced

The GR-02 evaluation demonstrated that exact evidence references plus lexical checks were not a sufficient production boundary for model-authored prose. A model could add an unsupported identifier or action while retaining a valid quoted excerpt. GR-03 then demonstrated that an extractive candidate contract contains those failures and accepts the recorded safe npm prose.

GR-04 productionizes only that small trust boundary. The GR-03 experiment runner, comparison policy, and experiment fixtures remain regression assets; they are not part of checklist generation.

## Versioned identities

| Component | Identity |
| --- | --- |
| Task | `migration-planning.v2` |
| Prompt | `2` plus a canonical prompt identity digest |
| Candidate | `migration-checklist-extractive-candidate.v2` plus schema digest |
| Trust | `migration-checklist-trust.extractive.v2` |
| Generator result | `2` |
| Presentation | `migration-checklist-extractive-presentation.v1` |
| Dataset | `migration-planning-golden` / `2.0.0` plus digest |
| Evaluation | criteria, comparator, and normalization identities from GR-02 |
| Qualification policy | `3.0.0` plus digest |

A qualification identity also includes provider, model, adapter, runtime mode, and observed provider/model identities. Any prompt, schema, trust, generator, presentation, dataset, criteria, comparator, normalization, policy, or runtime identity change requires requalification.

## Candidate and prompt boundary

The strict candidate has only:

```json
{
  "status": "ACTIONABLE",
  "actions": [
    {
      "evidenceRef": "sha256:...",
      "actionExcerpt": "Exact selected official guidance"
    }
  ],
  "abstentionReason": null
}
```

An abstention contains no actions and one constrained reason. Every object rejects additional properties. At most four actions are allowed and each excerpt is bounded to 500 characters.

The model is a bounded evidence-span selector. It can copy a verbatim span from selected evidence or abstain. It cannot emit final instructions, identity, versions, URLs, locations, code, commands, patches, prerequisites, ordering, rollback, effort, confidence, safety, approval, completion, or reasoning. The model-visible context continues to use the MP-02 projection and excludes repository source and deterministic candidate locations.

## Production trust path

The production validator applies:

1. strict candidate schema and status semantics;
2. exact context evidence allowlist membership;
3. selected evidence record existence;
4. line-ending normalization only;
5. exact substring membership in the same evidence record;
6. duplicate `(evidenceRef, actionExcerpt)` rejection;
7. whole-candidate structural and prohibited-content validation.

GR-02 action criteria are not used by the production trust validator. They remain controlled evaluation criteria. Production exact-span validation establishes provenance, exact membership, ownership, and structural safety. It does not establish semantic applicability to the repository.

Command-like or code-like official spans remain outside the MVP checklist capability. They fail closed and produce a deterministic manual-review fallback while preserving the selected evidence references.

## Deterministic presentation and ownership

Accepted spans are rendered with the constant prefix:

```text
Review this selected official migration guidance (human review required): <exact span>
```

The normalized exact span is preserved without paraphrase. Existing deterministic code owns checklist IDs, ordering, package/finding/version identity, `requiresHumanReview: true`, and positive candidate locations. AI-selected items own no locations. Presentation labels use “AI-selected official guidance,” not “AI-authored action” or “verified action.”

The legacy public basis value `AI_AUTHORED` is retained solely for schema compatibility. It represents AI-assisted selection followed by deterministic rendering in v2.

## Runtime and failure behavior

`runMigrationChecklistStage` now defaults internally to `generateMigrationExtractiveChecklistDrafts`. The provider-neutral `AiRuntime.generateStructured()` call remains one call per eligible context. MP-02 fallback records do not call the runtime.

Abstention, provider failure, invalid schema, unknown evidence, non-exact text, duplicate spans, and prohibited content are package-local safe outcomes. They publish no unsafe item, preserve unrelated contexts, create a deterministic fallback, and expose only constrained reason codes. Invalid normalized context, duplicate identity, corrupted qualification identity, programming invariants, and final artifact validation remain fatal.

Progress event names are unchanged and contain no raw prompt, response, or evidence content.

## Qualification boundary

The application guard now expects the complete extractive v2 identity. Therefore:

- a free-form v1 record cannot qualify v2;
- a fake v2 qualification cannot qualify a real runtime;
- a missing v2 real qualification remains `EXPERIMENTAL` only when explicit experimental policy is enabled;
- provider, model, or adapter mismatch invalidates the record;
- a matching explicit `NOT_QUALIFIED` record blocks the run;
- the historical v1 `NOT_QUALIFIED` result is unchanged and is treated as a different identity.

The checklist reports `NOT_AVAILABLE` when no matching real v2 qualification exists. No qualification database or provider-specific behavior was added.

## Offline production evaluation

The production extractive generator runs through the versioned GR-02 evaluation layer using local role-routed fixtures:

| Boundary | Result |
| --- | --- |
| Live-quality cases | `7` |
| Recorded containment cases | `18` |
| Recorded unsafe containment | `17/17` |
| Recorded safe acceptance | `1/1` |
| Prohibited capability containment | `10/10` |
| Injected failures | `3/3` |
| Published unsupported actions | `0` |
| Published ambiguous actions | `0` |
| Provider requests | `0` |
| Critical gates | all pass |
| Fake verdict | `QUALIFIED_WITH_LIMITATIONS` |

The evaluation criteria measure action support and specificity. They do not become a general production classifier. The deterministic prefix is presentation text, so evaluation measures support against the exact selected span and separately checks the published prefix for prohibited capabilities and ownership.

## Packaging and complexity

Production-specific schema, candidate/trust, and prompt code are 270 lines before generator/qualification integration. No dependency was added. Shared generator and evaluation modules were extended instead of copying the GR-03 comparison runner.

The npm `files` list retains the general evaluation datasets/schemas and the two historical/versioned migration golden datasets. The GR-03 experiment runner, fixtures, and experiment candidate schema remain in the repository for regression value but are excluded from the package. `npm pack --dry-run` reports 191 files / 447.8 kB: one more file and about 0.4 kB less compressed than the GR-03 package (190 files / 448.2 kB), or six more files and about 11.8 kB more than the GR-02 baseline (185 files / 436.0 kB).

## Compatibility

- Public Migration Checklist schema: unchanged `1.0.0`.
- Historical v1 prompt, candidate, trust, generator, dataset digests, and evaluation entry points: retained.
- Default CLI: Migration Checklist still absent.
- Experimental CLI: uses extractive v2.
- Provider integration: unchanged and provider-neutral.
- Thresholds: unchanged.

## Known limitations

- Exact official text does not prove that the guidance applies to a particular repository usage.
- Official command/code-like spans are not published as executable-looking checklist instructions.
- The versioned dataset is intentionally small.
- No real provider has been evaluated for v2.
- `AI_AUTHORED` remains a legacy wire name whose v2 meaning requires this compatibility note.

## Requalification boundary

GR-04 is ready for a separate real-provider decision only after focused, full-suite, packaging, and diff validation pass. GR-04 itself performs no real-provider call and no repository validation.
