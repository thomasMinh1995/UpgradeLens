import {
  isMigrationChecklistTrustError
} from '../ai-candidate.js';
import {
  isMigrationExtractiveCandidateError,
  trustValidateMigrationExtractiveCandidate,
  validateMigrationExtractiveCandidate
} from '../extractive-candidate.js';
import { buildMigrationPolicyProbeCandidate } from './dataset.js';

function actionable(actions, extra = {}) {
  return { status: 'ACTIONABLE', actions, abstentionReason: null, ...extra };
}

function fromFreeFormCandidate(candidate, { unsafeSecondItem = false } = {}) {
  if (candidate.status === 'ABSTAIN') {
    return {
      status: 'ABSTAIN',
      actions: [],
      abstentionReason: candidate.abstentionReason
    };
  }
  return actionable(candidate.items.map((item, index) => ({
    evidenceRef: item.evidenceRefs[0],
    actionExcerpt: unsafeSecondItem && index > 0
      ? item.instruction
      : item.supportingExcerpts[0].text
  })));
}

function recordedOutput(item, baseCase) {
  if (item.recordedSource.kind === 'CUSTOM_CANDIDATE') {
    return fromFreeFormCandidate(item.recordedSource.candidate);
  }
  if (item.recordedSource.kind === 'BASE_RESPONSE') {
    return fromFreeFormCandidate(baseCase.response.candidate, { unsafeSecondItem: true });
  }
  const probe = baseCase.policyProbes.find((value) => (
    value.id === item.recordedSource.probeId
  ));
  if (!probe) throw new Error(`Unknown extractive v2 policy probe ${item.id}.`);
  const freeForm = buildMigrationPolicyProbeCandidate(probe);
  const action = {
    evidenceRef: probe.evidenceRef,
    actionExcerpt: item.id === 'containment/paraphrased-excerpt'
      ? probe.excerpt : probe.instruction
  };
  if (item.id === 'containment/code-fence') action.code = freeForm.items[0].instruction;
  if (item.id === 'containment/command') action.command = freeForm.items[0].instruction;
  if (item.id === 'containment/invented-url') action.url = 'https://example.invalid/migrate';
  if (item.id === 'containment/repository-location') {
    action.file = 'src/config.ts';
    action.symbol = 'config';
  }
  return actionable([action], item.id === 'containment/repository-location'
    ? { packageId: baseCase.fixture.dependency.packageId } : {});
}

export function resolveMigrationExtractiveEvaluationV2Case(dataset, item) {
  const baseCase = dataset.legacyDataset.cases.find((value) => value.id === item.baseCaseId);
  if (!baseCase) throw new Error(`Unknown extractive v2 base case ${item.baseCaseId}.`);
  if (item.role === 'LIVE_QUALITY') {
    return {
      baseCase,
      fixedOutput: fromFreeFormCandidate(baseCase.response.candidate),
      runtimeErrorCode: null
    };
  }
  if (item.role === 'RECORDED_CONTAINMENT') {
    return { baseCase, fixedOutput: recordedOutput(item, baseCase), runtimeErrorCode: null };
  }
  return {
    baseCase,
    fixedOutput: item.injectedFailure.kind === 'RUNTIME_ERROR'
      ? null : structuredClone(item.injectedFailure.output),
    runtimeErrorCode: item.injectedFailure.kind === 'RUNTIME_ERROR'
      ? item.injectedFailure.code : null
  };
}

function comparatorCandidate(candidate) {
  return {
    status: candidate.status,
    items: candidate.actions
      .map((action) => ({
        instruction: action.actionExcerpt,
        evidenceRefs: [action.evidenceRef],
        supportingExcerpts: [{
          evidenceRef: action.evidenceRef,
          text: action.actionExcerpt
        }]
      }))
      .sort((left, right) => (
        left.evidenceRefs[0].localeCompare(right.evidenceRefs[0])
          || left.instruction.localeCompare(right.instruction)
      )),
    abstentionReason: candidate.abstentionReason
  };
}

export function classifyMigrationExtractiveOutput(rawOutput, context, runtimeErrorCode) {
  if (runtimeErrorCode) {
    return {
      outcome: 'RUNTIME_FAILURE',
      candidate: null,
      trustDecision: 'NOT_EVALUATED',
      trustDetailCode: runtimeErrorCode
    };
  }
  let candidate;
  try {
    candidate = validateMigrationExtractiveCandidate(rawOutput);
  } catch (error) {
    if (!isMigrationExtractiveCandidateError(error)) throw error;
    return {
      outcome: 'INVALID',
      candidate: null,
      trustDecision: 'NOT_EVALUATED',
      trustDetailCode: error.code
    };
  }
  const adapted = comparatorCandidate(candidate);
  if (candidate.status === 'ABSTAIN') {
    return {
      outcome: 'ABSTAIN',
      candidate: adapted,
      trustDecision: 'NOT_EVALUATED',
      trustDetailCode: null
    };
  }
  try {
    trustValidateMigrationExtractiveCandidate(candidate, context);
    return {
      outcome: 'ACTIONABLE',
      candidate: adapted,
      trustDecision: 'ACCEPTED',
      trustDetailCode: null
    };
  } catch (error) {
    if (!isMigrationChecklistTrustError(error)) throw error;
    return {
      outcome: 'ACTIONABLE',
      candidate: adapted,
      trustDecision: 'REJECTED',
      trustDetailCode: error.detailCode ?? error.code
    };
  }
}
