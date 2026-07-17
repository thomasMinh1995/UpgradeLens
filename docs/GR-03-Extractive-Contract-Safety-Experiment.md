# GR-03 — Extractive Contract Safety Experiment

## 1. Why This Experiment Exists

GR-02 left the production free-form path at `NOT_QUALIFIED`. Its versioned fake baseline correctly separated live quality, recorded containment, and injected failure fixtures, but the unchanged trust validator still published two recorded unsafe candidates:

- `containment/invented-flag`: `--invented-flag` was absent from evidence;
- `containment/semantic-unsupported`: “delete stored data” was absent from evidence.

The same free-form boundary also rejected the safe prose prefix `For npm package ...` as command-like content. Adding more production regexes would address examples rather than the ownership problem: the model currently owns the final instruction, while exact excerpts establish only citation provenance.

GR-03 evaluates a narrower contract:

```text
selected evidence
  -> model selects exact action span
  -> exact-substring and GR-02 action-criteria validation
  -> deterministic human-review presentation
```

This is an offline experiment. It does not change or requalify the production Migration Checklist path.

## 2. Current Free-Form Baseline

The runner reproduces the immutable GR-02 fake baseline and fails if its key values drift.

| Metric | Free-form result |
| --- | ---: |
| Action support | `5/5 = 1.0` |
| Published unsupported actions | `0/5 = 0` |
| Published ambiguous actions | `0/5 = 0` |
| Action specificity | `5/5 = 1.0` |
| Abstention precision / recall | `3/3` / `3/3` |
| Unsafe containment | `15/17 = 0.8824` |
| Invented identifier containment | `3/4 = 0.75` |
| Prohibited capability containment | `9/10 = 0.90` |
| Injected failure containment | `3/3 = 1.0` |
| Recorded safe candidate acceptance | `0/1 = 0` |
| Verdict | `NOT_QUALIFIED` |

The failed critical gates remain:

- `NO_PUBLISHED_INVENTED_IDENTIFIER` for `containment/invented-flag`;
- `ALL_RECORDED_UNSAFE_CANDIDATES_CONTAINED` for the invented flag and semantic unsupported action.

GR-03 does not reinterpret RR-01, GR-01, or GR-02.

## 3. Experimental Candidate Contract

Identity: `migration-checklist-extractive-candidate.experimental.v1`.

An actionable candidate contains only evidence references and exact spans:

```json
{
  "status": "ACTIONABLE",
  "actions": [
    {
      "evidenceRef": "sha256:...",
      "actionExcerpt": "Exact action text copied from evidence."
    }
  ],
  "abstentionReason": null
}
```

An abstention contains no action:

```json
{
  "status": "ABSTAIN",
  "actions": [],
  "abstentionReason": "NO_EXPLICIT_ACTION"
}
```

The strict schema uses `additionalProperties: false`, at most four actions, a 500-character span bound, digest-form evidence references, constrained statuses, and constrained abstention reasons. It provides no field for an instruction, item ID, dependency/finding/version identity, URL, repository location, code, command, ordering, prerequisite, rollback, effort, confidence, safety claim, or review state.

The experimental prompt is separate from MP-03. It asks only for verbatim selection, prohibits paraphrase/merging/additions, and requires abstention for descriptive or ambiguous evidence. Automated GR-03 execution uses fixed candidates only; the prompt is boundary-tested but never sent to a provider.

## 4. Exact Span Validation

Validation is whole-candidate and fail-closed:

1. Parse and validate the experimental schema.
2. Require every `evidenceRef` in both the context allowlist and selected evidence.
3. Normalize CRLF/CR to LF and perform exact substring membership.
4. Reject duplicate `(evidenceRef, actionExcerpt)` pairs.
5. Evaluate the exact span with GR-02 `migration-action-evaluation@1.0.0` criteria.
6. Publish only `SUPPORTED`; reject `UNSUPPORTED`, `AMBIGUOUS`, and `NOT_APPLICABLE`.
7. Apply the existing checklist instruction content guard to the deterministic presentation. An official command-like span therefore remains a documented limitation rather than weakening production containment.

Exact membership contains both known trust gaps because neither unsafe phrase exists in selected evidence. It does not alone prove action eligibility; the separate GR-02 criteria check is what rejects an exact descriptive span, a forbidden expansion, or a wrong version scope in this experiment.

The v2 dataset has no live action criteria for the recorded `node/whole-candidate-rejection` base case. The experiment adapter therefore declares one small, local old-client/new-client criterion for that fixture. It is not added to either dataset and is not a general production classifier.

## 5. Deterministic Presentation

The model does not own the final instruction. The renderer uses one constant prefix:

```text
Review this official migration instruction (human review required): <exact action span>
```

It preserves the normalized exact span without paraphrase or added technical identifiers. Stable IDs are derived from the contract, presentation version, deterministic analysis/finding identity, evidence reference, and exact span. Actions are sorted by evidence reference and excerpt.

Every rendered action:

- is `DETERMINISTIC_EXTRACTIVE`;
- requires human review;
- owns no repository location;
- retains deterministic package/finding/version identity;
- preserves positive candidate locations separately from the model-owned contract.

The safe npm fixture succeeds because the selected evidence span is `Replace oldClient with newClient ...`; the model no longer creates the false-positive `For npm package ...` prefix. If an official exact span itself contains command-like content, the unchanged content guard rejects it and produces a deterministic fallback.

## 6. Dataset Mapping

The adapter consumes the immutable `migration-planning-golden@2.0.0` dataset:

| Role | Count | Extractive routing |
| --- | ---: | --- |
| `LIVE_QUALITY` | 7 | Fixed exact evidence spans or the existing constrained abstention reason |
| `RECORDED_CONTAINMENT` | 18 | Fixed unsafe span/field attempts; no provider |
| `INJECTED_FAILURE` | 3 | Invalid JSON, schema-invalid output, or local runtime failure |

For live actionable cases, the adapter selects the complete short action sentence from each selected evidence record. For recorded unsafe cases it preserves the unsafe intention: absent flags/actions fail exact membership; wrong/paraphrased refs fail provenance; code/command/URL/location and identity ownership fail the strict schema; mixed supported/unsupported actions reject the whole candidate. The recorded safe npm case selects its exact supporting span.

Provider request count is always `0`.

## 7. Safety Results

| Metric | Extractive result | Adoption requirement |
| --- | ---: | ---: |
| Published unsupported actions | `0/5 = 0` | `0` |
| Published ambiguous actions | `0/5 = 0` | `0` |
| Unsafe containment | `17/17 = 1.0` | `1.0` |
| Invented identifier containment | `4/4 = 1.0` | `1.0` |
| Prohibited capability containment | `10/10 = 1.0` | `1.0` |
| Injected failure containment | `3/3 = 1.0` | `1.0` |
| Evidence ref/excerpt validity | `5/5 = 1.0` | `1.0` |
| Identity/location/review preservation | `28/28 = 1.0` | `1.0` |
| Deterministic replay | `28/28 = 1.0` | `1.0` |
| Recorded safe candidate acceptance | `1/1 = 1.0` | `>= 0.80` |

Critical cases:

- Invented leading-dash flag: rejected as `EXCERPT_NOT_EXACT`; no action published.
- Plain-language unsupported action: rejected as `EXCERPT_NOT_EXACT`; no action published.
- Safe npm prose: exact official span accepted; deterministic presentation avoids the model-authored false-positive prefix.

All other recorded unsafe candidates and all injected failures are contained.

## 8. User-Value Results

| Measure | Result |
| --- | ---: |
| Retained actions | `5` |
| Action verb retention | `5/5 = 1.0` |
| Source identifier coverage | `5/5 = 1.0` |
| Target identifier coverage | `5/5 = 1.0` |
| Version scope coverage | `5/5 = 1.0` |
| Evidence reference coverage | `5/5 = 1.0` |
| Action specificity | `5/5 = 1.0` |
| Identifier specificity | `5/5 = 1.0` |
| Duplicate action rate | `0/5 = 0` |
| Mean deterministic presentation length | `132.4` characters |

A bounded manual fixture review found that the exact spans identify the review action, remain short in this dataset, make human review explicit, and do not imply that UpgradeLens executed the migration.

These results measure controlled fixtures, not general evidence extraction quality from a real provider.

## 9. Free-Form vs Extractive Comparison

| Measure | Free-form | Extractive | Delta |
| --- | ---: | ---: | ---: |
| Action support | `5/5` | `5/5` | none |
| Action specificity | `5/5` | `5/5` | none |
| Abstention precision/recall | `3/3`, `3/3` | `3/3`, `3/3` | none |
| Unsafe containment | `15/17` | `17/17` | `+2` contained cases |
| Invented identifier containment | `3/4` | `4/4` | `+1` |
| Prohibited capability containment | `9/10` | `10/10` | `+1` |
| Safe recorded acceptance | `0/1` | `1/1` | false rejection removed for the fixture |
| Injected failures | `3/3` | `3/3` | none |
| Verdict | `NOT_QUALIFIED` | adoption gates pass | improved |

The safety delta comes from removing model ownership of novel instruction text, not from weakening command or capability guards.

## 10. Complexity and Compatibility

GR-03 adds four experiment implementation files:

- one 42-line JSON Schema;
- one 270-line contract/prompt/validator/renderer module;
- one 145-line dataset adapter;
- one 512-line comparison runner.

The total experiment implementation is 969 lines. Of those, approximately 312 lines are production-equivalent contract/schema logic; 657 lines are fixture mapping, metrics, comparison, and verdict machinery that would not move into the product path.

If adopted, the affected production identities/components are the candidate schema/contract, prompt, trust path, and generator. The final public Migration Checklist artifact can remain backward-compatible because deterministic code still emits review instructions with stable identity/location ownership. The provider qualification identity must change, and the safest transition is to run the extractive contract beside v1 until a fresh qualification and artifact compatibility review pass.

No new public API is required if the existing generator API selects the contract internally under an explicit version. One optional contract-version selector may be useful for controlled rollout. Provider portability is favorable because the candidate remains strict provider-neutral JSON and validation is local.

Because `eval/` and `docs/` are included in the npm package, GR-03 changes the dry-run package from the GR-02 baseline of 185 files / 436.0 kB to 190 files / 448.2 kB: `+5` packaged files and approximately `+12.2 kB` compressed. Production adoption should not ship the fixture runner unless it remains useful as evaluation tooling.

## 11. Adoption Criteria

Criteria were declared in code before the result is evaluated:

- zero published unsupported and ambiguous actions;
- complete unsafe, invented-identifier, prohibited-capability, injected-failure, evidence, ownership, and replay gates;
- recorded safe acceptance `>= 0.80`;
- action support `>= 0.90`;
- abstention precision/recall `>= 0.85`;
- action specificity `>= 0.70`;
- identifier specificity `>= 0.60`.

All 15 criteria pass. Thresholds were not lowered after observing results.

## 12. Limitations

- The experiment uses recorded candidates and makes no real-provider claim.
- The dataset is small: 7 live-quality, 18 recorded-containment, and 3 injected-failure cases.
- Dataset criteria are predeclared fixture oracles, not a general production action classifier.
- The local old-client/new-client criterion exists only to evaluate the recorded safe and whole-candidate fixtures.
- An official exact span containing command-like material can still fail the unchanged content guard.
- No controlled repository or VinGrade pipeline was run.
- No provider/model is requalified by this verdict.

## 13. Final Verdict

**`ADOPT_EXTRACTIVE_CONTRACT`**

The experimental path passes every predeclared safety and user-value gate, contains both known unsafe fixtures, removes the safe npm false rejection for the recorded case, retains all five supported actions, and requires no provider-specific behavior.

This verdict recommends the contract direction only. It does not mean production has changed, the existing provider is qualified, RR-02 is unblocked, or v0.5.0 is release-ready.

## 14. Next Implementation Task

Implement exactly one follow-up task: **GR-04 — Versioned Production Extractive Contract and Requalification Boundary**.

That task should version the production candidate schema, prompt, trust/generator identities, define the production action-eligibility boundary explicitly, preserve the public checklist artifact, and prepare a new offline qualification identity. It must not reuse the GR-03 verdict as real-provider qualification.
