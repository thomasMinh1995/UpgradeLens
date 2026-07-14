# MVP-02 CLI-Owned HTTP Runtime

## Why it exists

VinGrade validation showed that an online research command could finish research, validate and write its Knowledge Manifest, print completion output, and still remain alive with established HTTPS sockets. Cache-heavy and offline runs exited normally. RC-01 confirmed and fixed response/body and timer cleanup, but a one-shot CLI still had no ownership over the connection pool used by `globalThis.fetch`.

The observation proves a lifecycle problem in the live command; it does not by itself prove the exact implementation detail inside the global Undici dispatcher. A one-shot CLI nevertheless needs an explicit resource boundary so its own network resources can be closed deterministically.

## Ownership model

```text
online CLI creates scoped runtime
        ↓
adapters borrow runtime.fetch
        ↓
research, validation, and output complete or fail
        ↓
CLI closes its owned Agent in finally
        ↓
Node exits naturally
```

`createCliHttpRuntime()` creates one scoped Undici `Agent` for one online `research` command. Its fetch function passes that Agent only to the corresponding Undici fetch call. It uses bounded connections and short keep-alive settings so concurrent package research can reuse connections during the command without retaining the pool afterwards.

The module is internal: it is not exported from the package root and never appears in manifests, cache entries, source records, warnings, policy, or research IDs. It does not replace the process-wide dispatcher.

## Online and offline behavior

- Online `upgradelens research` creates the runtime only when the CLI has not received an injected fetch.
- The CLI injects the runtime fetch into the existing npm and PyPI adapters.
- `research --offline`, `discover`, `--help`, and `--version` create no runtime.
- A user-injected fetch remains user-owned and is never closed by UpgradeLens.

`close()` is asynchronous and idempotent. The CLI invokes it exactly once in its ownership path after all research, manifest validation, stdout serialization, or atomic output work has finished.

## Error behavior

The CLI closes its runtime after successful execution, package-level warning results, input failures, manifest failures, writer failures, and unexpected execution errors. If primary work fails and close also fails, the primary failure is preserved. If work succeeds but close fails, the command returns a non-zero operational result with a sanitized message. No raw Undici error, stack trace, response body, or header is emitted in normal CLI output.

The CLI never uses `process.exit()` or an unref-based shutdown workaround. Natural process exit follows closure of resources that UpgradeLens owns.

## Validation scope

Automated tests verify scoped-dispatcher injection, idempotent close, no global fetch mutation, fetch-after-close failure, close precedence, offline/non-research gating, stdout JSON-only behavior, and user-injected fetch ownership. A local child-process integration test performs concurrent registry-like keep-alive HTTP requests through a real scoped Agent, then validates natural exit after normal, oversized, and 404/429/5xx responses.

## Intentional limitations

This runtime has no proxy support, authentication, private registry configuration, global-dispatcher mutation, retry policy, or background worker. It is not a generic networking framework.

Vite's current full npm packument is approximately 38.9 MB, above the intentional 16 MiB npm response policy. It can therefore remain `unavailable` with `REGISTRY_RESPONSE_INVALID`; that payload-policy limitation is separate from the CLI lifecycle blocker. This task does not introduce abbreviated npm metadata, release-index redesign, or streaming JSON parsing.
