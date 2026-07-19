# DIFF-01 — Brand and Distribution Identity Decision

Decision date: 2026-07-19

Status: Accepted for implementation planning; no identity has been changed, registered, reserved, or published.

Evidence labels:

- **[S]** committed source or package metadata at the stated SHA.
- **[H]** Git/tag history.
- **[M]** live GitHub, npm, package-registry, search, or RDAP metadata.
- **[D]** documentation.
- **[C]** maintainer-provided context that this read-only task did not reproduce.
- **[I]** bounded inference from cited evidence.

## 1. Executive decision

**Decision verdict: `FULL_REBRAND_BEFORE_PUBLIC_PREVIEW`**

**Public-preview gate: `PROCEED_TO_IDENTITY_IMPLEMENTATION`**

The selected implementation identity is:

| Layer | Decision |
| --- | --- |
| Product/brand | **DepVerdict** |
| GitHub repository | `thomasMinh1995/DepVerdict` |
| npm package | `@thomasminh1995/depverdict` |
| Primary CLI | `depverdict` |
| Temporary CLI compatibility | `upgradelens` alias for one preview release, with a deprecation notice |
| First rebranded version | `0.6.0-alpha.1` |
| npm dist-tag | `preview`, never `latest` for the Technical Preview |

The identity is selected because it states the strongest source-proven product difference—a repository-level dependency decision—without implying automatic migration or guaranteed safety. It removes the exact **UpgradeLens** product-name overlap, the near-identical npm/CLI identity, and the failed unscoped-package path while adoption is still limited.

The decision does **not** constitute trademark clearance. `DepVerdict` was `LIKELY_AVAILABLE` in the bounded checks in section 9, but availability must be rechecked and a maintainer/legal risk review must occur immediately before any public rename or publication. If that checkpoint uncovers a material conflict, implementation must stop and return to DIFF-01 rather than silently choosing another name.

## 2. Context and collision facts

UpgradeLens and UpgradeDepDetective are technically differentiated but operate in the same dependency-upgrade domain. The external project displayed **UpgradeLens** and used npm package/CLI `upgrade-lens` from its first commit in April 2025, before the local repository was created in July 2026. **[H][S]** ([external initial commit](https://github.com/zjp123/UpgradeDepDetective-/commit/1ce86a918d2c94318f0c0b29ef61a8fd3adb17c1), [external package metadata](https://github.com/zjp123/UpgradeDepDetective-/blob/d6e5efcb852ba3848fb14dbdcbd7058b17bb6cde/package.json))

The local product's current distinctions remain valid:

- decision-first policy: registry availability is not a recommendation;
- exact dependency-occurrence identity and installed/declared/target separation;
- coverage-aware repository impact;
- fail-closed evidence and provider boundaries;
- evidence-bounded Migration Checklist and persisted Coding Agent handoff;
- explicit human review.

Those capabilities support a different product promise, but technical differentiation does not remove brand confusion. A user searching “UpgradeLens dependency upgrade” or typing an install command can reasonably encounter the older package first.

The maintainer reports that npm rejected `upgradelens@0.5.0` with `403 Forbidden` because its name was too similar to `upgrade-lens`, and suggested a scoped identity. **[C]** This review did not repeat a publish request because DIFF-01 prohibits registry mutation. Live registry checks confirmed that the conflicting package still exists and that the local unscoped/scoped names were not registered at the check time. **[M]**

A scoped package would resolve the immediate unscoped-name feasibility problem, but it would not resolve:

- the exact product display-name collision;
- search/discoverability ambiguity;
- support questions involving two similarly named tools in the same domain;
- users confusing `upgradelens` with `upgrade-lens`;
- long-term cost if a rebrand occurs after adoption.

## 3. Immutable repository/npm snapshots

### Local repository and release

Checked 2026-07-19T07:34:28Z–07:42:00Z against Git, the [GitHub repository API](https://api.github.com/repos/thomasMinh1995/UpgradeLens), [GitHub release API](https://api.github.com/repos/thomasMinh1995/UpgradeLens/releases/tags/v0.5.0), and read-only remote refs:

| Fact | Immutable/current result | Limitation |
| --- | --- | --- |
| Repository | `https://github.com/thomasMinh1995/UpgradeLens`, public, unarchived, default `main`, MIT **[M]** | GitHub state can change after the check. |
| Local/remote `main` | `c91fbb0032b0e2f6209cb4a14aeeb68d9cf0c28d`; local and `refs/heads/main` matched **[H][M]** | Untracked working-tree files were excluded. |
| Package | `upgradelens@0.5.0`; bin `upgradelens`; ESM export `"." → "./src/index.js"` **[S]** ([package.json](https://github.com/thomasMinh1995/UpgradeLens/blob/c91fbb0032b0e2f6209cb4a14aeeb68d9cf0c28d/package.json)) | This is committed metadata, not npm publication. |
| Public tag | Annotated tag object `4750606ca85f990ee69d60ab4673caca5fbfb89b`, peeled commit `74d57344db254d0109ea951dc7c44853cdad9be0`; local and remote refs matched **[H][M]** | The tag must be treated as immutable public history. |
| GitHub Release | [`v0.5.0`](https://github.com/thomasMinh1995/UpgradeLens/releases/tag/v0.5.0), published 2026-07-19T02:56:50Z, not draft and not marked prerelease **[M]** | Public release state is stronger than a local-only tag. |
| Tag versus main | `main` is seven commits after the tagged commit **[H]** | The later readiness/community changes are not part of `v0.5.0`. |
| npm `upgradelens` | HTTP 404 at `https://registry.npmjs.org/upgradelens` **[M]** | 404 is not a reservation and does not guarantee publish acceptance. |
| npm scoped candidate | HTTP 404 at `https://registry.npmjs.org/@thomasminh1995%2Fupgradelens` **[M]** | Scope authorization was not tested; no publish was attempted. |

### External repository and package

Checked 2026-07-19T07:34:28Z–07:41:38Z against the [external GitHub API](https://api.github.com/repos/zjp123/UpgradeDepDetective-), exact raw files and [npm registry metadata](https://registry.npmjs.org/upgrade-lens):

| Fact | Result | Limitation |
| --- | --- | --- |
| Repository | `zjp123/UpgradeDepDetective-`, public, unarchived, default `main`, MIT; created 2025-04-28T08:02:39Z **[M]** | Repository metadata can change. |
| First/default-head commits | First `1ce86a918d2c94318f0c0b29ef61a8fd3adb17c1` at 2025-04-28T10:24:39Z; current default head `d6e5efcb852ba3848fb14dbdcbd7058b17bb6cde` at 2025-06-18T08:00:04Z **[H][M]** | Commit dates support chronology, not trademark ownership. |
| Product display | README title begins `UpgradeLens`; package and CLI are `upgrade-lens` **[S]** ([README](https://github.com/zjp123/UpgradeDepDetective-/blob/d6e5efcb852ba3848fb14dbdcbd7058b17bb6cde/README.md)) | Display-name use does not establish legal rights. |
| npm package | `upgrade-lens@1.0.2`, `latest`; created 2025-04-28, last published 2025-05-09; npm maintainer identity `zjpctt` **[M]** | No conclusion about why publication stopped. |
| Installability | Latest tarball endpoint returned HTTP 200; CLI is `upgrade-lens` **[M]** | Read-only availability was checked; package code was not installed or executed. |
| Activity assessment | No default-branch source commit since June 2025 and no npm release since May 2025, while repository metadata was updated in May 2026 **[M]** | Supports “low recent release activity,” not “abandoned” and not name squatting. |
| License | MIT, with a 2023 product-name copyright notice **[S]** ([LICENSE](https://github.com/zjp123/UpgradeDepDetective-/blob/d6e5efcb852ba3848fb14dbdcbd7058b17bb6cde/LICENSE)) | License permits code use with notice; it does not clear brand rights. |

General web search for “UpgradeLens” was noisy and surfaced unrelated AWS “upgrade lens” operations and another upgrade-assessment product in addition to lens-related results. npm's broad `upgrade lens` search also produced a noisy result set. **[M]** Search ranking is volatile, but this reinforces that a scoped spelling alone would not create a distinctive public identity.

## 4. Current identity inventory

The source of truth is committed SHA [`c91fbb0`](https://github.com/thomasMinh1995/UpgradeLens/commit/c91fbb0032b0e2f6209cb4a14aeeb68d9cf0c28d), not untracked captures or reports.

| Layer | Current identity | Source of truth | Publicly exposed | Compatibility classification |
| --- | --- | --- | --- | --- |
| Repository owner/name | `thomasMinh1995/UpgradeLens` | GitHub + package metadata | Yes | `PUBLIC_PREVIEW_CONTRACT`; `MUST_CHANGE_WITH_BRAND` |
| Product name | `UpgradeLens` | `src/constants.js`, README | Yes | `PUBLIC_PREVIEW_CONTRACT`; `MUST_CHANGE_WITH_BRAND` |
| Package name | `upgradelens` | `package.json`, lockfile | Yes in source/release, not npm | `PUBLIC_PREVIEW_CONTRACT`; `MUST_CHANGE_WITH_BRAND` |
| Package version | `0.5.0` | package + lockfile | Yes | Current metadata is `PUBLIC_PREVIEW_CONTRACT`; tagged `0.5.0` is `HISTORICAL_RECORD` |
| Bin command | `upgradelens` → `./bin/upgradelens.js` | `package.json` | Yes | `PUBLIC_PREVIEW_CONTRACT`; `CAN_RETAIN_AS_LEGACY_ALIAS` |
| Package exports | `"."` → `./src/index.js` | `package.json` | Yes | Export path `SHOULD_NOT_CHANGE`; import package specifier `MUST_CHANGE_WITH_BRAND` |
| README title/value | UpgradeLens; “decision-first CLI for evidence-bounded dependency upgrade analysis” | `README.md` | Yes | Name `MUST_CHANGE_WITH_BRAND`; value proposition `SHOULD_NOT_CHANGE` |
| Output directory | `.upgradelens/` | `src/constants.js` | Yes | `PUBLIC_PREVIEW_CONTRACT`; `CAN_RETAIN_AS_LEGACY_ALIAS` |
| Artifact filenames | `project-manifest.json`, `knowledge-manifest.json`, `version-analysis.json`, `usage-index.json`, `repository-impact*.json/md`, `upgrade-decision.json`, `migration-checklist.json`, qualification/governance artifacts | `src/constants.js`, README | Yes | Semantic names `SHOULD_NOT_CHANGE` |
| Schema IDs | Mostly raw GitHub URLs under `thomasMinh1995/UpgradeLens`; three use `upgradelens.dev` | 22 files under `schemas/` | Yes | Existing IDs/versions are `PUBLIC_STABLE_CONTRACT` and later `HISTORICAL_RECORD`; do not mutate in place |
| Schema generator identity | Several schemas require generator name `UpgradeLens` | output schemas | Yes in artifacts | Existing versions `PUBLIC_STABLE_CONTRACT`; new branded versions `MUST_CHANGE_WITH_BRAND` |
| Environment prefix | `UPGRADELENS_*` provider/model/endpoint/auth/timeout/debug/governance settings | CLI, workflow, README | Yes | `PUBLIC_PREVIEW_CONTRACT`; `CAN_RETAIN_AS_LEGACY_ALIAS` |
| Task IDs | `version-analysis.v1`, `migration-planning.v1`, `migration-planning.v2` | analysis/prompt/evaluation source | Yes in runtime artifacts | `PUBLIC_STABLE_CONTRACT`; `SHOULD_NOT_CHANGE` because they identify semantics, not brand |
| Provider schema name | `upgradelens_version_analysis` | `src/ai-version-analysis.js` | Sent to providers | `INTERNAL_IDENTIFIER` with external observability; change only with prompt/schema identity and requalification |
| Prompt/policy IDs | Prompt versions, upgrade policy `1.1.0`, migration qualification policies | analysis/evaluation source | Yes in artifacts/qualification | `PUBLIC_STABLE_CONTRACT`; semantic IDs `SHOULD_NOT_CHANGE` absent a contract change |
| Qualification identities | Digests bind task, provider/model, dataset, prompt, schema and policy | governance/migration qualification | Yes in records | Existing records `HISTORICAL_RECORD`; never rename/rewrite; requalification creates new IDs |
| Public exports | 438 package-smoke-checked exports | `src/index.js` + package smoke | Yes | Symbol names mostly `SHOULD_NOT_CHANGE`; package specifier changes |
| Workflow/badge URLs | GitHub Actions/repository URLs | `.github`, package/docs | Yes | `MUST_CHANGE_WITH_BRAND` after repository cutover |
| Issue/security links | GitHub issues and private vulnerability reporting under current repository | package, SECURITY, issue templates | Yes | `MUST_CHANGE_WITH_BRAND`, but old route must keep redirect/continuity |
| Conduct email | `upgradelens.conduct@gmail.com` | `CODE_OF_CONDUCT.md` | Yes | `PUBLIC_PREVIEW_CONTRACT`; `CAN_RETAIN_AS_LEGACY_ALIAS` until a verified replacement exists |
| Install examples | `npm install -g upgradelens` and `upgradelens@preview` | README/release notes | Yes, currently non-resolving | `MUST_CHANGE_WITH_BRAND` |
| Source import examples | `from 'upgradelens'` | README/docs | Yes | `MUST_CHANGE_WITH_BRAND` |
| Tags/releases | `v0.1.1`–`v0.5.0`; public `v0.5.0` release | Git refs/GitHub | Yes | `HISTORICAL_RECORD`; `SHOULD_NOT_CHANGE` |

## 5. Competitor/naming evidence

The collision is a naming/distribution issue, not a source-provenance issue:

- The external first commit predates the local repository and already used the exact product name and hyphenated package/CLI identity. **[H][S]**
- `upgrade-lens@1.0.2` remains present and its tarball remains retrievable. **[M]**
- Local `upgradelens` differs as an executable string from `upgrade-lens`, so POSIX and Windows shims can technically coexist. Human memory, documentation and install-command confusion remain material. **[I]**
- A scoped package such as `@thomasminh1995/upgradelens` provides publisher clarity but still displays the same product and near-identical command.
- Search-engine results for the two-word phrase are noisy beyond these two repositories, reducing the value of keeping a generic “Upgrade + Lens” construction. **[M]**

No evidence supports an accusation of copying, name squatting, or malicious conduct. npm package ownership is not trademark ownership, and earlier use is chronology—not a legal conclusion.

## 6. License/trademark caveat

Both repositories use MIT for source. Reading, referencing and clean-room implementation are allowed at a high level; copying substantial external source would require retaining the license/copyright notice. This decision neither copies code nor relies on external brand assets.

MIT does not grant trademark clearance. The candidate checks in section 9 are risk signals only:

- registry 404 does not reserve a name;
- GitHub exact-name absence does not establish exclusivity;
- web search cannot find unindexed/private/local uses reliably;
- RDAP 404 is not a domain reservation guarantee;
- no automated search substitutes for qualified legal review.

Therefore the decision is an architecture/product choice with a mandatory pre-mutation human checkpoint, not a legal opinion.

## 7. Options evaluated

### Option A — Keep UpgradeLens, scoped npm identity

```text
Product: UpgradeLens
Repository: UpgradeLens
npm: @thomasminh1995/upgradelens
CLI: upgradelens
```

This is likely npm-feasible and has the lowest short-term cost. The scoped install command clarifies publisher ownership and avoids the observed unscoped similarity rejection. It does not solve exact product-name overlap, search confusion, support burden, or eventual rebrand cost. Globally installed `upgradelens` and `upgrade-lens` can coexist technically, but are easy to confuse in prose and memory.

### Option B — Keep product, distinct distribution identity

```text
Product: UpgradeLens
Repository: UpgradeLens
npm: @thomasminh1995/<distinct-name>
CLI: <distinct-command>
```

This removes package/CLI collision and is feasible without changing artifact identity. It produces an identity split: the product, repository, package and command no longer reinforce each other, while the exact same-domain display name remains. Support and search ambiguity persist, so this is an incomplete resolution.

### Option C — Full rebrand before public preview

```text
Product: DepVerdict
Repository: DepVerdict
npm: @thomasminh1995/depverdict
CLI: depverdict
```

This has the highest bounded implementation cost, but Technical Preview is the cheapest responsible time to absorb it. It creates one memorable identity across product/repository/package/CLI, directly communicates decision-first semantics, and avoids “automatic updater” or “guaranteed safe” claims.

### Option D — Delay npm, GitHub-only preview

This avoids immediate migration work and is an acceptable short emergency fallback if the selected candidate becomes unavailable. It leaves the collision unresolved, keeps broken/non-resolving npm instructions visible unless docs change, and makes future migration more expensive. It is not an indefinite strategy.

## 8. Scoring criteria and matrix

Scores range from 1 (poor) to 5 (strong). For cost criteria, 5 means lower cost. Weights were consolidated to keep the decision matrix auditable:

| Criterion | Weight | Interpretation |
| --- | ---: | --- |
| Distinctiveness | 25% | Searchability, name differentiation and domain/social signal |
| Distribution | 15% | npm feasibility and ownership clarity |
| CLI risk | 10% | Executable collision, memorability and install clarity |
| Positioning | 20% | Product meaning plus contributor/user clarity |
| Short-term cost | 10% | Bounded migration effort now |
| Long-term cost | 15% | Future migration/support burden |
| Legal uncertainty | 5% | Lower apparent conflict scores higher; never equals clearance |

| Option | Distinctiveness | Distribution | CLI risk | Positioning | Short-term cost | Long-term cost | Legal uncertainty | Weighted score |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A — Keep brand/scoped package | 2 | 5 | 4 | 3 | 5 | 2 | 2 | **3.15** |
| B — Keep brand/distinct package+CLI | 3 | 5 | 5 | 3 | 4 | 3 | 2 | **3.55** |
| C — Full rebrand | 5 | 5 | 5 | 5 | 2 | 5 | 3 | **4.60** |
| D — GitHub-only delay | 2 | 1 | 3 | 2 | 5 | 1 | 2 | **2.10** |

The score is a decision aid. Option C wins because it removes the same-domain brand ambiguity and minimizes long-term migration cost—not because it has the least work.

## 9. Candidate research and availability

### Longlist

Eight candidates were generated from decision, evidence, readiness and reviewed-handoff concepts:

| Candidate | Intended signal | Bounded result | Classification |
| --- | --- | --- | --- |
| **DepVerdict** | Explicit dependency decision | No exact npm/scoped/GitHub-name result; no notable general-web result | `LIKELY_AVAILABLE` |
| **UpgradeLedger** | Persisted evidence/history | No exact registry/repo result, but web/code uses overlap with Ledger/upgrade terminology | `HIGH_CONFUSION_RISK` |
| **MigrationBrief** | Reviewed handoff summary | Active unrelated “Americas Migration Brief” identity/domain exists | `OCCUPIED` |
| **VersionVerdict** | Version decision | Existing public code type and generic version-security usage | `HIGH_CONFUSION_RISK` |
| **DependencyCompass** | Evidence-guided direction | No exact npm/scoped/GitHub-name result; some optional checks incomplete | `AVAILABILITY_UNVERIFIED` |
| **UpgradeDossier** | Evidence bundle/report | No exact npm/scoped/GitHub-name result; only unrelated phrase-level web hits | `LIKELY_AVAILABLE` |
| **RepoReadiness** | Repository readiness | Existing repositories and an active dev-tool/community concept use this phrase | `HIGH_CONFUSION_RISK` |
| **ChangeHandoff** | Human-reviewed agent handoff | No exact registry/repo result, but phrase is generic across operational/health handoffs | `HIGH_CONFUSION_RISK` |

All eight exact npm unscoped and `@thomasminh1995/` endpoints returned 404 at 2026-07-19T07:37:45Z. Exact owner/repository URLs also returned 404. GitHub repository-name search returned zero results for six candidates and two `RepoReadiness` repositories. **[M]** Sources: `https://registry.npmjs.org/<candidate>`, encoded scoped registry paths, `https://api.github.com/repos/thomasMinh1995/<candidate>`, and GitHub repository search. These are point-in-time signals only.

### Shortlist

| Candidate | Product-positioning fit | Package/CLI plan | Additional checks at 2026-07-19T07:38:46Z | Assessment |
| --- | --- | --- | --- | --- |
| **DepVerdict** | “DepVerdict is a decision-first CLI for evidence-bounded dependency upgrade analysis.” Clear, ecosystem-neutral and agent-handoff compatible. “Verdict” must retain `INVESTIGATE`/insufficient-data semantics to avoid overconfidence. | `@thomasminh1995/depverdict`; `depverdict` | npm/PyPI 404; exact GitHub/CLI-name search zero; RDAP returned no record (404) for `.com/.dev/.io/.app` | **Selected; `LIKELY_AVAILABLE`** |
| **UpgradeDossier** | Strong evidence/report connotation, but weaker on decision and planning; command is long. | `@thomasminh1995/upgradedossier`; `upgradedossier` | npm/PyPI 404; exact GitHub/CLI search zero; RDAP 404 for four checked TLDs | Runner-up; `LIKELY_AVAILABLE` |
| **DependencyCompass** | Honest guidance metaphor and multi-ecosystem fit, but more generic and less decision-first. | `@thomasminh1995/dependencycompass`; `depcompass` | npm/PyPI 404; exact GitHub/CLI search zero; `.com/.dev` RDAP 404, `.io/.app` throttled | Runner-up; `AVAILABILITY_UNVERIFIED` |

Crates.io returned HTTP 403 for all three, so Rust-package availability is `AVAILABILITY_UNVERIFIED`, not available. Unauthenticated GitHub code search returned 401 at 2026-07-19T07:39:21Z; general web and repository-name searches were used as bounded substitutes. Basic exact-name + trademark web queries found no reliable exact software-mark result for the shortlist, but that is not database clearance. A qualified review remains recommended for all candidates.

No candidate, package, repository, domain or handle was registered or reserved.

## 10. Product/CLI/package/repository decision

### Product

Adopt **DepVerdict**. Preserve the positioning:

> DepVerdict is a decision-first CLI for evidence-bounded dependency upgrade analysis.

The README must immediately explain that a verdict can be `INVESTIGATE`, `INSUFFICIENT_EVIDENCE`, or `NOT_ANALYZED`; the name does not promise that every dependency has a safe yes/no answer.

### Repository

Rename the existing repository to `thomasMinh1995/DepVerdict` during an explicitly authorized implementation cutover. Do not create a second repository or rewrite history. GitHub normally provides redirects after a rename, but implementation must verify clone, web, Actions, issue, advisory, release and raw-content behavior rather than assume all consumers follow redirects.

Future manual cutover steps:

1. Merge and qualify the identity migration on the existing repository.
2. Recheck `DepVerdict` availability and complete the human/legal risk checkpoint.
3. With explicit authorization, rename the repository in GitHub settings.
4. Update package `repository/homepage/bugs`, badges, workflow links, issue/security links and contributor clone instructions to the new URL.
5. Tell existing contributors to run `git remote set-url origin https://github.com/thomasMinh1995/DepVerdict.git`; verify forks, Actions, releases and private vulnerability reporting.

Historical commit messages, reports, release notes and tag contents must not be rewritten.

### npm package

Use the public scoped package:

```text
@thomasminh1995/depverdict
```

The personal scope makes ownership explicit and avoids dependence on unscoped-name acceptance. It creates a future organization-migration cost, but an organization should not be created until there is a real maintenance need.

The future, separately authorized publication form is:

```bash
npm publish --access public --tag preview
```

Do not publish with `latest` during Technical Preview. Do not attempt to deprecate, alias, or modify the external `upgrade-lens` package. There is no published local `upgradelens` package to deprecate.

### CLI

Use `depverdict` as the primary executable. It is short, memorable and aligned with the brand. Provide `upgradelens` as a compatibility bin alias for one preview release only, with a stderr deprecation notice that does not affect machine-readable stdout. Remove the alias only in a pre-announced later prerelease/minor gate.

The failed publish reportedly emitted a bin-normalization warning. That does **not** prove the current mapping is broken. Before changing bin behavior, reproduce package packing and clean installation on supported Node/npm versions, including POSIX and Windows command shims.

## 11. Artifact/schema/env compatibility decision

The rebrand must not become an unsafe global text replacement.

| Identity | Rename now | Keep | Alias/deprecate | Migration note |
| --- | --- | --- | --- | --- |
| Product display | Yes → `DepVerdict` | Historical prose/releases | No current-name branding in new docs | Do not rewrite old reports/releases |
| Repository slug/URLs | Yes at authorized cutover | Old Git history/tags | Rely on verified GitHub redirect only as transition | Update metadata and security routes |
| npm package/import specifier | Yes → `@thomasminh1995/depverdict` | No unpublished npm artifact to preserve | No npm alias required | Source-checkout users update imports |
| CLI | Yes → `depverdict` | — | `upgradelens` one preview release | New CLI is authoritative |
| Default output root | Yes → `.depverdict/` | Read existing `.upgradelens/` | Legacy read/fallback for one preview line | Never rewrite historical artifacts in place |
| Artifact filenames | No | All semantic filenames | None | `project-manifest.json`, `upgrade-decision.json`, etc. remain stable |
| Existing schema IDs/versions | No in-place mutation | Frozen v0.5 contracts | Validators retain legacy read support | New brand-bearing output contracts receive new IDs/versions |
| Generator name/schema title | Yes only in new schema versions | `UpgradeLens` in frozen historical schemas | Dual-version validation | Changing a `const` requires a schema version change |
| Environment prefix | Yes → `DEPVERDICT_*` | — | Accept `UPGRADELENS_*` for one preview line; new prefix wins conflicts with warning | Never echo authorization values |
| Public export symbols | No semantic rename by default | Existing JavaScript symbol names | None unless a symbol embeds the old brand | Package specifier changes, export path remains `"."` |
| Task IDs | No | `version-analysis.v1`, `migration-planning.v1/v2` | None | They identify semantics, not product spelling |
| Reason/status codes | No | Existing policy and completion codes | None | Preserve replay and test compatibility |
| Provider schema name | Yes with next prompt/schema version | Old qualified identity | Legacy validator/provider fixtures | `upgradelens_version_analysis` cannot be silently renamed under the same qualification |
| Qualification records/IDs | Never rewrite | Existing records are historical | No alias for hashes | Generate new records after requalification |
| Conduct contact | After verified replacement exists | Keep old inbox operational during transition | Publish a transition window | Security/conduct reporting must never lose a private route |
| Documentation paths | Current docs change | Historical decision/review/release paths remain | Link a migration note | Avoid mechanical global replacement |

This creates one intentional compatibility break—the new default artifact root—while preserving semantic filenames, task IDs, reason codes and historical schemas. The legacy root fallback prevents existing GitHub/source users from losing evidence during the preview transition.

## 12. Version/tag strategy

Public `v0.5.0` must remain untouched:

- annotated remote tag object: `4750606ca85f990ee69d60ab4673caca5fbfb89b`;
- tagged commit: `74d57344db254d0109ea951dc7c44853cdad9be0`;
- published GitHub Release: 2026-07-19T02:56:50Z;
- current `main`: `c91fbb0032b0e2f6209cb4a14aeeb68d9cf0c28d`, seven commits later.

Do not delete, recreate, force-move, or retitle the historical tag as though it contained later readiness work.

Use **`0.6.0-alpha.1`** for the first rebranded snapshot:

- the product/package/CLI/default-output identities change;
- brand-bearing schema/provider identities require new versions and qualification;
- minor-version continuity preserves repository history better than restarting at `0.1.0`;
- `alpha.1` and npm `preview` communicate that requalification and migration feedback are still required.

After implementation:

1. run full package, schema, legacy-read and provider/migration requalification;
2. create a new immutable `v0.6.0-alpha.1` tag only from the qualified commit;
3. create a GitHub prerelease explaining “DepVerdict, formerly UpgradeLens”;
4. publish the scoped package only through a separately authorized gate and only under `preview`.

Strategy “0.5.1 patch” is rejected because the chosen identity/default-path/schema transition is broader than a patch. Reusing or moving `v0.5.0` is rejected because it is public history.

## 13. Migration cost inventory

Counts below use case-sensitive exact matches in the 463-file committed tree at `c91fbb0`. They exclude all untracked RR02 captures and the untracked comparison report. Categories overlap and must not be summed.

| Identity string | Exact occurrences | Files | File distribution | Change classification |
| --- | ---: | ---: | --- | --- |
| `UpgradeLens` | 391 | 128 | docs 60, tests 23, schemas 20, source 10, root/other 7, `.github` 3, eval 3, examples 2 | Current product surfaces `MUST_CHANGE`; historical docs/captures `KEEP_AS_HISTORICAL_RECORD` |
| `upgradelens` | 839 | 209 | docs 116, tests 60, root/other 15, source 10, examples 3, schemas 3, `.github` 1, eval 1 | Package/CLI/current docs `MUST_CHANGE`; legacy aliases `KEEP_FOR_COMPATIBILITY`; historical records stay |
| `UPGRADELENS_` | 241 | 26 | docs 10, root/other 7, tests 6, source 2, `.github` 1 | New runtime/docs `MUST_CHANGE`; old prefix accepted temporarily |
| `.upgradelens` | 426 | 115 | docs 61, tests 40, root/other 7, source 5, `.github` 1, examples 1 | New default `MUST_CHANGE`; legacy reads/tests `KEEP_FOR_COMPATIBILITY`; historical records stay |
| `thomasMinh1995/UpgradeLens` | 41 | 31 | schemas 19, docs 4, root/other 3, `.github` 2, eval 2, tests 1 | Current URLs `SHOULD_CHANGE`; frozen schema IDs/history `KEEP_AS_HISTORICAL_RECORD` |

Highest-cost areas are not package metadata; they are schemas, qualification identity, tests and historical documentation. Implementation must classify matches file-by-file:

- **`MUST_CHANGE`:** current constants, package/lock metadata, bin, README/current docs, package examples, current community/workflow links, new-brand schemas, provider schema identity.
- **`SHOULD_CHANGE`:** current architecture prose, current examples and active support links.
- **`KEEP_FOR_COMPATIBILITY`:** old CLI/env/output-root readers and their tests.
- **`KEEP_AS_HISTORICAL_RECORD`:** tagged files, prior reviews, captures, release notes, qualification records and commit history.
- **`UNRELATED_MATCH`:** generic dependency “upgrade” terminology and third-party data; do not alter it.

## 14. User/contributor migration plan

| Surface | Before | After | Compatibility/breaking assessment |
| --- | --- | --- | --- |
| Install | Documented but unpublished `npm install -g upgradelens@preview` | `npm install -g @thomasminh1995/depverdict@preview` | No npm consumer migration from local package; install command is new |
| CLI | `upgradelens` | `depverdict` | Breaking public-preview rename; one-release alias |
| Import | `from 'upgradelens'` | `from '@thomasminh1995/depverdict'` | Breaking specifier; no published old package |
| Output | `.upgradelens/` | `.depverdict/` | New default; legacy directory remains readable for transition |
| Artifacts | Existing semantic filenames/schemas | Same filenames; new brand-bearing schema versions | Historical artifacts remain valid and untouched |
| Environment | `UPGRADELENS_*` | `DEPVERDICT_*` | Legacy fallback for one preview line; deterministic precedence |
| Git remote | `thomasMinh1995/UpgradeLens.git` | `thomasMinh1995/DepVerdict.git` | GitHub redirect plus documented `git remote set-url` |
| Releases | `v0.5.0` UpgradeLens history | `v0.6.0-alpha.1` DepVerdict prerelease | History preserved; no moved tags |

Release notes must state:

- this is an identity migration, not a new automatic-updater contract;
- no local npm package was previously published;
- `upgrade-lens` belongs to a different project and must not be installed as a compatibility package;
- the old CLI/env/output identities are temporary compatibility surfaces only;
- old reports and qualification records must not be rewritten;
- full requalification was performed for the exact release commit.

## 15. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Candidate becomes unavailable before cutover | Blocks consistent identity | Recheck all services immediately before mutation; stop and reopen ADR if conflict exists |
| Unknown trademark/company conflict | Legal/support cost | Human/legal risk review; no clearance claim; do not reserve automatically |
| “Verdict” implies false certainty | Overconfident product interpretation | Lead with evidence-bounded tagline and preserve explicit insufficient/investigate states |
| Large mechanical rename corrupts contracts/history | Schema and provenance breakage | File-by-file classification; version brand-bearing schemas; never rewrite old artifacts/tags |
| GitHub redirect gaps, especially raw schema links | Broken consumers/docs | Verify every URL class; freeze old IDs; publish new schema IDs; retain release copies/checksums |
| Personal npm scope becomes limiting | Future ownership migration | Accept for preview; consider organization only when maintenance structure justifies it |
| CLI alias prolongs confusion | Users keep old identity | One preview release, stderr deprecation, telemetry-free removal gate |
| Env aliases mishandle secrets or precedence | Credential exposure/unpredictability | New prefix wins; conflict warning names keys only; sanitized tests; never log values |
| New qualification identity invalidates old approval | Unsafe reuse of qualification | Treat old records as historical; run exact provider/model/task/dataset/prompt/schema/policy qualification |
| Conduct/security channel breaks during rename | Private reports lost | Verify replacement before retiring old email/URLs; publish overlap period |

## 16. Rejected options

- **Keeping UpgradeLens with only a scoped distribution identity:** rejected because it solves npm feasibility but preserves the exact same-domain product name and near-identical install/CLI identity.
- **Keeping UpgradeLens while renaming only package and CLI:** rejected because four different identity layers would no longer reinforce each other and search/support ambiguity would remain.
- **GitHub-only delay as the primary strategy:** rejected because it postpones rather than resolves the decision. It remains a safe temporary fallback if pre-cutover checks fail.
- **Unscoped `depverdict`:** not selected despite an npm 404; scoped ownership clarity is preferable and unscoped acceptance was not tested.
- **Immediate npm `latest`:** rejected because the product remains Technical Preview and identity/schema compatibility requires requalification.
- **`0.5.1` identity patch or moved `v0.5.0`:** rejected because the change is broader than a patch and the public tag/release is immutable history.
- **Creating an npm/GitHub organization or reserving domains/social handles:** rejected for now because it adds operational burden without demonstrated community need.
- **Mechanical global replacement:** rejected because historical records, semantic task IDs, reason codes, schema versions and qualification digests must remain stable.

## 17. Implementation tasks, maximum 5

| Task | Bounded scope | Dependencies | Acceptance criteria | Rollback/compatibility note |
| --- | --- | --- | --- | --- |
| `DIFF-02 Identity contract and compatibility implementation` | Add new product/package/CLI/constants, `.depverdict` default, legacy CLI/env/output readers, new brand-bearing schema versions; preserve semantic IDs | DIFF-01 accepted; final availability/legal checkpoint before public mutation | Unit/schema tests prove precedence, sanitized warnings, legacy reads, unchanged task/reason IDs and untouched historical fixtures | Revert code before any external rename; old paths remain usable |
| `DIFF-03 Package, CLI and repository metadata migration` | Update package/lock/bin/export metadata and planned repository URLs; reproduce bin normalization on Node/npm and Windows/POSIX shims | DIFF-02 | `npm pack` manifest, clean installs, `depverdict --version/help`, temporary alias behavior, zero lifecycle/network mutation | No publish; repository rename requires separate explicit authorization |
| `DIFF-04 Docs, community and release migration` | Update active README, current docs, templates, support/security routes and migration note; keep historical reports/releases unchanged | DIFF-03; verified replacement conduct/security channel | Link scan classifies redirects; install/import examples are unambiguous; historical diffs are zero | Keep old private channels and URLs during overlap |
| `DIFF-05 Package/CI/provider requalification` | Full Node 20/22/24 CI, package guard, clean install, schema dual-read, deterministic artifacts, provider/migration qualification at exact identity | DIFF-02–04 | Green hosted CI; reproducible pack; new qualification record binds exact package/prompt/schema/policy; old artifact fixtures still load | Failure blocks tag/publication; no reuse of old qualification |
| `DIFF-06 Public-preview distribution gate` | Recheck availability, authorized GitHub rename, immutable prerelease tag/release, scoped npm preview publication | DIFF-05 + explicit maintainer authorization + human/legal checkpoint | Remote SHA/tag/release/npm tarball/CLI match; dist-tag is `preview`; old repo redirects verified; no `latest` | Stop before each external mutation if identity drift occurs; never force-move a public tag |

No implementation task is executed by DIFF-01. External mutations remain separately authorized actions.

## 18. Validation needed after implementation

1. Recheck exact npm scoped/unscoped names, GitHub slug/name search, web signals and relevant trademark databases immediately before mutation.
2. Confirm package name/version in `package.json`, lockfile, tarball manifest and installed metadata.
3. Reproduce the reported bin-normalization warning independently on supported Node/npm combinations; validate POSIX symlink and Windows `.cmd`/PowerShell shims rather than assuming current bin is broken.
4. Clean-install the packed tarball in isolated prefixes on Node 20, 22 and 24; verify `depverdict --version`, `--help`, normal analysis and the deprecated `upgradelens` alias.
5. Verify `DEPVERDICT_*` precedence, `UPGRADELENS_*` fallback and secret-safe conflict/debug messages.
6. Verify `.depverdict/` new writes, `.upgradelens/` legacy reads, no in-place rewrite and deterministic artifact lineage.
7. Validate frozen v0.5 schemas/fixtures and new brand-bearing schema versions; check every `$id`, generator `const`, provider schema name and prompt/schema digest.
8. Re-run evaluation, qualification and provider failure gates for the exact provider/model/task/dataset/prompt/schema/policy identity.
9. Run package-content guard, full tests, hosted CI and read-only package smoke; confirm no captures, secrets or local paths enter the tarball.
10. After an authorized repository rename, verify clone/fetch redirect, contributor remote update, Actions badges, issues/PRs, private vulnerability reporting, release/tag continuity, raw schema links and forks.
11. Create `v0.6.0-alpha.1` only from the qualified SHA and mark the GitHub release as prerelease.
12. If separately authorized to publish, use public scoped access with npm `preview`; verify registry metadata/tarball/bin without moving `latest`.

Any failed identity, schema, qualification, private-reporting or distribution check blocks the public-preview gate.

## 19. Exact file created

DIFF-01 created exactly:

```text
docs/decisions/diff-01-brand-distribution-identity.md
```

It did not modify README, package/lock metadata, source, tests, schemas, workflows, tags, releases, repository settings, npm packages, domains, handles, credentials or the external project. Pre-existing untracked RR02 captures and the earlier comparison report were preserved unchanged.
