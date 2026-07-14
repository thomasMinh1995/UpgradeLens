# MVP-02 PyPI Registry Adapter

MVP-02-05 adds an internal adapter for public Python package facts from PyPI. It consumes a package-centric Research Plan record, uses the private Knowledge Store, and returns internal package, registry-source, cache-outcome, and warning records. It does not assemble or write a Knowledge Manifest.

> The `pypi:` identity represents the PyPI registry ecosystem. It does not mean that the source project uses pip.

## Python installers and PyPI identity

pip, pip-tools, Poetry, uv, and Pipenv can all declare the same public PyPI project. The adapter uses only the normalized registry identity:

```text
pypi:<normalized-name>
```

Names follow the PyPA-compatible rule already used by Research Planning: lowercase and collapse runs of `.`, `_`, and `-` to `-`. For example, `LangChain_OpenAI` and `langchain-openai` identify `pypi:langchain-openai`; `zope.interface` identifies `pypi:zope-interface`.

The adapter does not invoke installer CLIs and does not read `pip.conf`, Poetry/uv/Pipenv lockfiles, requirements options, or repository configuration. Installer identity never enters requests or cache keys.

## Public API and request construction

The primary official API is PyPI project JSON:

```text
GET https://pypi.org/pypi/<normalized-project-name>/json
```

The default metadata base is `https://pypi.org`; the future JSON Index base is `https://pypi.org/simple`. Both may be supplied as explicit HTTPS policy inputs for tests or later orchestration. HTTP, credentials, query-bearing bases, and repository-derived custom indexes are rejected.

MVP-02-05 makes only the project JSON request. It does not scrape HTML, search PyPI, or issue a second Index API request. The existing bounded JSON fetcher provides GET-only requests, JSON `Accept`, a stable UpgradeLens user agent, omitted credentials, disabled redirects, timeout, and response-size limits.

## Cache behavior

The private [Lightweight Knowledge Store](MVP-02-Knowledge-Store.md) uses this identity:

```json
{
  "adapter": "pypi",
  "resourceKind": "registry-package",
  "packageId": "pypi:fastapi",
  "resourceVariant": "project-json",
  "adapterVersion": "1"
}
```

The default TTL is 24 hours, supplied by the adapter rather than the generic store. Fresh entries are normalized without a request. Missing entries fetch, validate, atomically cache, and normalize. Expired entries fetch a replacement; failure produces unavailable facts rather than silently returning stale data. Corrupted entries are never used and are overwritten only after a valid response. Cache outcomes do not expose cache paths, filenames, keys, validators, or envelopes.

## Project JSON normalization

The adapter validates `info`, `info.name`, and the requested normalized identity before caching. `info.name` can differ in case, underscore, dot, or hyphen spelling only when its normalized form matches the requested `pypi:` identity. `info.version` is optional: if absent or malformed, the adapter does not select another release and returns partial facts.

`info.version` is the only registry-designated latest fact. It is recorded as `selection: project-info-version`; no PEP 440 parsing, semantic ordering, prerelease filtering, range comparison, or upgrade recommendation occurs.

When project JSON exposes `releases`, release identifiers are sorted with code-unit lexical ordering. Each entry contains only the opaque version, earliest valid upload time, PyPI version page, nullable yanked state, and source ID. File URLs, hashes, wheels, dependency graphs, and build details are omitted. The normalizer is isolated so a later task can use the JSON Index API without changing common output fields.

Yanked state uses only explicit file metadata:

- all files explicitly `yanked: true` → `true`;
- at least one file explicitly `yanked: false` → `false`;
- otherwise → `null`.

Missing file metadata is never converted to `false`.

## Metadata and Project URLs

The adapter normalizes a safe summary/description, preferring `license_expression` over `license`, and retains an explicit Development Status classifier in the existing `projectStatus` field. It does not infer licenses from classifiers or assign risk/recommendation meaning to project status.

Publisher-controlled `info.project_urls` labels are classified case-insensitively:

- `Documentation` / `Docs` → `documentationUrl`
- `Source` / `Repository` / `Code` → `repositoryUrl`
- `Issues` / `Tracker` / `Bug Tracker` → `issueUrl`
- `Homepage` / `Home` → `homepageUrl`

`Changelog`, `Changes`, `Release Notes`, and `Releases` are retained only as sanitized internal source candidates for Source Provenance Resolution; they are not public metadata fields and are not emitted in a Knowledge Manifest until later assembly. Unknown labels are ignored rather than guessed from domains or URL paths. `home_page` is used only as a safe homepage fallback when no classified homepage exists.

Only HTTPS public URLs are retained. Credentialed URLs, query strings, and fragments are rejected or removed. `git+https:` repository URLs are normalized to HTTPS and GitHub `.git` suffixes are removed for display. Documentation and repository links remain publisher-trust candidates; MVP-02-05 does not corroborate them as official sources.

## Source provenance and errors

A successful result creates a registry source such as `pypi:fastapi:registry`, with registry authority, publisher trust, PyPI project/API URLs, supported fact roles, portable content digest, retrieval timestamp, and fresh snapshot. Store internals, ETag, Last-Modified, headers, credentials, and local paths never appear in this output.

| Condition | Package status | Warning |
| --- | --- | --- |
| PyPI `404` | `notFound` | `PACKAGE_NOT_FOUND` |
| PyPI `429` | `unavailable` | `REGISTRY_RATE_LIMITED` |
| `5xx`, timeout, or transport failure | `unavailable` | `REGISTRY_UNAVAILABLE` |
| Invalid JSON/media/size/project shape/name mismatch | `unavailable` | `REGISTRY_RESPONSE_INVALID` |

Errors are sanitized; raw response bodies, headers, stack traces, tokens, credentialed URLs, and cache details are never returned. Negative responses, invalid responses, rate limits, and transport failures are not cached.

## Intentional limitations

This adapter does not implement private indexes, authentication, Python installer execution/configuration/lockfile parsing, dependency resolution, PEP 440 comparison, target selection, documentation fetching, GitHub Releases, source corroboration, PyPI JSON Index requests, Knowledge Manifest orchestration, a research CLI, breaking-change analysis, or AI behavior.
