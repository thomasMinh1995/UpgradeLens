import { createHash } from 'node:crypto';

import { canonicalJson } from '../../canonical-json.js';
import { compareText } from '../../portable.js';
import {
  isMigrationChecklistCandidateError,
  isMigrationChecklistTrustError,
  trustValidateMigrationChecklistCandidate,
  validateMigrationChecklistCandidate
} from '../ai-candidate.js';
import { validateMigrationChecklistInstructionContent } from '../grounding-policy.js';
import { evaluateMigrationActionInstruction } from './action-criteria.js';

const MAX_RETAINED_INSTRUCTION_CHARACTERS = 300;
const MAX_RETAINED_EXCERPT_CHARACTERS = 160;

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(String(value)).digest('hex')}`;
}

function lineEndings(value) {
  return value.replace(/\r\n?/g, '\n');
}

function classifyRawOutput(rawOutput, context, runtimeErrorCode) {
  if (runtimeErrorCode) {
    return {
      outcome: 'RUNTIME_FAILURE', candidate: null,
      trustDecision: 'NOT_EVALUATED', trustDetailCode: runtimeErrorCode
    };
  }
  let candidate;
  try {
    candidate = validateMigrationChecklistCandidate(rawOutput);
  } catch (error) {
    if (!isMigrationChecklistCandidateError(error)) throw error;
    return {
      outcome: 'INVALID', candidate: null,
      trustDecision: 'NOT_EVALUATED', trustDetailCode: error.code
    };
  }
  if (candidate.status === 'ABSTAIN') {
    return {
      outcome: 'ABSTAIN', candidate,
      trustDecision: 'NOT_EVALUATED', trustDetailCode: null
    };
  }
  try {
    trustValidateMigrationChecklistCandidate(candidate, context);
    return { outcome: 'ACTIONABLE', candidate, trustDecision: 'ACCEPTED', trustDetailCode: null };
  } catch (error) {
    if (!isMigrationChecklistTrustError(error)) throw error;
    return {
      outcome: 'ACTIONABLE', candidate,
      trustDecision: 'REJECTED', trustDetailCode: error.detailCode ?? error.code
    };
  }
}

function itemHasExactExcerpts(item, context) {
  const evidenceById = new Map(context.evidence.map((value) => [value.id, value]));
  const refs = new Set(item.evidenceRefs ?? []);
  const excerpts = item.supportingExcerpts ?? [];
  if (refs.size === 0 || excerpts.length !== refs.size) return false;
  const seen = new Set();
  for (const excerpt of excerpts) {
    const evidence = evidenceById.get(excerpt.evidenceRef);
    if (!evidence || !refs.has(excerpt.evidenceRef) || seen.has(excerpt.evidenceRef)) return false;
    seen.add(excerpt.evidenceRef);
    if (!lineEndings(evidence.content).includes(lineEndings(excerpt.text))) return false;
  }
  return [...refs].every((ref) => seen.has(ref));
}

function obviousProhibited(instruction) {
  return validateMigrationChecklistInstructionContent(instruction).length > 0
    || /\b(?:rollback|roll back|story points?|confidence\s*[:=]?\s*\d|safe to upgrade|upgrade is safe|prerequisite|required before)\b/i.test(instruction)
    || /```|diff --git|\b(?:npm|pnpm|yarn|pip)\s+\S+/i.test(instruction);
}

const IDENTIFIER_PATTERNS = Object.freeze([
  /`([^`\n]{1,80})`/g,
  /(?<![A-Za-z0-9_])(--[a-z0-9][a-z0-9-]*)\b/gi,
  /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\b/g,
  /\b([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/g,
  /\b([A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+)\b/g,
  /\b([A-Za-z_$][\w$]*)\(\)/g
]);

function technicalIdentifiers(value) {
  const identifiers = new Set();
  for (const expression of IDENTIFIER_PATTERNS) {
    expression.lastIndex = 0;
    for (const match of value.matchAll(expression)) identifiers.add(match[1] ?? match[0]);
  }
  return [...identifiers];
}

function itemInventsIdentifier(item) {
  const excerpts = (item.supportingExcerpts ?? []).map((value) => value.text).join('\n');
  return technicalIdentifiers(item.instruction).some((identifier) => !excerpts.includes(identifier));
}

function evaluationFor(item, goldenCase) {
  if (goldenCase.role !== 'LIVE_QUALITY') return null;
  if (!goldenCase.expected.actionExpected) {
    return {
      supportStatus: 'UNSUPPORTED', reasonCode: 'ACTION_NOT_EXPECTED',
      matchedActionIds: [], forbiddenExpansionIds: [], specificity: null
    };
  }
  return evaluateMigrationActionInstruction(item.instruction, goldenCase.expected.actionCriteria);
}

function counts(evaluations) {
  return {
    supportedActionItemCount: evaluations.filter((item) => item?.supportStatus === 'SUPPORTED').length,
    unsupportedActionItemCount: evaluations.filter((item) => item?.supportStatus === 'UNSUPPORTED').length,
    ambiguousActionItemCount: evaluations.filter((item) => item?.supportStatus === 'AMBIGUOUS').length,
    specificActionItemCount: evaluations.filter((item) => item?.specificity?.status === 'SPECIFIC').length,
    identifierSpecificItemCount: evaluations.filter((item) => item?.specificity?.identifierSpecific === true).length,
    versionSpecificItemCount: evaluations.filter((item) => item?.specificity?.versionScopePresent === true).length
  };
}

function rawSignals(raw, goldenCase, baseCase, context) {
  const items = raw.candidate?.items ?? [];
  const refs = items.flatMap((item) => item.evidenceRefs ?? []);
  const allowed = new Set(context.evidenceAllowlist);
  const expectedRefs = new Set(baseCase.expected.evidenceRefs);
  const evaluations = items.map((item) => evaluationFor(item, goldenCase));
  return {
    itemCount: items.length,
    evidenceRefCount: refs.length,
    matchedEvidenceRefCount: refs.filter((ref) => allowed.has(ref)).length,
    expectedEvidenceRefCount: expectedRefs.size,
    coveredEvidenceRefCount: [...expectedRefs].filter((ref) => refs.includes(ref)).length,
    exactExcerptItemCount: items.filter((item) => itemHasExactExcerpts(item, context)).length,
    ...counts(evaluations),
    inventedIdentifierAttemptCount: items.filter(itemInventsIdentifier).length
      || (raw.trustDetailCode === 'IDENTIFIER_NOT_IN_EXCERPT' ? 1 : 0),
    prohibitedCapabilityAttemptCount: items.filter((item) => obviousProhibited(item.instruction)).length,
    itemEvaluations: evaluations.map((item, index) => item ? {
      itemIndex: index,
      supportStatus: item.supportStatus,
      reasonCode: item.reasonCode,
      matchedActionIds: item.matchedActionIds,
      forbiddenExpansionIds: item.forbiddenExpansionIds,
      specificity: item.specificity
    } : null).filter(Boolean)
  };
}

function publishedSignals(
  generation,
  goldenCase,
  baseCase,
  context,
  rawMetrics,
  publishedEvaluationInstructions = null
) {
  const finding = generation.record.findings.find((item) => item.id === context.finding.id);
  const items = finding?.items ?? [];
  const aiItems = items.filter((item) => item.basis === 'AI_AUTHORED');
  const locationItems = items.filter((item) => item.kind === 'REVIEW_CANDIDATE_USAGE');
  const evaluations = aiItems.map((item, index) => evaluationFor(
    publishedEvaluationInstructions?.[index]
      ? { ...item, instruction: publishedEvaluationInstructions[index] }
      : item,
    goldenCase
  ));
  const instructions = aiItems.map((item) => item.instruction);
  const expectedLocations = [...baseCase.expected.locations].sort((left, right) => (
    compareText(left.impactEvidenceId, right.impactEvidenceId)
      || compareText(left.symbol, right.symbol) || compareText(left.file, right.file)
  ));
  const publishedLocations = locationItems.flatMap((item) => item.candidateLocations)
    .sort((left, right) => compareText(left.impactEvidenceId, right.impactEvidenceId)
      || compareText(left.symbol, right.symbol) || compareText(left.file, right.file));
  return {
    aiItemCount: aiItems.length,
    ...counts(evaluations),
    evidenceRefsValid: aiItems.every((item) => item.evidenceRefs.every((ref) => (
      context.evidenceAllowlist.includes(ref)
    ))),
    inventedIdentifierCount: generation.outcome === 'generated'
      ? rawMetrics.inventedIdentifierAttemptCount : 0,
    prohibitedCapabilityCount: instructions.filter(obviousProhibited).length,
    aiOwnedLocationCount: aiItems.reduce((total, item) => total + item.candidateLocations.length, 0),
    locationsPreserved: same(publishedLocations, expectedLocations),
    humanReviewCorrect: items.every((item) => item.requiresHumanReview === true),
    registryLatestRecommendationLeak: context.versions.targetPolicy === 'registryLatest'
      && instructions.some((value) => /recommend/i.test(value)),
    unsupportedUsageSafetyLeak: context.locationEligibility.reasonCode === 'UNSUPPORTED_USAGE_COVERAGE'
      && instructions.some((value) => /\b(?:unused|safe|not impacted)\b/i.test(value))
  };
}

function boundedText(value, limit) {
  if (typeof value !== 'string'
      || /\/(?:Users|home|private\/tmp)\//.test(value)
      || /\b(?:authorization|api[_-]?key|bearer)\s*[:=]?\s*\S+/i.test(value)) return null;
  return value.length <= limit ? value : null;
}

function retainedDetails(goldenCase, raw, context, rawMetrics, published, enabled) {
  if (!enabled || goldenCase.role !== 'LIVE_QUALITY') return [];
  const candidateItems = raw.candidate?.items ?? [];
  return rawMetrics.itemEvaluations.flatMap((evaluation) => {
    const failed = evaluation.supportStatus !== 'SUPPORTED'
      || evaluation.specificity?.status === 'LOW_SPECIFICITY'
      || raw.trustDecision === 'REJECTED';
    if (!failed) return [];
    const item = candidateItems[evaluation.itemIndex];
    return [{
      caseId: goldenCase.id,
      itemIndex: evaluation.itemIndex,
      instruction: boundedText(item.instruction, MAX_RETAINED_INSTRUCTION_CHARACTERS),
      instructionDigest: digest(item.instruction),
      evidence: item.supportingExcerpts.map((excerpt) => ({
        evidenceRef: excerpt.evidenceRef,
        excerpt: boundedText(excerpt.text, MAX_RETAINED_EXCERPT_CHARACTERS),
        excerptDigest: digest(excerpt.text),
        locator: context.evidence.find((value) => value.id === excerpt.evidenceRef)?.locator ?? null
      })),
      actionCriteriaIds: evaluation.matchedActionIds,
      comparatorResult: evaluation.supportStatus,
      reasonCode: evaluation.reasonCode,
      trustDecision: raw.trustDecision,
      published: published.aiItemCount > 0
    }];
  });
}

export function compareMigrationEvaluationCaseV2(goldenCase, {
  baseCase,
  context,
  generation,
  rawOutput,
  runtimeErrorCode = null,
  rawClassification = null,
  publishedEvaluationInstructions = null,
  deterministicReplayPassed,
  retainFailureDetails = true
}) {
  const raw = rawClassification ?? classifyRawOutput(rawOutput, context, runtimeErrorCode);
  const rawMetrics = rawSignals(raw, goldenCase, baseCase, context);
  const published = publishedSignals(
    generation,
    goldenCase,
    baseCase,
    context,
    rawMetrics,
    publishedEvaluationInstructions
  );
  const identityPreserved = generation.record.analysisResultId === context.analysisResultId
    && same(generation.record.dependency, context.dependency)
    && same(generation.record.versions, context.versions)
    && generation.record.findings.every((finding) => finding.id === context.finding.id);
  const preservation = {
    identityPreserved,
    locationsPreserved: published.locationsPreserved,
    humanReviewCorrect: published.humanReviewCorrect,
    aiOwnsNoLocation: published.aiOwnedLocationCount === 0,
    versionUncertaintyPreserved: same(generation.record.versions, context.versions),
    eligibilityCorrect: generation.outcome === 'generated'
      ? generation.record.findings[0]?.eligibilityReasonCode === 'ELIGIBLE'
      : generation.record.findings[0]?.eligibilityReasonCode !== 'ELIGIBLE'
  };
  let checks;
  if (goldenCase.role === 'LIVE_QUALITY') {
    checks = {
      expectedBehavior: goldenCase.expected.actionExpected
        ? raw.outcome === 'ACTIONABLE' : raw.outcome === 'ABSTAIN',
      actionSupport: rawMetrics.unsupportedActionItemCount === 0
        && rawMetrics.ambiguousActionItemCount === 0,
      evidenceGrounding: rawMetrics.evidenceRefCount === rawMetrics.matchedEvidenceRefCount,
      exactExcerpts: rawMetrics.itemCount === rawMetrics.exactExcerptItemCount
    };
  } else if (goldenCase.role === 'RECORDED_CONTAINMENT') {
    checks = {
      trustDecision: raw.trustDecision === goldenCase.recordedExpected.expectedTrustDecision
        && raw.trustDetailCode === goldenCase.recordedExpected.expectedDetailCode,
      containment: goldenCase.recordedExpected.unsafe
        ? published.aiItemCount === 0 : published.outcome === 'generated'
    };
  } else {
    checks = {
      expectedFailure: generation.outcome === goldenCase.injectedExpected.finalOutcome
        && raw.trustDetailCode === goldenCase.injectedExpected.detailCode,
      failClosed: published.aiItemCount === 0
    };
  }
  const sharedChecks = {
    identityPreserved,
    locationsPreserved: preservation.locationsPreserved,
    humanReviewCorrect: preservation.humanReviewCorrect,
    aiOwnsNoLocation: preservation.aiOwnsNoLocation,
    versionUncertaintyPreserved: preservation.versionUncertaintyPreserved,
    eligibilityCorrect: preservation.eligibilityCorrect,
    deterministicReplay: deterministicReplayPassed === true
  };
  const allChecks = { ...checks, ...sharedChecks };
  return {
    id: goldenCase.id,
    role: goldenCase.role,
    ecosystem: baseCase.ecosystem,
    expected: goldenCase.role === 'LIVE_QUALITY'
      ? { actionExpected: goldenCase.expected.actionExpected }
      : goldenCase.role === 'RECORDED_CONTAINMENT'
        ? structuredClone(goldenCase.recordedExpected)
        : structuredClone(goldenCase.injectedExpected),
    raw: {
      outcome: raw.outcome,
      trustDecision: raw.trustDecision,
      trustDetailCode: raw.trustDetailCode,
      ...rawMetrics
    },
    published: { outcome: generation.outcome, ...published },
    preservation,
    deterministicReplayPassed: deterministicReplayPassed === true,
    checks: allChecks,
    retainedFailureDetails: retainedDetails(
      goldenCase, raw, context, rawMetrics, published, retainFailureDetails
    ),
    passed: Object.values(allChecks).every((value) => value === true)
  };
}
