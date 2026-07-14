# Changelog

## [0.2.0] - 2026-07-14

### Added

- Knowledge Manifest schema 1.0.0.
- Deterministic Project Manifest input loading and research planning.
- Lightweight filesystem Knowledge Store.
- npm-compatible Registry Adapter.
- PyPI Registry Adapter.
- Source Provenance Resolution.
- Bounded Knowledge Research orchestration.
- `upgradelens research` CLI command.
- Online, offline, stdout and custom-output research modes.
- Deterministic research IDs.
- Atomic Knowledge Manifest writing.
- CLI-owned HTTP runtime for deterministic network cleanup.

### Changed

- npm registry response limit is now 16 MiB.
- PyPI registry response limit is now 8 MiB.
- Package version updated to 0.2.0.

### Fixed

- Valid registry metadata larger than the former shared 1 MB limit is now supported.
- HTTP bodies, readers and timeout resources are cleaned up deterministically.
- Online research now exits naturally after completion.

### Known limitations

- Very large npm full packuments, such as the current Vite packument, may exceed the 16 MiB safety limit and be reported as unavailable.
- Private registries and authentication are not supported.
- Documentation and GitHub content are not fetched.
- Version comparison and breaking-change analysis belong to MVP-03 and later.