# MP-R04 Evidence-Bounded Migration Handoff Architecture

## Decision

Upgrade the existing `.upgradelens/migration-checklist.json` artifact instead
of creating a separate Migration Handoff artifact.

The checklist already owns the evidence-bounded action projection, exact
evidence references, deterministic candidate locations, limitations, stable
item IDs, atomic writer, qualification boundary, and console/Markdown
presentation. A second artifact would either duplicate those facts or require
Coding Agents to join two handoff documents. Schema version 2 adds the missing
deterministic handoff projection to each dependency occurrence while retaining
the extractive action contract.

The artifact remains experimental and human-reviewed. It is not a migration
execution plan, approval record, patch, command runner, or proof that migration
work is complete.

## Discovery answers

1. The v1 checklist already contains the Version Analysis result and dependency
   occurrence identities, installed/current/target version facts, target
   policy, selected evidence refs, breaking findings, exact-excerpt-derived
   review instructions, positive Impact Evidence locations, limitations, stable
   IDs, ordering, lineage, and mandatory item review state.
2. AI owns only selection of an exact allowlisted evidence excerpt. The legacy
   wire value `AI_AUTHORED` identifies that selected item, but deterministic
   runtime owns the final prefix, item ID, evidence refs, location-free action
   shape, ordering, status, and review requirement.
3. The existing artifact is the correct product boundary. It needs an
   incompatible schema upgrade because v1 cannot represent authoritative
   decision identity, recommendation driver, handoff outcome, verification
   state, recovery state, or structured coverage alongside every occurrence.
4. No new artifact is introduced. The missing values are represented in v2
   without copying raw upstream artifacts.
5. Target origin is the persisted Upgrade Decision
   `versions.targetPolicy`. The current only production recommendation driver
   is `USER_SELECTED_TARGET`, present as the `PLAN_UPGRADE` primary reason and
   reason code under policy 1.1.0.
6. Action evidence must be official/publisher, available, fresh,
   non-conflicted, one of the existing migration-capable kinds, referenced by
   the finding, and scoped to the exact selected target version.
7. Affected areas come only from Repository Impact Evidence positive
   `matchedSymbols[].usages[]`, preserving its evidence ID, finding ID, symbol,
   portable file path, and coverage state.
8. Project Manifest v2 does not contain verification scripts. MP-R04 therefore
   reads only supported package manifests already identified by Project
   Manifest. For Node `package.json`, it projects safe script names into
   package-manager commands and records the source path plus exact-byte digest.
   It does not parse script bodies, README prose, arbitrary CI shell, or execute
   commands. Other ecosystems and missing/unsafe script metadata produce
   `VERIFICATION_COMMAND_UNAVAILABLE`.
9. The extractive prompt forbids identity, paths, commands, URLs, ordering,
   prerequisites, rollback, effort, approval, code, and reasoning. Candidate
   schema permits only evidence ref plus exact excerpt. Trust validation
   requires exact substring containment and rejects the whole candidate when
   any item has a prohibited capability.
10. Provider abstention, invalid output, trust rejection, timeout, and runtime
    failure already produce deterministic manual-review records without
    publishing partial candidate actions. V2 maps abstention to
    `NO_GROUNDED_ACTION` and generation/rejection/runtime failures to
    `ACTION_GENERATION_FAILED`.

## V2 ownership

Deterministic runtime owns:

- dependency, project, manifest, Version Analysis, and Upgrade Decision IDs;
- installed and target versions, target origin, and recommendation driver;
- decision-to-handoff mapping and human-review state;
- evidence references and official evidence metadata projection;
- verified affected areas and coverage state;
- safe project-derived verification commands and their source digests;
- precondition codes, recovery availability, stable IDs, and ordering.

AI may only select an exact action excerpt from the bounded official evidence
allowlist. It cannot own or modify any other handoff field.

## Decision mapping

| Upgrade Decision | Handoff status | Provider eligible |
| --- | --- | --- |
| `KEEP_CURRENT` | `NO_VERSION_CHANGE_REQUIRED` | No |
| `PLAN_UPGRADE` / `UPGRADE_NOW`, accepted actions | `ACTIONABLE_WITH_REVIEW` | Yes |
| `PLAN_UPGRADE` / `UPGRADE_NOW`, abstention/no instruction | `NO_GROUNDED_ACTION` | Yes, at most one call per eligible finding |
| `PLAN_UPGRADE` / `UPGRADE_NOW`, rejected/failed generation | `ACTION_GENERATION_FAILED` | Yes, package-local failure |
| `INVESTIGATE` | `INVESTIGATION_REQUIRED` | No |
| `INSUFFICIENT_EVIDENCE` | `INSUFFICIENT_EVIDENCE` | No |
| `NOT_ANALYZED` | `NOT_ANALYZED` | No |

Every persisted Upgrade Decision occurrence must produce exactly one dependency
handoff record. Missing or legacy Upgrade Decision artifacts are never treated
as actionable.

## Verification and recovery

Verification commands are bounded deterministic projections, not executed
results. Supported Node package scripts are selected by exact generic
verification roles (`test`, `build`, `lint`, `typecheck`, and `check`) and
invoked through the declared supported package manager. The record includes
the portable working directory, source manifest path, script name, and
source-byte digest. No command is inferred when any required structured fact is
missing.

MP-R04 does not synthesize recovery. Until an exact structured upstream
recovery instruction exists, records contain `RECOVERY_PLAN_NOT_PROVIDED`.

## Compatibility

Schema v1 checklists are non-actionable legacy artifacts and must be
regenerated. The v2 loader requires exact Upgrade Decision lineage and rejects
tampering or occurrence mismatches before generation. The public
`analyze-version` CLI still chooses `registryLatest`; positive handoff
acceptance uses the supported programmatic explicit-target boundary. Default
Migration Checklist enablement and provider qualification rules are unchanged.
