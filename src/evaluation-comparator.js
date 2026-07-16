import { AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA } from './ai-version-analysis.js';
import { compareText } from './portable.js';

const candidateRequiredFields = new Set(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA.required);

function sorted(values = []) {
  return [...values].sort(compareText);
}

function uniqueRefs(values = []) {
  return sorted([...new Set(values)]);
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function check(passed, expected, actual, message) {
  return {
    passed,
    ...(expected !== undefined ? { expected } : {}),
    ...(actual !== undefined ? { actual } : {}),
    ...(message ? { message } : {})
  };
}

function flattenFindingRefs(findings = []) {
  return uniqueRefs(findings.flatMap((finding) => finding.evidenceRefs ?? []));
}

function evidenceReferenceActual(result) {
  return {
    summary: uniqueRefs(result.summaryEvidenceRefs),
    risk: uniqueRefs(result.riskEvidenceRefs),
    findings: flattenFindingRefs(result.findings)
  };
}

function findingExpectationActual(result) {
  return result.findings.map((finding) => ({
    kind: finding.kind,
    appliesToVersions: sorted(finding.appliesToVersions),
    evidenceRefs: uniqueRefs(finding.evidenceRefs),
    summary: finding.summary
  })).sort((left, right) =>
    compareText(left.kind, right.kind)
    || compareText(left.appliesToVersions.join('\0'), right.appliesToVersions.join('\0'))
    || compareText(left.evidenceRefs.join('\0'), right.evidenceRefs.join('\0'))
  );
}

function findingExpected(expectedResult) {
  return expectedResult.expectedFindings.map((finding) => ({
    kind: finding.kind,
    appliesToVersions: sorted(finding.appliesToVersions),
    evidenceRefs: uniqueRefs(finding.evidenceRefs),
    requiredKeywords: sorted(finding.requiredKeywords ?? [])
  })).sort((left, right) =>
    compareText(left.kind, right.kind)
    || compareText(left.appliesToVersions.join('\0'), right.appliesToVersions.join('\0'))
    || compareText(left.evidenceRefs.join('\0'), right.evidenceRefs.join('\0'))
  );
}

function findingsMatch(expected, actual) {
  if (expected.length !== actual.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    const left = expected[index];
    const right = actual[index];
    if (left.kind !== right.kind) return false;
    if (!equalJson(left.appliesToVersions, right.appliesToVersions)) return false;
    if (!equalJson(left.evidenceRefs, right.evidenceRefs)) return false;
    for (const keyword of left.requiredKeywords) {
      if (!right.summary.toLowerCase().includes(keyword.toLowerCase())) return false;
    }
  }
  return true;
}

function resultHasCandidateShape(result) {
  return [...candidateRequiredFields].every((field) => field in result)
    && typeof result.summary === 'string'
    && Array.isArray(result.findings)
    && Array.isArray(result.summaryEvidenceRefs)
    && Array.isArray(result.riskEvidenceRefs);
}

export function compareEvaluationResult(goldenCase, result) {
  const expected = goldenCase.expectedResult;
  const actualEvidenceRefs = evidenceReferenceActual(result);
  const expectedEvidenceRefs = {
    summary: uniqueRefs(expected.expectedEvidenceRefs.summary),
    risk: uniqueRefs(expected.expectedEvidenceRefs.risk),
    findings: uniqueRefs(expected.expectedEvidenceRefs.findings)
  };
  const expectedFindings = findingExpected(expected);
  const actualFindings = findingExpectationActual(result);
  const checks = {
    schema: check(resultHasCandidateShape(result), true, resultHasCandidateShape(result), 'AI result has required structured fields.'),
    summaryPresent: check(
      typeof result.summary === 'string' && result.summary.trim().length > 0,
      true,
      typeof result.summary === 'string' ? result.summary.trim().length > 0 : false
    ),
    riskLevel: check(result.riskLevel === expected.riskLevel, expected.riskLevel, result.riskLevel),
    humanReview: check(
      result.requiresHumanReview === expected.requiresHumanReview,
      expected.requiresHumanReview,
      result.requiresHumanReview
    ),
    humanReviewReasons: check(
      equalJson(sorted(expected.humanReviewReasons), sorted(result.humanReviewReasons)),
      sorted(expected.humanReviewReasons),
      sorted(result.humanReviewReasons)
    ),
    evidenceCoverage: check(
      result.evidenceCoverage === expected.evidenceCoverage,
      expected.evidenceCoverage,
      result.evidenceCoverage
    ),
    validationState: check(
      result.validation?.status === expected.validation.status
        && equalJson(sorted(expected.validation.warningCodes), sorted(result.validation?.warningCodes ?? [])),
      expected.validation,
      result.validation
    ),
    evidenceReferences: check(
      equalJson(expectedEvidenceRefs, actualEvidenceRefs),
      expectedEvidenceRefs,
      actualEvidenceRefs
    ),
    findings: check(
      findingsMatch(expectedFindings, actualFindings),
      expectedFindings,
      actualFindings.map((finding) => ({
        kind: finding.kind,
        appliesToVersions: finding.appliesToVersions,
        evidenceRefs: finding.evidenceRefs
      }))
    )
  };
  const passed = Object.values(checks).every((item) => item.passed);
  return {
    id: goldenCase.id,
    title: goldenCase.title,
    category: goldenCase.category,
    ecosystem: goldenCase.dependency.ecosystem,
    passed,
    checks,
    actual: {
      status: result.status,
      riskLevel: result.riskLevel,
      requiresHumanReview: result.requiresHumanReview,
      evidenceCoverage: result.evidenceCoverage,
      validationStatus: result.validation?.status ?? 'unknown'
    }
  };
}
