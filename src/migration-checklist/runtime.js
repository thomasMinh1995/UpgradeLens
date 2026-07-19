import { DEFAULT_MIGRATION_CHECKLIST_PATH } from '../constants.js';
import { assembleMigrationChecklist } from './assembler.js';
import { prepareMigrationChecklistContexts } from './context-runtime.js';
import { generateMigrationExtractiveChecklistDrafts } from './generator.js';
import { buildMigrationChecklistViewModel } from './presentation.js';
import {
  decideMigrationQualification,
  migrationQualificationErrorForDecision
} from './qualification-guard.js';
import { writeMigrationChecklist } from './writer.js';

export const MIGRATION_CHECKLIST_STAGE_ID = 'migrationChecklist';
export const MIGRATION_CHECKLIST_STAGE_LABEL = 'Migration Checklist';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function emit(listener, event) {
  if (!listener) return;
  try {
    if (typeof listener === 'function') listener(deepFreeze(structuredClone(event)));
    else listener.handle?.(deepFreeze(structuredClone(event)));
  } catch {
    // Operational presentation cannot affect business output.
  }
}

function failureCode(error) {
  if (typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(error.code)) return error.code;
  if (/lineage/i.test(error?.message ?? '')) return 'LINEAGE_INVALID';
  if (/schema|validation/i.test(error?.message ?? '')) return 'ARTIFACT_VALIDATION_FAILED';
  return 'MIGRATION_CHECKLIST_STAGE_FAILED';
}

function eventTypeForResult(event) {
  if (event.outcome === 'generated') return 'migration:context-complete';
  if (event.outcome === 'abstained') return 'migration:abstained';
  if (event.reasonCode === 'TRUST_VALIDATION_REJECTED') return 'migration:trust-rejected';
  return 'migration:fallback';
}

function throwIfCancelled(signal) {
  if (!signal?.aborted) return;
  const error = new Error('Migration Checklist stage was cancelled.', { cause: signal.reason });
  error.code = 'ANALYSIS_CANCELLED';
  throw error;
}

/**
 * Experimental application stage: validated artifacts + Upgrade Decision -> MP-02 ->
 * v2 guard -> extractive generator -> MP-01 assembly -> atomic artifact -> presentation view model.
 */
export async function runMigrationChecklistStage({
  repositoryRoot,
  aiRuntime,
  createAiRuntime,
  runtimeMetadata,
  qualification = null,
  qualificationDecision = null,
  allowExperimental = false,
  generatedAt,
  artifactPath = DEFAULT_MIGRATION_CHECKLIST_PATH,
  onCompatibilityDiagnostic,
  onEvent,
  signal,
  prepareContexts = prepareMigrationChecklistContexts,
  generateDrafts = generateMigrationExtractiveChecklistDrafts,
  assemble = assembleMigrationChecklist,
  writeArtifact = writeMigrationChecklist
}) {
  let total = 0;
  let processed = 0;
  let qualificationResult;
  try {
    throwIfCancelled(signal);
    qualificationResult = qualificationDecision ?? await decideMigrationQualification({
      qualification,
      runtimeMetadata,
      allowExperimental,
      sourceKind: qualification ? 'injected' : 'none'
    });
    if (!qualificationResult.executionAllowed) {
      throw migrationQualificationErrorForDecision(qualificationResult);
    }
    throwIfCancelled(signal);
    const prepared = await prepareContexts(repositoryRoot, {
      onCompatibilityDiagnostic
    });
    throwIfCancelled(signal);
    total = prepared.eligibleContexts.length;
    emit(onEvent, {
      type: 'stage:start',
      stageId: MIGRATION_CHECKLIST_STAGE_ID,
      total,
      qualificationStatus: qualificationResult.status,
      qualificationId: qualificationResult.qualificationId,
      experimentalOverrideUsed: qualificationResult.experimentalOverrideUsed
    });
    emit(onEvent, {
      type: 'stage:progress',
      stageId: MIGRATION_CHECKLIST_STAGE_ID,
      processed,
      total,
      qualificationStatus: qualificationResult.status,
      qualificationId: qualificationResult.qualificationId,
      experimentalOverrideUsed: qualificationResult.experimentalOverrideUsed
    });
    const activeRuntime = aiRuntime ?? (total > 0 ? createAiRuntime?.() : {
      async generateStructured() {
        throw new Error('No eligible migration context should invoke the AI runtime.');
      }
    });
    const generation = await generateDrafts(prepared, {
      aiRuntime: activeRuntime,
      signal,
      onContextEvent(event) {
        if (event.phase === 'start') {
          emit(onEvent, {
            type: 'migration:context-start',
            stageId: MIGRATION_CHECKLIST_STAGE_ID,
            packageName: event.packageName,
            processed,
            total
          });
          return;
        }
        processed += 1;
        emit(onEvent, {
          type: eventTypeForResult(event),
          stageId: MIGRATION_CHECKLIST_STAGE_ID,
          packageName: event.packageName,
          processed,
          total,
          outcome: event.outcome,
          reasonCode: event.reasonCode,
          detailCode: event.detailCode
        });
        emit(onEvent, {
          type: 'stage:progress',
          stageId: MIGRATION_CHECKLIST_STAGE_ID,
          processed,
          total,
          qualificationStatus: qualificationResult.status,
          qualificationId: qualificationResult.qualificationId,
          experimentalOverrideUsed: qualificationResult.experimentalOverrideUsed
        });
      }
    });
    throwIfCancelled(signal);
    const checklist = assemble({
      prepared,
      generation,
      qualification: qualificationResult,
      generatedAt
    });
    throwIfCancelled(signal);
    const outputPath = await writeArtifact(repositoryRoot, checklist, { artifactPath });
    emit(onEvent, {
      type: 'migration:artifact-written',
      stageId: MIGRATION_CHECKLIST_STAGE_ID,
      artifactPath: outputPath
    });
    const viewModel = buildMigrationChecklistViewModel(checklist, {
      qualificationDecision: qualificationResult
    });
    emit(onEvent, {
      type: 'stage:complete',
      stageId: MIGRATION_CHECKLIST_STAGE_ID,
      processed,
      total,
      generated: generation.summary.generated,
      abstained: generation.summary.abstained,
      rejected: generation.summary.rejected,
      failed: generation.summary.failed,
      limitationCount: checklist.summary.limitationCount,
      qualificationStatus: qualificationResult.status,
      qualificationId: qualificationResult.qualificationId,
      experimentalOverrideUsed: qualificationResult.experimentalOverrideUsed
    });
    return deepFreeze({
      artifactPath: outputPath,
      checklist,
      viewModel,
      prepared,
      generation,
      qualification: qualificationResult
    });
  } catch (error) {
    qualificationResult ??= error?.decision ?? null;
    emit(onEvent, {
      type: signal?.aborted ? 'stage:cancelled' : 'stage:failed',
      stageId: MIGRATION_CHECKLIST_STAGE_ID,
      processed,
      total,
      reasonCode: signal?.aborted ? 'USER_CANCELLED' : failureCode(error),
      qualificationStatus: qualificationResult?.status ?? 'UNKNOWN',
      qualificationId: qualificationResult?.qualificationId ?? null,
      experimentalOverrideUsed: qualificationResult?.experimentalOverrideUsed ?? false
    });
    throw error;
  }
}
