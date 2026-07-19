import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TargetSelectorError,
  buildProductCompletion,
  parseTargetSelector,
  productCompletionExitCode,
  resolveTargetSelectors,
  targetOccurrenceKey
} from '../src/index.js';
import { HELP, parseArguments } from '../src/cli.js';
import { renderConsoleSummary } from '../src/renderers/console.js';

function input({
  projectId = 'node:.',
  ecosystem = 'node',
  packageId = 'npm:framework',
  name = 'framework',
  manifest = 'package.json',
  type = 'dependency',
  declaredVersion = '^1.0.0'
} = {}) {
  return {
    project: { id: projectId, ecosystem },
    dependency: {
      name,
      manifest,
      type,
      declaredVersion
    },
    packageRecord: { id: packageId }
  };
}

function decision({
  id = 'decision-framework',
  projectId = 'node:.',
  packageId = 'npm:framework',
  name = 'framework',
  installed = '1.0.0',
  target = '1.0.0',
  targetPolicy = 'registryLatest',
  outcome = 'KEEP_CURRENT',
  reason = 'ALREADY_AT_TARGET',
  summary = 'Keep the installed version because it equals the evaluated target.',
  coverage = 'complete',
  review = false
} = {}) {
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
    requiresHumanReview: review
  };
}

function artifact(decisions) {
  const names = [
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
      ...Object.fromEntries(names.map((name) => [
        name,
        decisions.filter((item) => item.decision === name).length
      ])),
      requiresHumanReviewCount: decisions.filter((item) => item.requiresHumanReview).length
    }
  };
}

function viewModel() {
  return {
    repositoryName: 'generic',
    analysisStatus: 'COMPLETE',
    summary: {
      dependencyCount: 1,
      analyzedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      requiresHumanReviewCount: 0,
      impactedCount: 0,
      notImpactedCount: 1,
      usageNotFoundCount: 0,
      coverageUnavailableCount: 0,
      notAnalyzedCount: 0,
      breakingFindingCount: 0,
      evidenceRecordCount: 0
    },
    dependencies: []
  };
}

test('public target parser is scoped-package safe, repeatable, and rejects unknown structure', () => {
  assert.deepEqual(parseTargetSelector('package=npm:react,target=20.0.0'), {
    packageId: 'npm:react',
    targetVersion: '20.0.0'
  });
  assert.deepEqual(
    parseTargetSelector(
      'package=npm:@scope/package,target=3.1.0,project=node:apps/web,'
      + 'manifest=apps/web/package.json,type=dependency'
    ),
    {
      packageId: 'npm:@scope/package',
      targetVersion: '3.1.0',
      projectId: 'node:apps/web',
      manifest: 'apps/web/package.json',
      dependencyType: 'dependency'
    }
  );
  assert.deepEqual(parseTargetSelector('package=pypi:my-library,target=3.0.0'), {
    packageId: 'pypi:my-library',
    targetVersion: '3.0.0'
  });
  const options = parseArguments([
    'analyze', '.', '--target', 'package=npm:react,target=20.0.0',
    '--target', 'package=pypi:my-library,target=3.0.0',
    '--fail-on-incomplete'
  ]);
  assert.equal(options.targets.length, 2);
  assert.equal(options.failOnIncomplete, true);
  assert.match(HELP, /registry candidate is a fact, not an upgrade recommendation/i);
  assert.match(HELP, /package=npm:@scope\/pkg,target=3\.0\.0/);
  assert.match(HELP, /project,manifest,type,occurrence/);
  assert.match(HELP, /stable sha256 ID shown in ambiguity guidance/);
  assert.throws(
    () => parseTargetSelector('package=npm:react,target=20.0.0,unknown=value'),
    /TARGET_SELECTOR_INVALID/
  );
  assert.throws(
    () => parseArguments(['research', '.', '--target', 'package=npm:react,target=20.0.0']),
    /only supported by analyze and analyze-version/
  );
});

test('target resolution is occurrence-exact, ecosystem-aware, and input-order independent', () => {
  const nodeRoot = input();
  const nodeWorkspace = input({
    projectId: 'node:apps/web',
    manifest: 'apps/web/package.json'
  });
  const python = input({
    projectId: 'python:services/api',
    ecosystem: 'python',
    packageId: 'pypi:my-library',
    name: 'my-library',
    manifest: 'services/api/requirements.txt',
    type: 'runtime',
    declaredVersion: '>=2'
  });
  const selectors = [
    parseTargetSelector(
      'package=npm:framework,target=2.0.0,project=node:apps/web,'
      + 'manifest=apps/web/package.json,type=dependency'
    ),
    parseTargetSelector('package=pypi:my-library,target=3.0.0')
  ];
  const forward = resolveTargetSelectors([nodeRoot, python, nodeWorkspace], selectors);
  const reverse = resolveTargetSelectors(
    [nodeWorkspace, python, nodeRoot],
    [...selectors].reverse()
  );
  assert.deepEqual([...forward.entries()], [...reverse.entries()]);
  assert.equal(forward.get(targetOccurrenceKey(nodeWorkspace)).targetVersion, '2.0.0');
  assert.equal(forward.get(targetOccurrenceKey(python)).targetVersion, '3.0.0');
  assert.equal(forward.has(targetOccurrenceKey(nodeRoot)), false);
});

test('ambiguous, missing, invalid, unsupported, and duplicate target selection fail before runtime', () => {
  const root = input();
  const workspace = input({
    projectId: 'node:apps/web',
    manifest: 'apps/web/package.json'
  });
  assert.throws(
    () => resolveTargetSelectors(
      [workspace, root],
      [parseTargetSelector('package=npm:framework,target=2.0.0')]
    ),
    (error) => error instanceof TargetSelectorError
      && error.code === 'TARGET_SELECTOR_AMBIGUOUS'
      && error.candidates.length === 2
      && /project=node:apps\/web/.test(error.message)
  );
  assert.throws(
    () => resolveTargetSelectors(
      [root],
      [parseTargetSelector('package=npm:missing,target=2.0.0')]
    ),
    (error) => error.code === 'TARGET_SELECTOR_NOT_FOUND'
  );
  assert.throws(
    () => resolveTargetSelectors(
      [root],
      [parseTargetSelector('package=npm:framework,target=not-a-version')]
    ),
    (error) => error.code === 'TARGET_VERSION_INVALID'
  );
  const unsupported = input({
    projectId: 'java:service',
    ecosystem: 'java',
    packageId: 'maven:framework',
    manifest: 'service/pom.xml'
  });
  assert.throws(
    () => resolveTargetSelectors(
      [unsupported],
      [parseTargetSelector('package=maven:framework,target=2.0.0')]
    ),
    (error) => error.code === 'TARGET_VERSION_INVALID'
  );
  assert.throws(
    () => resolveTargetSelectors(
      [root],
      [
        parseTargetSelector('package=npm:framework,target=2.0.0'),
        parseTargetSelector('package=npm:framework,target=3.0.0')
      ]
    ),
    (error) => error.code === 'TARGET_SELECTOR_CONFLICT'
  );
});

test('completion projection distinguishes completed, review, insufficient, partial, and strict exits', () => {
  const completed = buildProductCompletion({
    upgradeDecision: artifact([decision()]),
    artifactPaths: { report: 'report.md', upgradeDecision: 'decision.json' }
  });
  assert.equal(completed.status, 'COMPLETED');
  assert.equal(productCompletionExitCode(completed), 0);
  assert.equal(productCompletionExitCode(completed, { strict: true }), 0);

  const investigate = decision({
    outcome: 'INVESTIGATE',
    target: '2.0.0',
    reason: 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER',
    summary: 'A newer target is available, but no structured recommendation driver is present.',
    review: true
  });
  const review = buildProductCompletion({ upgradeDecision: artifact([investigate]) });
  assert.equal(review.status, 'COMPLETED_WITH_REVIEW');
  assert.equal(productCompletionExitCode(review), 0);
  assert.equal(productCompletionExitCode(review, { strict: true }), 2);
  assert.match(review.decisions[0].nextStep, /--target/);

  const insufficientDecision = decision({
    outcome: 'INSUFFICIENT_EVIDENCE',
    installed: null,
    target: '2.0.0',
    targetPolicy: 'explicit',
    reason: 'INSTALLED_VERSION_UNAVAILABLE',
    summary: 'The installed version baseline is unavailable.',
    coverage: 'unavailable',
    review: true
  });
  const insufficient = buildProductCompletion({
    upgradeDecision: artifact([insufficientDecision])
  });
  assert.equal(insufficient.status, 'INSUFFICIENT_DATA');
  assert.equal(productCompletionExitCode(insufficient), 0);
  assert.equal(productCompletionExitCode(insufficient, { strict: true }), 2);

  const failedDecision = decision({
    outcome: 'NOT_ANALYZED',
    target: '2.0.0',
    reason: 'VERSION_ANALYSIS_FAILED',
    summary: 'No upgrade decision was evaluated because Version Analysis did not complete.',
    review: true
  });
  failedDecision.reasonCodes.push('PROVIDER_REJECTED');
  const partial = buildProductCompletion({
    upgradeDecision: artifact([decision(), failedDecision]),
    versionAnalysis: {
      results: [{
        id: failedDecision.analysisResultId,
        humanReviewReasons: ['OUTPUT_SCHEMA_INVALID'],
        limitations: [{ code: 'OUTPUT_SCHEMA_INVALID', message: 'rejected' }]
      }]
    }
  });
  assert.equal(partial.status, 'PARTIAL');
  assert.equal(productCompletionExitCode(partial), 2);
  assert.equal(partial.failedOccurrences.length, 1);
  assert.match(partial.failedOccurrences[0].recovery, /output was rejected/i);
});

test('decision-first console leads with product outcome and hides raw reason codes', () => {
  const investigate = decision({
    outcome: 'INVESTIGATE',
    target: '2.0.0',
    reason: 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER',
    summary: 'A newer target is available, but no structured recommendation driver is present.',
    review: true
  });
  const completion = buildProductCompletion({
    upgradeDecision: artifact([investigate]),
    artifactPaths: {
      report: '.upgradelens/repository-impact.md',
      upgradeDecision: '.upgradelens/upgrade-decision.json'
    }
  });
  const output = renderConsoleSummary({
    viewModel: viewModel(),
    completion,
    reportPath: '.upgradelens/repository-impact.md',
    upgradeDecisionPath: '.upgradelens/upgrade-decision.json'
  });
  assert.match(output, /^UpgradeLens product outcome\n\nOverall: COMPLETED_WITH_REVIEW/);
  assert.ok(output.indexOf('Upgrade decisions') < output.indexOf('Analysis diagnostics'));
  assert.match(output, /A newer target is available.*use --target/s);
  assert.doesNotMatch(output, /UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER/);
});
