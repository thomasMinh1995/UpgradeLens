import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  analyzeRepositoryImpact,
  buildUsageIndex,
  buildVersionAnalysisManifest,
  createExactSymbolImpactMatcher,
  discoverProject,
  loadImpactAnalysisInputs,
  matchFindingToUsage,
  serializeRepositoryImpact,
  summaryContainsExactSymbol,
  validateRepositoryImpact,
  writeRepositoryImpact
} from '../src/index.js';

const temporaryDirectories = [];

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function lineage() {
  return {
    projectManifest: {
      schemaVersion: '2.0.0',
      artifact: '.upgradelens/project-manifest.json',
      artifactDigest: digest('project'),
      repository: { name: 'fixture', root: '.' }
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

function finding(id, summary, kind = 'breakingChange') {
  return { id, kind, summary, appliesToVersions: ['2.0.0'], evidenceRefs: [] };
}

function analysisResult({ seed, packageId, name, findings, projectId = 'node:.' }) {
  return {
    id: digest(seed),
    dependency: { projectId, packageId, declaredName: name },
    findings
  };
}

function directArtifacts() {
  return {
    versionAnalysis: {
      results: [
        analysisResult({
          seed: 'antd',
          packageId: 'npm:antd',
          name: 'antd',
          findings: [
            finding('button-removed', 'Button was removed.'),
            finding('modal-info-removed', 'Modal.info was removed.'),
            finding('table-removed', 'Table was removed.'),
            finding('compatibility', 'Modal remains compatible.', 'compatibility')
          ]
        }),
        analysisResult({
          seed: 'lodash',
          packageId: 'npm:lodash',
          name: 'lodash',
          findings: [finding('map-removed', 'map was removed.')]
        })
      ]
    },
    usageIndex: {
      dependencies: [
        {
          projectId: 'node:.',
          packageId: 'npm:antd',
          name: 'antd',
          files: ['src/Dialog.tsx', 'src/Home.tsx', 'src/Settings.tsx'],
          symbols: [
            { name: 'Button', files: ['src/Home.tsx'] },
            { name: 'Modal', files: ['src/Dialog.tsx', 'src/Settings.tsx'] },
            { name: 'default', files: ['src/Home.tsx'] },
            { name: '*', files: ['src/Dialog.tsx'] }
          ]
        }
      ]
    }
  };
}

async function temporaryRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-impact-'));
  temporaryDirectories.push(root);
  return root;
}

async function write(root, relative, contents) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

test('exact matcher is case-sensitive, identifier-bounded, and supports API paths', () => {
  assert.equal(summaryContainsExactSymbol('Modal was removed.', 'Modal'), true);
  assert.equal(summaryContainsExactSymbol('Modal.info was removed.', 'Modal'), true);
  assert.equal(summaryContainsExactSymbol('Modal2 was removed.', 'Modal'), false);
  assert.equal(summaryContainsExactSymbol('modal was removed.', 'Modal'), false);
  assert.equal(summaryContainsExactSymbol('The default export changed.', 'default'), false);
  assert.equal(summaryContainsExactSymbol('All exports changed.', '*'), false);

  const matches = matchFindingToUsage(
    finding('modal', 'Modal.info was removed.'),
    { symbols: [{ name: 'Modal', files: ['b.ts', 'a.ts'] }, { name: 'Modal2', files: ['c.ts'] }] }
  );
  assert.deepEqual(matches, [{ symbol: 'Modal', files: ['a.ts', 'b.ts'] }]);
});

test('runtime reports impacted and non-impacted dependencies while retaining all breaking findings', () => {
  const artifacts = directArtifacts();
  const impact = analyzeRepositoryImpact({
    ...artifacts,
    input: lineage(),
    clock: () => new Date('2026-07-16T00:00:00.000Z')
  });

  assert.equal(validateRepositoryImpact(impact), impact);
  assert.deepEqual(impact.summary, {
    impacted: true,
    dependencyCount: 2,
    impactedDependencyCount: 1,
    findingCount: 4,
    impactedFindingCount: 2,
    matchCount: 2,
    affectedFileCount: 3
  });
  const antd = impact.dependencies.find((dependency) => dependency.packageId === 'npm:antd');
  const lodash = impact.dependencies.find((dependency) => dependency.packageId === 'npm:lodash');
  assert.equal(antd.impacted, true);
  assert.deepEqual(antd.findings.map((item) => [item.id, item.impacted]), [
    ['button-removed', true],
    ['modal-info-removed', true],
    ['table-removed', false]
  ]);
  assert.deepEqual(antd.findings[1].matches, [{
    symbol: 'Modal',
    files: ['src/Dialog.tsx', 'src/Settings.tsx']
  }]);
  assert.equal(lodash.impacted, false);
  assert.deepEqual(lodash.findings, [{
    id: 'map-removed',
    kind: 'breakingChange',
    summary: 'map was removed.',
    impacted: false,
    matches: []
  }]);
});

test('dependency absent from Usage Index is deterministically not impacted', () => {
  const { versionAnalysis } = directArtifacts();
  const impact = analyzeRepositoryImpact({
    versionAnalysis,
    usageIndex: { dependencies: [] },
    input: lineage(),
    clock: () => new Date('2026-07-16T00:00:00.000Z')
  });

  assert.equal(impact.summary.impacted, false);
  assert.equal(impact.summary.impactedDependencyCount, 0);
  assert.ok(impact.dependencies.every((dependency) => dependency.impacted === false));
});

test('output is deterministic when dependency, finding, and symbol order changes', () => {
  const first = directArtifacts();
  const second = structuredClone(first);
  second.versionAnalysis.results.reverse();
  second.versionAnalysis.results[1].findings.reverse();
  second.usageIndex.dependencies[0].symbols.reverse();
  const options = {
    input: lineage(),
    matcher: createExactSymbolImpactMatcher(),
    clock: () => new Date('2026-07-16T00:00:00.000Z')
  };

  assert.deepEqual(
    analyzeRepositoryImpact({ ...first, ...options }),
    analyzeRepositoryImpact({ ...second, ...options })
  );
});

function versionArtifacts(project, projectBytes) {
  const contextId = digest('context');
  const dependency = {
    projectId: 'node:.',
    packageId: 'npm:antd',
    declaredName: 'antd',
    normalizedName: 'antd',
    ecosystem: 'node',
    registry: 'npm',
    packageManager: null,
    dependencyType: 'dependency',
    manifest: 'package.json'
  };
  const versions = {
    analysisMode: 'exactBaseline',
    declaredVersion: '1.0.0',
    currentVersion: '1.0.0',
    currentVersionSource: 'exactDeclaration',
    targetVersion: '2.0.0',
    targetPolicy: 'explicit',
    delta: { direction: 'upgrade', classification: 'major' }
  };
  const context = {
    contextVersion: '1',
    contextId,
    lineage: {
      projectManifestDigest: digest(projectBytes),
      knowledgeManifestDigest: digest('knowledge'),
      knowledgeResearchId: digest('research'),
      evidenceArtifactDigest: digest('evidence')
    },
    dependency,
    versions,
    knowledge: { relevantReleases: [], evidence: [] },
    metadata: {
      selectedEvidenceIds: [],
      missingInformation: ['evidence'],
      warnings: [],
      size: { characters: 100, evidenceItems: 0 }
    }
  };
  const result = {
    resultVersion: '1',
    status: 'analyzed',
    contextId,
    dependency: structuredClone(dependency),
    versions: structuredClone(versions),
    summary: 'Button was removed.',
    summaryEvidenceRefs: [],
    riskLevel: 'unknown',
    riskEvidenceRefs: [],
    findings: [finding('button-removed', 'Button was removed.')],
    evidenceCoverage: 'none',
    validation: { status: 'validWithWarnings', warningCodes: ['EVIDENCE_MISSING'] },
    requiresHumanReview: true,
    humanReviewReasons: ['EVIDENCE_NONE'],
    nextAction: 'reviewBeforeImpactAnalysis',
    limitations: [{ code: 'EVIDENCE_MISSING', message: 'Evidence is unavailable.' }]
  };
  return buildVersionAnalysisManifest({
    input: {
      projectManifest: {
        schemaVersion: '2.0.0',
        artifact: '.upgradelens/project-manifest.json',
        artifactDigest: digest(projectBytes),
        repository: { name: project.repository.name, root: '.' }
      },
      knowledgeManifest: {
        schemaVersion: '1.0.0',
        artifact: '.upgradelens/knowledge-manifest.json',
        artifactDigest: digest('knowledge'),
        researchId: digest('research')
      },
      evidenceArtifact: {
        schemaVersion: '1.0.0',
        artifact: '.upgradelens/knowledge-evidence-bundle.json',
        artifactDigest: digest('evidence')
      }
    },
    contexts: [context],
    results: [result],
    generatedAt: '2026-07-16T00:00:01.000Z'
  });
}

test('input loader validates all artifacts, exact lineage, and usage dependency references', async () => {
  const root = await temporaryRepository();
  await write(root, 'package.json', JSON.stringify({ name: 'fixture', dependencies: { antd: '1.0.0' } }));
  const project = await discoverProject(root, { clock: () => new Date('2026-07-16T00:00:00.000Z') });
  const projectBytes = Buffer.from(JSON.stringify(project));
  const version = versionArtifacts(project, projectBytes);
  const versionBytes = Buffer.from(JSON.stringify(version));
  const usage = buildUsageIndex({
    input: {
      projectManifest: version.input.projectManifest,
      versionAnalysis: {
        schemaVersion: '1.0.0',
        artifact: '.upgradelens/version-analysis.json',
        artifactDigest: digest(versionBytes)
      }
    },
    usages: [{
      projectId: 'node:.',
      packageId: 'npm:antd',
      dependency: 'antd',
      symbol: 'Button',
      file: 'src/App.tsx'
    }],
    scannedFileCount: 1,
    analyzedFileCount: 1,
    analyzers: [{ id: 'javascript-typescript', version: '1.0.0' }],
    warnings: [],
    generatedAt: '2026-07-16T00:00:02.000Z'
  });
  const usageBytes = Buffer.from(JSON.stringify(usage));
  const sources = {
    projectManifest: { bytes: projectBytes, artifact: '.upgradelens/project-manifest.json' },
    versionAnalysis: { bytes: versionBytes, artifact: '.upgradelens/version-analysis.json' },
    usageIndex: { bytes: usageBytes, artifact: '.upgradelens/usage-index.json' }
  };

  const loaded = await loadImpactAnalysisInputs(sources);
  assert.equal(loaded.usageIndex.dependencies[0].packageId, 'npm:antd');
  assert.equal(loaded.input.usageIndex.artifactDigest, digest(usageBytes));

  const mismatched = structuredClone(usage);
  mismatched.input.versionAnalysis.artifactDigest = digest('wrong-version');
  await assert.rejects(() => loadImpactAnalysisInputs({
    ...sources,
    usageIndex: {
      bytes: Buffer.from(JSON.stringify(mismatched)),
      artifact: '.upgradelens/usage-index.json'
    }
  }), (error) => error.code === 'LINEAGE_MISMATCH');

  const unknownDependency = structuredClone(usage);
  unknownDependency.dependencies[0].packageId = 'npm:unknown';
  unknownDependency.dependencies[0].name = 'unknown';
  await assert.rejects(() => loadImpactAnalysisInputs({
    ...sources,
    usageIndex: {
      bytes: Buffer.from(JSON.stringify(unknownDependency)),
      artifact: '.upgradelens/usage-index.json'
    }
  }), /has no Version Analysis result/);
});

test('writer validates and atomically writes repository-impact.json', async () => {
  const root = await temporaryRepository();
  const impact = analyzeRepositoryImpact({
    ...directArtifacts(),
    input: lineage(),
    clock: () => new Date('2026-07-16T00:00:00.000Z')
  });
  const target = path.join(root, '.upgradelens/repository-impact.json');

  assert.equal(serializeRepositoryImpact(impact).endsWith('\n'), true);
  assert.equal(await writeRepositoryImpact(target, impact), target);
  assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), impact);
});
