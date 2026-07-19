import assert from 'node:assert/strict';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildMigrationEvaluationContext,
  buildMigrationPlanningQualificationRecord,
  loadMigrationPlanningQualificationRecord,
  migrationQualificationIdentityDigest,
  resolveMigrationQualification,
  serializeMigrationPlanningQualificationRecord,
  validateMigrationPlanningQualificationRecord,
  writeMigrationPlanningQualificationRecord
} from '../src/index.js';
import {
  loadMigrationEvaluationDatasetV2
} from '../src/migration-checklist/evaluation/dataset-v2.js';
import {
  resolveMigrationExtractiveEvaluationV2Case
} from '../src/migration-checklist/evaluation/extractive-fixtures-v2.js';
import {
  runMigrationExtractiveEvaluationV2
} from '../src/migration-checklist/evaluation/runner-v2.js';
import { runCli } from '../src/cli.js';

const generatedAt = '2026-07-17T00:00:00.000Z';
const runtimeMetadata = {
  provider: 'provider-a',
  model: 'model-a',
  adapter: 'adapter-a'
};
const temporaryDirectories = [];
let dataset;
let qualified;
let fakeQualified;

test.before(async () => {
  dataset = await loadMigrationEvaluationDatasetV2();
  qualified = (await runMigrationExtractiveEvaluationV2({
    dataset,
    mode: 'real',
    runtime: {
      async generateStructured(request) {
        const item = dataset.cases.find((candidate) => {
          if (candidate.role !== 'LIVE_QUALITY') return false;
          const base = dataset.legacyDataset.cases.find(
            (baseCase) => baseCase.id === candidate.baseCaseId
          );
          return buildMigrationEvaluationContext(base).contextId === request.contextId;
        });
        const resolved = resolveMigrationExtractiveEvaluationV2Case(dataset, item);
        return {
          output: resolved.fixedOutput,
          provider: runtimeMetadata.provider,
          model: runtimeMetadata.model
        };
      }
    },
    runtimeMetadata,
    generatedAt
  })).qualification;
  fakeQualified = (await runMigrationExtractiveEvaluationV2({
    dataset,
    mode: 'fake',
    generatedAt
  })).qualification;
});

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, {
    recursive: true,
    force: true
  })));
});

async function temporaryRoot(name) {
  const root = await mkdtemp(path.join(os.tmpdir(), `upgradelens-${name}-`));
  temporaryDirectories.push(root);
  return root;
}

function capture() {
  let value = '';
  return {
    stream: { write(chunk) { value += chunk; return true; } },
    value: () => value
  };
}

async function cliRoot(name) {
  const root = await temporaryRoot(name);
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({
    name,
    version: '1.0.0',
    dependencies: {}
  }, null, 2)}\n`);
  return root;
}

async function runExperimentalCli(root, {
  env = runtimeMetadata,
  migrationAiRuntime,
  resolver
} = {}) {
  const stdout = capture();
  const stderr = capture();
  const exitCode = await runCli([
    'analyze',
    root,
    '--offline',
    '--experimental-migration-checklist',
    '--progress',
    'plain'
  ], {
    env: {
      UPGRADELENS_AI_PROVIDER: env.provider,
      UPGRADELENS_AI_MODEL: env.model
    },
    migrationRuntimeMetadata: env,
    migrationAiRuntime,
    ...(resolver ? { resolveMigrationQualification: resolver } : {}),
    clock: () => new Date(generatedAt),
    stdout: stdout.stream,
    stderr: stderr.stream
  });
  return { exitCode, stdout: stdout.value(), stderr: stderr.value() };
}

function matchingNotQualified() {
  const value = structuredClone(qualified);
  value.verdict = 'NOT_QUALIFIED';
  value.criticalGates[0].passed = false;
  value.criticalGates[0].violations = ['controlled-critical-failure'];
  return value;
}

function qualificationForChangedIdentity(mutate) {
  const value = structuredClone(qualified);
  mutate(value.identity);
  value.qualificationId = migrationQualificationIdentityDigest(value.identity);
  return value;
}

test('writes, loads, validates, freezes, and deterministically serializes a real-provider record', async () => {
  const root = await temporaryRoot('qualification-valid');
  const artifactPath = await writeMigrationPlanningQualificationRecord(root, qualified);
  assert.equal(artifactPath, '.depverdict/migration-planning-qualification.json');
  const loaded = await loadMigrationPlanningQualificationRecord(root);
  assert.equal(validateMigrationPlanningQualificationRecord(loaded), loaded);
  assert.equal(loaded.qualification.qualificationId, qualified.qualificationId);
  assert.equal(Object.isFrozen(loaded), true);
  assert.equal(Object.isFrozen(loaded.qualification.identity.runtime), true);
  const bytes = await readFile(path.join(root, artifactPath), 'utf8');
  assert.equal(bytes, serializeMigrationPlanningQualificationRecord(loaded));
  assert.equal(bytes, serializeMigrationPlanningQualificationRecord(
    buildMigrationPlanningQualificationRecord(qualified)
  ));
});

test('missing, invalid JSON, schema-invalid, and tampered records fail with constrained codes', async () => {
  const root = await temporaryRoot('qualification-invalid');
  await assert.rejects(loadMigrationPlanningQualificationRecord(root), (error) => (
    error.code === 'MIGRATION_QUALIFICATION_RECORD_MISSING'
  ));
  await mkdir(path.join(root, '.depverdict'), { recursive: true });
  const target = path.join(root, '.depverdict/migration-planning-qualification.json');
  await writeFile(target, '{invalid\n');
  await assert.rejects(loadMigrationPlanningQualificationRecord(root), (error) => (
    error.code === 'MIGRATION_QUALIFICATION_RECORD_INVALID_JSON'
  ));
  await writeFile(target, '{}\n');
  await assert.rejects(loadMigrationPlanningQualificationRecord(root), (error) => (
    error.code === 'MIGRATION_QUALIFICATION_RECORD_SCHEMA_INVALID'
  ));
  const tamperedRecord = structuredClone(buildMigrationPlanningQualificationRecord(qualified));
  tamperedRecord.recordDigest = `sha256:${'0'.repeat(64)}`;
  await writeFile(target, `${JSON.stringify(tamperedRecord)}\n`);
  await assert.rejects(loadMigrationPlanningQualificationRecord(root), (error) => (
    error.code === 'MIGRATION_QUALIFICATION_RECORD_INTEGRITY_INVALID'
  ));
  const tamperedIdentity = structuredClone(buildMigrationPlanningQualificationRecord(qualified));
  tamperedIdentity.qualification.qualificationId = `sha256:${'0'.repeat(64)}`;
  await writeFile(target, `${JSON.stringify(tamperedIdentity)}\n`);
  await assert.rejects(loadMigrationPlanningQualificationRecord(root), (error) => (
    error.code === 'MIGRATION_QUALIFICATION_RECORD_INTEGRITY_INVALID'
  ));
});

test('every task identity component and runtime tuple mismatch fails closed', async () => {
  const mutations = [
    (identity) => { identity.datasetId = 'changed-dataset'; },
    (identity) => { identity.datasetVersion = 'changed-version'; },
    (identity) => { identity.datasetDigest = `sha256:${'0'.repeat(64)}`; },
    (identity) => { identity.evaluationCriteriaId = 'changed-criteria'; },
    (identity) => { identity.evaluationCriteriaVersion = 'changed-version'; },
    (identity) => { identity.evaluationCriteriaDigest = `sha256:${'0'.repeat(64)}`; },
    (identity) => { identity.comparatorVersion = 'changed-version'; },
    (identity) => { identity.normalizationVersion = 'changed-version'; },
    (identity) => { identity.policyVersion = 'changed-version'; },
    (identity) => { identity.policyDigest = `sha256:${'0'.repeat(64)}`; },
    (identity) => { identity.promptVersion = 'changed-version'; },
    (identity) => { identity.promptDigest = `sha256:${'0'.repeat(64)}`; },
    (identity) => { identity.candidateSchemaDigest = `sha256:${'0'.repeat(64)}`; },
    (identity) => {
      identity.generatorTrustSourceIdentity.candidateContract = 'changed-contract';
    },
    (identity) => {
      identity.generatorTrustSourceIdentity.generatorResultVersion = 'changed-version';
    },
    (identity) => {
      identity.generatorTrustSourceIdentity.promptVersion = 'changed-version';
    },
    (identity) => { identity.generatorTrustSourceIdentity.trustPolicy = 'changed-trust'; },
    (identity) => {
      identity.generatorTrustSourceIdentity.deterministicPresentation =
        'changed-presentation';
    },
    (identity) => { identity.deterministicPresentationIdentity = 'changed-presentation'; },
    (identity) => {
      identity.runtime.provider = 'provider-b';
      identity.runtime.observedProviders = ['provider-b'];
    },
    (identity) => {
      identity.runtime.model = 'model-b';
      identity.runtime.observedModels = ['model-b'];
    },
    (identity) => { identity.runtime.adapter = 'adapter-b'; }
  ];
  for (const mutate of mutations) {
    const decision = await resolveMigrationQualification({
      repositoryRoot: '/unused',
      runtimeMetadata,
      allowExperimental: true,
      qualification: qualificationForChangedIdentity(mutate)
    });
    assert.equal(decision.status, 'IDENTITY_MISMATCH');
    assert.equal(decision.executionAllowed, false);
    assert.equal(decision.experimentalOverrideUsed, false);
  }
});

test('fake runtime and matching NOT_QUALIFIED records cannot use experimental override', async () => {
  const fake = await resolveMigrationQualification({
    repositoryRoot: '/unused',
    runtimeMetadata,
    allowExperimental: true,
    qualification: fakeQualified
  });
  assert.equal(fake.status, 'IDENTITY_MISMATCH');
  assert.equal(fake.reasonCode, 'MIGRATION_FAKE_QUALIFICATION_FOR_REAL_RUNTIME');
  assert.equal(fake.executionAllowed, false);

  const rejected = await resolveMigrationQualification({
    repositoryRoot: '/unused',
    runtimeMetadata,
    allowExperimental: true,
    qualification: matchingNotQualified()
  });
  assert.equal(rejected.status, 'NOT_QUALIFIED');
  assert.equal(rejected.reasonCode, 'MIGRATION_RUNTIME_NOT_QUALIFIED');
  assert.equal(rejected.executionAllowed, false);

  const malformed = structuredClone(qualified);
  malformed.thresholdResults = [];
  const corrupted = await resolveMigrationQualification({
    repositoryRoot: '/unused',
    runtimeMetadata,
    allowExperimental: true,
    qualification: malformed
  });
  assert.equal(corrupted.status, 'CORRUPTED');
  assert.equal(corrupted.reasonCode, 'MIGRATION_QUALIFICATION_RECORD_SCHEMA_INVALID');
  assert.equal(corrupted.executionAllowed, false);
});

test('writer validates before replacement, rejects secret-like data, and cleans failed temp files', async () => {
  const preservedRoot = await temporaryRoot('qualification-writer-preserve');
  await writeMigrationPlanningQualificationRecord(preservedRoot, qualified);
  const target = path.join(
    preservedRoot,
    '.depverdict/migration-planning-qualification.json'
  );
  const original = await readFile(target, 'utf8');
  const invalid = structuredClone(qualified);
  invalid.qualificationId = `sha256:${'0'.repeat(64)}`;
  await assert.rejects(
    writeMigrationPlanningQualificationRecord(preservedRoot, invalid),
    (error) => error.code === 'MIGRATION_QUALIFICATION_RECORD_INTEGRITY_INVALID'
  );
  const sensitive = structuredClone(qualified);
  sensitive.limitations = [{
    code: 'CONTROLLED_LIMITATION',
    message: 'api_key=secret-material-must-not-persist'
  }];
  sensitive.verdict = 'QUALIFIED_WITH_LIMITATIONS';
  await assert.rejects(
    writeMigrationPlanningQualificationRecord(preservedRoot, sensitive),
    (error) => error.code === 'MIGRATION_QUALIFICATION_RECORD_SENSITIVE'
  );
  assert.equal(await readFile(target, 'utf8'), original);

  const root = await temporaryRoot('qualification-writer-failure');
  await mkdir(path.join(root, '.depverdict/migration-planning-qualification.json'), {
    recursive: true
  });
  await assert.rejects(
    writeMigrationPlanningQualificationRecord(root, qualified),
    (error) => error.code === 'MIGRATION_QUALIFICATION_RECORD_WRITE_FAILED'
  );
  assert.deepEqual(
    await readdir(path.join(root, '.depverdict')),
    ['migration-planning-qualification.json']
  );
});

test('injected and explicit sources win without merging and invalid explicit source never falls back', async () => {
  let loads = 0;
  const injected = await resolveMigrationQualification({
    repositoryRoot: '/unused',
    runtimeMetadata,
    allowExperimental: true,
    qualification: qualified,
    qualificationPath: 'ignored.json',
    loadRecord: async () => {
      loads += 1;
      throw new Error('must not load');
    }
  });
  assert.equal(injected.status, 'QUALIFIED');
  assert.equal(injected.sourceKind, 'injected');
  assert.equal(loads, 0);

  const root = await temporaryRoot('qualification-explicit-invalid');
  await writeMigrationPlanningQualificationRecord(root, qualified);
  await writeMigrationPlanningQualificationRecord(root, matchingNotQualified(), {
    artifactPath: 'explicit.json'
  });
  const selected = await resolveMigrationQualification({
    repositoryRoot: root,
    runtimeMetadata,
    allowExperimental: true,
    qualificationPath: 'explicit.json'
  });
  assert.equal(selected.status, 'NOT_QUALIFIED');
  assert.equal(selected.sourceKind, 'explicitPath');
  assert.equal(selected.sourcePath, 'explicit.json');

  await writeFile(path.join(root, 'invalid.json'), '{bad\n');
  const explicit = await resolveMigrationQualification({
    repositoryRoot: root,
    runtimeMetadata,
    allowExperimental: true,
    qualificationPath: 'invalid.json'
  });
  assert.equal(explicit.status, 'CORRUPTED');
  assert.equal(explicit.sourceKind, 'explicitPath');
  assert.equal(explicit.executionAllowed, false);
});

test('default source resolves from target root exactly once and missing default alone may run experimentally', async () => {
  const root = await temporaryRoot('qualification-target-root');
  await writeMigrationPlanningQualificationRecord(root, qualified);
  let loads = 0;
  const decision = await resolveMigrationQualification({
    repositoryRoot: root,
    runtimeMetadata,
    allowExperimental: true,
    loadRecord: async (...args) => {
      loads += 1;
      return loadMigrationPlanningQualificationRecord(...args);
    }
  });
  assert.equal(loads, 1);
  assert.equal(decision.status, 'QUALIFIED');
  assert.equal(decision.sourceKind, 'defaultPath');
  assert.equal(decision.sourcePath, '.depverdict/migration-planning-qualification.json');

  const missingRoot = await temporaryRoot('qualification-default-missing');
  const missing = await resolveMigrationQualification({
    repositoryRoot: missingRoot,
    runtimeMetadata,
    allowExperimental: true
  });
  assert.equal(missing.status, 'MISSING');
  assert.equal(missing.executionAllowed, true);
  assert.equal(missing.experimentalOverrideUsed, true);
  assert.equal(missing.sourceKind, 'defaultPath');
});

test('legacy qualification falls back intact and canonical qualification wins when both exist', async () => {
  const root = await temporaryRoot('qualification-root-compatibility');
  const legacyPath = '.upgradelens/migration-planning-qualification.json';
  await writeMigrationPlanningQualificationRecord(root, qualified, {
    artifactPath: legacyPath
  });
  const legacyBytes = await readFile(path.join(root, legacyPath), 'utf8');
  const legacyDiagnostics = [];
  const legacy = await resolveMigrationQualification({
    repositoryRoot: root,
    runtimeMetadata,
    allowExperimental: true,
    onCompatibilityDiagnostic: (message) => legacyDiagnostics.push(message)
  });
  assert.equal(legacy.status, 'QUALIFIED');
  assert.equal(legacy.sourcePath, legacyPath);
  assert.deepEqual(legacyDiagnostics, [
    'LEGACY_ARTIFACT_ROOT_USED: using complete deprecated .upgradelens/ input chain.'
  ]);
  assert.equal(await readFile(path.join(root, legacyPath), 'utf8'), legacyBytes);

  await writeMigrationPlanningQualificationRecord(root, matchingNotQualified());
  const canonicalDiagnostics = [];
  const canonical = await resolveMigrationQualification({
    repositoryRoot: root,
    runtimeMetadata,
    allowExperimental: true,
    onCompatibilityDiagnostic: (message) => canonicalDiagnostics.push(message)
  });
  assert.equal(canonical.status, 'NOT_QUALIFIED');
  assert.equal(
    canonical.sourcePath,
    '.depverdict/migration-planning-qualification.json'
  );
  assert.deepEqual(canonicalDiagnostics, [
    'LEGACY_ARTIFACT_ROOT_IGNORED: using complete .depverdict/ input chain.'
  ]);
});

test('normalized decisions are immutable, deterministic, and detached from injected inputs', async () => {
  const input = structuredClone(qualified);
  const first = await resolveMigrationQualification({
    repositoryRoot: '/unused',
    runtimeMetadata,
    allowExperimental: true,
    qualification: input
  });
  const second = await resolveMigrationQualification({
    repositoryRoot: '/unused',
    runtimeMetadata,
    allowExperimental: true,
    qualification: structuredClone(qualified)
  });
  assert.deepEqual(first, second);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.runtimeIdentity), true);
  input.identity.runtime.model = 'mutated-after-resolution';
  input.limitations.push({ code: 'MUTATED', message: 'Mutation must not escape.' });
  assert.equal(first.runtimeIdentity.model, runtimeMetadata.model);
  assert.equal(first.limitations.some((item) => item.code === 'MUTATED'), false);
});

test('default public analyze never resolves or requires Migration Planning qualification', async () => {
  const root = await cliRoot('qualification-default-cli');
  const stdout = capture();
  const stderr = capture();
  let resolutions = 0;
  const exitCode = await runCli(['analyze', root, '--offline'], {
    resolveMigrationQualification: async () => {
      resolutions += 1;
      throw new Error('default analyze must not resolve qualification');
    },
    clock: () => new Date(generatedAt),
    stdout: stdout.stream,
    stderr: stderr.stream
  });
  assert.equal(exitCode, 0);
  assert.equal(resolutions, 0);
  assert.doesNotMatch(stdout.value(), /Migration checklist|Provider qualification/);
  assert.doesNotMatch(stderr.value(), /MIGRATION_CHECKLIST/);
});

test('experimental public CLI auto-loads a persisted QUALIFIED record and stays consistent', async () => {
  const root = await cliRoot('qualification-qualified-cli');
  await writeMigrationPlanningQualificationRecord(root, qualified);
  let resolutions = 0;
  const result = await runExperimentalCli(root, {
    resolver: async (options) => {
      resolutions += 1;
      return resolveMigrationQualification(options);
    }
  });
  assert.equal(result.exitCode, 0);
  assert.equal(resolutions, 1);
  assert.match(result.stderr, /STAGE START id=migrationChecklist label="Migration Checklist"/);
  assert.match(result.stderr, /STAGE COMPLETE id=migrationChecklist label="Migration Checklist"/);
  assert.match(result.stdout, /Provider qualification: QUALIFIED/);
  assert.match(result.stdout, new RegExp(`Qualification ID: ${qualified.qualificationId}`));
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /NOT_AVAILABLE|Provider qualification: MISSING/);
  const markdown = await readFile(
    path.join(root, '.depverdict/repository-impact.md'),
    'utf8'
  );
  assert.match(markdown, /Provider qualification: `QUALIFIED`/);
  assert.match(markdown, new RegExp(`Qualification ID: \`${qualified.qualificationId}\``));
  assert.match(markdown, /Experimental override: \*\*NO\*\*/);
});

test('experimental public CLI surfaces missing qualification without calling it qualified', async () => {
  const root = await cliRoot('qualification-missing-cli');
  const result = await runExperimentalCli(root);
  assert.equal(result.exitCode, 0);
  assert.match(result.stderr, /STAGE COMPLETE id=migrationChecklist label="Migration Checklist"/);
  assert.match(result.stdout, /Provider qualification: MISSING/);
  assert.match(result.stdout, /Experimental override: YES/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Provider qualification: QUALIFIED/);
  const markdown = await readFile(
    path.join(root, '.depverdict/repository-impact.md'),
    'utf8'
  );
  assert.match(markdown, /Provider qualification: `MISSING`/);
  assert.match(markdown, /Experimental override: \*\*YES\*\*/);
});

test('identity mismatch, corrupted, and matching NOT_QUALIFIED records block before provider use', async () => {
  const scenarios = [
    {
      name: 'qualification-mismatch-cli',
      qualification: qualified,
      env: { ...runtimeMetadata, model: 'model-b' },
      expectedStatus: 'IDENTITY_MISMATCH',
      expectedReason: 'MIGRATION_QUALIFICATION_IDENTITY_MISMATCH'
    },
    {
      name: 'qualification-corrupt-cli',
      corrupt: true,
      env: runtimeMetadata,
      expectedStatus: 'CORRUPTED',
      expectedReason: 'MIGRATION_QUALIFICATION_RECORD_INVALID_JSON'
    },
    {
      name: 'qualification-not-qualified-cli',
      qualification: matchingNotQualified(),
      env: runtimeMetadata,
      expectedStatus: 'NOT_QUALIFIED',
      expectedReason: 'MIGRATION_RUNTIME_NOT_QUALIFIED'
    }
  ];

  for (const scenario of scenarios) {
    const root = await cliRoot(scenario.name);
    if (scenario.corrupt) {
      await mkdir(path.join(root, '.upgradelens'), { recursive: true });
      await writeFile(
        path.join(root, '.upgradelens/migration-planning-qualification.json'),
        '{invalid\n'
      );
    } else {
      await writeMigrationPlanningQualificationRecord(root, scenario.qualification);
    }
    let providerCalls = 0;
    const result = await runExperimentalCli(root, {
      env: scenario.env,
      migrationAiRuntime: {
        async generateStructured() {
          providerCalls += 1;
          throw new Error('provider must not be called');
        }
      }
    });
    assert.equal(result.exitCode, 1);
    assert.equal(providerCalls, 0);
    assert.match(result.stderr, /STAGE FAILED id=migrationChecklist reason=/);
    assert.match(result.stderr, new RegExp(`Qualification status: ${scenario.expectedStatus}`));
    assert.match(result.stderr, new RegExp(`Reason: ${scenario.expectedReason}`));
    assert.doesNotMatch(result.stdout, /Migration checklist created/);
    await assert.rejects(
      readFile(path.join(root, '.depverdict/migration-checklist.json')),
      { code: 'ENOENT' }
    );
    await assert.rejects(
      readFile(path.join(root, '.depverdict/repository-impact.md')),
      { code: 'ENOENT' }
    );
  }
});
