# OSS-04 Public CI and Package Metadata Architecture

## Status and scope

This decision defines read-only public continuous integration and npm/GitHub
metadata for UpgradeLens `0.5.0`. It does not change runtime, schema, evaluation,
upgrade-decision, or Migration Checklist policy. It also does not publish a package,
create a release, or mutate repository state.

## Workflow triggers

CI runs for every `pull_request`, pushes to `main` and `develop`, and manual
`workflow_dispatch` requests. Both long-lived branches exist locally and on the
canonical remote. Pull requests are the primary review gate; direct pushes are
covered so the protected branch state is independently validated. There is no
schedule because OSS-04 has no time-based check or dependency-update policy.

`pull_request_target` is prohibited. Fork code therefore runs only in the ordinary
pull-request context with a read-only token and no repository secrets.

## Supported Node matrix

The package declares `node >=20`, so CI does not narrow the engine contract. The
mandatory compatibility matrix is:

- Node 20: the declared minimum, retained as a compatibility floor even though its
  upstream support window ended on 2026-04-30;
- Node 22: the newer maintenance LTS line, supported through 2027-04-30;
- Node 24: the current active LTS line, supported through 2028-04-30.

The dates come from the official
[Node.js release schedule](https://github.com/nodejs/Release/blob/main/schedule.json).
Node 26 is Current until October 2026, not LTS at this decision date, so it is not a
mandatory preview gate. The Node 24 package-smoke job is the primary release-line
check. Node 20 remains visible rather than being silently removed; changing the
minimum engine is a separate compatibility and release-policy decision.

## Action supply-chain policy

Only GitHub-maintained `actions/checkout` and `actions/setup-node` are used. Each is
pinned to the full commit currently referenced by its supported `v6` release line,
with the major version retained in a comment:

- `actions/checkout`: `df4cb1c069e1874edd31b4311f1884172cec0e10`;
- `actions/setup-node`: `249970729cb0ef3589644e2896645e5dc5ba9c38`.

Full SHA pinning makes a reviewed workflow revision immutable. The trade-off is
that action security and runtime updates require an explicit pull request instead
of arriving through a moving major tag. No third-party action is needed.

Checkout disables credential persistence because no later step performs an
authenticated Git operation. Setup Node uses the committed lockfile as the explicit
npm cache dependency.

## Permissions, fork safety, and provider isolation

Workflow permissions are exactly `contents: read`. There is no write, package,
identity-token, security-event, issue, or pull-request permission. Jobs do not read
`secrets`, call a write API, interpolate pull-request-controlled fields into shell
commands, upload artifacts, or retain credentials.

The test job sets `CI=true` and shadows supported UpgradeLens provider variables
with empty values. This prevents a runner or repository environment from supplying
an inherited endpoint, model, authorization value, timeout, or debug mode. Tests
continue to inject their own deterministic fake environments where required.
Neither CI job needs OpenAI, OpenRouter, Anthropic, Ollama, a local qualification
record, private repository access, or any real-provider credential.

## Install, test, and package-smoke stages

The matrix job performs:

1. read-only checkout;
2. Node setup with npm cache;
3. deterministic `npm ci`;
4. the canonical `npm test`;
5. `npm run check:package`, which creates and validates an actual tarball with
   lifecycle scripts disabled.

No lint, typecheck, or build command is invented because the repository defines
none. Local matrix replay found that Node 20's default test-runner concurrency can
starve one real keep-alive lifecycle test past its unchanged three-second natural
exit budget. The same test passes alone, and the complete Node 20 suite passes when
the canonical npm test script receives `--test-concurrency=2`. CI applies that
bounded runner concurrency only on Node 20; it does not skip the test, increase its
timeout, or alter product behavior. Node 22 and Node 24 use plain `npm test`.

The Node 24 package-smoke job performs:

1. the same checkout, setup, and deterministic install;
2. `npm pack --dry-run --json --ignore-scripts`;
3. a repository-owned Node script that creates an actual tarball in an isolated
   cache/output directory;
4. actual-manifest package-guard validation and tar extraction;
5. a clean, lifecycle-disabled install from that tarball;
6. installed CLI `--version` and `--help`;
7. ESM package import and the existing 438-public-export contract;
8. cleanup of all task-owned temporary state in `finally`.

The package smoke does not call the product analysis workflow, a provider, a
publisher, or a deployment target. No tarball is uploaded as an Actions artifact;
logs contain only bounded verification summaries, so artifact retention is zero.

## Lifecycle and side-effect boundary

`package.json` has no `prepack`, `prepare`, `prepublishOnly`, `preinstall`,
`install`, or `postinstall` hook. The package guard calls
`npm pack --json --ignore-scripts`, so `check:package` cannot recurse through an npm
lifecycle. Consumer installation in the smoke also uses `--ignore-scripts`.

The workflow contains no `npm publish`, Git tag, release creation, commit, push,
deployment, PR comment, or generated-file writeback. It cannot publish because it
has neither a publishing command nor write/OIDC credentials.

## Concurrency, cancellation, and timeout

The concurrency group uses the workflow name and stable Git ref. A newer commit on
the same branch or pull-request ref cancels the older run. Different branches and
pull requests remain independent.

Each job has a 20-minute timeout. This allows deterministic install and the
canonical suite reasonable runner variance while bounding dependency, listener, or
subprocess hangs. The package smoke has the same finite ceiling.

## Package metadata ownership and lockfile policy

`package.json` owns the public npm description, repository, homepage, issue URL,
keywords, version, engine, executable, export, license, and package-content
boundary. OSS-04 updates only stale positioning and missing public discovery
metadata.

`package-lock.json` mirrors dependency-tree and root-package fields that npm records.
Description, homepage, bugs, and keywords are not forced into the lockfile. A
lockfile-only npm consistency check must produce no dependency, resolved, integrity,
or version drift.

## Hosted acceptance

Static validation and local command replay can prove the workflow contract but
cannot prove a hosted run. After a maintainer commits and pushes the change, every
Node matrix job and the Node 24 package-smoke job must pass at the recorded commit
before branch protection or the next qualification gate treats CI as hosted proof.
