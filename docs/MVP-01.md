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

The contract is versioned independently through `schemaVersion`. Paths are POSIX-style and relative to the discovered root so output does not expose machine-specific absolute paths. Projects and warnings are sorted, making every field except `generatedAt` reproducible for unchanged input.

The normative schema is [`schemas/project-manifest.schema.json`](../schemas/project-manifest.schema.json).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Discovery completed (warnings may be present unless strict mode is used) |
| `1` | Invalid invocation or discovery could not start |
| `2` | Discovery completed with warnings and `--fail-on-warning` was set |
