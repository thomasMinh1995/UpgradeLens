import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  analyzeJavaScriptUsage,
  buildVersionAnalysisManifest,
  buildUsageIndex,
  createJavaScriptUsageAnalyzer,
  createUsageAnalyzerRegistry,
  discoverProject,
  discoverRepositoryUsage,
  loadUsageDiscoveryInputs,
  npmPackageName,
  validateUsageIndex
} from '../src/index.js';

const temporaryDirectories = [];
const dependency = { name: 'antd', packageId: 'npm:antd' };

function analyze(source, file = 'src/example.tsx', dependencies = [dependency]) {
  return analyzeJavaScriptUsage({ source, file, dependencies });
}

function symbols(usages) {
  return usages.map((usage) => usage.symbol);
}

async function temporaryRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-usage-'));
  temporaryDirectories.push(root);
  return root;
}

async function write(root, relative, contents) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

function digest(seed) {
  return `sha256:${createHash('sha256').update(seed).digest('hex')}`;
}

function projectManifest() {
  return {
    projects: [
      {
        id: 'node:.',
        path: '.',
        ecosystem: 'node',
        dependencies: [
          {
            name: 'antd',
            normalizedName: 'antd',
            type: 'dependency',
            manifest: 'package.json'
          }
        ]
      }
    ]
  };
}

function versionAnalysis() {
  return {
    results: [
      {
        dependency: {
          projectId: 'node:.',
          packageId: 'npm:antd',
          declaredName: 'antd',
          normalizedName: 'antd',
          ecosystem: 'node',
          dependencyType: 'dependency',
          manifest: 'package.json'
        }
      }
    ]
  };
}

function input() {
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
      artifactDigest: digest('version-analysis')
    }
  };
}

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

test('discovers referenced named imports by exported symbol and ignores unused specifiers', () => {
  const usages = analyze(`
    import { Button as PrimaryButton, Modal } from 'antd';
    export function View() { return <PrimaryButton />; }
  `);

  assert.deepEqual(symbols(usages), ['Button']);
});

test('discovers a referenced default import', () => {
  assert.deepEqual(symbols(analyze(`
    import client from 'antd';
    client.configure();
  `)), ['default']);
});

test('discovers concrete namespace members and namespace value usage', () => {
  assert.deepEqual(symbols(analyze(`
    import * as Ant from 'antd';
    const button = <Ant.Button />;
    Ant.Modal.open();
  `)), ['Button', 'Modal']);
  assert.deepEqual(symbols(analyze(`
    import * as Ant from 'antd';
    consume(Ant);
  `)), ['*']);
});

test('discovers named, default, namespace re-exports', () => {
  assert.deepEqual(symbols(analyze(`
    export { Button, default as Root } from 'antd';
    export * from 'antd';
  `)), ['*', 'Button', 'default']);
});

test('ignores unused and shadowed imported bindings', () => {
  assert.deepEqual(analyze(`
    import { Button } from 'antd';
    function render(Button) { return Button; }
  `), []);
});

test('discovers constant dynamic imports when enabled by the JS analyzer', () => {
  assert.deepEqual(symbols(analyze(`const module = await import('antd');`)), ['*']);
  assert.deepEqual(analyze(`const module = await import(packageName);`), []);
});

test('maps npm subpaths and scoped package subpaths to package roots', () => {
  assert.equal(npmPackageName('antd/es/button'), 'antd');
  assert.equal(npmPackageName('@scope/ui/button'), '@scope/ui');
  assert.equal(npmPackageName('./local.js'), null);
  assert.deepEqual(symbols(analyze(`
    import { Button } from 'antd/es/button';
    Button.render();
  `)), ['Button']);
});

test('records side-effect imports as dependency locations without inventing a symbol', () => {
  assert.deepEqual(analyze(`import 'antd';`), [{
    packageId: 'npm:antd',
    dependency: 'antd',
    symbol: null,
    file: 'src/example.tsx'
  }]);
});

test('analyzer registry rejects capability conflicts and selects by ecosystem and extension', () => {
  const analyzer = createJavaScriptUsageAnalyzer();
  const registry = createUsageAnalyzerRegistry([analyzer]);
  assert.equal(registry.find('node', 'src/App.TSX'), analyzer);
  assert.equal(registry.find('python', 'src/App.tsx'), null);
  assert.throws(() => createUsageAnalyzerRegistry([analyzer, { ...analyzer, id: 'other' }]), /conflict/);
});

test('builds and validates a deterministic usage index', () => {
  const index = buildUsageIndex({
    input: input(),
    usages: [
      { projectId: 'node:.', packageId: 'npm:antd', dependency: 'antd', symbol: 'Modal', file: 'z.ts' },
      { projectId: 'node:.', packageId: 'npm:antd', dependency: 'antd', symbol: 'Button', file: 'a.ts' },
      { projectId: 'node:.', packageId: 'npm:antd', dependency: 'antd', symbol: null, file: 'side-effect.ts' },
      { projectId: 'node:.', packageId: 'npm:antd', dependency: 'antd', symbol: 'Button', file: 'z.ts' }
    ],
    scannedFileCount: 4,
    analyzedFileCount: 4,
    analyzers: [createJavaScriptUsageAnalyzer()],
    warnings: [],
    generatedAt: '2026-07-16T00:00:00.000Z'
  });

  assert.equal(validateUsageIndex(index), index);
  assert.deepEqual(index.summary, { dependencyCount: 1, symbolCount: 2, fileCount: 3, warningCount: 0 });
  assert.deepEqual(index.dependencies[0], {
    projectId: 'node:.',
    packageId: 'npm:antd',
    name: 'antd',
    files: ['a.ts', 'side-effect.ts', 'z.ts'],
    symbols: [
      { name: 'Button', files: ['a.ts', 'z.ts'] },
      { name: 'Modal', files: ['z.ts'] }
    ]
  });

  const invalid = structuredClone(index);
  invalid.dependencies[0].symbols[0].files.push('missing.ts');
  assert.throws(() => validateUsageIndex(invalid), /missing from dependency files/);
});

test('runtime scans repository files, skips ignored directories, and isolates parse failures', async () => {
  const root = await temporaryRepository();
  await write(root, 'src/Home.tsx', `import { Button } from 'antd'; export const Home = () => <Button />;`);
  await write(root, 'src/UserModal.tsx', `import * as Ant from 'antd'; Ant.Modal.open();`);
  await write(root, 'src/unused.ts', `import { Table } from 'antd'; export const value = 1;`);
  await write(root, 'src/reexport.ts', `export { Select } from 'antd';`);
  await write(root, 'src/dynamic.ts', `export const load = () => import('antd');`);
  await write(root, 'src/invalid.ts', `import { from 'antd';`);
  await write(root, 'node_modules/ignored.ts', `import { Ignored } from 'antd'; Ignored();`);

  const manifest = projectManifest();
  manifest.projects.unshift({ id: 'java:.', path: '.', ecosystem: 'java', dependencies: [] });
  const index = await discoverRepositoryUsage({
    repositoryRoot: root,
    projectManifest: manifest,
    versionAnalysis: versionAnalysis(),
    input: input(),
    clock: () => new Date('2026-07-16T00:00:00.000Z')
  });

  assert.equal(index.analysis.scannedFileCount, 6);
  assert.equal(index.analysis.analyzedFileCount, 5);
  assert.deepEqual(index.dependencies[0].symbols, [
    { name: '*', files: ['src/dynamic.ts'] },
    { name: 'Button', files: ['src/Home.tsx'] },
    { name: 'Modal', files: ['src/UserModal.tsx'] },
    { name: 'Select', files: ['src/reexport.ts'] }
  ]);
  assert.deepEqual(index.warnings, [{
    code: 'SOURCE_PARSE_FAILED',
    path: 'src/invalid.ts',
    message: 'Unable to parse source file.'
  }]);
});

test('deepest project owns a monorepo file even when it has no analyzed dependency scope', async () => {
  const root = await temporaryRepository();
  await write(root, 'packages/member/src/App.ts', `import { Button } from 'antd'; Button();`);
  const manifest = projectManifest();
  manifest.projects.push({
    id: 'node:packages/member',
    path: 'packages/member',
    ecosystem: 'node',
    dependencies: []
  });

  const index = await discoverRepositoryUsage({
    repositoryRoot: root,
    projectManifest: manifest,
    versionAnalysis: versionAnalysis(),
    input: input()
  });

  assert.equal(index.analysis.scannedFileCount, 0);
  assert.deepEqual(index.dependencies, []);
});

test('input loader validates both artifacts, exact-byte lineage, and dependency occurrences', async () => {
  const root = await temporaryRepository();
  await write(root, 'package.json', JSON.stringify({
    name: 'fixture',
    dependencies: { antd: '1.0.0' }
  }));
  const project = await discoverProject(root, { clock: () => new Date('2026-07-16T00:00:00.000Z') });
  const projectBytes = Buffer.from(JSON.stringify(project));
  const contextId = digest('context');
  const dependencyFacts = {
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
    dependency: dependencyFacts,
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
    status: 'skipped',
    contextId,
    dependency: structuredClone(dependencyFacts),
    versions: structuredClone(versions),
    summary: 'Analysis was skipped because evidence is unavailable.',
    summaryEvidenceRefs: [],
    riskLevel: 'unknown',
    riskEvidenceRefs: [],
    findings: [],
    evidenceCoverage: 'none',
    validation: { status: 'validWithWarnings', warningCodes: ['EVIDENCE_MISSING'] },
    requiresHumanReview: true,
    humanReviewReasons: ['EVIDENCE_NONE'],
    nextAction: 'collectEvidence',
    limitations: [{ code: 'EVIDENCE_MISSING', message: 'Collect evidence before analysis.' }]
  };
  const version = buildVersionAnalysisManifest({
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
  const versionBytes = Buffer.from(JSON.stringify(version));

  const loaded = await loadUsageDiscoveryInputs({
    projectManifest: { bytes: projectBytes, artifact: '.upgradelens/project-manifest.json' },
    versionAnalysis: { bytes: versionBytes, artifact: '.upgradelens/version-analysis.json' }
  });

  assert.equal(loaded.projectManifest.repository.name, project.repository.name);
  assert.equal(loaded.versionAnalysis.results[0].dependency.packageId, 'npm:antd');
  assert.equal(loaded.input.projectManifest.artifactDigest, digest(projectBytes));
  assert.equal(loaded.input.versionAnalysis.artifactDigest, digest(versionBytes));

  const changedProjectBytes = Buffer.from(`${projectBytes.toString('utf8')}\n`);
  await assert.rejects(() => loadUsageDiscoveryInputs({
    projectManifest: { bytes: changedProjectBytes, artifact: '.upgradelens/project-manifest.json' },
    versionAnalysis: { bytes: versionBytes, artifact: '.upgradelens/version-analysis.json' }
  }), (error) => error.code === 'LINEAGE_MISMATCH');
});
