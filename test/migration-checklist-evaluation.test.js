import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AiRuntimeError,
  MIGRATION_QUALIFICATION_POLICY,
  buildMigrationEvaluationContext,
  computeMigrationEvaluationMetrics,
  createMigrationGoldenFakeRuntime,
  loadMigrationEvaluationDataset,
  migrationEvaluationDatasetDigest,
  migrationQualificationPolicyDigest,
  qualifyMigrationPlanningRuntime,
  renderMigrationEvaluationScorecard,
  runMigrationEvaluation,
  validateMigrationEvaluationDataset
} from '../src/index.js';

const generatedAt = '2026-07-16T00:00:00.000Z';

function core(dataset) {
  return {
    schemaVersion: dataset.schemaVersion,
    datasetId: dataset.datasetId,
    task: dataset.task,
    cases: structuredClone(dataset.cases)
  };
}

function datasetIdentity(report) {
  return report.dataset;
}

function realIdentity(overrides = {}) {
  return {
    mode: 'real',
    provider: 'provider-a',
    model: 'model-a',
    adapter: 'test-adapter',
    observedProviders: ['provider-a'],
    observedModels: ['model-a'],
    ...overrides
  };
}

function cloneMetrics(report) {
  return structuredClone(report.metrics);
}

test('migration dataset loads with strict identity, coverage, stable ordering, and digest', async () => {
  const loaded = await loadMigrationEvaluationDataset();
  const value = core(loaded);
  assert.equal(loaded.schemaVersion, '1.0.0');
  assert.equal(loaded.datasetId, 'migration-planning-golden');
  assert.equal(loaded.task, 'migration-planning.v1');
  assert.equal(loaded.cases.length, 10);
  assert.deepEqual(loaded.cases.map((item) => item.id), [...loaded.cases]
    .map((item) => item.id).sort());
  assert.equal(migrationEvaluationDatasetDigest(value), loaded.datasetDigest);
  assert.equal(migrationEvaluationDatasetDigest(structuredClone(value)), loaded.datasetDigest);
  assert.deepEqual([...new Set(loaded.cases.map((item) => item.ecosystem))].sort(), [
    'generic', 'node', 'python'
  ]);
});

test('migration dataset rejects duplicate IDs, unknown refs/locations, outcome mismatches, and unstable order', async () => {
  const loaded = await loadMigrationEvaluationDataset();

  const duplicate = core(loaded);
  duplicate.cases[1].id = duplicate.cases[0].id;
  assert.throws(() => validateMigrationEvaluationDataset(duplicate), /duplicate case id/);

  const unknownRef = core(loaded);
  unknownRef.cases[0].expected.evidenceRefs = [`sha256:${'f'.repeat(64)}`];
  assert.throws(() => validateMigrationEvaluationDataset(unknownRef), /unknown evidence ref/);

  const badLocation = core(loaded);
  const locationCase = badLocation.cases.find((item) => item.fixture.locations.length > 0);
  locationCase.expected.locations[0].file = 'src/other.ts';
  assert.throws(() => validateMigrationEvaluationDataset(badLocation), /expected locations/);

  const outcome = core(loaded);
  outcome.cases[0].expected.finalOutcome = 'generated';
  assert.throws(() => validateMigrationEvaluationDataset(outcome), /finalOutcome is inconsistent/);

  const unordered = core(loaded);
  unordered.cases.reverse();
  assert.throws(() => validateMigrationEvaluationDataset(unordered), /stable lexical ordering/);
});

test('fake evaluation separates grounded, abstention, invalid, unsafe, trust, and published outcomes', async () => {
  const report = await runMigrationEvaluation({ generatedAt });
  assert.equal(report.cases.length, 10);
  assert.ok(report.cases.every((item) => item.passed));
  assert.deepEqual(report.cases.map((item) => item.id), [...report.cases]
    .map((item) => item.id).sort());

  const grounded = report.cases.find((item) => item.id === 'generic/explicit-action');
  assert.equal(grounded.raw.outcome, 'ACTIONABLE');
  assert.equal(grounded.raw.supportedActionItemCount, 1);
  assert.equal(grounded.raw.exactExcerptItemCount, 1);
  assert.equal(grounded.published.outcome, 'generated');

  const abstained = report.cases.find((item) => item.id === 'node/no-action-breaking');
  assert.equal(abstained.raw.outcome, 'ABSTAIN');
  assert.equal(abstained.published.aiItemCount, 0);

  const invalid = report.cases.find((item) => item.id === 'generic/invalid-json');
  assert.equal(invalid.raw.outcome, 'INVALID');
  assert.equal(invalid.published.outcome, 'rejected');

  const unsafe = report.cases.find((item) => item.id === 'node/whole-candidate-rejection');
  assert.equal(unsafe.raw.inventedIdentifierAttemptCount, 1);
  assert.equal(unsafe.raw.trustDecision, 'REJECTED');
  assert.equal(unsafe.published.aiItemCount, 0);
  assert.equal(report.metrics.metrics.unsafeCandidateContainmentRate.value, 1);
  assert.equal(report.metrics.metrics.publishedUnsupportedActionRate.value, 0);
});

test('metrics preserve numerator/denominator semantics, multi-ecosystem aggregation, and null zero denominators', async () => {
  const report = await runMigrationEvaluation({ generatedAt });
  const metrics = report.metrics;
  assert.deepEqual(metrics.metrics.stepEvidenceReferencePrecision, {
    value: 1, numerator: 5, denominator: 5
  });
  assert.equal(metrics.metrics.unsupportedActionRate.numerator, 1);
  assert.equal(metrics.metrics.unsupportedActionRate.denominator, 7);
  assert.equal(metrics.metrics.wholeCandidateRejectionRate.numerator, 1);
  assert.equal(metrics.runtime.schemaFailureCount, 1);
  assert.equal(metrics.runtime.failed, 1);
  assert.equal(metrics.runtime.unexpectedFailureCount, 0);
  assert.equal(metrics.runtime.packageLocalIsolationCorrect, true);
  assert.deepEqual(metrics.coverage.ecosystems, ['generic', 'node', 'python']);
  assert.deepEqual(metrics.coverage.casesByEcosystem, { generic: 5, node: 3, python: 2 });
  assert.deepEqual(metrics.coverage.scenarioGroups, {
    abstention: 3,
    adversarial: 1,
    failure: 2,
    'grounded-action': 2,
    'policy-preservation': 2
  });

  const empty = computeMigrationEvaluationMetrics([]);
  assert.deepEqual(empty.metrics.actionSupportPrecision, {
    value: null, numerator: 0, denominator: 0
  });
  assert.deepEqual(empty.metrics.abstentionPrecision, {
    value: null, numerator: 0, denominator: 0
  });
});

test('false/missed abstention and unsupported semantic action are measured without conflating published containment', async () => {
  const report = await runMigrationEvaluation({ generatedAt });
  const cases = structuredClone(report.cases);
  const falseAbstain = cases.find((item) => item.id === 'generic/explicit-action');
  falseAbstain.raw.outcome = 'ABSTAIN';
  const missedAbstain = cases.find((item) => item.id === 'generic/ambiguous-evidence');
  missedAbstain.raw.outcome = 'ACTIONABLE';
  missedAbstain.raw.itemCount = 1;
  missedAbstain.raw.unsupportedActionItemCount = 1;
  missedAbstain.published.aiItemCount = 0;
  const metrics = computeMigrationEvaluationMetrics(cases);
  assert.equal(metrics.metrics.falseAbstentionRate.numerator, 1);
  assert.equal(metrics.metrics.missedAbstentionRate.numerator, 1);
  assert.equal(metrics.metrics.unsupportedActionRate.numerator, 2);
  assert.equal(metrics.metrics.publishedUnsupportedActionRate.numerator, 0);
});

test('unsafe published instruction is a critical failure independent of aggregate quality', async () => {
  const report = await runMigrationEvaluation({ generatedAt });
  const cases = structuredClone(report.cases);
  const leaked = cases.find((item) => item.id === 'generic/ambiguous-evidence');
  leaked.published.outcome = 'generated';
  leaked.published.aiItemCount = 1;
  leaked.published.unsupportedActionItemCount = 1;
  leaked.published.inventedIdentifierCount = 1;
  const metrics = computeMigrationEvaluationMetrics(cases);
  const gate = metrics.criticalGates.find((item) => item.id === 'NO_PUBLISHED_UNSUPPORTED_ACTION');
  assert.equal(gate.passed, false);
  assert.deepEqual(gate.violations, ['generic/ambiguous-evidence']);
  assert.equal(
    metrics.criticalGates.find((item) => item.id === 'NO_PUBLISHED_INVENTED_IDENTIFIER').passed,
    false
  );
  const qualification = qualifyMigrationPlanningRuntime({
    dataset: datasetIdentity(report), metrics, runtime: realIdentity(), generatedAt
  });
  assert.equal(qualification.verdict, 'NOT_QUALIFIED');
});

test('qualification produces all four verdicts with task-specific identity and versioned policy', async () => {
  const report = await runMigrationEvaluation({ generatedAt });
  const qualifiedMetrics = cloneMetrics(report);
  qualifiedMetrics.runtime.knownSemanticOrLexicalGapCount = 0;
  const qualified = qualifyMigrationPlanningRuntime({
    dataset: datasetIdentity(report), metrics: qualifiedMetrics,
    runtime: realIdentity(), generatedAt
  });
  assert.equal(qualified.verdict, 'QUALIFIED');

  assert.equal(report.qualification.verdict, 'QUALIFIED_WITH_LIMITATIONS');
  assert.deepEqual(report.qualification.limitations.map((item) => item.code), [
    'FAKE_RUNTIME_ONLY', 'KNOWN_SEMANTIC_OR_LEXICAL_GAPS'
  ]);

  const critical = cloneMetrics(report);
  critical.criticalGates[0].passed = false;
  critical.criticalGates[0].violations = ['case'];
  assert.equal(qualifyMigrationPlanningRuntime({
    dataset: datasetIdentity(report), metrics: critical,
    runtime: realIdentity(), generatedAt
  }).verdict, 'NOT_QUALIFIED');

  const insufficient = cloneMetrics(report);
  insufficient.coverage.actionableQualityCases = 1;
  assert.equal(qualifyMigrationPlanningRuntime({
    dataset: datasetIdentity(report), metrics: insufficient,
    runtime: realIdentity(), generatedAt
  }).verdict, 'INSUFFICIENT_EVIDENCE');

  const otherProvider = qualifyMigrationPlanningRuntime({
    dataset: datasetIdentity(report), metrics: qualifiedMetrics,
    runtime: realIdentity({ provider: 'provider-b' }), generatedAt
  });
  assert.notEqual(otherProvider.qualificationId, qualified.qualificationId);

  const changedPolicy = structuredClone(MIGRATION_QUALIFICATION_POLICY);
  changedPolicy.policyVersion = '1.0.1';
  changedPolicy.thresholds[1].value = 0.99;
  assert.notEqual(
    migrationQualificationPolicyDigest(changedPolicy),
    migrationQualificationPolicyDigest(MIGRATION_QUALIFICATION_POLICY)
  );
  const changed = qualifyMigrationPlanningRuntime({
    dataset: datasetIdentity(report), metrics: qualifiedMetrics,
    runtime: realIdentity(), generatedAt, policy: changedPolicy
  });
  assert.notEqual(changed.qualificationId, qualified.qualificationId);
});

test('policy preservation covers locations, AI ownership, review, version uncertainty, registry facts, and unsupported usage', async () => {
  const report = await runMigrationEvaluation({ generatedAt });
  const location = report.cases.find((item) => item.id === 'node/multi-action');
  assert.equal(location.preservation.locationsPreserved, true);
  assert.equal(location.preservation.aiOwnsNoLocation, true);
  assert.equal(location.preservation.humanReviewCorrect, true);

  const unknown = report.cases.find((item) => item.id === 'python/unknown-registry-action');
  assert.equal(unknown.preservation.versionUncertaintyPreserved, true);
  assert.equal(unknown.published.registryLatestRecommendationLeak, false);

  const unsupported = report.cases.find((item) => item.id === 'python/unsupported-usage-action');
  assert.equal(unsupported.published.unsupportedUsageSafetyLeak, false);
  assert.equal(unsupported.preservation.locationsPreserved, true);
});

test('runner is offline by default, real mode is explicit, and one runtime failure does not drop other cases', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('network must not be called');
  };
  try {
    const report = await runMigrationEvaluation({ generatedAt });
    assert.equal(report.cases.length, 10);
    assert.equal(fetchCalls, 0);
    await assert.rejects(
      runMigrationEvaluation({ mode: 'real', generatedAt }),
      /explicitly injected AiRuntime/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  const loaded = await loadMigrationEvaluationDataset();
  const value = core(loaded);
  const delegate = createMigrationGoldenFakeRuntime(value);
  const failedContextId = buildMigrationEvaluationContext(
    value.cases.find((item) => item.id === 'generic/explicit-action')
  ).contextId;
  const runtime = {
    async generateStructured(request) {
      if (request.contextId === failedContextId) {
        throw new AiRuntimeError('TIMEOUT', 'private provider details', { retryable: false });
      }
      return delegate.generateStructured(request);
    }
  };
  const report = await runMigrationEvaluation({ dataset: value, runtime, generatedAt });
  assert.equal(report.cases.length, 10);
  assert.equal(report.metrics.runtime.unexpectedFailureCount, 1);
  assert.equal(report.cases.find((item) => item.id === 'generic/explicit-action').published.outcome, 'failed');
  assert.equal(JSON.stringify(report).includes('private provider details'), false);
});

test('real-provider path calls only an explicit injected runtime and binds declared/observed identity', async () => {
  const loaded = await loadMigrationEvaluationDataset();
  const value = core(loaded);
  const delegate = createMigrationGoldenFakeRuntime(value);
  let calls = 0;
  const runtime = {
    async generateStructured(request) {
      calls += 1;
      const result = await delegate.generateStructured(request);
      return { ...result, provider: 'provider-a', model: 'model-a' };
    }
  };
  const report = await runMigrationEvaluation({
    dataset: value,
    mode: 'real',
    runtime,
    runtimeMetadata: {
      provider: 'provider-a', model: 'model-a', adapter: 'test-adapter'
    },
    generatedAt
  });
  assert.equal(calls, 10);
  assert.deepEqual(report.runtime.observedProviders, ['provider-a']);
  assert.deepEqual(report.runtime.observedModels, ['model-a']);
  assert.equal(report.qualification.identity.runtime.provider, 'provider-a');
  assert.equal(report.qualification.verdict, 'QUALIFIED_WITH_LIMITATIONS');
  assert.deepEqual(report.qualification.limitations.map((item) => item.code), [
    'KNOWN_SEMANTIC_OR_LEXICAL_GAPS'
  ]);

  await assert.rejects(runMigrationEvaluation({
    dataset: value,
    mode: 'real',
    runtime,
    runtimeMetadata: {
      provider: 'provider-a', model: 'model-a', adapter: 'test-adapter', apiKey: 'secret'
    },
    generatedAt
  }), /unsupported field apiKey/);
});

test('recorded fake evaluation and scorecard rendering are deterministic and presentation-only', async () => {
  const first = await runMigrationEvaluation({ generatedAt });
  const second = await runMigrationEvaluation({ generatedAt });
  assert.deepEqual(first, second);
  const before = JSON.stringify(first);
  const renderedOne = renderMigrationEvaluationScorecard(first.scorecard);
  const renderedTwo = renderMigrationEvaluationScorecard(second.scorecard);
  assert.equal(renderedOne, renderedTwo);
  assert.match(renderedOne, /QUALIFIED_WITH_LIMITATIONS/);
  assert.equal(JSON.stringify(first), before);
});
