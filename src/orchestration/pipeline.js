export const ANALYSIS_STAGES = Object.freeze([
  Object.freeze({ id: 'projectDiscovery', label: 'Project Discovery' }),
  Object.freeze({ id: 'knowledgeResearch', label: 'Knowledge Research' }),
  Object.freeze({ id: 'versionAnalysis', label: 'Version Analysis' }),
  Object.freeze({ id: 'usageDiscovery', label: 'Repository Usage Discovery' }),
  Object.freeze({ id: 'impactAnalysis', label: 'Repository Impact Analysis' }),
  Object.freeze({ id: 'impactEvidence', label: 'Repository Impact Evidence' }),
  Object.freeze({ id: 'markdownReport', label: 'Markdown Report' })
]);

export class PipelineStageError extends Error {
  constructor(stage, cause) {
    super(`${stage.label} failed: ${cause?.message ?? String(cause)}`, { cause });
    this.name = 'PipelineStageError';
    this.stage = stage;
  }
}

function validateRunners(runners) {
  for (const stage of ANALYSIS_STAGES) {
    if (typeof runners?.[stage.id] !== 'function') {
      throw new Error(`Analysis pipeline requires a ${stage.id} stage runner.`);
    }
  }
}

export async function runAnalysisPipeline({ repositoryRoot, runners, progressReporter }) {
  validateRunners(runners);
  const artifacts = {};
  progressReporter?.start();

  for (const stage of ANALYSIS_STAGES) {
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
