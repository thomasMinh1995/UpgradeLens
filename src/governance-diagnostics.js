import { compareText } from './portable.js';

export const GOVERNANCE_VALIDATION_STAGES = Object.freeze({
  LOAD_JSON: 1,
  SCHEMA_VALIDATION: 2,
  DIGEST_VERIFICATION: 3,
  CROSS_ARTIFACT_VALIDATION: 4,
  GOVERNANCE_POLICY_VALIDATION: 5,
  TASK_SCOPE_VALIDATION: 6
});

export const GOVERNANCE_DIAGNOSTIC_CODES = Object.freeze([
  'LOAD_ERROR',
  'INVALID_JSON',
  'INVALID_SCHEMA',
  'DIGEST_MISMATCH',
  'UNKNOWN_CAPABILITY',
  'UNKNOWN_DEPLOYMENT',
  'UNKNOWN_CONFORMANCE',
  'UNKNOWN_QUALIFICATION',
  'GOVERNANCE_POLICY_VIOLATION',
  'TASK_SCOPE_MISMATCH',
  'INVALID_CERTIFICATION_STATE',
  'UNSUPPORTED_STATUS_TRANSITION'
]);

const CODE_SET = new Set(GOVERNANCE_DIAGNOSTIC_CODES);
const ARTIFACT_ORDER = new Map([
  ['capabilityProfile', 0],
  ['deploymentProfile', 1],
  ['conformanceReport', 2],
  ['qualificationRecord', 3],
  ['bundle', 4]
]);

export function createGovernanceDiagnostic({ stage, code, artifact, path = '$', message }) {
  if (!Number.isInteger(stage) || stage < 1 || stage > 6) {
    throw new TypeError('Governance diagnostic stage must be an integer from 1 through 6.');
  }
  if (!CODE_SET.has(code)) throw new TypeError(`Unknown governance diagnostic code: ${code}.`);
  if (!ARTIFACT_ORDER.has(artifact)) throw new TypeError(`Unknown governance diagnostic artifact: ${artifact}.`);
  if (typeof path !== 'string' || path.length === 0 || typeof message !== 'string' || message.length === 0) {
    throw new TypeError('Governance diagnostic path and message are required.');
  }
  return { stage, code, artifact, path, message };
}

function compareDiagnostics(left, right) {
  return left.stage - right.stage
    || ARTIFACT_ORDER.get(left.artifact) - ARTIFACT_ORDER.get(right.artifact)
    || compareText(left.code, right.code)
    || compareText(left.path, right.path)
    || compareText(left.message, right.message);
}

export function sortGovernanceDiagnostics(diagnostics) {
  const unique = new Map();
  for (const diagnostic of diagnostics) {
    const validated = createGovernanceDiagnostic(diagnostic);
    const key = JSON.stringify(validated);
    if (!unique.has(key)) unique.set(key, validated);
  }
  return [...unique.values()].sort(compareDiagnostics);
}
