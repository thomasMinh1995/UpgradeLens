# MVP-02 Research Planning

MVP-02-02 creates the deterministic bridge between an MVP-01 Project Manifest and later knowledge research. It reads a Project Manifest once, validates it, fingerprints its exact bytes, and produces an internal `ResearchPlan`.

The Research Plan is internal. The [Knowledge Manifest](MVP-02-Knowledge-Manifest.md) is the portable public artifact produced only after later MVP-02 collection work completes.

## Boundary

```text
Project Manifest bytes
        │
        ▼
Parse + validate + exact-byte SHA-256
        │
        ▼
Extract dependency occurrences
        │
        ▼
Resolve public npm/PyPI identities
        │
        ▼
Group + canonicalize + validate
        │
        ▼
Internal Research Plan
```

This stage does not scan the repository. It does not read `package.json`, `requirements.txt`, lockfiles, or source files. It performs no network request, registry lookup, cache operation, source resolution, version comparison, or Knowledge Manifest generation.

## Input and lineage

`loadProjectManifestInput` accepts either:

```js
await loadProjectManifestInput('/path/to/project-manifest.json');

await loadProjectManifestInput({
  bytes: exactManifestBytes,
  artifact: '.upgradelens/project-manifest.json'
});
```

The file form reads the manifest once. The byte form is intended for controlled tests and internal callers. In both cases UpgradeLens hashes the exact byte sequence with SHA-256 before parsing it. It never hashes a reserialized JavaScript object.

The resulting lineage is compatible with the future Knowledge Manifest input contract:

```json
{
  "projectManifest": {
    "schemaVersion": "2.0.0",
    "artifact": ".upgradelens/project-manifest.json",
    "artifactDigest": "sha256:<64 lowercase hexadecimal characters>",
    "repository": { "name": "example-project", "root": "." }
  }
}
```

Artifact paths must be portable repository-relative paths. Absolute paths, drive-qualified paths, backslashes, and parent traversal are rejected. Invalid JSON, a non-`2.0.0` schema version, JSON Schema violations, and Project Manifest dependency-summary invariant violations are fatal input errors; they never produce a partial plan.

## Project Manifest validation

The loader uses `schemas/project-manifest.schema.json` with Ajv Draft 2020-12 strict mode. It also validates runtime relationships relevant to MVP-01 dependency inventories:

- project, workspace, dependency-manifest paths are portable;
- project and ecosystem summary counts match projects;
- parsed dependency declaration, unique, and duplicate counts match inventory records;
- Node `byType` counts match Node dependency types;
- unsupported or failed dependency parsers have no inventory entries.

The planner canonicalizes its own output, so a valid input with projects or dependencies in a different array order still produces the same package plan.

## Internal Research Plan

The internal plan is serializable for debugging and tests but is not written by default and has no public JSON Schema:

```json
{
  "planVersion": "1",
  "input": { "projectManifest": {} },
  "summary": {
    "inputProjectCount": 2,
    "inputOccurrenceCount": 47,
    "researchableOccurrenceCount": 46,
    "uniqueResearchPackageCount": 45,
    "invalidOccurrenceCount": 1,
    "unsupportedOccurrenceCount": 0
  },
  "packages": [],
  "invalidOccurrences": [],
  "unsupported": [],
  "warnings": []
}
```

`planVersion` is independent from both Project Manifest and Knowledge Manifest schema versions. The plan has no timestamp, network/cache state, store detail, credentials, source content, or registry metadata.

`inputOccurrenceCount` means every dependency declaration present in the valid Project Manifest inventories that planning examines: researchable and invalid Node/Python declarations plus declarations from unsupported ecosystems. Duplicate and multi-project declarations count separately. Parsed Node/Python inventories provide those records today; other ecosystems only contribute when a future Project Manifest contains an inventory for them.

## Research identity

MVP-02-02 supports only these public lookup identities:

```text
node    → npm:<normalized-name>
python  → pypi:<normalized-name>
```

Normal npm names and scoped names such as `@vitejs/plugin-react` are valid. Python identities use the existing PEP 503-style normalization already used by MVP-01: lowercase and collapse runs of `.`, `_`, and `-` to `-`.

Each research package is package-centric:

```json
{
  "id": "npm:react",
  "registry": "npm",
  "ecosystem": "node",
  "normalizedName": "react",
  "observedDeclaredNames": ["react"],
  "occurrences": []
}
```

Researchable occurrences group only by `(registry, normalizedName)`. Grouping preserves every declaration, declared version/reference, dependency type, manifest path, project ID, and project path. It keeps duplicate declarations and declarations from separate projects; only the external lookup identity is deduplicated.

Node ranges, tags, and other ordinary npm version declarations remain opaque. Python version declarations remain opaque as well: MVP-02-02 does not parse SemVer or PEP 440.

## Eligibility and invalid references

Node dependencies are researchable when their normalized name is a public npm name and their declaration is not a local path, workspace-only reference, file/link reference, npm alias, URL, Git reference, or similar unsupported reference.

Python dependencies are researchable when they have an explicit named PyPI identity. A named direct reference such as `package-name @ https://…` is researchable using `package-name`. Unnamed URLs, unnamed Git references, and local editable paths without an explicit name are not guessed into a registry identity.

Invalid Node/Python occurrences remain in `invalidOccurrences` with one stable reason:

- `empty-name`
- `invalid-npm-name`
- `invalid-pypi-name`
- `unnamed-direct-reference`
- `local-path-reference`
- `unsupported-reference`

Each invalid occurrence produces an internal `INVALID_PACKAGE_REFERENCE` warning. URL user information, query strings, fragments, and local paths are sanitized before the Research Plan is serialized. UpgradeLens never guesses a package name from a URL, Git repository, path, or name similarity.

## Unsupported ecosystems

Java, .NET, Go, Rust, Ruby, PHP, AL, and other non-Node/non-Python dependencies are outside MVP-02-02. Their declarations are aggregated by ecosystem rather than copied into package records:

```json
{
  "ecosystem": "java",
  "projectIds": ["java:backend"],
  "occurrenceCount": 12
}
```

An ecosystem with one or more such declarations receives one internal `UNSUPPORTED_RESEARCH_ECOSYSTEM` warning. Valid dependencies from unsupported ecosystems are not reported as `INVALID_PACKAGE_REFERENCE`. No new public Knowledge Manifest warning code is introduced by this internal planning detail.

## Determinism and invariants

The plan uses code-unit lexical order:

1. packages by ID;
2. observed names lexically;
3. occurrences by project ID, manifest, dependency type, declared name, then declared version (`null` sorts as an empty string);
4. invalid occurrences by the same key and then reason;
5. unsupported records by ecosystem and their project IDs lexically;
6. warnings by scope, code, and message.

`createResearchPlan` calls `validateResearchPlan` before returning. The validator fails fast when an internal implementation bug violates any of these relationships:

- unique package count equals package records;
- package occurrence total equals researchable occurrence count;
- invalid and unsupported counts equal their records;
- researchable + invalid + unsupported equals input occurrences;
- package IDs match registry and normalized name;
- package occurrences match their package identity;
- warning references correspond to invalid or unsupported records;
- IDs are unique, references are portable, output is sorted, and serialized values contain no URL credentials.

## Public API

The package exports only the planning entry points required by later MVP-02 implementation:

```js
import {
  loadProjectManifestInput,
  createResearchPlan,
  validateResearchPlan
} from 'upgradelens';
```

Call `loadProjectManifestInput` first, pass its result to `createResearchPlan`, and use `validateResearchPlan` to fail fast when inspecting or constructing an internal plan.

## Deferred work

This task deliberately does not implement npm/PyPI requests, GitHub API use, source resolution, Knowledge Store persistence, cache behavior, Knowledge Manifest creation, latest-version lookup, release metadata, version analysis, AI/LLM behavior, MCP, agent runtime, or a new CLI command.
