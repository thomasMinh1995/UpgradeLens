import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIGRATION_EXTRACTIVE_CANDIDATE_CONTRACT,
  MIGRATION_EXTRACTIVE_GENERATION_RESULT_VERSION,
  MIGRATION_EXTRACTIVE_PLANNING_TASK,
  MIGRATION_EXTRACTIVE_PRESENTATION,
  MIGRATION_EXTRACTIVE_PRESENTATION_PREFIX,
  MIGRATION_EXTRACTIVE_PROMPT_VERSION,
  MIGRATION_EXTRACTIVE_TRUST_POLICY,
  buildMigrationExtractivePrompt,
  generateMigrationExtractiveChecklistForContext,
  migrationExtractiveCandidateSchemaDigest,
  migrationExtractivePromptDigest,
  trustValidateMigrationExtractiveCandidate,
  validateMigrationExtractiveCandidate
} from '../src/index.js';
import {
  buildMigrationEvaluationContext
} from '../src/migration-checklist/evaluation/dataset.js';
import {
  loadMigrationEvaluationDatasetV2
} from '../src/migration-checklist/evaluation/dataset-v2.js';
import {
  runMigrationExtractiveEvaluationV2
} from '../src/migration-checklist/evaluation/runner-v2.js';

const generatedAt = '2026-07-17T00:00:00.000Z';

function candidate(evidenceRef, actionExcerpt) {
  return {
    status: 'ACTIONABLE',
    actions: [{ evidenceRef, actionExcerpt }],
    abstentionReason: null
  };
}

async function contextFor(caseId = 'generic/explicit-action') {
  const dataset = await loadMigrationEvaluationDatasetV2();
  const item = dataset.cases.find((value) => value.id === caseId);
  const baseCase = dataset.legacyDataset.cases.find((value) => value.id === item.baseCaseId);
  return { dataset, item, context: buildMigrationEvaluationContext(baseCase) };
}

test('production extractive identities are versioned and distinct from historical v1', () => {
  assert.equal(MIGRATION_EXTRACTIVE_PLANNING_TASK, 'migration-planning.v2');
  assert.equal(MIGRATION_EXTRACTIVE_CANDIDATE_CONTRACT,
    'migration-checklist-extractive-candidate.v2');
  assert.equal(MIGRATION_EXTRACTIVE_PROMPT_VERSION, '2');
  assert.equal(MIGRATION_EXTRACTIVE_TRUST_POLICY, 'migration-checklist-trust.extractive.v2');
  assert.equal(MIGRATION_EXTRACTIVE_GENERATION_RESULT_VERSION, '2');
  assert.equal(MIGRATION_EXTRACTIVE_PRESENTATION,
    'migration-checklist-extractive-presentation.v1');
  assert.match(migrationExtractiveCandidateSchemaDigest(), /^sha256:[a-f0-9]{64}$/);
  assert.match(migrationExtractivePromptDigest(), /^sha256:[a-f0-9]{64}$/);
});

test('production candidate schema owns only selection or constrained abstention', async () => {
  const { context } = await contextFor();
  const exact = candidate(context.evidence[0].id, context.evidence[0].content);
  assert.equal(validateMigrationExtractiveCandidate(exact).status, 'ACTIONABLE');
  assert.equal(validateMigrationExtractiveCandidate(JSON.stringify({
    status: 'ABSTAIN',
    actions: [],
    abstentionReason: 'NO_EXPLICIT_ACTION'
  })).status, 'ABSTAIN');

  for (const invalid of [
    { ...exact, instruction: 'owned by model' },
    { ...exact, packageId: 'npm:owned' },
    { ...exact, actions: [{ ...exact.actions[0], file: 'src/App.tsx' }] },
    { ...exact, actions: [{ ...exact.actions[0], url: 'https://example.invalid' }] },
    { ...exact, actions: [{ ...exact.actions[0], command: 'npm install x' }] },
    { status: 'ACTIONABLE', actions: [], abstentionReason: null },
    { status: 'ABSTAIN', actions: exact.actions, abstentionReason: 'NO_EXPLICIT_ACTION' }
  ]) {
    assert.throws(() => validateMigrationExtractiveCandidate(invalid));
  }
});

test('prompt v2 is a bounded verbatim selector and exposes no production-owned output fields', async () => {
  const { context } = await contextFor();
  const prompt = buildMigrationExtractivePrompt({ context });
  assert.match(prompt.system, /bounded evidence-span selector/i);
  assert.match(prompt.user, /Copy each actionExcerpt verbatim/);
  assert.match(prompt.user, /Do not write a final checklist instruction|Do not add action verbs/);
  assert.match(prompt.user, /Return ABSTAIN/);
  assert.doesNotMatch(prompt.user, /providerConfig|apiKey|repositorySource/);
});

test('production trust accepts exact same-record spans and rejects provenance or structure violations', async () => {
  const { context } = await contextFor('node/multi-action');
  const [first, second] = context.evidence;
  const accepted = trustValidateMigrationExtractiveCandidate(
    validateMigrationExtractiveCandidate(candidate(first.id, first.content)),
    context
  );
  assert.equal(accepted.items[0].instruction,
    `${MIGRATION_EXTRACTIVE_PRESENTATION_PREFIX}${first.content}`);

  for (const invalid of [
    candidate(first.id, 'Replace the old option with the new option.'),
    candidate(first.id, second.content),
    candidate(`sha256:${'9'.repeat(64)}`, first.content),
    {
      status: 'ACTIONABLE',
      actions: [
        { evidenceRef: first.id, actionExcerpt: first.content },
        { evidenceRef: first.id, actionExcerpt: first.content }
      ],
      abstentionReason: null
    }
  ]) {
    assert.throws(() => trustValidateMigrationExtractiveCandidate(
      validateMigrationExtractiveCandidate(invalid),
      context
    ));
  }
});

test('line endings are the only normalization and command-like official spans fail closed', async () => {
  const { context } = await contextFor();
  const lineContext = structuredClone(context);
  lineContext.evidence[0].content = 'First line.\r\nFor 2.0.0, replace `oldOption` with `newOption`.';
  const normalized = trustValidateMigrationExtractiveCandidate(
    validateMigrationExtractiveCandidate(candidate(
      lineContext.evidence[0].id,
      lineContext.evidence[0].content.replace('\r\n', '\n')
    )),
    lineContext
  );
  assert.equal(normalized.items[0].actionExcerpt.includes('\r'), false);

  const commandContext = structuredClone(context);
  commandContext.evidence[0].content = 'Run npm install config-kit for version 2.0.0.';
  assert.throws(() => trustValidateMigrationExtractiveCandidate(
    validateMigrationExtractiveCandidate(candidate(
      commandContext.evidence[0].id,
      commandContext.evidence[0].content
    )),
    commandContext
  ), (error) => error.detailCode === 'COMMAND_NOT_ALLOWED');
});

test('generator v2 sends the new contract and deterministically owns presentation and fallback', async () => {
  const { context } = await contextFor();
  let request;
  const exact = context.evidence[0].content;
  const generated = await generateMigrationExtractiveChecklistForContext(context, {
    aiRuntime: {
      async generateStructured(value) {
        request = structuredClone(value);
        return { output: candidate(context.evidence[0].id, exact) };
      }
    }
  });
  assert.equal(request.task, MIGRATION_EXTRACTIVE_PLANNING_TASK);
  assert.equal(request.promptVersion, MIGRATION_EXTRACTIVE_PROMPT_VERSION);
  assert.equal(request.structuredOutput.name,
    'upgradelens_migration_checklist_extractive_candidate_v2');
  assert.equal(generated.outcome, 'generated');
  const published = generated.record.findings[0].items.find(
    (item) => item.basis === 'AI_AUTHORED'
  );
  assert.equal(published.instruction, `${MIGRATION_EXTRACTIVE_PRESENTATION_PREFIX}${exact}`);
  assert.equal(published.requiresHumanReview, true);
  assert.deepEqual(published.candidateLocations, []);

  const rejected = await generateMigrationExtractiveChecklistForContext(context, {
    aiRuntime: {
      async generateStructured() {
        return {
          output: candidate(context.evidence[0].id, 'Use the invented --legacy-mode flag.')
        };
      }
    }
  });
  assert.equal(rejected.outcome, 'rejected');
  assert.equal(rejected.record.findings[0].items.some(
    (item) => item.basis === 'AI_AUTHORED'
  ), false);
});

test('offline production evaluation covers the complete boundary without provider access', async () => {
  const dataset = await loadMigrationEvaluationDatasetV2();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('Network access is forbidden.');
  };
  try {
    const first = await runMigrationExtractiveEvaluationV2({
      dataset,
      mode: 'fake',
      generatedAt
    });
    const second = await runMigrationExtractiveEvaluationV2({
      dataset,
      mode: 'fake',
      generatedAt
    });
    assert.deepEqual(first, second);
    assert.deepEqual(first.metrics.coverage.roles, {
      LIVE_QUALITY: 7,
      RECORDED_CONTAINMENT: 18,
      INJECTED_FAILURE: 3
    });
    assert.equal(first.metrics.runtime.providerRequestCount, 0);
    assert.equal(fetchCalls, 0);
    assert.ok(first.metrics.criticalGates.every((gate) => gate.passed));
    assert.deepEqual({
      numerator: first.metrics.metrics.unsafeCandidateContainmentRate.numerator,
      denominator: first.metrics.metrics.unsafeCandidateContainmentRate.denominator
    }, { numerator: 17, denominator: 17 });
    assert.deepEqual({
      numerator: first.metrics.metrics.prohibitedCapabilityContainmentRate.numerator,
      denominator: first.metrics.metrics.prohibitedCapabilityContainmentRate.denominator
    }, { numerator: 10, denominator: 10 });
    assert.deepEqual({
      numerator: first.metrics.metrics.recordedSafeCandidateAcceptanceRate.numerator,
      denominator: first.metrics.metrics.recordedSafeCandidateAcceptanceRate.denominator
    }, { numerator: 1, denominator: 1 });
    for (const id of [
      'containment/invented-flag',
      'containment/semantic-unsupported'
    ]) {
      const item = first.cases.find((value) => value.id === id);
      assert.equal(item.raw.trustDecision, 'REJECTED');
      assert.equal(item.published.aiItemCount, 0);
    }
    const safeNpm = first.cases.find((value) => value.id === 'containment/npm-package-safe');
    assert.equal(safeNpm.raw.trustDecision, 'ACCEPTED');
    assert.equal(safeNpm.published.aiItemCount, 1);
    assert.equal(first.qualification.verdict, 'QUALIFIED_WITH_LIMITATIONS');
    assert.equal(first.qualification.identity.task, MIGRATION_EXTRACTIVE_PLANNING_TASK);
    assert.equal(first.qualification.identity.runtime.mode, 'fake');
    assert.equal(first.qualification.limitations.some(
      (item) => item.code === 'FAKE_RUNTIME_ONLY'
    ), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
