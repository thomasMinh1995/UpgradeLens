# MVP-01 — Project Discovery Foundation

MVP-01 establishes the local discovery boundary used by future UpgradeLens analysis stages. It intentionally contains no network service, database, user interface, container runtime, MCP integration, agent framework, or LLM runtime.

## Responsibilities

1. Accept a repository or project directory.
2. Walk it without following symbolic links and skip generated/dependency directories.
3. Detect supported project manifests, including multiple ecosystems and workspace members.
4. Preserve partial results when an individual manifest cannot be read or parsed.
5. Produce a portable, versioned JSON manifest with stable ordering and relative paths.
6. Write atomically to `.upgradelens/project-manifest.json` by default.

## Supported discovery signals

| Ecosystem | Manifest signals |
| --- | --- |
| Node.js | `package.json` |
| Python | `pyproject.toml`, `requirements.txt` |
| Java/Kotlin | Maven and Gradle build/settings files |
| .NET | solution and C#/F#/Visual Basic project files |
| Go | `go.mod` |
| Rust | `Cargo.toml` |
| Ruby | `Gemfile` |
| PHP | `composer.json` |
| Dynamics 365 Business Central AL | a valid AL `app.json` |

Node workspaces declared through the root `package.json` or `pnpm-workspace.yaml` are represented with root/member relationships, including pnpm exclusion patterns. UpgradeLens itself remains a single npm package; workspace discovery only concerns target repositories.

## Manifest contract

The contract is versioned independently through `schemaVersion`. Schema v2 places `dependencySummary` and `dependencies` on every project. A parsed summary reports total valid declarations before deduplication, unique normalized identities, and their difference as duplicate count. Node summaries also provide counts for all four supported package sections. Unsupported and failed parsers contain only their status, with no counts; their inventory is empty. This rule applies consistently to every ecosystem and avoids representing missing support, parse failure, or partial results as zero dependencies.

Every dependency declaration remains in the inventory, including duplicates. Records contain the declared name, normalized identity, declared version or reference, dependency type, and repository-relative manifest path. Inventories and warnings are sorted deterministically. Repeated normalized identities emit `DUPLICATE_DEPENDENCY_DECLARATION` without becoming parse failures.

The deterministic `requirements.txt` parser normalizes named packages using rules close to PEP 503. Blank lines and comments are ignored; version specifiers, extras, markers, editable declarations, and direct URL/Git references are supported. Unnamed references use their exact reference as a stable identity. `-r`/`--requirement`, `-c`/`--constraint`, and package-index options are directives rather than dependencies. Include and constraint files are intentionally not followed in MVP-01. Malformed dependency lines produce `DEPENDENCY_PARSE_FAILED` without removing the detected project or exposing partial counts/inventory.

Paths are POSIX-style and relative to the discovered root so output does not expose machine-specific absolute paths. Projects, dependencies, and warnings are sorted, making every field except `generatedAt` reproducible for unchanged input.

The normative schema is [`schemas/project-manifest.schema.json`](../schemas/project-manifest.schema.json).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Discovery completed (warnings may be present unless strict mode is used) |
| `1` | Invalid invocation or discovery could not start |
| `2` | Discovery completed with warnings and `--fail-on-warning` was set |
