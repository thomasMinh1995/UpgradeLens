# MVP-02 Registry HTTP Lifecycle

MVP-02 registry adapters share a small bounded JSON transport helper. It is an implementation detail: it does not add a public API, change either manifest schema, or introduce a network runtime framework.

## Limits

The helper accepts a caller-provided positive safe-integer `maxResponseBytes`; it does not impose one shared registry default. Adapters own their limits because their payload shapes differ:

| Adapter | Default | Rationale |
| --- | ---: | --- |
| npm full packument | 16 MiB | Complete per-version metadata can make established package documents several megabytes. |
| PyPI project JSON | 8 MiB | Usually smaller, but established projects can exceed 1 MB. |

Both adapters reject zero, negative, fractional, unsafe, and over-ceiling values at construction. The common safety ceiling is 64 MiB. These values are execution settings only; they are not emitted in the Project Manifest or Knowledge Manifest.

## Bounded read and cleanup guarantee

The helper uses a WHATWG stream reader when available. It counts bytes before retaining a chunk and stops accumulating as soon as the configured limit is exceeded. It does not call unrestricted `response.json()` or `response.text()` on normal WHATWG responses.

Every response owned by the helper ends in one of two states:

- a successful 200 JSON body is fully consumed before it is parsed and validated; or
- an unused or rejected body is explicitly cancelled.

This includes 404, 429, 5xx, unexpected statuses, invalid media type, declared oversize, streaming oversize, and fallback body-reader failures. An oversized reader is cancelled, its lock is released, and the response body is also best-effort cancelled after release. Cleanup failures are deliberately suppressed so they cannot expose upstream details or replace the focused sanitized error.

## Timeout and transport ownership

An `AbortController` timeout covers fetch and bounded reading. The helper stores its handle and clears it in `finally` on success, HTTP errors, parse failures, aborts, and cleanup paths. No response, reader, or controller is retained after completion.

The transport helper accepts injected WHATWG-compatible fetch behavior and does not own a dispatcher. For an online CLI research run, the CLI now creates a scoped runtime with an Undici `Agent`, injects its fetch into the adapters, and closes that Agent after research/output handling in `finally`. The runtime does not replace Undici's global dispatcher.

Offline CLI research creates no HTTP runtime. Direct/internal consumers that inject a fetch remain its owner; UpgradeLens never attempts to close an injected fetch or its resources. See [CLI-owned HTTP runtime](MVP-02-CLI-HTTP-Runtime.md).

## Error and cache behavior

Oversize remains bounded and is not partially parsed or cached. The internal adapter codes are `NPM_RESPONSE_TOO_LARGE` and `PYPI_RESPONSE_TOO_LARGE`; the stable public mapping remains `REGISTRY_RESPONSE_INVALID`, avoiding a schema change. Raw bodies, headers, credentials, cache details, and stack traces are not exposed.
