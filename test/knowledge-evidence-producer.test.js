import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildKnowledgeEvidenceBundle,
  serializeKnowledgeEvidenceBundle,
  writeKnowledgeEvidenceBundle
} from '../src/knowledge-evidence-producer.js';
import { validateKnowledgeEvidenceBundle } from '../src/knowledge-evidence-bundle.js';
import { serializeKnowledgeManifest } from '../src/knowledge-manifest-writer.js';
import { loadVersionAnalysisArtifacts } from '../src/version-analysis-loader.js';
import { VERSION } from '../src/constants.js';

const manifestFixtureDirectory = new URL('./fixtures/knowledge-manifest/', import.meta.url);

async function fixture(name) {
  return JSON.parse(await fs.readFile(new URL(name, manifestFixtureDirectory), 'utf8'));
}

function digestBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function digestText(value) {
  return digestBytes(Buffer.from(value, 'utf8'));
}

function knowledgeBytes(manifest) {
  return Buffer.from(serializeKnowledgeManifest(manifest), 'utf8');
}

function buildBundle(manifest, options = {}) {
  const bytes = knowledgeBytes(manifest);
  return buildKnowledgeEvidenceBundle(manifest, {
    knowledgeManifestArtifact: options.artifact ?? '.upgradelens/knowledge-manifest.json',
    knowledgeManifestBytes: bytes,
    generatedAt: options.generatedAt
  });
}

function projectManifest() {
  return {
    schemaVersion: '2.0.0',
    generatedAt: '2026-07-14T00:00:00.000Z',
    generator: { name: 'UpgradeLens', version: VERSION },
    repository: { name: 'react-project', root: '.' },
    summary: { projectCount: 1, ecosystems: { node: 1 }, workspaceCount: 0 },
    projects: [
      {
        id: 'node:.',
        name: 'react-project',
        path: '.',
        ecosystem: 'node',
        languages: ['JavaScript'],
        manifests: ['package.json'],
        packageManager: { name: 'npm' },
        dependencySummary: {
          status: 'parsed',
          declarationCount: 1,
          uniqueCount: 1,
          duplicateCount: 0,
          byType: { dependencies: 1, devDependencies: 0, peerDependencies: 0, optionalDependencies: 0 }
        },
        dependencies: [
          { name: 'react', normalizedName: 'react', declaredVersion: '^19.2.0', type: 'dependency', manifest: 'package.json' }
        ]
      }
    ],
    warnings: []
  };
}

async function versionAnalysisInputs() {
  const project = projectManifest();
  const projectBytes = Buffer.from(JSON.stringify(project), 'utf8');
  const knowledge = await fixture('resolved-npm-react.json');
  knowledge.input.projectManifest.artifactDigest = digestBytes(projectBytes);
  knowledge.input.projectManifest.repository = project.repository;
  const kBytes = knowledgeBytes(knowledge);
  const bundle = buildKnowledgeEvidenceBundle(knowledge, {
    knowledgeManifestArtifact: '.upgradelens/knowledge-manifest.json',
    knowledgeManifestBytes: kBytes
  });
  return { project, projectBytes, knowledge, kBytes, bundle };
}

test('builds a portable Knowledge Evidence Bundle with registry facts, lineage, and stable digest', async () => {
  const manifest = await fixture('resolved-npm-react.json');
  const first = buildBundle(manifest);
  const second = buildBundle(structuredClone(manifest));

  assert.equal(first.schemaVersion, '1.0.0');
  assert.equal(first.input.knowledgeManifest.artifactDigest, digestBytes(knowledgeBytes(manifest)));
  assert.equal(first.input.knowledgeManifest.researchId, manifest.research.researchId);
  assert.equal(first.summary.evidenceCount, 1);
  assert.equal(first.evidence[0].packageId, 'npm:react');
  assert.equal(first.evidence[0].sourceId, 'npm:react:registry');
  assert.equal(first.evidence[0].kind, 'registryFact');
  assert.deepEqual(first.evidence[0].releaseVersions, ['19.2.0']);
  assert.match(first.evidence[0].content, /Latest version: 19\.2\.0/);
  assert.equal(first.evidence[0].contentDigest, digestText(first.evidence[0].content));
  assert.deepEqual(first, second);
  assert.equal(serializeKnowledgeEvidenceBundle(first), serializeKnowledgeEvidenceBundle(second));
  assert.equal(validateKnowledgeEvidenceBundle(first), first);
});

test('preserves source conflict warnings as structured bundle warning metadata', async () => {
  const manifest = await fixture('source-conflict.json');
  const bundle = buildBundle(manifest);

  assert.equal(bundle.summary.evidenceCount, 1);
  assert.ok(bundle.warnings.some((warning) =>
    warning.code === 'SOURCE_CONFLICT'
    && warning.packageId === 'npm:react'
    && warning.sourceId === 'npm:react:documentation'
  ));
});

test('records missing evidence when package facts cannot produce portable evidence', async () => {
  const manifest = await fixture('resolved-npm-react.json');
  manifest.sources[0].status = 'unavailable';
  const bundle = buildBundle(manifest);

  assert.deepEqual(bundle.evidence, []);
  assert.ok(bundle.warnings.some((warning) =>
    warning.code === 'EVIDENCE_MISSING'
    && warning.packageId === 'npm:react'
  ));
});

test('validates duplicate evidence and content digest invariants', async () => {
  const manifest = await fixture('resolved-npm-react.json');
  const duplicate = buildBundle(manifest);
  duplicate.evidence.push(structuredClone(duplicate.evidence[0]));
  duplicate.summary.evidenceCount = duplicate.evidence.length;

  assert.throws(() => validateKnowledgeEvidenceBundle(duplicate), /Duplicate evidence id/);

  const corrupted = buildBundle(manifest);
  corrupted.evidence[0].content = 'changed content';
  assert.throws(() => validateKnowledgeEvidenceBundle(corrupted), /contentDigest/);
});

test('Version Analysis loader rejects invalid lineage and invalid evidence references', async () => {
  const { projectBytes, knowledge, kBytes, bundle } = await versionAnalysisInputs();
  const badLineage = structuredClone(bundle);
  badLineage.input.knowledgeManifest.artifactDigest = digestText('wrong');

  await assert.rejects(loadVersionAnalysisArtifacts({
    projectManifest: { bytes: projectBytes, artifact: '.upgradelens/project-manifest.json' },
    knowledgeManifest: { bytes: kBytes, artifact: '.upgradelens/knowledge-manifest.json' },
    evidenceBundle: { bytes: Buffer.from(JSON.stringify(badLineage)), artifact: '.upgradelens/knowledge-evidence-bundle.json' }
  }), /Knowledge Evidence Bundle lineage mismatch/);

  const invalidReference = structuredClone(bundle);
  invalidReference.evidence[0].sourceId = 'npm:react:missing';
  invalidReference.evidence[0].id = digestText('invalid-reference');

  await assert.rejects(loadVersionAnalysisArtifacts({
    projectManifest: { bytes: projectBytes, artifact: '.upgradelens/project-manifest.json' },
    knowledgeManifest: { bytes: knowledgeBytes(knowledge), artifact: '.upgradelens/knowledge-manifest.json' },
    evidenceBundle: { bytes: Buffer.from(JSON.stringify(invalidReference)), artifact: '.upgradelens/knowledge-evidence-bundle.json' }
  }), /references unknown source npm:react:missing/);
});

test('writer serializes the bundle atomically as pretty JSON', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-evidence-writer-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const bundle = buildBundle(await fixture('resolved-npm-react.json'));
  const output = path.join(root, '.upgradelens', 'knowledge-evidence-bundle.json');
  const target = await writeKnowledgeEvidenceBundle(output, bundle);
  const contents = await fs.readFile(target, 'utf8');

  assert.equal(target, output);
  assert.equal(contents, serializeKnowledgeEvidenceBundle(bundle));
  assert.ok(contents.endsWith('\n'));
});
