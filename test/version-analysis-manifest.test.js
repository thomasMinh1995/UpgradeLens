import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA,
  buildVersionAnalysisManifest,
  serializeVersionAnalysisManifest,
  validateVersionAnalysisManifest,
  versionAnalysisManifestDigest,
  writeVersionAnalysisManifest
} from '../src/index.js';
import { runCli } from '../src/cli.js';
import { VERSION } from '../src/constants.js';

const schema = JSON.parse(await readFile(new URL('../schemas/version-analysis.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function digest(seed) {
  return `sha256:${createHash('sha256').update(seed).digest('hex')}`;
}

function bytes(value) {
  return Buffer.from(JSON.stringify(value));
}

function capture() {
  let value = '';
  return { stream: { write(chunk) { value += chunk; } }, value: () => value };
}

function evidence(seed = 'primary') {
  return {
    id: digest(`evidence:${seed}`),
    kind: 'releaseNotes',
    sourceId: 'npm:react:docs',
    sourceUrl: 'https://example.com/releases',
    authority: 'officialProject',
    trust: 'official',
    retrievedAt: '2026-07-14T00:00:03.000Z',
    contentDigest: digest(`content:${seed}`),
    locator: 'heading:2.0.0',
    releaseVersions: ['2.0.0'],
    content: 'Version 2.0.0 documents a breaking behavior change.'
  };
}

function context({ projectId = 'node:.', manifest = 'package.json', contextSeed = 'one' } = {}) {
  const item = evidence(contextSeed);
  return {
    contextVersion: '1',
    contextId: digest(`context:${contextSeed}`),
    lineage: {
      projectManifestDigest: digest('project'),
      knowledgeManifestDigest: digest('knowledge'),
      knowledgeResearchId: digest('research'),
      evidenceArtifactDigest: digest('bundle')
    },
    dependency: {
      projectId,
      packageId: 'npm:react',
      declaredName: 'react',
      normalizedName: 'react',
      ecosystem: 'node',
      registry: 'npm',
      packageManager: 'npm',
      dependencyType: 'dependency',
      manifest
    },
    versions: {
      analysisMode: 'exactBaseline',
      declaredVersion: '1.0.0',
      currentVersion: '1.0.0',
      currentVersionSource: 'exactDeclaration',
      targetVersion: '2.0.0',
      targetPolicy: 'explicit',
      delta: { direction: 'upgrade', classification: 'major' }
    },
    knowledge: {
      relevantReleases: ['2.0.0'],
      evidence: [item]
    },
    metadata: {
      selectedEvidenceIds: [item.id],
      missingInformation: [],
      warnings: [],
      size: { characters: 1000, evidenceItems: 1 }
    }
  };
}

function result(ctx = context(), overrides = {}) {
  const evidenceId = ctx.metadata.selectedEvidenceIds[0];
  return {
    resultVersion: '1',
    status: 'analyzed',
    contextId: ctx.contextId,
    dependency: structuredClone(ctx.dependency),
    versions: structuredClone(ctx.versions),
    summary: 'React 2.0.0 includes a documented breaking behavior change.',
    summaryEvidenceRefs: [evidenceId],
    riskLevel: 'high',
    riskEvidenceRefs: [evidenceId],
    findings: [
      {
        id: 'finding-1',
        kind: 'breakingChange',
        summary: 'A documented behavior changed.',
        appliesToVersions: ['2.0.0'],
        evidenceRefs: [evidenceId]
      }
    ],
    evidenceCoverage: 'sufficient',
    validation: { status: 'valid', warningCodes: [] },
    requiresHumanReview: true,
    humanReviewReasons: ['HIGH_RISK'],
    nextAction: 'reviewBeforeImpactAnalysis',
    limitations: [],
    ...overrides
  };
}

function inputLineage() {
  return {
    projectManifest: {
      schemaVersion: '2.0.0',
      artifact: '.upgradelens/project-manifest.json',
      artifactDigest: digest('project'),
      repository: { name: 'fixture', root: '.' }
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
      artifactDigest: digest('bundle')
    }
  };
}

function manifestFrom(records) {
  return buildVersionAnalysisManifest({
    input: inputLineage(),
    contexts: records.map((record) => record.context),
    results: records.map((record) => record.result),
    generatedAt: '2026-07-15T00:00:00.000Z'
  });
}

test('Version Analysis Manifest schema validates builder output', () => {
  const ctx = context();
  const manifest = manifestFrom([{ context: ctx, result: result(ctx) }]);

  assert.equal(validateSchema(manifest), true, JSON.stringify(validateSchema.errors, null, 2));
  assert.equal(validateVersionAnalysisManifest(manifest), manifest);
  assert.equal(manifest.schemaVersion, '1.0.0');
  assert.equal(manifest.results[0].confidence.evidenceCoverage, 'sufficient');
  assert.equal(manifest.results[0].evidence[0].content, undefined);
});

test('manifest builder preserves deterministic facts, AI reasoning, evidence refs, and review flags', () => {
  const ctx = context();
  const analysis = result(ctx);
  const manifest = manifestFrom([{ context: ctx, result: analysis }]);
  const built = manifest.results[0];

  assert.deepEqual(built.dependency, ctx.dependency);
  assert.deepEqual(built.versions, ctx.versions);
  assert.equal(built.summary, analysis.summary);
  assert.deepEqual(built.summaryEvidenceRefs, analysis.summaryEvidenceRefs);
  assert.deepEqual(built.findings, analysis.findings);
  assert.equal(built.requiresHumanReview, true);
  assert.deepEqual(built.humanReviewReasons, ['HIGH_RISK']);
  assert.equal(built.evidence[0].sourceId, ctx.knowledge.evidence[0].sourceId);
});

test('manifest builder produces deterministic result ordering and stable digest', () => {
  const first = context({ projectId: 'node:apps/web', manifest: 'apps/web/package.json', contextSeed: 'web' });
  const second = context({ projectId: 'node:apps/admin', manifest: 'apps/admin/package.json', contextSeed: 'admin' });
  const manifest = manifestFrom([
    { context: first, result: result(first) },
    { context: second, result: result(second) }
  ]);
  const again = manifestFrom([
    { context: second, result: result(second) },
    { context: first, result: result(first) }
  ]);

  assert.deepEqual(manifest.results.map((item) => item.dependency.projectId), ['node:apps/admin', 'node:apps/web']);
  assert.equal(versionAnalysisManifestDigest(manifest), versionAnalysisManifestDigest(again));
  assert.deepEqual(manifest, again);
});

test('manifest validation rejects duplicate dependency analysis results', () => {
  const first = context({ contextSeed: 'one' });
  const second = context({ contextSeed: 'two' });

  assert.throws(() => manifestFrom([
    { context: first, result: result(first) },
    { context: second, result: result(second) }
  ]), /Duplicate dependency analysis result/);
});

test('manifest validation rejects invalid evidence references', () => {
  const ctx = context();
  const invalid = result(ctx, { riskEvidenceRefs: [digest('missing-evidence')] });

  assert.throws(() => manifestFrom([{ context: ctx, result: invalid }]), /references unknown evidence/);
});

test('manifest validation rejects invalid schema version', () => {
  const ctx = context();
  const manifest = manifestFrom([{ context: ctx, result: result(ctx) }]);
  manifest.schemaVersion = '9.0.0';

  assert.throws(() => validateVersionAnalysisManifest(manifest), /unsupported schema version/);
});

test('manifest writer serializes and atomically writes pretty JSON', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-writer-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ctx = context();
  const manifest = manifestFrom([{ context: ctx, result: result(ctx) }]);
  const output = path.join(root, '.upgradelens', 'version-analysis.json');

  const target = await writeVersionAnalysisManifest(output, manifest);
  const contents = await readFile(target, 'utf8');

  assert.equal(target, output);
  assert.equal(contents, serializeVersionAnalysisManifest(manifest));
  assert.ok(contents.endsWith('\n'));
  assert.equal(JSON.parse(contents).schemaVersion, '1.0.0');
});

function projectManifest() {
  return {
    schemaVersion: '2.0.0',
    generatedAt: '2026-07-14T00:00:00.000Z',
    generator: { name: 'UpgradeLens', version: VERSION },
    repository: { name: 'cli-fixture', root: '.' },
    summary: { projectCount: 1, ecosystems: { node: 1 }, workspaceCount: 0 },
    projects: [
      {
        id: 'node:.',
        name: 'cli-fixture',
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
          { name: 'react', normalizedName: 'react', declaredVersion: '1.0.0', type: 'dependency', manifest: 'package.json' }
        ]
      }
    ],
    warnings: []
  };
}

function knowledgeManifest(projectBytes) {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-07-14T00:00:02.000Z',
    generator: { name: 'UpgradeLens', version: VERSION },
    input: {
      projectManifest: {
        schemaVersion: '2.0.0',
        artifact: '.upgradelens/project-manifest.json',
        artifactDigest: digestBytes(projectBytes),
        repository: { name: 'cli-fixture', root: '.' }
      }
    },
    policy: {
      mode: 'online',
      policyVersion: '1',
      registryBases: { npm: 'https://registry.npmjs.org', pypi: 'https://pypi.org' },
      ttlPolicyVersion: '1',
      sourceAllowlistVersion: '1',
      includePrereleases: false
    },
    research: {
      researchId: digest('research-cli'),
      startedAt: '2026-07-14T00:00:00.000Z',
      completedAt: '2026-07-14T00:00:02.000Z',
      durationMs: 2000,
      inputOccurrenceCount: 1,
      inputPackageCount: 1,
      researchedPackageCount: 1,
      sourceCount: 1,
      cacheHitCount: 0,
      cacheMissCount: 1,
      cacheRevalidationCount: 0,
      retryCount: 0,
      partialFailureCount: 0
    },
    summary: {
      inputOccurrenceCount: 1,
      packageCount: 1,
      resolvedPackageCount: 1,
      partialPackageCount: 0,
      notFoundPackageCount: 0,
      invalidPackageCount: 0,
      unavailablePackageCount: 0,
      sourceCount: 1,
      warningCount: 0,
      cacheHitCount: 0,
      cacheMissCount: 1,
      staleSourceCount: 0
    },
    packages: [
      {
        id: 'npm:react',
        ecosystem: 'node',
        status: 'resolved',
        identity: {
          observedDeclaredNames: ['react'],
          normalizedName: 'react',
          registry: 'npm',
          registryBaseUrl: 'https://registry.npmjs.org',
          packageUrl: 'https://www.npmjs.com/package/react',
          apiUrl: 'https://registry.npmjs.org/react'
        },
        occurrences: [
          {
            projectId: 'node:.',
            projectPath: '.',
            manifest: 'package.json',
            dependencyType: 'dependency',
            declaredName: 'react',
            declaredVersion: '1.0.0'
          }
        ],
        metadata: {
          description: 'React fixture.',
          license: 'MIT',
          homepageUrl: null,
          documentationUrl: 'https://example.com/releases',
          repositoryUrl: null,
          issueUrl: null,
          deprecationMessage: null,
          projectStatus: null
        },
        latest: {
          version: '2.0.0',
          selection: 'dist-tag:latest',
          publishedAt: '2026-01-02T00:00:00.000Z',
          releaseUrl: 'https://example.com/react/2.0.0',
          prerelease: false,
          yanked: false,
          deprecated: false,
          sourceId: 'npm:react:docs'
        },
        releaseIndex: [
          {
            version: '1.0.0',
            publishedAt: '2026-01-01T00:00:00.000Z',
            url: 'https://example.com/react/1.0.0',
            prerelease: false,
            yanked: false,
            deprecated: false,
            sourceIds: ['npm:react:docs']
          },
          {
            version: '2.0.0',
            publishedAt: '2026-01-02T00:00:00.000Z',
            url: 'https://example.com/react/2.0.0',
            prerelease: false,
            yanked: false,
            deprecated: false,
            sourceIds: ['npm:react:docs']
          }
        ],
        sourceIds: ['npm:react:docs'],
        warningCodes: []
      }
    ],
    sources: [
      {
        id: 'npm:react:docs',
        kind: 'officialDocumentation',
        authority: 'officialProject',
        trust: 'official',
        url: 'https://example.com/releases',
        status: 'available',
        supports: ['releaseNotes'],
        discoveredFrom: null,
        trustEvidenceSourceIds: [],
        snapshot: {
          contentDigest: digest('snapshot-cli'),
          mediaType: 'text/plain',
          retrievedAt: '2026-07-14T00:00:01.000Z',
          freshness: 'fresh'
        }
      }
    ],
    cache: { mode: 'online', policyVersion: '1', hitCount: 0, missCount: 1, revalidationCount: 0, staleEntryCount: 0 },
    warnings: []
  };
}

function digestBytes(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function evidenceBundle(knowledge, knowledgeBytes) {
  const content = 'Version 2.0.0 documents a breaking behavior change.';
  const item = {
    id: digest('cli-evidence'),
    packageId: 'npm:react',
    sourceId: 'npm:react:docs',
    kind: 'releaseNotes',
    contentDigest: digestBytes(Buffer.from(content)),
    retrievedAt: '2026-07-14T00:00:03.000Z',
    mediaType: 'text/plain',
    locator: 'heading:2.0.0',
    releaseVersions: ['2.0.0'],
    content
  };
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-07-14T00:00:04.000Z',
    generator: { name: 'UpgradeLens', version: VERSION },
    input: {
      knowledgeManifest: {
        schemaVersion: '1.0.0',
        artifact: '.upgradelens/knowledge-manifest.json',
        artifactDigest: digestBytes(knowledgeBytes),
        researchId: knowledge.research.researchId
      }
    },
    summary: { evidenceCount: 1, packageCount: 1, sourceCount: 1, warningCount: 0 },
    evidence: [item],
    warnings: []
  };
}

async function writeCliArtifacts(root) {
  const project = projectManifest();
  const projectBytes = bytes(project);
  const knowledge = knowledgeManifest(projectBytes);
  const knowledgeBytes = bytes(knowledge);
  const bundle = evidenceBundle(knowledge, knowledgeBytes);
  await mkdir(path.join(root, '.upgradelens'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'cli-fixture' }));
  await writeFile(path.join(root, '.upgradelens', 'project-manifest.json'), projectBytes);
  await writeFile(path.join(root, '.upgradelens', 'knowledge-manifest.json'), knowledgeBytes);
  await writeFile(path.join(root, '.upgradelens', 'knowledge-evidence-bundle.json'), bytes(bundle));
}

function cliRuntime() {
  return {
    async generateStructured(request) {
      const evidenceId = request.context.metadata.selectedEvidenceIds[0];
      return {
        output: {
          summary: 'React 2.0.0 includes a documented breaking behavior change.',
          summaryEvidenceRefs: [evidenceId],
          riskLevel: 'high',
          riskEvidenceRefs: [evidenceId],
          findings: [
            {
              id: 'finding-1',
              kind: 'breakingChange',
              summary: 'A documented behavior changed.',
              appliesToVersions: ['2.0.0'],
              evidenceRefs: [evidenceId]
            }
          ]
        },
        provider: 'fake',
        model: 'fake',
        latencyMs: 0
      };
    }
  };
}

test('CLI analyze-version writes the default artifact with a fake runtime', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifacts(root);

  const stderr = capture();
  const code = await runCli(['analyze-version', root], {
    stdout: capture().stream,
    stderr: stderr.stream,
    aiRuntime: cliRuntime(),
    clock: () => new Date('2026-07-15T00:00:00.000Z')
  });
  const artifact = JSON.parse(await readFile(path.join(root, '.upgradelens', 'version-analysis.json'), 'utf8'));

  assert.equal(code, 0);
  assert.equal(artifact.schemaVersion, '1.0.0');
  assert.equal(artifact.summary.resultCount, 1);
  assert.equal(artifact.results[0].riskLevel, 'high');
  assert.match(stderr.value(), /AI Version Analysis complete/);
});

test('CLI analyze-version supports stdout without writing the default artifact', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-stdout-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifacts(root);

  const stdout = capture();
  const code = await runCli(['analyze-version', root, '--stdout'], {
    stdout: stdout.stream,
    stderr: capture().stream,
    aiRuntime: cliRuntime(),
    clock: () => new Date('2026-07-15T00:00:00.000Z')
  });

  assert.equal(code, 0);
  assert.equal(JSON.parse(stdout.value()).results[0].dependency.packageId, 'npm:react');
  await assert.rejects(readFile(path.join(root, '.upgradelens', 'version-analysis.json')));
});

test('CLI analyze-version fails clearly for invalid input manifests', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifacts(root);
  const invalid = JSON.parse(await readFile(path.join(root, '.upgradelens', 'knowledge-manifest.json'), 'utf8'));
  invalid.schemaVersion = '9.0.0';
  await writeFile(path.join(root, '.upgradelens', 'knowledge-manifest.json'), JSON.stringify(invalid));

  const stderr = capture();
  const code = await runCli(['analyze-version', root], {
    stdout: capture().stream,
    stderr: stderr.stream,
    aiRuntime: cliRuntime()
  });

  assert.equal(code, 1);
  assert.match(stderr.value(), /unsupported Knowledge Manifest schema version/);
});
