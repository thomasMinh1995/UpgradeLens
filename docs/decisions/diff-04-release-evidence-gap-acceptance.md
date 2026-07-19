# DIFF-04 — Historical release evidence-gap acceptance

- Status: `ACCEPTED`
- Scope: one-time UpgradeLens-to-DepVerdict GitHub Release presentation repair
- Baseline collected: 2026-07-19T10:42:43Z
- Maintainer approval recorded: 2026-07-19T11:18:54Z
- Canonical repository: `thomasMinh1995/DepVerdict`

## Decision boundary

A complete release-ID, state, timestamp, and asset inventory was not retained
before the repository rename and release-title edits. That missing before-state
cannot be recreated retrospectively and must not be described as proven.

The retained evidence and current read-only checks support a bounded repair:

- all five annotated remote tag objects and peeled commits match local refs;
- the retained DIFF-01 snapshot independently proves continuity for the
  `v0.5.0` tag object and peeled commit;
- the retained DIFF-01 snapshot and current API agree on the `v0.5.0` published
  timestamp and non-draft/non-prerelease state;
- all five current releases have zero assets;
- no evidence reviewed conflicts with the current tags or release targets.

This record does **not** claim that assets never existed, never changed, or were
never removed. It does **not** prove before-state release IDs, titles, bodies,
states, timestamps, or assets where no retained evidence exists.

## Invariant classification

| Invariant | Classification | Evidence |
| --- | --- | --- |
| `v0.5.0` tag object and peeled target continuity | `PROVEN` | DIFF-01 retained object `4750606ca85f990ee69d60ab4673caca5fbfb89b` and target `74d57344db254d0109ea951dc7c44853cdad9be0`; current local and remote refs match. |
| `v0.1.1`–`v0.4.0` current tag objects and peeled targets | `SUPPORTED_BY_CURRENT_STATE_ONLY` | Current local and remote refs match; no complete retained pre-rename ref inventory was found. |
| `v0.5.0` published timestamp and draft/prerelease state | `PROVEN` | DIFF-01 and current GitHub API agree on `2026-07-19T02:56:50Z`, draft false, prerelease false. |
| Earlier release IDs/states/timestamps before rename | `UNKNOWN_BEFORE_STATE` | Current API supplies values, but no complete retained before-state inventory was found. |
| Release asset state before rename | `UNKNOWN_BEFORE_STATE` | No retained asset IDs, names, sizes, digests, or explicit zero-asset inventory was found. |
| Current absence of release assets | `SUPPORTED_BY_CURRENT_STATE_ONLY` | Current GitHub API reports zero assets for all five releases. |
| Conflicting tag/target/asset evidence | `SUPPORTED_BY_CURRENT_STATE_ONLY` | No conflict was found in retained records, Git history, current refs, or current API state. |

## Maintainer acceptance

The maintainer explicitly accepted both the five-release metadata plan and this
bounded evidence-gap statement in the DIFF-04-FIX Codex task. Approval covered
only the approved titles and bodies. No credential was included in or retained by
the approval record.

## Pre-edit release baseline

This table is the mandatory baseline for all future release mutations. API
`target_commitish` currently reports `main`; the immutable target values below are
the peeled Git tag commits.

| ID | Tag | Tag object | Peeled commit | Draft / prerelease | Created / published / updated (UTC) | Assets |
| ---: | --- | --- | --- | --- | --- | ---: |
| `353312307` | `v0.1.1` | `5716a6f8d00119d106487830c37b37957b171919` | `95cd3025c27d2c4d8e97f711625541ee0da7dbc0` | false / false | `2026-07-13T17:10:16Z` / `17:16:09Z` / `2026-07-19T10:08:01Z` | 0 |
| `353747096` | `v0.2.0` | `2b82aae4ce49184175c2eb13a421610ca1c31a9a` | `411c9e6216d9476b48d72311c9163b2a563d1e60` | false / false | `2026-07-14T11:12:11Z` / `11:22:02Z` / `2026-07-19T10:08:52Z` | 0 |
| `354822066` | `v0.3.0` | `4849f78a594f468cdcfa45151498168869685a55` | `8fea8ec5b06dd6c85a0f600be1d566d65ef2c7a2` | false / false | `2026-07-16T01:40:55Z` / `01:43:27Z` / `2026-07-19T10:09:10Z` | 0 |
| `355150303` | `v0.4.0` | `6c7983000468d53704eeaf00bb9dd98c6d2e638a` | `734be0b9395b0bd74454badc010e4df237319cc3` | false / false | `2026-07-16T14:33:06Z` / `14:35:09Z` / `2026-07-19T10:09:31Z` | 0 |
| `356244177` | `v0.5.0` | `4750606ca85f990ee69d60ab4673caca5fbfb89b` | `74d57344db254d0109ea951dc7c44853cdad9be0` | false / false | `2026-07-19T02:55:33Z` / `02:56:50Z` / `2026-07-19T09:43:20Z` | 0 |

## Exact approved-operation candidate

Every body receives this exact prefix:

```markdown
> **Project rename:** This release was originally published under the
> **UpgradeLens** name. The project is now **DepVerdict**:
> https://github.com/thomasMinh1995/DepVerdict
>
> This historical release remains associated with its original tag and commit.
```

After the prefix and one blank line, the current body is preserved with each
body-local `DepVerdict` product-name token changed to `UpgradeLens`. No claim,
section, tag, target, state, timestamp, or asset is otherwise changed.

| ID / tag | Before title | Approved candidate title | Before body SHA-256 / bytes | Candidate body SHA-256 / bytes | Product-name replacements |
| --- | --- | --- | --- | --- | ---: |
| `353312307` / `v0.1.1` | `DepVerdict v0.1.1 — MVP-01 Project Discovery Foundation` | `UpgradeLens v0.1.1 — MVP-01 Project Discovery Foundation` | `72c80ae81fe4432ae5c5c19f5a88db7ed3ce114a879e763bb628c2758b0025dd` / 1963 | `17c9f1ece26eb1f6af20fb438b800d0cd74f3117aea979566ebb5b16b11c28e1` / 2227 | 6 |
| `353747096` / `v0.2.0` | `DepVerdict v0.2.0 — Knowledge Research` | `UpgradeLens v0.2.0 — Knowledge Research` | `357a718be404db84510663d485a59d95a9670028f2be77b60de9900e6ecc3080` / 4319 | `32af0823ca8199a5c041b48ceb4b126d9a0cdec369128463f4da5e9d2d560411` / 4588 | 11 |
| `354822066` / `v0.3.0` | `DepVerdict v0.3.0 — AI Version Analysis` | `UpgradeLens v0.3.0 — AI Version Analysis` | `6efaeca1fa7b38601e3cb1d1eee984740b36f7ae2da06093fb211f7815da2bfc` / 565 | `8b264cb667a555c392f9e688e49fbf91e8145beec19ef76d2b4edb5c1eef7262` / 823 | 0 |
| `355150303` / `v0.4.0` | `DepVerdict v0.4.0 — Repository Impact Analytics` | `UpgradeLens v0.4.0 — Repository Impact Analytics` | `83a35b7972090f6d0e6a54db6026b605875430109071d3be56d8ef8aa89cd0a5` / 1075 | `b71c108f31b1cb31d331cb89bda5fd5aec8fa63ca857d3b86825cd69c3383ff3` / 1335 | 2 |
| `356244177` / `v0.5.0` | `DepVerdict v0.5.0 — Evidence-Bounded Migration Planning` | `UpgradeLens v0.5.0 — Evidence-Bounded Migration Planning` | `e06386beb973627f65ab9190415eff7577e3da6f986e370eac96f68e2e0a2f44` / 731 | `0d556e775bff4c27e16b0090b1203d4d09567d0c3e3d8b28ce353cee16e54eba` / 990 | 1 |

The maintainer approved these five release IDs, titles, body transformation, and
the bounded evidence-gap statement. All five approved edits completed.

## Post-edit release baseline

Read-only GitHub API and remote-ref verification completed after the approved
edits. Release ID, tag, `target_commitish`, annotated tag object, peeled commit,
draft/prerelease state, created/published timestamps, and asset arrays are
unchanged. GitHub changed the API-managed `updated_at` timestamp when each
title/body changed; that field was not supplied in any PATCH payload.

| ID / tag | Current title | Body SHA-256 | Updated at (UTC) | Assets |
| --- | --- | --- | --- | ---: |
| `353312307` / `v0.1.1` | `UpgradeLens v0.1.1 — MVP-01 Project Discovery Foundation` | `17c9f1ece26eb1f6af20fb438b800d0cd74f3117aea979566ebb5b16b11c28e1` | `2026-07-19T11:17:07Z` | 0 |
| `353747096` / `v0.2.0` | `UpgradeLens v0.2.0 — Knowledge Research` | `32af0823ca8199a5c041b48ceb4b126d9a0cdec369128463f4da5e9d2d560411` | `2026-07-19T11:17:46Z` | 0 |
| `354822066` / `v0.3.0` | `UpgradeLens v0.3.0 — AI Version Analysis` | `8b264cb667a555c392f9e688e49fbf91e8145beec19ef76d2b4edb5c1eef7262` | `2026-07-19T11:17:47Z` | 0 |
| `355150303` / `v0.4.0` | `UpgradeLens v0.4.0 — Repository Impact Analytics` | `b71c108f31b1cb31d331cb89bda5fd5aec8fa63ca857d3b86825cd69c3383ff3` | `2026-07-19T11:17:48Z` | 0 |
| `356244177` / `v0.5.0` | `UpgradeLens v0.5.0 — Evidence-Bounded Migration Planning` | `0d556e775bff4c27e16b0090b1203d4d09567d0c3e3d8b28ce353cee16e54eba` | `2026-07-19T11:17:48Z` | 0 |

## Future mutation rule

Before every future GitHub Release mutation, capture release ID, tag, tag object,
peeled target, title/body digest, draft/prerelease state, timestamps, and complete
asset ID/name/size/digest inventory. After the mutation, recapture and compare the
same fields. Unexpected changes fail closed.
