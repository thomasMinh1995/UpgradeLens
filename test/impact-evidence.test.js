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
  discoverProject,
  generateRepositoryImpactEvidence,
  loadImpactEvidenceInputs,
  serializeRepositoryImpactEvidence,
  validateRepositoryImpactEvidence,
  writeRepositoryImpactEvidence
} from '../src/index.js';

const temporaryDirectories = [];

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

async function temporaryRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-impact-evidence-'));
  temporaryDirectories.push(root);
  return root;
}

async function write(root, relative, contents) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

function inputLineage() {
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
    },
    repositoryImpact: {
      schemaVersion: '1.0.0',
      artifact: '.upgradelens/repository-impact.json',
      artifactDigest: digest('impact')
    }
  };
}

function impactFinding(id, summary, matches = []) {
  return {
    id,
    kind: 'breakingChange',
    summary,
    impacted: matches.length > 0,
    matches
  };
}

function directArtifacts() {
  return {
    repositoryImpact: {
      dependencies: [
        {
          analysisResultId: digest('antd-result'),
          projectId: 'node:.',
          packageId: 'npm:antd',
          name: 'antd',
          impacted: true,
          findings: [
            impactFinding('button-removed', 'Button was removed.', [
              { symbol: 'Button', files: ['src/Home.tsx', 'src/Settings.tsx'] }
            ]),
            impactFinding('components-removed', 'Button and Modal were removed.', [
              { symbol: 'Button', files: ['src/Home.tsx', 'src/Settings.tsx'] },
              { symbol: 'Modal', files: ['src/Dialog.tsx', 'src/UserModal.tsx'] }
            ]),
            impactFinding('table-removed', 'Table was removed.')
          ]
        },
        {
          analysisResultId: digest('lodash-result'),
          projectId: 'node:.',
          packageId: 'npm:lodash',
          name: 'lodash',
          impacted: false,
          findings: [impactFinding('map-removed', 'map was removed.')]
        },
        {
          analysisResultId: digest('synthetic-result'),
          projectId: 'node:.',
          packageId: 'npm:synthetic',
          name: 'synthetic',
          impacted: false,
          findings: [impactFinding('export-changed', 'NamedExport was removed.')]
        }
      ]
    },
    usageIndex: {
      analysis: {
        coverage: [{
          projectId: 'node:.',
          projectPath: '.',
          ecosystem: 'node',
          status: 'complete',
          analyzer: { id: 'javascript-typescript', version: '1.0.0' },
          scannedFileCount: 5,
          analyzedFileCount: 5,
          parseFailureCount: 0,
          analyzerFailureCount: 0,
          unreadableFileCount: 0,
          scanFailureCount: 0,
          reasonCode: 'COVERAGE_COMPLETE'
        }]
      },
      dependencies: [
        {
          projectId: 'node:.',
          packageId: 'npm:antd',
          name: 'antd',
          symbols: [
            { name: 'Button', files: ['src/Home.tsx', 'src/Settings.tsx'] },
            { name: 'Modal', files: ['src/Dialog.tsx', 'src/UserModal.tsx'] }
          ]
        },
        {
          projectId: 'node:.',
          packageId: 'npm:synthetic',
          name: 'synthetic',
          symbols: [
            { name: '*', files: ['src/synthetic.ts'] },
            { name: 'default', files: ['src/synthetic.ts'] }
          ]
        }
      ]
    }
  };
}

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

test('generates evidence for one matched symbol and multiple usage records', () => {
  const evidence = generateRepositoryImpactEvidence({
    ...directArtifacts(),
    input: inputLineage(),
    clock: () => new Date('2026-07-16T00:00:00.000Z')
  });
  const finding = evidence.dependencies[0].findings.find((item) => item.findingId === 'button-removed');

  assert.equal(validateRepositoryImpactEvidence(evidence), evidence);
  assert.equal(finding.impacted, true);
  assert.equal(finding.reasonCode, 'EXACT_SYMBOL_USAGE_FOUND');
  assert.deepEqual(finding.matchedSymbols, [{
    symbol: 'Button',
    usages: [{ file: 'src/Home.tsx' }, { file: 'src/Settings.tsx' }]
  }]);
});

test('preserves multiple symbols and every impacted and non-impacted finding', () => {
  const evidence = generateRepositoryImpactEvidence({
    ...directArtifacts(),
    input: inputLineage(),
    clock: () => new Date('2026-07-16T00:00:00.000Z')
  });
  const antd = evidence.dependencies.find((dependency) => dependency.packageId === 'npm:antd');
  const combined = antd.findings.find((item) => item.findingId === 'components-removed');

  assert.deepEqual(combined.matchedSymbols.map((item) => item.symbol), ['Button', 'Modal']);
  assert.deepEqual(antd.findings.map((item) => item.findingId), [
    'button-removed',
    'components-removed',
    'table-removed'
  ]);
  assert.deepEqual(evidence.summary, {
    impacted: true,
    dependencyCount: 3,
    findingCount: 5,
    impactedFindingCount: 2,
    matchedSymbolCount: 3,
    usageRecordCount: 6,
    affectedFileCount: 4,
    reasonCounts: {
      DEPENDENCY_NOT_USED: 0,
      EXACT_SYMBOL_USAGE_FOUND: 2,
      NO_EXACT_SYMBOL_USAGE_FOUND: 1,
      NO_MATCHABLE_SYMBOL_FOUND: 1,
      USAGE_NOT_FOUND: 1,
      COVERAGE_UNAVAILABLE: 0,
      NOT_ANALYZED: 0
    }
  });
});

test('uses deterministic reason codes for verified no match, missing usage, and no matchable symbol', () => {
  const evidence = generateRepositoryImpactEvidence({
    ...directArtifacts(),
    input: inputLineage()
  });
  const reasons = new Map(evidence.dependencies.flatMap((dependency) => (
    dependency.findings.map((finding) => [finding.findingId, finding.reasonCode])
  )));

  assert.equal(reasons.get('table-removed'), 'NO_EXACT_SYMBOL_USAGE_FOUND');
  assert.equal(reasons.get('map-removed'), 'USAGE_NOT_FOUND');
  assert.equal(reasons.get('export-changed'), 'NO_MATCHABLE_SYMBOL_FOUND');
});

test('does not invent line numbers, snippets, call counts, or usage kinds', () => {
  const evidence = generateRepositoryImpactEvidence({
    ...directArtifacts(),
    input: inputLineage()
  });
  const forbidden = new Set(['line', 'lineNumber', 'column', 'snippet', 'callCount', 'kind']);
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'kind' && child === 'breakingChange') continue;
      assert.equal(forbidden.has(key), false, `unexpected source-detail field ${key}`);
      visit(child);
    }
  };
  visit(evidence);
});

test('output and stable evidence ids are deterministic across input ordering', () => {
  const first = directArtifacts();
  const second = structuredClone(first);
  second.repositoryImpact.dependencies.reverse();
  second.repositoryImpact.dependencies[2].findings.reverse();
  second.repositoryImpact.dependencies[2].findings[1].matches.reverse();
  second.repositoryImpact.dependencies[2].findings[1].matches[0].files.reverse();
  second.usageIndex.dependencies.reverse();
  second.usageIndex.dependencies[1].symbols.reverse();
  const options = { input: inputLineage(), clock: () => new Date('2026-07-16T00:00:00.000Z') };

  const left = generateRepositoryImpactEvidence({ ...first, ...options });
  const right = generateRepositoryImpactEvidence({ ...second, ...options });
  assert.deepEqual(left, right);
  assert.match(left.dependencies[0].findings[0].id, /^sha256:[a-f0-9]{64}$/);
});

function finding(id, summary) {
  return { id, kind: 'breakingChange', summary, appliesToVersions: ['2.0.0'], evidenceRefs: [] };
}

function buildVersionArtifacts(project, projectBytes) {
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

async function serializedArtifacts() {
  const root = await temporaryRepository();
  await write(root, 'package.json', JSON.stringify({ name: 'fixture', dependencies: { antd: '1.0.0' } }));
  const project = await discoverProject(root, { clock: () => new Date('2026-07-16T00:00:00.000Z') });
  const projectBytes = Buffer.from(JSON.stringify(project));
  const version = buildVersionArtifacts(project, projectBytes);
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
  const impact = analyzeRepositoryImpact({
    versionAnalysis: version,
    usageIndex: usage,
    input: {
      ...usage.input,
      usageIndex: {
        schemaVersion: '1.0.0',
        artifact: '.upgradelens/usage-index.json',
        artifactDigest: digest(usageBytes)
      }
    },
    clock: () => new Date('2026-07-16T00:00:03.000Z')
  });
  const impactBytes = Buffer.from(JSON.stringify(impact));
  return {
    project,
    version,
    usage,
    impact,
    sources: {
      projectManifest: { bytes: projectBytes, artifact: '.upgradelens/project-manifest.json' },
      versionAnalysis: { bytes: versionBytes, artifact: '.upgradelens/version-analysis.json' },
      usageIndex: { bytes: usageBytes, artifact: '.upgradelens/usage-index.json' },
      repositoryImpact: { bytes: impactBytes, artifact: '.upgradelens/repository-impact.json' }
    }
  };
}

test('loader validates four schemas, exact-byte lineage, and returns Repository Impact lineage', async () => {
  const artifacts = await serializedArtifacts();
  const loaded = await loadImpactEvidenceInputs(artifacts.sources);

  assert.equal(loaded.repositoryImpact.dependencies[0].impacted, true);
  assert.equal(
    loaded.input.repositoryImpact.artifactDigest,
    digest(artifacts.sources.repositoryImpact.bytes)
  );
});

test('loader rejects schema and lineage mismatches', async () => {
  const artifacts = await serializedArtifacts();
  const schemaMismatch = structuredClone(artifacts.impact);
  schemaMismatch.schemaVersion = '9.0.0';
  await assert.rejects(() => loadImpactEvidenceInputs({
    ...artifacts.sources,
    repositoryImpact: {
      bytes: Buffer.from(JSON.stringify(schemaMismatch)),
      artifact: '.upgradelens/repository-impact.json'
    }
  }), /unsupported Repository Impact schema version/);

  const lineageMismatch = structuredClone(artifacts.impact);
  lineageMismatch.input.usageIndex.artifactDigest = digest('wrong-usage');
  await assert.rejects(() => loadImpactEvidenceInputs({
    ...artifacts.sources,
    repositoryImpact: {
      bytes: Buffer.from(JSON.stringify(lineageMismatch)),
      artifact: '.upgradelens/repository-impact.json'
    }
  }), (error) => error.code === 'LINEAGE_MISMATCH');
});

test('loader rejects invalid dependency, finding, symbol, and file references', async () => {
  const artifacts = await serializedArtifacts();
  const cases = [];

  const dependency = structuredClone(artifacts.impact);
  dependency.dependencies[0].analysisResultId = digest('unknown-result');
  cases.push([dependency, /unknown Version Analysis result/]);

  const findingReference = structuredClone(artifacts.impact);
  findingReference.dependencies[0].findings[0].id = 'unknown-finding';
  cases.push([findingReference, /unknown finding/]);

  const symbolReference = structuredClone(artifacts.impact);
  symbolReference.dependencies[0].findings[0].matches[0].symbol = 'UnknownButton';
  cases.push([symbolReference, /usage match mismatch/]);

  const fileReference = structuredClone(artifacts.impact);
  fileReference.dependencies[0].findings[0].matches[0].files = ['src/Other.tsx'];
  cases.push([fileReference, /usage match mismatch/]);

  for (const [impact, expected] of cases) {
    await assert.rejects(() => loadImpactEvidenceInputs({
      ...artifacts.sources,
      repositoryImpact: {
        bytes: Buffer.from(JSON.stringify(impact)),
        artifact: '.upgradelens/repository-impact.json'
      }
    }), expected);
  }
});

test('atomic writer publishes validated evidence with a final newline', async () => {
  const root = await temporaryRepository();
  const evidence = generateRepositoryImpactEvidence({
    ...directArtifacts(),
    input: inputLineage(),
    clock: () => new Date('2026-07-16T00:00:00.000Z')
  });
  const target = path.join(root, '.upgradelens/repository-impact-evidence.json');

  assert.equal(serializeRepositoryImpactEvidence(evidence).endsWith('\n'), true);
  assert.equal(await writeRepositoryImpactEvidence(target, evidence), target);
  assert.deepEqual(JSON.parse(await readFile(target, 'utf8')), evidence);
});
