import assert from 'node:assert/strict';
import test from 'node:test';

import { compareEvaluationResult } from '../src/index.js';

const evidenceId = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

function goldenCase(expected = {}) {
  return {
    id: 'node/example-pass',
    title: 'Example pass',
    category: 'low-risk',
    dependency: { ecosystem: 'node' },
    expectedResult: {
      riskLevel: 'low',
      requiresHumanReview: false,
      humanReviewReasons: [],
      evidenceCoverage: 'sufficient',
      validation: { status: 'valid', warningCodes: [] },
      expectedEvidenceRefs: {
        summary: [evidenceId],
        risk: [evidenceId],
        findings: []
      },
      expectedFindings: [],
      ...expected
    }
  };
}

function result(overrides = {}) {
  return {
    status: 'analyzed',
    summary: 'Patch release with no documented breaking changes.',
    summaryEvidenceRefs: [evidenceId],
    riskLevel: 'low',
    riskEvidenceRefs: [evidenceId],
    findings: [],
    evidenceCoverage: 'sufficient',
    validation: { status: 'valid', warningCodes: [] },
    requiresHumanReview: false,
    humanReviewReasons: [],
    ...overrides
  };
}

test('comparator passes matching risk, review, evidence refs, validation, and non-empty summary', () => {
  const comparison = compareEvaluationResult(goldenCase(), result());

  assert.equal(comparison.passed, true);
  assert.equal(comparison.checks.summaryPresent.passed, true);
  assert.equal(comparison.checks.riskLevel.passed, true);
  assert.equal(comparison.checks.evidenceReferences.passed, true);
});

test('comparator fails risk mismatch without exact summary comparison', () => {
  const comparison = compareEvaluationResult(goldenCase(), result({
    summary: 'Different but still non-empty summary.',
    riskLevel: 'medium'
  }));

  assert.equal(comparison.passed, false);
  assert.equal(comparison.checks.summaryPresent.passed, true);
  assert.equal(comparison.checks.riskLevel.passed, false);
  assert.equal(comparison.checks.riskLevel.expected, 'low');
  assert.equal(comparison.checks.riskLevel.actual, 'medium');
});

test('comparator validates expected finding kind, version, refs, and required keywords', () => {
  const comparison = compareEvaluationResult(goldenCase({
    riskLevel: 'high',
    requiresHumanReview: true,
    humanReviewReasons: ['HIGH_RISK'],
    expectedEvidenceRefs: {
      summary: [evidenceId],
      risk: [evidenceId],
      findings: [evidenceId]
    },
    expectedFindings: [
      {
        kind: 'breakingChange',
        appliesToVersions: ['2.0.0'],
        evidenceRefs: [evidenceId],
        requiredKeywords: ['breaking']
      }
    ]
  }), result({
    riskLevel: 'high',
    riskEvidenceRefs: [evidenceId],
    requiresHumanReview: true,
    humanReviewReasons: ['HIGH_RISK'],
    findings: [
      {
        id: 'finding-1',
        kind: 'breakingChange',
        summary: 'Documented breaking behavior.',
        appliesToVersions: ['2.0.0'],
        evidenceRefs: [evidenceId]
      }
    ]
  }));

  assert.equal(comparison.passed, true);
  assert.equal(comparison.checks.findings.passed, true);
});
