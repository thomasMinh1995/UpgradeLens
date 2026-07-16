import Ajv2020 from 'ajv/dist/2020.js';

import { AI_RUNTIME_CONTRACT_VERSION, validateAiRuntime } from './ai-runtime.js';
import { isAiRuntimeError } from './ai-runtime-error.js';
import {
  BASELINE_UNSUPPORTED_WARNING_CODE,
  MISSING_TARGET_WARNING_CODE
} from './dependency-ai-context.js';
import { compareText } from './portable.js';

export const AI_VERSION_ANALYSIS_RESULT_VERSION = '1';
export const VERSION_ANALYSIS_PROMPT_VERSION = '1';
export const VERSION_ANALYSIS_TASK = 'version-analysis.v1';
export const VERSION_ANALYSIS_SCHEMA_NAME = 'upgradelens_version_analysis';

const SAFE_RUNTIME_FAILURE_SUMMARIES = Object.freeze({
  CONFIGURATION_ERROR: 'AI runtime configuration is invalid.',
  AUTH_ERROR: 'AI provider rejected authentication.',
  ACCESS_DENIED: 'AI provider denied access to the requested resource.',
  INSUFFICIENT_CREDIT: 'AI provider reported insufficient credit.',
  INVALID_REQUEST: 'AI provider rejected the request parameters.',
  MODEL_NOT_FOUND: 'Configured AI model was not found.',
  NETWORK_ERROR: 'AI provider network request failed.',
  TIMEOUT: 'AI provider request timed out.',
  CANCELLED: 'AI provider request was cancelled.',
  RATE_LIMITED: 'AI provider rate limit was reached.',
  PROVIDER_UNAVAILABLE: 'AI provider is temporarily unavailable.',
  SCHEMA_REJECTED: 'AI provider rejected the required output schema.',
  STRUCTURED_OUTPUT_UNSUPPORTED: 'AI provider does not support the required structured output mode.',
  INVALID_RESPONSE: 'AI provider returned an invalid response.',
  OUTPUT_TRUNCATED: 'AI provider output was truncated.',
  CONTENT_REFUSED: 'AI provider refused the requested content.',
  RESPONSE_TOO_LARGE: 'AI provider response exceeded the configured size limit.',
  PROVIDER_ERROR: 'AI provider returned an unsuccessful response.',
  IDENTITY_MISMATCH: 'AI provider returned an unexpected model identity.',
  UNKNOWN: 'AI runtime returned an unknown failure.'
});

export const AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'summaryEvidenceRefs', 'riskLevel', 'riskEvidenceRefs', 'findings'],
  properties: {
    summary: { type: 'string', minLength: 1 },
    summaryEvidenceRefs: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }
    },
    riskLevel: { enum: ['low', 'medium', 'high', 'unknown'] },
    riskEvidenceRefs: {
      type: 'array',
      uniqueItems: true,
      items: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'summary', 'appliesToVersions', 'evidenceRefs'],
        properties: {
          id: { type: 'string', minLength: 1 },
          kind: { enum: ['breakingChange', 'deprecation', 'compatibility'] },
          summary: { type: 'string', minLength: 1 },
          appliesToVersions: {
            type: 'array',
            uniqueItems: true,
            items: { type: 'string', minLength: 1 }
          },
          evidenceRefs: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: { type: 'string', pattern: '^sha256:[a-f0-9]{64}$' }
          }
        }
      }
    }
  }
};

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
const validateCandidateSchema = ajv.compile(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);

const REVIEW_REASON_ORDER = [
  'HIGH_RISK',
  'UNKNOWN_RISK',
  'EVIDENCE_NONE',
  'EVIDENCE_PARTIAL',
  'SOURCE_STALE',
  'SOURCE_CONFLICT',
  'VERSION_UNCERTAIN',
  'CLAIMS_DROPPED',
  'ANALYSIS_FAILED'
];

function sortedUnique(values) {
  return [...new Set(values)].sort((left, right) => {
    const leftIndex = REVIEW_REASON_ORDER.indexOf(left);
    const rightIndex = REVIEW_REASON_ORDER.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? 999 : leftIndex) - (rightIndex === -1 ? 999 : rightIndex);
    }
    return compareText(left, right);
  });
}

function selectedEvidenceIds(context) {
  return new Set(context.metadata?.selectedEvidenceIds ?? context.knowledge.evidence.map((item) => item.id));
}

function selectedSourceUrls(context) {
  return new Set(context.knowledge.evidence.map((item) => item.sourceUrl).filter(Boolean));
}

function materialUrls(value) {
  if (typeof value !== 'string') return [];
  return value.match(/https?:\/\/[^\s)"']+/g) ?? [];
}

function filterRefs(refs, allowed) {
  const valid = [];
  const invalid = [];
  for (const ref of refs ?? []) {
    if (allowed.has(ref)) valid.push(ref);
    else invalid.push(ref);
  }
  return {
    valid: [...new Set(valid)].sort(compareText),
    invalid: [...new Set(invalid)].sort(compareText)
  };
}

function unsupportedUrlFound(candidate, context) {
  const allowedUrls = selectedSourceUrls(context);
  const urls = [
    ...materialUrls(candidate.summary),
    ...candidate.findings.flatMap((finding) => materialUrls(finding.summary))
  ];
  return urls.some((url) => !allowedUrls.has(url));
}

function contextHasWarning(context, code) {
  return (context.metadata?.warnings ?? []).some((warning) => warning.code === code);
}

function contextValidationWarningCodes(context) {
  const codes = [];
  if (contextHasWarning(context, 'SOURCE_CONFLICT')) codes.push('SOURCE_CONFLICT');
  return codes;
}

function addLimitation(limitations, code, message) {
  if (!limitations.some((item) => item.code === code)) {
    limitations.push({ code, message });
  }
}

function emptyClaims(context, status, validationStatus, warningCodes, limitationCode, message) {
  const riskLevel = 'unknown';
  const validationWarningCodes = sortedUnique([
    ...warningCodes,
    ...contextValidationWarningCodes(context)
  ]);
  const humanReview = humanReviewPolicy({
    context,
    riskLevel,
    evidenceCoverage: context.knowledge.evidence.length === 0 ? 'none' : 'partial',
    validationWarningCodes,
    status
  });
  return {
    resultVersion: AI_VERSION_ANALYSIS_RESULT_VERSION,
    status,
    contextId: context.contextId,
    dependency: structuredClone(context.dependency),
    versions: structuredClone(context.versions),
    summary: message,
    summaryEvidenceRefs: [],
    riskLevel,
    riskEvidenceRefs: [],
    findings: [],
    evidenceCoverage: context.knowledge.evidence.length === 0 ? 'none' : 'partial',
    validation: {
      status: validationStatus,
      warningCodes: validationWarningCodes
    },
    requiresHumanReview: humanReview.requiresHumanReview,
    humanReviewReasons: humanReview.humanReviewReasons,
    nextAction: status === 'skipped' && validationWarningCodes.includes(BASELINE_UNSUPPORTED_WARNING_CODE)
      ? 'resolveCurrentVersion'
      : status === 'skipped' && validationWarningCodes.includes(MISSING_TARGET_WARNING_CODE)
        ? 'provideExplicitTarget'
      : status === 'skipped'
        ? 'collectEvidence'
        : 'retryAnalysis',
    limitations: [{ code: limitationCode, message }]
  };
}

function parseRuntimeOutput(output) {
  if (typeof output !== 'string') return output;
  try {
    return JSON.parse(output);
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function validateStructuredOutput(output) {
  if (!validateCandidateSchema(output)) {
    throw new Error(ajv.errorsText(validateCandidateSchema.errors, { separator: '; ' }));
  }
  return output;
}

export function buildVersionAnalysisPrompt({
  context,
  outputSchema = AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA,
  promptVersion = VERSION_ANALYSIS_PROMPT_VERSION
}) {
  return {
    promptVersion,
    system: [
      'You are UpgradeLens AI Version Analysis.',
      'Analyze dependency release-level risk using only the supplied Dependency AI Context.',
      'Do not infer source-code impact, migration plans, installed versions, URLs, or evidence.',
      'Return only JSON that satisfies the structured output schema.'
    ].join('\n'),
    user: [
      'Rules:',
      '- Use only evidence items present in context.knowledge.evidence.',
      '- Cite evidence only by existing evidence id.',
      '- Do not create URLs, source ids, evidence ids, versions, or package facts.',
      '- Do not guess currentVersion; if it is null, treat the baseline as unresolved.',
      '- Do not analyze source code and do not propose a migration plan.',
      '- Keep the analysis generic across package ecosystems.',
      '',
      'Structured output schema:',
      JSON.stringify(outputSchema),
      '',
      'Dependency AI Context:',
      JSON.stringify(context)
    ].join('\n')
  };
}

export function trustValidateAiVersionAnalysisCandidate(candidate, context) {
  const allowed = selectedEvidenceIds(context);
  const warningCodes = [];
  const limitations = [];
  let summary = candidate.summary;
  let riskLevel = candidate.riskLevel;

  const summaryRefs = filterRefs(candidate.summaryEvidenceRefs, allowed);
  const riskRefs = filterRefs(candidate.riskEvidenceRefs, allowed);
  let findings = candidate.findings.map((finding) => {
    const refs = filterRefs(finding.evidenceRefs, allowed);
    if (refs.invalid.length > 0) warningCodes.push('EVIDENCE_REFERENCE_INVALID');
    if (refs.valid.length === 0) {
      warningCodes.push('CLAIMS_DROPPED');
      return null;
    }
    return {
      id: finding.id,
      kind: finding.kind,
      summary: finding.summary,
      appliesToVersions: [...finding.appliesToVersions].sort(compareText),
      evidenceRefs: refs.valid
    };
  }).filter(Boolean);

  if (summaryRefs.invalid.length > 0 || riskRefs.invalid.length > 0) {
    warningCodes.push('EVIDENCE_REFERENCE_INVALID');
  }
  if (summaryRefs.valid.length === 0) {
    summary = 'AI summary was removed because it was not supported by selected evidence.';
    warningCodes.push('CLAIMS_DROPPED');
  }
  if (riskLevel !== 'unknown' && riskRefs.valid.length === 0) {
    riskLevel = 'unknown';
    warningCodes.push('CLAIMS_DROPPED');
  }
  if (unsupportedUrlFound(candidate, context)) {
    summary = 'AI claims were limited because the candidate introduced a URL outside selected evidence.';
    riskLevel = 'unknown';
    findings = [];
    warningCodes.push('INVENTED_URL', 'CLAIMS_DROPPED');
  }
  if (contextHasWarning(context, 'SOURCE_CONFLICT')) {
    if (riskLevel !== 'unknown') riskLevel = 'unknown';
    warningCodes.push('SOURCE_CONFLICT');
    addLimitation(
      limitations,
      'SOURCE_CONFLICT',
      'Risk was downgraded because selected evidence has unresolved source conflicts.'
    );
  }
  if (warningCodes.includes('CLAIMS_DROPPED')) {
    addLimitation(
      limitations,
      'CLAIMS_DROPPED',
      'One or more AI claims were removed or downgraded because selected evidence did not support them.'
    );
  }
  if (warningCodes.includes('EVIDENCE_REFERENCE_INVALID')) {
    addLimitation(
      limitations,
      'EVIDENCE_REFERENCE_INVALID',
      'The AI candidate referenced evidence outside the selected context.'
    );
  }
  if (warningCodes.includes('INVENTED_URL')) {
    addLimitation(
      limitations,
      'INVENTED_URL',
      'The AI candidate introduced a URL that was not present in selected evidence.'
    );
  }

  const evidenceCoverage = context.knowledge.evidence.length === 0
    ? 'none'
    : warningCodes.length > 0 || context.metadata.warnings.length > 0
      ? 'partial'
      : 'sufficient';
  const validationWarningCodes = sortedUnique(warningCodes);
  const humanReview = humanReviewPolicy({
    context,
    riskLevel,
    evidenceCoverage,
    validationWarningCodes,
    status: 'analyzed'
  });

  return {
    resultVersion: AI_VERSION_ANALYSIS_RESULT_VERSION,
    status: 'analyzed',
    contextId: context.contextId,
    dependency: structuredClone(context.dependency),
    versions: structuredClone(context.versions),
    summary,
    summaryEvidenceRefs: summaryRefs.valid,
    riskLevel,
    riskEvidenceRefs: riskLevel === 'unknown' ? [] : riskRefs.valid,
    findings,
    evidenceCoverage,
    validation: {
      status: validationWarningCodes.length > 0 ? 'validWithWarnings' : 'valid',
      warningCodes: validationWarningCodes
    },
    requiresHumanReview: humanReview.requiresHumanReview,
    humanReviewReasons: humanReview.humanReviewReasons,
    nextAction: humanReview.requiresHumanReview ? 'reviewBeforeImpactAnalysis' : 'proceedToImpactAnalysis',
    limitations
  };
}

export function humanReviewPolicy({
  context,
  riskLevel,
  evidenceCoverage,
  validationWarningCodes = [],
  status = 'analyzed'
}) {
  const reasons = [];
  if (status !== 'analyzed') reasons.push('ANALYSIS_FAILED');
  if (riskLevel === 'high') reasons.push('HIGH_RISK');
  if (riskLevel === 'unknown') reasons.push('UNKNOWN_RISK');
  if (evidenceCoverage === 'none') reasons.push('EVIDENCE_NONE');
  if (evidenceCoverage === 'partial') reasons.push('EVIDENCE_PARTIAL');
  if (['declaredConstraint', 'unsupportedBaseline'].includes(context.versions.analysisMode)) {
    reasons.push('VERSION_UNCERTAIN');
  }
  for (const warning of context.metadata.warnings ?? []) {
    if (warning.code === 'SOURCE_STALE') reasons.push('SOURCE_STALE');
    if (warning.code === 'SOURCE_CONFLICT') reasons.push('SOURCE_CONFLICT');
    if (warning.code === 'EVIDENCE_MISSING') reasons.push('EVIDENCE_NONE');
    if (warning.code === BASELINE_UNSUPPORTED_WARNING_CODE) reasons.push('VERSION_UNCERTAIN');
  }
  if (validationWarningCodes.some((code) =>
    ['CLAIMS_DROPPED', 'EVIDENCE_REFERENCE_INVALID', 'INVENTED_URL'].includes(code)
  )) {
    reasons.push('CLAIMS_DROPPED');
  }
  return {
    requiresHumanReview: reasons.length > 0,
    humanReviewReasons: sortedUnique(reasons)
  };
}

export async function analyzeDependencyAiContext(context, {
  runtime,
  runId = `run:${context.contextId}`,
  promptVersion = VERSION_ANALYSIS_PROMPT_VERSION,
  outputSchema = AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA
} = {}) {
  if ((context.metadata?.missingInformation ?? []).includes('baseline')
    || contextHasWarning(context, BASELINE_UNSUPPORTED_WARNING_CODE)) {
    return emptyClaims(
      context,
      'skipped',
      'validWithWarnings',
      [BASELINE_UNSUPPORTED_WARNING_CODE],
      BASELINE_UNSUPPORTED_WARNING_CODE,
      'AI analysis was skipped because no supported current-version baseline was available.'
    );
  }
  if ((context.metadata?.missingInformation ?? []).includes('targetVersion')
    || contextHasWarning(context, MISSING_TARGET_WARNING_CODE)) {
    return emptyClaims(
      context,
      'skipped',
      'validWithWarnings',
      [MISSING_TARGET_WARNING_CODE],
      MISSING_TARGET_WARNING_CODE,
      'AI analysis was skipped because no target version was available. Provide an explicit target or collect target evidence.'
    );
  }
  if (context.knowledge.evidence.length === 0) {
    return emptyClaims(
      context,
      'skipped',
      'validWithWarnings',
      ['EVIDENCE_MISSING'],
      'EVIDENCE_MISSING',
      'AI analysis was skipped because no selected evidence was available.'
    );
  }
  validateAiRuntime(runtime);

  const prompt = buildVersionAnalysisPrompt({ context, outputSchema, promptVersion });
  let runtimeResult;
  try {
    runtimeResult = await runtime.generateStructured({
      contractVersion: AI_RUNTIME_CONTRACT_VERSION,
      runId,
      contextId: context.contextId,
      task: VERSION_ANALYSIS_TASK,
      promptVersion,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      structuredOutput: {
        mode: 'jsonSchema',
        name: VERSION_ANALYSIS_SCHEMA_NAME,
        schema: outputSchema
      }
    });
  } catch (error) {
    const code = isAiRuntimeError(error) ? error.code : 'UNKNOWN';
    const status = isAiRuntimeError(error) && Number.isInteger(error.status)
      ? ` (HTTP ${error.status})`
      : '';
    const summary = SAFE_RUNTIME_FAILURE_SUMMARIES[code] ?? SAFE_RUNTIME_FAILURE_SUMMARIES.UNKNOWN;
    return emptyClaims(
      context,
      'failed',
      'invalid',
      [code],
      code,
      `AI runtime failed with ${code}${status}: ${summary}`
    );
  }

  try {
    const candidate = validateStructuredOutput(parseRuntimeOutput(runtimeResult.output));
    return trustValidateAiVersionAnalysisCandidate(candidate, context);
  } catch (error) {
    const code = error.message === 'INVALID_JSON' ? 'OUTPUT_JSON_INVALID' : 'OUTPUT_SCHEMA_INVALID';
    return emptyClaims(
      context,
      'failed',
      'invalid',
      [code],
      code,
      code === 'OUTPUT_JSON_INVALID'
        ? 'AI runtime returned invalid JSON.'
        : `AI runtime output failed structured validation: ${error.message}`
    );
  }
}
