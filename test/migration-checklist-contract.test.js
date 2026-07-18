import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  DEFAULT_MIGRATION_CHECKLIST_PATH,
  MIGRATION_CHECKLIST_SCHEMA_VERSION,
  buildMigrationChecklist,
  serializeMigrationChecklist,
  validateMigrationChecklist
} from '../src/index.js';

function digest(seed) {
  return `sha256:${createHash('sha256').update(seed).digest('hex')}`;
}

function artifact(name, seed = name) {
  return {
    schemaVersion: '1.0.0',
    artifact: `.upgradelens/${name}.json`,
    artifactDigest: digest(seed)
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
    knowledgeEvidenceBundle: artifact('knowledge-evidence-bundle', 'evidence'),
    versionAnalysis: artifact('version-analysis', 'version'),
    usageIndex: artifact('usage-index', 'usage'),
    repositoryImpact: artifact('repository-impact', 'impact'),
    repositoryImpactEvidence: artifact('repository-impact-evidence', 'impact-evidence'),
    upgradeDecision: artifact('upgrade-decision', 'upgrade-decision')
  };
}

function dependency(packageId = 'npm:antd', projectId = 'node:.') {
  const name = packageId.split(':').slice(1).join(':');
  return {
    projectId,
    packageId,
    declaredName: name,
    normalizedName: name,
    ecosystem: packageId.startsWith('pypi:') ? 'python' : 'node',
    registry: packageId.startsWith('pypi:') ? 'pypi' : 'npm',
    packageManager: packageId.startsWith('pypi:') ? 'pip' : 'npm',
    dependencyType: 'dependency',
    manifest: packageId.startsWith('pypi:') ? 'requirements.txt' : 'package.json'
  };
}

function exactVersions() {
  return {
    analysisMode: 'exactBaseline',
    declaredVersion: '1.0.0',
    currentVersion: '1.0.0',
    currentVersionSource: 'exactDeclaration',
    targetVersion: '2.0.0',
    targetPolicy: 'explicit',
    delta: { direction: 'upgrade', classification: 'major' }
  };
}

function constraintVersions() {
  return {
    analysisMode: 'declaredConstraint',
    declaredVersion: '^1.0.0',
    currentVersion: null,
    currentVersionSource: null,
    targetVersion: '2.0.0',
    targetPolicy: 'registryLatest',
    delta: { direction: 'unknown', classification: 'unknown' }
  };
}

const generatedAt = '2026-07-16T00:00:00.000Z';
const evidenceRef = digest('official-evidence');
const impactEvidenceId = digest('impact-evidence-record');
const candidateLocation = {
  impactEvidenceId,
  symbol: 'Button',
  file: 'src/App.tsx'
};

function deterministicFinding(overrides = {}) {
  return {
    id: 'button-removed',
    kind: 'breakingChange',
    summary: 'Button was removed in version 2.0.0.',
    eligibilityReasonCode: 'ELIGIBLE',
    evidenceRefs: [evidenceRef],
    positiveImpactLocations: [structuredClone(candidateLocation)],
    items: [{
      kind: 'REVIEW_CANDIDATE_USAGE',
      basis: 'DETERMINISTIC',
      instruction: 'Review the candidate Button usage against the documented breaking change.',
      findingId: 'button-removed',
      evidenceRefs: [evidenceRef],
      candidateLocations: [structuredClone(candidateLocation)],
      requiresHumanReview: true
    }],
    ...overrides
  };
}

function aiFinding(overrides = {}) {
  return deterministicFinding({
    positiveImpactLocations: [],
    items: [{
      kind: 'REVIEW_MIGRATION_INSTRUCTION',
      basis: 'AI_AUTHORED',
      instruction: 'Review the documented replacement requirement before changing the dependency.',
      findingId: 'button-removed',
      evidenceRefs: [evidenceRef],
      candidateLocations: [],
      requiresHumanReview: true
    }],
    ...overrides
  });
}

function record({
  seed = 'antd-result',
  packageId = 'npm:antd',
  projectId = 'node:.',
  versions = exactVersions(),
  analysisStatus = 'analyzed',
  selectedEvidenceRefs = [evidenceRef],
  findings = [deterministicFinding()],
  limitations = [],
  decisionStatus = analysisStatus === 'analyzed'
    ? (versions.targetPolicy === 'explicit' ? 'PLAN_UPGRADE' : 'INVESTIGATE')
    : 'NOT_ANALYZED'
} = {}) {
  const actionable = ['PLAN_UPGRADE', 'UPGRADE_NOW'].includes(decisionStatus);
  return {
    analysisResultId: digest(seed),
    decisionId: digest(`${seed}:decision`),
    decision: {
      status: decisionStatus,
      targetOrigin: versions.targetPolicy,
      recommendationDriver: actionable ? 'USER_SELECTED_TARGET' : null,
      primaryReasonCode: actionable
        ? 'USER_SELECTED_TARGET'
        : decisionStatus === 'INVESTIGATE'
          ? 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER'
          : 'VERSION_ANALYSIS_FAILED',
      reasonCodes: [actionable
        ? 'USER_SELECTED_TARGET'
        : decisionStatus === 'INVESTIGATE'
          ? 'UPGRADE_AVAILABLE_NO_RECOMMENDATION_DRIVER'
          : 'VERSION_ANALYSIS_FAILED']
    },
    affectedAreas: [{
      ...structuredClone(candidateLocation),
      findingId: 'button-removed',
      coverageStatus: 'complete'
    }],
    coverage: { status: 'complete', reasonCode: 'COVERAGE_COMPLETE' },
    verification: {
      status: 'VERIFICATION_COMMAND_UNAVAILABLE',
      commands: [],
      limitation: {
        code: 'VERIFICATION_COMMAND_UNAVAILABLE',
        message: 'No supported project-derived verification command was found.'
      }
    },
    officialEvidence: selectedEvidenceRefs.map((id) => ({
      id,
      sourceId: 'npm:antd:documentation:migration',
      kind: 'migrationGuide',
      authority: 'officialProject',
      trust: 'official',
      contentDigest: digest('official-evidence-content'),
      locator: 'heading:migration',
      releaseVersions: ['2.0.0']
    })),
    preconditions: actionable ? [
      {
        code: 'EXPLICIT_TARGET_SELECTED',
        message: 'The target was explicitly selected.'
      },
      {
        code: 'TARGET_SCOPED_EVIDENCE_VALID',
        message: 'Target-scoped evidence is valid.'
      },
      {
        code: 'HUMAN_APPROVAL_REQUIRED',
        message: 'Human approval is required.'
      }
    ] : [],
    recovery: { status: 'RECOVERY_PLAN_NOT_PROVIDED', evidenceRefs: [] },
    reviewQuestions: decisionStatus === 'INVESTIGATE'
      ? ['Has a human selected this target?'] : [],
    missingInformation: [],
    nextStep: actionable
      ? { code: 'REVIEW_MIGRATION_HANDOFF', message: 'Review the migration handoff.' }
      : decisionStatus === 'INVESTIGATE'
        ? { code: 'COMPLETE_HUMAN_INVESTIGATION', message: 'Complete human investigation.' }
        : { code: 'RERUN_VERSION_ANALYSIS', message: 'Rerun Version Analysis.' },
    humanReviewRequired: decisionStatus !== 'KEEP_CURRENT',
    dependency: dependency(packageId, projectId),
    versions,
    analysisStatus,
    selectedEvidenceRefs,
    findings,
    limitations
  };
}

function build(dependencies = [record()], options = {}) {
  return buildMigrationChecklist({
    input: inputLineage(),
    dependencies,
    limitations: [],
    generatedAt,
    ...options
  });
}

function fallbackFinding(reasonCode, instruction = 'Manual review is required because no grounded action is available.') {
  return deterministicFinding({
    eligibilityReasonCode: reasonCode,
    evidenceRefs: [],
    positiveImpactLocations: [],
    items: [{
      kind: 'MANUAL_REVIEW_REQUIRED',
      basis: 'DETERMINISTIC',
      instruction,
      findingId: 'button-removed',
      evidenceRefs: [],
      candidateLocations: [],
      requiresHumanReview: true
    }]
  });
}

test('builds a valid evidence-grounded deterministic checklist with candidate locations', () => {
  const checklist = build();

  assert.equal(MIGRATION_CHECKLIST_SCHEMA_VERSION, '2.0.0');
  assert.equal(DEFAULT_MIGRATION_CHECKLIST_PATH, '.upgradelens/migration-checklist.json');
  assert.equal(validateMigrationChecklist(checklist), checklist);
  assert.equal(checklist.status, 'COMPLETE');
  assert.deepEqual(checklist.dependencies[0].eligibility, {
    status: 'ELIGIBLE',
    reasonCode: 'ELIGIBLE'
  });
  assert.deepEqual(checklist.dependencies[0].findings[0].items[0].candidateLocations, [candidateLocation]);
  assert.equal(checklist.summary.groundedActionCount, 1);
  assert.equal(checklist.summary.candidateLocationCount, 1);
});

test('requires exact lineage slots for all seven input artifacts and an injected generatedAt', () => {
  for (const field of [
    'projectManifest',
    'knowledgeManifest',
    'knowledgeEvidenceBundle',
    'versionAnalysis',
    'usageIndex',
    'repositoryImpact',
    'repositoryImpactEvidence',
    'upgradeDecision'
  ]) {
    const input = inputLineage();
    delete input[field];
    assert.throws(
      () => buildMigrationChecklist({ input, dependencies: [], limitations: [], generatedAt }),
      /required property|repository identity/
    );
  }
  assert.throws(
    () => buildMigrationChecklist({ input: inputLineage(), dependencies: [], limitations: [] }),
    /generatedAt is required/
  );
});

test('builds a valid AI-authored draft only with evidence and mandatory human review', () => {
  const checklist = build([record({ findings: [aiFinding()] })]);
  const item = checklist.dependencies[0].findings[0].items[0];

  assert.equal(item.basis, 'AI_AUTHORED');
  assert.equal(item.requiresHumanReview, true);
  assert.deepEqual(item.evidenceRefs, [evidenceRef]);
  assert.deepEqual(item.candidateLocations, []);
  assert.equal(checklist.summary.aiAuthoredItemCount, 1);
});

test('rejects an AI-authored item that disables human review', () => {
  const finding = aiFinding();
  finding.items[0].requiresHumanReview = false;
  assert.throws(() => build([record({ findings: [finding] })]), /requiresHumanReview|must be equal to constant/);
});

test('rejects an AI-authored actionable item without evidence', () => {
  const finding = aiFinding({ evidenceRefs: [] });
  finding.items[0].evidenceRefs = [];
  assert.throws(() => build([record({ selectedEvidenceRefs: [], findings: [finding] })]), /requires.*evidence/i);
});

test('rejects an item that references an unknown finding', () => {
  const finding = deterministicFinding();
  finding.items[0].findingId = 'unknown-finding';
  assert.throws(() => build([record({ findings: [finding] })]), /unknown finding/);
});

test('rejects findings and items that reference unknown selected evidence', () => {
  assert.throws(
    () => build([record({ selectedEvidenceRefs: [], findings: [deterministicFinding()] })]),
    /unknown selected evidence|unknown evidence/
  );

  const finding = deterministicFinding();
  finding.items[0].evidenceRefs = [digest('other-evidence')];
  assert.throws(() => build([record({
    selectedEvidenceRefs: [evidenceRef, digest('other-evidence')],
    findings: [finding]
  })]), /unknown evidence/);
});

test('rejects a candidate location without an impact evidence id', () => {
  const finding = deterministicFinding();
  delete finding.items[0].candidateLocations[0].impactEvidenceId;
  assert.throws(() => build([record({ findings: [finding] })]), /impactEvidenceId|required property/);
});

test('rejects an unknown positive impact evidence reference', () => {
  const finding = deterministicFinding();
  finding.items[0].candidateLocations[0].impactEvidenceId = digest('unknown-impact');
  assert.throws(() => build([record({ findings: [finding] })]), /unknown positive impact evidence\/location/);
});

test('NOT_ANALYZED records cannot contain findings or generated actions', () => {
  assert.throws(
    () => build([record({ analysisStatus: 'skipped', findings: [aiFinding()] })]),
    /Not-analyzed dependency.*cannot contain generated findings or actions/
  );

  const checklist = build([record({
    analysisStatus: 'failed',
    selectedEvidenceRefs: [],
    findings: [],
    limitations: [{ code: 'ANALYSIS_FAILED', message: 'Version Analysis failed.' }]
  })]);
  assert.equal(checklist.status, 'NOT_ANALYZED');
  assert.equal(checklist.dependencies[0].eligibility.reasonCode, 'NOT_ANALYZED');
});

test('NO_GROUNDED_ACTION produces a valid deterministic manual-review fallback', () => {
  const checklist = build([record({
    selectedEvidenceRefs: [],
    findings: [fallbackFinding('NO_GROUNDED_ACTION')]
  })]);
  const finding = checklist.dependencies[0].findings[0];

  assert.equal(checklist.status, 'NO_GROUNDED_ACTION');
  assert.equal(finding.status, 'NO_GROUNDED_ACTION');
  assert.equal(finding.items[0].kind, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(checklist.summary.groundedActionCount, 0);
});

test('unsupported usage coverage is incomplete and never represented as safe or unused', () => {
  const checklist = build([record({
    packageId: 'pypi:example',
    projectId: 'python:.',
    selectedEvidenceRefs: [],
    findings: [fallbackFinding(
      'UNSUPPORTED_USAGE_COVERAGE',
      'Manual review is required because repository usage coverage is unavailable.'
    )]
  })]);

  assert.equal(checklist.status, 'INCOMPLETE');
  assert.equal(checklist.dependencies[0].eligibility.reasonCode, 'UNSUPPORTED_USAGE_COVERAGE');
  assert.doesNotMatch(JSON.stringify(checklist), /SAFE_TO_UPGRADE|DEPENDENCY_NOT_USED/);
});

test('nullable current version remains an uncertain constraint baseline', () => {
  const checklist = build([record({
    versions: constraintVersions(),
    selectedEvidenceRefs: [],
    findings: [fallbackFinding('NO_GROUNDED_ACTION')]
  })]);
  const versions = checklist.dependencies[0].versions;

  assert.equal(versions.analysisMode, 'declaredConstraint');
  assert.equal(versions.currentVersion, null);
  assert.equal(versions.currentVersionSource, null);
  assert.deepEqual(versions.delta, { direction: 'unknown', classification: 'unknown' });
});

test('Migration Checklist preserves installed-version provenance without changing occurrence identity', () => {
  const versions = {
    ...exactVersions(),
    declaredVersion: '^1.0.0',
    installedVersion: '1.1.0',
    installedVersionStatus: 'resolved',
    installedVersionSource: {
      type: 'package-lock',
      path: 'package-lock.json',
      lockfileVersion: 3,
      packagePath: 'node_modules/antd'
    },
    installedVersionReason: null,
    currentVersion: '1.1.0',
    currentVersionSource: 'resolvedArtifact'
  };
  const checklist = build([record({
    versions,
    selectedEvidenceRefs: [],
    findings: [fallbackFinding('NO_GROUNDED_ACTION')]
  })]);
  const stored = checklist.dependencies[0];

  assert.equal(stored.dependency.projectId, 'node:.');
  assert.equal(stored.dependency.manifest, 'package.json');
  assert.equal(stored.versions.declaredVersion, '^1.0.0');
  assert.equal(stored.versions.installedVersion, '1.1.0');
  assert.equal(stored.versions.targetVersion, '2.0.0');
  assert.equal(stored.versions.installedVersionSource.path, 'package-lock.json');
});

test('registry latest is a target fact and cannot be marked recommended', () => {
  const checklist = build([record({
    versions: constraintVersions(),
    selectedEvidenceRefs: [],
    findings: [fallbackFinding('NO_GROUNDED_ACTION')]
  })]);
  checklist.dependencies[0].versions.recommended = true;

  assert.throws(() => validateMigrationChecklist(checklist), /additional properties|recommended/);
});

test('rejects duplicate dependency, finding, and checklist item ids', () => {
  const duplicateDependency = record();
  assert.throws(() => build([duplicateDependency, structuredClone(duplicateDependency)]), /Duplicate dependency checklist/);

  const duplicateFinding = deterministicFinding();
  assert.throws(
    () => build([record({ findings: [duplicateFinding, structuredClone(duplicateFinding)] })]),
    /duplicate finding id|Duplicate checklist item id/
  );

  const finding = deterministicFinding();
  finding.items.push(structuredClone(finding.items[0]));
  assert.throws(() => build([record({ findings: [finding] })]), /Duplicate checklist item id/);
});

test('build and serialization are stable across unordered normalized inputs', () => {
  const secondEvidence = digest('second-evidence');
  const firstRecord = record();
  const secondFinding = deterministicFinding({
    id: 'modal-removed',
    summary: 'Modal was removed.',
    evidenceRefs: [secondEvidence],
    positiveImpactLocations: [],
    items: [{
      kind: 'VERIFY_OFFICIAL_REQUIREMENT',
      basis: 'DETERMINISTIC',
      instruction: 'Verify the official Modal migration requirement.',
      findingId: 'modal-removed',
      evidenceRefs: [secondEvidence],
      candidateLocations: [],
      requiresHumanReview: true
    }]
  });
  firstRecord.selectedEvidenceRefs = [secondEvidence, evidenceRef];
  firstRecord.findings.push(secondFinding);
  const secondRecord = record({
    seed: 'zod-result',
    packageId: 'npm:zod',
    findings: [aiFinding()]
  });
  const unordered = [secondRecord, firstRecord];
  const reordered = structuredClone(unordered).reverse();
  reordered[0].selectedEvidenceRefs.reverse();
  reordered[0].findings.reverse();
  reordered[0].findings[1].items.reverse();

  const left = build(unordered);
  const right = build(reordered);
  assert.deepEqual(left, right);
  assert.equal(serializeMigrationChecklist(left), serializeMigrationChecklist(right));
});

test('builder does not mutate its input objects', () => {
  const lineage = inputLineage();
  const dependencies = [record()];
  const before = structuredClone({ lineage, dependencies });

  buildMigrationChecklist({ input: lineage, dependencies, limitations: [], generatedAt });
  assert.deepEqual({ lineage, dependencies }, before);
});

test('schema rejects additional properties', () => {
  const checklist = build();
  checklist.autonomous = true;
  assert.throws(() => validateMigrationChecklist(checklist), /additional properties|autonomous/);
});

test('schema rejects explicitly excluded production fields', () => {
  const excluded = {
    patch: 'diff',
    command: 'package-manager invocation',
    rollback: 'automatic rollback',
    effort: 'small',
    confidence: 0.99,
    generatedCode: 'replacement source',
    upgradeOrder: 1,
    executionStatus: 'completed'
  };

  for (const [field, value] of Object.entries(excluded)) {
    const checklist = build();
    checklist.dependencies[0].findings[0].items[0][field] = value;
    assert.throws(() => validateMigrationChecklist(checklist), /additional properties/, field);
  }
});

test('instruction policy rejects obvious commands, patches, URLs, and safety claims', () => {
  for (const instruction of [
    'Run npm install dependency@2.',
    '```js\nreplaceOldApi();\n```',
    'Read https://invented.example/guide.',
    'This dependency is safe to upgrade.'
  ]) {
    const finding = deterministicFinding();
    finding.items[0].instruction = instruction;
    assert.throws(() => build([record({ findings: [finding] })]), /violates/);
  }
});
