import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { HELP, parseArguments, runCli } from '../src/cli.js';
import {
  ANALYSIS_STAGES,
  PipelineStageError,
  buildProductCompletion,
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
  const usageCoverage = {
    projectId: 'node:.',
    projectPath: '.',
    ecosystem: 'node',
    status: 'complete',
    analyzer: { id: 'javascript-typescript', version: '1.0.0' },
    scannedFileCount: 2,
    analyzedFileCount: 2,
    parseFailureCount: 0,
    analyzerFailureCount: 0,
    unreadableFileCount: 0,
    scanFailureCount: 0,
    reasonCode: 'COVERAGE_COMPLETE'
  };
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
          status: 'IMPACTED',
          reasonCode: 'EXACT_SYMBOL_USAGE_FOUND',
          coverage: structuredClone(usageCoverage),
          findings: [
            {
              id: 'modal-removed',
              kind: 'breakingChange',
              summary: 'Modal was removed.',
              impacted: true,
              status: 'IMPACTED',
              reasonCode: 'EXACT_SYMBOL_USAGE_FOUND',
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
          status: 'NOT_IMPACTED',
          reasonCode: 'NO_EXACT_SYMBOL_USAGE_FOUND',
          coverage: structuredClone(usageCoverage),
          findings: [
            {
              id: 'map-removed',
              kind: 'breakingChange',
              summary: 'map was removed.',
              impacted: false,
              status: 'NOT_IMPACTED',
              reasonCode: 'NO_EXACT_SYMBOL_USAGE_FOUND',
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
          DEPENDENCY_NOT_USED: 0,
          EXACT_SYMBOL_USAGE_FOUND: 1,
          NO_EXACT_SYMBOL_USAGE_FOUND: 1,
          NO_MATCHABLE_SYMBOL_FOUND: 0,
          USAGE_NOT_FOUND: 0,
          COVERAGE_UNAVAILABLE: 0,
          NOT_ANALYZED: 0
        }
      },
      dependencies: [
        {
          analysisResultId: 'result-antd',
          projectId: 'node:.',
          packageId: 'npm:antd',
          name: 'antd',
          impacted: true,
          status: 'IMPACTED',
          reasonCode: 'EXACT_SYMBOL_USAGE_FOUND',
          coverage: structuredClone(usageCoverage),
          findings: [
            {
              id: 'evidence-modal',
              findingId: 'modal-removed',
              kind: 'breakingChange',
              summary: 'Modal was removed.',
              impacted: true,
              status: 'IMPACTED',
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
          status: 'NOT_IMPACTED',
          reasonCode: 'NO_EXACT_SYMBOL_USAGE_FOUND',
          coverage: structuredClone(usageCoverage),
          findings: [
            {
              id: 'evidence-map',
              findingId: 'map-removed',
              kind: 'breakingChange',
              summary: 'map was removed.',
              impacted: false,
              status: 'NOT_IMPACTED',
              reasonCode: 'NO_EXACT_SYMBOL_USAGE_FOUND',
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

function upgradeDecisionArtifact() {
  return {
    decisions: [
      {
        id: 'decision-antd',
        analysisResultId: 'analysis-antd',
        occurrence: {
          projectId: 'node:.',
          packageId: 'npm:antd',
          declaredName: 'antd',
          manifest: 'package.json',
          dependencyType: 'dependency'
        },
        versions: {
          installedVersion: '5.0.0',
          targetVersion: '5.0.0',
          targetPolicy: 'registryLatest'
        },
        decision: 'KEEP_CURRENT',
        summary: 'Keep the installed version because it equals the evaluated target.',
        primaryReasonCode: 'ALREADY_AT_TARGET',
        reasonCodes: ['ALREADY_AT_TARGET'],
        impact: {
          status: 'NOT_IMPACTED',
          coverage: { status: 'complete', reasonCode: 'COVERAGE_COMPLETE' }
        },
        requiresHumanReview: false
      },
      {
        id: 'decision-lodash',
        analysisResultId: 'analysis-lodash',
        occurrence: {
          projectId: 'node:.',
          packageId: 'npm:lodash',
          declaredName: 'lodash',
          manifest: 'package.json',
          dependencyType: 'dependency'
        },
        versions: {
          installedVersion: '4.0.0',
          targetVersion: '4.0.0',
          targetPolicy: 'registryLatest'
        },
        decision: 'KEEP_CURRENT',
        summary: 'Keep the installed version because it equals the evaluated target.',
        primaryReasonCode: 'ALREADY_AT_TARGET',
        reasonCodes: ['ALREADY_AT_TARGET'],
        impact: {
          status: 'NOT_IMPACTED',
          coverage: { status: 'complete', reasonCode: 'COVERAGE_COMPLETE' }
        },
        requiresHumanReview: false
      }
    ],
    summary: {
      KEEP_CURRENT: 2,
      UPGRADE_NOW: 0,
      PLAN_UPGRADE: 0,
      INVESTIGATE: 0,
      INSUFFICIENT_EVIDENCE: 0,
      NOT_ANALYZED: 0,
      requiresHumanReviewCount: 0
    }
  };
}

test('analyze command parses repository orchestration options', () => {
  assert.deepEqual(parseArguments(['analyze', 'fixture', '--offline', '--max-depth', '6']), {
    command: 'analyze',
    root: 'fixture',
    output: '.depverdict/repository-impact.md',
    dataset: 'eval/datasets',
    report: 'evaluation-report.json',
    metricsOutput: 'metrics.json',
    config: 'benchmark.json',
    pretty: true,
    stdout: false,
    failOnWarning: false,
    failOnIncomplete: false,
    offline: true,
    experimentalMigrationChecklist: false,
    targets: [],
    progress: 'auto',
    maxDepth: 6
  });
  const experimental = parseArguments([
    'analyze', 'fixture', '--experimental-migration-checklist', '--progress', 'plain',
    '--migration-qualification', 'qualification/record.json'
  ]);
  assert.equal(experimental.experimentalMigrationChecklist, true);
  assert.equal(experimental.progress, 'plain');
  assert.equal(experimental.migrationQualificationPath, 'qualification/record.json');
  assert.deepEqual(createAnalysisStages({ migrationChecklist: true }).map((item) => item.id), [
    'projectDiscovery',
    'knowledgeResearch',
    'versionAnalysis',
    'usageDiscovery',
    'impactAnalysis',
    'impactEvidence',
    'upgradeDecision',
    'migrationChecklist',
    'markdownReport'
  ]);
  assert.match(HELP, /--experimental-migration-checklist/);
  assert.match(HELP, /Experimental\. Every migration action requires human review\./);
  assert.match(HELP, /--target <selector>/);
  assert.match(HELP, /--fail-on-incomplete/);
  assert.match(HELP, /--migration-qualification <path>/);
  assert.match(HELP, /--progress <mode>/);
  assert.throws(
    () => parseArguments(['analyze', '.', '--migration-qualification', 'record.json']),
    /requires analyze with --experimental-migration-checklist/
  );
  assert.throws(
    () => parseArguments([
      'analyze', '.', '--experimental-migration-checklist',
      '--migration-qualification', '..\/record.json'
    ]),
    /portable path relative to the repository root/
  );
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
    progressReporter: createProgressReporter(output.stream),
    progressOptions: {
      monotonicClock: () => 0,
      wallClock: () => new Date('2026-01-01T00:00:00.000Z')
    }
  });

  assert.deepEqual(calls, ANALYSIS_STAGES.map((stage) => stage.id));
  assert.equal(result.artifacts.markdownReport, 'markdownReport');
  assert.match(output.value(), /^\[0\.0s\] RUN START stages=8\n/);
  for (const stage of ANALYSIS_STAGES) {
    assert.match(output.value(), new RegExp(`STAGE START id=${stage.id} `));
    assert.match(output.value(), new RegExp(`STAGE COMPLETE id=${stage.id} `));
  }
  assert.match(output.value(), /\[0\.0s\] RUN COMPLETE completed=8\/8 failed=0 skipped=0\n$/);
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
  assert.match(output.value(), /STAGE FAILED id=usageDiscovery reason=STAGE_FAILED/);
  assert.match(output.value(), /RUN FAILED completed=3\/8 next=REVIEW_FAILURE_DETAILS\n$/);
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
    'Usage not found: 0',
    'Coverage unavailable: 0',
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
    impactEvidence: async () => { calls.push('impactEvidence'); return artifacts.impactEvidence; },
    upgradeDecision: async () => { calls.push('upgradeDecision'); return upgradeDecisionArtifact(); }
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
    'impactEvidence',
    'upgradeDecision'
  ]);
  assert.match(stderr.value(), /STAGE COMPLETE id=markdownReport label="Markdown Report"/);
  assert.match(stderr.value(), /RUN COMPLETE completed=8\/8 failed=0 skipped=0/);
  const viewModel = presentationViewModel(artifacts);
  const completion = buildProductCompletion({
    upgradeDecision: upgradeDecisionArtifact(),
    versionAnalysis: artifacts.versionAnalysis,
    artifactPaths: {
      report: '.depverdict/repository-impact.md',
      upgradeDecision: '.depverdict/upgrade-decision.json'
    }
  });
  assert.equal(stdout.value(), renderConsoleSummary({
    viewModel,
    completion,
    reportPath: '.depverdict/repository-impact.md',
    upgradeDecision: upgradeDecisionArtifact(),
    upgradeDecisionPath: '.depverdict/upgrade-decision.json'
  }));
  const report = await readFile(path.join(root, '.depverdict/repository-impact.md'), 'utf8');
  assert.equal(report, renderMarkdownReport({
    viewModel,
    upgradeDecision: upgradeDecisionArtifact(),
    completion
  }));
  await assert.rejects(
    readFile(path.join(root, '.depverdict/migration-checklist.json')),
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
    qualification: {
      status: 'MISSING',
      qualificationId: null,
      sourceKind: 'defaultPath',
      sourcePath: '.depverdict/migration-planning-qualification.json',
      runtimeIdentity: { provider: 'unknown', model: 'unknown', adapter: 'unknown' },
      experimentalOverrideUsed: true,
      limitations: [{
        code: 'MIGRATION_PROVIDER_NOT_QUALIFIED',
        message: 'The configured provider/model has not been qualified for migration-planning.v2.'
      }],
      nextAction: 'INSTALL_QUALIFICATION_RECORD_OR_REVIEW_EXPERIMENTAL_OUTPUT'
    },
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
      statusCounts: { COMPLETE: 0, INCOMPLETE: 0, NO_GROUNDED_ACTION: 0, NOT_ANALYZED: 0 },
      handoffStatusCounts: {
        NO_VERSION_CHANGE_REQUIRED: 0,
        ACTIONABLE_WITH_REVIEW: 0,
        INVESTIGATION_REQUIRED: 0,
        INSUFFICIENT_EVIDENCE: 0,
        NOT_ANALYZED: 0,
        ACTION_GENERATION_FAILED: 0,
        NO_GROUNDED_ACTION: 0
      }
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
      upgradeDecision: runner('upgradeDecision', upgradeDecisionArtifact()),
      migrationChecklist: runner('migrationChecklist', {
        artifactPath: '.depverdict/migration-checklist.json',
        viewModel: migrationChecklistViewModel
      })
    }
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls, [
    'projectDiscovery', 'knowledgeResearch', 'versionAnalysis', 'usageDiscovery',
    'impactAnalysis', 'impactEvidence', 'upgradeDecision', 'migrationChecklist'
  ]);
  assert.match(stderr.value(), /STAGE COMPLETE id=migrationChecklist label="Migration Checklist"[\s\S]*STAGE START id=markdownReport/);
  assert.match(stdout.value(), /Migration handoff[\s\S]*Actionable with review: 0/);
  assert.match(stdout.value(), /Migration Checklist remains experimental/);
  const report = await readFile(path.join(root, '.depverdict/repository-impact.md'), 'utf8');
  assert.match(report, /## Migration Checklist/);
  assert.match(report, /Every AI-selected official guidance item requires human review/);
});

test('retained provider/output failure is machine-readable PARTIAL and exits 2', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-analyze-partial-'));
  temporaryDirectories.push(root);
  const artifacts = reportArtifacts();
  const decisionArtifact = structuredClone(upgradeDecisionArtifact());
  const failed = decisionArtifact.decisions[1];
  failed.decision = 'NOT_ANALYZED';
  failed.summary = 'No upgrade decision was evaluated because Version Analysis did not complete.';
  failed.primaryReasonCode = 'VERSION_ANALYSIS_FAILED';
  failed.reasonCodes = ['PROVIDER_REJECTED', 'VERSION_ANALYSIS_FAILED'];
  failed.requiresHumanReview = true;
  decisionArtifact.summary.KEEP_CURRENT = 1;
  decisionArtifact.summary.NOT_ANALYZED = 1;
  decisionArtifact.summary.requiresHumanReviewCount = 1;
  failed.analysisResultId = artifacts.versionAnalysis.results[1].id;
  artifacts.versionAnalysis.results[1] = {
    ...artifacts.versionAnalysis.results[1],
    humanReviewReasons: ['ANALYSIS_FAILED', 'OUTPUT_SCHEMA_INVALID'],
    limitations: [{
      code: 'OUTPUT_SCHEMA_INVALID',
      message: 'The provider output was rejected.'
    }]
  };
  const runner = (value) => async () => value;
  const stdout = capture();
  const stderr = capture();

  const exitCode = await runCli(['analyze', root, '--stdout', '--progress', 'plain'], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    analysisStageRunners: {
      projectDiscovery: runner(artifacts.projectManifest),
      knowledgeResearch: runner('knowledge'),
      versionAnalysis: runner(artifacts.versionAnalysis),
      usageDiscovery: runner({ summary: {} }),
      impactAnalysis: runner(artifacts.repositoryImpact),
      impactEvidence: runner(artifacts.impactEvidence),
      upgradeDecision: runner(decisionArtifact)
    }
  });
  assert.notEqual(stdout.value(), '', stderr.value());
  const completion = JSON.parse(stdout.value());

  assert.equal(exitCode, 2);
  assert.equal(completion.status, 'PARTIAL');
  assert.equal(completion.failedOccurrences.length, 1);
  assert.equal(completion.failedOccurrences[0].dependency, 'lodash');
  assert.match(completion.failedOccurrences[0].recovery, /output was rejected/i);
  assert.doesNotMatch(stdout.value(), /STAGE START|RUN COMPLETE/);
  assert.match(stderr.value(), /RUN COMPLETE/);
});

test('strict analyze exits 2 for a valid review outcome but not for all keep-current', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-analyze-strict-'));
  temporaryDirectories.push(root);
  const artifacts = reportArtifacts();
  const reviewDecision = structuredClone(upgradeDecisionArtifact());
  const first = reviewDecision.decisions[0];
  first.decision = 'INVESTIGATE';
  first.summary = 'A newer target is available, but no structured recommendation driver is present.';
  first.primaryReasonCode = 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER';
  first.reasonCodes = ['UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER'];
  first.versions.targetVersion = '6.0.0';
  first.requiresHumanReview = true;
  reviewDecision.summary.KEEP_CURRENT = 1;
  reviewDecision.summary.INVESTIGATE = 1;
  reviewDecision.summary.requiresHumanReviewCount = 1;
  const run = async (upgradeDecision, args = []) => runCli([
    'analyze', root, '--stdout', ...args
  ], {
    stdout: capture().stream,
    stderr: capture().stream,
    analysisStageRunners: {
      projectDiscovery: async () => artifacts.projectManifest,
      knowledgeResearch: async () => 'knowledge',
      versionAnalysis: async () => artifacts.versionAnalysis,
      usageDiscovery: async () => ({ summary: {} }),
      impactAnalysis: async () => artifacts.repositoryImpact,
      impactEvidence: async () => artifacts.impactEvidence,
      upgradeDecision: async () => upgradeDecision
    }
  });

  assert.equal(await run(reviewDecision), 0);
  assert.equal(await run(reviewDecision, ['--fail-on-incomplete']), 2);
  assert.equal(await run(upgradeDecisionArtifact(), ['--fail-on-incomplete']), 0);
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
  assert.match(stderr.value(), /Repository Usage Discovery failed\.\n\nSee:\n\.depverdict\/logs\/analyze\.log/);
  assert.doesNotMatch(stderr.value(), /\bat\s+.*\.js:/);
  const log = await readFile(path.join(root, '.depverdict/logs/analyze.log'), 'utf8');
  assert.equal(log, [
    'DepVerdict analysis failure',
    'Stage: Repository Usage Discovery',
    'Message: fixture failure',
    ''
  ].join('\n'));
});
