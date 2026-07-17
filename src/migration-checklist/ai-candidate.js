import Ajv2020 from 'ajv/dist/2020.js';

import { compareText } from '../portable.js';
import { validateMigrationChecklistInstructionContent } from './grounding-policy.js';

export const MIGRATION_CANDIDATE_STATUSES = Object.freeze(['ACTIONABLE', 'ABSTAIN']);
export const MIGRATION_CANDIDATE_ABSTENTION_REASONS = Object.freeze([
  'NO_EXPLICIT_ACTION',
  'AMBIGUOUS_EVIDENCE',
  'VERSION_SCOPE_UNCLEAR',
  'CONFLICTING_EVIDENCE'
]);
export const MIGRATION_CHECKLIST_CANDIDATE_ERROR_CODES = Object.freeze([
  'OUTPUT_JSON_INVALID',
  'OUTPUT_SCHEMA_INVALID',
  'OUTPUT_SEMANTICS_INVALID'
]);
export const MIGRATION_CHECKLIST_TRUST_ERROR_CODES = Object.freeze([
  'EVIDENCE_REFERENCE_INVALID',
  'SUPPORTING_EXCERPT_INVALID',
  'PROHIBITED_CAPABILITY',
  'UNSUPPORTED_IDENTIFIER',
  'DUPLICATE_ITEM'
]);

const DIGEST_PATTERN = '^sha256:[a-f0-9]{64}$';
const MAX_ITEMS = 4;
const MAX_REFS = 6;
const MAX_INSTRUCTION_CHARACTERS = 800;
const MAX_EXCERPT_CHARACTERS = 500;

export const MIGRATION_CHECKLIST_CANDIDATE_SCHEMA = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['status', 'items', 'abstentionReason'],
  properties: {
    status: { enum: [...MIGRATION_CANDIDATE_STATUSES] },
    items: {
      type: 'array',
      maxItems: MAX_ITEMS,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['instruction', 'evidenceRefs', 'supportingExcerpts'],
        properties: {
          instruction: {
            type: 'string',
            minLength: 1,
            maxLength: MAX_INSTRUCTION_CHARACTERS
          },
          evidenceRefs: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_REFS,
            uniqueItems: true,
            items: { type: 'string', pattern: DIGEST_PATTERN }
          },
          supportingExcerpts: {
            type: 'array',
            minItems: 1,
            maxItems: MAX_REFS,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['evidenceRef', 'text'],
              properties: {
                evidenceRef: { type: 'string', pattern: DIGEST_PATTERN },
                text: {
                  type: 'string',
                  minLength: 1,
                  maxLength: MAX_EXCERPT_CHARACTERS
                }
              }
            }
          }
        }
      }
    },
    abstentionReason: {
      enum: [null, ...MIGRATION_CANDIDATE_ABSTENTION_REASONS]
    }
  }
});

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(MIGRATION_CHECKLIST_CANDIDATE_SCHEMA);

export class MigrationChecklistCandidateError extends Error {
  constructor(code, message) {
    if (!MIGRATION_CHECKLIST_CANDIDATE_ERROR_CODES.includes(code)) {
      throw new TypeError('Unknown Migration Checklist candidate error code.');
    }
    super(message);
    this.name = 'MigrationChecklistCandidateError';
    this.code = code;
  }
}

export class MigrationChecklistTrustError extends Error {
  constructor(code, message, { detailCode } = {}) {
    if (!MIGRATION_CHECKLIST_TRUST_ERROR_CODES.includes(code)) {
      throw new TypeError('Unknown Migration Checklist trust error code.');
    }
    super(message);
    this.name = 'MigrationChecklistTrustError';
    this.code = code;
    if (typeof detailCode === 'string') this.detailCode = detailCode;
  }
}

export function isMigrationChecklistCandidateError(error) {
  return error instanceof MigrationChecklistCandidateError;
}

export function isMigrationChecklistTrustError(error) {
  return error instanceof MigrationChecklistTrustError;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function normalizeLineEndings(value) {
  return value.replace(/\r\n?/g, '\n');
}

function parseCandidate(output) {
  if (typeof output !== 'string') return output;
  try {
    return JSON.parse(output);
  } catch {
    throw new MigrationChecklistCandidateError(
      'OUTPUT_JSON_INVALID',
      'Migration Checklist candidate is not valid JSON.'
    );
  }
}

/** Parse and validate the strict model-owned candidate contract. */
export function validateMigrationChecklistCandidate(output) {
  const candidate = parseCandidate(output);
  if (!validateSchema(candidate)) {
    throw new MigrationChecklistCandidateError(
      'OUTPUT_SCHEMA_INVALID',
      `Migration Checklist candidate schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`
    );
  }
  if (candidate.status === 'ACTIONABLE'
      && (candidate.items.length === 0 || candidate.abstentionReason !== null)) {
    throw new MigrationChecklistCandidateError(
      'OUTPUT_SEMANTICS_INVALID',
      'ACTIONABLE candidates require items and a null abstentionReason.'
    );
  }
  if (candidate.status === 'ABSTAIN'
      && (candidate.items.length !== 0 || candidate.abstentionReason === null)) {
    throw new MigrationChecklistCandidateError(
      'OUTPUT_SEMANTICS_INVALID',
      'ABSTAIN candidates require no items and a constrained abstentionReason.'
    );
  }
  return deepFreeze(structuredClone(candidate));
}

const PROHIBITED_PATTERNS = Object.freeze([
  ['ROLLBACK_PLAN', /\b(?:rollback|roll back|revert)\b/i],
  ['EFFORT_ESTIMATE', /\b(?:(?:low|medium|high) effort|story points?|\d+(?:\.\d+)?\s*(?:minutes?|hours?|days?|weeks?)\b)/i],
  ['NUMERIC_CONFIDENCE', /\b(?:confidence(?: score)?\s*(?:is|:|=)?\s*\d+(?:\.\d+)?\s*%?|\d+(?:\.\d+)?%\s+confiden)/i],
  ['DEPENDENCY_ORDERING', /\b(?:before|after|first|then|next)\b[^.\n]{0,100}\b(?:install|migrate|update|upgrade)\b|\b(?:install|migrate|update|upgrade)\b[^.\n]{0,100}\b(?:before|after|first|then|next)\b|\b(?:prerequisite|required before|depends on)\b/i],
  ['REPOSITORY_LOCATION', /(?:^|[\s("'])\.{0,2}\/[^\s)"']+|\b(?:src|lib|app|test|tests)\/[A-Za-z0-9_./-]+|\b[A-Za-z0-9_.-]+\.(?:jsx?|tsx?|py|java|go|rs|json|ya?ml|toml)\b/i],
  ['SAFETY_OR_COMPLETION_CLAIM', /\b(?:safe to (?:upgrade|migrate)|ready to (?:upgrade|migrate|deploy)|(?:is|are|will be|now) (?:safe|ready|verified|complete)|upgrade is safe)\b/i],
  ['COMMAND_OR_CODE', /(?:^|\n)\s*(?:\$|>|#)\s*\S|\b(?:npm|pnpm|yarn|npx|pip3?|poetry|uv|cargo|mvn|gradle|go|bash|zsh|curl|wget|git|rm|cp|mv|sed|awk)\s+\S+/i]
]);

const IDENTIFIER_PATTERNS = Object.freeze([
  /`([^`\n]{1,80})`/g,
  /\b--[a-z0-9][a-z0-9-]*\b/gi,
  /\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/g,
  /\b[a-z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/g,
  /\b[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+\b/g,
  /\b[A-Za-z_$][\w$]*\(\)/g
]);

const IDENTIFIER_STOPLIST = new Set([
  'AI', 'API', 'CLI', 'CSS', 'HTML', 'HTTP', 'HTTPS', 'JSON', 'SDK', 'SQL', 'URL', 'XML'
]);

function technicalIdentifiers(instruction) {
  const identifiers = new Set();
  for (const expression of IDENTIFIER_PATTERNS) {
    expression.lastIndex = 0;
    for (const match of instruction.matchAll(expression)) {
      const token = match[1] ?? match[0];
      const normalized = token.endsWith('()') ? token.slice(0, -2) : token;
      if (!IDENTIFIER_STOPLIST.has(normalized)) identifiers.add(normalized);
    }
  }
  return [...identifiers].sort(compareText);
}

function trustError(code, message, detailCode) {
  return new MigrationChecklistTrustError(code, message, { detailCode });
}

export function validateMigrationChecklistInstructionTrust(instruction, verifiedText) {
  const inheritedViolations = validateMigrationChecklistInstructionContent(instruction);
  if (inheritedViolations.length > 0) {
    const violation = inheritedViolations[0];
    throw trustError('PROHIBITED_CAPABILITY', violation.message, violation.code);
  }
  for (const [code, expression] of PROHIBITED_PATTERNS) {
    if (expression.test(instruction)) {
      throw trustError(
        'PROHIBITED_CAPABILITY',
        `Migration instruction contains prohibited capability ${code}.`,
        code
      );
    }
  }
  for (const identifier of technicalIdentifiers(instruction)) {
    if (!verifiedText.includes(identifier)) {
      throw trustError(
        'UNSUPPORTED_IDENTIFIER',
        'Migration instruction contains an identifier absent from its verified supporting excerpts.',
        'IDENTIFIER_NOT_IN_EXCERPT'
      );
    }
  }
}

function compareExcerpt(left, right) {
  return compareText(left.evidenceRef, right.evidenceRef) || compareText(left.text, right.text);
}

function compareItem(left, right) {
  return compareText(left.instruction, right.instruction)
    || compareText(JSON.stringify(left.evidenceRefs), JSON.stringify(right.evidenceRefs));
}

/**
 * Fail-closed trust validation. One invalid item rejects the entire candidate;
 * exact excerpt matching normalizes line endings only.
 */
export function trustValidateMigrationChecklistCandidate(candidate, context) {
  const allowed = new Set(context.evidenceAllowlist);
  const evidenceById = new Map(context.evidence.map((evidence) => [evidence.id, evidence]));
  const normalizedItems = [];

  for (const item of candidate.items) {
    const refs = [...item.evidenceRefs].sort(compareText);
    const refSet = new Set(refs);
    for (const ref of refs) {
      if (!allowed.has(ref) || !evidenceById.has(ref)) {
        throw trustError(
          'EVIDENCE_REFERENCE_INVALID',
          'Migration instruction references evidence outside its exact context allowlist.',
          'UNKNOWN_EVIDENCE_REFERENCE'
        );
      }
    }

    const excerptRefs = new Set();
    const excerpts = [...item.supportingExcerpts].sort(compareExcerpt);
    for (const excerpt of excerpts) {
      if (!refSet.has(excerpt.evidenceRef)
          || !allowed.has(excerpt.evidenceRef)
          || !evidenceById.has(excerpt.evidenceRef)
          || excerptRefs.has(excerpt.evidenceRef)) {
        throw trustError(
          'EVIDENCE_REFERENCE_INVALID',
          'Each evidence reference must have exactly one excerpt from that same selected record.',
          'EXCERPT_REFERENCE_MISMATCH'
        );
      }
      excerptRefs.add(excerpt.evidenceRef);
      const content = normalizeLineEndings(evidenceById.get(excerpt.evidenceRef).content);
      const text = normalizeLineEndings(excerpt.text);
      if (!content.includes(text)) {
        throw trustError(
          'SUPPORTING_EXCERPT_INVALID',
          'Supporting excerpt is not an exact substring of its selected evidence record.',
          'EXCERPT_NOT_EXACT'
        );
      }
    }
    if (excerptRefs.size !== refSet.size || refs.some((ref) => !excerptRefs.has(ref))) {
      throw trustError(
        'EVIDENCE_REFERENCE_INVALID',
        'Every evidence reference must have exactly one supporting excerpt.',
        'MISSING_SUPPORTING_EXCERPT'
      );
    }

    const verifiedText = excerpts.map((excerpt) => normalizeLineEndings(excerpt.text)).join('\n');
    validateMigrationChecklistInstructionTrust(item.instruction, verifiedText);
    normalizedItems.push({
      instruction: item.instruction,
      evidenceRefs: refs,
      supportingExcerpts: structuredClone(excerpts)
    });
  }

  const itemKeys = normalizedItems.map((item) => JSON.stringify(item));
  if (new Set(itemKeys).size !== itemKeys.length) {
    throw trustError(
      'DUPLICATE_ITEM',
      'Migration candidate contains duplicate instructions.',
      'DUPLICATE_INSTRUCTION'
    );
  }

  return deepFreeze({
    status: candidate.status,
    items: normalizedItems.sort(compareItem),
    abstentionReason: candidate.abstentionReason
  });
}
