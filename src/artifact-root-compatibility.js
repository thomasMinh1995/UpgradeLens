import { access } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_OUTPUT_DIRECTORY } from './constants.js';
import { isPortableRelativePath } from './portable.js';

export const LEGACY_OUTPUT_DIRECTORY = '.upgradelens';

export class ArtifactRootConflictError extends Error {
  constructor() {
    super(
      'Artifact root conflict: the required input chain is partial or split between '
      + `${DEFAULT_OUTPUT_DIRECTORY}/ and ${LEGACY_OUTPUT_DIRECTORY}/.`
    );
    this.name = 'ArtifactRootConflictError';
    this.code = 'ARTIFACT_ROOT_CONFLICT';
  }
}

export function legacyArtifactPath(canonicalArtifact) {
  const prefix = `${DEFAULT_OUTPUT_DIRECTORY}/`;
  if (!isPortableRelativePath(canonicalArtifact) || !canonicalArtifact.startsWith(prefix)) {
    throw new TypeError(
      `Canonical artifact must be below ${DEFAULT_OUTPUT_DIRECTORY}/.`
    );
  }
  return `${LEGACY_OUTPUT_DIRECTORY}/${canonicalArtifact.slice(prefix.length)}`;
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return false;
    throw error;
  }
}

/**
 * Select one complete persisted artifact root. No returned chain ever mixes the
 * canonical and legacy directories.
 */
export async function resolveArtifactRootChain(
  repositoryRoot,
  canonicalArtifacts,
  options = {}
) {
  if (!Array.isArray(canonicalArtifacts) || canonicalArtifacts.length === 0) {
    throw new TypeError('canonicalArtifacts must be a non-empty array.');
  }
  const canonical = [...canonicalArtifacts];
  const legacy = canonical.map(legacyArtifactPath);
  const [canonicalState, legacyState] = await Promise.all([
    Promise.all(canonical.map((artifact) => exists(path.resolve(repositoryRoot, artifact)))),
    Promise.all(legacy.map((artifact) => exists(path.resolve(repositoryRoot, artifact))))
  ]);
  const canonicalAll = canonicalState.every(Boolean);
  const canonicalAny = canonicalState.some(Boolean);
  const legacyAll = legacyState.every(Boolean);
  const legacyAny = legacyState.some(Boolean);

  if (canonicalAll) {
    if (legacyAny) {
      options.onDiagnostic?.(
        `LEGACY_ARTIFACT_ROOT_IGNORED: using complete ${DEFAULT_OUTPUT_DIRECTORY}/ input chain.`
      );
    }
    return Object.freeze({
      root: DEFAULT_OUTPUT_DIRECTORY,
      artifacts: Object.freeze(canonical)
    });
  }

  if (!canonicalAny && legacyAll) {
    options.onDiagnostic?.(
      `LEGACY_ARTIFACT_ROOT_USED: using complete deprecated ${LEGACY_OUTPUT_DIRECTORY}/ input chain.`
    );
    return Object.freeze({
      root: LEGACY_OUTPUT_DIRECTORY,
      artifacts: Object.freeze(legacy)
    });
  }

  if (canonicalAny || legacyAny) throw new ArtifactRootConflictError();

  return Object.freeze({
    root: DEFAULT_OUTPUT_DIRECTORY,
    artifacts: Object.freeze(canonical)
  });
}
