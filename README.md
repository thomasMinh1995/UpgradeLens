# UpgradeLens

UpgradeLens is an upgrade intelligence engine that helps developers understand software projects, analyze dependency upgrades, identify breaking changes, and generate safer migration plans.

Future MVPs progressively introduce AI-powered knowledge research, version analysis, impact analysis, and migration planning.

The current Migration Checklist application path is experimental and opt-in. It produces human-review drafts, not an autonomous migration plan or safety certification.

MVP-01 focuses only on deterministic project discovery and dependency inventory. It provides a reliable, versioned foundation and contains no AI runtime or reasoning.

## Why UpgradeLens?

Framework and dependency upgrades often require more investigation than implementation. Breaking changes may be scattered across long changelogs, migration guides, release notes, and source repositories. Developers must first understand what a project uses, then determine which changes matter to that specific codebase.

UpgradeLens is being built incrementally around that workflow. MVP-01 solves the first problem: producing a reproducible description of a repository and its declared dependencies. Later milestones will consume that description to research releases, compare versions, analyze impact, and prepare migration plans.

## Architecture overview

```text
Repository
    │
    ▼
Project Discovery
    │
    ▼
Project Manifest
    │
    ▼
Knowledge Research
    │
    ▼
Version Analysis
    │
    ▼
Impact Analysis
    │
    ▼
Migration Planning
```

The repository is discovered once. Every later stage consumes the Project Manifest, and future AI stages do not rescan the repository directly. This keeps discovery deterministic across the full pipeline.

## Current roadmap

- ✓ **MVP-01 — Project Discovery Foundation**
- ✓ **MVP-02 — Knowledge Research**
- ⬜ **MVP-03 — AI Version Analysis**
- ⬜ **MVP-04 — AI Impact Analysis**
- ⬜ **MVP-05 — AI Migration Planning**

MVP-01 and MVP-02 are currently implemented. Future analysis milestones progressively introduce AI-powered reasoning over the versioned artifacts.

## Officially supported in MVP-01

### Node.js projects and frontends

- Discovery through `package.json`
- npm-compatible workspace relationships and `pnpm-workspace.yaml`
- Dependency inventory across runtime, development, peer, and optional dependencies
- Versioned dependency contract with duplicate detection

### Python backends

- Discovery and dependency parsing through `requirements.txt`
- Deterministic dependency inventory
- Package-name normalization using rules close to PEP 503
- Duplicate declaration detection

These supported paths have deterministic discovery, dependency parsing, JSON Schema validation, and regression tests.

## Experimental discovery

UpgradeLens also contains early manifest discovery for:

- Python projects using `pyproject.toml` without `requirements.txt`
- Java and Kotlin through Maven and Gradle files
- .NET solutions and C#, F#, or Visual Basic project files
- Go through `go.mod`
- Rust through `Cargo.toml`
- Ruby through `Gemfile`
- PHP through `composer.json`
- Dynamics 365 Business Central AL through `app.json`

These paths are experimental. Project detection may work, but dependency parsing, version analysis, and migration support are not yet guaranteed.

These detectors validate UpgradeLens's extension model and provide an incremental path toward official ecosystem support in future MVPs. They should not be treated as production-supported integrations today.

## Current limitations (MVP-01)

MVP-01 does not provide:

- Version lookup
- Changelog research
- Breaking-change analysis
- Migration generation
- AI reasoning
- Code transformation

These capabilities belong to later MVPs and build on the deterministic discovery foundation.

## Discovery capabilities

### Repository discovery

UpgradeLens scans a repository locally without following symbolic links. Common dependency, cache, and generated directories such as `.git`, `node_modules`, `vendor`, `dist`, and `.upgradelens` are excluded.

### Polyglot repositories and workspaces

Multiple ecosystems can be discovered in the same repository. Node workspace root/member relationships are detected from `package.json` and `pnpm-workspace.yaml`. UpgradeLens itself remains a single npm package and is intentionally not a monorepo.

### Dependency inventory

Every project contains a `dependencySummary` and a deterministic `dependencies` inventory. A parsed summary distinguishes declarations from normalized unique packages and reports duplicates explicitly:

```json
{
  "dependencySummary": {
    "status": "parsed",
    "declarationCount": 28,
    "uniqueCount": 27,
    "duplicateCount": 1
  }
}
```

Each inventory record preserves the declared name, normalized name, declared version or reference, dependency type, and repository-relative manifest path. Duplicate declarations remain separate records rather than being silently discarded.

The summary `status` is `parsed`, `unsupported`, or `failed`. All three counts exist only for `parsed`. Unsupported or failed parsers never produce a misleading zero or partial count, and failed parsers do not emit partial dependency inventories.

### Node dependency behavior

Node.js reports declaration counts for `dependencies`, `devDependencies`, `peerDependencies`, and `optionalDependencies`. Duplicate packages are detected across all four sections. Duplicate declarations remain in the inventory and emit `DUPLICATE_DEPENDENCY_DECLARATION`.

### Python dependency behavior

The `requirements.txt` parser supports unversioned packages, standard version specifiers, extras, environment markers, inline comments, editable declarations, and direct URL or Git references. Unnamed references use their exact reference as a stable identity rather than being discarded.

Blank lines and comments are ignored. Requirement and constraint includes (`-r` and `-c`) and package-index options are recognized but not counted; referenced files are not followed in MVP-01. A malformed requirement line keeps the project in the manifest, marks dependency parsing as `failed`, and emits `DEPENDENCY_PARSE_FAILED`.

### Warning model

Malformed or unreadable individual manifests become warnings instead of discarding valid results from the rest of the repository. Duplicate declarations are warnings, not parse failures. Use `--fail-on-warning` in CI when warnings should produce a non-zero status.

## Project Manifest

UpgradeLens generates a portable, versioned Project Manifest as the canonical intermediate representation shared by every UpgradeLens stage. Future milestones and agents consume this manifest instead of rescanning repositories, ensuring deterministic discovery across the entire pipeline.

The default location is:

```text
<project>/.upgradelens/project-manifest.json
```

See the [MVP-01 design and scope](docs/MVP-01.md) and the [Project Manifest JSON Schema](schemas/project-manifest.schema.json).

MVP-02 implementation includes the internal [Research Planning bridge](docs/MVP-02-Research-Planning.md), a private [Lightweight Knowledge Store](docs/MVP-02-Knowledge-Store.md), internal [npm-compatible](docs/MVP-02-npm-Registry-Adapter.md) and [PyPI](docs/MVP-02-PyPI-Registry-Adapter.md) Registry adapters, bounded [HTTP lifecycle](docs/MVP-02-HTTP-Lifecycle.md) and [CLI-owned runtime](docs/MVP-02-CLI-HTTP-Runtime.md) behavior, deterministic [Source Provenance Resolution](docs/MVP-02-Source-Provenance.md), [Knowledge Research Orchestration](docs/MVP-02-Knowledge-Research-Orchestration.md), and the public [Knowledge Manifest](docs/MVP-02-Knowledge-Manifest-Generation.md). The versioned [Knowledge Manifest contract](docs/MVP-02-Knowledge-Manifest.md) and its [JSON Schema](schemas/knowledge-manifest.schema.json) are the downstream MVP-03 contract; AI behavior is not implemented.

MVP-02 now completes the deterministic public workflow. After discovery, run `upgradelens research .` to generate the validated [Knowledge Manifest](docs/MVP-02-Knowledge-Manifest-Generation.md):

```text
upgradelens discover .
        ↓
.upgradelens/project-manifest.json
        ↓
upgradelens research .
        ↓
.upgradelens/knowledge-manifest.json
```

## Extension model

Discovery is organized around ecosystem-specific detectors. Node.js and Python `requirements.txt` are the officially supported MVP-01 paths, while other detectors can evolve independently. Contributors can implement or improve ecosystems independently while the discovery core and manifest contract remain stable. This is an implementation extension model rather than a runtime plugin system.

## Installation and CLI usage

### Requirements

- Node.js 20 or newer
- No runtime dependencies

From this repository:

```sh
npm install
npm link
upgradelens discover /path/to/project
```

Or without linking:

```sh
node ./bin/upgradelens.js discover /path/to/project
```

Print the manifest without writing a file:

```sh
upgradelens discover /path/to/project --stdout
```

Use `upgradelens --help` for all options. The command also accepts a path without the optional `discover` verb.

### Experimental evidence-grounded Migration Checklist

After the normal analysis artifacts are available through the unified pipeline, opt in with:

```sh
upgradelens analyze /path/to/project --experimental-migration-checklist
```

This adds the Migration Checklist stage after Repository Impact Evidence and writes:

```text
.upgradelens/migration-checklist.json
```

The capability is provider-neutral and reuses the configured UpgradeLens `AiRuntime`. Fake-runtime qualification does not qualify a real provider/model. Until a matching task-specific real-provider qualification exists, the artifact and report identify the output as experimental and require human review for every generated instruction.

The public CLI resolves a persisted Migration Planning v2 qualification from the target repository at:

```text
.upgradelens/migration-planning-qualification.json
```

An explicit repository-relative record can be selected with
`--migration-qualification <path>`. Resolution precedence is programmatic
injection, explicit CLI path, the default project-local path, then a missing
decision. The selected source is validated as one complete record; an invalid
explicit source never falls back. Only a missing default record may use the
existing experimental override. A corrupted, identity-mismatched, fake, or
matching `NOT_QUALIFIED` record blocks before provider use.

Persist a completed v2 evaluation qualification through the validated public
writer rather than copying a partial report:

```js
import { writeMigrationPlanningQualificationRecord } from 'upgradelens';

await writeMigrationPlanningQualificationRecord(
  '/path/to/project',
  evaluationReport.report.qualification
);
```

Full-pipeline progress rendering is controlled with
`--progress auto|interactive|plain`. `auto` selects an append-only interactive
view for TTYs and stable line-oriented events for non-TTY/CI output. Explicit
`interactive` remains append-only when redirected, while explicit `plain`
always stays plain. Every active stage shows its current activity and real
elapsed time; quiet work emits a rate-limited heartbeat after five seconds.
Counts appear only when the total is known deterministically. UpgradeLens does
not infer percentages, ETA, token streaming, or provider “thinking”.

```text
● Version Analysis [0.0s]
  ↳ Version Analysis — Waiting for analysis response: react (2/7) [0.1s]
  … Version Analysis — Waiting for analysis response: react (2/7) [5.1s]
✓ Version Analysis completed [8.4s]
```

Plain/CI output uses complete grep-friendly lines:

```text
[5.1s] STAGE HEARTBEAT id=versionAnalysis detail="Waiting for analysis response: react (2/7)"
```

The first `SIGINT` requests controlled cancellation, stops heartbeat timers,
does not start another stage, omits the success summary, and returns exit code
130. A second interrupt uses the platform's normal immediate-interrupt
behavior. Activity labels are sanitized and bounded; they never contain raw
prompts, evidence bodies, repository snippets, request headers, or provider
error payloads.

Migration Checklist does not generate source edits, code, patches, package-manager commands, dependency ordering, inferred prerequisites, rollback plans, effort estimates, numeric confidence, or upgrade-safety claims. `COMPLETE` means only that represented grounded checklist records have actionable review items. Unknown current versions remain unknown, and registry latest remains a registry fact rather than a recommendation.

See [Migration Checklist orchestration](docs/mvp-05-migration-checklist-orchestration.md), [contract](docs/mvp-05-migration-checklist-contract.md), [evaluation/qualification](docs/mvp-05-migration-evaluation-and-qualification.md), and [persisted qualification resolution](docs/migration-planning-qualification-resolution.md).
The full lifecycle, heartbeat, rendering, privacy, and cancellation behavior is
documented in the [CLI progress contract](docs/cli-progress.md).

## JavaScript API

```js
import { discoverProject } from 'upgradelens';

const manifest = await discoverProject('/path/to/project');
```

## Development

```sh
npm test
npm run check
```

The npm package is named `upgradelens` and exposes the `upgradelens` command.

## Future vision

UpgradeLens evolves in incremental layers:

- Deterministic discovery
- Knowledge research
- Version intelligence
- Impact analysis
- Migration planning

Each MVP builds on the versioned output of the previous one.

## License

[MIT](LICENSE)
