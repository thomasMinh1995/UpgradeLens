import { compareText } from '../../../../src/portable.js';
import { buildMigrationEvaluationContext } from '../../../../src/migration-checklist/evaluation/dataset.js';

const WHOLE_CANDIDATE_CRITERIA = Object.freeze({
  actions: [{
    id: 'replace-client-method',
    acceptablePatterns: [{
      allOf: ['oldclient', 'newclient'],
      anyActionVerb: ['replace', 'rename', 'change', 'update']
    }],
    specificity: {
      actionVerbs: ['replace', 'rename', 'change', 'update'],
      sourceIdentifiers: ['oldclient'],
      targetIdentifiers: ['newclient'],
      objectAnchors: []
    }
  }],
  forbiddenExpansions: [{
    id: 'invented-client-mode',
    anyOf: ['inventedclientmode']
  }],
  forbiddenModalities: ['must', 'required'],
  allowedVersions: ['2.0.0']
});

function baseCase(dataset, goldenCase) {
  return dataset.legacyDataset.cases.find((item) => item.id === goldenCase.baseCaseId);
}

function liveCriteria(dataset, baseCaseId) {
  return dataset.cases.find((item) => (
    item.role === 'LIVE_QUALITY' && item.baseCaseId === baseCaseId
  ))?.expected.actionCriteria;
}

export function extractiveCriteriaForCase(dataset, goldenCase) {
  const criteria = liveCriteria(dataset, goldenCase.baseCaseId);
  if (criteria) return structuredClone(criteria);
  if (goldenCase.baseCaseId === 'node/whole-candidate-rejection') {
    return structuredClone(WHOLE_CANDIDATE_CRITERIA);
  }
  throw new Error(`No extractive action criteria for ${goldenCase.id}.`);
}

function actionable(actions, extra = {}) {
  return {
    status: 'ACTIONABLE',
    actions,
    abstentionReason: null,
    ...extra
  };
}

function liveCandidate(base) {
  if (base.response.candidate.status === 'ABSTAIN') {
    return {
      status: 'ABSTAIN',
      actions: [],
      abstentionReason: base.response.candidate.abstentionReason
    };
  }
  return actionable(base.fixture.evidence.map((evidence) => ({
    evidenceRef: evidence.id,
    actionExcerpt: evidence.content
  })).sort((left, right) => compareText(left.evidenceRef, right.evidenceRef)));
}

function probeFor(base, goldenCase) {
  return base.policyProbes.find((item) => item.id === goldenCase.recordedSource.probeId);
}

function probeCandidate(base, goldenCase) {
  const probe = probeFor(base, goldenCase);
  if (!probe) throw new Error(`Unknown extractive fixture probe ${goldenCase.id}.`);
  const action = {
    evidenceRef: probe.evidenceRef,
    actionExcerpt: goldenCase.id === 'containment/paraphrased-excerpt'
      ? probe.excerpt : probe.instruction
  };
  if (goldenCase.id === 'containment/code-fence') action.code = probe.instruction;
  if (goldenCase.id === 'containment/command') action.command = probe.instruction;
  if (goldenCase.id === 'containment/invented-url') action.url = 'https://example.invalid/migrate';
  if (goldenCase.id === 'containment/repository-location') {
    action.file = 'src/config.ts';
    action.symbol = 'config';
  }
  return actionable([action], goldenCase.id === 'containment/repository-location'
    ? { packageId: base.fixture.dependency.packageId } : {});
}

function customCandidate(goldenCase) {
  const source = goldenCase.recordedSource.candidate;
  return actionable(source.items.flatMap((item) => item.supportingExcerpts.map((excerpt) => ({
    evidenceRef: excerpt.evidenceRef,
    actionExcerpt: excerpt.text
  }))));
}

function baseResponseCandidate(base) {
  return actionable(base.response.candidate.items.map((item, index) => ({
    evidenceRef: item.evidenceRefs[0],
    actionExcerpt: index === 0 ? item.supportingExcerpts[0].text : item.instruction
  })));
}

function recordedCandidate(base, goldenCase) {
  if (goldenCase.recordedSource.kind === 'CUSTOM_CANDIDATE') {
    return customCandidate(goldenCase);
  }
  if (goldenCase.recordedSource.kind === 'BASE_RESPONSE') {
    return baseResponseCandidate(base);
  }
  return probeCandidate(base, goldenCase);
}

/** Adapt immutable v2 roles to fixed extractive candidates. No provider is involved. */
export function buildExtractiveFixture(dataset, goldenCase) {
  const resolvedBase = baseCase(dataset, goldenCase);
  if (!resolvedBase) throw new Error(`Unknown base case ${goldenCase.baseCaseId}.`);
  const context = buildMigrationEvaluationContext(resolvedBase);
  if (goldenCase.role === 'LIVE_QUALITY') {
    return {
      context,
      criteria: extractiveCriteriaForCase(dataset, goldenCase),
      output: liveCandidate(resolvedBase),
      runtimeErrorCode: null
    };
  }
  if (goldenCase.role === 'RECORDED_CONTAINMENT') {
    return {
      context,
      criteria: extractiveCriteriaForCase(dataset, goldenCase),
      output: recordedCandidate(resolvedBase, goldenCase),
      runtimeErrorCode: null
    };
  }
  return {
    context,
    criteria: extractiveCriteriaForCase(dataset, goldenCase),
    output: goldenCase.injectedFailure.kind === 'RUNTIME_ERROR'
      ? null : structuredClone(goldenCase.injectedFailure.output),
    runtimeErrorCode: goldenCase.injectedFailure.kind === 'RUNTIME_ERROR'
      ? goldenCase.injectedFailure.code : null
  };
}
