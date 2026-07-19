import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';

import { canonicalJsonBytes } from '../../../../src/canonical-json.js';
import { compareText } from '../../../../src/portable.js';
import { evaluateMigrationActionInstruction } from '../../../../src/migration-checklist/evaluation/action-criteria.js';
import { validateMigrationChecklistInstructionContent } from '../../../../src/migration-checklist/grounding-policy.js';

export const EXTRACTIVE_CANDIDATE_CONTRACT =
  'migration-checklist-extractive-candidate.experimental.v1';
export const EXTRACTIVE_PROMPT_VERSION = 'experimental.v1';
export const EXTRACTIVE_PRESENTATION_VERSION = 'experimental.v1';
export const EXTRACTIVE_PRESENTATION_PREFIX =
  'Review this official migration instruction (human review required): ';

export const EXTRACTIVE_CANDIDATE_SCHEMA = deepFreeze(JSON.parse(await readFile(
  new URL('./candidate-schema.json', import.meta.url),
  'utf8'
)));

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(EXTRACTIVE_CANDIDATE_SCHEMA);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, '\n');
}

function parseCandidate(output) {
  if (typeof output !== 'string') return output;
  try {
    return JSON.parse(output);
  } catch {
    throw new ExtractiveContractError(
      'OUTPUT_JSON_INVALID',
      'Extractive candidate is not valid JSON.'
    );
  }
}

export class ExtractiveContractError extends Error {
  constructor(code, message, { detailCode = code, actionIndex = null } = {}) {
    super(message);
    this.name = 'ExtractiveContractError';
    this.code = code;
    this.detailCode = detailCode;
    this.actionIndex = actionIndex;
  }
}

/** Validate only the experimental model-owned contract and its status semantics. */
export function validateExtractiveCandidate(output) {
  const candidate = parseCandidate(output);
  if (!validateSchema(candidate)) {
    throw new ExtractiveContractError(
      'OUTPUT_SCHEMA_INVALID',
      `Extractive candidate schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`
    );
  }
  if (candidate.status === 'ACTIONABLE'
      && (candidate.actions.length === 0 || candidate.abstentionReason !== null)) {
    throw new ExtractiveContractError(
      'OUTPUT_SEMANTICS_INVALID',
      'ACTIONABLE candidates require one or more actions and a null abstentionReason.'
    );
  }
  if (candidate.status === 'ABSTAIN'
      && (candidate.actions.length !== 0 || candidate.abstentionReason === null)) {
    throw new ExtractiveContractError(
      'OUTPUT_SEMANTICS_INVALID',
      'ABSTAIN candidates require no actions and a constrained abstentionReason.'
    );
  }
  return deepFreeze(structuredClone(candidate));
}

function modelEvidence(evidence) {
  return {
    id: evidence.id,
    sourceId: evidence.sourceId,
    kind: evidence.kind,
    authority: evidence.authority,
    trust: evidence.trust,
    releaseVersions: [...evidence.releaseVersions],
    content: evidence.content
  };
}

/** Separate experiment prompt. It is snapshot-tested and never calls a provider in GR-03. */
export function buildExtractiveExperimentPrompt(context) {
  const projection = {
    dependency: {
      packageId: context.dependency.packageId,
      declaredName: context.dependency.declaredName,
      ecosystem: context.dependency.ecosystem,
      registry: context.dependency.registry
    },
    versions: structuredClone(context.versions),
    finding: {
      id: context.finding.id,
      summary: context.finding.summary,
      appliesToVersions: [...context.finding.appliesToVersions]
    },
    evidence: context.evidence.map(modelEvidence),
    evidenceAllowlist: [...context.evidenceAllowlist]
  };
  return deepFreeze({
    promptVersion: EXTRACTIVE_PROMPT_VERSION,
    system: [
      'You select verbatim migration action spans from bounded evidence.',
      'Do not write a final checklist instruction, explanation, or reasoning.',
      'Return only strict JSON matching the experimental schema.'
    ].join('\n'),
    user: [
      'Rules:',
      '- Copy each actionExcerpt verbatim from the same selected evidence record.',
      '- Keep the exact evidenceRef and never use a ref outside evidenceAllowlist.',
      '- Do not paraphrase, merge evidence, add identifiers or flags, or write explanations.',
      '- Do not emit identity, location, URL, code, command, patch, prerequisite, order, rollback, effort, confidence, safety, completion, or review state.',
      '- Select only an explicit migration action; descriptive release text is not an action.',
      '- Return ABSTAIN when no explicit supported action exists.',
      '',
      'Structured output schema:',
      JSON.stringify(EXTRACTIVE_CANDIDATE_SCHEMA),
      '',
      'Migration evidence context:',
      JSON.stringify(projection)
    ].join('\n')
  });
}

function actionError(code, message, index, detailCode = code) {
  return new ExtractiveContractError(code, message, { actionIndex: index, detailCode });
}

function stableAction(context, action, evaluation) {
  const instruction = `${EXTRACTIVE_PRESENTATION_PREFIX}${action.actionExcerpt}`;
  const contentViolations = validateMigrationChecklistInstructionContent(instruction);
  if (contentViolations.length > 0) {
    throw new ExtractiveContractError(
      'PRESENTATION_CONTENT_UNSUPPORTED',
      'The exact official action span is incompatible with the current checklist content guard.',
      { detailCode: contentViolations[0].code }
    );
  }
  const material = {
    contract: EXTRACTIVE_CANDIDATE_CONTRACT,
    presentationVersion: EXTRACTIVE_PRESENTATION_VERSION,
    analysisResultId: context.analysisResultId,
    findingId: context.finding.id,
    evidenceRef: action.evidenceRef,
    actionExcerpt: action.actionExcerpt
  };
  return {
    id: digest(material),
    kind: 'REVIEW_MIGRATION_INSTRUCTION',
    basis: 'DETERMINISTIC_EXTRACTIVE',
    instruction,
    evidenceRef: action.evidenceRef,
    actionExcerpt: action.actionExcerpt,
    actionSupport: structuredClone(evaluation),
    candidateLocations: [],
    requiresHumanReview: true
  };
}

/**
 * Whole-candidate, fail-closed validation. Exact matching normalizes line endings only;
 * duplicate evidenceRef/excerpt pairs are rejected rather than silently normalized.
 */
export function validateAndRenderExtractiveCandidate(output, context, actionCriteria) {
  const candidate = validateExtractiveCandidate(output);
  if (candidate.status === 'ABSTAIN') {
    return deepFreeze({
      outcome: 'ABSTAINED',
      abstentionReason: candidate.abstentionReason,
      actions: [],
      identity: {
        analysisResultId: context.analysisResultId,
        findingId: context.finding.id,
        packageId: context.dependency.packageId,
        versions: structuredClone(context.versions)
      },
      positiveCandidateLocations: structuredClone(context.positiveCandidateLocations),
      requiresHumanReview: true
    });
  }

  const allowlist = new Set(context.evidenceAllowlist);
  const evidenceById = new Map(context.evidence.map((item) => [item.id, item]));
  const seen = new Set();
  const validated = [];
  for (const [index, rawAction] of candidate.actions.entries()) {
    if (!allowlist.has(rawAction.evidenceRef) || !evidenceById.has(rawAction.evidenceRef)) {
      throw actionError(
        'EVIDENCE_REFERENCE_INVALID',
        'Extractive action references evidence outside the exact context allowlist.',
        index,
        'UNKNOWN_EVIDENCE_REFERENCE'
      );
    }
    const action = {
      evidenceRef: rawAction.evidenceRef,
      actionExcerpt: normalizeLineEndings(rawAction.actionExcerpt)
    };
    const evidenceContent = normalizeLineEndings(evidenceById.get(action.evidenceRef).content);
    if (!evidenceContent.includes(action.actionExcerpt)) {
      throw actionError(
        'ACTION_EXCERPT_INVALID',
        'Action excerpt is not an exact substring of the referenced selected evidence.',
        index,
        'EXCERPT_NOT_EXACT'
      );
    }
    const duplicateKey = `${action.evidenceRef}\0${action.actionExcerpt}`;
    if (seen.has(duplicateKey)) {
      throw actionError(
        'DUPLICATE_ACTION',
        'Duplicate extractive action spans are rejected.',
        index,
        'DUPLICATE_EVIDENCE_SPAN'
      );
    }
    seen.add(duplicateKey);

    const evaluation = evaluateMigrationActionInstruction(action.actionExcerpt, actionCriteria);
    if (evaluation.supportStatus !== 'SUPPORTED') {
      throw actionError(
        'ACTION_NOT_SUPPORTED',
        'Exact evidence membership does not establish an eligible migration action.',
        index,
        evaluation.reasonCode
      );
    }
    validated.push({ action, evaluation });
  }

  const actions = validated
    .sort((left, right) => compareText(left.action.evidenceRef, right.action.evidenceRef)
      || compareText(left.action.actionExcerpt, right.action.actionExcerpt))
    .map(({ action, evaluation }) => stableAction(context, action, evaluation));
  return deepFreeze({
    outcome: 'GENERATED',
    abstentionReason: null,
    actions,
    identity: {
      analysisResultId: context.analysisResultId,
      findingId: context.finding.id,
      packageId: context.dependency.packageId,
      versions: structuredClone(context.versions)
    },
    positiveCandidateLocations: structuredClone(context.positiveCandidateLocations),
    requiresHumanReview: true
  });
}

export function extractiveContractSchemaDigest() {
  return digest(EXTRACTIVE_CANDIDATE_SCHEMA);
}
