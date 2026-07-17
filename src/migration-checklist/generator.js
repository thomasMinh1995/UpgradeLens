import { AI_RUNTIME_CONTRACT_VERSION, validateAiRuntime } from '../ai-runtime.js';
import { isAiRuntimeError } from '../ai-runtime-error.js';
import { canonicalJson } from '../canonical-json.js';
import { compareText } from '../portable.js';
import {
  isMigrationChecklistCandidateError,
  isMigrationChecklistTrustError,
  MIGRATION_CHECKLIST_CANDIDATE_SCHEMA,
  trustValidateMigrationChecklistCandidate,
  validateMigrationChecklistCandidate
} from './ai-candidate.js';
import {
  isMigrationExtractiveCandidateError,
  MIGRATION_EXTRACTIVE_CANDIDATE_SCHEMA,
  trustValidateMigrationExtractiveCandidate,
  validateMigrationExtractiveCandidate
} from './extractive-candidate.js';
import {
  buildMigrationExtractivePrompt,
  MIGRATION_EXTRACTIVE_PLANNING_TASK,
  MIGRATION_EXTRACTIVE_PROMPT_VERSION,
  MIGRATION_EXTRACTIVE_SCHEMA_NAME
} from './extractive-prompt.js';
import {
  MIGRATION_LOCATION_REASON_CODES,
  MIGRATION_TASK_CONTEXT_VERSION
} from './context-runtime.js';
import { migrationChecklistItemId } from './migration-checklist.js';
import {
  buildMigrationChecklistPrompt,
  MIGRATION_PLANNING_PROMPT_VERSION,
  MIGRATION_PLANNING_SCHEMA_NAME,
  MIGRATION_PLANNING_TASK
} from './prompt.js';

export const MIGRATION_GENERATION_RESULT_VERSION = '1';
export const MIGRATION_EXTRACTIVE_GENERATION_RESULT_VERSION = '2';
export const MIGRATION_GENERATION_WARNING_CODES = Object.freeze([
  'MODEL_ABSTAINED',
  'OUTPUT_JSON_INVALID',
  'OUTPUT_SCHEMA_INVALID',
  'OUTPUT_SEMANTICS_INVALID',
  'TRUST_VALIDATION_REJECTED',
  'AI_RUNTIME_FAILED'
]);

const DIGEST_EXPRESSION = /^sha256:[a-f0-9]{64}$/;
const ACTION_EVIDENCE_KINDS = new Set([
  'migrationGuide', 'breakingChanges', 'deprecations', 'releaseNotes', 'changelog'
]);

const compareLimitations = (left, right) => (
  compareText(left.code, right.code) || compareText(left.message, right.message)
);
const compareLocations = (left, right) => (
  compareText(left.impactEvidenceId, right.impactEvidenceId)
  || compareText(left.symbol, right.symbol)
  || compareText(left.file, right.file)
);
const compareRecords = (left, right) => (
  compareText(left.dependency.projectId, right.dependency.projectId)
  || compareText(left.dependency.manifest, right.dependency.manifest)
  || compareText(left.dependency.dependencyType, right.dependency.dependencyType)
  || compareText(left.dependency.packageId, right.dependency.packageId)
  || compareText(left.analysisResultId, right.analysisResultId)
);
const compareWarnings = (left, right) => (
  compareText(left.contextId, right.contextId)
  || compareText(left.code, right.code)
  || compareText(left.detailCode, right.detailCode)
);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function notifyContext(listener, event) {
  if (typeof listener !== 'function') return;
  try {
    listener(deepFreeze(structuredClone(event)));
  } catch {
    // Progress instrumentation must never alter checklist generation semantics.
  }
}

function sortedUniqueText(values = []) {
  return [...new Set(values)].sort(compareText);
}

function sortedUniqueLimitations(values = []) {
  const unique = new Map();
  for (const value of values) unique.set(`${value.code}\0${value.message}`, structuredClone(value));
  return [...unique.values()].sort(compareLimitations);
}

function inputError(message) {
  return new TypeError(`Migration Checklist Generator input error: ${message}`);
}

function assertString(value, field) {
  if (typeof value !== 'string' || value.length === 0) throw inputError(`${field} must be a non-empty string.`);
}

function validateEligibleContext(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    throw inputError('eligible context must be an object.');
  }
  if (context.contextVersion !== MIGRATION_TASK_CONTEXT_VERSION) {
    throw inputError(`contextVersion must be ${MIGRATION_TASK_CONTEXT_VERSION}.`);
  }
  if (!DIGEST_EXPRESSION.test(context.contextId)) throw inputError('contextId must be a SHA-256 digest.');
  if (!context.dependency || !context.versions || !context.finding) {
    throw inputError(`context ${context.contextId} is missing dependency, versions, or finding identity.`);
  }
  assertString(context.analysisResultId, 'analysisResultId');
  if (!DIGEST_EXPRESSION.test(context.analysisResultId)) {
    throw inputError('analysisResultId must be a SHA-256 digest.');
  }
  for (const field of [
    'projectId', 'packageId', 'declaredName', 'normalizedName', 'ecosystem', 'registry',
    'dependencyType', 'manifest'
  ]) {
    assertString(context.dependency[field], `dependency.${field}`);
  }
  if (context.versions.targetVersion === null) throw inputError('eligible targetVersion cannot be null.');
  assertString(context.versions.targetVersion, 'versions.targetVersion');
  assertString(context.finding.id, 'finding.id');
  assertString(context.finding.summary, 'finding.summary');
  if (context.finding.kind !== 'breakingChange') throw inputError('finding.kind must be breakingChange.');
  if (!Array.isArray(context.finding.appliesToVersions)) {
    throw inputError('finding.appliesToVersions must be an array.');
  }
  if (context.eligibility?.status !== 'ELIGIBLE' || context.eligibility?.reasonCode !== 'ELIGIBLE') {
    throw inputError(`context ${context.contextId} is not eligible.`);
  }
  if (context.requiresHumanReview !== true) throw inputError('requiresHumanReview must be true.');
  if (!Array.isArray(context.evidence) || !Array.isArray(context.evidenceAllowlist)
      || !Array.isArray(context.finding.evidenceRefs) || context.evidence.length === 0) {
    throw inputError(`context ${context.contextId} must contain selected evidence and allowlists.`);
  }
  const evidenceIds = context.evidence.map((item) => item.id);
  if (evidenceIds.some((id) => !DIGEST_EXPRESSION.test(id))
      || evidenceIds.some((id, index) => evidenceIds.indexOf(id) !== index)
      || context.evidence.some((item) => (
        typeof item.content !== 'string' || item.content.length === 0
        || typeof item.sourceId !== 'string' || item.sourceId.length === 0
        || typeof item.kind !== 'string' || item.kind.length === 0
        || typeof item.authority !== 'string' || item.authority.length === 0
        || typeof item.trust !== 'string' || item.trust.length === 0
        || !DIGEST_EXPRESSION.test(item.contentDigest)
        || !Array.isArray(item.releaseVersions)
        || !item.releaseVersions.includes(context.versions.targetVersion)
        || !['officialProject', 'publisherProvided'].includes(item.authority)
        || !['official', 'publisher'].includes(item.trust)
        || !ACTION_EVIDENCE_KINDS.has(item.kind)
      ))) {
    throw inputError(`context ${context.contextId} contains invalid or duplicate selected evidence.`);
  }
  const expectedRefs = sortedUniqueText(evidenceIds);
  if (JSON.stringify(context.evidenceAllowlist) !== JSON.stringify(expectedRefs)
      || JSON.stringify(context.finding.evidenceRefs) !== JSON.stringify(expectedRefs)) {
    throw inputError(`context ${context.contextId} evidence allowlists are inconsistent.`);
  }
  if (!Array.isArray(context.positiveCandidateLocations)
      || !Array.isArray(context.humanReviewReasons)
      || !Array.isArray(context.limitations)
      || !context.locationEligibility) {
    throw inputError(`context ${context.contextId} is not a normalized MP-02 context.`);
  }
  if (!MIGRATION_LOCATION_REASON_CODES.includes(context.locationEligibility.reasonCode)
      || !['ELIGIBLE', 'REVIEW_REQUIRED'].includes(context.locationEligibility.status)) {
    throw inputError(`context ${context.contextId} has invalid location eligibility.`);
  }
  for (const location of context.positiveCandidateLocations) {
    if (!DIGEST_EXPRESSION.test(location.impactEvidenceId)) {
      throw inputError(`context ${context.contextId} contains an invalid impact evidence id.`);
    }
    assertString(location.symbol, 'candidate location symbol');
    assertString(location.file, 'candidate location file');
  }
  const locationKeys = context.positiveCandidateLocations.map((location) => (
    `${location.impactEvidenceId}\0${location.symbol}\0${location.file}`
  ));
  if (new Set(locationKeys).size !== locationKeys.length) {
    throw inputError(`context ${context.contextId} contains duplicate candidate locations.`);
  }
  if ((context.positiveCandidateLocations.length > 0)
      !== (context.locationEligibility.reasonCode === 'POSITIVE_USAGE_MATCH')) {
    throw inputError(`context ${context.contextId} location eligibility is inconsistent.`);
  }
  return context;
}

function sameIdentity(left, right) {
  return canonicalJson(left.dependency) === canonicalJson(right.dependency)
    && canonicalJson(left.versions) === canonicalJson(right.versions)
    && left.analysisStatus === right.analysisStatus;
}

function baseRecord(context) {
  return {
    analysisResultId: context.analysisResultId,
    dependency: structuredClone(context.dependency),
    versions: structuredClone(context.versions),
    analysisStatus: 'analyzed',
    selectedEvidenceRefs: [...context.evidenceAllowlist],
    findings: [],
    limitations: structuredClone(context.limitations)
  };
}

function checklistItem(analysisResultId, findingId, item) {
  return {
    id: migrationChecklistItemId(analysisResultId, findingId, item),
    ...item
  };
}

function locationItems(context) {
  return [...context.positiveCandidateLocations]
    .sort(compareLocations)
    .map((location) => checklistItem(context.analysisResultId, context.finding.id, {
      kind: 'REVIEW_CANDIDATE_USAGE',
      basis: 'DETERMINISTIC',
      instruction: `Review the validated usage candidate for symbol "${location.symbol}" in the referenced repository file.`,
      findingId: context.finding.id,
      evidenceRefs: [...context.evidenceAllowlist],
      candidateLocations: [structuredClone(location)],
      requiresHumanReview: true
    }));
}

function actionableRecord(context, trustedCandidate) {
  const items = trustedCandidate.items.map((candidateItem) => checklistItem(
    context.analysisResultId,
    context.finding.id,
    {
      kind: 'REVIEW_MIGRATION_INSTRUCTION',
      basis: 'AI_AUTHORED',
      instruction: candidateItem.instruction,
      findingId: context.finding.id,
      evidenceRefs: [...candidateItem.evidenceRefs],
      candidateLocations: [],
      requiresHumanReview: true
    }
  ));
  items.push(...locationItems(context));
  items.sort((left, right) => compareText(left.id, right.id));
  const record = baseRecord(context);
  record.findings.push({
    id: context.finding.id,
    kind: context.finding.kind,
    summary: context.finding.summary,
    eligibilityReasonCode: 'ELIGIBLE',
    evidenceRefs: [...context.evidenceAllowlist],
    positiveImpactLocations: structuredClone(context.positiveCandidateLocations).sort(compareLocations),
    items
  });
  return record;
}

const FALLBACK_DETAILS = Object.freeze({
  NO_GROUNDED_ACTION: Object.freeze({
    instruction: 'Manual review is required because the selected evidence did not yield an explicit migration action.',
    limitationMessage: 'The model abstained because selected evidence did not provide a sufficiently explicit migration action.'
  }),
  MANUAL_REVIEW_REQUIRED: Object.freeze({
    instruction: 'Manual review is required because the generated migration draft did not pass validation.',
    limitationMessage: 'The generated migration draft was not published because generation or trust validation failed.'
  })
});

function fallbackRecord(context, reasonCode, limitationCode, limitationMessage) {
  const details = FALLBACK_DETAILS[reasonCode];
  const record = baseRecord(context);
  record.limitations = sortedUniqueLimitations([
    ...record.limitations,
    { code: limitationCode, message: limitationMessage ?? details.limitationMessage }
  ]);
  const manualItem = checklistItem(context.analysisResultId, context.finding.id, {
    kind: 'MANUAL_REVIEW_REQUIRED',
    basis: 'DETERMINISTIC',
    instruction: details.instruction,
    findingId: context.finding.id,
    evidenceRefs: [...context.evidenceAllowlist],
    candidateLocations: [],
    requiresHumanReview: true
  });
  record.findings.push({
    id: context.finding.id,
    kind: context.finding.kind,
    summary: context.finding.summary,
    eligibilityReasonCode: reasonCode,
    evidenceRefs: [...context.evidenceAllowlist],
    positiveImpactLocations: [],
    items: [manualItem]
  });
  return record;
}

function warning(context, code, detailCode, message) {
  return {
    contextId: context.contextId,
    analysisResultId: context.analysisResultId,
    findingId: context.finding.id,
    code,
    detailCode,
    message
  };
}

function runtimeFailure(context, error) {
  const detailCode = isAiRuntimeError(error) ? error.code : 'UNKNOWN';
  return {
    outcome: 'failed',
    record: fallbackRecord(context, 'MANUAL_REVIEW_REQUIRED', 'AI_RUNTIME_FAILED'),
    warning: warning(
      context,
      'AI_RUNTIME_FAILED',
      detailCode,
      'AI runtime failed for this migration context; deterministic manual review is required.'
    )
  };
}

function candidateFailure(context, error) {
  if (isMigrationChecklistCandidateError(error) || isMigrationExtractiveCandidateError(error)) {
    return {
      outcome: 'rejected',
      record: fallbackRecord(context, 'MANUAL_REVIEW_REQUIRED', error.code),
      warning: warning(
        context,
        error.code,
        error.code,
        'AI output did not satisfy the Migration Checklist candidate contract; deterministic manual review is required.'
      )
    };
  }
  if (isMigrationChecklistTrustError(error)) {
    return {
      outcome: 'rejected',
      record: fallbackRecord(context, 'MANUAL_REVIEW_REQUIRED', 'TRUST_VALIDATION_REJECTED'),
      warning: warning(
        context,
        'TRUST_VALIDATION_REJECTED',
        error.detailCode ?? error.code,
        'AI output failed evidence or capability trust validation; deterministic manual review is required.'
      )
    };
  }
  throw error;
}

async function generateMigrationChecklistForContextWithContract(context, {
  aiRuntime,
  runId,
  promptVersion
}, contract) {
  validateEligibleContext(context);
  validateAiRuntime(aiRuntime);
  const prompt = contract.buildPrompt({
    context,
    outputSchema: contract.candidateSchema,
    promptVersion
  });
  let runtimeResult;
  try {
    runtimeResult = await aiRuntime.generateStructured({
      contractVersion: AI_RUNTIME_CONTRACT_VERSION,
      runId,
      contextId: context.contextId,
      task: contract.task,
      promptVersion,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      structuredOutput: {
        mode: 'jsonSchema',
        name: contract.schemaName,
        schema: contract.candidateSchema
      }
    });
  } catch (error) {
    return deepFreeze(runtimeFailure(context, error));
  }

  try {
    const candidate = contract.validateCandidate(runtimeResult?.output);
    if (candidate.status === 'ABSTAIN') {
      return deepFreeze({
        outcome: 'abstained',
        record: fallbackRecord(
          context,
          'NO_GROUNDED_ACTION',
          'MODEL_ABSTAINED',
          `The model abstained with constrained reason ${candidate.abstentionReason}; no AI-authored action was created.`
        ),
        warning: warning(
          context,
          'MODEL_ABSTAINED',
          candidate.abstentionReason,
          'The model validly abstained; deterministic manual review is required.'
        )
      });
    }
    const trusted = contract.trustCandidate(candidate, context);
    return deepFreeze({
      outcome: 'generated',
      record: actionableRecord(context, trusted),
      warning: null
    });
  } catch (error) {
    return deepFreeze(candidateFailure(context, error));
  }
}

const FREE_FORM_CONTRACT = Object.freeze({
  task: MIGRATION_PLANNING_TASK,
  candidateSchema: MIGRATION_CHECKLIST_CANDIDATE_SCHEMA,
  schemaName: MIGRATION_PLANNING_SCHEMA_NAME,
  buildPrompt: buildMigrationChecklistPrompt,
  validateCandidate: validateMigrationChecklistCandidate,
  trustCandidate: trustValidateMigrationChecklistCandidate
});

const EXTRACTIVE_CONTRACT = Object.freeze({
  task: MIGRATION_EXTRACTIVE_PLANNING_TASK,
  candidateSchema: MIGRATION_EXTRACTIVE_CANDIDATE_SCHEMA,
  schemaName: MIGRATION_EXTRACTIVE_SCHEMA_NAME,
  buildPrompt: buildMigrationExtractivePrompt,
  validateCandidate: validateMigrationExtractiveCandidate,
  trustCandidate: trustValidateMigrationExtractiveCandidate
});

/** Historical free-form v1 generation retained for evaluation reproducibility. */
export async function generateMigrationChecklistForContext(context, {
  aiRuntime,
  runId = `migration:${context.contextId}`,
  promptVersion = MIGRATION_PLANNING_PROMPT_VERSION
} = {}) {
  return generateMigrationChecklistForContextWithContract(context, {
    aiRuntime, runId, promptVersion
  }, FREE_FORM_CONTRACT);
}

/** Production extractive v2 generation for new experimental checklist runs. */
export async function generateMigrationExtractiveChecklistForContext(context, {
  aiRuntime,
  runId = `migration-extractive:${context.contextId}`,
  promptVersion = MIGRATION_EXTRACTIVE_PROMPT_VERSION
} = {}) {
  return generateMigrationChecklistForContextWithContract(context, {
    aiRuntime, runId, promptVersion
  }, EXTRACTIVE_CONTRACT);
}

function validatePrepared(prepared) {
  if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared)) {
    throw inputError('prepared contexts must be an object.');
  }
  if (prepared.contextVersion !== MIGRATION_TASK_CONTEXT_VERSION
      || !prepared.input
      || !Array.isArray(prepared.eligibleContexts)
      || !Array.isArray(prepared.fallbackRecords)) {
    throw inputError('prepared contexts must be normalized MP-02 output.');
  }
  const contextIds = new Set();
  const findingKeys = new Set();
  for (const context of prepared.eligibleContexts) {
    validateEligibleContext(context);
    if (contextIds.has(context.contextId)) throw inputError(`duplicate contextId ${context.contextId}.`);
    contextIds.add(context.contextId);
    const key = `${context.analysisResultId}\0${context.finding.id}`;
    if (findingKeys.has(key)) throw inputError('duplicate eligible analysis result and finding identity.');
    findingKeys.add(key);
  }
  const fallbackIds = new Set();
  for (const record of prepared.fallbackRecords) {
    validateFallbackRecord(record);
    if (fallbackIds.has(record.analysisResultId)) {
      throw inputError(`duplicate fallback analysisResultId ${record.analysisResultId}.`);
    }
    fallbackIds.add(record.analysisResultId);
  }
}

function validateFallbackRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw inputError('fallback record must be an object.');
  }
  assertString(record.analysisResultId, 'fallback analysisResultId');
  if (!record.dependency || !record.versions || typeof record.analysisStatus !== 'string') {
    throw inputError(`fallback ${record.analysisResultId} is missing normalized identity.`);
  }
  for (const field of [
    'projectId', 'packageId', 'declaredName', 'normalizedName', 'ecosystem', 'registry',
    'dependencyType', 'manifest'
  ]) {
    assertString(record.dependency[field], `fallback dependency.${field}`);
  }
  if (!Array.isArray(record.selectedEvidenceRefs)
      || !Array.isArray(record.findings)
      || !Array.isArray(record.limitations)) {
    throw inputError(`fallback ${record.analysisResultId} must contain normalized arrays.`);
  }
  if (record.selectedEvidenceRefs.some((ref) => !DIGEST_EXPRESSION.test(ref))) {
    throw inputError(`fallback ${record.analysisResultId} contains an invalid evidence ref.`);
  }
  const findingIds = new Set();
  for (const finding of record.findings) {
    assertString(finding?.id, 'fallback finding id');
    if (findingIds.has(finding.id)) {
      throw inputError(`fallback ${record.analysisResultId} contains duplicate finding ${finding.id}.`);
    }
    findingIds.add(finding.id);
    if (!Array.isArray(finding.evidenceRefs)
        || !Array.isArray(finding.positiveImpactLocations)
        || !Array.isArray(finding.items)) {
      throw inputError(`fallback ${record.analysisResultId}/${finding.id} is not normalized.`);
    }
  }
}

function mergeRecord(records, incoming) {
  const existing = records.get(incoming.analysisResultId);
  if (!existing) {
    records.set(incoming.analysisResultId, structuredClone(incoming));
    return;
  }
  if (!sameIdentity(existing, incoming)) {
    throw inputError(`conflicting identity for analysisResultId ${incoming.analysisResultId}.`);
  }
  const findingIds = new Set(existing.findings.map((finding) => finding.id));
  for (const finding of incoming.findings) {
    if (findingIds.has(finding.id)) {
      throw inputError(`duplicate finding ${incoming.analysisResultId}/${finding.id} during record merge.`);
    }
    existing.findings.push(structuredClone(finding));
    findingIds.add(finding.id);
  }
  existing.findings.sort((left, right) => compareText(left.id, right.id));
  existing.selectedEvidenceRefs = sortedUniqueText([
    ...existing.selectedEvidenceRefs,
    ...incoming.selectedEvidenceRefs
  ]);
  existing.limitations = sortedUniqueLimitations([
    ...existing.limitations,
    ...incoming.limitations
  ]);
}

async function generateMigrationChecklistDraftsWithContract(prepared, {
  aiRuntime,
  runIdPrefix = 'migration',
  promptVersion,
  onContextEvent
}, {
  generateContext,
  resultVersion
}) {
  validatePrepared(prepared);
  validateAiRuntime(aiRuntime);
  assertString(runIdPrefix, 'runIdPrefix');
  assertString(promptVersion, 'promptVersion');
  const records = new Map();
  for (const record of prepared.fallbackRecords) mergeRecord(records, record);
  const warnings = [];
  const summary = {
    attempted: prepared.eligibleContexts.length,
    generated: 0,
    abstained: 0,
    rejected: 0,
    failed: 0,
    preservedFallbackRecordCount: prepared.fallbackRecords.length,
    recordCount: 0
  };

  const contexts = [...prepared.eligibleContexts].sort((left, right) => (
    compareText(left.dependency.projectId, right.dependency.projectId)
    || compareText(left.dependency.manifest, right.dependency.manifest)
    || compareText(left.dependency.packageId, right.dependency.packageId)
    || compareText(left.finding.id, right.finding.id)
    || compareText(left.contextId, right.contextId)
  ));
  for (const context of contexts) {
    notifyContext(onContextEvent, {
      phase: 'start',
      contextId: context.contextId,
      analysisResultId: context.analysisResultId,
      findingId: context.finding.id,
      packageName: context.dependency.declaredName
    });
    const result = await generateContext(context, {
      aiRuntime,
      runId: `${runIdPrefix}:${context.contextId}`,
      promptVersion
    });
    summary[result.outcome] += 1;
    mergeRecord(records, result.record);
    if (result.warning) warnings.push(structuredClone(result.warning));
    notifyContext(onContextEvent, {
      phase: 'complete',
      contextId: context.contextId,
      analysisResultId: context.analysisResultId,
      findingId: context.finding.id,
      packageName: context.dependency.declaredName,
      outcome: result.outcome,
      reasonCode: result.warning?.code ?? null,
      detailCode: result.warning?.detailCode ?? null
    });
  }

  const normalizedRecords = [...records.values()].sort(compareRecords);
  summary.recordCount = normalizedRecords.length;
  const output = {
    resultVersion,
    input: structuredClone(prepared.input),
    records: normalizedRecords,
    warnings: warnings.sort(compareWarnings),
    summary
  };
  return deepFreeze(structuredClone(output));
}

/** Historical free-form v1 multi-context generation. */
export async function generateMigrationChecklistDrafts(prepared, options = {}) {
  return generateMigrationChecklistDraftsWithContract(prepared, {
    ...options,
    promptVersion: options.promptVersion ?? MIGRATION_PLANNING_PROMPT_VERSION
  }, {
    generateContext: generateMigrationChecklistForContext,
    resultVersion: MIGRATION_GENERATION_RESULT_VERSION
  });
}

/** Production extractive v2 multi-context generation. */
export async function generateMigrationExtractiveChecklistDrafts(prepared, options = {}) {
  return generateMigrationChecklistDraftsWithContract(prepared, {
    ...options,
    runIdPrefix: options.runIdPrefix ?? 'migration-extractive',
    promptVersion: options.promptVersion ?? MIGRATION_EXTRACTIVE_PROMPT_VERSION
  }, {
    generateContext: generateMigrationExtractiveChecklistForContext,
    resultVersion: MIGRATION_EXTRACTIVE_GENERATION_RESULT_VERSION
  });
}
