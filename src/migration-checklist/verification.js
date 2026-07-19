import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { canonicalJsonBytes } from '../canonical-json.js';
import { compareText, isPortableRelativePath } from '../portable.js';

export const MIGRATION_VERIFICATION_STATUSES = Object.freeze([
  'AVAILABLE',
  'VERIFICATION_COMMAND_UNAVAILABLE',
  'NOT_APPLICABLE'
]);

const SCRIPT_ROLES = Object.freeze({
  build: 'BUILD',
  check: 'CHECK',
  lint: 'LINT',
  test: 'TEST',
  typecheck: 'TYPECHECK'
});
const PACKAGE_MANAGER_COMMANDS = Object.freeze({
  bun: (name) => `bun run ${name}`,
  npm: (name) => `npm run ${name}`,
  pnpm: (name) => `pnpm run ${name}`,
  yarn: (name) => `yarn run ${name}`
});
const SAFE_SCRIPT_NAME = /^[A-Za-z0-9:_-]+$/;

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function commandId(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

function unavailable() {
  return {
    status: 'VERIFICATION_COMMAND_UNAVAILABLE',
    commands: [],
    limitation: {
      code: 'VERIFICATION_COMMAND_UNAVAILABLE',
      message: 'No supported project-derived verification command was found.'
    }
  };
}

function manifestPaths(project) {
  return [...new Set([
    ...project.manifests,
    ...project.dependencies.map((dependency) => dependency.manifest)
  ])].filter((value) => value.endsWith('package.json')).sort(compareText);
}

function commandRecords(project, sourcePath, sourceDigest, manifest) {
  const packageManager = project.packageManager?.name;
  const renderCommand = PACKAGE_MANAGER_COMMANDS[packageManager];
  if (!renderCommand || !manifest.scripts || typeof manifest.scripts !== 'object'
      || Array.isArray(manifest.scripts)) {
    return [];
  }
  const workingDirectory = project.path;
  return Object.entries(SCRIPT_ROLES)
    .filter(([scriptName]) => (
      SAFE_SCRIPT_NAME.test(scriptName)
      && typeof manifest.scripts[scriptName] === 'string'
      && manifest.scripts[scriptName].trim().length > 0
    ))
    .map(([scriptName, role]) => {
      const core = {
        role,
        command: renderCommand(scriptName),
        workingDirectory,
        source: {
          path: sourcePath,
          contentDigest: sourceDigest,
          scriptName,
          packageManager
        }
      };
      return { id: commandId(core), ...core };
    });
}

/**
 * Read only Project Manifest-declared Node package manifests and project safe
 * script keys. Script bodies are neither parsed nor copied into the handoff.
 */
export async function extractProjectVerification(repositoryRoot, projectManifest, {
  readArtifact = readFile
} = {}) {
  const byProject = new Map();
  for (const project of projectManifest.projects) {
    const commands = [];
    if (project.ecosystem === 'node' && typeof repositoryRoot === 'string') {
      for (const sourcePath of manifestPaths(project)) {
        if (!isPortableRelativePath(sourcePath)) continue;
        let bytes;
        try {
          bytes = await readArtifact(path.resolve(repositoryRoot, sourcePath));
        } catch {
          continue;
        }
        let manifest;
        try {
          manifest = JSON.parse(Buffer.from(bytes).toString('utf8'));
        } catch {
          continue;
        }
        commands.push(...commandRecords(
          project,
          sourcePath,
          digest(Buffer.from(bytes)),
          manifest
        ));
      }
    }
    const unique = new Map(commands.map((command) => [command.id, command]));
    const normalized = [...unique.values()].sort((left, right) => (
      compareText(left.role, right.role)
      || compareText(left.workingDirectory, right.workingDirectory)
      || compareText(left.command, right.command)
      || compareText(left.id, right.id)
    ));
    byProject.set(project.id, normalized.length > 0
      ? { status: 'AVAILABLE', commands: normalized, limitation: null }
      : unavailable());
  }
  return byProject;
}

export function unavailableProjectVerification() {
  return unavailable();
}
