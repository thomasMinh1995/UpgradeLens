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
  AiRuntimeError,
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

test('manifest builder preserves source conflict validation state and review reason', () => {
  const ctx = context();
  const analysis = result(ctx, {
    riskLevel: 'unknown',
    riskEvidenceRefs: [],
    evidenceCoverage: 'partial',
    validation: { status: 'validWithWarnings', warningCodes: ['SOURCE_CONFLICT'] },
    requiresHumanReview: true,
    humanReviewReasons: ['UNKNOWN_RISK', 'EVIDENCE_PARTIAL', 'SOURCE_CONFLICT'],
    limitations: [
      {
        code: 'SOURCE_CONFLICT',
        message: 'Risk was downgraded because selected evidence has unresolved source conflicts.'
      }
    ]
  });
  const manifest = manifestFrom([{ context: ctx, result: analysis }]);
  const built = manifest.results[0];

  assert.equal(built.riskLevel, 'unknown');
  assert.equal(built.validation.status, 'validWithWarnings');
  assert.deepEqual(built.validation.warningCodes, ['SOURCE_CONFLICT']);
  assert.deepEqual(built.humanReviewReasons, ['EVIDENCE_PARTIAL', 'SOURCE_CONFLICT', 'UNKNOWN_RISK']);
  assert.deepEqual(built.limitations.map((item) => item.code), ['SOURCE_CONFLICT']);
});

test('manifest builder preserves package-local skipped result for missing target', () => {
  const ctx = context();
  ctx.versions.targetVersion = null;
  ctx.versions.targetPolicy = 'registryLatest';
  ctx.versions.delta = { direction: 'unknown', classification: 'unknown' };
  ctx.knowledge.relevantReleases = [];
  ctx.knowledge.evidence = [];
  ctx.metadata.selectedEvidenceIds = [];
  ctx.metadata.missingInformation = ['targetVersion'];
  ctx.metadata.warnings = [
    {
      code: 'TARGET_MISSING',
      packageId: 'npm:react',
      message: 'Package npm:react has no registry latest target.'
    }
  ];
  const analysis = result(ctx, {
    status: 'skipped',
    summary: 'AI analysis was skipped because no target version was available.',
    summaryEvidenceRefs: [],
    riskLevel: 'unknown',
    riskEvidenceRefs: [],
    findings: [],
    evidenceCoverage: 'none',
    validation: { status: 'validWithWarnings', warningCodes: ['TARGET_MISSING'] },
    requiresHumanReview: true,
    humanReviewReasons: ['UNKNOWN_RISK', 'EVIDENCE_NONE', 'ANALYSIS_FAILED'],
    nextAction: 'provideExplicitTarget',
    limitations: [
      {
        code: 'TARGET_MISSING',
        message: 'Provide an explicit target or collect target evidence.'
      }
    ]
  });
  const manifest = manifestFrom([{ context: ctx, result: analysis }]);
  const built = manifest.results[0];

  assert.equal(validateSchema(manifest), true, JSON.stringify(validateSchema.errors, null, 2));
  assert.equal(built.status, 'skipped');
  assert.equal(built.versions.targetVersion, null);
  assert.equal(built.nextAction, 'provideExplicitTarget');
  assert.equal(manifest.summary.skippedCount, 1);
  assert.equal(manifest.summary.riskCounts.unknown, 1);
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

async function writeCliArtifactsWithTwoAnalyzableOccurrences(root) {
  const project = projectManifest();
  const secondProject = structuredClone(project.projects[0]);
  secondProject.id = 'node:packages/second';
  secondProject.name = 'second';
  secondProject.path = 'packages/second';
  secondProject.manifests = ['packages/second/package.json'];
  secondProject.dependencies[0].manifest = 'packages/second/package.json';
  project.summary.projectCount = 2;
  project.summary.ecosystems.node = 2;
  project.projects.push(secondProject);

  const projectBytes = bytes(project);
  const knowledge = knowledgeManifest(projectBytes);
  knowledge.research.inputOccurrenceCount = 2;
  knowledge.summary.inputOccurrenceCount = 2;
  knowledge.packages[0].occurrences.push({
    projectId: 'node:packages/second',
    projectPath: 'packages/second',
    manifest: 'packages/second/package.json',
    dependencyType: 'dependency',
    declaredName: 'react',
    declaredVersion: '1.0.0'
  });
  const knowledgeBytes = bytes(knowledge);
  const bundle = evidenceBundle(knowledge, knowledgeBytes);

  await mkdir(path.join(root, '.upgradelens'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'cli-fixture' }));
  await writeFile(path.join(root, '.upgradelens', 'project-manifest.json'), projectBytes);
  await writeFile(path.join(root, '.upgradelens', 'knowledge-manifest.json'), knowledgeBytes);
  await writeFile(path.join(root, '.upgradelens', 'knowledge-evidence-bundle.json'), bytes(bundle));
}

async function writeCliArtifactsWithMissingTarget(root) {
  const project = projectManifest();
  project.projects[0].dependencySummary.declarationCount = 2;
  project.projects[0].dependencySummary.uniqueCount = 2;
  project.projects[0].dependencySummary.byType.dependencies = 2;
  project.projects[0].dependencies.push({
    name: 'vite',
    normalizedName: 'vite',
    declaredVersion: '^5.0.0',
    type: 'dependency',
    manifest: 'package.json'
  });
  const projectBytes = bytes(project);
  const knowledge = knowledgeManifest(projectBytes);
  knowledge.research.inputOccurrenceCount = 2;
  knowledge.research.inputPackageCount = 2;
  knowledge.research.researchedPackageCount = 2;
  knowledge.research.sourceCount = 2;
  knowledge.research.cacheMissCount = 2;
  knowledge.research.partialFailureCount = 1;
  knowledge.summary.inputOccurrenceCount = 2;
  knowledge.summary.packageCount = 2;
  knowledge.summary.resolvedPackageCount = 1;
  knowledge.summary.unavailablePackageCount = 1;
  knowledge.summary.sourceCount = 2;
  knowledge.summary.warningCount = 1;
  knowledge.summary.cacheMissCount = 2;
  knowledge.packages.push({
    id: 'npm:vite',
    ecosystem: 'node',
    status: 'unavailable',
    identity: {
      observedDeclaredNames: ['vite'],
      normalizedName: 'vite',
      registry: 'npm',
      registryBaseUrl: 'https://registry.npmjs.org',
      packageUrl: 'https://www.npmjs.com/package/vite',
      apiUrl: 'https://registry.npmjs.org/vite'
    },
    occurrences: [
      {
        projectId: 'node:.',
        projectPath: '.',
        manifest: 'package.json',
        dependencyType: 'dependency',
        declaredName: 'vite',
        declaredVersion: '^5.0.0'
      }
    ],
    metadata: {
      description: null,
      license: null,
      homepageUrl: null,
      documentationUrl: null,
      repositoryUrl: null,
      issueUrl: null,
      deprecationMessage: null,
      projectStatus: null
    },
    latest: null,
    releaseIndex: [],
    sourceIds: ['npm:vite:registry'],
    warningCodes: ['REGISTRY_UNAVAILABLE']
  });
  knowledge.sources.push({
    id: 'npm:vite:registry',
    kind: 'registry',
    authority: 'registryAuthoritative',
    trust: 'publisher',
    url: 'https://registry.npmjs.org/vite',
    status: 'unavailable',
    supports: ['latest'],
    discoveredFrom: null,
    trustEvidenceSourceIds: [],
    snapshot: null
  });
  knowledge.sources.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  knowledge.cache.missCount = 2;
  knowledge.warnings.push({
    code: 'REGISTRY_UNAVAILABLE',
    packageId: 'npm:vite',
    sourceId: 'npm:vite:registry',
    message: 'npm Registry package metadata is unavailable.',
    retryable: true
  });
  const knowledgeBytes = bytes(knowledge);
  const bundle = evidenceBundle(knowledge, knowledgeBytes);
  bundle.warnings.push({
    code: 'REGISTRY_UNAVAILABLE',
    packageId: 'npm:vite',
    sourceId: 'npm:vite:registry',
    message: 'npm Registry package metadata is unavailable.'
  });
  bundle.warnings.push({
    code: 'EVIDENCE_MISSING',
    packageId: 'npm:vite',
    message: 'No portable evidence could be produced for npm:vite.'
  });
  bundle.warnings.sort((left, right) =>
    (left.packageId ?? '').localeCompare(right.packageId ?? '')
    || (left.sourceId ?? '').localeCompare(right.sourceId ?? '')
    || left.code.localeCompare(right.code)
    || left.message.localeCompare(right.message)
  );
  bundle.summary.warningCount = bundle.warnings.length;
  await mkdir(path.join(root, '.upgradelens'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'cli-fixture' }));
  await writeFile(path.join(root, '.upgradelens', 'project-manifest.json'), projectBytes);
  await writeFile(path.join(root, '.upgradelens', 'knowledge-manifest.json'), knowledgeBytes);
  await writeFile(path.join(root, '.upgradelens', 'knowledge-evidence-bundle.json'), bytes(bundle));
}

async function writeCliArtifactsWithMissingBaseline(root) {
  const project = projectManifest();
  project.projects[0].dependencySummary.declarationCount = 2;
  project.projects[0].dependencySummary.uniqueCount = 2;
  project.projects[0].dependencySummary.byType.dependencies = 2;
  project.projects[0].dependencies.unshift({
    name: 'langchain-core',
    normalizedName: 'langchain-core',
    declaredVersion: null,
    type: 'dependency',
    manifest: 'package.json'
  });
  const projectBytes = bytes(project);
  const knowledge = knowledgeManifest(projectBytes);
  knowledge.research.inputOccurrenceCount = 2;
  knowledge.research.inputPackageCount = 2;
  knowledge.research.researchedPackageCount = 2;
  knowledge.research.sourceCount = 2;
  knowledge.research.cacheMissCount = 2;
  knowledge.summary.inputOccurrenceCount = 2;
  knowledge.summary.packageCount = 2;
  knowledge.summary.resolvedPackageCount = 2;
  knowledge.summary.sourceCount = 2;
  knowledge.summary.cacheMissCount = 2;
  knowledge.cache.missCount = 2;
  knowledge.packages.unshift({
    id: 'npm:langchain-core',
    ecosystem: 'node',
    status: 'resolved',
    identity: {
      observedDeclaredNames: ['langchain-core'],
      normalizedName: 'langchain-core',
      registry: 'npm',
      registryBaseUrl: 'https://registry.npmjs.org',
      packageUrl: 'https://www.npmjs.com/package/langchain-core',
      apiUrl: 'https://registry.npmjs.org/langchain-core'
    },
    occurrences: [
      {
        projectId: 'node:.',
        projectPath: '.',
        manifest: 'package.json',
        dependencyType: 'dependency',
        declaredName: 'langchain-core',
        declaredVersion: null
      }
    ],
    metadata: {
      description: 'LangChain core fixture.',
      license: 'MIT',
      homepageUrl: null,
      documentationUrl: 'https://example.com/langchain-core/releases',
      repositoryUrl: null,
      issueUrl: null,
      deprecationMessage: null,
      projectStatus: null
    },
    latest: {
      version: '1.0.0',
      selection: 'dist-tag:latest',
      publishedAt: '2026-01-02T00:00:00.000Z',
      releaseUrl: 'https://example.com/langchain-core/1.0.0',
      prerelease: false,
      yanked: false,
      deprecated: false,
      sourceId: 'npm:langchain-core:docs'
    },
    releaseIndex: [
      {
        version: '1.0.0',
        publishedAt: '2026-01-02T00:00:00.000Z',
        url: 'https://example.com/langchain-core/1.0.0',
        prerelease: false,
        yanked: false,
        deprecated: false,
        sourceIds: ['npm:langchain-core:docs']
      }
    ],
    sourceIds: ['npm:langchain-core:docs'],
    warningCodes: []
  });
  knowledge.sources.unshift({
    id: 'npm:langchain-core:docs',
    kind: 'officialDocumentation',
    authority: 'officialProject',
    trust: 'official',
    url: 'https://example.com/langchain-core/releases',
    status: 'available',
    supports: ['releaseNotes'],
    discoveredFrom: null,
    trustEvidenceSourceIds: [],
    snapshot: {
      contentDigest: digest('snapshot-langchain-core'),
      mediaType: 'text/plain',
      retrievedAt: '2026-07-14T00:00:01.000Z',
      freshness: 'fresh'
    }
  });
  knowledge.packages.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  knowledge.sources.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
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
      const contextJson = request.userPrompt.split('Dependency AI Context:\n').at(-1);
      const evidenceId = JSON.parse(contextJson).metadata.selectedEvidenceIds[0];
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

test('CLI analyze-version skips a package with missing registry latest while analyzing the rest', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-missing-target-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifactsWithMissingTarget(root);
  let calls = 0;
  const runtime = {
    async generateStructured(request) {
      calls += 1;
      return cliRuntime().generateStructured(request);
    }
  };
  const stderr = capture();

  const code = await runCli(['analyze-version', root], {
    stdout: capture().stream,
    stderr: stderr.stream,
    aiRuntime: runtime,
    clock: () => new Date('2026-07-15T00:00:00.000Z')
  });
  assert.equal(code, 0, stderr.value());
  const artifact = JSON.parse(await readFile(path.join(root, '.upgradelens', 'version-analysis.json'), 'utf8'));
  const react = artifact.results.find((item) => item.dependency.packageId === 'npm:react');
  const vite = artifact.results.find((item) => item.dependency.packageId === 'npm:vite');

  assert.equal(calls, 1);
  assert.equal(artifact.summary.resultCount, 2);
  assert.equal(artifact.summary.analyzedCount, 1);
  assert.equal(artifact.summary.skippedCount, 1);
  assert.equal(artifact.summary.requiresHumanReviewCount, 2);
  assert.equal(artifact.summary.riskCounts.high, 1);
  assert.equal(artifact.summary.riskCounts.unknown, 1);
  assert.equal(react.status, 'analyzed');
  assert.equal(vite.status, 'skipped');
  assert.equal(vite.riskLevel, 'unknown');
  assert.equal(vite.requiresHumanReview, true);
  assert.equal(vite.nextAction, 'provideExplicitTarget');
  assert.equal(vite.versions.targetVersion, null);
  assert.deepEqual(vite.validation.warningCodes, ['TARGET_MISSING']);
});

test('CLI analyze-version skips a package with missing baseline while analyzing the rest', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-missing-baseline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifactsWithMissingBaseline(root);
  let calls = 0;
  const runtime = {
    async generateStructured(request) {
      calls += 1;
      return cliRuntime().generateStructured(request);
    }
  };
  const stderr = capture();

  const code = await runCli(['analyze-version', root], {
    stdout: capture().stream,
    stderr: stderr.stream,
    aiRuntime: runtime,
    clock: () => new Date('2026-07-15T00:00:00.000Z')
  });
  assert.equal(code, 0, stderr.value());
  const artifact = JSON.parse(await readFile(path.join(root, '.upgradelens', 'version-analysis.json'), 'utf8'));
  const analyzed = artifact.results.find((item) => item.dependency.packageId === 'npm:react');
  const skipped = artifact.results.find((item) => item.dependency.packageId === 'npm:langchain-core');

  assert.equal(calls, 1);
  assert.equal(artifact.summary.resultCount, 2);
  assert.equal(artifact.summary.analyzedCount, 1);
  assert.equal(artifact.summary.skippedCount, 1);
  assert.equal(artifact.summary.requiresHumanReviewCount, 2);
  assert.equal(artifact.summary.riskCounts.high, 1);
  assert.equal(artifact.summary.riskCounts.unknown, 1);
  assert.equal(analyzed.status, 'analyzed');
  assert.equal(skipped.status, 'skipped');
  assert.equal(skipped.versions.analysisMode, 'unsupportedBaseline');
  assert.equal(skipped.versions.declaredVersion, null);
  assert.equal(skipped.versions.currentVersion, null);
  assert.equal(skipped.versions.targetVersion, '1.0.0');
  assert.equal(skipped.riskLevel, 'unknown');
  assert.equal(skipped.requiresHumanReview, true);
  assert.equal(skipped.nextAction, 'resolveCurrentVersion');
  assert.deepEqual(skipped.validation.warningCodes, ['BASELINE_UNSUPPORTED']);
  assert.deepEqual(skipped.humanReviewReasons, ['ANALYSIS_FAILED', 'EVIDENCE_NONE', 'UNKNOWN_RISK', 'VERSION_UNCERTAIN']);
  assert.deepEqual(skipped.limitations.map((item) => item.code), ['BASELINE_UNSUPPORTED']);
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

test('CLI selects the OpenAI-compatible provider and sends Chat Completions mapping from environment configuration', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-openai-compatible-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifacts(root);
  const requests = [];

  const code = await runCli(['analyze-version', root], {
    stdout: capture().stream,
    stderr: capture().stream,
    env: {
      UPGRADELENS_AI_PROVIDER: 'openai-compatible',
      UPGRADELENS_AI_ENDPOINT: 'https://provider.example.test/v1/chat/completions',
      UPGRADELENS_AI_MODEL: 'exact-model-slug',
      UPGRADELENS_AI_AUTHORIZATION: 'Bearer local-test-value'
    },
    fetch: async (url, init) => {
      const requestBody = JSON.parse(init.body);
      requests.push({ url: String(url), init, requestBody });
      const contextJson = requestBody.messages[1].content.split('Dependency AI Context:\n').at(-1);
      const evidenceId = JSON.parse(contextJson).metadata.selectedEvidenceIds[0];
      return new Response(JSON.stringify({
        id: 'safe-id',
        model: 'exact-model-slug',
        choices: [{
          message: {
            role: 'assistant',
            content: JSON.stringify({
              summary: 'React release has a documented breaking behavior change.',
              summaryEvidenceRefs: [evidenceId],
              riskLevel: 'high',
              riskEvidenceRefs: [evidenceId],
              findings: []
            })
          },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    clock: () => new Date('2026-07-15T00:00:00.000Z')
  });

  assert.equal(code, 0);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].requestBody.model, 'exact-model-slug');
  assert.equal(requests[0].requestBody.stream, false);
  assert.equal(requests[0].requestBody.response_format.type, 'json_schema');
  assert.equal(requests[0].init.headers.authorization, 'Bearer local-test-value');
});

test('CLI applies UPGRADELENS_AI_TIMEOUT_MS without retry, fallback, or schema changes', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-timeout-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifacts(root);
  let calls = 0;

  const code = await runCli(['analyze-version', root], {
    stdout: capture().stream,
    stderr: capture().stream,
    env: {
      UPGRADELENS_AI_PROVIDER: 'openai-compatible',
      UPGRADELENS_AI_ENDPOINT: 'https://provider.example.test/v1/chat/completions',
      UPGRADELENS_AI_MODEL: 'exact-model-slug',
      UPGRADELENS_AI_TIMEOUT_MS: '5'
    },
    fetch: async (_url, init) => {
      calls += 1;
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'exact-model-slug');
      assert.equal(body.stream, false);
      assert.equal(body.response_format.type, 'json_schema');
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => reject(new DOMException('aborted', 'AbortError')),
          { once: true }
        );
      });
    },
    clock: () => new Date('2026-07-15T00:00:00.000Z')
  });

  assert.equal(code, 0);
  assert.equal(calls, 1);
  const artifact = JSON.parse(await readFile(path.join(root, '.upgradelens/version-analysis.json'), 'utf8'));
  assert.equal(artifact.summary.failedCount, 1);
  assert.deepEqual(artifact.results[0].limitations.map((item) => item.code), ['TIMEOUT']);
});

test('CLI rejects invalid UPGRADELENS_AI_TIMEOUT_MS before transport', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-timeout-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifacts(root);
  const stderr = capture();
  let calls = 0;

  const code = await runCli(['analyze-version', root], {
    stdout: capture().stream,
    stderr: stderr.stream,
    env: {
      UPGRADELENS_AI_PROVIDER: 'openai-compatible',
      UPGRADELENS_AI_ENDPOINT: 'https://provider.example.test/v1/chat/completions',
      UPGRADELENS_AI_MODEL: 'exact-model-slug',
      UPGRADELENS_AI_TIMEOUT_MS: 'not-a-number'
    },
    fetch: async () => {
      calls += 1;
      throw new Error('transport must not run');
    }
  });

  assert.equal(code, 1);
  assert.equal(calls, 0);
  assert.match(stderr.value(), /UPGRADELENS_AI_TIMEOUT_MS must be a positive integer/);
});

test('CLI retains the legacy generic HTTP provider path for other provider labels', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-legacy-provider-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifacts(root);
  const bodies = [];

  const code = await runCli(['analyze-version', root], {
    stdout: capture().stream,
    stderr: capture().stream,
    env: {
      UPGRADELENS_AI_PROVIDER: 'fixture-legacy',
      UPGRADELENS_AI_ENDPOINT: 'https://legacy.example.test/analyze',
      UPGRADELENS_AI_MODEL: 'legacy-model'
    },
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      const contextJson = body.prompt.user.split('Dependency AI Context:\n').at(-1);
      const evidenceId = JSON.parse(contextJson).metadata.selectedEvidenceIds[0];
      return new Response(JSON.stringify({
        output: {
          summary: 'Legacy provider result.',
          summaryEvidenceRefs: [evidenceId],
          riskLevel: 'unknown',
          riskEvidenceRefs: [],
          findings: []
        }
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    clock: () => new Date('2026-07-15T00:00:00.000Z')
  });

  assert.equal(code, 0);
  assert.equal(bodies.length, 1);
  assert.equal(typeof bodies[0].prompt.system, 'string');
  assert.deepEqual(bodies[0].outputSchema, AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  assert.equal('messages' in bodies[0], false);
});

test('CLI treats missing OpenAI-compatible model as global fatal configuration without exposing authorization', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-missing-model-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifacts(root);
  const stderr = capture();

  const code = await runCli(['analyze-version', root], {
    stdout: capture().stream,
    stderr: stderr.stream,
    env: {
      UPGRADELENS_AI_PROVIDER: 'openai-compatible',
      UPGRADELENS_AI_ENDPOINT: 'https://provider.example.test/v1/chat/completions',
      UPGRADELENS_AI_AUTHORIZATION: 'Bearer must-not-appear'
    },
    fetch: async () => { throw new Error('must not call fetch'); }
  });

  assert.equal(code, 1);
  assert.match(stderr.value(), /model is required/);
  assert.doesNotMatch(stderr.value(), /must-not-appear|Authorization/);
});

test('CLI writes a package-local typed provider failure instead of failing the whole command', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-runtime-failure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifacts(root);
  const stderr = capture();

  const code = await runCli(['analyze-version', root], {
    stdout: capture().stream,
    stderr: stderr.stream,
    aiRuntime: {
      async generateStructured() {
        throw new AiRuntimeError('PROVIDER_UNAVAILABLE', 'sanitized', { status: 503, retryable: true });
      }
    },
    clock: () => new Date('2026-07-15T00:00:00.000Z')
  });
  const artifact = JSON.parse(await readFile(path.join(root, '.upgradelens', 'version-analysis.json'), 'utf8'));

  assert.equal(code, 0, stderr.value());
  assert.equal(artifact.summary.failedCount, 1);
  assert.equal(artifact.summary.analyzedCount, 0);
  assert.deepEqual(artifact.results[0].validation.warningCodes, ['PROVIDER_UNAVAILABLE']);
  assert.deepEqual(artifact.results[0].limitations.map((item) => item.code), ['PROVIDER_UNAVAILABLE']);
});

test('one package-local runtime failure does not prevent another dependency occurrence from being analyzed', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-va-cli-partial-runtime-failure-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCliArtifactsWithTwoAnalyzableOccurrences(root);
  let calls = 0;

  const code = await runCli(['analyze-version', root], {
    stdout: capture().stream,
    stderr: capture().stream,
    aiRuntime: {
      async generateStructured(request) {
        calls += 1;
        const contextJson = request.userPrompt.split('Dependency AI Context:\n').at(-1);
        const requestContext = JSON.parse(contextJson);
        if (requestContext.dependency.projectId === 'node:.') {
          throw new AiRuntimeError('RATE_LIMITED', 'sanitized', { status: 429, retryable: true });
        }
        const evidenceId = requestContext.metadata.selectedEvidenceIds[0];
        return {
          output: {
            summary: 'Second dependency occurrence was analyzed.',
            summaryEvidenceRefs: [evidenceId],
            riskLevel: 'low',
            riskEvidenceRefs: [evidenceId],
            findings: []
          },
          provider: 'fake',
          model: 'fake',
          latencyMs: 0
        };
      }
    },
    clock: () => new Date('2026-07-15T00:00:00.000Z')
  });
  const artifact = JSON.parse(await readFile(path.join(root, '.upgradelens', 'version-analysis.json'), 'utf8'));

  assert.equal(code, 0);
  assert.equal(calls, 2);
  assert.equal(artifact.summary.resultCount, 2);
  assert.equal(artifact.summary.failedCount, 1);
  assert.equal(artifact.summary.analyzedCount, 1);
  assert.deepEqual(artifact.results.map((item) => item.status).sort(), ['analyzed', 'failed']);
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
