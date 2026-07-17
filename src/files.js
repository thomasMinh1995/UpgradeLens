import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_IGNORED_DIRECTORIES } from './constants.js';

const EXACT_CANDIDATES = new Set([
  'Gemfile',
  'app.json',
  'build.gradle',
  'build.gradle.kts',
  'composer.json',
  'Cargo.toml',
  'go.mod',
  'package.json',
  'pnpm-workspace.yaml',
  'pom.xml',
  'pyproject.toml',
  'requirements.txt',
  'settings.gradle',
  'settings.gradle.kts'
]);

const CANDIDATE_EXTENSIONS = ['.csproj', '.fsproj', '.vbproj', '.sln'];

export function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

export function relativePath(root, target) {
  const relative = toPosixPath(path.relative(root, target));
  return relative || '.';
}

function isCandidate(name) {
  return EXACT_CANDIDATES.has(name) || CANDIDATE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

export async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

export async function collectCandidateFiles(root, options = {}) {
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const cooperativeScheduler = options.cooperativeScheduler;
  const files = [];
  const warnings = [];

  async function visit(directory, depth) {
    cooperativeScheduler?.checkpoint();
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      warnings.push({
        code: 'DIRECTORY_UNREADABLE',
        path: relativePath(root, directory),
        message: `Unable to read directory (${error.code ?? 'unknown error'})`
      });
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      try {
        if (entry.isSymbolicLink()) continue;

        if (entry.isDirectory()) {
          if (depth < maxDepth && !DEFAULT_IGNORED_DIRECTORIES.has(entry.name)) {
            await visit(entryPath, depth + 1);
          }
          continue;
        }

        if (entry.isFile() && isCandidate(entry.name)) files.push(entryPath);
      } finally {
        await cooperativeScheduler?.boundary();
      }
    }
  }

  await visit(root, 0);
  return { files, warnings };
}
