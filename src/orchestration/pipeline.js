export const ANALYSIS_STAGES = Object.freeze([
  Object.freeze({ id: 'projectDiscovery', label: 'Project Discovery' }),
  Object.freeze({ id: 'knowledgeResearch', label: 'Knowledge Research' }),
  Object.freeze({ id: 'versionAnalysis', label: 'Version Analysis' }),
  Object.freeze({ id: 'usageDiscovery', label: 'Repository Usage Discovery' }),
  Object.freeze({ id: 'impactAnalysis', label: 'Repository Impact Analysis' }),
  Object.freeze({ id: 'impactEvidence', label: 'Repository Impact Evidence' }),
  Object.freeze({ id: 'markdownReport', label: 'Markdown Report' })
]);

export const MIGRATION_CHECKLIST_ANALYSIS_STAGE = Object.freeze({
  id: 'migrationChecklist',
  label: 'Migration Checklist'
});

export function createAnalysisStages({ migrationChecklist = false } = {}) {
  if (!migrationChecklist) return ANALYSIS_STAGES;
  return Object.freeze([
    ...ANALYSIS_STAGES.slice(0, -1),
    MIGRATION_CHECKLIST_ANALYSIS_STAGE,
    ANALYSIS_STAGES.at(-1)
  ]);
}

export class PipelineStageError extends Error {
  constructor(stage, cause) {
    super(`${stage.label} failed: ${cause?.message ?? String(cause)}`, { cause });
    this.name = 'PipelineStageError';
    this.stage = stage;
  }
}

function validateRunners(runners, stages) {
  for (const stage of stages) {
    if (typeof runners?.[stage.id] !== 'function') {
      throw new Error(`Analysis pipeline requires a ${stage.id} stage runner.`);
    }
  }
}

export async function runAnalysisPipeline({
  repositoryRoot,
  runners,
  progressReporter,
  stages = ANALYSIS_STAGES
}) {
  validateRunners(runners, stages);
  const artifacts = {};
  progressReporter?.start();

  for (const stage of stages) {
    try {
      artifacts[stage.id] = await runners[stage.id]({
        repositoryRoot,
        artifacts: Object.freeze({ ...artifacts })
      });
      progressReporter?.success(stage);
    } catch (cause) {
      progressReporter?.failure(stage);
      throw new PipelineStageError(stage, cause);
    }
  }

  progressReporter?.complete();
  return Object.freeze({
    repositoryRoot,
    artifacts: Object.freeze({ ...artifacts })
  });
}
