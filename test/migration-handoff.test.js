import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  AiRuntimeError,
  buildMigrationChecklist,
  extractProjectVerification,
  generateMigrationExtractiveChecklistDrafts,
  serializeMigrationChecklist,
  writeMigrationChecklist
} from '../src/index.js';

const generatedAt = '2026-07-18T00:00:00.000Z';
const temporaryDirectories = [];

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, {
    recursive: true,
    force: true
  })));
});

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function artifact(name) {
  return {
    schemaVersion: '1.0.0',
    artifact: `.upgradelens/${name}.json`,
    artifactDigest: digest(name)
  };
}

function inputLineage() {
  return {
    projectManifest: {
      schemaVersion: '2.0.0',
      artifact: '.upgradelens/project-manifest.json',
      artifactDigest: digest('project'),
      repository: { name: 'generic-repository', root: '.' }
    },
    knowledgeManifest: {
      ...artifact('knowledge-manifest'),
      researchId: digest('research')
    },
    knowledgeEvidenceBundle: artifact('knowledge-evidence-bundle'),
    versionAnalysis: artifact('version-analysis'),
    usageIndex: artifact('usage-index'),
    repositoryImpact: artifact('repository-impact'),
    repositoryImpactEvidence: artifact('repository-impact-evidence'),
    upgradeDecision: artifact('upgrade-decision')
  };
}

function dependency(suffix) {
  return {
    projectId: `node:apps/${suffix}`,
    packageId: `npm:framework-${suffix}`,
    declaredName: `framework-${suffix}`,
    normalizedName: `framework-${suffix}`,
    ecosystem: 'node',
    registry: 'npm',
    packageManager: 'npm',
    dependencyType: 'dependency',
    manifest: `apps/${suffix}/package.json`
  };
}

function versions(targetPolicy = 'explicit') {
  return {
    analysisMode: 'exactBaseline',
    declaredVersion: '^1.0.0',
    installedVersion: '1.2.0',
    installedVersionStatus: 'resolved',
    installedVersionSource: {
      type: 'package-lock',
      path: 'package-lock.json',
      lockfileVersion: 3,
      packagePath: 'node_modules/framework'
    },
    installedVersionReason: null,
    currentVersion: '1.2.0',
    currentVersionSource: 'resolvedArtifact',
    targetVersion: '2.0.0',
    targetPolicy,
    delta: { direction: 'upgrade', classification: 'major' }
  };
}

function verificationUnavailable() {
  return {
    status: 'VERIFICATION_COMMAND_UNAVAILABLE',
    commands: [],
    limitation: {
      code: 'VERIFICATION_COMMAND_UNAVAILABLE',
      message: 'No supported project-derived verification command was found.'
    }
  };
}

function planContext(suffix) {
  const evidenceId = digest(`evidence:${suffix}`);
  const analysisResultId = digest(`analysis:${suffix}`);
  const impactEvidenceId = digest(`impact:${suffix}`);
  return {
    contextVersion: '1',
    contextId: digest(`context:${suffix}`),
    analysisResultId,
    decisionId: digest(`decision:${suffix}`),
    decision: {
      status: 'PLAN_UPGRADE',
      targetOrigin: 'explicit',
      recommendationDriver: 'USER_SELECTED_TARGET',
      primaryReasonCode: 'USER_SELECTED_TARGET',
      reasonCodes: ['USER_SELECTED_TARGET', 'TARGET_NEWER_EVIDENCE_AVAILABLE']
    },
    affectedAreas: [{
      impactEvidenceId,
      findingId: `breaking-${suffix}`,
      symbol: 'oldApi',
      file: `apps/${suffix}/src/main.ts`,
      coverageStatus: 'complete'
    }],
    coverage: { status: 'complete', reasonCode: 'COVERAGE_COMPLETE' },
    verification: verificationUnavailable(),
    officialEvidence: [{
      id: evidenceId,
      sourceId: `official:${suffix}`,
      kind: 'migrationGuide',
      authority: 'officialProject',
      trust: 'official',
      contentDigest: digest(`content:${suffix}`),
      locator: 'heading:migration',
      releaseVersions: ['2.0.0']
    }],
    preconditions: [
      { code: 'EXPLICIT_TARGET_SELECTED', message: 'The target was explicitly selected.' },
      { code: 'TARGET_SCOPED_EVIDENCE_VALID', message: 'Target evidence is valid.' },
      { code: 'HUMAN_APPROVAL_REQUIRED', message: 'Human approval is required.' }
    ],
    recovery: { status: 'RECOVERY_PLAN_NOT_PROVIDED', evidenceRefs: [] },
    reviewQuestions: [],
    missingInformation: [],
    nextStep: { code: 'REVIEW_MIGRATION_HANDOFF', message: 'Review the migration handoff.' },
    humanReviewRequired: true,
    dependency: dependency(suffix),
    versions: versions(),
    finding: {
      id: `breaking-${suffix}`,
      kind: 'breakingChange',
      summary: 'The target release removes oldApi.',
      appliesToVersions: ['2.0.0'],
      evidenceRefs: [evidenceId]
    },
    evidence: [{
      id: evidenceId,
      sourceId: `official:${suffix}`,
      sourceUrl: `https://example.test/${suffix}`,
      kind: 'migrationGuide',
      authority: 'officialProject',
      trust: 'official',
      retrievedAt: generatedAt,
      contentDigest: digest(`content:${suffix}`),
      locator: 'heading:migration',
      releaseVersions: ['2.0.0'],
      content: 'Replace oldApi with newApi before upgrading.'
    }],
    evidenceAllowlist: [evidenceId],
    positiveCandidateLocations: [{
      impactEvidenceId,
      symbol: 'oldApi',
      file: `apps/${suffix}/src/main.ts`
    }],
    eligibility: { status: 'ELIGIBLE', reasonCode: 'ELIGIBLE' },
    locationEligibility: { status: 'ELIGIBLE', reasonCode: 'POSITIVE_USAGE_MATCH' },
    requiresHumanReview: true,
    humanReviewReasons: ['MIGRATION_CHECKLIST_DRAFT_REVIEW_REQUIRED'],
    limitations: []
  };
}

function prepared(contexts) {
  return {
    contextVersion: '1',
    input: inputLineage(),
    eligibleContexts: contexts,
    fallbackRecords: [],
    summary: {
      totalFindings: contexts.length,
      eligible: contexts.length,
      notAnalyzed: 0,
      noGroundedAction: 0,
      unsupportedUsageCoverage: 0,
      conflictedEvidence: 0
    }
  };
}

function extractiveRuntime(handler) {
  const calls = [];
  return {
    calls,
    async generateStructured(request) {
      calls.push(structuredClone(request));
      return handler(request);
    }
  };
}

function actionableOutput(context) {
  return {
    output: {
      status: 'ACTIONABLE',
      actions: [{
        evidenceRef: context.evidence[0].id,
        actionExcerpt: context.evidence[0].content
      }],
      abstentionReason: null
    }
  };
}

function fallbackRecord(status, suffix) {
  const targetPolicy = status === 'INVESTIGATE' ? 'registryLatest' : 'explicit';
  const primaryReason = {
    KEEP_CURRENT: 'ALREADY_AT_TARGET',
    INVESTIGATE: 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER',
    INSUFFICIENT_EVIDENCE: 'EVIDENCE_INSUFFICIENT',
    NOT_ANALYZED: 'VERSION_ANALYSIS_FAILED'
  }[status];
  return {
    analysisResultId: digest(`analysis:${suffix}`),
    decisionId: digest(`decision:${suffix}`),
    decision: {
      status,
      targetOrigin: targetPolicy,
      recommendationDriver: null,
      primaryReasonCode: primaryReason,
      reasonCodes: [primaryReason]
    },
    affectedAreas: [],
    coverage: { status: 'complete', reasonCode: 'COVERAGE_COMPLETE' },
    verification: verificationUnavailable(),
    officialEvidence: [],
    preconditions: [],
    recovery: { status: 'RECOVERY_PLAN_NOT_PROVIDED', evidenceRefs: [] },
    reviewQuestions: status === 'INVESTIGATE' ? ['Has a human selected this target?'] : [],
    missingInformation: status === 'INSUFFICIENT_EVIDENCE'
      ? [{ code: primaryReason, message: 'Target evidence is unavailable.' }] : [],
    nextStep: status === 'INVESTIGATE'
      ? { code: 'COMPLETE_HUMAN_INVESTIGATION', message: 'Complete human investigation.' }
      : status === 'INSUFFICIENT_EVIDENCE'
        ? { code: 'COLLECT_TARGET_EVIDENCE', message: 'Collect target evidence.' }
        : status === 'NOT_ANALYZED'
          ? { code: 'RERUN_VERSION_ANALYSIS', message: 'Rerun Version Analysis.' }
          : { code: 'NONE', message: 'No migration handoff step is required.' },
    humanReviewRequired: status !== 'KEEP_CURRENT',
    dependency: dependency(suffix),
    versions: {
      ...versions(targetPolicy),
      ...(status === 'KEEP_CURRENT'
        ? {
            targetVersion: '1.2.0',
            delta: { direction: 'same', classification: 'other' }
          }
        : {})
    },
    analysisStatus: status === 'NOT_ANALYZED' ? 'failed' : 'analyzed',
    selectedEvidenceRefs: [],
    findings: [],
    limitations: []
  };
}

test('verification extraction is project-derived, role-bounded, and source-digested', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-handoff-verification-'));
  temporaryDirectories.push(root);
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    scripts: {
      test: 'node --test',
      build: 'vite build',
      lint: 'eslint .',
      deploy: 'dangerous external side effect'
    }
  }));
  await mkdir(path.join(root, 'packages/member'), { recursive: true });
  await writeFile(path.join(root, 'packages/member/package.json'), JSON.stringify({
    scripts: { check: 'tsc --noEmit' }
  }));
  const projectManifest = {
    projects: [{
      id: 'node:.',
      path: '.',
      ecosystem: 'node',
      manifests: ['package.json'],
      packageManager: { name: 'npm' },
      dependencies: []
    }, {
      id: 'node:packages/member',
      path: 'packages/member',
      ecosystem: 'node',
      manifests: ['packages/member/package.json'],
      packageManager: { name: 'pnpm' },
      dependencies: []
    }, {
      id: 'python:.',
      path: '.',
      ecosystem: 'python',
      manifests: ['requirements.txt'],
      packageManager: { name: 'pip' },
      dependencies: []
    }]
  };

  const values = await extractProjectVerification(root, projectManifest);
  const node = values.get('node:.');
  assert.equal(node.status, 'AVAILABLE');
  assert.deepEqual(node.commands.map((item) => item.command), [
    'npm run build',
    'npm run lint',
    'npm run test'
  ]);
  assert.ok(node.commands.every((item) => item.source.path === 'package.json'));
  assert.ok(node.commands.every((item) => /^sha256:[a-f0-9]{64}$/.test(item.source.contentDigest)));
  assert.doesNotMatch(JSON.stringify(node), /dangerous external side effect|npm run deploy/);
  const member = values.get('node:packages/member');
  assert.deepEqual(member.commands.map((item) => ({
    command: item.command,
    workingDirectory: item.workingDirectory,
    sourcePath: item.source.path
  })), [{
    command: 'pnpm run check',
    workingDirectory: 'packages/member',
    sourcePath: 'packages/member/package.json'
  }]);
  assert.equal(values.get('python:.').status, 'VERIFICATION_COMMAND_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(values.get('python:.')), /npm test/);
});

test('explicit target produces an evidence-bounded actionable handoff for a Coding Agent', async () => {
  const context = planContext('app');
  const requestedRoot = process.env.MP_R04_ACCEPTANCE_ROOT;
  const root = requestedRoot
    ? path.resolve(requestedRoot)
    : await mkdtemp(path.join(os.tmpdir(), 'upgradelens-positive-handoff-'));
  if (!requestedRoot) temporaryDirectories.push(root);
  await mkdir(path.join(root, 'apps/app/src'), { recursive: true });
  await writeFile(path.join(root, 'apps/app/package.json'), JSON.stringify({
    name: 'generic-app',
    private: true,
    scripts: { test: 'node --test', build: 'vite build' },
    dependencies: { 'framework-app': '^1.0.0' }
  }, null, 2));
  await writeFile(
    path.join(root, 'apps/app/src/main.ts'),
    "import { oldApi } from 'framework-app';\n\nexport const result = oldApi();\n"
  );
  const verification = await extractProjectVerification(root, {
    projects: [{
      id: context.dependency.projectId,
      path: 'apps/app',
      ecosystem: 'node',
      manifests: ['apps/app/package.json'],
      packageManager: { name: 'npm' },
      dependencies: []
    }]
  });
  context.verification = verification.get(context.dependency.projectId);
  const runtime = extractiveRuntime(async () => actionableOutput(context));
  const generation = await generateMigrationExtractiveChecklistDrafts(prepared([context]), {
    aiRuntime: runtime
  });
  const checklist = buildMigrationChecklist({
    input: generation.input,
    dependencies: generation.records,
    generatedAt
  });
  const record = checklist.dependencies[0];

  assert.equal(runtime.calls.length, 1);
  assert.equal(record.handoff.status, 'ACTIONABLE_WITH_REVIEW');
  assert.equal(record.decision.recommendationDriver, 'USER_SELECTED_TARGET');
  assert.equal(record.versions.installedVersion, '1.2.0');
  assert.equal(record.versions.targetVersion, '2.0.0');
  assert.equal(record.findings[0].items
    .filter((item) => item.kind === 'REVIEW_MIGRATION_INSTRUCTION').length, 1);
  assert.deepEqual(record.handoff.affectedAreas.map((item) => item.file), [
    'apps/app/src/main.ts'
  ]);
  assert.deepEqual(record.handoff.verification.commands.map((item) => item.command), [
    'npm run build',
    'npm run test'
  ]);
  assert.deepEqual(record.handoff.officialEvidence, context.officialEvidence);
  assert.equal(record.handoff.humanReviewRequired, true);
  assert.equal(record.handoff.recovery.status, 'RECOVERY_PLAN_NOT_PROVIDED');
  if (requestedRoot) {
    await writeMigrationChecklist(root, checklist);
  }
});

test('decision mapping materializes one non-actionable handoff per occurrence', () => {
  const checklist = buildMigrationChecklist({
    input: inputLineage(),
    dependencies: [
      fallbackRecord('KEEP_CURRENT', 'keep'),
      fallbackRecord('INVESTIGATE', 'investigate'),
      fallbackRecord('INSUFFICIENT_EVIDENCE', 'insufficient'),
      fallbackRecord('NOT_ANALYZED', 'failed')
    ],
    generatedAt
  });
  assert.deepEqual(
    Object.fromEntries(checklist.dependencies.map((record) => [
      record.decision.status,
      record.handoff.status
    ])),
    {
      KEEP_CURRENT: 'NO_VERSION_CHANGE_REQUIRED',
      INVESTIGATE: 'INVESTIGATION_REQUIRED',
      INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
      NOT_ANALYZED: 'NOT_ANALYZED'
    }
  );
  assert.ok(checklist.dependencies.every((record) => (
    record.findings.flatMap((finding) => finding.items)
      .every((item) => item.basis !== 'AI_AUTHORED')
  )));
  assert.ok(checklist.dependencies.every((record) => (
    record.handoff.verification.status === 'NOT_APPLICABLE'
  )));
});

test('one provider failure is isolated and becomes ACTION_GENERATION_FAILED', async () => {
  const success = planContext('success');
  const failed = planContext('failed');
  const runtime = extractiveRuntime(async (request) => {
    if (request.contextId === failed.contextId) {
      throw new AiRuntimeError('TIMEOUT', 'controlled timeout');
    }
    return actionableOutput(success);
  });
  const generation = await generateMigrationExtractiveChecklistDrafts(
    prepared([failed, success]),
    { aiRuntime: runtime }
  );
  const checklist = buildMigrationChecklist({
    input: generation.input,
    dependencies: generation.records,
    generatedAt
  });
  const statusByName = Object.fromEntries(checklist.dependencies.map((record) => [
    record.dependency.declaredName,
    record.handoff.status
  ]));

  assert.deepEqual(statusByName, {
    'framework-failed': 'ACTION_GENERATION_FAILED',
    'framework-success': 'ACTIONABLE_WITH_REVIEW'
  });
  assert.equal(checklist.summary.handoffStatusCounts.ACTION_GENERATION_FAILED, 1);
  assert.equal(checklist.summary.handoffStatusCounts.ACTIONABLE_WITH_REVIEW, 1);
});

test('provider abstention keeps verified impact and becomes NO_GROUNDED_ACTION', async () => {
  const context = planContext('abstain');
  const generation = await generateMigrationExtractiveChecklistDrafts(prepared([context]), {
    aiRuntime: extractiveRuntime(async () => ({
      output: {
        status: 'ABSTAIN',
        actions: [],
        abstentionReason: 'NO_EXPLICIT_ACTION'
      }
    }))
  });
  const checklist = buildMigrationChecklist({
    input: generation.input,
    dependencies: generation.records,
    generatedAt
  });
  const record = checklist.dependencies[0];
  assert.equal(record.handoff.status, 'NO_GROUNDED_ACTION');
  assert.deepEqual(record.handoff.affectedAreas.map((item) => item.file), [
    'apps/abstain/src/main.ts'
  ]);
  assert.equal(record.findings[0].items.some((item) => item.basis === 'AI_AUTHORED'), false);
});

test('generic multi-repository shapes preserve decision, coverage, and occurrence isolation', async () => {
  const plan = planContext('repository-a-plan');
  const generation = await generateMigrationExtractiveChecklistDrafts(prepared([plan]), {
    aiRuntime: extractiveRuntime(async () => actionableOutput(plan))
  });
  const keep = fallbackRecord('KEEP_CURRENT', 'repository-a-keep');
  const python = fallbackRecord('INVESTIGATE', 'repository-b-python');
  python.dependency = {
    ...python.dependency,
    projectId: 'python:services/api',
    packageId: 'pypi:framework-python',
    declaredName: 'framework-python',
    normalizedName: 'framework-python',
    ecosystem: 'python',
    registry: 'pypi',
    packageManager: 'pip',
    dependencyType: 'runtime',
    manifest: 'services/api/requirements.txt'
  };
  python.decision.targetOrigin = 'explicit';
  python.decision.primaryReasonCode = 'USAGE_COVERAGE_UNAVAILABLE';
  python.decision.reasonCodes = ['USAGE_COVERAGE_UNAVAILABLE'];
  python.versions.targetPolicy = 'explicit';
  python.coverage = { status: 'unavailable', reasonCode: 'ANALYZER_UNAVAILABLE' };
  python.reviewQuestions = ['How will usage be inspected without supported analyzer coverage?'];
  const unsupported = fallbackRecord('INVESTIGATE', 'repository-c-unsupported');
  unsupported.dependency = {
    ...unsupported.dependency,
    projectId: 'java:service',
    packageId: 'maven:framework-java',
    declaredName: 'framework-java',
    normalizedName: 'framework-java',
    ecosystem: 'java',
    registry: 'maven',
    packageManager: 'maven',
    manifest: 'service/pom.xml'
  };
  unsupported.decision.primaryReasonCode = 'UNSUPPORTED_ECOSYSTEM';
  unsupported.decision.reasonCodes = ['UNSUPPORTED_ECOSYSTEM'];
  unsupported.coverage = { status: 'unavailable', reasonCode: 'ANALYZER_UNAVAILABLE' };

  const checklist = buildMigrationChecklist({
    input: generation.input,
    dependencies: [...generation.records, keep, python, unsupported],
    generatedAt
  });
  const byProject = Object.fromEntries(checklist.dependencies.map((record) => [
    record.dependency.projectId,
    {
      decision: record.decision.status,
      handoff: record.handoff.status,
      coverage: record.handoff.coverage.status
    }
  ]));
  assert.deepEqual(byProject, {
    'java:service': {
      decision: 'INVESTIGATE',
      handoff: 'INVESTIGATION_REQUIRED',
      coverage: 'unavailable'
    },
    'node:apps/repository-a-keep': {
      decision: 'KEEP_CURRENT',
      handoff: 'NO_VERSION_CHANGE_REQUIRED',
      coverage: 'complete'
    },
    'node:apps/repository-a-plan': {
      decision: 'PLAN_UPGRADE',
      handoff: 'ACTIONABLE_WITH_REVIEW',
      coverage: 'complete'
    },
    'python:services/api': {
      decision: 'INVESTIGATE',
      handoff: 'INVESTIGATION_REQUIRED',
      coverage: 'unavailable'
    }
  });
  assert.equal(new Set(checklist.dependencies.map((record) => record.decisionId)).size, 4);
  assert.deepEqual(
    checklist.dependencies.find((record) => record.dependency.projectId === 'python:services/api')
      .handoff.affectedAreas,
    []
  );
});

test('partial coverage retains positive areas while unavailable coverage invents none', () => {
  const partial = fallbackRecord('INVESTIGATE', 'partial-positive');
  partial.decision.targetOrigin = 'explicit';
  partial.decision.primaryReasonCode = 'USAGE_COVERAGE_PARTIAL';
  partial.decision.reasonCodes = ['USAGE_COVERAGE_PARTIAL'];
  partial.versions.targetPolicy = 'explicit';
  partial.coverage = { status: 'partial', reasonCode: 'SOURCE_PARSE_FAILED' };
  partial.affectedAreas = [{
    impactEvidenceId: digest('partial-impact'),
    findingId: 'partial-finding',
    symbol: 'oldApi',
    file: 'src/verified.ts',
    coverageStatus: 'partial'
  }];
  const unavailable = fallbackRecord('INVESTIGATE', 'unavailable-negative');
  unavailable.coverage = { status: 'unavailable', reasonCode: 'ANALYZER_UNAVAILABLE' };

  const checklist = buildMigrationChecklist({
    input: inputLineage(),
    dependencies: [unavailable, partial],
    generatedAt
  });
  const byName = new Map(checklist.dependencies.map((record) => [
    record.dependency.declaredName,
    record
  ]));
  assert.deepEqual(byName.get('framework-partial-positive').handoff.affectedAreas
    .map((item) => item.file), ['src/verified.ts']);
  assert.deepEqual(
    byName.get('framework-unavailable-negative').handoff.affectedAreas,
    []
  );
  assert.doesNotMatch(
    JSON.stringify(byName.get('framework-unavailable-negative')),
    /not impacted|unused|safe to upgrade/i
  );
});

test('provider and input reordering do not own final handoff ordering or bytes', async () => {
  const first = planContext('a');
  const second = planContext('b');
  const run = async (contexts) => {
    const byId = new Map(contexts.map((context) => [context.contextId, context]));
    const generation = await generateMigrationExtractiveChecklistDrafts(prepared(contexts), {
      aiRuntime: extractiveRuntime(async (request) => actionableOutput(byId.get(request.contextId)))
    });
    return buildMigrationChecklist({
      input: generation.input,
      dependencies: generation.records,
      generatedAt
    });
  };
  const forward = await run([first, second]);
  const reverse = await run([second, first]);
  assert.equal(serializeMigrationChecklist(forward), serializeMigrationChecklist(reverse));
});

test('v2 refuses legacy lineage without a persisted Upgrade Decision', () => {
  const input = inputLineage();
  delete input.upgradeDecision;
  assert.throws(
    () => buildMigrationChecklist({ input, dependencies: [], generatedAt }),
    /upgradeDecision/
  );
});
