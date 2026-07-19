# UpgradeLens Support

## Preview support boundary

UpgradeLens is a Public Technical Preview / Alpha. Community support is best effort;
there is no production support or response SLA. Maintainers do not guarantee an
upgrade or migration outcome, and UpgradeLens is not a substitute for developer,
security, or Coding Agent review.

The CLI produces evidence-bounded decisions and an optional experimental,
human-reviewed Migration Checklist. It does not install dependencies, modify source,
execute suggested commands, or autonomously migrate a repository.

## Choose the right route

| Request | Route |
| --- | --- |
| Reproducible UpgradeLens bug | Use the GitHub bug report form |
| Feature or product feedback | Use the GitHub feature request form |
| Usage question | Read the [README](README.md) and search issues; there is no dedicated Discussions/support channel yet |
| Security vulnerability | Use GitHub Private Vulnerability Reporting through [SECURITY.md](SECURITY.md); never disclose sensitive details in a public issue |
| Conduct concern | Use the private conduct email in [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md); do not post sensitive details publicly |
| Provider outage, account, quota, or billing | Contact the provider unless UpgradeLens itself mishandles the condition |
| Private repository debugging | Reduce to a synthetic/public fixture; do not post proprietary source or secrets |

See [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a code or documentation
change.

## Creating a useful reproduction

Prefer a minimal public repository or synthetic fixture that preserves only the
relevant ecosystem and project shape. Replace organization, package, repository,
path, and provider identifiers. Include:

- operating system;
- Node.js and npm versions;
- UpgradeLens version or commit and installation method;
- sanitized repository shape and ecosystem;
- exact command with secrets and private paths removed;
- completion state and exit code;
- expected and actual behavior;
- the smallest sanitized error or artifact fragment needed to demonstrate the
  issue.

Do not upload an entire proprietary repository or `.upgradelens/` directory.

## Never post publicly

- API keys, tokens, authorization headers, cookies, or `.env` content;
- private repository source or internal package names;
- raw provider requests/responses or billing/account data;
- complete artifacts containing private repository metadata;
- personal data or vulnerability exploit details.

## Unsupported and best-effort scope

Detector presence does not imply full ecosystem support. Current source-usage
analysis is JavaScript/TypeScript-focused; installed-version resolution and version
comparison vary by ecosystem. pnpm, Yarn, Python environment/lockfile resolution,
and many detected ecosystems remain limited or unsupported. Missing coverage fails
closed and is not evidence that a dependency is unused or unaffected.

See the [supported scope in the README](README.md#supported-scope-and-limitations)
for the current product boundary.
