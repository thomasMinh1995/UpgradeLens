# MVP-02 npm-Compatible Registry Adapter

MVP-02-04 adds the internal adapter that collects facts for Node package identities in the npm-compatible registry ecosystem. It accepts a research package from the deterministic Research Plan and returns internal package, registry-source, cache-outcome, and warning records. It does not assemble or write a Knowledge Manifest.

> The `npm:` package identity identifies the npm-compatible registry ecosystem. It does not mean that the source repository uses the npm CLI.

## Package managers and registry identity

Projects using npm, Yarn, pnpm, or Bun commonly resolve the same public Node package identity through an npm-compatible registry. The adapter therefore works only from:

```text
registry: npm
packageId: npm:<normalized-package-name>
```

It does not invoke a package-manager CLI, inspect lockfiles, or read `.npmrc`, `.yarnrc.yml`, or `bunfig.toml`. Package-manager origin is intentionally absent from both the registry request and the cache identity. Equivalent `npm:react` Research Plan records produce the same request, cache entry, and normalized facts regardless of whether their source project used npm, Yarn, pnpm, or Bun.

## Public Registry scope and requests

The default approved Registry base is `https://registry.npmjs.org`. Internal callers may supply another explicit HTTPS base for tests or a future approved policy. HTTP, credentialed URLs, query-bearing bases, and repository-derived registry selection are rejected.

The adapter requests the full packument representation with one deterministic `GET`:

```text
<registry-base>/<encodeURIComponent(normalized-package-name)>
```

Examples:

```text
https://registry.npmjs.org/react
https://registry.npmjs.org/%40vitejs%2Fplugin-react
```

The adapter uses `Accept: application/json`, a stable UpgradeLens user agent, `credentials: omit`, and disabled redirects. It sends no authorization or cookie headers. npm search is never used as an identity fallback.

## Cache integration

The adapter uses the private [Lightweight Knowledge Store](MVP-02-Knowledge-Store.md) with this identity:

```json
{
  "adapter": "npm",
  "resourceKind": "registry-package",
  "packageId": "npm:react",
  "resourceVariant": "full-packument",
  "adapterVersion": "1"
}
```

The default adapter TTL is 24 hours, but callers may provide a policy TTL. The store itself remains registry-agnostic.

| Cache state | Adapter behavior |
| --- | --- |
| Fresh | Normalize the cached packument; no request is made. |
| Missing | Fetch, validate, atomically cache, then normalize. |
| Expired | Fetch and replace on success. Fetch failure returns unavailable facts; stale data is not silently used. |
| Corrupted | Treat as unusable, fetch a replacement, and overwrite only after validation succeeds. |

The internal result records `hit`, `miss`, `revalidated`, or a corruption-replacement outcome without exposing filenames, cache keys, or store paths.

## Packument facts and normalization

The adapter validates that the response has the requested exact package name, `dist-tags`, `versions`, and `time` objects before caching it. A scoped name must match exactly; a response for another package is rejected. Optional malformed publisher metadata is omitted rather than causing a crash.

It normalizes these facts when safely present:

- description and license;
- HTTPS homepage, repository, and issue URLs;
- package-level deprecation message/status when explicitly reported;
- `dist-tags.latest` as a registry fact;
- a minimal release index with opaque version, valid publication time, npm release URL, and explicit deprecation state.

Repository strings and `{ "url": "..." }` objects are supported. `git+https:` is normalized to HTTPS, GitHub `.git` suffixes are removed, and credentialed repository URLs are dropped. URL queries and fragments are not retained.

`latest` is taken only from `dist-tags.latest`; the adapter never chooses a lexical or semantic maximum. If that tag is absent or references a version missing from `versions`, no alternative version is selected and the result is partial. Release versions are sorted by code-unit lexical order. The adapter does not parse SemVer, infer prereleases, or treat a version as yanked without an explicit registry fact.

Each successful result creates one internal registry source record such as `npm:react:registry`, with registry authority, publisher trust, package/API URLs, source roles, content digest, retrieval timestamp, and `fresh` snapshot state. This record is shaped for later Knowledge Manifest assembly but is not itself a manifest.

## Response limits and error mapping

Full npm packuments contain complete metadata for every published version and can be several megabytes. The adapter therefore owns a default bounded limit of **16 MiB** (`16 * 1024 * 1024`). Callers may set `maxResponseBytes` explicitly for tests or a future execution policy; it must be a positive safe integer and may not exceed the documented 64 MiB safety ceiling. The setting is execution configuration, not Knowledge Manifest policy.

Response bodies are read through a bounded streaming reader; the adapter never calls `response.json()` directly. It requires a JSON media type and rejects a body larger than the configured maximum without caching it. An oversized body retains the internal `NPM_RESPONSE_TOO_LARGE` code and maps to the existing public `REGISTRY_RESPONSE_INVALID` warning.

Every response body is fully consumed or explicitly cancelled. Unused non-200 bodies, wrong-media bodies, and oversized streams are cancelled; oversized readers are cancelled and release their lock. The request timeout covers the complete fetch/read lifecycle and is cleared in `finally` on every outcome. Online CLI research injects a scoped, CLI-owned fetch and closes its Agent after completion; direct callers retain ownership of injected fetch resources.

| Condition | Package status | Warning |
| --- | --- | --- |
| Registry `404` | `notFound` | `PACKAGE_NOT_FOUND` |
| Registry `429` | `unavailable` | `REGISTRY_RATE_LIMITED` |
| `5xx`, timeout, or transport failure | `unavailable` | `REGISTRY_UNAVAILABLE` |
| Invalid JSON/media/size/packument shape/name mismatch | `unavailable` | `REGISTRY_RESPONSE_INVALID` |

Negative responses, rate-limit responses, invalid payloads, and transport failures are not cached.

## Intentional limitations

This adapter does not implement private registries, authentication, package-manager configuration, package-manager CLI execution, lockfile parsing, Yarn/pnpm/Bun-specific adapters, PyPI, GitHub Releases, documentation crawling, conditional HTTP requests, retries, Knowledge Manifest orchestration, a research CLI command, version comparison, breaking-change analysis, or AI behavior.
