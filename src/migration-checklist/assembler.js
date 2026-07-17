import { canonicalJson } from '../canonical-json.js';
import { buildMigrationChecklist, validateMigrationChecklist } from './migration-checklist.js';

function inputError(message) {
  return new TypeError(`Migration Checklist assembly error: ${message}`);
}

/** Assemble normalized contexts plus versioned generator output through the MP-01 builder. */
export function assembleMigrationChecklist({
  prepared,
  generation,
  qualification,
  generatedAt
}) {
  if (!prepared?.input || !Array.isArray(prepared.eligibleContexts)
      || !Array.isArray(prepared.fallbackRecords)) {
    throw inputError('prepared MP-02 contexts are required.');
  }
  if (!generation?.input || !Array.isArray(generation.records)
      || !Array.isArray(generation.warnings)) {
    throw inputError('normalized MP-03 generation output is required.');
  }
  if (canonicalJson(prepared.input) !== canonicalJson(generation.input)) {
    throw inputError('MP-02 and MP-03 lineage inputs do not match.');
  }
  if (!qualification || !Array.isArray(qualification.limitations)) {
    throw inputError('a qualification guard result is required.');
  }
  const checklist = buildMigrationChecklist({
    input: prepared.input,
    repository: prepared.input.projectManifest.repository,
    dependencies: generation.records,
    limitations: qualification.limitations,
    generatedAt
  });
  return validateMigrationChecklist(checklist);
}
