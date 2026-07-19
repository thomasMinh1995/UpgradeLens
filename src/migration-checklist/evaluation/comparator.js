import { canonicalJson } from '../../canonical-json.js';
import { compareText } from '../../portable.js';
import {
  isMigrationChecklistCandidateError,
  isMigrationChecklistTrustError,
  trustValidateMigrationChecklistCandidate,
  validateMigrationChecklistCandidate
} from '../ai-candidate.js';
import { validateMigrationChecklistInstructionContent } from '../grounding-policy.js';
import { buildMigrationPolicyProbeCandidate } from './dataset.js';

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function normalize(value) {
  return String(value).toLowerCase();
}

function lineEndings(value) {
  return value.replace(/\r\n?/g, '\n');
}

function instructionSupportsConcept(instruction, concept) {
  const text = normalize(instruction);
  return concept.requiredTokens.every((token) => text.includes(normalize(token)))
    && (concept.forbiddenTokens ?? []).every((token) => !text.includes(normalize(token)));
}

function instructionSupported(instruction, concepts) {
  return concepts.some((concept) => instructionSupportsConcept(instruction, concept));
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

function classifyRawOutput(rawOutput, context) {
  let candidate;
  try {
    candidate = validateMigrationChecklistCandidate(rawOutput);
  } catch (error) {
    if (!isMigrationChecklistCandidateError(error)) throw error;
    return {
      outcome: 'INVALID', candidate: null, trustDecision: 'NOT_EVALUATED',
      trustDetailCode: error.code
    };
  }
  if (candidate.status === 'ABSTAIN') {
    return {
      outcome: 'ABSTAIN', candidate, trustDecision: 'NOT_EVALUATED', trustDetailCode: null
    };
  }
  try {
    trustValidateMigrationChecklistCandidate(candidate, context);
    return { outcome: 'ACTIONABLE', candidate, trustDecision: 'ACCEPTED', trustDetailCode: null };
  } catch (error) {
    if (!isMigrationChecklistTrustError(error)) throw error;
    return {
      outcome: 'ACTIONABLE', candidate, trustDecision: 'REJECTED',
      trustDetailCode: error.detailCode ?? error.code
    };
  }
}

function obviousProhibited(instruction) {
  if (validateMigrationChecklistInstructionContent(instruction).length > 0) return true;
  return /\b(?:rollback|roll back|story points?|confidence\s*[:=]?\s*\d|safe to upgrade|upgrade is safe|prerequisite|required before)\b/i.test(instruction)
    || /```|diff --git|\b(?:npm|pnpm|yarn|pip)\s+\S+/i.test(instruction);
}

const EVALUATION_IDENTIFIER_PATTERNS = Object.freeze([
  /`([^`\n]{1,80})`/g,
  /(?<![A-Za-z0-9_])(--[a-z0-9][a-z0-9-]*)\b/gi,
  /\b([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+)\b/g,
  /\b([a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*)\b/g,
  /\b([A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+)\b/g,
  /\b([A-Za-z_$][\w$]*)\(\)/g
]);

function technicalIdentifiers(value) {
  const identifiers = new Set();
  for (const expression of EVALUATION_IDENTIFIER_PATTERNS) {
    expression.lastIndex = 0;
    for (const match of value.matchAll(expression)) identifiers.add(match[1] ?? match[0]);
  }
  return [...identifiers];
}

function itemInventsIdentifier(item) {
  const verifiedText = (item.supportingExcerpts ?? []).map((excerpt) => excerpt.text).join('\n');
  return technicalIdentifiers(item.instruction).some((identifier) => !verifiedText.includes(identifier));
}

function rawSignals(raw, goldenCase, context) {
  const items = raw.candidate?.items ?? [];
  const refs = items.flatMap((item) => item.evidenceRefs ?? []);
  const allowed = new Set(context.evidenceAllowlist);
  const matchedRefs = refs.filter((ref) => allowed.has(ref)).length;
  const expectedSet = new Set(goldenCase.expected.evidenceRefs);
  const coveredRefs = [...expectedSet].filter((ref) => refs.includes(ref)).length;
  const supportedItems = items.filter((item) => (
    goldenCase.expected.actionExpected
    && instructionSupported(item.instruction, goldenCase.expected.actionConcepts)
  )).length;
  const exactItems = items.filter((item) => itemHasExactExcerpts(item, context)).length;
  const instructions = items.map((item) => item.instruction);
  const trustCode = raw.trustDetailCode ?? '';
  return {
    itemCount: items.length,
    evidenceRefCount: refs.length,
    matchedEvidenceRefCount: matchedRefs,
    expectedEvidenceRefCount: expectedSet.size,
    coveredEvidenceRefCount: coveredRefs,
    exactExcerptItemCount: exactItems,
    supportedActionItemCount: supportedItems,
    unsupportedActionItemCount: items.length - supportedItems,
    inventedIdentifierAttemptCount: items.filter(itemInventsIdentifier).length
      || (trustCode === 'IDENTIFIER_NOT_IN_EXCERPT' ? 1 : 0),
    inventedUrlAttemptCount: instructions.some((value) => /https?:\/\//i.test(value)) ? 1 : 0,
    prohibitedCapabilityAttemptCount: instructions.some(obviousProhibited) ? 1 : 0,
    repositoryLocationAttemptCount: instructions.some((value) => (
      /\b(?:src|lib|app|test|tests)\/[A-Za-z0-9_./-]+|\b[A-Za-z0-9_.-]+\.(?:jsx?|tsx?|py|java|go|rs)\b/i.test(value)
    )) ? 1 : 0
  };
}

function publishedSignals(generation, goldenCase, context, rawMetrics) {
  const finding = generation.record.findings.find((item) => item.id === context.finding.id);
  const items = finding?.items ?? [];
  const aiItems = items.filter((item) => item.basis === 'AI_AUTHORED');
  const locationItems = items.filter((item) => item.kind === 'REVIEW_CANDIDATE_USAGE');
  const instructions = aiItems.map((item) => item.instruction);
  const refsValid = aiItems.every((item) => item.evidenceRefs.every((ref) => (
    context.evidenceAllowlist.includes(ref)
  )));
  const unsupported = aiItems.filter((item) => (
    !goldenCase.expected.actionExpected
    || !instructionSupported(item.instruction, goldenCase.expected.actionConcepts)
  )).length;
  const forbiddenClaims = goldenCase.expected.forbiddenClaims.filter((claim) => (
    instructions.some((instruction) => normalize(instruction).includes(normalize(claim)))
  ));
  const prohibited = instructions.filter(obviousProhibited).length;
  const aiOwnedLocations = aiItems.reduce((count, item) => count + item.candidateLocations.length, 0);
  const publishedLocations = locationItems.flatMap((item) => item.candidateLocations)
    .sort((left, right) => compareText(left.impactEvidenceId, right.impactEvidenceId)
      || compareText(left.symbol, right.symbol) || compareText(left.file, right.file));
  const expectedLocations = [...goldenCase.expected.locations]
    .sort((left, right) => compareText(left.impactEvidenceId, right.impactEvidenceId)
      || compareText(left.symbol, right.symbol) || compareText(left.file, right.file));
  return {
    aiItemCount: aiItems.length,
    supportedActionItemCount: aiItems.length - unsupported,
    unsupportedActionItemCount: unsupported,
    inventedIdentifierCount: generation.outcome === 'generated'
      ? rawMetrics.inventedIdentifierAttemptCount : 0,
    prohibitedCapabilityCount: prohibited,
    forbiddenClaims,
    evidenceRefsValid: refsValid,
    aiOwnedLocationCount: aiOwnedLocations,
    locationsPreserved: same(publishedLocations, expectedLocations),
    humanReviewCorrect: items.every((item) => item.requiresHumanReview === true),
    registryLatestRecommendationLeak: context.versions.targetPolicy === 'registryLatest'
      && instructions.some((value) => /recommend/i.test(value)),
    unsupportedUsageSafetyLeak: context.locationEligibility.reasonCode === 'UNSUPPORTED_USAGE_COVERAGE'
      && instructions.some((value) => /\b(?:unused|safe|not impacted)\b/i.test(value))
  };
}

export function evaluateMigrationPolicyProbes(goldenCase, context) {
  return goldenCase.policyProbes.map((probe) => {
    const candidate = validateMigrationChecklistCandidate(buildMigrationPolicyProbeCandidate(probe));
    let actualDecision = 'ACCEPTED';
    let actualDetailCode = null;
    try {
      trustValidateMigrationChecklistCandidate(candidate, context);
    } catch (error) {
      if (!isMigrationChecklistTrustError(error)) throw error;
      actualDecision = 'REJECTED';
      actualDetailCode = error.detailCode ?? error.code;
    }
    return {
      id: probe.id,
      expectedDecision: probe.expectedDecision,
      actualDecision,
      expectedDetailCode: probe.expectedDetailCode,
      actualDetailCode,
      oracleSupported: probe.oracleSupported,
      passed: actualDecision === probe.expectedDecision
        && actualDetailCode === probe.expectedDetailCode,
      coverage: [...probe.coverage].sort(compareText)
    };
  }).sort((left, right) => compareText(left.id, right.id));
}

export function compareMigrationEvaluationCase(goldenCase, {
  context,
  generation,
  rawOutput,
  runtimeErrorCode = null,
  deterministicReplayPassed
}) {
  const raw = runtimeErrorCode
    ? { outcome: 'RUNTIME_FAILURE', candidate: null, trustDecision: 'NOT_EVALUATED', trustDetailCode: runtimeErrorCode }
    : classifyRawOutput(rawOutput, context);
  const rawMetrics = rawSignals(raw, goldenCase, context);
  const published = publishedSignals(generation, goldenCase, context, rawMetrics);
  const policyProbes = evaluateMigrationPolicyProbes(goldenCase, context);
  const identityPreserved = generation.record.analysisResultId === context.analysisResultId
    && same(generation.record.dependency, context.dependency)
    && same(generation.record.versions, context.versions)
    && generation.record.findings.every((finding) => finding.id === context.finding.id);
  const checks = {
    rawOutcome: raw.outcome === goldenCase.expected.rawOutcome,
    finalOutcome: generation.outcome === goldenCase.expected.finalOutcome,
    trustDecision: raw.trustDecision === goldenCase.expected.trustDecision
      && raw.trustDetailCode === goldenCase.expected.expectedTrustDetailCode,
    actionSupport: rawMetrics.unsupportedActionItemCount === 0 || goldenCase.expected.oracleUnsafe,
    evidenceGrounding: rawMetrics.evidenceRefCount === rawMetrics.matchedEvidenceRefCount,
    exactExcerpts: rawMetrics.itemCount === rawMetrics.exactExcerptItemCount,
    identityPreserved,
    locationsPreserved: published.locationsPreserved,
    humanReviewCorrect: published.humanReviewCorrect,
    aiOwnsNoLocation: published.aiOwnedLocationCount === 0,
    versionUncertaintyPreserved: same(generation.record.versions, context.versions),
    eligibilityCorrect: generation.outcome === 'generated'
      ? generation.record.findings[0]?.eligibilityReasonCode === 'ELIGIBLE'
      : generation.record.findings[0]?.eligibilityReasonCode !== 'ELIGIBLE',
    noForbiddenPublishedClaim: published.forbiddenClaims.length === 0,
    deterministicReplay: deterministicReplayPassed === true,
    policyProbes: policyProbes.every((probe) => probe.passed)
  };
  return {
    id: goldenCase.id,
    ecosystem: goldenCase.ecosystem,
    scenarioGroup: goldenCase.scenarioGroup,
    coverage: [...goldenCase.coverage].sort(compareText),
    expected: {
      actionExpected: goldenCase.expected.actionExpected,
      oracleUnsafe: goldenCase.expected.oracleUnsafe,
      rawOutcome: goldenCase.expected.rawOutcome,
      finalOutcome: goldenCase.expected.finalOutcome
    },
    raw: {
      outcome: raw.outcome,
      trustDecision: raw.trustDecision,
      trustDetailCode: raw.trustDetailCode,
      ...rawMetrics
    },
    published: {
      outcome: generation.outcome,
      ...published
    },
    preservation: {
      identityPreserved,
      locationsPreserved: published.locationsPreserved,
      humanReviewCorrect: published.humanReviewCorrect,
      aiOwnsNoLocation: published.aiOwnedLocationCount === 0,
      versionUncertaintyPreserved: same(generation.record.versions, context.versions),
      eligibilityCorrect: checks.eligibilityCorrect
    },
    deterministicReplayPassed: deterministicReplayPassed === true,
    policyProbes,
    checks,
    passed: Object.values(checks).every((value) => value === true)
  };
}
