# Migration Planning qualification resolution

The experimental Migration Checklist uses one immutable qualification decision
for the complete stage. Qualification resolution is deterministic and does not
contact a provider or re-run evaluation.

## When resolution runs

The normal `depverdict analyze <repository>` pipeline does not include the
Migration Checklist and does not resolve a qualification record. Resolution
runs only when the user explicitly enables:

```text
depverdict analyze <repository> --experimental-migration-checklist
```

The default persisted record is repository-local:

```text
.depverdict/migration-planning-qualification.json
```

An alternative portable path relative to the repository may be selected with:

```text
--migration-qualification <path>
```

Absolute paths and paths that escape the repository contract are rejected.

## Source precedence

Exactly one source is selected in this order:

1. a qualification injected through the application API;
2. the explicit `--migration-qualification` path;
3. the default project-local path;
4. a missing-record decision.

The selected record is validated as a complete unit. A missing or invalid
explicit source never falls back to the default path. A corrupted default
record never falls back to a missing-record decision.

## Decision states

| State | Execution | Meaning |
| --- | --- | --- |
| `QUALIFIED` | allowed | The record matches the exact task and runtime identity and all required gates passed. |
| `QUALIFIED_WITH_LIMITATIONS` | allowed | The record matches and execution retains its recorded limitations. |
| `MISSING` | experimental exception only | No default record exists. The opt-in experimental CLI path may continue with mandatory human review. |
| `NOT_QUALIFIED` | blocked | A matching runtime failed a critical qualification gate or threshold. |
| `INSUFFICIENT_EVIDENCE` | blocked | A matching record does not contain enough evidence for execution. |
| `IDENTITY_MISMATCH` | blocked | Task, provider, model, adapter, dataset, prompt, schema, policy, or runtime identity differs. Fake-runtime evidence also falls into this fail-closed class for a real runtime. |
| `CORRUPTED` | blocked | JSON, schema, invariant, digest, or sensitive-value validation failed. |

Only a genuinely missing default record may use the existing experimental
exception. Missing explicit records, corrupted records, identity mismatches,
fake qualifications, insufficient evidence, and matching `NOT_QUALIFIED`
records block before provider use.

## Integrity and identity

The persisted artifact follows
`schemas/migration-planning-qualification-record.schema.json`. Loading verifies
the schema, the qualification identity digest, the record digest, deterministic
ordering, verdict invariants, and the absence of secret-like values.

Runtime matching binds the decision to the exact Migration Planning v2 task,
provider, model, adapter, evaluation dataset, prompt, candidate schema,
grounding policy, and other versioned qualification inputs. Changing one of
those inputs requires a matching record; it is not silently accepted.

Use the public writer to persist a completed qualification:

```js
import { writeMigrationPlanningQualificationRecord } from '@thomasminh1995/depverdict';

await writeMigrationPlanningQualificationRecord(
  repositoryRoot,
  evaluationReport.report.qualification
);
```

The writer validates first and publishes atomically. Qualification status,
reason, source kind, source path, runtime identity, limitations, and next
action come from the same frozen decision used by the guard, progress events,
console presentation, failure log, and migration artifact assembly.

During the `0.6.x` preview compatibility window, a complete default record under
`.upgradelens/` may be selected only through the whole-root fallback contract.
DepVerdict never merges qualification or workflow inputs across artifact roots.
An explicit legacy path remains caller-owned and is honored as written.

## Limitations

Migration Checklist remains experimental, opt-in, and mandatory-human-review.
A persisted qualification permits the exact qualified runtime to execute; it
does not make generated migration instructions automatically safe, enable the
feature by default, or replace review of cited evidence.
