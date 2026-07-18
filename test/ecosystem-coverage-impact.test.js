import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  analyzeRepositoryImpact,
  buildImpactPresentationViewModel,
  generateRepositoryImpactEvidence,
  renderConsoleSummary,
  renderMarkdownReport
} from '../src/index.js';

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function coverage(projectId, projectPath, ecosystem, status = 'complete', reasonCode = 'COVERAGE_COMPLETE') {
  return {
    projectId,
    projectPath,
    ecosystem,
    status,
    analyzer: status === 'unavailable'
      ? null
      : { id: 'javascript-typescript', version: '1.0.0' },
    scannedFileCount: status === 'unavailable' ? 0 : 1,
    analyzedFileCount: status === 'complete' ? 1 : 0,
    parseFailureCount: status === 'partial' ? 1 : 0,
    analyzerFailureCount: status === 'failed' ? 1 : 0,
    unreadableFileCount: 0,
    scanFailureCount: 0,
    reasonCode
  };
}

function result({
  id,
  projectId,
  packageId,
  name,
  ecosystem,
  symbol,
  status = 'analyzed'
}) {
  return {
    id: digest(id),
    status,
    requiresHumanReview: status !== 'analyzed',
    dependency: {
      projectId,
      packageId,
      declaredName: name,
      ecosystem
    },
    findings: status === 'analyzed'
      ? [{
          id: `${id}-finding`,
          kind: 'breakingChange',
          summary: `${symbol} was removed.`
        }]
      : []
  };
}

function lineage() {
  return {
    projectManifest: {
      schemaVersion: '2.0.0',
      artifact: '.upgradelens/project-manifest.json',
      artifactDigest: digest('project'),
      repository: { name: 'polyglot-fixture', root: '.' }
    },
    versionAnalysis: {
      schemaVersion: '1.0.0',
      artifact: '.upgradelens/version-analysis.json',
      artifactDigest: digest('version')
    },
    usageIndex: {
      schemaVersion: '1.0.0',
      artifact: '.upgradelens/usage-index.json',
      artifactDigest: digest('usage')
    }
  };
}

test('project/ecosystem coverage drives five impact states without cross-project merges', () => {
  const results = [
    result({
      id: 'app-a-react',
      projectId: 'node:apps/a',
      packageId: 'npm:react',
      name: 'react',
      ecosystem: 'node',
      symbol: 'Modal.info'
    }),
    result({
      id: 'app-b-react',
      projectId: 'node:apps/b',
      packageId: 'npm:react',
      name: 'react',
      ecosystem: 'node',
      symbol: 'Modal'
    }),
    result({
      id: 'app-a-unused',
      projectId: 'node:apps/a',
      packageId: 'npm:unused',
      name: 'unused',
      ecosystem: 'node',
      symbol: 'removed'
    }),
    result({
      id: 'python-langsmith',
      projectId: 'python:services/api',
      packageId: 'pypi:langsmith',
      name: 'langsmith',
      ecosystem: 'python',
      symbol: 'Client'
    }),
    result({
      id: 'partial-node',
      projectId: 'node:apps/partial',
      packageId: 'npm:partial',
      name: 'partial',
      ecosystem: 'node',
      symbol: 'Widget'
    }),
    result({
      id: 'skipped-python',
      projectId: 'python:services/skipped',
      packageId: 'pypi:skipped',
      name: 'skipped',
      ecosystem: 'python',
      symbol: 'Client',
      status: 'skipped'
    })
  ];
  const usageIndex = {
    analysis: {
      coverage: [
        coverage('node:apps/a', 'apps/a', 'node'),
        coverage('node:apps/b', 'apps/b', 'node'),
        coverage(
          'node:apps/partial',
          'apps/partial',
          'node',
          'partial',
          'SOURCE_PARSE_FAILED'
        ),
        coverage(
          'python:services/api',
          'services/api',
          'python',
          'unavailable',
          'ANALYZER_UNAVAILABLE'
        ),
        coverage(
          'python:services/skipped',
          'services/skipped',
          'python',
          'unavailable',
          'ANALYZER_UNAVAILABLE'
        )
      ],
      analyzers: [{ id: 'javascript-typescript', version: '1.0.0' }],
      scannedFileCount: 3,
      analyzedFileCount: 2
    },
    dependencies: [
      {
        projectId: 'node:apps/a',
        packageId: 'npm:react',
        name: 'react',
        files: ['apps/a/src/App.tsx'],
        symbols: [{ name: 'Modal', files: ['apps/a/src/App.tsx'] }]
      },
      {
        projectId: 'node:apps/b',
        packageId: 'npm:react',
        name: 'react',
        files: ['apps/b/src/App.tsx'],
        symbols: [{ name: 'LegacyModal', files: ['apps/b/src/App.tsx'] }]
      }
    ]
  };
  const versionAnalysis = {
    summary: {
      resultCount: results.length,
      analyzedCount: 5,
      skippedCount: 1,
      failedCount: 0,
      requiresHumanReviewCount: 1
    },
    results
  };
  const repositoryImpact = analyzeRepositoryImpact({
    versionAnalysis,
    usageIndex,
    input: lineage(),
    clock: () => new Date('2026-07-18T00:00:00.000Z')
  });
  const impactEvidence = generateRepositoryImpactEvidence({
    repositoryImpact,
    usageIndex,
    input: {
      ...lineage(),
      repositoryImpact: {
        schemaVersion: '1.0.0',
        artifact: '.upgradelens/repository-impact.json',
        artifactDigest: digest('impact')
      }
    },
    clock: () => new Date('2026-07-18T00:00:01.000Z')
  });
  const states = new Map(repositoryImpact.dependencies.map((item) => [item.analysisResultId, item]));

  assert.equal(states.get(digest('app-a-react')).status, 'IMPACTED');
  assert.equal(states.get(digest('app-b-react')).status, 'NOT_IMPACTED');
  assert.equal(states.get(digest('app-a-unused')).status, 'USAGE_NOT_FOUND');
  assert.equal(states.get(digest('python-langsmith')).status, 'COVERAGE_UNAVAILABLE');
  assert.equal(states.get(digest('partial-node')).status, 'COVERAGE_UNAVAILABLE');
  assert.equal(states.get(digest('skipped-python')).status, 'NOT_ANALYZED');
  assert.deepEqual(states.get(digest('app-a-react')).findings[0].matches, [{
    symbol: 'Modal',
    files: ['apps/a/src/App.tsx']
  }]);
  assert.deepEqual(states.get(digest('app-b-react')).findings[0].matches, []);
  assert.equal(
    impactEvidence.summary.reasonCounts.DEPENDENCY_NOT_USED,
    0
  );
  assert.doesNotMatch(JSON.stringify(impactEvidence.dependencies), /DEPENDENCY_NOT_USED/);

  const projectManifest = { repository: { name: 'polyglot-fixture', root: '.' } };
  const viewModel = buildImpactPresentationViewModel({
    projectManifest,
    versionAnalysis,
    repositoryImpact,
    impactEvidence
  });
  assert.deepEqual({
    impacted: viewModel.summary.impactedCount,
    notImpacted: viewModel.summary.notImpactedCount,
    usageNotFound: viewModel.summary.usageNotFoundCount,
    coverageUnavailable: viewModel.summary.coverageUnavailableCount,
    notAnalyzed: viewModel.summary.notAnalyzedCount
  }, {
    impacted: 1,
    notImpacted: 1,
    usageNotFound: 1,
    coverageUnavailable: 2,
    notAnalyzed: 1
  });
  const markdown = renderMarkdownReport({ viewModel });
  const consoleOutput = renderConsoleSummary({ viewModel, reportPath: 'impact.md' });
  assert.match(markdown, /Coverage unavailable \| 2/);
  assert.match(markdown, /ANALYZER_UNAVAILABLE/);
  assert.doesNotMatch(markdown, /langsmith[\s\S]*?Impact status: `NOT_IMPACTED`/);
  assert.match(consoleOutput, /Usage not found: 1/);
  assert.match(consoleOutput, /Coverage unavailable: 2/);
});

test('legacy Usage Index without coverage metadata fails safe', () => {
  const versionAnalysis = {
    summary: {
      resultCount: 1,
      analyzedCount: 1,
      skippedCount: 0,
      failedCount: 0,
      requiresHumanReviewCount: 0
    },
    results: [result({
      id: 'legacy-python',
      projectId: 'python:.',
      packageId: 'pypi:langsmith',
      name: 'langsmith',
      ecosystem: 'python',
      symbol: 'Client'
    })]
  };
  const usageIndex = {
    analysis: {
      analyzers: [{ id: 'javascript-typescript', version: '1.0.0' }],
      scannedFileCount: 0,
      analyzedFileCount: 0
    },
    dependencies: []
  };
  const repositoryImpact = analyzeRepositoryImpact({
    versionAnalysis,
    usageIndex,
    input: lineage()
  });
  const dependency = repositoryImpact.dependencies[0];
  assert.equal(dependency.status, 'COVERAGE_UNAVAILABLE');
  assert.equal(dependency.reasonCode, 'COVERAGE_METADATA_MISSING');
  assert.equal(dependency.impacted, false);
});
