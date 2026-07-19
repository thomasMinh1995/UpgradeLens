# MP-R03 Deterministic Upgrade Decision Architecture

## Decision boundary

The Upgrade Decision stage runs after Repository Impact Evidence and before
Migration Checklist context preparation. It is deterministic and performs no
provider or model calls.

The stage consumes the same seven validated upstream artifacts that form the
existing checklist boundary:

1. Project Manifest
2. Knowledge Manifest
3. Knowledge Evidence Bundle
4. Version Analysis
5. Usage Index
6. Repository Impact
7. Repository Impact Evidence

This is the smallest existing boundary that has exact dependency occurrence
identity, installed and target versions, target-scoped evidence, analysis
state, repository impact, and ecosystem-aware usage coverage. The validated
input loader remains responsible for schema, lineage, occurrence identity, and
evidence-reference integrity.

Validated Knowledge Manifest package occurrences are the decision cardinality
source because they retain the Project Manifest occurrence plus canonical
package identity. Version Analysis results are joined by the full occurrence
key. A validated occurrence with no matching result is retained as
`NOT_ANALYZED`; it is never silently dropped.

## Canonical inputs and ownership

Project Manifest owns the dependency occurrence and installed-version
baseline. Version Analysis owns the evaluated target, analysis status,
target-scoped evidence references, and structured findings. Repository Impact
Evidence owns repository impact and coverage state. Ecosystem version adapters
own version normalization and ordering.

The decision policy owns only deterministic precedence. AI output, prose risk
labels, package popularity, package names, repository names, file names, and a
registry-latest candidate do not own the decision.

## Recommendation-driver policy

Target discovery, migration/risk evidence, and a recommendation driver are
separate facts:

- Registry metadata and `targetPolicy: registryLatest` establish only a
  registry-discovered candidate.
- Release notes, changelogs, breaking changes, deprecations, compatibility
  notes, and migration guides describe the target or the cost/risk of a
  possible migration. They do not recommend changing versions.
- `targetPolicy: explicit` is the only current structured production driver.
  It records that the caller selected and adapter-normalized a target version,
  so the policy maps it to `USER_SELECTED_TARGET`.

The current upstream schemas have no structured security advisory,
end-of-support, deprecation-deadline, runtime-requirement, dependency-policy,
or organization-policy driver. Free-form evidence and AI-authored prose must
not synthesize one.

Therefore, a newer registry-discovered target without another structured
driver produces `INVESTIGATE` with
`UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER`, even when target-scoped
migration/risk evidence is sufficient. `PLAN_UPGRADE` requires an explicit
target plus valid target-scoped evidence and all existing comparison,
conflict, impact, and coverage checks.

A referenced evidence claim that is invalid, stale, unavailable, or otherwise
insufficient remains `INSUFFICIENT_EVIDENCE`; unverified prose never becomes a
recommendation driver. A registry candidate with no migration evidence at all
remains the bounded no-driver `INVESTIGATE` case.

## Policy precedence

For each validated Version Analysis occurrence:

1. A non-analyzed Version Analysis status produces `NOT_ANALYZED`.
2. A missing installed baseline produces `INSUFFICIENT_EVIDENCE`; an explicitly
   non-registry declaration produces `INVESTIGATE`.
3. A missing target produces `INSUFFICIENT_EVIDENCE`.
4. An unavailable ecosystem adapter or incomparable version produces
   `INVESTIGATE`.
5. Equal installed and target versions produce `KEEP_CURRENT`.
6. Installed newer than the evaluated target produces `KEEP_CURRENT` with a
   limitation.
7. Conflicted evidence produces `INVESTIGATE`; referenced invalid, stale,
   unavailable, or non-target-scoped evidence produces
   `INSUFFICIENT_EVIDENCE`.
8. A newer registry-discovered target without a structured recommendation
   driver produces `INVESTIGATE`, including when no migration evidence was
   referenced.
9. A structured driver with missing evidence produces
   `INSUFFICIENT_EVIDENCE`.
10. Partial or unavailable repository coverage for a repository-sensitive
    finding produces `INVESTIGATE`.
11. A future validated structured urgency signal may produce `UPGRADE_NOW`.
   MP-R03 defines no production urgency input, so prose risk labels cannot
   produce this decision.
12. A newer caller-selected target with sufficient target-scoped evidence and
    no blocker produces `PLAN_UPGRADE`.
13. Remaining ambiguous states produce `INVESTIGATE`.

Equal-version precedence intentionally comes before coverage uncertainty:
coverage limitations remain visible but cannot turn a no-version-change fact
into an upgrade recommendation.

## Version comparison

The policy calls the registered adapter for the occurrence ecosystem. Node uses
SemVer and Python uses the current PEP 440 subset. An unsupported ecosystem,
invalid version, URL/Git/local declaration, or adapter `unknown` result is never
compared lexically and produces an investigation outcome.

## Persistence and consumers

The stage writes `.upgradelens/upgrade-decision.json` atomically. Its lineage
contains portable paths and digests for all seven immutable inputs. Decisions
are sorted by stable occurrence identity and include versions, comparison,
evidence references, impact/coverage, reason codes, human-review state,
limitations, and policy provenance.

CLI and Markdown presentation display the persisted decision. Migration
Checklist receives the persisted artifact and may only prepare AI action
contexts for `PLAN_UPGRADE` or `UPGRADE_NOW`. `INVESTIGATE` is manual-review
only; `KEEP_CURRENT`, `INSUFFICIENT_EVIDENCE`, and `NOT_ANALYZED` cannot create
migration actions.

## Genericity

No rule depends on VinGrade, a package name, a framework name, a repository
path, or a source filename. VinGrade is an acceptance repository only. The
policy operates on schema-validated occurrence facts and registered ecosystem
capabilities.
