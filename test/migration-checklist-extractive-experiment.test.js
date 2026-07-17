import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import * as publicApi from '../src/index.js';
import {
  EXTRACTIVE_CANDIDATE_CONTRACT,
  EXTRACTIVE_PRESENTATION_PREFIX,
  ExtractiveContractError,
  buildExtractiveExperimentPrompt,
  validateAndRenderExtractiveCandidate,
  validateExtractiveCandidate
} from '../eval/migration-planning/experiments/extractive-contract/contract.js';
import {
  buildExtractiveFixture,
  extractiveCriteriaForCase
} from '../eval/migration-planning/experiments/extractive-contract/fixtures.js';
import {
  EXTRACTIVE_ADOPTION_CRITERIA,
  runExtractiveContractExperiment,
  serializeExtractiveContractExperiment
} from '../eval/migration-planning/experiments/extractive-contract/runner.js';
import {
  evaluateMigrationActionInstruction,
  loadMigrationEvaluationDatasetV2
} from '../src/index.js';
import { buildMigrationEvaluationContext } from '../src/migration-checklist/evaluation/dataset.js';

const generatedAt = '2026-07-17T00:00:00.000Z';
const V1_FILE_DIGEST = '339ba3196dcf714b26f15c62295c09d475e5db0bce4b9b2d6fe1aaef454d9860';
const V2_DATASET_DIGEST = 'sha256:c15089381612671c62c3b565d93ad4f5dff1705317ee9622d9ee12a68028d407';

function candidate(ref, excerpt) {
  return {
    status: 'ACTIONABLE',
    actions: [{ evidenceRef: ref, actionExcerpt: excerpt }],
    abstentionReason: null
  };
}

function abstain(reason = 'NO_EXPLICIT_ACTION') {
  return { status: 'ABSTAIN', actions: [], abstentionReason: reason };
}

async function explicitFixture() {
  const dataset = await loadMigrationEvaluationDatasetV2();
  const goldenCase = dataset.cases.find((item) => item.id === 'generic/explicit-action');
  return { dataset, goldenCase, ...buildExtractiveFixture(dataset, goldenCase) };
}

function expectContractError(fn, detailCode) {
  assert.throws(fn, (error) => (
    error instanceof ExtractiveContractError && error.detailCode === detailCode
  ));
}

test('experimental schema accepts actionable and abstention candidates only', async () => {
  const { context } = await explicitFixture();
  const ref = context.evidence[0].id;
  const excerpt = context.evidence[0].content;
  assert.equal(validateExtractiveCandidate(candidate(ref, excerpt)).status, 'ACTIONABLE');
  assert.equal(validateExtractiveCandidate(JSON.stringify(abstain())).status, 'ABSTAIN');
  assert.equal(EXTRACTIVE_CANDIDATE_CONTRACT,
    'migration-checklist-extractive-candidate.experimental.v1');

  for (const invalid of [
    { ...candidate(ref, excerpt), instruction: 'Model-owned instruction.' },
    { ...candidate(ref, excerpt), packageId: 'npm:owned' },
    { ...candidate(ref, excerpt), findingId: 'owned' },
    { ...candidate(ref, excerpt), status: 'COMPLETE' },
    { ...candidate(ref, excerpt), location: 'src/App.tsx' },
    { ...candidate(ref, excerpt), requiresHumanReview: false },
    { status: 'ACTIONABLE', actions: [], abstentionReason: null },
    { status: 'ABSTAIN', actions: [candidate(ref, excerpt).actions[0]], abstentionReason: 'NO_EXPLICIT_ACTION' },
    { status: 'ABSTAIN', actions: [], abstentionReason: null },
    { ...candidate(ref, excerpt), actions: Array.from({ length: 5 }, () => ({ evidenceRef: ref, actionExcerpt: excerpt })) },
    candidate(ref, 'x'.repeat(501)),
    { ...candidate(ref, excerpt), actions: [{ evidenceRef: ref, actionExcerpt: excerpt, instruction: 'owned' }] },
    { ...candidate(ref, excerpt), actions: [{ evidenceRef: ref, actionExcerpt: excerpt, url: 'https://example.test' }] },
    { ...candidate(ref, excerpt), actions: [{ evidenceRef: ref, actionExcerpt: excerpt, file: 'src/App.tsx' }] },
    { ...candidate(ref, excerpt), actions: [{ evidenceRef: ref, actionExcerpt: excerpt, command: 'npm install x' }] }
  ]) assert.throws(() => validateExtractiveCandidate(invalid));
});

test('experimental prompt requests verbatim selection and excludes production-owned data', async () => {
  const fixture = await explicitFixture();
  const context = structuredClone(fixture.context);
  context.providerConfig = { apiKey: 'secret-value' };
  context.repositorySource = 'private source';
  const prompt = buildExtractiveExperimentPrompt(context);
  assert.match(prompt.system, /select verbatim migration action spans/i);
  assert.match(prompt.system, /Do not write a final checklist instruction/i);
  assert.match(prompt.user, /Do not paraphrase, merge evidence, add identifiers or flags/i);
  assert.match(prompt.user, /Return ABSTAIN/);
  assert.doesNotMatch(prompt.user, /secret-value|private source|sourceUrl|positiveCandidateLocations/);
});

test('exact-span validation accepts the same evidence and line-ending normalization only', async () => {
  const { context, criteria } = await explicitFixture();
  const ref = context.evidence[0].id;
  const exact = context.evidence[0].content;
  const generated = validateAndRenderExtractiveCandidate(candidate(ref, exact), context, criteria);
  assert.equal(generated.outcome, 'GENERATED');
  assert.equal(generated.actions[0].actionExcerpt, exact);

  const crlfContext = structuredClone(context);
  crlfContext.evidence[0].content = exact.replace(', ', ',\r\n');
  const lfExcerpt = crlfContext.evidence[0].content.replace(/\r\n/g, '\n');
  const normalized = validateAndRenderExtractiveCandidate(
    candidate(ref, lfExcerpt), crlfContext, criteria
  );
  assert.equal(normalized.actions[0].actionExcerpt.includes('\r'), false);
});

test('exact-span validation rejects paraphrase, cross-record text, unknown ref, and duplicates', async () => {
  const dataset = await loadMigrationEvaluationDatasetV2();
  const multiCase = dataset.cases.find((item) => item.id === 'node/multi-action');
  const fixture = buildExtractiveFixture(dataset, multiCase);
  const [first, second] = fixture.context.evidence;
  expectContractError(() => validateAndRenderExtractiveCandidate(
    candidate(first.id, 'Replace the old option with the new option.'),
    fixture.context,
    fixture.criteria
  ), 'EXCERPT_NOT_EXACT');
  expectContractError(() => validateAndRenderExtractiveCandidate(
    candidate(first.id, second.content), fixture.context, fixture.criteria
  ), 'EXCERPT_NOT_EXACT');
  expectContractError(() => validateAndRenderExtractiveCandidate(
    candidate(`sha256:${'9'.repeat(64)}`, first.content), fixture.context, fixture.criteria
  ), 'UNKNOWN_EVIDENCE_REFERENCE');
  expectContractError(() => validateAndRenderExtractiveCandidate({
    status: 'ACTIONABLE',
    actions: [
      { evidenceRef: first.id, actionExcerpt: first.content },
      { evidenceRef: first.id, actionExcerpt: first.content }
    ],
    abstentionReason: null
  }, fixture.context, fixture.criteria), 'DUPLICATE_EVIDENCE_SPAN');
});

test('known invented flag and plain-language unsupported action fail exact membership', async () => {
  const dataset = await loadMigrationEvaluationDatasetV2();
  for (const id of ['containment/invented-flag', 'containment/semantic-unsupported']) {
    const goldenCase = dataset.cases.find((item) => item.id === id);
    const fixture = buildExtractiveFixture(dataset, goldenCase);
    expectContractError(() => validateAndRenderExtractiveCandidate(
      fixture.output, fixture.context, fixture.criteria
    ), 'EXCERPT_NOT_EXACT');
  }
});

test('action criteria reject descriptive, forbidden, mixed, and wrong-version exact spans', async () => {
  const { context, criteria } = await explicitFixture();
  assert.equal(evaluateMigrationActionInstruction(
    'Review the application configuration for 2.0.0.', criteria
  ).supportStatus, 'AMBIGUOUS');
  assert.equal(evaluateMigrationActionInstruction(context.evidence[0].content, criteria).supportStatus,
    'SUPPORTED');

  for (const [content, detailCode] of [
    ['For 2.0.0, replace `oldOption` with `newOption` and delete stored data.', 'FORBIDDEN_EXPANSION'],
    ['For 3.0.0, replace `oldOption` with `newOption`.', 'WRONG_VERSION_SCOPE'],
    ['Review the application configuration for 2.0.0.', 'NO_ACCEPTABLE_ACTION_PATTERN']
  ]) {
    const changed = structuredClone(context);
    changed.evidence[0].content = content;
    expectContractError(() => validateAndRenderExtractiveCandidate(
      candidate(changed.evidence[0].id, content), changed, criteria
    ), detailCode);
  }
});

test('deterministic presentation retains exact text and deterministic ownership', async () => {
  const dataset = await loadMigrationEvaluationDatasetV2();
  const goldenCase = dataset.cases.find((item) => item.id === 'node/multi-action');
  const fixture = buildExtractiveFixture(dataset, goldenCase);
  const first = validateAndRenderExtractiveCandidate(
    fixture.output, fixture.context, fixture.criteria
  );
  const second = validateAndRenderExtractiveCandidate(
    structuredClone(fixture.output), structuredClone(fixture.context), structuredClone(fixture.criteria)
  );
  assert.deepEqual(first, second);
  assert.equal(first.actions.length, 2);
  assert.ok(first.actions.every((item) => item.instruction
    === `${EXTRACTIVE_PRESENTATION_PREFIX}${item.actionExcerpt}`));
  assert.ok(first.actions.every((item) => item.requiresHumanReview === true));
  assert.ok(first.actions.every((item) => item.candidateLocations.length === 0));
  assert.deepEqual(first.positiveCandidateLocations, fixture.context.positiveCandidateLocations);
  assert.doesNotMatch(first.actions.map((item) => item.instruction).join('\n'), /For npm package/i);
});

test('official command-like exact spans keep the current content-guard limitation', async () => {
  const { context } = await explicitFixture();
  const commandContext = structuredClone(context);
  commandContext.evidence[0].content = 'Run npm install config-kit for version 2.0.0.';
  const criteria = {
    actions: [{
      id: 'run-install',
      acceptablePatterns: [{ allOf: ['npm install', 'config-kit'], anyActionVerb: ['run'] }],
      specificity: {
        actionVerbs: ['run'], sourceIdentifiers: [], targetIdentifiers: [], objectAnchors: ['config-kit']
      }
    }],
    forbiddenExpansions: [],
    forbiddenModalities: [],
    allowedVersions: ['2.0.0']
  };
  expectContractError(() => validateAndRenderExtractiveCandidate(
    candidate(commandContext.evidence[0].id, commandContext.evidence[0].content),
    commandContext,
    criteria
  ), 'COMMAND_NOT_ALLOWED');
});

test('fixture adapter is role-routed, local, and never needs a provider', async () => {
  const dataset = await loadMigrationEvaluationDatasetV2();
  const roles = Object.fromEntries(['LIVE_QUALITY', 'RECORDED_CONTAINMENT', 'INJECTED_FAILURE']
    .map((role) => [role, dataset.cases.filter((item) => item.role === role).length]));
  assert.deepEqual(roles, { LIVE_QUALITY: 7, RECORDED_CONTAINMENT: 18, INJECTED_FAILURE: 3 });

  const live = dataset.cases.find((item) => item.role === 'LIVE_QUALITY');
  const recorded = dataset.cases.find((item) => item.role === 'RECORDED_CONTAINMENT');
  const injected = dataset.cases.find((item) => item.id === 'failure/provider-timeout');
  assert.equal(buildExtractiveFixture(dataset, live).runtimeErrorCode, null);
  assert.equal(buildExtractiveFixture(dataset, recorded).runtimeErrorCode, null);
  assert.equal(buildExtractiveFixture(dataset, injected).runtimeErrorCode, 'TIMEOUT');
  assert.ok(extractiveCriteriaForCase(dataset, recorded).actions.length > 0);
});

test('extractive experiment passes critical containment and user-value criteria', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Network must not be called.');
  };
  try {
    const report = await runExtractiveContractExperiment({ generatedAt });
    const metrics = report.comparison.extractive.metrics;
    assert.equal(report.providerRequestCount, 0);
    assert.equal(fetchCalls, 0);
    assert.equal(metrics.actionSupportPrecision.value, 1);
    assert.equal(metrics.actionSpecificityRate.value, 1);
    assert.equal(metrics.unsafeCandidateContainmentRate.value, 1);
    assert.equal(metrics.inventedIdentifierContainmentRate.value, 1);
    assert.equal(metrics.prohibitedCapabilityContainmentRate.value, 1);
    assert.equal(metrics.recordedSafeCandidateAcceptanceRate.value, 1);
    assert.equal(metrics.injectedFailureContainmentRate.value, 1);
    assert.equal(metrics.identityLocationHumanReviewRate.value, 1);
    assert.equal(metrics.deterministicReplayRate.value, 1);
    assert.equal(report.userValue.retainedActionCount, 5);
    assert.equal(report.userValue.actionVerbRetentionRate.value, 1);
    assert.equal(report.userValue.sourceIdentifierCoverageRate.value, 1);
    assert.equal(report.userValue.targetIdentifierCoverageRate.value, 1);
    assert.equal(report.userValue.duplicateActionRate.value, 0);
    assert.ok(Object.values(report.userValue.manualFixtureReview).every(Boolean));
    assert.ok(report.adoptionCriteria.every((item) => item.passed));
    assert.equal(report.verdict, 'ADOPT_EXTRACTIVE_CONTRACT');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('critical cases contain unsafe spans and accept the safe npm evidence span', async () => {
  const report = await runExtractiveContractExperiment({ generatedAt });
  assert.deepEqual(report.criticalCases.inventedLeadingDashFlag, {
    id: 'containment/invented-flag',
    role: 'RECORDED_CONTAINMENT',
    rawOutcome: 'ACTIONABLE',
    publishedOutcome: 'REJECTED',
    reasonCode: 'ACTION_EXCERPT_INVALID',
    detailCode: 'EXCERPT_NOT_EXACT',
    publishedActionCount: 0,
    passed: true
  });
  assert.equal(report.criticalCases.plainLanguageUnsupportedAction.publishedActionCount, 0);
  assert.equal(report.criticalCases.safeNpmProse.publishedOutcome, 'GENERATED');
  assert.equal(report.criticalCases.safeNpmProse.publishedActionCount, 1);
});

test('free-form GR-02 baseline remains unchanged in the comparison', async () => {
  const report = await runExtractiveContractExperiment({ generatedAt });
  const baseline = report.comparison.freeForm;
  assert.equal(baseline.identity.datasetDigest, V2_DATASET_DIGEST);
  assert.equal(baseline.metrics.actionSupportPrecision.numerator, 5);
  assert.equal(baseline.metrics.actionSupportPrecision.denominator, 5);
  assert.equal(baseline.metrics.unsafeCandidateContainmentRate.numerator, 15);
  assert.equal(baseline.metrics.unsafeCandidateContainmentRate.denominator, 17);
  assert.equal(baseline.metrics.recordedSafeCandidateAcceptanceRate.numerator, 0);
  assert.equal(baseline.metrics.recordedSafeCandidateAcceptanceRate.denominator, 1);
  assert.equal(baseline.verdict, 'NOT_QUALIFIED');
  assert.deepEqual(baseline.failedCriticalGates.map((item) => item.id), [
    'NO_PUBLISHED_INVENTED_IDENTIFIER',
    'ALL_RECORDED_UNSAFE_CANDIDATES_CONTAINED'
  ]);
});

test('experiment output is deterministic, bounded, sanitized, and presentation-only', async () => {
  const first = await runExtractiveContractExperiment({ generatedAt });
  const second = await runExtractiveContractExperiment({ generatedAt });
  assert.deepEqual(first, second);
  const serialized = serializeExtractiveContractExperiment(first);
  assert.equal(serialized, serializeExtractiveContractExperiment(second));
  assert.doesNotMatch(serialized,
    /rawEnvelope|systemPrompt|userPrompt|authorization|api[_-]?key|chain-of-thought|\/Users\//i);
  assert.ok(first.cases.every((item) => !Object.hasOwn(item, 'candidate')));
  assert.deepEqual(EXTRACTIVE_ADOPTION_CRITERIA.map((item) => item.threshold), [
    0, 0, 1, 1, 1, 1, 1, 1, 1, 0.8, 0.9, 0.85, 0.85, 0.7, 0.6
  ]);
});

test('GR-03 keeps datasets immutable and experiment-only APIs remain private', async () => {
  const bytes = await readFile(new URL('../eval/migration-planning/golden-dataset.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), V1_FILE_DIGEST);
  const dataset = await loadMigrationEvaluationDatasetV2();
  assert.equal(dataset.datasetDigest, V2_DATASET_DIGEST);
  assert.ok(Object.keys(publicApi).includes('validateMigrationExtractiveCandidate'));
  assert.deepEqual(Object.keys(publicApi).filter((name) => (
    /ExtractiveContractExperiment|ExtractiveExperiment/i.test(name)
  )), []);
});
