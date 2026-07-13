# UpgradeLens

UpgradeLens discovers the project layout and technology footprint of a software repository. MVP-01 provides a local, deterministic discovery CLI and a versioned project manifest that later upgrade-analysis stages can consume.

## Requirements

- Node.js 20 or newer
- No runtime dependencies

## Install and run

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

By default, discovery writes:

```text
<project>/.upgradelens/project-manifest.json
```

Print the result without writing a file:

```sh
upgradelens discover /path/to/project --stdout
```

Use `upgradelens --help` for all options. The command also accepts a path without the optional `discover` verb.

## What is discovered

MVP-01 recognizes Node.js, Python, Java/Kotlin, .NET, Go, Rust, Ruby, PHP, and Dynamics 365 Business Central AL project manifests. It supports polyglot repositories plus Node workspace root/member relationships from `package.json` and `pnpm-workspace.yaml`. Common dependency, cache, and generated directories such as `.git`, `node_modules`, `vendor`, `dist`, and `.upgradelens` are excluded, and symbolic links are not followed.

Malformed or unreadable individual manifests become warnings instead of discarding valid results from the rest of the repository. Use `--fail-on-warning` in CI when warnings should produce a non-zero status.

## JavaScript API

```js
import { discoverProject } from 'upgradelens';

const manifest = await discoverProject('/path/to/project');
```

See [MVP-01 design and scope](docs/MVP-01.md) and the [project manifest JSON Schema](schemas/project-manifest.schema.json).

## Development

```sh
npm test
npm run check
```

UpgradeLens is a single npm package named `upgradelens`, exposing the `upgradelens` command. This repository is intentionally not a monorepo.

## License

[MIT](LICENSE)
