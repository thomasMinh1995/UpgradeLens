# DepVerdict Technical Preview Feedback Guide

DepVerdict `0.6.0-alpha.1` is a Public Technical Preview / Alpha. It helps a
developer decide whether a dependency upgrade should proceed, why, and what
evidence or human review is still needed. It does not certify upgrade safety or
autonomously migrate source.

Install the preview explicitly:

```sh
npm install -g @thomasminh1995/depverdict@preview
depverdict --version
depverdict analyze . --offline
```

The npm registry also exposes this first published version through `latest`.
That registry behavior does not make the release production-stable; use
`@preview` when testing it.

## Questions we would most like answered

1. Is the Upgrade Decision understandable and actionable?
2. Does `INVESTIGATE` appear too often or too rarely?
3. Is the installed-version baseline correct for real monorepos/workspaces?
4. Is duplicate-occurrence selector guidance easy to copy and retry?
5. Are coverage limitations clear enough to prevent false confidence?
6. Does Migration Handoff reduce repeated research for developers/Coding Agents?
7. Are completion states and `--fail-on-incomplete` useful in CI?
8. Which generated artifact is most useful during code review?
9. Is offline/insufficient-data behavior honest and useful?
10. Which step caused the most onboarding friction?

We are not requesting feedback on autonomous source migration. DepVerdict
`0.6.0-alpha.1` does not provide or promise autonomous source migration, command
execution, dependency installation, or automatic approval.

## Where to send feedback

- Reproducible defect or onboarding failure:
  [bug report form](https://github.com/thomasMinh1995/DepVerdict/issues/new?template=bug_report.yml)
- Product, workflow, documentation, or UX idea:
  [feature request form](https://github.com/thomasMinh1995/DepVerdict/issues/new?template=feature_request.yml)
- Usage and support boundary:
  [Support policy](../../SUPPORT.md)
- Suspected vulnerability:
  [GitHub Private Vulnerability Reporting](https://github.com/thomasMinh1995/DepVerdict/security/advisories/new)
- Sensitive conduct concern:
  follow the private route in the [Code of Conduct](../../CODE_OF_CONDUCT.md)

Search existing issues before opening a new one. Security vulnerabilities and
sensitive conduct reports must not be submitted as public issues.

## Make a report useful and safe

Please include only sanitized information:

- DepVerdict version and installation method;
- Node.js, npm, operating system, and relevant ecosystem;
- whether the run was online or offline;
- exact command with secrets and private paths removed;
- completion state, decision, handoff status, and exit code;
- provider/runtime family and model only when relevant and safe to disclose;
- minimal public or synthetic reproduction;
- expected behavior and the smallest relevant artifact fragment.

Never post credentials, `.env` content, authorization headers, private source,
private package or repository names, complete `.depverdict/` or `.upgradelens/`
directories, raw provider requests/responses, personal data, or vulnerability
details.

Feedback from a small sanitized fixture is more actionable than a full private
repository. A report that exposes sensitive material should be removed from the
public route and re-created through the appropriate private channel.
