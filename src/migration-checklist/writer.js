import path from 'node:path';

import { DEFAULT_MIGRATION_CHECKLIST_PATH } from '../constants.js';
import { writeTextArtifact } from '../orchestration/text-writer.js';
import { isPortableRelativePath } from '../portable.js';
import { serializeMigrationChecklist, validateMigrationChecklist } from './migration-checklist.js';

export class MigrationChecklistWriterError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'MigrationChecklistWriterError';
    this.code = 'MIGRATION_CHECKLIST_WRITE_FAILED';
  }
}

/** Validate first, then atomically publish deterministic bytes and return a portable path. */
export async function writeMigrationChecklist(repositoryRoot, checklist, {
  artifactPath = DEFAULT_MIGRATION_CHECKLIST_PATH,
  writeArtifact = writeTextArtifact
} = {}) {
  if (!isPortableRelativePath(artifactPath)) {
    throw new TypeError('Migration Checklist artifact path must be portable and repository-relative.');
  }
  validateMigrationChecklist(checklist);
  const contents = serializeMigrationChecklist(checklist);
  try {
    await writeArtifact(path.resolve(repositoryRoot, artifactPath), contents);
  } catch (cause) {
    throw new MigrationChecklistWriterError(
      `Unable to write Migration Checklist artifact ${artifactPath}.`,
      cause
    );
  }
  return artifactPath.split(path.sep).join('/');
}
