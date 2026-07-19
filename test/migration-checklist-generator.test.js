import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  AiRuntimeError,
  MIGRATION_CHECKLIST_CANDIDATE_SCHEMA,
  MIGRATION_PLANNING_TASK,
  buildMigrationChecklist,
  buildMigrationChecklistPrompt,
  generateMigrationChecklistDrafts,
  generateMigrationChecklistForContext,
  trustValidateMigrationChecklistCandidate,
  validateMigrationChecklistCandidate
} from '../src/index.js';

const generatedAt = '2026-07-16T00:00:00.000Z';

function digest(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function lineageInput() {
  const artifact = (name) => ({
    schemaVersion: '1.0.0',
    artifact: `.upgradelens/${name}.json`,
    artifactDigest: digest(name)
  });
  return {
    projectManifest: {
      schemaVersion: '2.0.0',
      artifact: '.upgradelens/project-manifest.json',
      artifactDigest: digest('project'),
      repository: { name: 'fixture', root: '.' }
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

function evidence(value = 'one', content = 'Migration instruction:\r\nReplace `oldApi` with `newApi` for version 2.0.0.') {
  return {
    id: digest(`evidence:${value}`),
    sourceId: `npm:example:documentation:${value}`,
    sourceUrl: `https://docs.example.test/${value}`,
    kind: 'migrationGuide',
    authority: 'officialProject',
    trust: 'official',
    retrievedAt: '2026-07-15T00:00:00.000Z',
    contentDigest: digest(content),
    locator: `heading:${value}`,
    releaseVersions: ['2.0.0'],
    content
  };
}

function eligibleContext({
  suffix = 'one',
  selectedEvidence = [evidence(suffix)],
  targetPolicy = 'explicit',
  uncertainBaseline = false,
  location = true,
  locationReason = location ? 'POSITIVE_USAGE_MATCH' : 'UNSUPPORTED_USAGE_COVERAGE'
} = {}) {
  const evidenceRefs = selectedEvidence.map((item) => item.id).sort();
  const impactEvidenceId = digest(`impact:${suffix}`);
  return {
    contextVersion: '1',
    contextId: digest(`context:${suffix}`),
    dependency: {
      projectId: `node:${suffix}`,
      packageId: `npm:example-${suffix}`,
      declaredName: `example-${suffix}`,
      normalizedName: `example-${suffix}`,
      ecosystem: 'node',
      registry: 'npm',
      packageManager: 'npm',
      dependencyType: 'dependency',
      manifest: 'package.json'
    },
    versions: {
      analysisMode: uncertainBaseline ? 'declaredConstraint' : 'exactBaseline',
      declaredVersion: uncertainBaseline ? '^1.0.0' : '1.0.0',
      currentVersion: uncertainBaseline ? null : '1.0.0',
      currentVersionSource: uncertainBaseline ? null : 'exactDeclaration',
      targetVersion: '2.0.0',
      targetPolicy,
      delta: uncertainBaseline
        ? { direction: 'unknown', classification: 'unknown' }
        : { direction: 'upgrade', classification: 'major' }
    },
    analysisResultId: digest(`analysis:${suffix}`),
    decisionId: digest(`decision:${suffix}`),
    decision: {
      status: 'PLAN_UPGRADE',
      targetOrigin: targetPolicy,
      recommendationDriver: 'USER_SELECTED_TARGET',
      primaryReasonCode: 'USER_SELECTED_TARGET',
      reasonCodes: ['USER_SELECTED_TARGET']
    },
    affectedAreas: location ? [{
      impactEvidenceId,
      findingId: `breaking-${suffix}`,
      symbol: 'oldApi',
      file: `src/${suffix}.tsx`,
      coverageStatus: 'complete'
    }] : [],
    coverage: {
      status: location ? 'complete' : 'unavailable',
      reasonCode: location ? 'COVERAGE_COMPLETE' : 'ANALYZER_UNAVAILABLE'
    },
    verification: {
      status: 'VERIFICATION_COMMAND_UNAVAILABLE',
      commands: [],
      limitation: {
        code: 'VERIFICATION_COMMAND_UNAVAILABLE',
        message: 'No supported project-derived verification command was found.'
      }
    },
    officialEvidence: selectedEvidence.map((item) => ({
      id: item.id,
      sourceId: item.sourceId,
      kind: item.kind,
      authority: item.authority,
      trust: item.trust,
      contentDigest: item.contentDigest,
      locator: item.locator,
      releaseVersions: structuredClone(item.releaseVersions)
    })).sort((left, right) => left.id.localeCompare(right.id)),
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
    finding: {
      id: `breaking-${suffix}`,
      kind: 'breakingChange',
      summary: 'The target release changes the documented API.',
      appliesToVersions: ['2.0.0'],
      evidenceRefs
    },
    evidence: structuredClone(selectedEvidence),
    evidenceAllowlist: evidenceRefs,
    positiveCandidateLocations: location ? [{
      impactEvidenceId,
      symbol: 'oldApi',
      file: `src/${suffix}.tsx`
    }] : [],
    eligibility: { status: 'ELIGIBLE', reasonCode: 'ELIGIBLE' },
    locationEligibility: {
      status: location ? 'ELIGIBLE' : 'REVIEW_REQUIRED',
      reasonCode: locationReason
    },
    requiresHumanReview: true,
    humanReviewReasons: ['MIGRATION_CHECKLIST_DRAFT_REVIEW_REQUIRED'],
    limitations: [
      ...(targetPolicy === 'registryLatest' ? [{
        code: 'REGISTRY_LATEST_IS_NOT_RECOMMENDATION',
        message: 'The target is a registry-latest fact and is not a recommended migration target.'
      }] : []),
      ...(!location ? [{
        code: 'UNSUPPORTED_USAGE_COVERAGE',
        message: 'Usage coverage cannot be proven; no unused or safe conclusion is available.'
      }] : [])
    ]
  };
}

function actionableCandidate(ref, overrides = {}) {
  return {
    status: 'ACTIONABLE',
    items: [{
      instruction: 'Replace `oldApi` with `newApi` for version 2.0.0.',
      evidenceRefs: [ref],
      supportingExcerpts: [{
        evidenceRef: ref,
        text: 'Migration instruction:\nReplace `oldApi` with `newApi` for version 2.0.0.'
      }],
      ...overrides
    }],
    abstentionReason: null
  };
}

function abstainCandidate(reason = 'NO_EXPLICIT_ACTION') {
  return { status: 'ABSTAIN', items: [], abstentionReason: reason };
}

function fakeRuntime(outputs) {
  const calls = [];
  let index = 0;
  return {
    calls,
    async generateStructured(request) {
      calls.push(structuredClone(request));
      const output = typeof outputs === 'function' ? await outputs(request, index) : outputs[index];
      index += 1;
      if (output instanceof Error) throw output;
      return { output, provider: 'fake', model: 'fake', latencyMs: 0 };
    }
  };
}

function prepared(contexts = [], fallbackRecords = []) {
  return {
    contextVersion: '1',
    input: lineageInput(),
    eligibleContexts: contexts,
    fallbackRecords,
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

function recordHandoff(context) {
  return Object.fromEntries([
    'decisionId',
    'decision',
    'affectedAreas',
    'coverage',
    'verification',
    'officialEvidence',
    'preconditions',
    'recovery',
    'reviewQuestions',
    'missingInformation',
    'nextStep',
    'humanReviewRequired'
  ].map((field) => [field, structuredClone(context[field])]));
}

test('prompt is task-specific, bounded, and excludes URLs, locations, repository source, and provider config', () => {
  const context = eligibleContext({
    targetPolicy: 'registryLatest',
    uncertainBaseline: true,
    location: false
  });
  context.providerConfig = { apiKey: 'secret-value' };
  context.repositorySource = 'private source';
  context.unrelatedEvidence = 'unrelated evidence content';
  const prompt = buildMigrationChecklistPrompt({
    context,
    outputSchema: MIGRATION_CHECKLIST_CANDIDATE_SCHEMA
  });

  assert.match(prompt.system, /evidence transformation component/i);
  assert.match(prompt.user, /ABSTAIN/);
  assert.match(prompt.user, /code, patches, diffs, or commands/i);
  assert.match(prompt.user, /URLs.*repository files.*locations/i);
  assert.match(prompt.user, /safety\/ready\/verified\/complete/i);
  assert.match(prompt.user, /currentVersion remains unknown/);
  assert.match(prompt.user, /registryLatest.*not a recommendation/);
  assert.match(prompt.user, /does not mean unused, not impacted, or safe/);
  assert.match(prompt.user, /oldApi/);
  assert.doesNotMatch(prompt.user, /secret-value|private source|unrelated evidence content|src\/one\.tsx|docs\.example\.test/);
  assert.doesNotMatch(prompt.user, /positiveCandidateLocations|sourceUrl|providerConfig|repositorySource|unrelatedEvidence/);
});

test('candidate schema accepts valid ACTIONABLE and ABSTAIN outputs and rejects unsafe ownership or semantics', () => {
  const ref = evidence().id;
  assert.equal(validateMigrationChecklistCandidate(actionableCandidate(ref)).status, 'ACTIONABLE');
  assert.equal(validateMigrationChecklistCandidate(JSON.stringify(abstainCandidate())).status, 'ABSTAIN');

  const invalid = [
    { ...actionableCandidate(ref), extra: true },
    { status: 'ACTIONABLE', items: [], abstentionReason: null },
    { status: 'ACTIONABLE', items: actionableCandidate(ref).items, abstentionReason: 'AMBIGUOUS_EVIDENCE' },
    { status: 'ABSTAIN', items: actionableCandidate(ref).items, abstentionReason: 'NO_EXPLICIT_ACTION' },
    { status: 'ABSTAIN', items: [], abstentionReason: null },
    actionableCandidate(ref, { evidenceRefs: [] }),
    actionableCandidate(ref, { supportingExcerpts: [] }),
    actionableCandidate(ref, { instruction: 'x'.repeat(801) }),
    actionableCandidate(ref, {
      supportingExcerpts: [{ evidenceRef: ref, text: 'x'.repeat(501) }]
    }),
    actionableCandidate(ref, { id: digest('owned-id') }),
    actionableCandidate(ref, { file: 'src/App.tsx' }),
    actionableCandidate(ref, { status: 'COMPLETE' }),
    actionableCandidate(ref, { evidenceRefs: [ref, ref] })
  ];
  for (const candidate of invalid) {
    assert.throws(() => validateMigrationChecklistCandidate(candidate));
  }
});

test('trust validation requires same-record exact excerpts and normalizes line endings only', () => {
  const first = evidence('first', 'Line one\r\nUse `supportedApi` now.');
  const second = evidence('second', 'Text from another record.');
  const context = eligibleContext({ suffix: 'grounding', selectedEvidence: [first, second] });
  const valid = validateMigrationChecklistCandidate(actionableCandidate(first.id, {
    instruction: 'Use `supportedApi` now.',
    supportingExcerpts: [{ evidenceRef: first.id, text: 'Line one\nUse `supportedApi` now.' }]
  }));
  assert.equal(trustValidateMigrationChecklistCandidate(valid, context).items.length, 1);

  for (const candidate of [
    actionableCandidate(first.id, {
      instruction: 'Review this migration action.',
      supportingExcerpts: [{ evidenceRef: first.id, text: 'Missing excerpt.' }]
    }),
    actionableCandidate(first.id, {
      instruction: 'Review this migration action.',
      supportingExcerpts: [{ evidenceRef: first.id, text: second.content }]
    }),
    actionableCandidate(digest('unknown'), {
      instruction: 'Review this migration action.',
      supportingExcerpts: [{ evidenceRef: digest('unknown'), text: 'Anything.' }]
    }),
    actionableCandidate(first.id, {
      instruction: 'Review this migration action.',
      supportingExcerpts: [{ evidenceRef: second.id, text: second.content }]
    }),
    actionableCandidate(first.id, {
      instruction: 'Review this migration action.',
      supportingExcerpts: [{ evidenceRef: first.id, text: 'Use the supported API now.' }]
    }),
    actionableCandidate(first.id, {
      instruction: 'Review this migration action.',
      supportingExcerpts: [
        { evidenceRef: first.id, text: 'Line one' },
        { evidenceRef: first.id, text: 'Use `supportedApi` now.' }
      ]
    })
  ]) {
    const parsed = validateMigrationChecklistCandidate(candidate);
    assert.throws(() => trustValidateMigrationChecklistCandidate(parsed, context));
  }
});

test('trust validation rejects prohibited capabilities and invented identifiers', () => {
  const selected = evidence('guard', 'This evidence contains a generic migration instruction.');
  const context = eligibleContext({ suffix: 'guard', selectedEvidence: [selected] });
  const excerpt = [{ evidenceRef: selected.id, text: selected.content }];
  const prohibited = [
    'Review https://example.test/migrate.',
    '```js\nnewApi();\n```',
    'diff --git a/file b/file',
    '$ npm install example',
    'Run pnpm add example.',
    'Create a rollback plan.',
    'This takes 2 hours.',
    'Confidence: 90%.',
    'First upgrade dependency A.',
    'The upgrade is safe.',
    'Update src/App.tsx.',
    'Replace `inventedApi`.'
  ];
  for (const instruction of prohibited) {
    const candidate = validateMigrationChecklistCandidate(actionableCandidate(selected.id, {
      instruction,
      supportingExcerpts: excerpt
    }));
    assert.throws(
      () => trustValidateMigrationChecklistCandidate(candidate, context),
      undefined,
      instruction
    );
  }

  const supported = evidence('supported', 'Replace `oldApi` with `newApi`.');
  const supportedContext = eligibleContext({ suffix: 'supported', selectedEvidence: [supported] });
  const candidate = validateMigrationChecklistCandidate(actionableCandidate(supported.id, {
    instruction: 'Replace `oldApi` with `newApi`.',
    supportingExcerpts: [{ evidenceRef: supported.id, text: supported.content }]
  }));
  assert.equal(trustValidateMigrationChecklistCandidate(candidate, supportedContext).items.length, 1);
});

test('generator constructs MP-01-compatible AI and deterministic location items with stable ownership', async () => {
  const context = eligibleContext();
  const runtime = fakeRuntime([actionableCandidate(context.evidence[0].id)]);
  const first = await generateMigrationChecklistDrafts(prepared([context]), { aiRuntime: runtime });
  const second = await generateMigrationChecklistDrafts(prepared([structuredClone(context)]), {
    aiRuntime: fakeRuntime([structuredClone(actionableCandidate(context.evidence[0].id))])
  });
  const finding = first.records[0].findings[0];
  const aiItem = finding.items.find((item) => item.basis === 'AI_AUTHORED');
  const locationItem = finding.items.find((item) => item.kind === 'REVIEW_CANDIDATE_USAGE');

  assert.equal(runtime.calls[0].task, MIGRATION_PLANNING_TASK);
  assert.equal(aiItem.kind, 'REVIEW_MIGRATION_INSTRUCTION');
  assert.equal(aiItem.requiresHumanReview, true);
  assert.deepEqual(aiItem.candidateLocations, []);
  assert.equal(aiItem.findingId, context.finding.id);
  assert.deepEqual(first.records[0].dependency, context.dependency);
  assert.deepEqual(first.records[0].versions, context.versions);
  assert.deepEqual(locationItem.candidateLocations, context.positiveCandidateLocations);
  assert.doesNotMatch(aiItem.instruction, /src\/one\.tsx/);
  assert.deepEqual(first, second);

  const checklist = buildMigrationChecklist({
    input: first.input,
    dependencies: first.records,
    generatedAt
  });
  assert.equal(checklist.status, 'COMPLETE');
  assert.equal(checklist.summary.aiAuthoredItemCount, 1);
  assert.equal(checklist.summary.candidateLocationCount, 1);
});

test('valid abstention, invalid output, trust rejection, and provider failure become distinct safe fallbacks', async () => {
  const contexts = ['abstain', 'json', 'schema', 'trust', 'provider']
    .map((suffix) => eligibleContext({ suffix }));
  const outputs = [
    abstainCandidate('AMBIGUOUS_EVIDENCE'),
    '{invalid',
    {},
    actionableCandidate(contexts[3].evidence[0].id, { instruction: 'The upgrade is safe.' }),
    new AiRuntimeError('TIMEOUT', 'private provider message', { retryable: true })
  ];
  const result = await generateMigrationChecklistDrafts(prepared(contexts), {
    aiRuntime: fakeRuntime(outputs)
  });

  assert.deepEqual(result.summary, {
    attempted: 5,
    generated: 0,
    abstained: 1,
    rejected: 3,
    failed: 1,
    preservedFallbackRecordCount: 0,
    recordCount: 5
  });
  assert.deepEqual(result.warnings.map((item) => item.code).sort(), [
    'AI_RUNTIME_FAILED',
    'MODEL_ABSTAINED',
    'OUTPUT_JSON_INVALID',
    'OUTPUT_SCHEMA_INVALID',
    'TRUST_VALIDATION_REJECTED'
  ]);
  assert.equal(result.warnings.some((item) => item.detailCode === 'TIMEOUT'), true);
  assert.doesNotMatch(JSON.stringify(result), /private provider message/);
  for (const record of result.records) {
    assert.equal(record.findings[0].items.some((item) => item.basis === 'AI_AUTHORED'), false);
    assert.equal(record.findings[0].items[0].kind, 'MANUAL_REVIEW_REQUIRED');
  }
});

test('whole-candidate rejection is fail-closed and one failed context does not remove another valid result', async () => {
  const validContext = eligibleContext({ suffix: 'valid' });
  const partialContext = eligibleContext({ suffix: 'partial' });
  const partial = actionableCandidate(partialContext.evidence[0].id);
  partial.items.push({
    ...structuredClone(partial.items[0]),
    instruction: 'Replace `inventedApi`.'
  });
  const result = await generateMigrationChecklistDrafts(prepared([partialContext, validContext]), {
    aiRuntime: fakeRuntime((request) => (
      request.contextId === validContext.contextId
        ? actionableCandidate(validContext.evidence[0].id)
        : partial
    ))
  });

  assert.equal(result.summary.generated, 1);
  assert.equal(result.summary.rejected, 1);
  const validRecord = result.records.find((record) => record.analysisResultId === validContext.analysisResultId);
  const rejectedRecord = result.records.find((record) => record.analysisResultId === partialContext.analysisResultId);
  assert.equal(validRecord.findings[0].items.some((item) => item.basis === 'AI_AUTHORED'), true);
  assert.equal(rejectedRecord.findings[0].items.some((item) => item.basis === 'AI_AUTHORED'), false);
});

test('MP-02 fallbacks are preserved and never sent to AI, including merge with another eligible finding', async () => {
  const context = eligibleContext({ suffix: 'merge' });
  const fallbackRecord = {
    analysisResultId: context.analysisResultId,
    ...recordHandoff(context),
    dependency: structuredClone(context.dependency),
    versions: structuredClone(context.versions),
    analysisStatus: 'analyzed',
    selectedEvidenceRefs: [],
    findings: [{
      id: 'other-finding',
      kind: 'breakingChange',
      summary: 'Other finding has no grounded action.',
      eligibilityReasonCode: 'NO_GROUNDED_ACTION',
      evidenceRefs: [],
      positiveImpactLocations: [],
      items: [{
        kind: 'MANUAL_REVIEW_REQUIRED',
        basis: 'DETERMINISTIC',
        instruction: 'Manual review is required because no bounded official migration action is available.',
        findingId: 'other-finding',
        evidenceRefs: [],
        candidateLocations: [],
        requiresHumanReview: true
      }]
    }],
    limitations: []
  };
  const runtime = fakeRuntime([actionableCandidate(context.evidence[0].id)]);
  const result = await generateMigrationChecklistDrafts(prepared([context], [fallbackRecord]), {
    aiRuntime: runtime
  });

  assert.equal(runtime.calls.length, 1);
  assert.equal(result.records.length, 1);
  assert.deepEqual(result.records[0].findings.map((finding) => finding.id), [
    context.finding.id,
    'other-finding'
  ].sort());
  assert.equal(result.summary.preservedFallbackRecordCount, 1);

  const fallbackOnlyRuntime = fakeRuntime([]);
  const fallbackOnly = await generateMigrationChecklistDrafts(prepared([], [fallbackRecord]), {
    aiRuntime: fallbackOnlyRuntime
  });
  assert.equal(fallbackOnlyRuntime.calls.length, 0);
  assert.deepEqual(fallbackOnly.records, [fallbackRecord]);
});

test('generator rejects invalid MP-02 input invariants instead of hiding programming errors', async () => {
  const context = eligibleContext();
  const runtime = fakeRuntime([]);
  await assert.rejects(
    () => generateMigrationChecklistDrafts(prepared([{ ...context, eligibility: {
      status: 'INELIGIBLE', reasonCode: 'NO_GROUNDED_ACTION'
    } }]), { aiRuntime: runtime }),
    /is not eligible/
  );
  await assert.rejects(
    () => generateMigrationChecklistDrafts(prepared([context, structuredClone(context)]), {
      aiRuntime: runtime
    }),
    /duplicate contextId/
  );
  await assert.rejects(
    () => generateMigrationChecklistForContext(context),
    /AiRuntime must provide/
  );
});

test('generation is immutable, does not mutate contexts, and performs no I/O outside the injected runtime', async () => {
  const context = eligibleContext();
  const before = structuredClone(context);
  const result = await generateMigrationChecklistDrafts(prepared([context]), {
    aiRuntime: fakeRuntime([JSON.stringify(actionableCandidate(context.evidence[0].id))]),
    writer() { throw new Error('must not be called'); },
    sourceScanner() { throw new Error('must not be called'); }
  });

  assert.deepEqual(context, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.records[0].findings[0].items[0]), true);
  assert.throws(() => { result.summary.generated = 99; }, TypeError);
});
