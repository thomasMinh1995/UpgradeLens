# REL-03 packaged qualification evidence

Status: `ACCEPTED`

Decision: `DEFER_PENDING_PROVENANCE_CONTRACT`

Decision date: 2026-07-20

## Context

REL-02 confirmed that production code validates an exact Migration Planning
qualification identity, but the npm package does not contain the retained
real-provider record. That is a Medium public auditability gap, not authorization
to copy local runtime state into a public package.

The retained record discovered during REL-03 is:

```text
.upgradelens/migration-planning-qualification.json
```

It is ignored by Git, mode `0600`, 9,622 bytes, and uses the legacy root through
the bounded `0.6.x` whole-root fallback. New project-local records default to:

```text
.depverdict/migration-planning-qualification.json
```

The writer is
`writeMigrationPlanningQualificationRecord` in
`src/migration-checklist/qualification-store.js`. It validates and atomically
writes a repository-relative record. The resolver chooses exactly one injected,
explicit, canonical-default, legacy-default, or missing source and never merges
them.

## Discovered record contents

The strict `1.0.0` envelope contains:

- record and qualification identity SHA-256 digests;
- a generation timestamp;
- task, dataset, criteria, comparator, normalization, policy, prompt, candidate
  schema, trust, and presentation identities;
- real/fake mode, provider, model, adapter, and observed identity labels;
- threshold results, critical-gate results, limitations, and verdict.

The retained record contains no provider request/response payload, prompt text,
endpoint, signed URL, credential, local path, repository identifier, evaluator
log, billing field, or cost field. Its current verdict is `QUALIFIED`, with 15 of
15 critical gates passed for the exact
`openai-compatible/openai/gpt-5.5/openai-compatible` runtime tuple.

This content inspection does not make it package-owned.

## Integrity and fail-closed behavior

Loading validates:

- JSON Schema and additional-property closure;
- the qualification ID over exact identity material;
- the record digest over canonical persisted material;
- deterministic ordering and verdict invariants;
- absence of secret-like values;
- exact runtime/task/dataset/prompt/policy/schema/presentation identity.

Corrupt, fake, mismatched, insufficient, and matching `NOT_QUALIFIED` records
fail closed. A genuinely missing default record can proceed only through the
explicit experimental path with mandatory human review.

SHA-256 digests detect mutation but do not authenticate an issuer. The current
schema has no signature, signer/trust-root identity, release binding, provenance
URI, revocation, or supersession declaration.

## Decision

Do not package the retained local record and do not invent a package-owned
qualification declaration in REL-03.

Select `DEFER_PENDING_PROVENANCE_CONTRACT` because a safe immutable public
artifact first needs:

1. a named package/release owner and authoritative source of truth;
2. an explicit redaction and privacy contract;
3. issuer identity plus signature or another authenticated integrity mechanism;
4. binding to package version, task, provider, model, adapter, dataset, prompt,
   policy, schema, trust, and presentation identities;
5. schema/version migration rules;
6. revocation and supersession behavior;
7. an offline selection rule that cannot override user/project-local state;
8. a clear distinction between package-owned evidence and user-generated runtime
   qualification.

Until then, project-local qualification remains the runtime source. The package
ships its schema and resolution documentation, and the package guard rejects a
live qualification JSON outside schema directories.

## Package-size and offline consequences

REL-03 adds no machine-readable qualification record and no provider payload.
Package-size impact is limited to this ADR. Offline default analysis is unchanged.
Experimental Migration Checklist users must provide or generate a matching
project-local record, or knowingly use the existing missing-record experimental
override.

## Revocation and non-generalization

The retained qualification cannot be revoked through npm package metadata and
must not be generalized beyond its exact identity. A future provenance contract
must define how evidence is superseded or revoked without moving a published tag,
rewriting a historical record, or silently qualifying another provider/model.

## Tests required before implementation

A separate implementation task must add tests for:

- schema closure, deterministic serialization, and canonical digests;
- signature/trust-root verification and tamper rejection;
- privacy/redaction against payloads, credentials, endpoints, paths, and private
  identifiers;
- exact package/task/runtime/evaluation identity matching;
- package-owned versus project-local precedence without source merging;
- offline lookup and missing/revoked/superseded evidence;
- model/provider non-generalization;
- clean package install and package-size delta;
- package guard allowlisting only the accepted immutable path;
- backward compatibility with canonical and legacy project-local records.

No such implementation or packaging is authorized by this ADR alone.
