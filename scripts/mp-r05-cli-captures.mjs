import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { runCli } from '../src/cli.js';
import {
  PipelineCancellationError,
  VERSION,
  buildProductCompletion,
  parseTargetSelector,
  resolveTargetSelectors
} from '../src/index.js';

const executeFile = promisify(execFile);
const repositoryRoot = path.resolve(new URL('..', import.meta.url).pathname);
const captureRoot = path.join(repositoryRoot, '.upgradelens/review/mp-r05-cli');
const positiveRoot = '/tmp/upgradelens-mpr05-public-positive';
const generatedAt = '2026-07-18T00:00:00.000Z';

function captureStream() {
  let value = '';
  return {
    stream: { write(chunk) { value += String(chunk); return true; } },
    value: () => value
  };
}

function decision({
  id,
  name,
  packageId,
  outcome,
  installed,
  target,
  targetPolicy = 'registryLatest',
  reason,
  summary,
  coverage = 'complete',
  review = false,
  projectId = 'node:.'
}) {
  return {
    id,
    analysisResultId: `analysis-${id}`,
    occurrence: {
      projectId,
      packageId,
      declaredName: name,
      manifest: projectId === 'node:.' ? 'package.json' : `${projectId.split(':').at(-1)}/package.json`,
      dependencyType: 'dependency'
    },
    decision: outcome,
    summary,
    primaryReasonCode: reason,
    reasonCodes: [reason],
    versions: {
      installedVersion: installed,
      targetVersion: target,
      targetPolicy
    },
    impact: {
      status: coverage === 'complete' ? 'NOT_IMPACTED' : 'COVERAGE_UNAVAILABLE',
      coverage: {
        status: coverage,
        reasonCode: coverage === 'complete' ? 'COVERAGE_COMPLETE' : 'ANALYZER_UNAVAILABLE'
      }
    },
    requiresHumanReview: review,
    limitations: []
  };
}

function artifact(decisions) {
  const outcomes = [
    'KEEP_CURRENT',
    'UPGRADE_NOW',
    'PLAN_UPGRADE',
    'INVESTIGATE',
    'INSUFFICIENT_EVIDENCE',
    'NOT_ANALYZED'
  ];
  return {
    decisions,
    summary: {
      dependencyCount: decisions.length,
      ...Object.fromEntries(outcomes.map((outcome) => [
        outcome,
        decisions.filter((item) => item.decision === outcome).length
      ])),
      requiresHumanReviewCount: decisions.filter((item) => item.requiresHumanReview).length
    }
  };
}

function impactViewModel(count) {
  return {
    repositoryName: 'generic-cli-acceptance',
    analysisStatus: 'COMPLETE',
    summary: {
      dependencyCount: count,
      analyzedCount: count,
      skippedCount: 0,
      failedCount: 0,
      requiresHumanReviewCount: 0,
      impactedCount: 0,
      notImpactedCount: count,
      usageNotFoundCount: 0,
      coverageUnavailableCount: 0,
      notAnalyzedCount: 0,
      breakingFindingCount: 0,
      evidenceRecordCount: 0
    },
    dependencies: []
  };
}

function migrationViewModel(decisionId, status = 'ACTIONABLE_WITH_REVIEW') {
  const names = [
    'NO_VERSION_CHANGE_REQUIRED',
    'ACTIONABLE_WITH_REVIEW',
    'INVESTIGATION_REQUIRED',
    'INSUFFICIENT_EVIDENCE',
    'NOT_ANALYZED',
    'ACTION_GENERATION_FAILED',
    'NO_GROUNDED_ACTION'
  ];
  return {
    repositoryName: 'generic-cli-acceptance',
    status: 'COMPLETE',
    experimental: true,
    qualification: {
      status: 'MISSING',
      qualificationId: null,
      sourceKind: 'defaultPath',
      sourcePath: '.upgradelens/migration-planning-qualification.json',
      runtimeIdentity: { provider: 'fake', model: 'bounded-fake', adapter: 'fixture' },
      experimentalOverrideUsed: true,
      limitations: [],
      nextAction: 'INSTALL_QUALIFICATION_RECORD_OR_REVIEW_EXPERIMENTAL_OUTPUT'
    },
    humanReviewRequired: true,
    summary: {
      handoffStatusCounts: Object.fromEntries(names.map((name) => [name, name === status ? 1 : 0]))
    },
    dependencies: [{
      decisionId,
      handoffStatus: status,
      nextStep: {
        message: status === 'ACTIONABLE_WITH_REVIEW'
          ? 'Review the evidence-bounded migration handoff before changing source.'
          : 'Review the failed migration action manually.'
      }
    }],
    limitations: []
  };
}

async function captureAnalyze(argv, upgradeDecision, {
  versionAnalysis = { results: [] },
  migrationChecklistViewModel = null,
  strict = false,
  cancellation = false
} = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  if (cancellation) {
    const exitCode = await runCli(argv, {
      stdout: stdout.stream,
      stderr: stderr.stream,
      runAnalysisPipeline: async () => {
        throw new PipelineCancellationError(null, new Error('capture cancellation'));
      },
      handleSignals: false
    });
    return { exitCode, stdout: stdout.value(), stderr: stderr.value(), completion: 'CANCELLED' };
  }
  const completion = buildProductCompletion({
    upgradeDecision,
    versionAnalysis,
    migrationChecklistViewModel,
    artifactPaths: {
      report: '.upgradelens/repository-impact.md',
      upgradeDecision: '.upgradelens/upgrade-decision.json',
      migrationChecklist: migrationChecklistViewModel
        ? '.upgradelens/migration-checklist.json' : null
    }
  });
  const exitCode = await runCli([
    ...argv,
    ...(strict ? ['--fail-on-incomplete'] : [])
  ], {
    stdout: stdout.stream,
    stderr: stderr.stream,
    runAnalysisPipeline: async () => ({
      artifacts: {
        versionAnalysis,
        upgradeDecision,
        ...(migrationChecklistViewModel ? {
          migrationChecklist: {
            artifactPath: '.upgradelens/migration-checklist.json',
            viewModel: migrationChecklistViewModel
          }
        } : {}),
        markdownReport: {
          viewModel: impactViewModel(upgradeDecision.decisions.length),
          completion
        }
      }
    }),
    handleSignals: false
  });
  return {
    exitCode,
    stdout: stdout.value(),
    stderr: stderr.value(),
    completion: completion.status,
    decisionCounts: completion.decisionCounts,
    handoffCounts: completion.handoffCounts
  };
}

async function captureDirect(argv, completion = null) {
  const stdout = captureStream();
  const stderr = captureStream();
  const exitCode = await runCli(argv, {
    stdout: stdout.stream,
    stderr: stderr.stream,
    env: {},
    handleSignals: false
  });
  return { exitCode, stdout: stdout.value(), stderr: stderr.value(), completion };
}

async function writeCapture(sequence, id, command, result, {
  provider = 'none',
  model = 'none',
  artifactInventory = []
} = {}) {
  const directoryName = `${String(sequence).padStart(3, '0')}-${id}`;
  const directory = path.join(captureRoot, directoryName);
  await mkdir(directory, { recursive: true });
  const transcript = [
    `$ ${command}`,
    result.stdout ? `\n[stdout]\n${result.stdout.trimEnd()}` : '',
    result.stderr ? `\n[stderr]\n${result.stderr.trimEnd()}` : '',
    `\n[exit]\n${result.exitCode}`,
    ''
  ].join('\n');
  const metadata = {
    schemaVersion: 'mp-r05-cli-capture.v1',
    scenarioId: id,
    generatedAt,
    command,
    workingDirectory: '.',
    package: `upgradelens@${VERSION}`,
    commit: 'WORKTREE',
    runtime: { provider, model },
    exitCode: result.exitCode,
    durationMs: 0,
    overallCompletion: result.completion,
    decisionCounts: result.decisionCounts ?? null,
    handoffCounts: result.handoffCounts ?? null,
    artifactInventory,
    transcriptKind: 'raw text and rendered text snapshot; not a native screenshot',
    secretsPresent: false
  };
  await Promise.all([
    writeFile(path.join(directory, 'command.txt'), `${command}\n`),
    writeFile(path.join(directory, 'stdout.txt'), result.stdout ?? ''),
    writeFile(path.join(directory, 'stderr.txt'), result.stderr ?? ''),
    writeFile(path.join(directory, 'transcript.raw.txt'), transcript),
    writeFile(path.join(directory, 'rendered-snapshot.txt'), transcript),
    writeFile(path.join(directory, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`)
  ]);
  return {
    sequence,
    scenarioId: id,
    directory: directoryName,
    exitCode: result.exitCode,
    overallCompletion: result.completion
  };
}

async function main() {
  await rm(captureRoot, { recursive: true, force: true });
  await mkdir(captureRoot, { recursive: true });
  const entries = [];

  const help = await captureDirect(['--help']);
  const version = await captureDirect(['--version']);
  entries.push(await writeCapture(1, 'help-and-version',
    'upgradelens --help && upgradelens --version', {
      exitCode: help.exitCode || version.exitCode,
      stdout: `${help.stdout}\n--- version ---\n${version.stdout}`,
      stderr: `${help.stderr}${version.stderr}`,
      completion: null
    }));

  const investigate = decision({
    id: 'registry-framework',
    name: 'framework',
    packageId: 'npm:framework',
    outcome: 'INVESTIGATE',
    installed: '1.0.0',
    target: '2.0.0',
    reason: 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER',
    summary: 'A newer target is available, but no structured recommendation driver is present.',
    review: true
  });
  entries.push(await writeCapture(2, 'default-registry-workflow',
    'upgradelens analyze . --offline',
    await captureAnalyze(['analyze', '.', '--offline'], artifact([investigate]))));

  const plan = decision({
    id: 'explicit-framework',
    name: 'framework',
    packageId: 'npm:framework',
    outcome: 'PLAN_UPGRADE',
    installed: '1.0.0',
    target: '2.0.0',
    targetPolicy: 'explicit',
    reason: 'USER_SELECTED_TARGET',
    summary: 'Plan the caller-selected, evidence-bounded upgrade to target 2.0.0.',
    review: true
  });
  const planMigration = migrationViewModel(plan.id);
  entries.push(await writeCapture(3, 'explicit-target-positive',
    "upgradelens analyze . --target 'package=npm:framework,target=2.0.0' --experimental-migration-checklist",
    await captureAnalyze([
      'analyze', '.', '--target', 'package=npm:framework,target=2.0.0',
      '--experimental-migration-checklist'
    ], artifact([plan]), { migrationChecklistViewModel: planMigration }),
    {
      provider: 'fake',
      model: 'bounded-fake',
      artifactInventory: [
        '.upgradelens/upgrade-decision.json',
        '.upgradelens/migration-checklist.json'
      ]
    }));

  const ambiguousInputs = [
    {
      project: { id: 'node:.', ecosystem: 'node' },
      dependency: {
        manifest: 'package.json', type: 'dependency', name: 'framework', declaredVersion: '1.0.0'
      },
      packageRecord: { id: 'npm:framework' }
    },
    {
      project: { id: 'node:apps/web', ecosystem: 'node' },
      dependency: {
        manifest: 'apps/web/package.json', type: 'dependency', name: 'framework', declaredVersion: '1.0.0'
      },
      packageRecord: { id: 'npm:framework' }
    }
  ];
  let ambiguous;
  try {
    resolveTargetSelectors(
      ambiguousInputs,
      [parseTargetSelector('package=npm:framework,target=2.0.0')]
    );
  } catch (error) {
    ambiguous = {
      exitCode: 1,
      stdout: '',
      stderr: `upgradelens: ${error.message}\n`,
      completion: 'FAILED'
    };
  }
  entries.push(await writeCapture(4, 'ambiguous-target-selector',
    "upgradelens analyze . --target 'package=npm:framework,target=2.0.0'",
    ambiguous));

  entries.push(await writeCapture(5, 'invalid-target-version',
    "upgradelens analyze-version /tmp/upgradelens-mpr05-public-positive --target 'package=npm:react,target=not-a-version'",
    await captureDirect([
      'analyze-version',
      positiveRoot,
      '--target',
      'package=npm:react,target=not-a-version'
    ], 'FAILED')));

  entries.push(await writeCapture(6, 'missing-ai-configuration',
    "upgradelens analyze-version /tmp/upgradelens-mpr05-public-positive --target 'package=npm:react,target=2.0.0'",
    await captureDirect([
      'analyze-version',
      positiveRoot,
      '--target',
      'package=npm:react,target=2.0.0'
    ], 'FAILED')));

  const failed = decision({
    id: 'failed-provider',
    name: 'failed-package',
    packageId: 'npm:failed-package',
    outcome: 'NOT_ANALYZED',
    installed: '1.0.0',
    target: '2.0.0',
    reason: 'VERSION_ANALYSIS_FAILED',
    summary: 'No upgrade decision was evaluated because Version Analysis did not complete.',
    review: true
  });
  failed.reasonCodes.push('PROVIDER_REJECTED');
  entries.push(await writeCapture(7, 'provider-output-partial',
    'upgradelens analyze .',
    await captureAnalyze(['analyze', '.'], artifact([plan, failed]), {
      versionAnalysis: {
        results: [{
          id: failed.analysisResultId,
          humanReviewReasons: ['OUTPUT_SCHEMA_INVALID'],
          limitations: [{ code: 'OUTPUT_SCHEMA_INVALID', message: 'rejected' }]
        }]
      }
    }), { provider: 'fixture-failure', model: 'fixture-failure' }));

  const insufficient = decision({
    id: 'missing-baseline',
    name: 'library',
    packageId: 'pypi:library',
    outcome: 'INSUFFICIENT_EVIDENCE',
    installed: null,
    target: '3.0.0',
    targetPolicy: 'explicit',
    reason: 'INSTALLED_VERSION_UNAVAILABLE',
    summary: 'The installed version baseline is unavailable.',
    coverage: 'unavailable',
    review: true,
    projectId: 'python:services/api'
  });
  entries.push(await writeCapture(8, 'insufficient-evidence',
    "upgradelens analyze . --target 'package=pypi:library,target=3.0.0'",
    await captureAnalyze([
      'analyze', '.', '--target', 'package=pypi:library,target=3.0.0'
    ], artifact([insufficient]))));

  entries.push(await writeCapture(9, 'offline-valid-cache',
    'upgradelens analyze . --offline',
    await captureAnalyze(['analyze', '.', '--offline'], artifact([investigate]))));

  const noTarget = decision({
    id: 'offline-empty',
    name: 'uncached-library',
    packageId: 'pypi:uncached-library',
    outcome: 'INSUFFICIENT_EVIDENCE',
    installed: '1.0.0',
    target: null,
    reason: 'TARGET_VERSION_UNAVAILABLE',
    summary: 'No evaluated target version is available.',
    coverage: 'unavailable',
    review: true,
    projectId: 'python:.'
  });
  entries.push(await writeCapture(10, 'offline-empty-cache',
    'upgradelens analyze . --offline',
    await captureAnalyze(['analyze', '.', '--offline'], artifact([noTarget]))));

  entries.push(await writeCapture(11, 'controlled-cancellation',
    'upgradelens analyze . --progress plain',
    await captureAnalyze(['analyze', '.', '--progress', 'plain'], artifact([]), {
      cancellation: true
    })));

  const packagedBin = process.env.MP_R05_PACKAGED_BIN
    ? path.resolve(process.env.MP_R05_PACKAGED_BIN)
    : path.join(repositoryRoot, 'bin/upgradelens.js');
  const packageVersion = await executeFile(
    process.execPath,
    [packagedBin, '--version'],
    { cwd: repositoryRoot, env: { PATH: process.env.PATH } }
  );
  entries.push(await writeCapture(12, 'packaged-cli-smoke',
    'upgradelens --version',
    {
      exitCode: 0,
      stdout: packageVersion.stdout,
      stderr: packageVersion.stderr,
      completion: null
    }));

  const manifest = {
    schemaVersion: 'mp-r05-cli-capture-manifest.v1',
    generatedAt,
    package: `upgradelens@${VERSION}`,
    captureCount: entries.length,
    capturesExcludedFromPackage: true,
    nativeScreenshots: false,
    entries
  };
  await writeFile(
    path.join(captureRoot, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  const digest = createHash('sha256')
    .update(await readFile(path.join(captureRoot, 'manifest.json')))
    .digest('hex');
  process.stdout.write(
    `MP-R05 CLI captures written: ${entries.length}; manifest sha256:${digest}\n`
  );
}

await main();
