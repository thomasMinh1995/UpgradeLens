# DIFF-02 — Identity and Compatibility Contract

- Status: Accepted for implementation
- Date: 2026-07-19
- Scope: `0.6.0-alpha.1`
- Product identity: DepVerdict
- Distribution identity: `@thomasminh1995/depverdict`
- Canonical executable: `depverdict`

## Context

UpgradeLens `v0.5.0` established the current evidence formats, workflow semantics,
and historical release record. The next preview changes the product and
distribution identity to DepVerdict without invalidating those artifacts or
silently changing their meaning.

This decision is intentionally narrower than the later repository,
documentation, and community migration. The repository remains
`thomasMinh1995/UpgradeLens` during DIFF-02. Existing tags, especially `v0.5.0`,
and existing review or qualification records remain historical facts and are
not rewritten.

## Accepted identity map

| Surface | Canonical identity | Compatibility identity |
| --- | --- | --- |
| Product | DepVerdict | UpgradeLens in historical records |
| Future repository | `thomasMinh1995/DepVerdict` | Current repository is not renamed here |
| npm package | `@thomasminh1995/depverdict` | No second legacy package is introduced |
| CLI | `depverdict` | `upgradelens`, deprecated for the `0.6.x` preview window |
| Artifact root | `.depverdict/` | `.upgradelens/`, read-only fallback |
| Environment prefix | `DEPVERDICT_*` | `UPGRADELENS_*`, deprecated fallback |
| Preview version | `0.6.0-alpha.1` | `v0.5.0` remains immutable history |

## 1. Package and executable contract

The package name becomes `@thomasminh1995/depverdict`, and its version becomes
`0.6.0-alpha.1`. The package exposes two executable entries:

- `depverdict` is the canonical executable.
- `upgradelens` is a thin compatibility wrapper that invokes the same command
  dispatcher with an explicit legacy invocation identity.

Both executables must produce the same exit codes, stdout payloads, and
artifacts for the same command and inputs. The only permitted difference is a
bounded deprecation diagnostic on stderr from the legacy executable. The
diagnostic is emitted at most once per process and must not contain secrets.

The alias remains through the `0.6.x` preview compatibility window. Its removal
requires a separate decision and release note; this implementation does not
silently remove it.

The npm preview publication itself is outside DIFF-02. When publication is
authorized later, it must use the `preview` dist-tag rather than `latest`.

## 2. Runtime product presentation

New runtime presentation uses DepVerdict:

- help and version banners;
- user-agent strings;
- decision-first outcome headings;
- runtime remediation text and command examples.

Historical persisted names are not presentation strings. They remain unchanged
where they participate in existing schema contracts.

## 3. Persisted schema compatibility

Existing artifact schemas, schema versions, reason codes, prompt versions,
policy versions, and provider qualification identities remain unchanged.

In particular, existing schemas require `generator.name` to equal
`"UpgradeLens"`. New `0.6.0-alpha.1` artifacts therefore continue to write that
value as a compatibility protocol identifier. The runtime product name
`DepVerdict` is separate from this persisted protocol identifier.

The existing internal version-analysis schema name
`upgradelens_version_analysis` also remains unchanged because it participates in
provider request and qualification compatibility.

This separation prevents a brand change from masquerading as an evidence-format
or provider-contract migration.

## 4. Artifact write-root contract

All implicit/default writes use `.depverdict/`.

An explicit output path supplied by the caller remains authoritative. The
runtime must not rewrite, relocate, copy, or delete explicitly addressed
artifacts.

The legacy `.upgradelens/` directory remains ignored by discovery alongside
`.depverdict/`. This prevents either generated tree from affecting project
analysis.

## 5. Legacy artifact read contract

Automatic compatibility reads use a whole-chain selection rule:

1. If every required canonical artifact exists, use the canonical chain.
2. If the canonical chain is complete and legacy artifacts also exist, use the
   canonical chain and emit one bounded `LEGACY_ARTIFACT_ROOT_IGNORED`
   diagnostic.
3. If no canonical member exists and every required legacy artifact exists, use
   the legacy chain and emit one bounded `LEGACY_ARTIFACT_ROOT_USED`
   diagnostic.
4. If both roots contain members but the canonical chain is incomplete, or the
   only available inputs form a split/partial chain, fail closed with
   `ARTIFACT_ROOT_CONFLICT`.
5. If neither root contains a member, select canonical paths so the established
   missing-input behavior remains authoritative.

The resolver never combines artifacts from both roots. It never judges
lineage by timestamps and never repairs a chain by copying files.

Explicit input paths bypass automatic root selection. An explicitly selected
legacy path is allowed because caller intent is unambiguous.

## 6. Stage-boundary behavior

Automatic root selection is applied at input boundaries that consume persisted
workflow state, including:

- research manifest loading;
- version-analysis manifest, knowledge manifest, and evidence-bundle loading;
- migration-checklist workflow input loading;
- default migration-qualification resolution.

Each boundary declares its complete required input set. A downstream stage must
not fill missing canonical members from legacy storage.

A standalone stage may read a complete legacy input set and write its output to
the canonical default root. That does not grant later stages permission to
merge the roots. The caller must regenerate a complete canonical chain or use
explicit input paths.

## 7. Environment compatibility contract

Supported canonical variables are:

- `DEPVERDICT_AI_PROVIDER`
- `DEPVERDICT_AI_ENDPOINT`
- `DEPVERDICT_AI_MODEL`
- `DEPVERDICT_AI_AUTHORIZATION`
- `DEPVERDICT_AI_TIMEOUT_MS`
- `DEPVERDICT_AI_TIMEOUT_SECONDS`
- `DEPVERDICT_AI_MAX_RESPONSE_BYTES`
- `DEPVERDICT_AI_DEBUG`

Each maps one-to-one to the corresponding `UPGRADELENS_*` legacy variable.

Resolution precedence is:

1. explicit programmatic or CLI override;
2. canonical `DEPVERDICT_*` environment variable;
3. legacy `UPGRADELENS_*` environment variable;
4. established default.

When both mapped environment variables are present, the canonical value wins.
The runtime emits one bounded conflict diagnostic naming variable keys only.
When only a legacy variable is used, the runtime emits one bounded deprecation
diagnostic naming the key only.

Diagnostics must never print values. This is mandatory for
`*_AUTHORIZATION` and applies uniformly to every mapping. Unknown variables
under either prefix are ignored.

Injected environment objects are closed worlds: passing `{}` must not fall
through to `process.env`.

## 8. Diagnostic contract

Compatibility diagnostics go to stderr and never alter structured stdout.
Diagnostic emission is bounded within one invocation:

- one legacy-executable warning;
- at most one warning per mapped environment key;
- at most one artifact-root diagnostic per resolved input chain.

Diagnostics contain stable codes where programmatic interpretation is useful
and do not include absolute paths, environment values, authorization material,
or artifact contents.

## 9. Programmatic API contract

Existing public exports remain stable for this preview. Compatibility helpers
are internal implementation details unless separately promoted through a
future public-API decision.

Programmatic calls to `runCli` default to canonical invocation identity and do
not receive a legacy-executable warning. Tests and embedders may explicitly
provide invocation identity and isolated diagnostic state.

Existing loader return shapes and validation behavior remain unchanged except
for the documented automatic selection of a complete legacy artifact chain.

## 10. Qualification and evidence contract

Provider qualification does not become valid merely because the product was
renamed. The existing provider, endpoint, model, schema, prompt, policy, and
test-vector identity fields remain the qualification authority.

For an implicit default qualification path, canonical storage wins and a
complete legacy record may be used as fallback. An explicit qualification path
never falls back elsewhere. A malformed or mismatched selected record fails
closed; the resolver does not search another root for a more favorable answer.

## 11. Packaging and CI contract

The package-content guard must inspect the actual packed tarball and require
both executable files. Existing protections against captures, credentials,
local artifacts, and repository-only material remain active.

Package smoke verification must install the packed scoped package, invoke both
executables, verify canonical programmatic import, and confirm:

- canonical help/version output presents DepVerdict;
- the canonical executable has clean stderr for ordinary help/version calls;
- the legacy executable emits only its bounded warning;
- package export shape remains compatible;
- no publish or registry mutation occurs.

Hosted CI keeps read-only permissions, tests supported Node versions, and
sanitizes both canonical and legacy environment prefixes.

No repository rename, tag creation, commit, push, npm publish, or dist-tag
mutation is authorized by this decision.

## 12. Brand preflight

The required pre-implementation preflight ran at `2026-07-19T08:05:34Z`.
Exact-name checks found no direct collision for DepVerdict on npm, GitHub
repository search, PyPI, RubyGems, or the local executable path. General web
queries also returned no exact software or company result.

Crates.io returned an access denial, and unauthenticated GitHub code search was
unavailable, so those checks are recorded as unverified rather than clear.
Domain RDAP responses are only weak availability signals.

Classification: `BRAND_PREFLIGHT_CLEAR_WITH_LOW_RISK`.

This classification is time-sensitive, is not a reservation, and is not a
legal or trademark clearance.

## 13. Legacy compatibility removal criteria

The legacy CLI, environment mappings, and artifact fallback may be removed only
after all of the following are true:

- the complete `0.6.x` preview compatibility window has shipped;
- canonical CLI, environment, and artifact-root usage is documented in the
  repository/community migration;
- telemetry-free evidence available to the project, such as issue reports and
  preview feedback, reveals no unresolved Blocker or High migration defect;
- removal is announced in release notes before or with the removing release;
- the removing release includes an explicit breaking-change decision, focused
  tests, and migration guidance;
- historical `.upgradelens/` artifacts remain readable by a documented retained
  release even if a future major removes automatic fallback.

Calendar time alone is not a removal criterion. DIFF-02 does not authorize the
removal.

## Consequences

DepVerdict becomes the only canonical identity for new runtime use while one
bounded compatibility window protects existing automation and persisted
evidence. The implementation accepts some deliberate dual naming internally:
DepVerdict for the product, and UpgradeLens for unchanged artifact protocols.

Repository naming, broad documentation replacement, community-template
migration, release publication, and removal scheduling remain work for later
gates.
