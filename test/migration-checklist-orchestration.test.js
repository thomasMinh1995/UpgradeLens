import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { AiRuntimeError } from '../src/ai-runtime-error.js';
import {
  assembleMigrationChecklist,
  buildMigrationChecklistViewModel,
  buildMigrationEvaluationContext,
  buildMigrationEvaluationPrepared,
  createMigrationGoldenFakeRuntime,
  createMigrationProgressReporter,
  decideMigrationQualification,
  evaluateMigrationQualification,
  generateMigrationChecklistDrafts,
  loadMigrationEvaluationDataset,
  migrationQualificationIdentityDigest,
  renderMigrationChecklistConsole,
  renderMigrationChecklistMarkdownSection,
  runMigrationEvaluation,
  runMigrationChecklistStage,
  serializeMigrationChecklist,
  validateMigrationChecklist,
  writeMigrationChecklist
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
import {
  MIGRATION_EXTRACTIVE_PLANNING_TASK
} from '../src/migration-checklist/extractive-prompt.js';

const generatedAt = '2026-07-17T00:00:00.000Z';
const temporaryDirectories = [];

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, {
    recursive: true,
    force: true
  })));
});

function coreDataset(dataset) {
  return {
    schemaVersion: dataset.schemaVersion,
    datasetId: dataset.datasetId,
    task: dataset.task,
    cases: structuredClone(dataset.cases)
  };
}

function extractiveCandidate(candidate, unsafeSecondItem = false) {
  if (candidate.status === 'ABSTAIN') {
    return {
      status: 'ABSTAIN',
      actions: [],
      abstentionReason: candidate.abstentionReason
    };
  }
  return {
    status: 'ACTIONABLE',
    actions: candidate.items.map((item, index) => ({
      evidenceRef: item.evidenceRefs[0],
      actionExcerpt: unsafeSecondItem && index > 0
        ? item.instruction
        : item.supportingExcerpts[0].text
    })),
    abstentionReason: null
  };
}

function createExtractiveFixtureRuntime(cases) {
  const responseByContext = new Map(cases.map((goldenCase) => [
    buildMigrationEvaluationContext(goldenCase).contextId,
    { response: goldenCase.response, id: goldenCase.id }
  ]));
  return {
    async generateStructured(request) {
      assert.equal(request.task, MIGRATION_EXTRACTIVE_PLANNING_TASK);
      const value = responseByContext.get(request.contextId);
      if (!value) throw new TypeError('Unknown extractive fixture context.');
      if (value.response.kind === 'runtimeError') {
        throw new AiRuntimeError(value.response.code, 'Fixture runtime failure.');
      }
      return {
        output: value.response.kind === 'candidate'
          ? extractiveCandidate(
            value.response.candidate,
            value.id === 'node/whole-candidate-rejection'
          )
          : value.response.output,
        provider: 'fixture',
        model: 'fixture',
        latencyMs: 0
      };
    }
  };
}

async function fixture(ids = ['generic/ambiguous-evidence', 'node/multi-action']) {
  const loaded = await loadMigrationEvaluationDataset();
  const dataset = coreDataset(loaded);
  const cases = ids.map((id) => dataset.cases.find((item) => item.id === id));
  const first = buildMigrationEvaluationPrepared(cases[0]);
  const prepared = {
    contextVersion: first.contextVersion,
    input: structuredClone(first.input),
    eligibleContexts: cases.map(buildMigrationEvaluationContext),
    fallbackRecords: [],
    summary: {
      totalFindings: cases.length,
      eligible: cases.length,
      notAnalyzed: 0,
      noGroundedAction: 0,
      unsupportedUsageCoverage: cases.filter((item) => (
        item.fixture.locationEligibility.reasonCode === 'UNSUPPORTED_USAGE_COVERAGE'
      )).length,
      conflictedEvidence: 0
    }
  };
  return {
    dataset,
    cases,
    prepared,
    runtime: createMigrationGoldenFakeRuntime(dataset),
    extractiveRuntime: createExtractiveFixtureRuntime(cases)
  };
}

async function assembled(ids) {
  const value = await fixture(ids);
  const qualification = await evaluateMigrationQualification({
    runtimeMetadata: { provider: 'fixture', model: 'fixture', adapter: 'fixture' },
    allowExperimental: true
  });
  const generation = await generateMigrationChecklistDrafts(value.prepared, {
    aiRuntime: value.runtime
  });
  const checklist = assembleMigrationChecklist({
    prepared: value.prepared,
    generation,
    qualification,
    generatedAt
  });
  return { ...value, generation, qualification, checklist };
}

test('final assembly preserves lineage, fallback, deterministic locations, review policy, and inputs', async () => {
  const value = await fixture();
  const before = structuredClone(value.prepared);
  const qualification = await evaluateMigrationQualification({
    runtimeMetadata: { provider: 'fixture', model: 'fixture', adapter: 'fixture' },
    allowExperimental: true
  });
  const generation = await generateMigrationChecklistDrafts(value.prepared, {
    aiRuntime: value.runtime
  });
  const checklist = assembleMigrationChecklist({
    prepared: value.prepared,
    generation,
    qualification,
    generatedAt
  });

  assert.equal(validateMigrationChecklist(checklist), checklist);
  assert.deepEqual(checklist.input, value.prepared.input);
  assert.deepEqual(value.prepared, before);
  assert.equal(checklist.summary.aiAuthoredItemCount, 2);
  assert.equal(checklist.summary.candidateLocationCount, 1);
  assert.equal(checklist.status, 'INCOMPLETE');
  assert.ok(checklist.limitations.some((item) => item.code === 'MIGRATION_PROVIDER_NOT_QUALIFIED'));

  const items = checklist.dependencies.flatMap((dependency) => (
    dependency.findings.flatMap((finding) => finding.items)
  ));
  const aiItems = items.filter((item) => item.basis === 'AI_AUTHORED');
  assert.ok(aiItems.length > 0);
  assert.ok(aiItems.every((item) => item.candidateLocations.length === 0));
  assert.ok(items.every((item) => item.requiresHumanReview));
  assert.ok(items.some((item) => item.kind === 'MANUAL_REVIEW_REQUIRED'));
  assert.ok(items.some((item) => item.kind === 'REVIEW_CANDIDATE_USAGE'
    && item.candidateLocations[0].file === 'src/App.tsx'));

  const repeated = assembleMigrationChecklist({
    prepared: value.prepared,
    generation,
    qualification,
    generatedAt
  });
  assert.equal(serializeMigrationChecklist(repeated), serializeMigrationChecklist(checklist));
});

test('writer creates parents, returns portable path, preserves target on validation/failure, and cleans temp files', async () => {
  const { checklist } = await assembled();
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-mp05-writer-'));
  temporaryDirectories.push(root);
  const artifactPath = await writeMigrationChecklist(root, checklist);
  assert.equal(artifactPath, '.upgradelens/migration-checklist.json');
  const target = path.join(root, artifactPath);
  assert.equal(await readFile(target, 'utf8'), serializeMigrationChecklist(checklist));

  const invalid = structuredClone(checklist);
  invalid.dependencies[0].findings[0].items[0].requiresHumanReview = false;
  await assert.rejects(writeMigrationChecklist(root, invalid), /validation error/);
  assert.equal(await readFile(target, 'utf8'), serializeMigrationChecklist(checklist));

  await assert.rejects(writeMigrationChecklist(root, checklist, {
    writeArtifact: async () => { throw new Error('private storage detail'); }
  }), (error) => error.code === 'MIGRATION_CHECKLIST_WRITE_FAILED'
    && !error.message.includes('private storage detail'));
  assert.equal(await readFile(target, 'utf8'), serializeMigrationChecklist(checklist));

  const failureRoot = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-mp05-rename-'));
  temporaryDirectories.push(failureRoot);
  await mkdir(path.join(failureRoot, '.upgradelens/migration-checklist.json'), { recursive: true });
  await assert.rejects(writeMigrationChecklist(failureRoot, checklist), (error) => (
    error.code === 'MIGRATION_CHECKLIST_WRITE_FAILED'
  ));
  const entries = await readdir(path.join(failureRoot, '.upgradelens'));
  assert.deepEqual(entries, ['migration-checklist.json']);
});

test('qualification guard never promotes missing, fake, mismatched, or critically failed qualification', async () => {
  const runtimeMetadata = { provider: 'provider-a', model: 'model-a', adapter: 'adapter-a' };
  await assert.rejects(evaluateMigrationQualification({ runtimeMetadata }), (error) => (
    error.code === 'MIGRATION_QUALIFICATION_REQUIRED'
  ));
  const missing = await evaluateMigrationQualification({ runtimeMetadata, allowExperimental: true });
  assert.equal(missing.status, 'MISSING');
  assert.equal(missing.executionAllowed, true);
  assert.equal(missing.experimentalOverrideUsed, true);
  assert.ok(missing.limitations.some((item) => item.code === 'MIGRATION_PROVIDER_NOT_QUALIFIED'));

  const loaded = await loadMigrationEvaluationDataset();
  const dataset = coreDataset(loaded);
  const delegate = createMigrationGoldenFakeRuntime(dataset);
  const matchingQualification = (await runMigrationEvaluation({
    dataset,
    mode: 'real',
    runtime: {
      async generateStructured(request) {
        const result = await delegate.generateStructured(request);
        return { ...result, provider: 'provider-a', model: 'model-a' };
      }
    },
    runtimeMetadata,
    generatedAt
  })).qualification;
  const legacy = await decideMigrationQualification({
    qualification: matchingQualification,
    runtimeMetadata,
    allowExperimental: true
  });
  assert.equal(legacy.status, 'CORRUPTED');
  assert.equal(legacy.executionAllowed, false);
  assert.ok(legacy.limitations.some((item) => (
    item.code === 'MIGRATION_QUALIFICATION_RECORD_SCHEMA_INVALID'
  )));

  const extractiveDataset = await loadMigrationEvaluationDatasetV2();
  const fakeQualification = (await runMigrationExtractiveEvaluationV2({
    dataset: extractiveDataset,
    mode: 'fake',
    generatedAt
  })).qualification;
  const fake = await decideMigrationQualification({
    qualification: fakeQualification,
    runtimeMetadata,
    allowExperimental: true
  });
  assert.equal(fake.status, 'IDENTITY_MISMATCH');
  assert.equal(fake.executionAllowed, false);
  assert.ok(fake.limitations.some((item) => item.code === 'FAKE_QUALIFICATION_NOT_REAL_PROVIDER'));

  const extractiveQualification = (await runMigrationExtractiveEvaluationV2({
    dataset: extractiveDataset,
    mode: 'real',
    runtime: {
      async generateStructured(request) {
        const item = extractiveDataset.cases.find((candidate) => (
          candidate.role === 'LIVE_QUALITY'
          && buildMigrationEvaluationContext(
            extractiveDataset.legacyDataset.cases.find(
              (baseCase) => baseCase.id === candidate.baseCaseId
            )
          ).contextId === request.contextId
        ));
        const resolved = resolveMigrationExtractiveEvaluationV2Case(extractiveDataset, item);
        return {
          output: resolved.fixedOutput,
          provider: 'provider-a',
          model: 'model-a'
        };
      }
    },
    runtimeMetadata,
    generatedAt
  })).qualification;
  const accepted = await evaluateMigrationQualification({
    qualification: extractiveQualification,
    runtimeMetadata,
    allowExperimental: false
  });
  assert.equal(accepted.status, 'QUALIFIED');
  assert.equal(accepted.qualificationId, extractiveQualification.qualificationId);

  for (const mutate of [
    (identity) => { identity.promptDigest = `sha256:${'0'.repeat(64)}`; },
    (identity) => { identity.candidateSchemaDigest = `sha256:${'0'.repeat(64)}`; },
    (identity) => {
      identity.generatorTrustSourceIdentity.trustPolicy = 'changed-trust-policy';
    },
    (identity) => {
      identity.deterministicPresentationIdentity = 'changed-presentation';
    }
  ]) {
    const changed = structuredClone(extractiveQualification);
    mutate(changed.identity);
    changed.qualificationId = migrationQualificationIdentityDigest(changed.identity);
    const guarded = await decideMigrationQualification({
      qualification: changed,
      runtimeMetadata,
      allowExperimental: true
    });
    assert.equal(guarded.status, 'IDENTITY_MISMATCH');
    assert.equal(guarded.executionAllowed, false);
    assert.ok(guarded.limitations.some((item) => (
      item.code === 'MIGRATION_QUALIFICATION_IDENTITY_MISMATCH'
    )));
  }
  const providerMismatch = await decideMigrationQualification({
    qualification: extractiveQualification,
    runtimeMetadata: { ...runtimeMetadata, model: 'different-model' },
    allowExperimental: true
  });
  assert.equal(providerMismatch.status, 'IDENTITY_MISMATCH');
  assert.equal(providerMismatch.executionAllowed, false);

  await assert.rejects(evaluateMigrationQualification({
    qualification: {
      ...extractiveQualification,
      qualificationId: `sha256:${'0'.repeat(64)}`
    },
    runtimeMetadata,
    allowExperimental: true
  }), (error) => error.code === 'MIGRATION_QUALIFICATION_IDENTITY_CORRUPT');

  await assert.rejects(evaluateMigrationQualification({
    qualification: {
      ...extractiveQualification,
      criticalGates: extractiveQualification.criticalGates.map((gate, index) => (
        index === 0
          ? { ...gate, passed: false, violations: ['controlled-critical-failure'] }
          : gate
      )),
      verdict: 'NOT_QUALIFIED'
    },
    runtimeMetadata,
    allowExperimental: true
  }), (error) => error.code === 'MIGRATION_RUNTIME_NOT_QUALIFIED');
});

test('experimental stage runs offline end to end, isolates fallback outcomes, validates before write, and emits safe events', async () => {
  const value = await fixture();
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-mp05-stage-'));
  temporaryDirectories.push(root);
  const events = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network forbidden'); };
  try {
    const result = await runMigrationChecklistStage({
      repositoryRoot: root,
      aiRuntime: value.extractiveRuntime,
      runtimeMetadata: { provider: 'fixture', model: 'fixture', adapter: 'fixture' },
      allowExperimental: true,
      generatedAt,
      prepareContexts: async () => value.prepared,
      onEvent: (event) => events.push(event)
    });
    assert.equal(validateMigrationChecklist(result.checklist), result.checklist);
    assert.equal(result.generation.summary.generated, 1);
    assert.equal(result.generation.summary.abstained, 1);
    assert.equal(result.checklist.summary.candidateLocationCount, 1);
    assert.equal(await readFile(path.join(root, result.artifactPath), 'utf8'),
      serializeMigrationChecklist(result.checklist));
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(events[0].type, 'stage:start');
  assert.equal(events.at(-1).type, 'stage:complete');
  assert.deepEqual(events.map((item) => item.type), [
    'stage:start',
    'stage:progress',
    'migration:context-start',
    'migration:abstained',
    'stage:progress',
    'migration:context-start',
    'migration:context-complete',
    'stage:progress',
    'migration:artifact-written',
    'stage:complete'
  ]);
  assert.deepEqual(events.filter((item) => item.type === 'migration:context-start').length, 2);
  assert.ok(events.some((item) => item.type === 'migration:abstained'));
  assert.ok(events.some((item) => item.type === 'migration:artifact-written'
    && item.artifactPath === '.upgradelens/migration-checklist.json'));
  const serializedEvents = JSON.stringify(events);
  assert.doesNotMatch(serializedEvents, /systemPrompt|userPrompt|evidenceAllowlist|supportingExcerpts|authorization|network forbidden/);
});

test('provider failure and whole-candidate trust rejection remain package-local', async () => {
  const value = await fixture([
    'generic/provider-failure',
    'node/whole-candidate-rejection',
    'node/multi-action'
  ]);
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-mp05-isolation-'));
  temporaryDirectories.push(root);
  const events = [];
  const result = await runMigrationChecklistStage({
    repositoryRoot: root,
    aiRuntime: value.extractiveRuntime,
    runtimeMetadata: { provider: 'fixture', model: 'fixture', adapter: 'fixture' },
    allowExperimental: true,
    generatedAt,
    prepareContexts: async () => value.prepared,
    onEvent: (event) => events.push(event)
  });

  assert.deepEqual({
    generated: result.generation.summary.generated,
    rejected: result.generation.summary.rejected,
    failed: result.generation.summary.failed
  }, { generated: 1, rejected: 1, failed: 1 });
  assert.equal(result.checklist.summary.aiAuthoredItemCount, 2);
  assert.ok(events.some((event) => event.type === 'migration:trust-rejected'
    && event.packageName === 'client'));
  assert.ok(events.some((event) => event.type === 'migration:fallback'
    && event.packageName === 'failure'
    && event.reasonCode === 'AI_RUNTIME_FAILED'));
  assert.doesNotMatch(serializeMigrationChecklist(result.checklist), /inventedClientMode/);
});

test('zero eligible contexts never create or invoke the AI runtime', async () => {
  const value = await fixture(['node/multi-action']);
  const prepared = {
    ...structuredClone(value.prepared),
    eligibleContexts: [],
    summary: {
      ...structuredClone(value.prepared.summary),
      totalFindings: 0,
      eligible: 0,
      unsupportedUsageCoverage: 0
    }
  };
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-mp05-empty-'));
  temporaryDirectories.push(root);
  let runtimeCreations = 0;
  const result = await runMigrationChecklistStage({
    repositoryRoot: root,
    createAiRuntime() {
      runtimeCreations += 1;
      throw new Error('provider runtime must remain lazy');
    },
    runtimeMetadata: { provider: 'unknown', model: 'unknown', adapter: 'unknown' },
    allowExperimental: true,
    generatedAt,
    prepareContexts: async () => prepared
  });

  assert.equal(runtimeCreations, 0);
  assert.equal(result.generation.summary.attempted, 0);
  assert.equal(result.checklist.summary.itemCount, 0);
  assert.equal(validateMigrationChecklist(result.checklist), result.checklist);
});

test('stage remains correct without a listener and fatal preparation failure writes no artifact', async () => {
  const value = await fixture(['node/multi-action']);
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-mp05-no-listener-'));
  temporaryDirectories.push(root);
  const result = await runMigrationChecklistStage({
    repositoryRoot: root,
    aiRuntime: value.extractiveRuntime,
    runtimeMetadata: { provider: 'fixture', model: 'fixture', adapter: 'fixture' },
    allowExperimental: true,
    generatedAt,
    prepareContexts: async () => value.prepared
  });
  assert.equal(result.checklist.summary.aiAuthoredItemCount, 2);

  const failedRoot = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-mp05-fatal-'));
  temporaryDirectories.push(failedRoot);
  const events = [];
  await assert.rejects(runMigrationChecklistStage({
    repositoryRoot: failedRoot,
    aiRuntime: value.runtime,
    runtimeMetadata: { provider: 'fixture', model: 'fixture', adapter: 'fixture' },
    allowExperimental: true,
    generatedAt,
    prepareContexts: async () => { throw new Error('lineage mismatch private details'); },
    onEvent: (event) => events.push(event)
  }), /lineage mismatch/);
  assert.equal(events.at(-1).type, 'stage:failed');
  assert.equal(events.at(-1).reasonCode, 'LINEAGE_INVALID');
  await assert.rejects(readFile(path.join(failedRoot, '.upgradelens/migration-checklist.json')),
    { code: 'ENOENT' });
});

test('presentation is deterministic, truth-preserving, and handles unknown/registry-latest facts', async () => {
  const { checklist, qualification } = await assembled(['python/unknown-registry-action']);
  const before = structuredClone(checklist);
  const viewModel = buildMigrationChecklistViewModel(checklist, {
    qualificationDecision: qualification
  });
  const consoleOutput = renderMigrationChecklistConsole({
    viewModel,
    artifactPath: '.upgradelens/migration-checklist.json'
  });
  const markdown = renderMigrationChecklistMarkdownSection({ viewModel });
  assert.equal(consoleOutput, renderMigrationChecklistConsole({
    viewModel,
    artifactPath: '.upgradelens/migration-checklist.json'
  }));
  assert.equal(markdown, renderMigrationChecklistMarkdownSection({ viewModel }));
  assert.deepEqual(checklist, before);
  assert.match(consoleOutput, /Provider qualification: MISSING/);
  assert.match(consoleOutput, /Experimental override: YES/);
  assert.match(consoleOutput, /Human review required: YES/);
  assert.match(markdown, /AI-selected official guidance — requires human review/);
  assert.match(markdown, /unknown current version/);
  assert.match(markdown, /registry latest fact/);
  assert.match(markdown, /does not mean the upgrade is safe or the migration is complete/);
  assert.doesNotMatch(markdown, /recommended target|fixes generated|migration ready|verified action/i);
});

test('plain and interactive progress are stable, TTY-aware, and contain no cursor control', () => {
  const capture = (isTTY) => {
    let value = '';
    return {
      stream: { isTTY, write(chunk) { value += chunk; return true; } },
      value: () => value
    };
  };
  const plain = capture(false);
  const plainReporter = createMigrationProgressReporter(plain.stream, { mode: 'auto' });
  assert.equal(plainReporter.mode, 'plain');
  plainReporter.handle({
    type: 'stage:start', total: 2, qualificationStatus: 'MISSING',
    qualificationId: null, experimentalOverrideUsed: true
  });
  plainReporter.handle({
    type: 'migration:context-complete', packageName: 'react', outcome: 'generated',
    processed: 1, total: 2, reasonCode: null
  });
  plainReporter.handle({
    type: 'stage:complete', processed: 2, total: 2, generated: 1, abstained: 1,
    rejected: 0, failed: 0, qualificationStatus: 'MISSING',
    qualificationId: null, experimentalOverrideUsed: true
  });
  assert.match(plain.value(), /^\[MIGRATION_CHECKLIST\] START/m);
  assert.match(plain.value(), /CONTEXT package=react status=generated/);
  assert.match(plain.value(), /COMPLETE .* qualification=MISSING .* experimentalOverride=yes/);
  assert.doesNotMatch(plain.value(), /\u001b\[/);

  const interactive = capture(true);
  const times = [0, 12_400];
  const interactiveReporter = createMigrationProgressReporter(interactive.stream, {
    mode: 'auto', clock: () => times.shift() ?? 12_400
  });
  assert.equal(interactiveReporter.mode, 'interactive');
  interactiveReporter.handle({
    type: 'stage:start', total: 2, qualificationStatus: 'MISSING',
    qualificationId: null, experimentalOverrideUsed: true
  });
  interactiveReporter.handle({
    type: 'stage:complete', processed: 2, total: 2, generated: 1, abstained: 1,
    rejected: 0, failed: 0, qualificationStatus: 'MISSING',
    qualificationId: null, experimentalOverrideUsed: true
  });
  assert.match(interactive.value(), /● Building migration checklist/);
  assert.match(interactive.value(), /✓ Migration checklist completed  12\.4s/);
  assert.match(interactive.value(), /Provider qualification: MISSING/);
  assert.doesNotMatch(interactive.value(), /\u001b\[/);
});
