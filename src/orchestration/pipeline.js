import { createProgressEventRuntime } from './progress-events.js';

export const ANALYSIS_STAGES = Object.freeze([
  Object.freeze({ id: 'projectDiscovery', label: 'Project Discovery' }),
  Object.freeze({ id: 'knowledgeResearch', label: 'Knowledge Research' }),
  Object.freeze({ id: 'versionAnalysis', label: 'Version Analysis' }),
  Object.freeze({ id: 'usageDiscovery', label: 'Repository Usage Discovery' }),
  Object.freeze({ id: 'impactAnalysis', label: 'Repository Impact Analysis' }),
  Object.freeze({ id: 'impactEvidence', label: 'Repository Impact Evidence' }),
  Object.freeze({ id: 'upgradeDecision', label: 'Deterministic Upgrade Decision' }),
  Object.freeze({ id: 'markdownReport', label: 'Markdown Report' })
]);

export const MIGRATION_CHECKLIST_ANALYSIS_STAGE = Object.freeze({
  id: 'migrationChecklist',
  label: 'Migration Checklist'
});

export const ANALYSIS_STAGE_INITIAL_ACTIVITIES = Object.freeze({
  projectDiscovery: Object.freeze({
    activityKind: 'DISCOVER_PROJECT_MANIFESTS',
    subject: 'Discovering project manifests'
  }),
  knowledgeResearch: Object.freeze({
    activityKind: 'RESEARCH_DEPENDENCY_METADATA',
    subject: 'Researching dependency metadata'
  }),
  versionAnalysis: Object.freeze({
    activityKind: 'PREPARE_DEPENDENCY_ANALYSIS',
    subject: 'Preparing dependency analysis'
  }),
  usageDiscovery: Object.freeze({
    activityKind: 'SCAN_SUPPORTED_SOURCE',
    subject: 'Scanning supported source files'
  }),
  impactAnalysis: Object.freeze({
    activityKind: 'MATCH_REPOSITORY_IMPACT',
    subject: 'Matching repository impact'
  }),
  impactEvidence: Object.freeze({
    activityKind: 'VALIDATE_IMPACT_EVIDENCE',
    subject: 'Validating repository impact evidence'
  }),
  upgradeDecision: Object.freeze({
    activityKind: 'APPLY_UPGRADE_DECISION_POLICY',
    subject: 'Applying deterministic upgrade decision policy'
  }),
  migrationChecklist: Object.freeze({
    activityKind: 'PREPARE_MIGRATION_CONTEXTS',
    subject: 'Preparing Migration Checklist contexts'
  }),
  markdownReport: Object.freeze({
    activityKind: 'RENDER_MARKDOWN_REPORT',
    subject: 'Rendering Markdown report'
  })
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

export class PipelineCancellationError extends Error {
  constructor(stage = null, cause = null) {
    super(stage ? `${stage.label} was cancelled.` : 'Analysis was cancelled.', { cause });
    this.name = 'PipelineCancellationError';
    this.code = 'ANALYSIS_CANCELLED';
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

function failureReasonCode(cause) {
  return typeof cause?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(cause.code)
    ? cause.code
    : 'STAGE_FAILED';
}

function abortError(stage, signal) {
  return new PipelineCancellationError(stage, signal?.reason);
}

async function runWithSignal(run, signal, stage) {
  if (!signal) return run();
  if (signal.aborted) throw abortError(stage, signal);
  let removeAbortListener = () => {};
  const aborted = new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError(stage, signal));
    signal.addEventListener('abort', onAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', onAbort);
  });
  try {
    return await Promise.race([run(), aborted]);
  } finally {
    removeAbortListener();
  }
}

export async function runAnalysisPipeline({
  repositoryRoot,
  runners,
  progressReporter,
  stages = ANALYSIS_STAGES,
  signal,
  progressListener,
  progressOptions = {}
}) {
  validateRunners(runners, stages);
  const artifacts = {};
  const progress = createProgressEventRuntime({
    stages,
    listener(event) {
      try {
        progressReporter?.handle?.(event)?.catch?.(() => {});
      } catch {
        // Reporter failures are isolated from business execution.
      }
      try {
        progressListener?.(event)?.catch?.(() => {});
      } catch {
        // Observer failures are isolated from business execution.
      }
    },
    ...progressOptions
  });
  progress.startRun();

  try {
    if (signal?.aborted) {
      for (const stage of stages) progress.skipStage(stage.id, 'RUN_CANCELLED');
      progress.cancelRun();
      throw abortError(null, signal);
    }
    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index];
      progress.startStage(stage.id);
      const initialActivity = ANALYSIS_STAGE_INITIAL_ACTIVITIES[stage.id];
      if (initialActivity) progress.activity(stage.id, initialActivity);
      const reportActivity = (activity) => {
        try {
          progress.activity(stage.id, activity);
        } catch {
          // Invalid or throwing progress instrumentation cannot affect stage output.
        }
      };
      try {
        artifacts[stage.id] = await runWithSignal(() => runners[stage.id]({
          repositoryRoot,
          artifacts: Object.freeze({ ...artifacts }),
          progress: reportActivity,
          signal
        }), signal, stage);
        if (signal?.aborted) throw abortError(stage, signal);
        progress.completeStage(stage.id);
      } catch (cause) {
        if (cause instanceof PipelineCancellationError || signal?.aborted) {
          progress.cancelStage(stage.id, 'USER_CANCELLED');
          for (const remaining of stages.slice(index + 1)) {
            progress.skipStage(remaining.id, 'RUN_CANCELLED');
          }
          progress.cancelRun();
          throw cause instanceof PipelineCancellationError ? cause : abortError(stage, signal);
        }
        progress.failStage(stage.id, failureReasonCode(cause));
        for (const remaining of stages.slice(index + 1)) {
          progress.skipStage(remaining.id, 'PRIOR_STAGE_FAILED');
        }
        progress.failRun();
        throw new PipelineStageError(stage, cause);
      }
    }
    progress.completeRun();
    return Object.freeze({
      repositoryRoot,
      artifacts: Object.freeze({ ...artifacts }),
      progress: progress.snapshot()
    });
  } finally {
    progress.dispose();
  }
}
