import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_IGNORED_DIRECTORIES } from '../constants.js';
import { relativePath } from '../files.js';

export async function collectUsageSourceFiles(root, extensions, options = {}) {
  const supportedExtensions = new Set(extensions.map((extension) => extension.toLowerCase()));
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const files = [];
  const warnings = [];

  async function visit(directory, depth) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      warnings.push({
        code: 'DIRECTORY_UNREADABLE',
        path: relativePath(root, directory),
        message: `Unable to read directory (${error.code ?? 'unknown error'}).`
      });
      return;
    }

    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (depth < maxDepth && !DEFAULT_IGNORED_DIRECTORIES.has(entry.name)) {
          await visit(entryPath, depth + 1);
        }
      } else if (entry.isFile() && supportedExtensions.has(path.extname(entry.name).toLowerCase())) {
        files.push(entryPath);
      }
    }
  }

  await visit(root, 0);
  return { files, warnings };
}

export const collectRepositorySourceFiles = collectUsageSourceFiles;
