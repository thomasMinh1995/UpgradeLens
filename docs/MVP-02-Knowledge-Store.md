# MVP-02 Lightweight Knowledge Store

MVP-02-03 implements the smallest useful part of the Knowledge Store: a private, deterministic filesystem cache for future npm and PyPI registry adapters. It prevents repeat retrieval work once adapters exist, while keeping cache implementation details out of the portable Knowledge Manifest.

The approved MVP-02 architecture remains the long-term direction. This implementation deliberately does not yet provide its complete content-addressed evidence store, HTTP validator handling, or multi-repository configuration. It is easy to delete and rebuild because it stores only cache envelopes, never a repository scan or public artifact.

## Boundary and location

The store is private to MVP-02 implementation:

```text
Research package
        │
        ▼
Lightweight Knowledge Store
        │
        ▼
Registry adapter decision
```

Its default root is relative to the process working directory:

```text
.upgradelens/cache/knowledge/v1/
```

Internal callers may configure a different root, which makes the store straightforward to test. The directory layout, filesystem path, cache key, and envelope are not part of either the Project Manifest or Knowledge Manifest contract. No downstream MVP consumes this directory.

## Identity and key

Each entry is package/source-centric. `createCacheIdentity` accepts exactly these portable fields:

- `adapter` (for example, `npm` or `pypi`)
- `resourceKind` (for example, `registry-package`)
- `packageId` (for example, `npm:react` or `npm:@scope/package`)
- `resourceVariant` (for example, `full-metadata`)
- `adapterVersion`

The cache calculates a SHA-256 filename from the canonical JSON identity. Scoped npm names and other package characters therefore never become directory names. Repository paths, Project Manifest digests, timestamps, retry counters, credentials, authorization, user agents, and volatile request headers are deliberately absent from this identity. The same resource request can be reused across runs without exposing its storage key in a public artifact.

## Envelope contract

Every stored JSON file has this strict internal shape:

```json
{
  "envelopeVersion": "1",
  "identity": {
    "adapter": "npm",
    "resourceKind": "registry-package",
    "packageId": "npm:react",
    "resourceVariant": "full-metadata",
    "adapterVersion": "1"
  },
  "storedAt": "2026-07-14T00:00:00.000Z",
  "expiresAt": "2026-07-15T00:00:00.000Z",
  "bodyDigest": "sha256:<64 lowercase hexadecimal characters>",
  "body": {}
}
```

`bodyDigest` is SHA-256 over UTF-8 canonical JSON for `body`: object keys are sorted recursively and array order is preserved. Functions, symbols, BigInt, undefined values, non-finite numbers, circular references, and non-plain objects are rejected. This makes logically equal JSON objects produce the same digest regardless of insertion order, while preserving meaningful list order.

The store rejects envelope fields beyond this contract and validates the version, identity, dates, expiry order, body digest, and body privacy on every read. Envelopes never persist cache keys, absolute local paths, credentials, authorization data, HTTP headers, ETag, Last-Modified, or raw error stacks.

## Read states and TTL

`cache.read(identity)` returns a structured result instead of turning normal cache conditions into exceptions:

| State | Meaning |
| --- | --- |
| `fresh` | A valid entry exists and `now < expiresAt`; its body and metadata are returned. |
| `expired` | A valid entry exists and `now >= expiresAt`; its body and metadata are returned for the adapter to decide whether stale data is usable. |
| `missing` | No entry exists. |
| `corrupted` | The file cannot be trusted (for example invalid JSON, wrong identity, unsupported envelope version, invalid dates, or digest mismatch). The body is never returned. |

TTL is caller policy. `cache.write(identity, body, { ttlMs })` requires a non-negative integer TTL and computes `expiresAt = storedAt + ttlMs` using an injectable clock. The cache does not select registry TTLs, refresh records, make stale-fallback decisions, schedule invalidation, cache failures, or clean old files in the background.

Operational filesystem failures—such as permission errors, unavailable storage, or an atomic rename failure—throw focused internal `KnowledgeCacheError` values with stable codes. They are not converted into registry warnings by this layer.

## Atomic writes and concurrency

Writes create parent directories, serialize the full envelope, write and flush a temporary file beside the target, close it, then rename it to the SHA-256 final filename. A failure cannot leave a partial final entry; temporary-file cleanup is best effort. The implementation intentionally does not provide locks or cross-process coordination. Concurrent-write policy is deferred until registry orchestration has a concrete need.

## Intentional limitations

MVP-02-03 does not implement HTTP fetching, npm/PyPI adapters, ETag, Last-Modified, conditional requests, shared-cache configuration, databases, background cleanup, distributed locking, portable evidence bundles, Knowledge Manifest generation, version analysis, or AI behavior. Those capabilities remain outside this small internal cache layer.
