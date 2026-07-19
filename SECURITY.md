# Security Policy

## Supported versions

UpgradeLens is currently a Public Technical Preview / Alpha. Security fixes are
evaluated for the latest repository state and most recent preview release on a
best-effort basis. There is no long-term maintenance matrix or production security
SLA.

## Reporting a vulnerability

Do **not** put vulnerability details, exploit steps, credentials, private source, or
provider payloads in a public issue.

Use
[GitHub Private Vulnerability Reporting](https://github.com/thomasMinh1995/UpgradeLens/security/advisories/new)
for suspected vulnerabilities. This creates a private report for the repository
maintainer. Do not open a public issue first.

## What to include privately

Include only what is needed:

- affected UpgradeLens version or commit;
- affected component and minimal sanitized reproduction;
- security impact and preconditions;
- whether credentials, private source, personal data, or provider data may be
  involved;
- sanitized logs with tokens, local paths, private identifiers, and proprietary
  content removed;
- a suggested mitigation, if known.

## Never include

Do not send or publish:

- API keys, tokens, authorization headers, cookies, or `.env` content;
- unnecessary private repository source;
- raw provider requests or responses containing proprietary code;
- personal data;
- full private `.upgradelens/` artifacts;
- exploit details in a public issue.

## Relevant threat areas

Security reports may concern:

- credential leakage or provider-data exposure;
- unintended npm tarball content;
- path traversal or unsafe artifact writing;
- malicious or untrusted repository content;
- prompt injection or evidence manipulation;
- schema, lineage, identity, or tamper-check bypass;
- regression of the no-command-execution or no-source-modification boundary;
- dependency and supply-chain issues.

UpgradeLens analyzes upgrade evidence; it is not a security scanner and does not
guarantee that an upgrade is safe.

## Response expectations

There is no response-time commitment during the preview. The intended best-effort
process is:

```text
acknowledge → reproduce and triage → coordinate a fix → disclose after mitigation
```

Disclosure timing should protect users and private data and should be coordinated
after a mitigation is available.
