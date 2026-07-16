# IA-04 — CLI Orchestration & Report

## Architecture review

IA-01, IA-02, and IA-03 already expose independent runtimes, validators, and artifact writers. IA-04 keeps those boundaries: it schedules the runtimes and passes artifact paths to the next stage without duplicating discovery, matching, or evidence logic.

The earlier Knowledge Research and Version Analysis entry-point orchestration still lives in `src/cli.js`. IA-04 uses small stage adapters around those existing functions. Moving them into dedicated application-service modules is useful future cleanup, but is deliberately outside IA-04 because it would increase regression risk without changing pipeline behavior.

Legacy stage commands remain available for backward compatibility. `upgradelens analyze` is the primary end-to-end command.

## Pipeline flow

```text
upgradelens analyze <repository>
                |
                v
        Project Discovery
                |
                v
        Knowledge Research
                |
                v
         Version Analysis
                |
                v
    Repository Usage Discovery
                |
                v
    Repository Impact Analysis
                |
                v
    Repository Impact Evidence
                |
                v
         Markdown Report
                |
                v
          Console Summary
```

The scheduler runs stages sequentially. Every successful stage writes its existing artifact before the next stage starts. A failed stage is wrapped with its stage identity, the remaining stages are not invoked, and a concise log is written to `.upgradelens/logs/analyze.log`.

The scheduler accepts injected stage runners and a progress reporter. This keeps orchestration tests deterministic and keeps each runtime independently testable.

## Artifact flow

| Stage | Reads | Writes |
| --- | --- | --- |
| Project Discovery | repository | `.upgradelens/project-manifest.json` |
| Knowledge Research | Project Manifest | `.upgradelens/knowledge-manifest.json` and the existing evidence bundle |
| Version Analysis | Project, Knowledge, and knowledge evidence artifacts | `.upgradelens/version-analysis.json` |
| Usage Discovery | Project Manifest, Version Analysis, repository source | `.upgradelens/usage-index.json` |
| Impact Analysis | Project Manifest, Version Analysis, Usage Index | `.upgradelens/repository-impact.json` |
| Impact Evidence | Project Manifest, Version Analysis, Usage Index, Repository Impact | `.upgradelens/repository-impact-evidence.json` |
| Markdown Report | completed in-memory artifact values produced by the same run | `.upgradelens/repository-impact.md` |

IA-04 does not rescan or parse source outside the existing Usage Discovery runtime. It does not perform impact matching or evidence generation itself.

## CLI usage

Run the complete pipeline:

```bash
upgradelens analyze .
```

Use cached research data without registry requests:

```bash
upgradelens analyze . --offline
```

Limit discovery and usage scanning depth:

```bash
upgradelens analyze . --max-depth 6
```

On success, progress is printed without internal stage output or stack traces:

```text
Running UpgradeLens Analysis...

✓ Project Discovery
✓ Knowledge Research
✓ Version Analysis
✓ Repository Usage Discovery
✓ Repository Impact Analysis
✓ Repository Impact Evidence
✓ Markdown Report

Analysis completed.
```

On failure, the failed stage is identified and later stages do not run:

```text
✗ Repository Usage Discovery

Repository Usage Discovery failed.

See:
.upgradelens/logs/analyze.log
```

## Renderer architecture

```text
Version Analysis + Repository Impact + Repository Impact Evidence
                              |
                              v
                  Presentation View Model
                              |
              +---------------+---------------+
              |                               |
              v                               v
      Console renderer                Markdown renderer
```

The report stage builds one immutable, in-memory presentation view model and passes that same instance to both renderers. The builder joins dependency occurrences by `analysisResultId`, preserves Repository Impact ordering, validates artifact counts and cross-references, and clones evidence records without modifying the source artifacts. It creates no artifact or schema.

Renderers are presentation-only functions. They receive the shared view model and return text. They do not call analyzers or matchers, modify artifacts, derive severity or confidence, or write files. Writing is handled by the orchestration adapter after rendering.

This boundary permits future HTML, SARIF, or GitHub Summary renderers without changing the scheduler or IA-01 through IA-03.

### Analysis completeness contract

Overall analysis status comes only from existing Version Analysis result statuses:

- `COMPLETE`: every dependency occurrence has status `analyzed`;
- `INCOMPLETE`: one or more dependency occurrences has status `skipped` or `failed`.

`requiresHumanReview` remains an explicit count, but does not by itself make an analyzed result incomplete.

Each dependency occurrence has exactly one presentation status:

- `IMPACTED`: Version Analysis status is `analyzed` and Repository Impact reports `impacted: true`;
- `NOT_IMPACTED`: Version Analysis status is `analyzed` and Repository Impact reports `impacted: false`;
- `NOT_ANALYZED`: Version Analysis status is `skipped` or `failed`.

Skipped and failed results are never described as not impacted. They receive a deterministic safe message based only on their status; raw runtime errors are not included. The following invariant must hold or presentation fails clearly:

```text
impacted + not impacted + not analyzed = dependency occurrences
```

Missing references, identity mismatches, finding-reference mismatches, and inconsistent summary counts also fail rather than being silently classified.

### Console format

The console summary contains:

- repository name from Project Manifest;
- overall `COMPLETE` or `INCOMPLETE` analysis status;
- analyzed, skipped, failed, and human-review counts from Version Analysis;
- separate impacted, not-impacted, and not-analyzed occurrence counts;
- breaking finding count from Repository Impact;
- evidence record count from Repository Impact Evidence (`summary.findingCount`);
- Markdown report path.

An incomplete run also prints a plain-text warning that impact conclusions are incomplete. Color is not required to understand the state.

### Markdown format

The Markdown report contains:

- repository name;
- an Analysis Completeness section and warning when incomplete;
- analyzed, skipped, failed, impacted, not-impacted, and not-analyzed counts;
- one section per dependency;
- the dependency's Version Analysis and impact presentation statuses;
- finding ID, original finding summary, impacted flag, evidence reason code;
- matched symbols and source file paths already present in Repository Impact Evidence.

For `NOT_ANALYZED`, the dependency section renders no impact conclusion or evidence and explains only whether Version Analysis was skipped or failed. The report does not add conclusions beyond the artifact fields.

## Limitations and technical debt

- Knowledge Research and Version Analysis application orchestration remain CLI-local legacy code. They should eventually be extracted into dedicated stage services without changing their domain runtimes.
- `analyze` inherits the configured behavior of existing stages. Online Research may access registries, and Version Analysis may require its already-configured runtime. IA-04 adds no provider or AI behavior.
- Failure logging currently keeps one deterministic `analyze.log`; a later observability task may add rotation or run identifiers.
- The presentation builder checks the cross-artifact relationships required for truthful rendering, but upstream artifact schema validation remains the responsibility of each owning stage.
- `INCOMPLETE` does not repair or retry skipped/failed Version Analysis results. Provider/runtime configuration and Version Analysis quality remain outside IA-04.
- Dependency ordering is deterministic for the same inputs and preserves occurrence-level Repository Impact ordering. Stable identifiers across separate pipeline runs remain outside this fix.
