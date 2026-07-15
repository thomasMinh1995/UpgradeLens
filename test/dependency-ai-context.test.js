import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  buildDependencyAiContext,
  createDefaultEcosystemVersionAdapterRegistry,
  dependencyAiContextDigest,
  dependencyAiContextsEqual,
  getEcosystemVersionAdapter,
  loadVersionAnalysisArtifacts,
  resolveDependencyAnalysisInput,
  resolveDependencyAnalysisInputs,
  validateAiRuntime
} from '../src/index.js';
import { VERSION } from '../src/constants.js';

function digestBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function digestText(value) {
  return digestBytes(Buffer.from(value, 'utf8'));
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value));
}

function evidenceId(seed) {
  return digestText(`evidence:${seed}`);
}

function projectManifest({
  ecosystem = 'node',
  declaredVersion = '^1.0.0',
  dependencyName = 'react',
  normalizedName = dependencyName,
  dependencyType = ecosystem === 'node' ? 'dependency' : 'runtime',
  repositoryName = 'context-fixture'
} = {}) {
  const manifestPath = ecosystem === 'node' ? 'package.json' : 'requirements.txt';
  const dependency = {
    name: dependencyName,
    normalizedName,
    declaredVersion,
    type: dependencyType,
    manifest: manifestPath
  };
  const dependencySummary = {
    status: 'parsed',
    declarationCount: 1,
    uniqueCount: 1,
    duplicateCount: 0
  };
  if (ecosystem === 'node') {
    dependencySummary.byType = {
      dependencies: dependencyType === 'dependency' ? 1 : 0,
      devDependencies: dependencyType === 'devDependency' ? 1 : 0,
      peerDependencies: dependencyType === 'peerDependency' ? 1 : 0,
      optionalDependencies: dependencyType === 'optionalDependency' ? 1 : 0
    };
  }
  return {
    schemaVersion: '2.0.0',
    generatedAt: '2026-07-14T00:00:00.000Z',
    generator: { name: 'UpgradeLens', version: VERSION },
    repository: { name: repositoryName, root: '.' },
    summary: { projectCount: 1, ecosystems: { [ecosystem]: 1 }, workspaceCount: 0 },
    projects: [
      {
        id: `${ecosystem === 'node' ? 'node' : ecosystem}:.`,
        name: repositoryName,
        path: '.',
        ecosystem,
        languages: [ecosystem === 'python' ? 'Python' : ecosystem === 'java' ? 'Java' : 'JavaScript'],
        manifests: [manifestPath],
        packageManager: ecosystem === 'node' ? { name: 'npm' } : undefined,
        dependencySummary,
        dependencies: [dependency]
      }
    ].map((project) => {
      if (project.packageManager === undefined) delete project.packageManager;
      return project;
    }),
    warnings: []
  };
}

function source(sourceId, overrides = {}) {
  return {
    id: sourceId,
    kind: 'officialDocumentation',
    authority: 'officialProject',
    trust: 'official',
    url: 'https://example.com/releases',
    status: 'available',
    supports: ['releaseNotes'],
    discoveredFrom: null,
    trustEvidenceSourceIds: [],
    snapshot: {
      contentDigest: digestText(`snapshot:${sourceId}`),
      mediaType: 'text/plain',
      retrievedAt: '2026-07-14T00:00:01.000Z',
      freshness: 'fresh'
    },
    ...overrides
  };
}

function knowledgeManifest({
  project,
  projectBytes,
  ecosystem = 'node',
  packageName = 'react',
  versions = ['1.0.0', '1.1.0', '2.0.0'],
  sourceConflict = false,
  unrelatedSourceConflict = false
} = {}) {
  const registry = ecosystem === 'python' ? 'pypi' : 'npm';
  const packageId = `${registry}:${packageName}`;
  const sourceId = `${packageId}:docs`;
  const conflictSourceId = `${packageId}:registry`;
  const occurrence = project.projects[0].dependencies[0];
  const releases = versions.map((version) => ({
    version,
    publishedAt: `2026-01-${String(versions.indexOf(version) + 1).padStart(2, '0')}T00:00:00.000Z`,
    url: `https://example.com/${packageName}/${version}`,
    prerelease: false,
    yanked: false,
    deprecated: false,
    sourceIds: [sourceId]
  }));
  const packageSources = sourceConflict ? [sourceId, conflictSourceId] : [sourceId];
  const sourceRecords = [
    source(sourceId, sourceConflict ? { conflictsWith: [conflictSourceId] } : {})
  ];
  if (sourceConflict) {
    sourceRecords.push(source(conflictSourceId, {
      kind: 'registry',
      authority: 'registryAuthoritative',
      trust: 'publisher',
      url: `https://example.com/${packageName}/registry`,
      supports: ['latest', 'releaseNotes'],
      conflictsWith: [sourceId]
    }));
  }
  if (unrelatedSourceConflict) {
    sourceRecords.push(
      source('npm:other:docs', { conflictsWith: ['npm:other:registry'], url: 'https://example.com/other/docs' }),
      source('npm:other:registry', {
        kind: 'registry',
        authority: 'registryAuthoritative',
        trust: 'publisher',
        url: 'https://example.com/other/registry',
        supports: ['latest'],
        conflictsWith: ['npm:other:docs']
      })
    );
  }
  const warnings = sourceConflict
    ? [
        {
          code: 'SOURCE_CONFLICT',
          packageId,
          sourceId,
          message: 'Official and registry release facts conflict.',
          retryable: false
        }
      ]
    : [];
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-07-14T00:00:02.000Z',
    generator: { name: 'UpgradeLens', version: VERSION },
    input: {
      projectManifest: {
        schemaVersion: '2.0.0',
        artifact: '.upgradelens/project-manifest.json',
        artifactDigest: digestBytes(projectBytes),
        repository: project.repository
      }
    },
    policy: {
      mode: 'online',
      policyVersion: '1',
      registryBases: {
        npm: 'https://registry.npmjs.org',
        pypi: 'https://pypi.org'
      },
      ttlPolicyVersion: '1',
      sourceAllowlistVersion: '1',
      includePrereleases: false
    },
    research: {
      researchId: digestText(`research:${packageId}:${occurrence.declaredVersion}`),
      startedAt: '2026-07-14T00:00:00.000Z',
      completedAt: '2026-07-14T00:00:02.000Z',
      durationMs: 2000,
      inputOccurrenceCount: 1,
      inputPackageCount: 1,
      researchedPackageCount: 1,
      sourceCount: sourceRecords.length,
      cacheHitCount: 0,
      cacheMissCount: sourceRecords.length,
      cacheRevalidationCount: 0,
      retryCount: 0,
      partialFailureCount: sourceConflict ? 1 : 0
    },
    summary: {
      inputOccurrenceCount: 1,
      packageCount: 1,
      resolvedPackageCount: sourceConflict ? 0 : 1,
      partialPackageCount: sourceConflict ? 1 : 0,
      notFoundPackageCount: 0,
      invalidPackageCount: 0,
      unavailablePackageCount: 0,
      sourceCount: sourceRecords.length,
      warningCount: warnings.length,
      cacheHitCount: 0,
      cacheMissCount: sourceRecords.length,
      staleSourceCount: 0
    },
    packages: [
      {
        id: packageId,
        ecosystem,
        status: sourceConflict ? 'partial' : 'resolved',
        identity: {
          observedDeclaredNames: [occurrence.name],
          normalizedName: packageName,
          registry,
          registryBaseUrl: registry === 'npm' ? 'https://registry.npmjs.org' : 'https://pypi.org',
          packageUrl: `https://example.com/${packageName}`,
          apiUrl: `https://example.com/api/${packageName}`
        },
        occurrences: [
          {
            projectId: project.projects[0].id,
            projectPath: '.',
            manifest: occurrence.manifest,
            dependencyType: occurrence.type,
            declaredName: occurrence.name,
            declaredVersion: occurrence.declaredVersion
          }
        ],
        metadata: {
          description: `${packageName} fixture.`,
          license: 'MIT',
          homepageUrl: null,
          documentationUrl: 'https://example.com/releases',
          repositoryUrl: null,
          issueUrl: null,
          deprecationMessage: null,
          projectStatus: null
        },
        latest: {
          version: versions.at(-1),
          selection: registry === 'npm' ? 'dist-tag:latest' : 'project-info-version',
          publishedAt: '2026-01-03T00:00:00.000Z',
          releaseUrl: `https://example.com/${packageName}/${versions.at(-1)}`,
          prerelease: false,
          yanked: false,
          deprecated: false,
          sourceId
        },
        releaseIndex: releases,
        sourceIds: packageSources,
        warningCodes: sourceConflict ? ['SOURCE_CONFLICT'] : []
      }
    ],
    sources: sourceRecords.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    cache: {
      mode: 'online',
      policyVersion: '1',
      hitCount: 0,
      missCount: sourceRecords.length,
      revalidationCount: 0,
      staleEntryCount: 0
    },
    warnings
  };
}

function evidenceItem({ seed, packageId = 'npm:react', sourceId = 'npm:react:docs', kind = 'releaseNotes', versions = ['2.0.0'], content }) {
  return {
    id: evidenceId(seed),
    packageId,
    sourceId,
    kind,
    contentDigest: digestText(content),
    retrievedAt: '2026-07-14T00:00:03.000Z',
    mediaType: 'text/plain',
    locator: `heading:${versions[0] ?? 'general'}`,
    releaseVersions: [...versions].sort(),
    content
  };
}

function evidenceBundle({ knowledge, knowledgeBytes, evidence }) {
  const sorted = [...evidence].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
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
    summary: {
      evidenceCount: sorted.length,
      packageCount: new Set(sorted.map((item) => item.packageId)).size,
      sourceCount: new Set(sorted.map((item) => item.sourceId)).size,
      warningCount: 0
    },
    evidence: sorted,
    warnings: []
  };
}

async function loadedArtifacts(options = {}) {
  const project = projectManifest(options);
  const projectBytes = jsonBytes(project);
  const knowledge = knowledgeManifest({ ...options, project, projectBytes });
  const knowledgeBytes = jsonBytes(knowledge);
  const packageId = knowledge.packages[0].id;
  const sourceId = knowledge.packages[0].sourceIds[0];
  const evidence = options.evidence ?? [
    evidenceItem({
      seed: 'target-release',
      packageId,
      sourceId,
      kind: 'releaseNotes',
      versions: [options.targetVersion ?? '2.0.0'],
      content: 'Version 2.0.0 documents a breaking behavior change.'
    })
  ];
  const bundle = evidenceBundle({ knowledge, knowledgeBytes, evidence });
  const bundleBytes = jsonBytes(bundle);
  return loadVersionAnalysisArtifacts({
    projectManifest: { bytes: projectBytes, artifact: '.upgradelens/project-manifest.json' },
    knowledgeManifest: { bytes: knowledgeBytes, artifact: '.upgradelens/knowledge-manifest.json' },
    evidenceBundle: { bytes: bundleBytes, artifact: '.upgradelens/knowledge-evidence-bundle.json' }
  });
}

test('loads manifests and evidence bundle with schema, lineage, digest, and invariant validation', async () => {
  const artifacts = await loadedArtifacts();

  assert.equal(artifacts.projectManifest.schemaVersion, '2.0.0');
  assert.equal(artifacts.knowledgeManifest.schemaVersion, '1.0.0');
  assert.equal(artifacts.evidenceBundle.schemaVersion, '1.0.0');
  assert.match(artifacts.input.projectManifest.artifactDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(
    artifacts.knowledgeManifest.input.projectManifest.artifactDigest,
    artifacts.input.projectManifest.artifactDigest
  );
  assert.equal(
    artifacts.evidenceBundle.input.knowledgeManifest.artifactDigest,
    artifacts.input.knowledgeManifest.artifactDigest
  );
});

test('rejects invalid lineage between Knowledge Manifest and Evidence Bundle', async () => {
  const project = projectManifest();
  const projectBytes = jsonBytes(project);
  const knowledge = knowledgeManifest({ project, projectBytes });
  const knowledgeBytes = jsonBytes(knowledge);
  const bundle = evidenceBundle({
    knowledge,
    knowledgeBytes,
    evidence: [evidenceItem({
      seed: 'lineage',
      content: 'Version 2.0.0 documents a breaking behavior change.'
    })]
  });
  bundle.input.knowledgeManifest.artifactDigest = digestText('wrong');

  await assert.rejects(loadVersionAnalysisArtifacts({
    projectManifest: { bytes: projectBytes, artifact: '.upgradelens/project-manifest.json' },
    knowledgeManifest: { bytes: knowledgeBytes, artifact: '.upgradelens/knowledge-manifest.json' },
    evidenceBundle: { bytes: jsonBytes(bundle), artifact: '.upgradelens/knowledge-evidence-bundle.json' }
  }), /Knowledge Evidence Bundle lineage mismatch/);
});

test('resolves one dependency occurrence into one Dependency Analysis Input', async () => {
  const artifacts = await loadedArtifacts();
  const inputs = resolveDependencyAnalysisInputs(artifacts);
  const input = resolveDependencyAnalysisInput(artifacts, {
    projectId: 'node:.',
    manifest: 'package.json',
    dependencyType: 'dependency',
    declaredName: 'react'
  });

  assert.equal(inputs.length, 1);
  assert.equal(input.packageRecord.id, 'npm:react');
  assert.equal(input.dependency.declaredVersion, '^1.0.0');
});

test('builds exactBaseline context from an exact declared version without guessing', async () => {
  const artifacts = await loadedArtifacts({ declaredVersion: '1.0.0' });
  const context = buildDependencyAiContext(artifacts, { targetVersion: '2.0.0' });

  assert.equal(context.versions.analysisMode, 'exactBaseline');
  assert.equal(context.versions.currentVersion, '1.0.0');
  assert.equal(context.versions.currentVersionSource, 'exactDeclaration');
  assert.deepEqual(context.versions.delta, { direction: 'upgrade', classification: 'major' });
  assert.deepEqual(context.knowledge.relevantReleases, ['1.1.0', '2.0.0']);
});

test('builds declaredConstraint context with null current version and unknown delta', async () => {
  const artifacts = await loadedArtifacts({ declaredVersion: '^1.0.0' });
  const context = buildDependencyAiContext(artifacts, { target: { policy: 'registryLatest' } });

  assert.equal(context.versions.analysisMode, 'declaredConstraint');
  assert.equal(context.versions.currentVersion, null);
  assert.equal(context.versions.currentVersionSource, null);
  assert.deepEqual(context.versions.delta, { direction: 'unknown', classification: 'unknown' });
  assert.deepEqual(context.knowledge.relevantReleases, ['2.0.0']);
});

test('supports explicit current version as exactBaseline while preserving declared range', async () => {
  const artifacts = await loadedArtifacts({ declaredVersion: '^1.0.0' });
  const context = buildDependencyAiContext(artifacts, {
    currentVersion: '1.1.0',
    targetVersion: '2.0.0'
  });

  assert.equal(context.versions.analysisMode, 'exactBaseline');
  assert.equal(context.versions.declaredVersion, '^1.0.0');
  assert.equal(context.versions.currentVersion, '1.1.0');
  assert.equal(context.versions.currentVersionSource, 'explicit');
  assert.deepEqual(context.knowledge.relevantReleases, ['2.0.0']);
});

test('version adapter registry supports Node SemVer and Python PEP 440 behind the same interface', () => {
  const registry = createDefaultEcosystemVersionAdapterRegistry();
  const node = getEcosystemVersionAdapter('node', registry);
  const python = getEcosystemVersionAdapter('python', registry);

  assert.deepEqual(node.normalizeVersion('v1.2.3'), { ok: true, value: '1.2.3' });
  assert.deepEqual(node.resolveDeclaredBaseline('^1'), { kind: 'declaredConstraint', constraint: '^1' });
  assert.deepEqual(node.compareVersions('1.2.3', '2.0.0'), { direction: 'upgrade', classification: 'major' });
  assert.deepEqual(python.normalizeVersion('1.2.0rc1'), { ok: true, value: '1.2.0rc1' });
  assert.deepEqual(python.resolveDeclaredBaseline('==1.2.0'), { kind: 'exactVersion', version: '1.2.0' });
  assert.deepEqual(python.resolveDeclaredBaseline('>=1,<2'), { kind: 'declaredConstraint', constraint: '>=1,<2' });
});

test('selects only relevant evidence with deterministic priority and stable ordering', async () => {
  const target = evidenceItem({
    seed: 'target-release',
    kind: 'releaseNotes',
    versions: ['2.0.0'],
    content: 'Version 2.0.0 release notes.'
  });
  const breaking = evidenceItem({
    seed: 'breaking',
    kind: 'breakingChanges',
    versions: ['2.0.0'],
    content: 'Version 2.0.0 has a documented breaking change.'
  });
  const unrelated = evidenceItem({
    seed: 'unrelated',
    kind: 'releaseNotes',
    versions: ['1.1.0'],
    content: 'Version 1.1.0 release notes.'
  });
  const duplicate = {
    ...evidenceItem({
      seed: 'duplicate',
      kind: 'migrationGuide',
      versions: ['2.0.0'],
      content: breaking.content
    }),
    contentDigest: breaking.contentDigest
  };
  const artifacts = await loadedArtifacts({ evidence: [target, breaking, unrelated, duplicate] });
  const context = buildDependencyAiContext(artifacts, { targetVersion: '2.0.0' });

  assert.deepEqual(context.knowledge.evidence.map((item) => item.kind), ['breakingChanges', 'releaseNotes']);
  assert.deepEqual(context.knowledge.evidence.map((item) => item.releaseVersions), [[ '2.0.0' ], [ '2.0.0' ]]);
});

test('context digest and context equality are canonical and stable', async () => {
  const artifacts = await loadedArtifacts({ declaredVersion: '1.0.0' });
  const first = buildDependencyAiContext(artifacts, { targetVersion: '2.0.0' });
  const second = buildDependencyAiContext(structuredClone(artifacts), { targetVersion: '2.0.0' });

  assert.equal(first.contextId, dependencyAiContextDigest(first));
  assert.equal(second.contextId, dependencyAiContextDigest(second));
  assert.equal(first.contextId, second.contextId);
  assert.equal(dependencyAiContextsEqual(first, second), true);
});

test('missing evidence produces deterministic context warnings instead of invoking a model', async () => {
  const artifacts = await loadedArtifacts({ evidence: [] });
  const context = buildDependencyAiContext(artifacts, { targetVersion: '2.0.0' });

  assert.deepEqual(context.knowledge.evidence, []);
  assert.deepEqual(context.metadata.missingInformation, ['evidence']);
  assert.equal(context.metadata.warnings[0].code, 'EVIDENCE_MISSING');
});

test('source conflicts for the selected dependency are propagated into Dependency AI Context warnings', async () => {
  const artifacts = await loadedArtifacts({ sourceConflict: true });
  const context = buildDependencyAiContext(artifacts, { targetVersion: '2.0.0' });
  const conflictWarnings = context.metadata.warnings.filter((warning) => warning.code === 'SOURCE_CONFLICT');

  assert.equal(conflictWarnings.length, 2);
  assert.deepEqual(conflictWarnings.map((warning) => warning.packageId), ['npm:react', 'npm:react']);
  assert.ok(conflictWarnings.some((warning) => warning.sourceId === 'npm:react:docs'));
  assert.ok(conflictWarnings.some((warning) => warning.conflictSourceIds?.includes('npm:react:registry')));
  assert.equal(context.contextId, dependencyAiContextDigest(context));
});

test('source conflicts unrelated to the selected dependency are not propagated into context', async () => {
  const artifacts = await loadedArtifacts({ unrelatedSourceConflict: true });
  const context = buildDependencyAiContext(artifacts, { targetVersion: '2.0.0' });

  assert.deepEqual(context.metadata.warnings.filter((warning) => warning.code === 'SOURCE_CONFLICT'), []);
});

test('unsupported ecosystem fails at adapter boundary without ecosystem-specific AI core changes', async () => {
  const artifacts = await loadedArtifacts({ declaredVersion: '1.0.0' });
  artifacts.projectManifest.projects[0].ecosystem = 'java';
  artifacts.knowledgeManifest.packages[0].ecosystem = 'java';

  assert.throws(() => buildDependencyAiContext(artifacts, { targetVersion: '2.0.0' }), /Unsupported ecosystem java/);
});

test('AI runtime is only a boundary contract in VA-02', () => {
  const runtime = { generateStructured: async () => ({ output: {}, provider: 'fake', model: 'fake', latencyMs: 0 }) };
  assert.equal(validateAiRuntime(runtime), runtime);
  assert.throws(() => validateAiRuntime({}), /AiRuntime must provide generateStructured/);
});
