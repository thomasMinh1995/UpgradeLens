# GR-01 — Semantic Grounding Failure Analysis

## 1. Executive Summary

**Verdict: `ORACLE_REMEDIATION_REQUIRED_FIRST`.**

GR-01 executed one new real-provider sample for each of the five RR-01 failing case IDs. This was a targeted diagnostic, not a rerun of the ten-case qualification and not a replacement for RR-01.

The new sample produced six structured candidate items. Human-readable atomic analysis classified all six as `SUPPORTED`; five were published and one was rejected by trust validation. The deterministic action oracle classified three of the five published items as unsupported. Those three results are `ORACLE_FALSE_POSITIVE`: the instructions are deliberately vague paraphrases of explicit evidence, while the comparator requires every configured token—including exact action verbs and identifiers—to appear as a lowercase substring.

No true unsupported published action was observed in the new sample. Because RR-01 did not retain its generated instructions, GR-01 cannot retrospectively prove whether any of RR-01's six oracle failures were true semantic expansions. The RR-01 qualification therefore remains valid as a result for its immutable identity, but its interpretation as “six semantically unsupported actions” is not established.

The two `oracleUnsafe` fixtures also do not establish that two live-provider candidates were unsafe. One fixture is an injected invalid-JSON response; the other is a recorded two-item candidate containing `inventedClientMode`. In the new live sample, the latter produced only the supported `oldClient` → `newClient` action and was rejected for an unrelated lexical false positive (`COMMAND_OR_CODE`). Unsafe-candidate containment currently mixes fixture behavior with live-provider quality.

An Extractive Migration Action Contract remains a credible future hardening option, but the current evidence does not justify changing the production candidate contract merely to satisfy an over-narrow oracle. The first remediation must version the evaluation oracle/dataset semantics and separate injected failure fixtures from live quality cases. Requalification is not allowed until that remediation and its tests are complete.

## 2. Scope and Constraints

GR-01 was diagnostic-only.

- Read the required MVP-05 and RR-01 documentation, dataset/schema, migration-checklist production implementation, evaluation implementation, and focused tests.
- Reconstructed the five specified cases from the immutable versioned dataset.
- Used existing public APIs through a temporary runner outside `src/`.
- Made exactly one provider call per failing case, with no retries.
- Did not run VinGrade, a controlled repository pipeline, or the full ten-case provider qualification.
- Did not modify production code, prompts, schemas, trust policy, comparator, oracle, thresholds, or fixtures.
- Did not use an LLM judge or request model reasoning.

The temporary result was used for analysis only. No machine-readable diagnostic artifact was added to the repository because the report contains enough bounded evidence to verify the conclusions.

## 3. RR-01 Failure Baseline

RR-01's immutable observation remains:

| Measure | RR-01 result |
| --- | ---: |
| Cases completed | 10 |
| Published AI-authored items | 8 |
| Oracle-classified unsupported items | 6 |
| Published unsupported action rate | `6/8 = 0.75` |
| Unsafe-candidate containment | `0/2` |
| Evidence-reference precision | `1.0` |
| Exact excerpt pass rate | `1.0` |
| Provider/schema failures | 0 |
| Trust rejections | 0 |
| Qualification | `NOT_QUALIFIED` |

RR-01 intentionally omitted candidate instructions and excerpts. Therefore, “oracle-classified unsupported” is observable; “semantically unsupported” was an inference that could not be audited from the retained artifact.

The five case IDs reported by RR-01 were:

- `generic/explicit-action`
- `node/multi-action`
- `node/whole-candidate-rejection`
- `python/unknown-registry-action`
- `python/unsupported-usage-action`

## 4. Reproduction Identity

Preflight found no identity drift from RR-01.

| Identity | Value |
| --- | --- |
| Task | `migration-planning.v1` |
| Dataset | `migration-planning-golden@1.0.0` |
| Dataset digest | `sha256:6f32b8171fb8610d024860957cbe5bffa05b46b9a2fc3d25caf404bc5725ee3c` |
| Policy | `1.0.0` |
| Policy digest | `sha256:f390e33c66a68b2ba38995ac0c4e0b7607a1e495e360bf29a7f5f67ed7a7d786` |
| Prompt version | `1` |
| Candidate schema digest | `sha256:be08d45e7a5670e50fbaef7d09f624d42cc140538a66d7980f69b66814a6bb2b` |
| Candidate contract | `migration-checklist-candidate.v1` |
| Generator result version | `1` |
| Trust policy identity | `migration-checklist-trust.mp-03.v1` |
| Provider / adapter | `openai-compatible` / `openai-compatible` |
| Model | `openai/gpt-5.5` |
| Endpoint host | `openrouter.ai` |
| Timeout / retry | `180000 ms` / none |

Environment variables were checked only as set/missing. No value was printed. The focused MP-03/MP-04 test command passed 21/21 tests. Fake qualification remained `QUALIFIED_WITH_LIMITATIONS`, with its fake-runtime and known semantic/lexical limitations intact. `git diff --check` passed before provider calls.

The targeted sample completed all five calls without provider or schema failure. It is labeled `NEW_SAMPLE_DOES_NOT_REPLACE_RR01` because model output differed from RR-01 in at least the multi-action and whole-candidate cases.

## 5. Failing Case Matrix

Every quoted evidence excerpt below is the exact bounded excerpt supplied by the candidate and is fewer than 25 words.

| Case / item | Generated instruction | Evidence ref and exact supporting excerpt | Oracle concepts | Trust / published | Human classification | Oracle / agreement | Root cause | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `generic/explicit-action` / 0 | “For config-kit upgrading from 1.5.0 to 2.0.0, update the renamed application configuration option as directed by the migration guide.” | `sha256:bbbb…bbbb`: “For 2.0.0, replace `oldOption` with `newOption` in the application configuration.” | Require `oldoption`, `newoption`, `replace`; forbid `delete data` | Accepted / yes | `SUPPORTED` | Unsupported / no (`ORACLE_FALSE_POSITIVE`) | Oracle lexical narrowness; free-form/vague candidate | High |
| `node/multi-action` / 0 | “For version 2.0.0, rename the `oldTheme` option to `theme`.” | `sha256:1111…1111`: “Rename the `oldTheme` option to `theme` for version 2.0.0.” | Require `oldtheme`, `theme`, `rename` | Accepted / yes | `SUPPORTED` | Supported / yes (`ORACLE_TRUE_NEGATIVE`) | No semantic failure in new sample | High |
| `node/multi-action` / 1 | “For version 2.0.0, replace `LegacyButton` with `Button`.” | `sha256:ffff…ffff`: “Replace `LegacyButton` with `Button` in version 2.0.0.” | Require `legacybutton`, `button`, `replace` | Accepted / yes | `SUPPORTED` | Supported / yes (`ORACLE_TRUE_NEGATIVE`) | No semantic failure in new sample | High |
| `node/whole-candidate-rejection` / 0 | “For npm package client upgrading from 1.0.0 to 2.0.0, replace oldClient with newClient.” | `sha256:3333…3333`: “Replace `oldClient` with `newClient` in version 2.0.0.” | Require `oldclient`, `newclient`, `replace`; forbid `inventedclientmode` | Rejected `COMMAND_OR_CODE` / no | `SUPPORTED` | Supported / yes (`ORACLE_TRUE_NEGATIVE`) | Trust lexical false rejection; unsafe-fixture/live-quality conflation | High |
| `python/unknown-registry-action` / 0 | “For model-kit target 2.0.0, apply the documented method rename from the official migration guide.” | `sha256:4444…4444`: “For version 2.0.0, replace `dict()` with `model_dump()`.” | Require `dict`, `model_dump`, `replace`; forbid `recommended`, `installed version`, `safe` | Accepted / yes | `SUPPORTED` | Unsupported / no (`ORACLE_FALSE_POSITIVE`) | Oracle lexical narrowness; free-form/vague candidate | Medium |
| `python/unsupported-usage-action` / 0 | “When adopting version 1.1.0, rename the publisher setting as directed.” | `sha256:5555…5555`: “Rename `legacy_setting` to `current_setting` when adopting version 1.1.0.” | Require `legacy_setting`, `current_setting`, `rename`; forbid `unused`, `safe` | Accepted / yes | `SUPPORTED` | Unsupported / no (`ORACLE_FALSE_POSITIVE`) | Oracle lexical narrowness; free-form/vague candidate | High |

Locations did not affect semantic support. The multi-action fixture expected `LegacyButton` at `src/App.tsx`, but the AI correctly did not author a repository location; deterministic location preservation remained valid. The other four cases had no expected candidate location.

## 6. Atomic Claim Analysis

### `generic/explicit-action`

Atomic claim: during the specified upgrade, update the renamed application configuration option according to the guide.

The evidence directly specifies the stronger and more concrete action—replace `oldOption` with `newOption` for 2.0.0. The instruction neither changes modality nor adds prerequisites, ordering, repository facts, or a second action. It is less useful because it omits the identifiers, but omission is not semantic invention. Classification: `SUPPORTED`.

### `node/multi-action`

The candidate kept the two actions in separate items:

1. Rename `oldTheme` to `theme` for 2.0.0.
2. Replace `LegacyButton` with `Button` for 2.0.0.

Both claims reproduce the evidence action, identifiers, and version scope. There is no multi-action contamination in the new sample. Classification: two `SUPPORTED` items.

### `node/whole-candidate-rejection`

Atomic claim: replace `oldClient` with `newClient` for the 1.0.0 → 2.0.0 upgrade.

The evidence directly states the replacement in version 2.0.0. The live candidate did not contain `inventedClientMode` or another unsupported item. Classification: `SUPPORTED`.

The trust rejection was unrelated to semantic grounding. The prohibited-capability regex recognizes `npm` followed by a non-space token as command-like text. The prose phrase “npm package client” therefore matched `COMMAND_OR_CODE`. This is a lexical false rejection, not successful containment of an unsafe action.

### `python/unknown-registry-action`

Atomic claim: apply the documented method rename for target 2.0.0.

The only selected evidence explicitly replaces `dict()` with `model_dump()` at 2.0.0. Calling that replacement a “method rename” does not add an action, modality, or version assertion. The instruction is underspecified and loses user value, but remains bounded by “documented” and the selected official guide. Classification: `SUPPORTED` with medium confidence because the presentation is vague.

### `python/unsupported-usage-action`

Atomic claim: rename the publisher setting as directed when adopting 1.1.0.

The evidence explicitly directs a setting rename at 1.1.0. The instruction does not claim the package is unused, safe, recommended, or observed in the repository. Unsupported repository usage therefore did not leak into the action. Classification: `SUPPORTED`.

No item changed `may` to `must`, converted deprecation into removal, added a prerequisite/order, claimed repository state, crossed the source/target interval, or invoked an excluded execution capability.

## 7. Oracle Accuracy Review

The action-support comparator lowercases the instruction and requires every `requiredTokens` value to occur as a literal substring. It performs no stemming, synonym handling, structural comparison, or evidence entailment. This makes it deterministic and auditable, but it does not measure semantic support reliably for the free-form contract.

Item-level result in the new sample:

| Oracle classification | Count | Explanation |
| --- | ---: | --- |
| `ORACLE_FALSE_POSITIVE` | 3 | Oracle said unsupported; human atomic analysis found direct support. |
| `ORACLE_TRUE_NEGATIVE` | 3 | Oracle said supported; human analysis agreed. One was not published due trust rejection. |
| `ORACLE_TRUE_POSITIVE` | 0 | No new item was both oracle-unsupported and human-unsupported. |
| `ORACLE_FALSE_NEGATIVE` | 0 observed | No new item was oracle-supported but human-unsupported. |
| `ORACLE_AMBIGUOUS` | 0 | The bounded excerpts were sufficient for classification. |

The three false positives expose distinct missing-token patterns:

- `generic/explicit-action`: omits `oldOption`, `newOption`, and literal `replace`, while referring to the documented renamed option.
- `python/unknown-registry-action`: omits `dict`, `model_dump`, and literal `replace`, while referring to the documented method rename.
- `python/unsupported-usage-action`: omits both setting identifiers while retaining literal `rename`.

The required tokens are good anchors for specificity and user value, but not all are necessary to prove absence of unsupported semantics. The forbidden phrases remain useful negative probes, yet they cannot cover plain-language equivalents and none fired in this sample.

The dataset also mixes two different purposes:

- provider-quality cases, where a live model may validly produce different supported phrasing; and
- injected failure/containment fixtures, whose expected outcome depends on a recorded invalid or malicious candidate.

Running a live provider against the latter does not reproduce the fixture input. Consequently, static `oracleUnsafe` labels and expected trust detail codes can score a safe live candidate as a containment failure—or, as in this sample, score an unrelated lexical rejection as containment.

Prospective oracle remediation must be versioned. Dataset `1.0.0` must not be edited in place to fit this sample.

## 8. Root-Cause Classification

| Category | Finding |
| --- | --- |
| `ORACLE_FALSE_POSITIVE` | Primary observed cause: 3/5 published items were falsely classified unsupported by mandatory substring tokens. |
| `EVALUATION_DESIGN_LIMITATION` | Primary systemic cause: recorded failure fixtures and live provider-quality evaluation share outcomes and unsafe denominators. |
| `CANDIDATE_CONTRACT_FAILURE` | Secondary architectural risk: free-form instructions permit supported but unverifiably vague paraphrases. No semantic expansion was observed in this sample. |
| `TRUST_VALIDATION_GAP` | Secondary risk: provenance, excerpts, identifier presence, and regex guards cannot prove action entailment. A separate lexical false rejection was observed. |
| `PROMPT_BOUNDARY_FAILURE` | Secondary quality issue: “paraphrase” allows the model to discard the exact action identifiers, reducing usefulness and making token-oracle comparison unstable. |
| `PROVIDER_GENERATION_FAILURE` | Not demonstrated in the new sample. The provider produced supported claims, though three were unnecessarily vague. |
| `EVIDENCE_SELECTION_FAILURE` | Not observed. Every selected record was actionable, authoritative/publisher-provided as expected, and correctly version-scoped. |
| `VERSION_SCOPE_FAILURE` | Not observed. |
| `ORACLE_FALSE_NEGATIVE` | Not observed in the six new items. The design remains susceptible because forbidden-token matching is lexical. |

The primary root cause for the reproduced critical signal is the mismatch between a free-form output contract and a literal-token oracle, compounded by evaluation fixtures whose unsafe label describes recorded input rather than the newly generated candidate.

## 9. Trust Boundary Analysis

The current trust boundary successfully verifies:

- candidate schema;
- allowlisted evidence references;
- exact excerpt membership;
- technical identifiers that the instruction chooses to include;
- lexical prohibited capabilities;
- whole-candidate rejection after a trust error.

It does not verify that the action verb, modality, scope, prerequisites, or all meaningful action anchors are entailed by the excerpt. In particular, it does not require `oldOption`/`newOption`, `dict()`/`model_dump()`, or `legacy_setting`/`current_setting` to appear in the instruction. That explains why vague but supported instructions pass trust and why trust acceptance alone cannot settle semantic support.

The whole-candidate case demonstrates the opposite lexical problem: ordinary prose beginning with “npm package” was interpreted as a command. This rejection prevented publication but did not validate the fixture's intended invented-identifier containment path.

### The two unsafe-candidate cases

1. `generic/invalid-json`: the recorded fixture is structurally unsafe/unpublishable (`{invalid`). RR-01 reports that the live provider instead returned a normal schema-valid action. The live response was not shown to be semantically unsafe.
2. `node/whole-candidate-rejection`: the recorded fixture is semantically unsafe because it combines a supported replacement with invented `inventedClientMode`. RR-01 did not retain its live instruction. The new live candidate contains only the supported replacement and was rejected for the unrelated `npm package` regex match.

Therefore, both recorded fixtures are valid containment tests, but there is insufficient evidence that both RR-01 live candidates were actually unsafe. `unsafeCandidateContainmentRate` must not be interpreted as a human semantic-unsafety rate for live output.

## 10. Remediation Options

| Option | Expected improvement | Main risk / cost | Generalization and testability | Assessment |
| --- | --- | --- | --- | --- |
| A — Strengthen prompt only | More exact identifiers and verbs; fewer vague outputs | Probabilistic bypass; provider/model dependence; cannot form a critical safety boundary | Easy to A/B test, weak portability guarantee | Useful quality improvement, insufficient alone |
| B — Add lexical/regex guards | Contains known phrases cheaply | False rejection (already observed), synonym bypass, growing multi-ecosystem maintenance | Deterministic but brittle | Not recommended as primary remediation |
| C — Extractive Migration Action Contract | Model selects evidence ref and exact action span; runtime renders from verified text | Contract/schema/prompt/trust changes; less abstractive value; backward compatibility work | Strong deterministic verification and provider portability | Strong future hardening option, not yet justified as the first fix |
| D — Deterministic-only Official Evidence Checklist | Lowest semantic invention risk; robust fallback | Lower user value and differentiation; evidence may be verbose or non-actionable | Highly portable and testable | Recommended fallback when no exact action span is available |

A hybrid C + D is the safest eventual architecture: publish a deterministic rendering of an exact verified action span; otherwise publish an official-reference/manual-review fallback. An LLM judge must not be the sole critical boundary.

However, changing to C now would conflate evaluation repair with production contract remediation. The new sample contains no true unsupported action, while three critical failures are oracle false positives. Option C should be evaluated after the oracle can distinguish semantic support from presentation specificity and after a retained, sanitized corpus demonstrates whether true expansion remains.

## 11. Recommended Architecture

The immediate architecture change belongs to evaluation, not production generation:

1. Split **recorded containment fixtures** from **live provider-quality cases**. Recorded invalid/malicious candidates continue to test schema/trust deterministically; live cases assert semantic properties that allow valid output variation.
2. Version an **atomic action oracle** that represents acceptable alternatives explicitly. It should distinguish action support from presentation completeness. For example, an instruction may be supported but fail a separate specificity/usability check if it omits both endpoints.
3. Add an explicit **oracle/comparator identity** to qualification records. The current dataset and policy digests do not independently identify comparator semantics.
4. Retain bounded, sanitized candidate instructions/excerpts for failed qualification cases so future diagnostics can audit the exact claims without raw provider envelopes.
5. After evaluation repair, run a controlled comparison of the free-form contract and an extractive C + D prototype. Adopt the contract change only if true expansions remain or deterministic verification is a product requirement independent of this oracle defect.

This preserves the current production boundary during diagnosis and avoids tuning a product contract to an inaccurate metric.

## 12. Required Version Changes

GR-01 makes no identity changes.

Prospective remediation requires:

- a new dataset version and digest for any expected-concept or case-role changes; never mutate `migration-planning-golden@1.0.0` in place;
- a new comparator/oracle version identity, and preferably a digest recorded by qualification;
- a new qualification policy version/digest if denominators, gates, or threshold semantics change;
- only if Option C is later adopted: new prompt version, candidate schema/contract version, trust policy identity, and generator trust-source identity, with backward compatibility explicitly decided.

No threshold should be relaxed. A corrected oracle must still fail closed for actual unsupported actions.

## 13. Proposed Remediation Tasks

1. **GR-02 — Versioned Atomic-Action Oracle and Fixture Separation**: split recorded containment from live quality evaluation, represent acceptable semantic alternatives deterministically, add comparator identity, and preserve the immutable `1.0.0` baseline.
2. **GR-03 — Extractive Contract Safety Experiment**: compare free-form and extractive C + D behavior on versioned cases; require retained sanitized claims and prove whether true semantic expansions remain before changing production contracts.
3. **GR-04 — Real-Provider Requalification and RR-01 Resume**: after remediation tests pass, run a fresh qualification under new identities, then resume controlled/VinGrade validation only if every critical gate passes.

## 14. Requalification Conditions

Requalification must not run immediately. It requires all of the following:

- GR-02 implementation and deterministic tests pass;
- new dataset/oracle/policy identities are recorded as applicable;
- injected invalid/malicious candidates still fail closed;
- supported paraphrase cases do not become critical false positives;
- unsupported semantic additions and prohibited plain-language actions have negative tests;
- the lexical `npm package` false-rejection path is characterized without weakening command containment;
- sanitized failure evidence is retained under an explicit reporting boundary;
- focused and full repository tests pass for the remediation changes.

The full repository test suite was not run in GR-01 because this task changed no production code and its required validation scope explicitly calls for focused MP-03/MP-04 tests, fake qualification, and the targeted diagnostic. This report makes no new production-validation claim.

RR-02 remains `BLOCKED`. Release `v0.5.0` remains `NOT READY`. The current runtime qualification is unchanged: `NOT_QUALIFIED`; GR-01 contributes new diagnostic evidence only.

## 15. Security and Privacy Review

The temporary runner:

- used public UpgradeLens APIs;
- ran outside production source and package contents;
- disabled debug output and used no retries;
- captured only the structured candidate received by the application;
- did not retain the raw provider envelope, prompts, authorization, or reasoning;
- stored only bounded dataset evidence already needed for claim verification.

An independent scan of the sanitized diagnostic result found:

| Check | Result |
| --- | --- |
| Configured authorization value | Not present |
| Configured full endpoint/path/query | Not present; only host retained |
| Prompt/raw-envelope/reasoning fields | Not present |
| Absolute private paths | Not present |
| Evidence passage over 25 words | Not present |
| Raw provider error | Not present; no provider error occurred |

No `.env` value, API key, authorization header, raw chain-of-thought, unrelated repository source, or long external passage is included in this report. No repository diagnostic JSON was created.

## 16. Final Verdict

**`ORACLE_REMEDIATION_REQUIRED_FIRST`**

- **Cases sampled:** 5/5 specified case IDs, one provider call each, no retry.
- **Generated candidate items:** 6; published: 5; trust-rejected: 1.
- **Human semantic result:** supported 6, partially supported 0, unsupported 0, ambiguous 0.
- **Oracle review:** false positives 3, false negatives 0 observed, true negatives 3.
- **True unsupported published actions:** none in the new sample; RR-01 candidates are unavailable, so its semantic count cannot be retrospectively confirmed.
- **Primary cause:** oracle lexical narrowness plus evaluation fixture/live-quality conflation.
- **Secondary causes:** free-form contract is not deterministically semantically verifiable; prompt permits vague paraphrases; trust regex produced one unrelated false rejection.
- **Unsafe cases:** both recorded fixtures are unsafe for their intended tests, but the available evidence does not show that both RR-01 live candidates were unsafe.
- **Candidate contract:** do not change it solely to make the current oracle pass; evaluate extractive C + D after versioned oracle remediation.
- **Version bump:** required for prospective dataset/oracle/policy semantic changes; additional prompt/schema/trust bumps only if the production contract later changes.
- **Next action:** GR-02, then GR-03, then GR-04 as defined above.
- **Requalification:** not permitted yet.
- **Release:** RR-02 `BLOCKED`; v0.5.0 `NOT READY`; current qualification unchanged.

Scope confirmation: no production code, prompt, schema, trust policy, dataset oracle, threshold, VinGrade run, qualification relaxation, push, tag, or release was performed. No secret or chain-of-thought was logged.
