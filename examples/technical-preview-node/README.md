# Technical Preview Node sample

This public-safe sample gives UpgradeLens one ordinary Node dependency occurrence:

- `package.json` declares exact `fast-deep-equal@3.1.3`;
- `package-lock.json` records the installed `3.1.3` baseline;
- `src/index.js` contains a real default import and usage;
- the package is marked `private` and contains no credential, provider
  configuration, cached evidence, qualification record, or intentional
  vulnerability.

From the UpgradeLens repository root, first inspect deterministic discovery without
a provider or network request:

```sh
upgradelens discover examples/technical-preview-node --stdout
```

Then exercise the honest zero-secret offline workflow:

```sh
upgradelens analyze examples/technical-preview-node --offline --stdout
```

The discovery output should contain one Node project, one
`fast-deep-equal` dependency occurrence, and installed version `3.1.3`. With no
fresh local knowledge cache, offline analysis cannot discover a registry target or
target-scoped release evidence. The expected completion is therefore
`INSUFFICIENT_DATA` with a visible limitation, not an upgrade recommendation.
This is the intended fail-closed result.

To evaluate online analysis, configure a provider as documented in the root
README and rerun without `--offline`. A registry candidate remains discovery data,
not permission or a recommendation to upgrade. Do not add credentials or generated
`.upgradelens/` artifacts to this sample.

The sample is source-repository onboarding material and is intentionally excluded
from the npm tarball. It is not a nested package intended for publication.
