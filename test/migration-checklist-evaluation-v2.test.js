import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  MIGRATION_ACTION_EVALUATION_CRITERIA_ID,
  MIGRATION_ACTION_EVALUATION_CRITERIA_VERSION,
  MIGRATION_QUALIFICATION_POLICY_V2,
  buildMigrationEvaluationContext,
  computeMigrationEvaluationMetricsV2,
  createMigrationGoldenFakeRuntime,
  evaluateMigrationActionInstruction,
  loadMigrationEvaluationDataset,
  loadMigrationEvaluationDatasetV2,
  loadVersionedMigrationEvaluationDataset,
  migrationActionEvaluationCriteriaDigest,
  migrationEvaluationDatasetDigest,
  migrationEvaluationDatasetV2Digest,
  migrationQualificationPolicyDigest,
  qualifyMigrationPlanningRuntimeV2,
  renderMigrationEvaluationScorecardV2,
  runMigrationEvaluation,
  runMigrationEvaluationV2,
  validateMigrationActionCriteria,
  validateMigrationEvaluationDatasetV2
} from '../src/index.js';

const generatedAt = '2026-07-17T00:00:00.000Z';
const V1_DATASET_DIGEST = 'sha256:6f32b8171fb8610d024860957cbe5bffa05b46b9a2fc3d25caf404bc5725ee3c';
const V1_POLICY_DIGEST = 'sha256:f390e33c66a68b2ba38995ac0c4e0b7607a1e495e360bf29a7f5f67ed7a7d786';
const V1_FILE_DIGEST = '339ba3196dcf714b26f15c62295c09d475e5db0bce4b9b2d6fe1aaef454d9860';

function coreV2(dataset) {
  return {
    schemaVersion: dataset.schemaVersion,
    datasetId: dataset.datasetId,
    task: dataset.task,
    baseDataset: structuredClone(dataset.baseDataset),
    cases: structuredClone(dataset.cases)
  };
}

function explicitCriteria(dataset) {
  return dataset.cases.find((item) => item.id === 'generic/explicit-action')
    .expected.actionCriteria;
}

function liveRuntime(dataset, overrides = {}) {
  const responseByContext = new Map(dataset.cases
    .filter((item) => item.role === 'LIVE_QUALITY')
    .map((item) => {
      const base = dataset.legacyDataset.cases.find((value) => value.id === item.baseCaseId);
      return [buildMigrationEvaluationContext(base).contextId, {
        id: item.id,
        output: base.response.candidate
      }];
    }));
  const calls = [];
  return {
    calls,
    async generateStructured(request) {
      calls.push(structuredClone(request));
      const response = responseByContext.get(request.contextId);
      if (!response) throw new Error(`Unexpected live request ${request.contextId}.`);
      return {
        output: structuredClone(overrides[response.id] ?? response.output),
        provider: 'provider-v2',
        model: 'model-v2',
        latencyMs: 0
      };
    }
  };
}

function explicitCandidate(dataset, instruction) {
  const base = dataset.legacyDataset.cases.find((item) => item.id === 'generic/explicit-action');
  const original = structuredClone(base.response.candidate);
  original.items[0].instruction = instruction;
  return original;
}

function passingMetrics(metrics) {
  const copy = structuredClone(metrics);
  copy.criticalGates = copy.criticalGates.map((item) => ({ ...item, passed: true, violations: [] }));
  for (const name of [
    'publishedUnsupportedActionRate', 'ambiguousPublishedActionRate'
  ]) copy.metrics[name] = { ...copy.metrics[name], value: 0, numerator: 0 };
  for (const name of [
    'unsafeCandidateContainmentRate', 'prohibitedCapabilityContainmentRate',
    'injectedFailureFallbackRate', 'locationPreservationRate', 'identityPreservationRate',
    'humanReviewCorrectnessRate', 'versionUncertaintyPreservationRate',
    'deterministicPostProcessingPassRate'
  ]) copy.metrics[name] = { ...copy.metrics[name], value: 1, numerator: copy.metrics[name].denominator };
  return copy;
}

test('v1 bytes, dataset digest, policy digest, loader, and fake behavior remain unchanged', async () => {
  const bytes = await readFile(new URL('../eval/migration-planning/golden-dataset.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), V1_FILE_DIGEST);
  const v1 = await loadMigrationEvaluationDataset();
  assert.equal(v1.datasetDigest, V1_DATASET_DIGEST);
  assert.equal(migrationQualificationPolicyDigest(), V1_POLICY_DIGEST);
  assert.equal((await loadVersionedMigrationEvaluationDataset({ version: '1.0.0' })).datasetDigest, V1_DATASET_DIGEST);
  const report = await runMigrationEvaluation({ generatedAt });
  assert.equal(report.qualification.verdict, 'QUALIFIED_WITH_LIMITATIONS');
});

test('v2 has a distinct stable identity and explicit role coverage', async () => {
  const dataset = await loadMigrationEvaluationDatasetV2();
  assert.equal(dataset.schemaVersion, '2.0.0');
  assert.notEqual(dataset.datasetDigest, V1_DATASET_DIGEST);
  assert.equal(dataset.datasetDigest, migrationEvaluationDatasetV2Digest(coreV2(dataset), dataset.legacyDataset));
  assert.deepEqual(Object.fromEntries(['LIVE_QUALITY', 'RECORDED_CONTAINMENT', 'INJECTED_FAILURE']
    .map((role) => [role, dataset.cases.filter((item) => item.role === role).length])), {
    LIVE_QUALITY: 7,
    RECORDED_CONTAINMENT: 18,
    INJECTED_FAILURE: 3
  });
  assert.equal((await loadVersionedMigrationEvaluationDataset({ version: '2.0.0' })).datasetDigest, dataset.datasetDigest);
  assert.equal((await runMigrationEvaluationV2({
    dataset: coreV2(dataset), generatedAt
  })).dataset.datasetDigest, dataset.datasetDigest);
  await assert.rejects(() => loadVersionedMigrationEvaluationDataset({ version: '3.0.0' }), /unsupported/);
});

test('v2 dataset validation enforces roles, exclusive fields, references, ordering, and digest', async () => {
  const loaded = await loadMigrationEvaluationDatasetV2();
  const missingRole = coreV2(loaded);
  delete missingRole.cases[0].role;
  assert.throws(() => validateMigrationEvaluationDatasetV2(missingRole, loaded.legacyDataset), /schema validation/);

  const incompatible = coreV2(loaded);
  const live = incompatible.cases.find((item) => item.role === 'LIVE_QUALITY');
  live.recordedSource = { kind: 'BASE_RESPONSE' };
  assert.throws(() => validateMigrationEvaluationDatasetV2(incompatible, loaded.legacyDataset), /incompatible/);

  const duplicate = coreV2(loaded);
  duplicate.cases[1].id = duplicate.cases[0].id;
  assert.throws(() => validateMigrationEvaluationDatasetV2(duplicate, loaded.legacyDataset), /duplicate/);

  const unordered = coreV2(loaded);
  unordered.cases.reverse();
  assert.throws(() => validateMigrationEvaluationDatasetV2(unordered, loaded.legacyDataset), /stable lexical/);

  const unknownBase = coreV2(loaded);
  unknownBase.cases[0].baseCaseId = 'missing';
  assert.throws(() => validateMigrationEvaluationDatasetV2(unknownBase, loaded.legacyDataset), /unknown base case/);
});

test('atomic action criteria separate support from specificity and fail closed', async () => {
  const dataset = await loadMigrationEvaluationDatasetV2();
  const criteria = explicitCriteria(dataset);
  assert.equal(validateMigrationActionCriteria(criteria), criteria);

  const exact = evaluateMigrationActionInstruction('Replace oldOption with newOption for 2.0.0.', criteria);
  assert.equal(exact.supportStatus, 'SUPPORTED');
  assert.equal(exact.specificity.status, 'SPECIFIC');

  const vague = evaluateMigrationActionInstruction(
    'Update the renamed application configuration option as directed for 2.0.0.', criteria
  );
  assert.equal(vague.supportStatus, 'SUPPORTED');
  assert.equal(vague.specificity.status, 'LOW_SPECIFICITY');
  assert.equal(vague.specificity.identifierSpecific, false);

  assert.equal(evaluateMigrationActionInstruction(
    'Replace oldOption with newOption and delete stored data for 2.0.0.', criteria
  ).supportStatus, 'UNSUPPORTED');
  assert.equal(evaluateMigrationActionInstruction(
    'Replace oldOption with inventedApi for 2.0.0.', criteria
  ).supportStatus, 'UNSUPPORTED');
  assert.equal(evaluateMigrationActionInstruction(
    'Replace oldOption with newOption for 3.0.0.', criteria
  ).reasonCode, 'WRONG_VERSION_SCOPE');
  assert.equal(evaluateMigrationActionInstruction(
    'Review the application configuration for 2.0.0.', criteria
  ).supportStatus, 'AMBIGUOUS');
  assert.equal(evaluateMigrationActionInstruction(
    'You must replace oldOption with newOption for 2.0.0.', criteria
  ).reasonCode, 'MODALITY_EXPANSION');
});

test('v2 fake runner routes roles without provider calls and exposes role-specific metrics', async () => {
  const report = await runMigrationEvaluationV2({ generatedAt });
  assert.equal(report.metrics.runtime.providerRequestCount, 0);
  assert.equal(report.metrics.metrics.actionSupportPrecision.value, 1);
  assert.equal(report.metrics.metrics.actionSpecificityRate.value, 1);
  assert.equal(report.metrics.metrics.publishedUnsupportedActionRate.value, 0);
  assert.equal(report.metrics.metrics.liveProviderCompletionRate.value, 1);
  assert.equal(report.metrics.metrics.unsafeCandidateContainmentRate.denominator, 17);
  assert.equal(report.metrics.metrics.injectedFailureFallbackRate.value, 1);
  assert.equal(report.metrics.metrics.recordedSafeCandidateAcceptanceRate.value, 0);
  assert.equal(Object.values(report.metrics.metrics).every((item) => (
    Object.hasOwn(item, 'caseRole') && Object.hasOwn(item, 'applicableCaseCount')
  )), true);
  assert.equal(report.qualification.verdict, 'NOT_QUALIFIED');
  assert.deepEqual(report.metrics.criticalGates.filter((item) => !item.passed).map((item) => item.id), [
    'NO_PUBLISHED_INVENTED_IDENTIFIER',
    'ALL_RECORDED_UNSAFE_CANDIDATES_CONTAINED'
  ]);
});

test('real mode calls the injected provider only for LIVE_QUALITY cases', async () => {
  const dataset = await loadMigrationEvaluationDatasetV2();
  const runtime = liveRuntime(dataset);
  const report = await runMigrationEvaluationV2({
    dataset,
    mode: 'real',
    runtime,
    runtimeMetadata: { provider: 'provider-v2', model: 'model-v2', adapter: 'test' },
    generatedAt
  });
  assert.equal(runtime.calls.length, 7);
  assert.equal(report.metrics.runtime.providerRequestCount, 7);
  assert.equal(report.cases.filter((item) => item.role === 'RECORDED_CONTAINMENT').length, 18);
  assert.equal(report.cases.filter((item) => item.role === 'INJECTED_FAILURE').length, 3);
});

test('unsupported and ambiguous published live actions fail critical gates', async () => {
  const dataset = await loadMigrationEvaluationDatasetV2();
  for (const [instruction, gate] of [
    ['Delete stored data during migration.', 'NO_PUBLISHED_UNSUPPORTED_ACTION'],
    ['Review the application configuration for 2.0.0.', 'NO_PUBLISHED_AMBIGUOUS_ACTION']
  ]) {
    const runtime = liveRuntime(dataset, {
      'generic/explicit-action': explicitCandidate(dataset, instruction)
    });
    const report = await runMigrationEvaluationV2({
      dataset,
      mode: 'real',
      runtime,
      runtimeMetadata: { provider: 'provider-v2', model: 'model-v2', adapter: 'test' },
      generatedAt
    });
    assert.equal(report.qualification.verdict, 'NOT_QUALIFIED');
    assert.equal(report.metrics.criticalGates.find((item) => item.id === gate).passed, false);
  }
});

test('specificity is independent from support and can create a quality limitation', async () => {
  const baseline = await runMigrationEvaluationV2({ generatedAt });
  const metrics = passingMetrics(baseline.metrics);
  metrics.metrics.actionSpecificityRate = {
    ...metrics.metrics.actionSpecificityRate,
    value: 0.5,
    numerator: 2,
    denominator: 4
  };
  metrics.metrics.recordedSafeCandidateAcceptanceRate = {
    ...metrics.metrics.recordedSafeCandidateAcceptanceRate,
    value: 1,
    numerator: 1,
    denominator: 1
  };
  metrics.runtime.recordedSafeFalseRejectionCount = 0;
  const qualification = qualifyMigrationPlanningRuntimeV2({
    dataset: baseline.dataset,
    metrics,
    runtime: {
      mode: 'real', provider: 'provider-v2', model: 'model-v2', adapter: 'test',
      observedProviders: ['provider-v2'], observedModels: ['model-v2']
    },
    generatedAt
  });
  assert.equal(qualification.verdict, 'QUALIFIED_WITH_LIMITATIONS');
  assert.equal(qualification.limitations.some((item) => (
    item.code === 'QUALITY_THRESHOLD_NOT_MET' && item.metric === 'actionSpecificityRate'
  )), true);
});

test('criteria identity is explicit and any criteria or dataset change invalidates qualification', async () => {
  const report = await runMigrationEvaluationV2({ generatedAt });
  const identity = report.qualification.identity;
  assert.equal(identity.evaluationCriteriaId, MIGRATION_ACTION_EVALUATION_CRITERIA_ID);
  assert.equal(identity.evaluationCriteriaVersion, MIGRATION_ACTION_EVALUATION_CRITERIA_VERSION);
  assert.equal(identity.evaluationCriteriaDigest, migrationActionEvaluationCriteriaDigest());
  const changed = qualifyMigrationPlanningRuntimeV2({
    dataset: report.dataset,
    metrics: report.metrics,
    runtime: report.runtime,
    generatedAt,
    criteriaDigest: `sha256:${'f'.repeat(64)}`
  });
  assert.notEqual(changed.qualificationId, report.qualification.qualificationId);
  assert.notEqual(report.dataset.datasetDigest, V1_DATASET_DIGEST);
});

test('insufficient live coverage is distinct and fake evidence never qualifies a real provider', async () => {
  const baseline = await runMigrationEvaluationV2({ generatedAt });
  const metrics = passingMetrics(baseline.metrics);
  metrics.coverage.liveActionableCases = 1;
  metrics.metrics.recordedSafeCandidateAcceptanceRate = {
    ...metrics.metrics.recordedSafeCandidateAcceptanceRate, value: 1, numerator: 1
  };
  metrics.runtime.recordedSafeFalseRejectionCount = 0;
  const result = qualifyMigrationPlanningRuntimeV2({
    dataset: baseline.dataset,
    metrics,
    runtime: {
      mode: 'real', provider: 'provider-v2', model: 'model-v2', adapter: 'test',
      observedProviders: ['provider-v2'], observedModels: ['model-v2']
    },
    generatedAt
  });
  assert.equal(result.verdict, 'INSUFFICIENT_EVIDENCE');
  assert.equal(baseline.qualification.limitations.some((item) => item.code === 'FAKE_RUNTIME_ONLY'), true);

  const incomplete = passingMetrics(baseline.metrics);
  incomplete.metrics.recordedSafeCandidateAcceptanceRate = {
    ...incomplete.metrics.recordedSafeCandidateAcceptanceRate, value: 1, numerator: 1
  };
  incomplete.runtime.recordedSafeFalseRejectionCount = 0;
  incomplete.runtime.liveUnexpectedFailureCount = 1;
  const incompleteQualification = qualifyMigrationPlanningRuntimeV2({
    dataset: baseline.dataset,
    metrics: incomplete,
    runtime: {
      mode: 'real', provider: 'provider-v2', model: 'model-v2', adapter: 'test',
      observedProviders: ['provider-v2'], observedModels: ['model-v2']
    },
    generatedAt
  });
  assert.equal(incompleteQualification.verdict, 'INSUFFICIENT_EVIDENCE');
  assert.equal(incompleteQualification.limitations.some((item) => (
    item.code === 'INCOMPLETE_PROVIDER_RUN'
  )), true);
});

test('failure retention is bounded, sanitized, optional, and excludes raw provider structures', async () => {
  const dataset = await loadMigrationEvaluationDatasetV2();
  const vague = explicitCandidate(
    dataset,
    'Update the renamed application configuration option as directed for 2.0.0.'
  );
  const runtime = liveRuntime(dataset, { 'generic/explicit-action': vague });
  const retained = await runMigrationEvaluationV2({
    dataset,
    mode: 'real',
    runtime,
    runtimeMetadata: { provider: 'provider-v2', model: 'model-v2', adapter: 'test' },
    generatedAt
  });
  const details = retained.scorecard.retainedFailureDetails;
  assert.equal(details.length, 1);
  assert.equal(details[0].comparatorResult, 'SUPPORTED');
  assert.equal(retained.metrics.metrics.actionSupportPrecision.value, 1);
  assert.equal(retained.metrics.metrics.publishedUnsupportedActionRate.value, 0);
  assert.equal(retained.metrics.metrics.actionSpecificityRate.value < 1, true);
  assert.equal(details[0].instruction.length <= 300, true);
  assert.equal(details[0].evidence[0].excerpt.length <= 160, true);
  assert.doesNotMatch(JSON.stringify(details), /rawEnvelope|systemPrompt|userPrompt|reasoning|authorization|\/Users\//);

  const disabled = await runMigrationEvaluationV2({
    dataset,
    mode: 'real',
    runtime: liveRuntime(dataset, { 'generic/explicit-action': vague }),
    runtimeMetadata: { provider: 'provider-v2', model: 'model-v2', adapter: 'test' },
    generatedAt,
    retainFailureDetails: false
  });
  assert.equal(disabled.scorecard.retainedFailureDetails.length, 0);
});

test('zero denominators are null and scorecard is deterministic and sectioned', async () => {
  const empty = computeMigrationEvaluationMetricsV2([]);
  assert.equal(empty.metrics.actionSupportPrecision.value, null);
  assert.equal(empty.metrics.actionSupportPrecision.denominator, 0);
  const first = await runMigrationEvaluationV2({ generatedAt });
  const second = await runMigrationEvaluationV2({ generatedAt });
  assert.deepEqual(first, second);
  const rendered = renderMigrationEvaluationScorecardV2(first.scorecard);
  assert.match(rendered, /Live Provider Quality/);
  assert.match(rendered, /Trust Containment/);
  assert.match(rendered, /Runtime Failure Handling/);
  assert.match(rendered, /Shared Invariants/);
  assert.doesNotMatch(rendered, /aggregate score/i);
});
