# UpgradeLens

UpgradeLens is an upgrade intelligence engine that helps developers understand software projects, analyze dependency upgrades, identify breaking changes, and generate safer migration plans.

Future MVPs progressively introduce AI-powered knowledge research, version analysis, impact analysis, and migration planning.

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
- ⬜ **MVP-02 — AI Knowledge Research**
- ⬜ **MVP-03 — AI Version Analysis**
- ⬜ **MVP-04 — AI Impact Analysis**
- ⬜ **MVP-05 — AI Migration Planning**

Only MVP-01 is currently implemented.

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

MVP-02 implementation begins with the internal [Research Planning bridge](docs/MVP-02-Research-Planning.md), a private [Lightweight Knowledge Store](docs/MVP-02-Knowledge-Store.md), and an internal [npm-compatible Registry adapter](docs/MVP-02-npm-Registry-Adapter.md). The versioned [Knowledge Manifest contract](docs/MVP-02-Knowledge-Manifest.md) and its [JSON Schema](schemas/knowledge-manifest.schema.json) remain the downstream contract; orchestration, a research CLI, and AI behavior are not implemented.

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
