import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildImpactPresentationViewModel,
  renderConsoleSummary,
  renderMarkdownReport
} from '../src/index.js';

function findingFor(spec) {
  if (!spec.finding) return null;
  return {
    id: `finding-${spec.id}`,
    kind: 'breakingChange',
    summary: `${spec.name} API changed.`,
    impacted: spec.impacted,
    matches: spec.impacted ? [{ symbol: 'Widget', files: [`src/${spec.name}.js`] }] : []
  };
}

function evidenceFor(spec, finding) {
  if (!finding) return null;
  return {
    id: `evidence-${spec.id}`,
    findingId: finding.id,
    kind: finding.kind,
    summary: finding.summary,
    impacted: finding.impacted,
    reasonCode: spec.impacted ? 'EXACT_SYMBOL_USAGE_FOUND' : 'DEPENDENCY_NOT_USED',
    matchedSymbols: spec.impacted
      ? [{ symbol: 'Widget', usages: [{ file: `src/${spec.name}.js` }] }]
      : []
  };
}

function artifactsFor(specifications) {
  const specs = specifications.map((spec, index) => ({
    id: spec.id ?? `result-${index + 1}`,
    name: spec.name ?? `dependency-${index + 1}`,
    status: spec.status,
    impacted: spec.impacted ?? false,
    finding: spec.finding ?? false,
    requiresHumanReview: spec.requiresHumanReview ?? spec.status !== 'analyzed',
    internalError: spec.internalError
  }));
  const findingPairs = specs.map((spec) => {
    const impact = findingFor(spec);
    return { impact, evidence: evidenceFor(spec, impact) };
  });
  const dependencyCount = specs.length;
  const analyzedCount = specs.filter((spec) => spec.status === 'analyzed').length;
  const skippedCount = specs.filter((spec) => spec.status === 'skipped').length;
  const failedCount = specs.filter((spec) => spec.status === 'failed').length;
  const requiresHumanReviewCount = specs.filter((spec) => spec.requiresHumanReview).length;
  const impactedDependencyCount = specs.filter((spec) => spec.impacted).length;
  const findingCount = findingPairs.filter((pair) => pair.impact).length;
  const impactedFindingCount = findingPairs.filter((pair) => pair.impact?.impacted).length;
  const affectedFileCount = impactedFindingCount;

  return {
    projectManifest: { repository: { name: 'Fixture Repository', root: '.' } },
    versionAnalysis: {
      summary: {
        resultCount: dependencyCount,
        analyzedCount,
        skippedCount,
        failedCount,
        requiresHumanReviewCount
      },
      results: specs.map((spec, index) => ({
        id: spec.id,
        status: spec.status,
        requiresHumanReview: spec.requiresHumanReview,
        dependency: {
          projectId: 'node:.',
          packageId: `npm:${spec.name}`,
          declaredName: spec.name
        },
        findings: findingPairs[index].impact ? [{ id: findingPairs[index].impact.id }] : [],
        ...(spec.internalError ? { error: spec.internalError } : {})
      }))
    },
    repositoryImpact: {
      summary: {
        impacted: impactedDependencyCount > 0,
        dependencyCount,
        impactedDependencyCount,
        findingCount,
        impactedFindingCount,
        matchCount: impactedFindingCount,
        affectedFileCount
      },
      dependencies: specs.map((spec, index) => ({
        analysisResultId: spec.id,
        projectId: 'node:.',
        packageId: `npm:${spec.name}`,
        name: spec.name,
        impacted: spec.impacted,
        findings: findingPairs[index].impact ? [findingPairs[index].impact] : []
      }))
    },
    impactEvidence: {
      summary: {
        impacted: impactedDependencyCount > 0,
        dependencyCount,
        findingCount,
        impactedFindingCount,
        matchedSymbolCount: impactedFindingCount,
        usageRecordCount: impactedFindingCount,
        affectedFileCount,
        reasonCounts: {
          DEPENDENCY_NOT_USED: findingCount - impactedFindingCount,
          EXACT_SYMBOL_USAGE_FOUND: impactedFindingCount,
          NO_EXACT_SYMBOL_USAGE_FOUND: 0,
          NO_MATCHABLE_SYMBOL_FOUND: 0
        }
      },
      dependencies: specs.map((spec, index) => ({
        analysisResultId: spec.id,
        projectId: 'node:.',
        packageId: `npm:${spec.name}`,
        name: spec.name,
        impacted: spec.impacted,
        findings: findingPairs[index].evidence ? [findingPairs[index].evidence] : []
      }))
    }
  };
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

test('all 47 skipped dependencies are explicitly NOT_ANALYZED', () => {
  const artifacts = artifactsFor(Array.from({ length: 47 }, (_, index) => ({
    name: `dependency-${index + 1}`,
    status: 'skipped'
  })));
  const viewModel = buildImpactPresentationViewModel(artifacts);
  const markdown = renderMarkdownReport({ viewModel });
  const consoleOutput = renderConsoleSummary({
    viewModel,
    reportPath: '.upgradelens/repository-impact.md'
  });

  assert.equal(viewModel.analysisStatus, 'INCOMPLETE');
  assert.deepEqual(
    {
      analyzed: viewModel.summary.analyzedCount,
      skipped: viewModel.summary.skippedCount,
      failed: viewModel.summary.failedCount,
      impacted: viewModel.summary.impactedCount,
      notImpacted: viewModel.summary.notImpactedCount,
      notAnalyzed: viewModel.summary.notAnalyzedCount
    },
    { analyzed: 0, skipped: 47, failed: 0, impacted: 0, notImpacted: 0, notAnalyzed: 47 }
  );
  assert.equal(countMatches(markdown, /- Impact status: `NOT_ANALYZED`/g), 47);
  assert.match(markdown, /Impact conclusions are incomplete/);
  assert.doesNotMatch(markdown, /- Impact status: `NOT_IMPACTED`/);
  assert.doesNotMatch(markdown, /Impacted: No/);
  assert.match(consoleOutput, /Analysis status: INCOMPLETE/);
  assert.match(consoleOutput, /Not analyzed: 47/);
  assert.doesNotMatch(consoleOutput, /Not impacted: 47/);
});

test('mixed Version Analysis states produce all three dependency impact states', () => {
  const artifacts = artifactsFor([
    { name: 'impacted', status: 'analyzed', impacted: true, finding: true },
    { name: 'clear', status: 'analyzed' },
    { name: 'skipped', status: 'skipped' },
    { name: 'failed', status: 'failed' }
  ]);
  const viewModel = buildImpactPresentationViewModel(artifacts);

  assert.equal(viewModel.analysisStatus, 'INCOMPLETE');
  assert.deepEqual(
    viewModel.dependencies.map((dependency) => dependency.impactStatus),
    ['IMPACTED', 'NOT_IMPACTED', 'NOT_ANALYZED', 'NOT_ANALYZED']
  );
  assert.equal(viewModel.summary.impactedCount, 1);
  assert.equal(viewModel.summary.notImpactedCount, 1);
  assert.equal(viewModel.summary.notAnalyzedCount, 2);
  assert.equal(
    viewModel.summary.impactedCount
      + viewModel.summary.notImpactedCount
      + viewModel.summary.notAnalyzedCount,
    viewModel.summary.dependencyCount
  );
});

test('all analyzed dependencies produce a COMPLETE presentation', () => {
  const artifacts = artifactsFor([
    { name: 'impacted', status: 'analyzed', impacted: true, finding: true },
    { name: 'clear', status: 'analyzed' }
  ]);
  const viewModel = buildImpactPresentationViewModel(artifacts);
  const markdown = renderMarkdownReport({ viewModel });

  assert.equal(viewModel.analysisStatus, 'COMPLETE');
  assert.equal(viewModel.summary.notAnalyzedCount, 0);
  assert.doesNotMatch(markdown, /Impact conclusions are incomplete/);
});

test('failed dependency renders safely without leaking raw internal errors', () => {
  const secret = 'https://ai.internal.test/v1 key=super-secret';
  const artifacts = artifactsFor([{
    name: 'failed-package',
    status: 'failed',
    internalError: {
      message: secret,
      stack: `Error: ${secret}\n    at private-runtime.js:42:1`
    }
  }]);
  const viewModel = buildImpactPresentationViewModel(artifacts);
  const outputs = [
    renderMarkdownReport({ viewModel }),
    renderConsoleSummary({ viewModel, reportPath: '.upgradelens/repository-impact.md' })
  ];

  assert.equal(viewModel.dependencies[0].impactStatus, 'NOT_ANALYZED');
  for (const output of outputs) {
    assert.match(output, /failed/i);
    assert.doesNotMatch(output, /super-secret|ai\.internal|private-runtime\.js/);
  }
});

test('presentation rejects inconsistent artifact counts', () => {
  const artifacts = artifactsFor([{ name: 'one', status: 'analyzed' }]);
  artifacts.versionAnalysis.summary.resultCount = 2;

  assert.throws(
    () => buildImpactPresentationViewModel(artifacts),
    /Version Analysis summary\.resultCount is 2; expected 1/
  );
});

test('presentation and both renderers are deterministic', () => {
  const artifacts = artifactsFor([
    { name: 'zeta', status: 'analyzed' },
    { name: 'alpha', status: 'skipped' }
  ]);
  const first = buildImpactPresentationViewModel(artifacts);
  const second = buildImpactPresentationViewModel(artifacts);

  assert.deepEqual(first, second);
  assert.equal(renderMarkdownReport({ viewModel: first }), renderMarkdownReport({ viewModel: second }));
  assert.equal(
    renderConsoleSummary({ viewModel: first, reportPath: 'report.md' }),
    renderConsoleSummary({ viewModel: second, reportPath: 'report.md' })
  );
});

test('presentation construction and rendering do not mutate business artifacts', () => {
  const artifacts = artifactsFor([
    { name: 'impacted', status: 'analyzed', impacted: true, finding: true },
    { name: 'skipped', status: 'skipped' }
  ]);
  const before = structuredClone(artifacts);
  const viewModel = buildImpactPresentationViewModel(artifacts);
  renderMarkdownReport({ viewModel });
  renderConsoleSummary({ viewModel, reportPath: 'report.md' });

  assert.deepEqual(artifacts, before);
  assert.ok(Object.isFrozen(viewModel));
  assert.ok(Object.isFrozen(viewModel.dependencies[0]));
});

test('presentation rejects a missing analysisResultId cross-reference', () => {
  const artifacts = artifactsFor([{ name: 'one', status: 'analyzed' }]);
  artifacts.repositoryImpact.dependencies[0].analysisResultId = 'missing-result';

  assert.throws(
    () => buildImpactPresentationViewModel(artifacts),
    /Version Analysis result result-1 has no Repository Impact record/
  );
});
