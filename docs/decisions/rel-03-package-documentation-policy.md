# REL-03 package documentation policy

Status: `ACCEPTED`

Decision date: 2026-07-20

## Context

The `0.6.0-alpha.1` published artifact contained 252 files. REL-02 added a
consumer feedback guide, a maintainer review, and an announcement draft. Because
`package.json.files` included all of `docs`, the development tarball increased to
255 files even though two of those documents are repository operations rather
than installed-product help.

Broad documentation inclusion also made future package composition depend on
where maintainers happened to write a report. Capture directories had a
fail-closed exclusion, but maintainer reviews and promotional copy did not.

## Decision

DepVerdict assigns every document one of these categories:

1. `runtime-required` — required for runtime, schema, dataset, or API behavior;
2. `user-operational` — useful to an installed-package consumer without GitHub;
3. `trust/provenance-evidence` — stable evidence needed to interpret shipped
   behavior or package identity;
4. `maintainer-review` — readiness, rerun, release-gate, and operational reports;
5. `announcement/promotional` — launch and community promotional copy;
6. `capture/private/transient` — screenshots, transcripts, environment data,
   secrets, local output, and temporary artifacts.

The npm policy is:

| Category | Distribution |
| --- | --- |
| Runtime-required | Required |
| User-operational | Included when current, portable, and sanitized |
| Trust/provenance evidence | Selectively included and allowlisted as required when critical |
| Maintainer review | Repository-only in `docs/reviews/**` |
| Announcement/promotional | Repository-only in `docs/announcements/**` |
| Capture/private/transient | Forbidden |

For the three REL-02 documents:

| Document | Category | Decision |
| --- | --- | --- |
| `docs/community/technical-preview-feedback-guide.md` | User-operational | Keep package-visible and require it |
| `docs/reviews/rel-02-post-release-verification-feedback-readiness.md` | Maintainer review | Exclude |
| `docs/announcements/v0.6.0-alpha.1-technical-preview.md` | Announcement/promotional | Exclude |

The two REL-03 ADRs are stable trust/provenance evidence and remain
package-visible. The REL-03 implementation report is a maintainer review and is
excluded.

## Enforcement

`package.json.files` retains the broad documentation source but excludes:

```text
!docs/reviews/**
!docs/announcements/**
!docs/*-cli-captures
```

The package guard independently rejects review and announcement prefixes even if
the manifest regresses. It continues to reject captures, qualification records,
credentials, environment files, local runtime output, archives, and suspicious
implementation copies.

The required-asset list remains at 32. Three previously required maintainer
reviews are replaced by:

- the Technical Preview feedback guide;
- this package documentation policy;
- the packaged qualification evidence decision.

Runtime, executable, schema, dataset, release, compatibility, and
qualification-resolution assets remain required.

## Historical layout

Existing technical studies at the root of `docs/` are not moved or relabeled in
REL-03. They are treated as bounded historical trust/provenance records for the
current preview. New maintainer reviews and announcements must use their category
directories so policy remains deterministic without erasing historical identity.

## Consequences

- Installed users retain the short feedback and trust guidance needed offline.
- Maintainer evidence and promotional copy no longer inflate future npm packages.
- Package guard failure is deterministic if an excluded category leaks.
- The already published `0.6.0-alpha.1` artifact remains immutable.
- Moving or reclassifying historical root documents requires a separate decision.
