import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  UPGRADE_DECISIONS,
  buildMigrationTaskContexts,
  buildUpgradeDecision,
  serializeUpgradeDecision,
  validateUpgradeDecision
} from '../src/index.js';
import { loadPersistedUpgradeDecision } from '../src/upgrade-decision/input-loader.js';

const generatedAt = '2026-07-18T00:00:00.000Z';

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function lineage(artifact, extra = {}) {
  return {
    schemaVersion: artifact.includes('project-manifest') ? '2.0.0' : '1.0.0',
    artifact: `.upgradelens/${artifact}`,
    artifactDigest: digest(artifact),
    ...extra
  };
}

function inputLineage() {
  return {
    projectManifest: lineage('project-manifest.json', {
      repository: { name: 'generic-repository', root: '.' }
    }),
    knowledgeManifest: lineage('knowledge-manifest.json', { researchId: digest('research') }),
    knowledgeEvidenceBundle: lineage('knowledge-evidence-bundle.json'),
    versionAnalysis: lineage('version-analysis.json'),
    usageIndex: lineage('usage-index.json'),
    repositoryImpact: lineage('repository-impact.json'),
    repositoryImpactEvidence: lineage('repository-impact-evidence.json')
  };
}

function occurrence(index = 1, ecosystem = 'node') {
  return {
    projectId: `${ecosystem}:apps/app-${index}`,
    packageId: `${ecosystem === 'node' ? 'npm' : 'pypi'}:framework-${index}`,
    declaredName: `framework-${index}`,
    normalizedName: `framework-${index}`,
    ecosystem,
    registry: ecosystem === 'node' ? 'npm' : 'pypi',
    packageManager: ecosystem === 'node' ? 'npm' : 'pip',
    dependencyType: ecosystem === 'node' ? 'dependency' : 'runtime',
    manifest: ecosystem === 'node' ? `apps/app-${index}/package.json` : `services/app-${index}/requirements.txt`
  };
}

function result({
  index = 1,
  ecosystem = 'node',
  installed = ecosystem === 'node' ? '1.0.0' : '1.0',
  installedStatus = 'resolved',
  installedReason = null,
  target = ecosystem === 'node' ? '2.0.0' : '2.0',
  targetPolicy = 'explicit',
  status = 'analyzed',
  evidenceCoverage = 'sufficient',
  conflict = false,
  breaking = true,
  providerRejected = false,
  declaredName,
  projectId,
  packageId
} = {}) {
  const dependency = occurrence(index, ecosystem);
  if (declaredName) {
    dependency.declaredName = declaredName;
    dependency.normalizedName = declaredName;
  }
  if (projectId) dependency.projectId = projectId;
  if (packageId) dependency.packageId = packageId;
  const evidenceId = digest(`evidence-${index}`);
  return {
    id: digest(`result-${index}`),
    status,
    contextId: digest(`context-${index}`),
    dependency,
    versions: {
      analysisMode: installedStatus === 'resolved' ? 'exactBaseline' : 'unsupportedBaseline',
      declaredVersion: installed,
      installedVersion: installedStatus === 'resolved' ? installed : null,
      installedVersionStatus: installedStatus,
      installedVersionSource: installedStatus === 'resolved'
        ? { type: 'package-lock', path: 'package-lock.json', lockfileVersion: 3, packagePath: `node_modules/framework-${index}` }
        : null,
      installedVersionReason: installedStatus === 'resolved' ? null : installedReason ?? 'PACKAGE_NOT_RESOLVED',
      currentVersion: installedStatus === 'resolved' ? installed : null,
      currentVersionSource: installedStatus === 'resolved' ? 'resolvedArtifact' : null,
      targetVersion: target,
      targetPolicy,
      delta: { direction: 'unknown', classification: 'unknown' }
    },
    summary: 'Deterministic fixture.',
    summaryEvidenceRefs: evidenceCoverage === 'none' ? [] : [evidenceId],
    riskLevel: 'unknown',
    riskEvidenceRefs: [],
    findings: breaking ? [{
      id: `finding-${index}`,
      kind: 'breakingChange',
      summary: 'A repository-sensitive API changed.',
      appliesToVersions: target ? [target] : [],
      evidenceRefs: evidenceCoverage === 'none' ? [] : [evidenceId]
    }] : [],
    evidence: [],
    evidenceCoverage,
    confidence: { level: 'unknown', reasons: [] },
    validation: {
      status: conflict ? 'validWithWarnings' : 'valid',
      warningCodes: conflict ? ['SOURCE_CONFLICT'] : []
    },
    requiresHumanReview: status !== 'analyzed',
    humanReviewReasons: providerRejected ? ['PROVIDER_REJECTED'] : [],
    nextAction: status === 'analyzed' ? 'proceedToImpactAnalysis' : 'retryAnalysis',
    limitations: []
  };
}

function artifactsFor(results, {
  coverage = 'complete',
  coverageReason = 'COVERAGE_COMPLETE',
  sourceStatus = 'available',
  sourceConflict = false,
  evidenceKind = 'breakingChanges',
  evidenceContent = 'Follow the official migration instructions.'
} = {}) {
  const sources = results.map((item) => ({
    id: `source-${item.analysisResultId ?? item.id}`,
    kind: 'officialDocumentation',
    authority: 'officialProject',
    trust: 'official',
    url: 'https://example.test/docs',
    status: sourceStatus,
    supports: [evidenceKind],
    discoveredFrom: null,
    trustEvidenceSourceIds: [],
    snapshot: {
      contentDigest: digest(`source-${item.id}`),
      mediaType: 'text/markdown',
      retrievedAt: generatedAt,
      freshness: sourceStatus === 'stale' ? 'stale' : 'fresh'
    },
    ...(sourceConflict ? { conflictsWith: ['another-source'] } : {})
  }));
  const evidence = results.flatMap((item, index) => {
    const ref = item.summaryEvidenceRefs[0];
    if (!ref) return [];
    return [{
      id: ref,
      packageId: item.dependency.packageId,
      sourceId: sources[index].id,
      kind: evidenceKind,
      contentDigest: digest(`content-${index}`),
      retrievedAt: generatedAt,
      mediaType: 'text/markdown',
      locator: 'section:breaking',
      releaseVersions: item.versions.targetVersion ? [item.versions.targetVersion] : [],
      content: evidenceContent
    }];
  });
  return {
    input: inputLineage(),
    projectManifest: {
      repository: { name: 'generic-repository', root: '.' },
      projects: []
    },
    knowledgeManifest: { sources, warnings: [] },
    knowledgeEvidenceBundle: { evidence },
    versionAnalysis: { results },
    usageIndex: { projects: [], dependencies: [] },
    repositoryImpact: { dependencies: [] },
    repositoryImpactEvidence: {
      generatedAt,
      dependencies: results.map((item) => ({
        analysisResultId: item.id,
        projectId: item.dependency.projectId,
        packageId: item.dependency.packageId,
        name: item.dependency.declaredName,
        impacted: false,
        status: item.status === 'analyzed' ? 'NOT_IMPACTED' : 'NOT_ANALYZED',
        reasonCode: item.status === 'analyzed' ? coverageReason : 'VERSION_ANALYSIS_SKIPPED',
        coverage: {
          projectId: item.dependency.projectId,
          projectPath: '.',
          ecosystem: item.dependency.ecosystem,
          status: coverage,
          analyzer: coverage === 'unavailable' ? null : { id: 'fixture', version: '1' },
          scannedFileCount: 1,
          analyzedFileCount: coverage === 'complete' ? 1 : 0,
          parseFailureCount: coverage === 'partial' ? 1 : 0,
          analyzerFailureCount: 0,
          unreadableFileCount: 0,
          scanFailureCount: 0,
          reasonCode: coverageReason
        },
        findings: []
      }))
    }
  };
}

function decisionFor(options, artifactOptions) {
  const analysis = result(options);
  return buildUpgradeDecision(artifactsFor([analysis], artifactOptions));
}

test('decision contract exposes all six outcomes while production urgency remains unavailable', () => {
  assert.deepEqual(UPGRADE_DECISIONS, [
    'KEEP_CURRENT',
    'UPGRADE_NOW',
    'PLAN_UPGRADE',
    'INVESTIGATE',
    'INSUFFICIENT_EVIDENCE',
    'NOT_ANALYZED'
  ]);
  const artifact = decisionFor();
  assert.equal(artifact.policy.urgencyContract, 'unavailable');
  assert.equal(artifact.policy.version, '1.1.0');
  assert.equal(artifact.summary.UPGRADE_NOW, 0);
});

test('same installed and target versions keep current before coverage uncertainty', () => {
  const artifact = decisionFor(
    { installed: '2.0.0', target: '2.0.0' },
    { coverage: 'partial', coverageReason: 'SOURCE_PARSE_FAILED' }
  );
  const [record] = artifact.decisions;
  assert.equal(record.decision, 'KEEP_CURRENT');
  assert.equal(record.primaryReasonCode, 'ALREADY_AT_TARGET');
  assert.equal(record.requiresHumanReview, false);
  assert.ok(record.reasonCodes.includes('USAGE_COVERAGE_PARTIAL'));
});

test('installed newer than target keeps current with a bounded limitation', () => {
  const [record] = decisionFor({ installed: '3.0.0', target: '2.0.0' }).decisions;
  assert.equal(record.decision, 'KEEP_CURRENT');
  assert.equal(record.primaryReasonCode, 'INSTALLED_NEWER_THAN_TARGET');
  assert.equal(record.requiresHumanReview, true);
});

test('caller-selected newer target with target-scoped official evidence plans an upgrade', () => {
  const [record] = decisionFor().decisions;
  assert.equal(record.decision, 'PLAN_UPGRADE');
  assert.equal(record.primaryReasonCode, 'USER_SELECTED_TARGET');
  assert.ok(record.reasonCodes.includes('TARGET_NEWER_EVIDENCE_AVAILABLE'));
  assert.equal(record.evidence.targetScopedRefs.length, 1);
  assert.equal(record.requiresHumanReview, true);
});

test('registry latest without a recommendation driver requires investigation even with no migration evidence', () => {
  const [record] = decisionFor({
    targetPolicy: 'registryLatest',
    evidenceCoverage: 'none'
  }).decisions;
  assert.equal(record.decision, 'INVESTIGATE');
  assert.equal(record.primaryReasonCode, 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER');
});

test('release, migration, and breaking evidence never synthesize a recommendation driver', () => {
  for (const evidenceKind of ['releaseNotes', 'migrationGuide', 'breakingChanges']) {
    const [record] = decisionFor(
      { targetPolicy: 'registryLatest' },
      { evidenceKind }
    ).decisions;
    assert.equal(record.evidence.status, 'sufficient');
    assert.equal(record.decision, 'INVESTIGATE');
    assert.equal(record.primaryReasonCode, 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER');
  }
});

test('free-form urgency and security prose never synthesize a recommendation driver', () => {
  const [record] = decisionFor(
    { targetPolicy: 'registryLatest' },
    {
      evidenceKind: 'releaseNotes',
      evidenceContent: 'Security critical: all users must upgrade immediately.'
    }
  ).decisions;
  assert.equal(record.decision, 'INVESTIGATE');
  assert.equal(record.primaryReasonCode, 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER');
});

test('invalid referenced prose remains insufficient and never becomes a recommendation driver', () => {
  const [record] = decisionFor(
    { targetPolicy: 'registryLatest' },
    {
      evidenceKind: 'releaseNotes',
      evidenceContent: 'Security critical: all users must upgrade immediately.',
      sourceStatus: 'unavailable'
    }
  ).decisions;
  assert.equal(record.evidence.status, 'insufficient');
  assert.equal(record.decision, 'INSUFFICIENT_EVIDENCE');
  assert.equal(record.primaryReasonCode, 'EVIDENCE_INSUFFICIENT');
  assert.ok(!record.reasonCodes.includes('USER_SELECTED_TARGET'));
});

test('caller-selected target with missing evidence remains insufficient', () => {
  const [record] = decisionFor({
    targetPolicy: 'explicit',
    evidenceCoverage: 'none'
  }).decisions;
  assert.equal(record.decision, 'INSUFFICIENT_EVIDENCE');
  assert.equal(record.primaryReasonCode, 'EVIDENCE_INSUFFICIENT');
});

test('missing baseline, missing target, and failed analysis fail closed by precedence', () => {
  assert.equal(decisionFor({ installedStatus: 'unresolved' }).decisions[0].decision, 'INSUFFICIENT_EVIDENCE');
  assert.equal(decisionFor({ target: null }).decisions[0].primaryReasonCode, 'TARGET_VERSION_UNAVAILABLE');
  const failed = decisionFor({ status: 'failed', providerRejected: true }).decisions[0];
  assert.equal(failed.decision, 'NOT_ANALYZED');
  assert.ok(failed.reasonCodes.includes('PROVIDER_REJECTED'));
});

test('legacy missing installed fields and missing Version Analysis results fail closed', () => {
  const legacy = result();
  for (const field of [
    'installedVersion',
    'installedVersionStatus',
    'installedVersionSource',
    'installedVersionReason'
  ]) delete legacy.versions[field];
  assert.equal(
    buildUpgradeDecision(artifactsFor([legacy])).decisions[0].primaryReasonCode,
    'INSTALLED_VERSION_UNAVAILABLE'
  );

  const artifacts = artifactsFor([]);
  const dependency = {
    name: 'framework-missing',
    normalizedName: 'framework-missing',
    declaredVersion: '^1.0.0',
    installedVersion: '1.2.0',
    installedVersionStatus: 'resolved',
    type: 'dependency',
    manifest: 'package.json'
  };
  artifacts.projectManifest.projects = [{
    id: 'node:.',
    ecosystem: 'node',
    packageManager: { name: 'npm' },
    dependencies: [dependency]
  }];
  artifacts.knowledgeManifest.packages = [{
    id: 'npm:framework-missing',
    ecosystem: 'node',
    identity: { normalizedName: 'framework-missing', registry: 'npm' },
    occurrences: [{
      projectId: 'node:.',
      manifest: 'package.json',
      dependencyType: 'dependency',
      declaredName: 'framework-missing',
      declaredVersion: '^1.0.0'
    }]
  }];
  const [missing] = buildUpgradeDecision(artifacts).decisions;
  assert.equal(missing.analysisResultId, null);
  assert.equal(missing.decision, 'NOT_ANALYZED');
  assert.equal(missing.primaryReasonCode, 'VERSION_ANALYSIS_MISSING');
});

test('partial coverage for repository-sensitive findings requires investigation', () => {
  const [record] = decisionFor(
    {},
    { coverage: 'partial', coverageReason: 'SOURCE_PARSE_FAILED' }
  ).decisions;
  assert.equal(record.decision, 'INVESTIGATE');
  assert.equal(record.primaryReasonCode, 'USAGE_COVERAGE_PARTIAL');
});

test('registry-discovered target with breaking evidence and unavailable coverage remains non-actionable', () => {
  const [record] = decisionFor(
    { targetPolicy: 'registryLatest' },
    { coverage: 'unavailable', coverageReason: 'ANALYZER_UNAVAILABLE' }
  ).decisions;
  assert.equal(record.decision, 'INVESTIGATE');
  assert.equal(record.primaryReasonCode, 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER');
  assert.ok(record.limitations.some((item) => item.code === 'USAGE_COVERAGE_UNAVAILABLE'));
});

test('conflicted evidence and unsupported ecosystem require investigation', () => {
  assert.equal(decisionFor({ conflict: true }).decisions[0].primaryReasonCode, 'EVIDENCE_CONFLICT');
  const unsupported = result({ ecosystem: 'jvm', installed: '1.0.0', target: '2.0.0' });
  const [record] = buildUpgradeDecision(artifactsFor([unsupported])).decisions;
  assert.equal(record.decision, 'INVESTIGATE');
  assert.equal(record.primaryReasonCode, 'UNSUPPORTED_ECOSYSTEM');
});

test('Node and Python adapters compare generically without lexical ordering', () => {
  assert.equal(decisionFor({ installed: '2.10.0', target: '2.9.0' }).decisions[0].decision, 'KEEP_CURRENT');
  assert.equal(decisionFor({
    ecosystem: 'python',
    installed: '1.10',
    target: '1.9'
  }).decisions[0].decision, 'KEEP_CURRENT');
});

test('Node and Python registry-discovered targets do not become plans', () => {
  for (const options of [
    { ecosystem: 'node', installed: '1.0.0', target: '2.0.0' },
    { ecosystem: 'python', installed: '1.0', target: '2.0' }
  ]) {
    const [record] = decisionFor({ ...options, targetPolicy: 'registryLatest' }).decisions;
    assert.equal(record.decision, 'INVESTIGATE');
    assert.equal(record.primaryReasonCode, 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER');
  }
});

test('multi-repository matrix isolates Node, Python, and unsupported ecosystem outcomes', () => {
  const nodeSame = result({ index: 1, installed: '2.0.0', target: '2.0.0' });
  const pythonPlan = result({
    index: 2,
    ecosystem: 'python',
    installed: '1.0',
    target: '1.1',
    breaking: false
  });
  const unsupported = result({
    index: 3,
    ecosystem: 'jvm',
    installed: '1.0.0',
    target: '2.0.0'
  });
  const decisions = buildUpgradeDecision(artifactsFor([
    unsupported,
    pythonPlan,
    nodeSame
  ])).decisions;
  assert.deepEqual(
    decisions.map((record) => [record.occurrence.ecosystem, record.decision]),
    [
      ['jvm', 'INVESTIGATE'],
      ['node', 'KEEP_CURRENT'],
      ['python', 'PLAN_UPGRADE']
    ]
  );
});

test('generic identities do not affect policy and one package can differ by structured caller intent', () => {
  for (const declaredName of ['library-alpha', 'library-beta']) {
    const [record] = decisionFor({
      declaredName,
      targetPolicy: 'registryLatest'
    }).decisions;
    assert.equal(record.decision, 'INVESTIGATE');
  }

  const registryOccurrence = result({
    index: 1,
    declaredName: 'shared-library',
    packageId: 'npm:shared-library',
    projectId: 'node:repository-a',
    targetPolicy: 'registryLatest'
  });
  const selectedOccurrence = result({
    index: 2,
    declaredName: 'shared-library',
    packageId: 'npm:shared-library',
    projectId: 'node:repository-b',
    targetPolicy: 'explicit'
  });
  const decisions = buildUpgradeDecision(artifactsFor([
    selectedOccurrence,
    registryOccurrence
  ])).decisions;
  assert.deepEqual(
    decisions.map((record) => [record.occurrence.projectId, record.decision]),
    [
      ['node:repository-a', 'INVESTIGATE'],
      ['node:repository-b', 'PLAN_UPGRADE']
    ]
  );
});

test('occurrence identities stay isolated, sorted, schema-valid, and replay deterministic', () => {
  const first = result({ index: 2, installed: '2.0.0', target: '2.0.0' });
  const second = result({ index: 1 });
  const artifact = buildUpgradeDecision(artifactsFor([first, second]));
  const replay = buildUpgradeDecision(artifactsFor([second, first]));
  assert.equal(artifact.decisions.length, 2);
  assert.equal(artifact.decisions[0].occurrence.projectId, 'node:apps/app-1');
  assert.notEqual(artifact.decisions[0].id, artifact.decisions[1].id);
  assert.equal(serializeUpgradeDecision(artifact), serializeUpgradeDecision(replay));
  assert.equal(validateUpgradeDecision(artifact), artifact);
});

test('same-manifest duplicates propagate one explicit driver and one independent registry state', () => {
  const selected = result({
    index: 1,
    declaredName: 'shared-library',
    packageId: 'npm:shared-library',
    projectId: 'node:.',
    installed: '1.0.0',
    targetPolicy: 'explicit'
  });
  const unselected = result({
    index: 2,
    declaredName: 'shared-library',
    packageId: 'npm:shared-library',
    projectId: 'node:.',
    installed: '1.5.0',
    targetPolicy: 'registryLatest'
  });
  unselected.dependency.manifest = selected.dependency.manifest;
  unselected.dependency.dependencyType = selected.dependency.dependencyType;

  const artifacts = artifactsFor([unselected, selected]);
  artifacts.upgradeDecision = buildUpgradeDecision(artifacts);
  const decisions = new Map(artifacts.upgradeDecision.decisions.map((record) => [
    record.versions.declaredVersion,
    record
  ]));
  const prepared = buildMigrationTaskContexts(artifacts);

  assert.equal(decisions.size, 2);
  assert.equal(decisions.get('1.0.0').decision, 'PLAN_UPGRADE');
  assert.equal(decisions.get('1.0.0').primaryReasonCode, 'USER_SELECTED_TARGET');
  assert.equal(decisions.get('1.0.0').versions.targetPolicy, 'explicit');
  assert.equal(decisions.get('1.5.0').decision, 'INVESTIGATE');
  assert.equal(
    decisions.get('1.5.0').reasonCodes.includes('USER_SELECTED_TARGET'),
    false
  );
  assert.equal(decisions.get('1.5.0').versions.targetPolicy, 'registryLatest');
  assert.equal(prepared.eligibleContexts.length, 1);
  assert.equal(prepared.eligibleContexts[0].analysisResultId, selected.id);
  assert.equal(prepared.fallbackRecords.length, 1);
  assert.equal(prepared.fallbackRecords[0].analysisResultId, unselected.id);
});

test('persisted non-action decisions gate Migration Checklist contexts', () => {
  for (const options of [
    { installed: '2.0.0', target: '2.0.0' },
    { installedStatus: 'unresolved' },
    { targetPolicy: 'registryLatest' }
  ]) {
    const analysis = result(options);
    const artifacts = artifactsFor([analysis]);
    artifacts.upgradeDecision = buildUpgradeDecision(artifacts);
    const prepared = buildMigrationTaskContexts(artifacts);
    assert.equal(prepared.eligibleContexts.length, 0);
    assert.equal(prepared.fallbackRecords.length, 1);
    assert.match(prepared.fallbackRecords[0].limitations.at(-1).code, /^UPGRADE_DECISION_/);
  }
});

test('registry upgrade availability with breaking evidence creates zero AI checklist contexts', () => {
  const analysis = result({ targetPolicy: 'registryLatest' });
  const artifacts = artifactsFor([analysis]);
  artifacts.upgradeDecision = buildUpgradeDecision(artifacts);
  const prepared = buildMigrationTaskContexts(artifacts);
  assert.equal(artifacts.upgradeDecision.decisions[0].decision, 'INVESTIGATE');
  assert.equal(prepared.eligibleContexts.length, 0);
  assert.equal(prepared.fallbackRecords.length, 1);
  assert.ok(prepared.fallbackRecords[0].limitations.some(
    (item) => item.code === 'UPGRADE_DECISION_INVESTIGATE'
  ));
});

test('persisted consumer rejects a policy-tampered recommendation even with valid lineage', async () => {
  const analysis = result({ installed: '2.0.0', target: '2.0.0' });
  const artifacts = artifactsFor([analysis]);
  const decision = buildUpgradeDecision(artifacts);
  const loaded = await loadPersistedUpgradeDecision({
    upgradeDecision: {
      artifact: '.upgradelens/upgrade-decision.json',
      bytes: Buffer.from(serializeUpgradeDecision(decision))
    }
  }, artifacts);
  assert.equal(loaded.upgradeDecision.decisions[0].decision, 'KEEP_CURRENT');

  const tampered = structuredClone(decision);
  Object.assign(tampered.decisions[0], {
    decision: 'PLAN_UPGRADE',
    primaryReasonCode: 'USER_SELECTED_TARGET',
    reasonCodes: ['TARGET_NEWER_EVIDENCE_AVAILABLE', 'USER_SELECTED_TARGET'],
    requiresHumanReview: true
  });
  tampered.decisions[0].versions.comparison = 'targetNewer';
  tampered.decisions[0].versions.targetVersion = '3.0.0';
  tampered.decisions[0].evidence.status = 'sufficient';
  tampered.summary.KEEP_CURRENT = 0;
  tampered.summary.PLAN_UPGRADE = 1;
  tampered.summary.requiresHumanReviewCount = 1;
  await assert.rejects(
    loadPersistedUpgradeDecision({
      upgradeDecision: {
        artifact: '.upgradelens/upgrade-decision.json',
        bytes: Buffer.from(JSON.stringify(tampered))
      }
    }, artifacts),
    /does not match deterministic policy output/
  );
});
