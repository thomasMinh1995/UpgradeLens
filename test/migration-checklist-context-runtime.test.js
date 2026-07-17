import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  analyzeRepositoryImpact,
  buildKnowledgeEvidenceBundle,
  buildMigrationChecklist,
  buildRepositoryImpactEvidence,
  buildUsageIndex,
  buildVersionAnalysisManifest,
  createJavaScriptUsageAnalyzer,
  loadMigrationChecklistInputs,
  prepareMigrationChecklistContexts
} from '../src/index.js';

const generatedAt = '2026-07-16T00:00:00.000Z';

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function bytes(value) {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function artifactDigest(value) {
  return digest(bytes(value));
}

function projectLineage(project, projectBytes) {
  return {
    schemaVersion: '2.0.0',
    artifact: '.upgradelens/project-manifest.json',
    artifactDigest: digest(projectBytes),
    repository: structuredClone(project.repository)
  };
}

function artifactLineage(artifact, value) {
  return { schemaVersion: '1.0.0', artifact, artifactDigest: artifactDigest(value) };
}

function projectManifest({ ecosystem, declaredName, normalizedName, declaredVersion, dependencyType, manifest }) {
  const projectId = `${ecosystem}:.`;
  return {
    schemaVersion: '2.0.0',
    generatedAt,
    generator: { name: 'UpgradeLens', version: '0.4.0' },
    repository: { name: 'fixture', root: '.' },
    summary: { projectCount: 1, ecosystems: { [ecosystem]: 1 }, workspaceCount: 0 },
    projects: [{
      id: projectId,
      name: 'fixture',
      path: '.',
      ecosystem,
      languages: [ecosystem === 'node' ? 'JavaScript' : 'Python'],
      manifests: [manifest],
      packageManager: { name: ecosystem === 'node' ? 'npm' : 'pip' },
      dependencySummary: {
        status: 'parsed',
        declarationCount: 1,
        uniqueCount: 1,
        duplicateCount: 0,
        byType: {
          dependencies: dependencyType === 'dependency' ? 1 : 0,
          devDependencies: 0,
          peerDependencies: 0,
          optionalDependencies: 0
        }
      },
      dependencies: [{
        name: declaredName,
        normalizedName,
        declaredVersion,
        type: dependencyType,
        manifest
      }]
    }],
    warnings: []
  };
}

async function knowledgeManifest({ ecosystem, project, projectBytes, sourceStatus = 'available', conflict = false }) {
  const fixtureName = ecosystem === 'node' ? 'resolved-npm-react.json' : 'resolved-pypi-fastapi.json';
  const knowledge = JSON.parse(await readFile(
    new URL(`./fixtures/knowledge-manifest/${fixtureName}`, import.meta.url),
    'utf8'
  ));
  const packageRecord = knowledge.packages[0];
  const occurrence = packageRecord.occurrences[0];
  const projectDependency = project.projects[0].dependencies[0];
  occurrence.projectId = project.projects[0].id;
  occurrence.projectPath = '.';
  occurrence.manifest = projectDependency.manifest;
  occurrence.dependencyType = projectDependency.type;
  occurrence.declaredName = projectDependency.name;
  occurrence.declaredVersion = projectDependency.declaredVersion;
  const documentationSource = {
    id: `${packageRecord.id}:documentation`,
    kind: 'officialDocumentation',
    authority: 'officialProject',
    trust: 'official',
    url: packageRecord.metadata.documentationUrl,
    status: sourceStatus,
    supports: ['breakingChanges', 'migrationGuide'],
    discoveredFrom: null,
    trustEvidenceSourceIds: [],
    snapshot: {
      contentDigest: digest(`${packageRecord.id}:documentation`),
      mediaType: 'text/markdown',
      retrievedAt: '2026-07-15T00:00:00.000Z',
      freshness: sourceStatus === 'stale' ? 'stale' : 'fresh'
    },
    ...(conflict ? { conflictsWith: [packageRecord.sourceIds[0]] } : {})
  };
  knowledge.sources.push(documentationSource);
  knowledge.sources.sort((left, right) => left.id.localeCompare(right.id));
  packageRecord.sourceIds.push(documentationSource.id);
  packageRecord.sourceIds.sort();
  knowledge.input.projectManifest = projectLineage(project, projectBytes);
  knowledge.research.sourceCount = knowledge.sources.length;
  knowledge.summary.sourceCount = knowledge.sources.length;
  knowledge.summary.staleSourceCount = sourceStatus === 'stale' ? 1 : 0;
  knowledge.cache.staleEntryCount = sourceStatus === 'stale' ? 1 : 0;
  return { knowledge, documentationSource, packageRecord };
}

function dependencyFacts(project, packageRecord) {
  const dependency = project.projects[0].dependencies[0];
  return {
    projectId: project.projects[0].id,
    packageId: packageRecord.id,
    declaredName: dependency.name,
    normalizedName: dependency.normalizedName,
    ecosystem: project.projects[0].ecosystem,
    registry: packageRecord.identity.registry,
    packageManager: project.projects[0].packageManager.name,
    dependencyType: dependency.type,
    manifest: dependency.manifest
  };
}

function versionsFor(ecosystem, declaredVersion, targetVersion, targetPolicy, uncertainBaseline) {
  return {
    analysisMode: uncertainBaseline ? 'declaredConstraint' : 'exactBaseline',
    declaredVersion,
    currentVersion: uncertainBaseline ? null : (ecosystem === 'node' ? '18.0.0' : '0.115.0'),
    currentVersionSource: uncertainBaseline ? null : 'exactDeclaration',
    targetVersion,
    targetPolicy,
    delta: uncertainBaseline
      ? { direction: 'unknown', classification: 'unknown' }
      : { direction: 'upgrade', classification: ecosystem === 'node' ? 'major' : 'minor' }
  };
}

async function fixture({
  ecosystem = 'node',
  evidenceKind = 'migrationGuide',
  analysisStatus = 'analyzed',
  sourceStatus = 'available',
  conflict = false,
  positiveLocation = true,
  targetPolicy = 'explicit',
  uncertainBaseline = false,
  nullTarget = false,
  evidenceContents = ['Use the documented replacement API for this release.']
} = {}) {
  const facts = ecosystem === 'node'
    ? {
        declaredName: 'react', normalizedName: 'react', declaredVersion: '18.0.0',
        dependencyType: 'dependency', manifest: 'package.json', targetVersion: '19.2.0', symbol: 'createRoot'
      }
    : {
        declaredName: 'FastAPI', normalizedName: 'fastapi', declaredVersion: '0.115.0',
        dependencyType: 'runtime', manifest: 'requirements.txt', targetVersion: '0.116.0', symbol: 'FastAPI'
      };
  if (uncertainBaseline) {
    facts.declaredVersion = ecosystem === 'node' ? '^18.0.0' : '>=0.115.0';
  }
  const project = projectManifest({ ecosystem, ...facts });
  const projectBytes = bytes(project);
  const { knowledge, documentationSource, packageRecord } = await knowledgeManifest({
    ecosystem, project, projectBytes, sourceStatus, conflict
  });
  const knowledgeBytes = bytes(knowledge);
  const enrichedEvidence = evidenceContents.map((content, index) => ({
    id: digest(`${packageRecord.id}:evidence:${index}`),
    packageId: packageRecord.id,
    sourceId: documentationSource.id,
    kind: evidenceKind,
    contentDigest: digest(content),
    retrievedAt: '2026-07-15T00:00:01.000Z',
    mediaType: 'text/markdown',
    locator: `heading:${index + 1}`,
    releaseVersions: [facts.targetVersion],
    content
  }));
  const bundle = buildKnowledgeEvidenceBundle(knowledge, {
    knowledgeManifestArtifact: '.upgradelens/knowledge-manifest.json',
    knowledgeManifestBytes: knowledgeBytes,
    generatedAt,
    enrichedEvidence
  });
  const bundleBytes = bytes(bundle);
  const actionEvidence = bundle.evidence.filter((item) => item.sourceId === documentationSource.id);
  const dependency = dependencyFacts(project, packageRecord);
  const versions = versionsFor(
    ecosystem,
    facts.declaredVersion,
    nullTarget ? null : facts.targetVersion,
    targetPolicy,
    uncertainBaseline
  );
  const context = {
    contextVersion: '1',
    contextId: digest(`${packageRecord.id}:context`),
    lineage: {
      projectManifestDigest: digest(projectBytes),
      knowledgeManifestDigest: digest(knowledgeBytes),
      knowledgeResearchId: knowledge.research.researchId,
      evidenceArtifactDigest: digest(bundleBytes)
    },
    dependency,
    versions,
    knowledge: {
      relevantReleases: [facts.targetVersion],
      evidence: actionEvidence.map((item) => ({
        ...structuredClone(item),
        sourceUrl: documentationSource.url,
        authority: documentationSource.authority,
        trust: documentationSource.trust
      }))
    },
    metadata: {
      selectedEvidenceIds: actionEvidence.map((item) => item.id).sort(),
      missingInformation: [],
      warnings: [],
      size: { characters: 1000, evidenceItems: actionEvidence.length }
    }
  };
  const finding = {
    id: `${facts.symbol}-changed`,
    kind: 'breakingChange',
    summary: `${facts.symbol} changed in the target release.`,
    appliesToVersions: [facts.targetVersion],
    evidenceRefs: actionEvidence.map((item) => item.id).sort()
  };
  const analysis = {
    resultVersion: '1',
    status: analysisStatus,
    contextId: context.contextId,
    dependency: structuredClone(dependency),
    versions: structuredClone(versions),
    summary: analysisStatus === 'analyzed' ? finding.summary : 'Analysis was skipped.',
    summaryEvidenceRefs: analysisStatus === 'analyzed' ? finding.evidenceRefs : [],
    riskLevel: analysisStatus === 'analyzed' ? 'high' : 'unknown',
    riskEvidenceRefs: analysisStatus === 'analyzed' ? finding.evidenceRefs : [],
    findings: analysisStatus === 'analyzed' ? [finding] : [],
    evidenceCoverage: actionEvidence.length > 0 ? 'sufficient' : 'none',
    validation: { status: 'valid', warningCodes: [] },
    requiresHumanReview: true,
    humanReviewReasons: ['UPSTREAM_REVIEW'],
    nextAction: analysisStatus === 'analyzed' ? 'proceedToImpactAnalysis' : 'retryAnalysis',
    limitations: []
  };
  const version = buildVersionAnalysisManifest({
    input: {
      projectManifest: projectLineage(project, projectBytes),
      knowledgeManifest: {
        schemaVersion: '1.0.0',
        artifact: '.upgradelens/knowledge-manifest.json',
        artifactDigest: digest(knowledgeBytes),
        researchId: knowledge.research.researchId
      },
      evidenceArtifact: artifactLineage('.upgradelens/knowledge-evidence-bundle.json', bundle)
    },
    contexts: [context],
    results: [analysis],
    generatedAt
  });
  const usage = buildUsageIndex({
    input: {
      projectManifest: projectLineage(project, projectBytes),
      versionAnalysis: artifactLineage('.upgradelens/version-analysis.json', version)
    },
    usages: positiveLocation && analysisStatus === 'analyzed'
      ? [{
          projectId: dependency.projectId,
          packageId: dependency.packageId,
          dependency: dependency.declaredName,
          symbol: facts.symbol,
          file: ecosystem === 'node' ? 'src/App.tsx' : 'src/app.py'
        }]
      : [],
    scannedFileCount: 1,
    analyzedFileCount: 1,
    analyzers: [createJavaScriptUsageAnalyzer()],
    warnings: [],
    generatedAt
  });
  const impact = analyzeRepositoryImpact({
    versionAnalysis: version,
    usageIndex: usage,
    input: {
      projectManifest: projectLineage(project, projectBytes),
      versionAnalysis: artifactLineage('.upgradelens/version-analysis.json', version),
      usageIndex: artifactLineage('.upgradelens/usage-index.json', usage)
    },
    clock: () => new Date(generatedAt)
  });
  const impactEvidence = buildRepositoryImpactEvidence({
    input: {
      projectManifest: projectLineage(project, projectBytes),
      versionAnalysis: artifactLineage('.upgradelens/version-analysis.json', version),
      usageIndex: artifactLineage('.upgradelens/usage-index.json', usage),
      repositoryImpact: artifactLineage('.upgradelens/repository-impact.json', impact)
    },
    repositoryImpact: impact,
    usageIndex: usage,
    generatedAt
  });
  const artifacts = { project, knowledge, bundle, version, usage, impact, impactEvidence };
  return { artifacts, sources: sourcesFor(artifacts), actionEvidence, facts };
}

function analysisInputFromResult(result) {
  return {
    resultVersion: '1',
    status: result.status,
    contextId: result.contextId,
    dependency: structuredClone(result.dependency),
    versions: structuredClone(result.versions),
    summary: result.summary,
    summaryEvidenceRefs: [...result.summaryEvidenceRefs],
    riskLevel: result.riskLevel,
    riskEvidenceRefs: [...result.riskEvidenceRefs],
    findings: structuredClone(result.findings),
    evidenceCoverage: result.evidenceCoverage,
    validation: structuredClone(result.validation),
    requiresHumanReview: result.requiresHumanReview,
    humanReviewReasons: [...result.humanReviewReasons],
    nextAction: result.nextAction,
    limitations: structuredClone(result.limitations)
  };
}

function versionContextFromResult(result, evidence) {
  return {
    contextVersion: '1',
    contextId: result.contextId,
    dependency: structuredClone(result.dependency),
    versions: structuredClone(result.versions),
    knowledge: { evidence: structuredClone(evidence) }
  };
}

function compareKnowledgeOccurrences(left, right) {
  for (const field of ['projectId', 'manifest', 'dependencyType', 'declaredName']) {
    const compared = left[field].localeCompare(right[field]);
    if (compared !== 0) return compared;
  }
  return (left.declaredVersion ?? '').localeCompare(right.declaredVersion ?? '');
}

async function duplicateOccurrenceFixture({
  secondStatus = 'skipped',
  reverseVersionInputs = false
} = {}) {
  const chain = await fixture({
    uncertainBaseline: secondStatus === 'skipped',
    evidenceContents: ['First occurrence instruction.', 'Second occurrence instruction.']
  });
  const artifacts = chain.artifacts;
  const project = artifacts.project.projects[0];
  const firstDependency = project.dependencies[0];
  const secondDeclaredVersion = secondStatus === 'analyzed' ? '17.0.0' : null;
  project.dependencies.push({
    ...structuredClone(firstDependency),
    declaredVersion: secondDeclaredVersion
  });
  project.dependencySummary.declarationCount = 2;
  project.dependencySummary.uniqueCount = 1;
  project.dependencySummary.duplicateCount = 1;
  project.dependencySummary.byType.dependencies = 2;

  const packageRecord = artifacts.knowledge.packages[0];
  packageRecord.occurrences.push({
    ...structuredClone(packageRecord.occurrences[0]),
    declaredVersion: secondDeclaredVersion
  });
  packageRecord.occurrences.sort(compareKnowledgeOccurrences);
  artifacts.knowledge.summary.inputOccurrenceCount = 2;
  artifacts.knowledge.research.inputOccurrenceCount = 2;

  const projectBytes = bytes(artifacts.project);
  artifacts.knowledge.input.projectManifest = projectLineage(artifacts.project, projectBytes);
  const knowledgeBytes = bytes(artifacts.knowledge);
  artifacts.bundle.input.knowledgeManifest = {
    schemaVersion: '1.0.0',
    artifact: '.upgradelens/knowledge-manifest.json',
    artifactDigest: digest(knowledgeBytes),
    researchId: artifacts.knowledge.research.researchId
  };

  const firstResult = structuredClone(artifacts.version.results[0]);
  const resultEvidence = structuredClone(firstResult.evidence);
  const firstEvidence = [
    resultEvidence.find((item) => item.id === chain.actionEvidence[0].id)
  ];
  const firstFinding = firstResult.findings[0];
  firstFinding.evidenceRefs = [firstEvidence[0].id];
  firstResult.summaryEvidenceRefs = [firstEvidence[0].id];
  firstResult.riskEvidenceRefs = [firstEvidence[0].id];
  const firstAnalysis = analysisInputFromResult(firstResult);
  const firstContext = versionContextFromResult(firstResult, firstEvidence);

  const secondResult = structuredClone(firstResult);
  secondResult.contextId = digest(`duplicate-occurrence:${secondStatus}`);
  secondResult.versions = secondStatus === 'analyzed'
    ? {
        ...structuredClone(firstResult.versions),
        declaredVersion: secondDeclaredVersion,
        currentVersion: secondDeclaredVersion
      }
    : {
        ...structuredClone(firstResult.versions),
        analysisMode: 'unsupportedBaseline',
        declaredVersion: null,
        currentVersion: null,
        currentVersionSource: null,
        delta: { direction: 'unknown', classification: 'unknown' }
      };
  const secondEvidence = secondStatus === 'analyzed'
    ? [resultEvidence.find((item) => item.id === chain.actionEvidence[1].id)]
    : [];
  const secondAnalysis = analysisInputFromResult(secondResult);
  secondAnalysis.contextId = secondResult.contextId;
  secondAnalysis.versions = structuredClone(secondResult.versions);
  if (secondStatus === 'analyzed') {
    const finding = {
      id: 'legacyRoot-changed',
      kind: 'breakingChange',
      summary: 'legacyRoot changed in the target release.',
      appliesToVersions: [secondResult.versions.targetVersion],
      evidenceRefs: [secondEvidence[0].id]
    };
    secondAnalysis.findings = [finding];
    secondAnalysis.summary = finding.summary;
    secondAnalysis.summaryEvidenceRefs = [...finding.evidenceRefs];
    secondAnalysis.riskEvidenceRefs = [...finding.evidenceRefs];
  } else {
    secondAnalysis.status = 'skipped';
    secondAnalysis.summary = 'Analysis was skipped because the baseline is unsupported.';
    secondAnalysis.summaryEvidenceRefs = [];
    secondAnalysis.riskLevel = 'unknown';
    secondAnalysis.riskEvidenceRefs = [];
    secondAnalysis.findings = [];
    secondAnalysis.evidenceCoverage = 'none';
    secondAnalysis.validation = {
      status: 'validWithWarnings',
      warningCodes: ['BASELINE_UNSUPPORTED']
    };
    secondAnalysis.humanReviewReasons = ['BASELINE_UNSUPPORTED'];
    secondAnalysis.nextAction = 'resolveCurrentVersion';
    secondAnalysis.limitations = [{
      code: 'BASELINE_UNSUPPORTED',
      message: 'The dependency declaration has no supported exact baseline.'
    }];
  }
  const secondContext = versionContextFromResult(secondResult, secondEvidence);
  const contexts = [firstContext, secondContext];
  const results = [firstAnalysis, secondAnalysis];
  if (reverseVersionInputs) {
    contexts.reverse();
    results.reverse();
  }

  artifacts.version = buildVersionAnalysisManifest({
    input: {
      projectManifest: projectLineage(artifacts.project, projectBytes),
      knowledgeManifest: structuredClone(artifacts.bundle.input.knowledgeManifest),
      evidenceArtifact: artifactLineage(
        '.upgradelens/knowledge-evidence-bundle.json',
        artifacts.bundle
      )
    },
    contexts,
    results,
    generatedAt
  });
  artifacts.usage.input.projectManifest = projectLineage(artifacts.project, projectBytes);
  artifacts.usage.input.versionAnalysis = artifactLineage(
    '.upgradelens/version-analysis.json',
    artifacts.version
  );
  artifacts.impact = analyzeRepositoryImpact({
    versionAnalysis: artifacts.version,
    usageIndex: artifacts.usage,
    input: {
      projectManifest: projectLineage(artifacts.project, projectBytes),
      versionAnalysis: artifactLineage('.upgradelens/version-analysis.json', artifacts.version),
      usageIndex: artifactLineage('.upgradelens/usage-index.json', artifacts.usage)
    },
    clock: () => new Date(generatedAt)
  });
  artifacts.impactEvidence = buildRepositoryImpactEvidence({
    input: {
      projectManifest: projectLineage(artifacts.project, projectBytes),
      versionAnalysis: artifactLineage('.upgradelens/version-analysis.json', artifacts.version),
      usageIndex: artifactLineage('.upgradelens/usage-index.json', artifacts.usage),
      repositoryImpact: artifactLineage('.upgradelens/repository-impact.json', artifacts.impact)
    },
    repositoryImpact: artifacts.impact,
    usageIndex: artifacts.usage,
    generatedAt
  });
  rechain(artifacts);
  return {
    artifacts,
    sources: sourcesFor(artifacts),
    actionEvidence: chain.actionEvidence,
    facts: chain.facts
  };
}

function sourcesFor({ project, knowledge, bundle, version, usage, impact, impactEvidence }) {
  return {
    projectManifest: { bytes: bytes(project), artifact: '.upgradelens/project-manifest.json' },
    knowledgeManifest: { bytes: bytes(knowledge), artifact: '.upgradelens/knowledge-manifest.json' },
    knowledgeEvidenceBundle: {
      bytes: bytes(bundle), artifact: '.upgradelens/knowledge-evidence-bundle.json'
    },
    versionAnalysis: { bytes: bytes(version), artifact: '.upgradelens/version-analysis.json' },
    usageIndex: { bytes: bytes(usage), artifact: '.upgradelens/usage-index.json' },
    repositoryImpact: { bytes: bytes(impact), artifact: '.upgradelens/repository-impact.json' },
    repositoryImpactEvidence: {
      bytes: bytes(impactEvidence), artifact: '.upgradelens/repository-impact-evidence.json'
    }
  };
}

function rechain(artifacts) {
  const projectBytes = bytes(artifacts.project);
  artifacts.knowledge.input.projectManifest = projectLineage(artifacts.project, projectBytes);
  const knowledgeBytes = bytes(artifacts.knowledge);
  artifacts.bundle.input.knowledgeManifest = {
    schemaVersion: '1.0.0',
    artifact: '.upgradelens/knowledge-manifest.json',
    artifactDigest: digest(knowledgeBytes),
    researchId: artifacts.knowledge.research.researchId
  };
  artifacts.version.input.projectManifest = projectLineage(artifacts.project, projectBytes);
  artifacts.version.input.knowledgeManifest = structuredClone(artifacts.bundle.input.knowledgeManifest);
  artifacts.version.input.evidenceArtifact = artifactLineage('.upgradelens/knowledge-evidence-bundle.json', artifacts.bundle);
  artifacts.usage.input.projectManifest = projectLineage(artifacts.project, projectBytes);
  artifacts.usage.input.versionAnalysis = artifactLineage('.upgradelens/version-analysis.json', artifacts.version);
  artifacts.impact.input.projectManifest = projectLineage(artifacts.project, projectBytes);
  artifacts.impact.input.versionAnalysis = artifactLineage('.upgradelens/version-analysis.json', artifacts.version);
  artifacts.impact.input.usageIndex = artifactLineage('.upgradelens/usage-index.json', artifacts.usage);
  artifacts.impactEvidence.input.projectManifest = projectLineage(artifacts.project, projectBytes);
  artifacts.impactEvidence.input.versionAnalysis = artifactLineage('.upgradelens/version-analysis.json', artifacts.version);
  artifacts.impactEvidence.input.usageIndex = artifactLineage('.upgradelens/usage-index.json', artifacts.usage);
  artifacts.impactEvidence.input.repositoryImpact = artifactLineage('.upgradelens/repository-impact.json', artifacts.impact);
  return artifacts;
}

test('loads and deeply freezes seven valid artifacts with exact-byte lineage', async () => {
  const chain = await fixture();
  const loaded = await loadMigrationChecklistInputs({ sources: chain.sources });

  assert.equal(loaded.versionAnalysis.results.length, 1);
  assert.equal(Object.isFrozen(loaded), true);
  assert.equal(Object.isFrozen(loaded.versionAnalysis.results[0]), true);
  assert.equal(loaded.input.projectManifest.artifactDigest, digest(chain.sources.projectManifest.bytes));
});

test('rejects missing, malformed, and schema-invalid artifacts before context construction', async () => {
  const chain = await fixture();
  const missing = { ...chain.sources };
  delete missing.usageIndex;
  await assert.rejects(
    () => loadMigrationChecklistInputs({ sources: missing }),
    (error) => error.code === 'MISSING_ARTIFACT' && !error.message.includes('/Users/')
  );
  await assert.rejects(
    () => loadMigrationChecklistInputs({ sources: {
      ...chain.sources,
      usageIndex: { ...chain.sources.usageIndex, bytes: Buffer.from('{') }
    } }),
    (error) => error.code === 'INVALID_JSON'
  );
  const invalid = structuredClone(chain.artifacts.usage);
  invalid.unexpected = true;
  await assert.rejects(
    () => loadMigrationChecklistInputs({ sources: {
      ...chain.sources,
      usageIndex: { ...chain.sources.usageIndex, bytes: bytes(invalid) }
    } }),
    /additional properties/
  );
});

test('rejects exact-byte lineage changes including upstream whitespace', async () => {
  const chain = await fixture();
  const sources = {
    ...chain.sources,
    projectManifest: {
      ...chain.sources.projectManifest,
      bytes: Buffer.concat([chain.sources.projectManifest.bytes, Buffer.from('\n')])
    }
  };
  await assert.rejects(
    () => loadMigrationChecklistInputs({ sources }),
    (error) => error.code === 'LINEAGE_MISMATCH'
      && error.consumer === 'Knowledge Manifest'
      && error.upstream === 'Project Manifest'
  );
});

test('rejects Version, Usage, Impact, and Impact Evidence lineage mismatches', async () => {
  for (const [key, mutate] of [
    ['versionAnalysis', (value) => { value.input.knowledgeManifest.artifactDigest = digest('wrong'); }],
    ['usageIndex', (value) => { value.input.versionAnalysis.artifactDigest = digest('wrong'); }],
    ['repositoryImpact', (value) => { value.input.usageIndex.artifactDigest = digest('wrong'); }],
    ['repositoryImpactEvidence', (value) => { value.input.repositoryImpact.artifactDigest = digest('wrong'); }]
  ]) {
    const chain = await fixture();
    const value = structuredClone(JSON.parse(chain.sources[key].bytes));
    mutate(value);
    await assert.rejects(
      () => loadMigrationChecklistInputs({ sources: {
        ...chain.sources,
        [key]: { ...chain.sources[key], bytes: bytes(value) }
      } }),
      (error) => error.code === 'LINEAGE_MISMATCH',
      key
    );
  }
});

test('rejects unknown dependency occurrences and evidence outside package provenance', async () => {
  const occurrenceChain = await fixture();
  occurrenceChain.artifacts.project.projects[0].dependencies[0].declaredVersion = '17.0.0';
  rechain(occurrenceChain.artifacts);
  await assert.rejects(
    () => loadMigrationChecklistInputs({ sources: sourcesFor(occurrenceChain.artifacts) }),
    /does not match one exact Project Manifest dependency occurrence/
  );

  const evidenceChain = await fixture();
  const action = evidenceChain.artifacts.bundle.evidence.find((item) => item.kind === 'migrationGuide');
  action.packageId = 'npm:other';
  evidenceChain.artifacts.bundle.summary.packageCount = 2;
  rechain(evidenceChain.artifacts);
  await assert.rejects(
    () => loadMigrationChecklistInputs({ sources: sourcesFor(evidenceChain.artifacts) }),
    /cross-package or unknown provenance/
  );
});

test('rejects a Version finding evidence ref that is absent from the Knowledge Evidence Bundle', async () => {
  const chain = await fixture();
  const actionId = chain.actionEvidence[0].id;
  chain.artifacts.bundle.evidence = chain.artifacts.bundle.evidence.filter((item) => item.id !== actionId);
  chain.artifacts.bundle.summary.evidenceCount = chain.artifacts.bundle.evidence.length;
  chain.artifacts.bundle.summary.sourceCount = new Set(
    chain.artifacts.bundle.evidence.map((item) => item.sourceId)
  ).size;
  rechain(chain.artifacts);

  await assert.rejects(
    () => loadMigrationChecklistInputs({ sources: sourcesFor(chain.artifacts) }),
    /cross-package or unknown provenance/
  );
});

test('rejects finding, symbol/file, and Impact Evidence location inconsistencies', async () => {
  const findingChain = await fixture();
  findingChain.artifacts.impact.dependencies[0].findings[0].id = 'unknown-finding';
  rechain(findingChain.artifacts);
  await assert.rejects(
    () => loadMigrationChecklistInputs({ sources: sourcesFor(findingChain.artifacts) }),
    /Repository Impact finding/
  );

  const usageChain = await fixture();
  usageChain.artifacts.impact.dependencies[0].findings[0].matches[0].files[0] = 'src/Other.tsx';
  rechain(usageChain.artifacts);
  await assert.rejects(
    () => loadMigrationChecklistInputs({ sources: sourcesFor(usageChain.artifacts) }),
    /inconsistent with Version Analysis or Usage Index/
  );

  const locationChain = await fixture();
  locationChain.artifacts.impactEvidence.dependencies[0].findings[0].matchedSymbols[0].usages[0].file = 'src/Other.tsx';
  rechain(locationChain.artifacts);
  await assert.rejects(
    () => loadMigrationChecklistInputs({ sources: sourcesFor(locationChain.artifacts) }),
    /location.*inconsistent with Repository Impact/
  );
});

test('builds an eligible bounded official context with exact positive candidate location', async () => {
  const chain = await fixture({ targetPolicy: 'registryLatest' });
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });
  const context = prepared.eligibleContexts[0];

  assert.equal(prepared.summary.eligible, 1);
  assert.equal(context.eligibility.reasonCode, 'ELIGIBLE');
  assert.equal(context.locationEligibility.reasonCode, 'POSITIVE_USAGE_MATCH');
  assert.deepEqual(context.positiveCandidateLocations, [{
    impactEvidenceId: chain.artifacts.impactEvidence.dependencies[0].findings[0].id,
    symbol: 'createRoot',
    file: 'src/App.tsx'
  }]);
  assert.equal(context.evidence[0].sourceUrl, chain.artifacts.knowledge.sources[0].url);
  assert.equal(context.versions.targetPolicy, 'registryLatest');
  assert.equal('recommended' in context.versions, false);
  assert.ok(context.limitations.some((item) => item.code === 'REGISTRY_LATEST_IS_NOT_RECOMMENDATION'));
});

test('skipped analysis yields NOT_ANALYZED fallback and no eligible context', async () => {
  const chain = await fixture({ analysisStatus: 'skipped', positiveLocation: false });
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });

  assert.deepEqual(prepared.eligibleContexts, []);
  assert.equal(prepared.summary.notAnalyzed, 1);
  assert.equal(prepared.fallbackRecords[0].analysisStatus, 'skipped');
  assert.deepEqual(prepared.fallbackRecords[0].findings, []);
  assert.ok(prepared.fallbackRecords[0].limitations.some((item) => item.code === 'NOT_ANALYZED'));
});

test('reconciles analyzed and skipped occurrences of one package without dropping either result', async () => {
  const chain = await duplicateOccurrenceFixture({ secondStatus: 'skipped' });
  const loaded = await loadMigrationChecklistInputs({ sources: chain.sources });
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });

  assert.equal(loaded.versionAnalysis.results.length, 2);
  assert.equal(prepared.summary.eligible, 1);
  assert.equal(prepared.summary.notAnalyzed, 1);
  assert.equal(prepared.eligibleContexts.length, 1);
  assert.equal(prepared.fallbackRecords.length, 1);
  assert.notEqual(
    prepared.eligibleContexts[0].analysisResultId,
    prepared.fallbackRecords[0].analysisResultId
  );
  assert.equal(prepared.fallbackRecords[0].analysisStatus, 'skipped');
  assert.ok(
    prepared.fallbackRecords[0].limitations.some((item) => item.code === 'NOT_ANALYZED')
  );
});

test('preserves two analyzed occurrences and isolates findings, evidence, and locations by result', async () => {
  const chain = await duplicateOccurrenceFixture({ secondStatus: 'analyzed' });
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });
  const contexts = new Map(prepared.eligibleContexts.map((context) => [context.finding.id, context]));
  const createRoot = contexts.get('createRoot-changed');
  const legacyRoot = contexts.get('legacyRoot-changed');

  assert.equal(prepared.eligibleContexts.length, 2);
  assert.equal(new Set(prepared.eligibleContexts.map((item) => item.analysisResultId)).size, 2);
  assert.ok(createRoot);
  assert.ok(legacyRoot);
  assert.deepEqual(createRoot.evidenceAllowlist, [chain.actionEvidence[0].id]);
  assert.deepEqual(legacyRoot.evidenceAllowlist, [chain.actionEvidence[1].id]);
  assert.deepEqual(createRoot.positiveCandidateLocations, [{
    impactEvidenceId: chain.artifacts.impactEvidence.dependencies
      .find((item) => item.analysisResultId === createRoot.analysisResultId)
      .findings[0].id,
    symbol: 'createRoot',
    file: 'src/App.tsx'
  }]);
  assert.deepEqual(legacyRoot.positiveCandidateLocations, []);

  const impactByResult = new Map(
    chain.artifacts.impact.dependencies.map((item) => [item.analysisResultId, item])
  );
  const evidenceByResult = new Map(
    chain.artifacts.impactEvidence.dependencies.map((item) => [item.analysisResultId, item])
  );
  assert.equal(impactByResult.get(createRoot.analysisResultId).findings[0].impacted, true);
  assert.equal(impactByResult.get(legacyRoot.analysisResultId).findings[0].impacted, false);
  assert.equal(
    evidenceByResult.get(createRoot.analysisResultId).findings[0].findingId,
    'createRoot-changed'
  );
  assert.equal(
    evidenceByResult.get(legacyRoot.analysisResultId).findings[0].findingId,
    'legacyRoot-changed'
  );
});

test('duplicate-occurrence reconciliation is deterministic under Version input permutation', async () => {
  const forward = await duplicateOccurrenceFixture({ secondStatus: 'analyzed' });
  const reverse = await duplicateOccurrenceFixture({
    secondStatus: 'analyzed',
    reverseVersionInputs: true
  });
  const forwardPrepared = await prepareMigrationChecklistContexts({ sources: forward.sources });
  const reversePrepared = await prepareMigrationChecklistContexts({ sources: reverse.sources });

  assert.deepEqual(reverse.artifacts.version, forward.artifacts.version);
  assert.deepEqual(reversePrepared, forwardPrepared);
});

test('retains fatal handling for truly ambiguous duplicate occurrence identity', async () => {
  const chain = await fixture();
  const project = chain.artifacts.project.projects[0];
  project.dependencies.push(structuredClone(project.dependencies[0]));
  project.dependencySummary.declarationCount = 2;
  project.dependencySummary.uniqueCount = 1;
  project.dependencySummary.duplicateCount = 1;
  project.dependencySummary.byType.dependencies = 2;
  const packageRecord = chain.artifacts.knowledge.packages[0];
  packageRecord.occurrences.push(structuredClone(packageRecord.occurrences[0]));
  packageRecord.occurrences.sort(compareKnowledgeOccurrences);
  chain.artifacts.knowledge.summary.inputOccurrenceCount = 2;
  chain.artifacts.knowledge.research.inputOccurrenceCount = 2;
  rechain(chain.artifacts);

  await assert.rejects(
    () => prepareMigrationChecklistContexts({ sources: sourcesFor(chain.artifacts) }),
    (error) => error.code === 'REFERENCE_MISMATCH'
      && /does not match one exact Project Manifest dependency occurrence/.test(error.message)
  );
});

test('keeps cross-project and cross-package downstream references fatal', async () => {
  for (const [field, value] of [
    ['projectId', 'node:other-project'],
    ['packageId', 'npm:zzzz-other-package']
  ]) {
    const chain = await duplicateOccurrenceFixture({ secondStatus: 'analyzed' });
    chain.artifacts.impact.dependencies[1][field] = value;
    rechain(chain.artifacts);
    await assert.rejects(
      () => prepareMigrationChecklistContexts({ sources: sourcesFor(chain.artifacts) }),
      (error) => error.code === 'REFERENCE_MISMATCH'
        && /Repository Impact identity differs/.test(error.message),
      field
    );
  }
});

test('single-occurrence loading and context output remain unchanged', async () => {
  const chain = await fixture();
  const loaded = await loadMigrationChecklistInputs({ sources: chain.sources });
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });

  assert.equal(loaded.versionAnalysis.results.length, 1);
  assert.equal(prepared.eligibleContexts.length, 1);
  assert.equal(prepared.fallbackRecords.length, 0);
  assert.equal(
    prepared.eligibleContexts[0].analysisResultId,
    chain.artifacts.version.results[0].id
  );
});

test('missing action evidence yields deterministic NO_GROUNDED_ACTION fallback', async () => {
  const chain = await fixture({ evidenceKind: 'compatibility' });
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });
  const finding = prepared.fallbackRecords[0].findings[0];

  assert.deepEqual(prepared.eligibleContexts, []);
  assert.equal(prepared.summary.noGroundedAction, 1);
  assert.equal(finding.eligibilityReasonCode, 'NO_GROUNDED_ACTION');
  assert.equal(finding.items[0].kind, 'MANUAL_REVIEW_REQUIRED');
  assert.doesNotMatch(finding.items[0].instruction, /update your code|run tests/i);
  const checklist = buildMigrationChecklist({
    input: prepared.input,
    dependencies: prepared.fallbackRecords,
    generatedAt
  });
  assert.equal(checklist.status, 'NO_GROUNDED_ACTION');
});

test('null current version and range baseline remain uncertain without exact-version inference', async () => {
  const chain = await fixture({ uncertainBaseline: true });
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });
  const versions = prepared.eligibleContexts[0].versions;

  assert.equal(versions.analysisMode, 'declaredConstraint');
  assert.equal(versions.declaredVersion, '^18.0.0');
  assert.equal(versions.currentVersion, null);
  assert.equal(versions.currentVersionSource, null);
  assert.deepEqual(versions.delta, { direction: 'unknown', classification: 'unknown' });
});

test('an analyzed finding with no target fails closed instead of using registry latest as recommendation', async () => {
  const chain = await fixture({ nullTarget: true, targetPolicy: 'registryLatest' });
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });

  assert.deepEqual(prepared.eligibleContexts, []);
  assert.equal(prepared.fallbackRecords[0].versions.targetVersion, null);
  assert.equal(
    prepared.fallbackRecords[0].findings[0].eligibilityReasonCode,
    'NO_GROUNDED_ACTION'
  );
});

test('stale or conflicted evidence fails closed without action generation', async () => {
  for (const options of [{ sourceStatus: 'stale' }, { conflict: true }]) {
    const chain = await fixture(options);
    const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });
    assert.deepEqual(prepared.eligibleContexts, []);
    assert.equal(prepared.summary.conflictedEvidence, 1);
    assert.equal(
      prepared.fallbackRecords[0].findings[0].eligibilityReasonCode,
      'INVALID_OR_CONFLICTED_EVIDENCE'
    );
  }
});

test('unsupported Python usage coverage still permits dependency-level context without safety claim', async () => {
  const chain = await fixture({ ecosystem: 'python', positiveLocation: false });
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });
  const context = prepared.eligibleContexts[0];

  assert.equal(context.eligibility.reasonCode, 'ELIGIBLE');
  assert.equal(context.locationEligibility.reasonCode, 'UNSUPPORTED_USAGE_COVERAGE');
  assert.deepEqual(context.positiveCandidateLocations, []);
  assert.equal(prepared.summary.unsupportedUsageCoverage, 1);
  assert.doesNotMatch(JSON.stringify(prepared), /DEPENDENCY_NOT_USED/);
  assert.equal('safe' in context, false);
});

test('no positive JS match is not converted into an unused or safety claim', async () => {
  const chain = await fixture({ positiveLocation: false });
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });
  const context = prepared.eligibleContexts[0];

  assert.equal(context.locationEligibility.reasonCode, 'NO_POSITIVE_USAGE_MATCH');
  assert.deepEqual(context.positiveCandidateLocations, []);
  assert.doesNotMatch(JSON.stringify(prepared), /DEPENDENCY_NOT_USED/);
  assert.equal('safe' in context, false);
});

test('context selection is package-local, URL-controlled, bounded, and deterministic', async () => {
  const chain = await fixture({ evidenceContents: ['First instruction.', 'Second instruction.'] });
  const first = await prepareMigrationChecklistContexts(
    { sources: chain.sources },
    { maxEvidenceItems: 1, maxEvidenceCharacters: 100 }
  );
  const second = await prepareMigrationChecklistContexts(
    { sources: structuredClone(chain.sources) },
    { maxEvidenceItems: 1, maxEvidenceCharacters: 100 }
  );
  const context = first.eligibleContexts[0];

  assert.deepEqual(first, second);
  assert.equal(context.evidence.length, 1);
  assert.deepEqual(context.evidenceAllowlist, [context.evidence[0].id]);
  assert.deepEqual(context.finding.evidenceRefs, context.evidenceAllowlist);
  assert.ok(context.limitations.some((item) => item.code === 'EVIDENCE_BOUNDS_APPLIED'));
  assert.equal(context.evidence[0].sourceUrl.startsWith('https://'), true);
  assert.equal('apiUrl' in context.evidence[0], false);
  assert.equal('provider' in context, false);
  assert.equal('source' in context, false);
});

test('returned contexts are deeply immutable and do not retain mutable artifact references', async () => {
  const chain = await fixture();
  const original = structuredClone(chain.artifacts.version.results[0]);
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources });
  const context = prepared.eligibleContexts[0];

  assert.equal(Object.isFrozen(context), true);
  assert.equal(Object.isFrozen(context.evidence[0]), true);
  assert.throws(() => { context.finding.summary = 'mutated'; }, TypeError);
  assert.deepEqual(chain.artifacts.version.results[0], original);
});

test('runtime performs no source scan, writer, network, or AI/provider call', async () => {
  const chain = await fixture();
  const prepared = await prepareMigrationChecklistContexts({ sources: chain.sources }, {
    aiRuntime: { generateStructured() { throw new Error('must not be called'); } },
    writer() { throw new Error('must not be called'); },
    sourceScanner() { throw new Error('must not be called'); }
  });

  assert.equal(prepared.summary.eligible, 1);
});
