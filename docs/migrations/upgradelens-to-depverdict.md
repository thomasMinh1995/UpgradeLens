# UpgradeLens to DepVerdict migration

DepVerdict is the canonical product identity beginning with
`0.6.0-alpha.1`. This guide covers the bounded `0.6.x` preview transition. It
does not change historical artifact schemas or move local data automatically.

## Identity map

| Old | New | Compatibility |
| --- | --- | --- |
| `upgradelens` npm identity | `@thomasminh1995/depverdict` | The old npm package was never successfully published; install the scoped package after its preview distribution gate passes. |
| `upgradelens` CLI | `depverdict` | The alias remains for one `0.6.x` preview window and emits a bounded stderr warning. |
| `.upgradelens/` | `.depverdict/` | A complete legacy input chain may be read as fallback; new implicit writes are canonical. |
| `UPGRADELENS_*` | `DEPVERDICT_*` | Canonical variables win; legacy fallback warns without printing values. |
| GitHub UpgradeLens URL | GitHub DepVerdict URL | The rename is complete. Use the DepVerdict URL directly; the former URL is a redirect compatibility aid, not an operational dependency. |

## Commands and installation

New commands should use:

```sh
depverdict analyze .
depverdict analyze . --offline
depverdict analyze . --fail-on-incomplete
```

The planned npm preview install command is:

```sh
npm install -g @thomasminh1995/depverdict@preview
```

The preview has not yet passed final distribution qualification, so this command
is not presented as currently guaranteed to succeed. Until publication, run the
canonical source executable:

```sh
node ./bin/depverdict.js --help
```

Do not install an `upgradelens` npm package as a migration step.

## Artifact migration

New implicit writes go to `.depverdict/`. DepVerdict does not automatically move,
copy, delete, or merge `.upgradelens/` data.

Automatic compatibility reads select one complete root:

1. a complete canonical chain wins;
2. a complete legacy chain may be used only when no canonical chain member exists;
3. partial, split, or conflicting roots fail closed;
4. explicitly supplied paths remain authoritative, including explicit legacy
   paths.

Do not combine files from the two roots to manufacture a complete chain. Historical
schemas and existing artifacts remain valid under their original protocol
identities; the brand migration does not rewrite `generator.name`, schema names,
task IDs, reason codes, or lineage.

## Environment migration

Rename each supported variable key without printing or copying its value into logs:

| Legacy | Canonical |
| --- | --- |
| `UPGRADELENS_AI_PROVIDER` | `DEPVERDICT_AI_PROVIDER` |
| `UPGRADELENS_AI_ENDPOINT` | `DEPVERDICT_AI_ENDPOINT` |
| `UPGRADELENS_AI_MODEL` | `DEPVERDICT_AI_MODEL` |
| `UPGRADELENS_AI_AUTHORIZATION` | `DEPVERDICT_AI_AUTHORIZATION` |
| `UPGRADELENS_AI_TIMEOUT_MS` | `DEPVERDICT_AI_TIMEOUT_MS` |
| `UPGRADELENS_AI_TIMEOUT_SECONDS` | `DEPVERDICT_AI_TIMEOUT_SECONDS` |
| `UPGRADELENS_AI_MAX_RESPONSE_BYTES` | `DEPVERDICT_AI_MAX_RESPONSE_BYTES` |
| `UPGRADELENS_AI_DEBUG` | `DEPVERDICT_AI_DEBUG` |

Edit secret stores manually. Never print an authorization value to verify the
rename. When both mapped keys exist, the canonical key wins and DepVerdict emits a
key-only diagnostic.

## Repository transition

The repository rename is complete. Use the canonical routes directly:

- repository: `https://github.com/thomasMinh1995/DepVerdict`;
- issues: `https://github.com/thomasMinh1995/DepVerdict/issues`;
- private security reports:
  `https://github.com/thomasMinh1995/DepVerdict/security/advisories/new`.

The former `https://github.com/thomasMinh1995/UpgradeLens` route redirects for
continuity, but current operations and metadata do not depend on that redirect.

## Compatibility removal

The compatibility window is preview-bounded, not an indefinite support guarantee
or a stable calendar deadline. Removing the CLI alias, artifact fallback, or
environment fallback requires a separate decision, release note, consumer-usage
review, canonical-only regression validation, and explicit release authorization.
