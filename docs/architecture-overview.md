# DepVerdict architecture overview

DepVerdict `0.6.0-alpha.1` is a decision-first, artifact-oriented CLI for
evidence-bounded dependency upgrade analysis. It separates deterministic repository
facts and policy from provider-assisted interpretation.

## Product workflow

```text
Project discovery
  → knowledge and evidence research
  → version analysis
  → source usage and coverage
  → repository impact and evidence
  → deterministic Upgrade Decision
  → product completion/report
  → optional experimental Migration Checklist
```

Each stage validates its inputs and publishes versioned artifacts under
`.depverdict/` by default. A missing installed baseline, target, evidence source,
comparable version, or supported analyzer coverage remains explicit and fails
closed; it is not converted into a positive safety conclusion.

## Ownership boundaries

| Layer | Authority |
| --- | --- |
| Project Manifest | Dependency occurrence identity, declaration, project shape, and installed baseline when resolvable. |
| Knowledge artifacts | Registry target candidates, official/publisher sources, snapshots, and provenance. |
| Version Analysis | Schema-validated target-scoped findings and bounded AI-assisted interpretation. |
| Usage and Impact | Supported source occurrences, analyzer coverage, and evidence-backed impact. |
| Upgrade Decision | Deterministic decision, structured recommendation driver, and reason codes. |
| Product completion | User-facing completion state, next action, summary, and exit code. |
| Migration Checklist | Experimental, opt-in, evidence-bounded handoff requiring human review. |

Registry latest is discovery data, not caller intent and not a recommendation. An
explicit target is structured caller intent but still requires adequate evidence,
coverage, and deterministic policy. AI prose cannot create an urgency driver,
approve work, select repository paths, execute commands, or modify source.

## Identity and compatibility

The canonical identities are `@thomasminh1995/depverdict`, `depverdict`,
`.depverdict/`, and `DEPVERDICT_*`. During one `0.6.x` preview compatibility
window, `upgradelens`, `.upgradelens/` input fallback, and `UPGRADELENS_*`
fallback remain available with bounded warnings.

Persisted schema names, `generator.name: "UpgradeLens"`, task IDs, reason codes,
provider qualification identities, and public exports are compatibility protocols,
not current product presentation. They remain stable until a separately versioned
contract changes them.

## Safety and side effects

DepVerdict reads repository manifests, lockfiles, and supported source files and
writes only its artifacts or explicit caller-selected output paths. It does not:

- modify manifests or source;
- install or upgrade dependencies;
- execute suggested verification commands;
- authorize a developer or Coding Agent to patch code;
- synthesize proof that a migration is safe or complete.

Provider/model qualification is bound to exact runtime, dataset, prompt, schema,
policy, and presentation identity. Offline operation prevents registry and
evidence-source research but may still require a configured or injected AI runtime
for Version Analysis; absent evidence stays absent.

## Versioned records

Older MVP, IA, MP, RR, OSS, validation, and release documents record the
UpgradeLens identity, commands, artifact roots, and results that were true for
their milestone. They are retained as historical or versioned architecture records
and are not current command documentation. Use the root README and this overview
for the current DepVerdict interface, then consult a versioned record for the
design rationale of that specific contract.

