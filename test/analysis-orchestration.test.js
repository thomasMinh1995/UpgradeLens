import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { HELP, parseArguments, runCli } from '../src/cli.js';
import {
  ANALYSIS_STAGES,
  PipelineStageError,
  buildImpactPresentationViewModel,
  createAnalysisStages,
  createProgressReporter,
  renderConsoleSummary,
  renderMarkdownReport,
  runAnalysisPipeline
} from '../src/index.js';

const temporaryDirectories = [];

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

function capture() {
  let value = '';
  return {
    stream: { write(chunk) { value += chunk; return true; } },
    value: () => value
  };
}

function reportArtifacts() {
  return {
    projectManifest: { repository: { name: 'VinGrade', root: '.' } },
    versionAnalysis: {
      summary: {
        resultCount: 2,
        analyzedCount: 2,
        skippedCount: 0,
        failedCount: 0,
        requiresHumanReviewCount: 0
      },
      results: [
        {
          id: 'result-antd',
          status: 'analyzed',
          requiresHumanReview: false,
          dependency: { projectId: 'node:.', packageId: 'npm:antd', declaredName: 'antd' },
          findings: [{ id: 'modal-removed' }]
        },
        {
          id: 'result-lodash',
          status: 'analyzed',
          requiresHumanReview: false,
          dependency: { projectId: 'node:.', packageId: 'npm:lodash', declaredName: 'lodash' },
          findings: [{ id: 'map-removed' }]
        }
      ]
    },
    repositoryImpact: {
      summary: {
        impacted: true,
        dependencyCount: 2,
        impactedDependencyCount: 1,
        findingCount: 2,
        impactedFindingCount: 1,
        matchCount: 1,
        affectedFileCount: 2
      },
      dependencies: [
        {
          analysisResultId: 'result-antd',
          projectId: 'node:.',
          packageId: 'npm:antd',
          name: 'antd',
          impacted: true,
          findings: [
            {
              id: 'modal-removed',
              kind: 'breakingChange',
              summary: 'Modal was removed.',
              impacted: true,
              matches: [{ symbol: 'Modal', files: ['src/Dialog.tsx', 'src/Home.tsx'] }]
            }
          ]
        },
        {
          analysisResultId: 'result-lodash',
          projectId: 'node:.',
          packageId: 'npm:lodash',
          name: 'lodash',
          impacted: false,
          findings: [
            {
              id: 'map-removed',
              kind: 'breakingChange',
              summary: 'map was removed.',
              impacted: false,
              matches: []
            }
          ]
        }
      ]
    },
    impactEvidence: {
      summary: {
        impacted: true,
        dependencyCount: 2,
        findingCount: 2,
        impactedFindingCount: 1,
        matchedSymbolCount: 1,
        usageRecordCount: 2,
        affectedFileCount: 2,
        reasonCounts: {
          DEPENDENCY_NOT_USED: 1,
          EXACT_SYMBOL_USAGE_FOUND: 1,
          NO_EXACT_SYMBOL_USAGE_FOUND: 0,
          NO_MATCHABLE_SYMBOL_FOUND: 0
        }
      },
      dependencies: [
        {
          analysisResultId: 'result-antd',
          projectId: 'node:.',
          packageId: 'npm:antd',
          name: 'antd',
          impacted: true,
          findings: [
            {
              id: 'evidence-modal',
              findingId: 'modal-removed',
              kind: 'breakingChange',
              summary: 'Modal was removed.',
              impacted: true,
              reasonCode: 'EXACT_SYMBOL_USAGE_FOUND',
              matchedSymbols: [
                {
                  symbol: 'Modal',
                  usages: [{ file: 'src/Dialog.tsx' }, { file: 'src/Home.tsx' }]
                }
              ]
            }
          ]
        },
        {
          analysisResultId: 'result-lodash',
          projectId: 'node:.',
          packageId: 'npm:lodash',
          name: 'lodash',
          impacted: false,
          findings: [
            {
              id: 'evidence-map',
              findingId: 'map-removed',
              kind: 'breakingChange',
              summary: 'map was removed.',
              impacted: false,
              reasonCode: 'DEPENDENCY_NOT_USED',
              matchedSymbols: []
            }
          ]
        }
      ]
    }
  };
}

function presentationViewModel(artifacts) {
  return buildImpactPresentationViewModel(artifacts);
}

test('analyze command parses repository orchestration options', () => {
  assert.deepEqual(parseArguments(['analyze', 'fixture', '--offline', '--max-depth', '6']), {
    command: 'analyze',
    root: 'fixture',
    output: '.upgradelens/repository-impact.md',
    dataset: 'eval/datasets',
    report: 'evaluation-report.json',
    metricsOutput: 'metrics.json',
    config: 'benchmark.json',
    pretty: true,
    stdout: false,
    failOnWarning: false,
    offline: true,
    experimentalMigrationChecklist: false,
    progress: 'auto',
    maxDepth: 6
  });
  const experimental = parseArguments([
    'analyze', 'fixture', '--experimental-migration-checklist', '--progress', 'plain'
  ]);
  assert.equal(experimental.experimentalMigrationChecklist, true);
  assert.equal(experimental.progress, 'plain');
  assert.deepEqual(createAnalysisStages({ migrationChecklist: true }).map((item) => item.id), [
    'projectDiscovery',
    'knowledgeResearch',
    'versionAnalysis',
    'usageDiscovery',
    'impactAnalysis',
    'impactEvidence',
    'migrationChecklist',
    'markdownReport'
  ]);
  assert.match(HELP, /--experimental-migration-checklist/);
  assert.match(HELP, /Experimental\. Requires human review\./);
  assert.match(HELP, /--progress <mode>/);
});

test('pipeline runs every stage in order and reports deterministic progress', async () => {
  const calls = [];
  const runners = Object.fromEntries(ANALYSIS_STAGES.map((stage) => [
    stage.id,
    async ({ artifacts }) => {
      calls.push(stage.id);
      assert.deepEqual(Object.keys(artifacts), calls.slice(0, -1));
      return stage.id;
    }
  ]));
  const output = capture();
  const result = await runAnalysisPipeline({
    repositoryRoot: '/repository',
    runners,
    progressReporter: createProgressReporter(output.stream)
  });

  assert.deepEqual(calls, ANALYSIS_STAGES.map((stage) => stage.id));
  assert.equal(result.artifacts.markdownReport, 'markdownReport');
  assert.equal(output.value(), [
    'Running UpgradeLens Analysis...',
    '',
    ...ANALYSIS_STAGES.map((stage) => `✓ ${stage.label}`),
    '',
    'Analysis completed.',
    '',
    ''
  ].join('\n'));
});

test('pipeline stops at the first failed stage', async () => {
  const calls = [];
  const runners = Object.fromEntries(ANALYSIS_STAGES.map((stage) => [
    stage.id,
    async () => {
      calls.push(stage.id);
      if (stage.id === 'usageDiscovery') throw new Error('fixture parse failure');
      return stage.id;
    }
  ]));
  const output = capture();

  await assert.rejects(
    runAnalysisPipeline({
      repositoryRoot: '/repository',
      runners,
      progressReporter: createProgressReporter(output.stream)
    }),
    (error) => error instanceof PipelineStageError
      && error.stage.id === 'usageDiscovery'
      && error.cause.message === 'fixture parse failure'
  );
  assert.deepEqual(calls, ['projectDiscovery', 'knowledgeResearch', 'versionAnalysis', 'usageDiscovery']);
  assert.match(output.value(), /✗ Repository Usage Discovery\n$/);
  assert.doesNotMatch(output.value(), /Repository Impact Analysis|Analysis completed/);
});

test('Markdown and console renderers are deterministic and do not mutate business artifacts', () => {
  const artifacts = reportArtifacts();
  const before = structuredClone(artifacts);
  const viewModel = presentationViewModel(artifacts);
  const markdown = renderMarkdownReport({ viewModel });
  const consoleOutput = renderConsoleSummary({
    viewModel,
    reportPath: '.upgradelens/repository-impact.md'
  });

  assert.equal(markdown, renderMarkdownReport({ viewModel }));
  assert.equal(consoleOutput, renderConsoleSummary({
    viewModel,
    reportPath: '.upgradelens/repository-impact.md'
  }));
  assert.deepEqual(artifacts, before);
  assert.match(markdown, /\| Breaking findings \| 2 \|/);
  assert.match(markdown, /- Evidence reason: `EXACT_SYMBOL_USAGE_FOUND`/);
  assert.match(markdown, /    - `src\/Home\.tsx`/);
  assert.equal(consoleOutput, [
    'Repository', '', 'VinGrade', '',
    'Analysis status: COMPLETE', '',
    'Dependencies: 2',
    'Analyzed: 2',
    'Skipped: 0',
    'Failed: 0',
    'Requires human review: 0', '',
    'Impacted: 1',
    'Not impacted: 1',
    'Not analyzed: 0', '',
    'Breaking findings: 2',
    'Evidence records: 2', '',
    'Markdown Report', '', '.upgradelens/repository-impact.md', ''
  ].join('\n'));
});

test('analyze CLI runs the full scheduler and writes the Markdown report', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-analyze-success-'));
  temporaryDirectories.push(root);
  const artifacts = reportArtifacts();
  const calls = [];
  const runners = {
    projectDiscovery: async () => { calls.push('projectDiscovery'); return artifacts.projectManifest; },
    knowledgeResearch: async () => { calls.push('knowledgeResearch'); return 'knowledge'; },
    versionAnalysis: async () => { calls.push('versionAnalysis'); return artifacts.versionAnalysis; },
    usageDiscovery: async () => { calls.push('usageDiscovery'); return { summary: {} }; },
    impactAnalysis: async () => { calls.push('impactAnalysis'); return artifacts.repositoryImpact; },
    impactEvidence: async () => { calls.push('impactEvidence'); return artifacts.impactEvidence; }
  };
  const stdout = capture();
  const stderr = capture();
  const exitCode = await runCli(['analyze', root], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    analysisStageRunners: runners
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    'projectDiscovery',
    'knowledgeResearch',
    'versionAnalysis',
    'usageDiscovery',
    'impactAnalysis',
    'impactEvidence'
  ]);
  assert.match(stderr.value(), /✓ Markdown Report\n\nAnalysis completed\./);
  const viewModel = presentationViewModel(artifacts);
  assert.equal(stdout.value(), renderConsoleSummary({
    viewModel,
    reportPath: '.upgradelens/repository-impact.md'
  }));
  const report = await readFile(path.join(root, '.upgradelens/repository-impact.md'), 'utf8');
  assert.equal(report, renderMarkdownReport({ viewModel }));
  await assert.rejects(
    readFile(path.join(root, '.upgradelens/migration-checklist.json')),
    { code: 'ENOENT' }
  );
});

test('experimental CLI opt-in inserts Migration Checklist before Markdown without changing default analyze', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-analyze-migration-'));
  temporaryDirectories.push(root);
  const artifacts = reportArtifacts();
  const calls = [];
  const runner = (id, value) => async () => { calls.push(id); return value; };
  const migrationChecklistViewModel = {
    repositoryName: 'VinGrade',
    status: 'INCOMPLETE',
    experimental: true,
    qualificationState: 'NOT_AVAILABLE',
    humanReviewRequired: true,
    summary: {
      dependencyCount: 0,
      findingCount: 0,
      itemCount: 0,
      groundedActionCount: 0,
      aiAuthoredItemCount: 0,
      candidateLocationCount: 0,
      requiresHumanReviewItemCount: 0,
      limitationCount: 1,
      statusCounts: { COMPLETE: 0, INCOMPLETE: 0, NO_GROUNDED_ACTION: 0, NOT_ANALYZED: 0 }
    },
    dependencies: [],
    limitations: [{
      code: 'MIGRATION_PROVIDER_NOT_QUALIFIED',
      message: 'The configured provider/model has not been qualified for migration-planning.v2.'
    }]
  };
  const stdout = capture();
  const stderr = capture();
  const exitCode = await runCli([
    'analyze', root, '--experimental-migration-checklist', '--progress', 'plain'
  ], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    analysisStageRunners: {
      projectDiscovery: runner('projectDiscovery', artifacts.projectManifest),
      knowledgeResearch: runner('knowledgeResearch', 'knowledge'),
      versionAnalysis: runner('versionAnalysis', artifacts.versionAnalysis),
      usageDiscovery: runner('usageDiscovery', { summary: {} }),
      impactAnalysis: runner('impactAnalysis', artifacts.repositoryImpact),
      impactEvidence: runner('impactEvidence', artifacts.impactEvidence),
      migrationChecklist: runner('migrationChecklist', {
        artifactPath: '.upgradelens/migration-checklist.json',
        viewModel: migrationChecklistViewModel
      })
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    'projectDiscovery', 'knowledgeResearch', 'versionAnalysis', 'usageDiscovery',
    'impactAnalysis', 'impactEvidence', 'migrationChecklist'
  ]);
  assert.match(stderr.value(), /✓ Migration Checklist\n✓ Markdown Report/);
  assert.match(stdout.value(), /Migration checklist contains no grounded action/);
  const report = await readFile(path.join(root, '.upgradelens/repository-impact.md'), 'utf8');
  assert.match(report, /## Migration Checklist/);
  assert.match(report, /Every AI-selected official guidance item requires human review/);
});

test('analyze CLI writes a clean failure log and does not run later stages', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-analyze-failure-'));
  temporaryDirectories.push(root);
  const calls = [];
  const runner = (id) => async () => { calls.push(id); return id; };
  const stdout = capture();
  const stderr = capture();
  const exitCode = await runCli(['analyze', root], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    analysisStageRunners: {
      projectDiscovery: runner('projectDiscovery'),
      knowledgeResearch: runner('knowledgeResearch'),
      versionAnalysis: runner('versionAnalysis'),
      usageDiscovery: async () => { calls.push('usageDiscovery'); throw new Error('fixture failure'); }
    }
  });

  assert.equal(exitCode, 1);
  assert.deepEqual(calls, ['projectDiscovery', 'knowledgeResearch', 'versionAnalysis', 'usageDiscovery']);
  assert.equal(stdout.value(), '');
  assert.match(stderr.value(), /Repository Usage Discovery failed\.\n\nSee:\n\.upgradelens\/logs\/analyze\.log/);
  assert.doesNotMatch(stderr.value(), /\bat\s+.*\.js:/);
  const log = await readFile(path.join(root, '.upgradelens/logs/analyze.log'), 'utf8');
  assert.equal(log, [
    'UpgradeLens analysis failure',
    'Stage: Repository Usage Discovery',
    'Message: fixture failure',
    ''
  ].join('\n'));
});
