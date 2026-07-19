import {
  DEFAULT_MIGRATION_PLANNING_QUALIFICATION_PATH
} from '../constants.js';
import {
  createMigrationQualificationSourceFailureDecision,
  decideMigrationQualification
} from './qualification-guard.js';
import {
  buildMigrationPlanningQualificationRecord,
  loadMigrationPlanningQualificationRecord
} from './qualification-store.js';

function sourceErrorDetails(error, explicitPath) {
  if (error?.code === 'MIGRATION_QUALIFICATION_RECORD_MISSING') {
    return {
      status: 'MISSING',
      reasonCode: explicitPath
        ? 'MIGRATION_QUALIFICATION_EXPLICIT_SOURCE_MISSING'
        : 'MIGRATION_QUALIFICATION_RECORD_MISSING',
      limitationCode: explicitPath
        ? 'MIGRATION_QUALIFICATION_EXPLICIT_SOURCE_MISSING'
        : 'MIGRATION_PROVIDER_NOT_QUALIFIED',
      limitationMessage: explicitPath
        ? 'The explicitly selected Migration Planning qualification record was not found.'
        : 'The default Migration Planning qualification record was not found.',
      nextAction: 'INSTALL_QUALIFICATION_RECORD'
    };
  }
  return {
    status: 'CORRUPTED',
    reasonCode: error?.code ?? 'MIGRATION_QUALIFICATION_RECORD_INVALID',
    limitationCode: error?.code ?? 'MIGRATION_QUALIFICATION_RECORD_INVALID',
    limitationMessage: 'The selected Migration Planning qualification record failed strict validation.',
    nextAction: 'REPLACE_QUALIFICATION_RECORD'
  };
}

/**
 * Deterministic precedence: injected qualification > explicit path > project-local default > missing.
 * Exactly one source is selected and validated; invalid explicit sources never fall back.
 */
export async function resolveMigrationQualification({
  repositoryRoot,
  runtimeMetadata,
  allowExperimental = false,
  qualification,
  qualificationPath,
  loadRecord = loadMigrationPlanningQualificationRecord
}) {
  if (qualification !== undefined) {
    try {
      const record = buildMigrationPlanningQualificationRecord(qualification);
      return decideMigrationQualification({
        qualification: record.qualification,
        runtimeMetadata,
        allowExperimental,
        sourceKind: 'injected',
        sourcePath: null
      });
    } catch (error) {
      const details = sourceErrorDetails(error, true);
      return createMigrationQualificationSourceFailureDecision({
        ...details,
        runtimeMetadata,
        sourceKind: 'injected',
        sourcePath: null
      });
    }
  }

  const explicitPath = qualificationPath !== undefined;
  const artifactPath = qualificationPath ?? DEFAULT_MIGRATION_PLANNING_QUALIFICATION_PATH;
  let record;
  try {
    record = await loadRecord(repositoryRoot, { artifactPath });
  } catch (error) {
    if (!explicitPath && error?.code === 'MIGRATION_QUALIFICATION_RECORD_MISSING') {
      return decideMigrationQualification({
        qualification: null,
        runtimeMetadata,
        allowExperimental,
        sourceKind: 'defaultPath',
        sourcePath: artifactPath
      });
    }
    const details = sourceErrorDetails(error, explicitPath);
    return createMigrationQualificationSourceFailureDecision({
      ...details,
      runtimeMetadata,
      sourceKind: explicitPath ? 'explicitPath' : 'defaultPath',
      sourcePath: artifactPath
    });
  }

  return decideMigrationQualification({
    qualification: record.qualification,
    runtimeMetadata,
    allowExperimental,
    sourceKind: explicitPath ? 'explicitPath' : 'defaultPath',
    sourcePath: artifactPath
  });
}
