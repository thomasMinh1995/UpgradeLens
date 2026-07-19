import { createHash } from 'node:crypto';

import { canonicalJsonBytes } from '../../canonical-json.js';
import { compareText } from '../../portable.js';

export const MIGRATION_ACTION_EVALUATION_CRITERIA_ID = 'migration-action-evaluation';
export const MIGRATION_ACTION_EVALUATION_CRITERIA_VERSION = '1.0.0';
export const MIGRATION_ACTION_COMPARATOR_VERSION = '2.0.0';
export const MIGRATION_ACTION_NORMALIZATION_VERSION = '1.0.0';
export const MIGRATION_ACTION_SUPPORT_STATUSES = Object.freeze([
  'SUPPORTED',
  'UNSUPPORTED',
  'AMBIGUOUS',
  'NOT_APPLICABLE'
]);

const CRITERIA_IDENTITY = deepFreeze({
  evaluationCriteriaId: MIGRATION_ACTION_EVALUATION_CRITERIA_ID,
  evaluationCriteriaVersion: MIGRATION_ACTION_EVALUATION_CRITERIA_VERSION,
  comparatorVersion: MIGRATION_ACTION_COMPARATOR_VERSION,
  normalizationVersion: MIGRATION_ACTION_NORMALIZATION_VERSION,
  matchingSemantics: {
    acceptablePattern: 'allOf-and-anyOf-and-anyActionVerb',
    forbiddenExpansion: 'allOf-and-anyOf',
    unknownAction: 'AMBIGUOUS',
    forbiddenOrWrongVersion: 'UNSUPPORTED',
    specificity: 'independent-anchor-presence'
  }
});

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

/** Deterministic normalization only; no stemming, fuzzy matching, or runtime synonyms. */
export function normalizeMigrationActionText(value) {
  return String(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[`'“”‘’()[\]{}]/g, ' ')
    .replace(/[^a-z0-9_.+-]+/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesPhrase(text, value) {
  const phrase = normalizeMigrationActionText(value);
  return phrase.length > 0 && ` ${text} `.includes(` ${phrase} `);
}

function matchesPattern(text, pattern) {
  const allOf = pattern.allOf ?? [];
  const anyOf = pattern.anyOf ?? [];
  const anyActionVerb = pattern.anyActionVerb ?? [];
  return allOf.every((value) => includesPhrase(text, value))
    && (anyOf.length === 0 || anyOf.some((value) => includesPhrase(text, value)))
    && (anyActionVerb.length === 0
      || anyActionVerb.some((value) => includesPhrase(text, value)));
}

function assertTextArray(value, field, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
      || value.some((item) => typeof item !== 'string' || item.length === 0)
      || new Set(value).size !== value.length) {
    throw new TypeError(`${field} must be ${allowEmpty ? 'a' : 'a non-empty'} unique string array.`);
  }
}

function validatePattern(pattern, field) {
  if (!pattern || typeof pattern !== 'object' || Array.isArray(pattern)) {
    throw new TypeError(`${field} must be an object.`);
  }
  const allowed = new Set(['allOf', 'anyOf', 'anyActionVerb']);
  const unknown = Object.keys(pattern).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new TypeError(`${field} contains unsupported field ${unknown.sort(compareText)[0]}.`);
  for (const key of allowed) assertTextArray(pattern[key] ?? [], `${field}.${key}`);
  if ([...(pattern.allOf ?? []), ...(pattern.anyOf ?? []), ...(pattern.anyActionVerb ?? [])].length === 0) {
    throw new TypeError(`${field} must contain at least one matching anchor.`);
  }
}

function validateSpecificity(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object.`);
  }
  const allowed = new Set(['actionVerbs', 'sourceIdentifiers', 'targetIdentifiers', 'objectAnchors']);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new TypeError(`${field} contains unsupported field ${unknown.sort(compareText)[0]}.`);
  assertTextArray(value.actionVerbs, `${field}.actionVerbs`, { allowEmpty: false });
  for (const key of ['sourceIdentifiers', 'targetIdentifiers', 'objectAnchors']) {
    assertTextArray(value[key] ?? [], `${field}.${key}`);
  }
}

export function validateMigrationActionCriteria(criteria) {
  if (!criteria || typeof criteria !== 'object' || Array.isArray(criteria)) {
    throw new TypeError('actionCriteria must be an object.');
  }
  const allowed = new Set(['actions', 'forbiddenExpansions', 'forbiddenModalities', 'allowedVersions']);
  const unknown = Object.keys(criteria).filter((key) => !allowed.has(key));
  if (unknown.length > 0) throw new TypeError(`actionCriteria contains unsupported field ${unknown.sort(compareText)[0]}.`);
  if (!Array.isArray(criteria.actions)) throw new TypeError('actionCriteria.actions must be an array.');
  const actionIds = criteria.actions.map((item) => item?.id);
  if (actionIds.some((id) => typeof id !== 'string' || id.length === 0)
      || new Set(actionIds).size !== actionIds.length) {
    throw new TypeError('actionCriteria action IDs must be unique non-empty strings.');
  }
  for (const [index, action] of criteria.actions.entries()) {
    const field = `actionCriteria.actions[${index}]`;
    const actionFields = new Set(['id', 'acceptablePatterns', 'specificity']);
    const actionUnknown = Object.keys(action).filter((key) => !actionFields.has(key));
    if (actionUnknown.length > 0) throw new TypeError(`${field} contains unsupported field ${actionUnknown.sort(compareText)[0]}.`);
    if (!Array.isArray(action.acceptablePatterns) || action.acceptablePatterns.length === 0) {
      throw new TypeError(`${field}.acceptablePatterns must be a non-empty array.`);
    }
    action.acceptablePatterns.forEach((pattern, patternIndex) => (
      validatePattern(pattern, `${field}.acceptablePatterns[${patternIndex}]`)
    ));
    validateSpecificity(action.specificity, `${field}.specificity`);
  }
  if (!Array.isArray(criteria.forbiddenExpansions)) {
    throw new TypeError('actionCriteria.forbiddenExpansions must be an array.');
  }
  const forbiddenIds = criteria.forbiddenExpansions.map((item) => item?.id);
  if (forbiddenIds.some((id) => typeof id !== 'string' || id.length === 0)
      || new Set(forbiddenIds).size !== forbiddenIds.length) {
    throw new TypeError('forbidden expansion IDs must be unique non-empty strings.');
  }
  for (const [index, expansion] of criteria.forbiddenExpansions.entries()) {
    const fields = new Set(['id', 'allOf', 'anyOf']);
    const unknownExpansion = Object.keys(expansion).filter((key) => !fields.has(key));
    if (unknownExpansion.length > 0) {
      throw new TypeError(`forbidden expansion contains unsupported field ${unknownExpansion.sort(compareText)[0]}.`);
    }
    validatePattern(
      { allOf: expansion.allOf ?? [], anyOf: expansion.anyOf ?? [] },
      `actionCriteria.forbiddenExpansions[${index}]`
    );
  }
  assertTextArray(criteria.forbiddenModalities, 'actionCriteria.forbiddenModalities');
  assertTextArray(criteria.allowedVersions, 'actionCriteria.allowedVersions');
  return criteria;
}

function present(text, values = []) {
  return values.length === 0 ? null : values.some((value) => includesPhrase(text, value));
}

function specificityFor(text, action, criteria) {
  const actionVerbPresent = present(text, action.specificity.actionVerbs) === true;
  const sourceIdentifierPresent = present(text, action.specificity.sourceIdentifiers);
  const targetIdentifierPresent = present(text, action.specificity.targetIdentifiers);
  const objectPresent = present(text, action.specificity.objectAnchors);
  const versionScopePresent = present(text, criteria.allowedVersions);
  const required = [
    actionVerbPresent,
    sourceIdentifierPresent,
    targetIdentifierPresent,
    objectPresent,
    versionScopePresent
  ].filter((value) => value !== null);
  return {
    status: required.every(Boolean) ? 'SPECIFIC' : 'LOW_SPECIFICITY',
    actionVerbPresent,
    sourceIdentifierPresent,
    targetIdentifierPresent,
    objectPresent,
    versionScopePresent,
    anchorCount: required.filter(Boolean).length,
    applicableAnchorCount: required.length,
    identifierSpecific: [sourceIdentifierPresent, targetIdentifierPresent]
      .filter((value) => value !== null).every(Boolean)
  };
}

/** Evaluate one instruction against predeclared, versioned atomic-action criteria. */
export function evaluateMigrationActionInstruction(instruction, criteria) {
  validateMigrationActionCriteria(criteria);
  if (criteria.actions.length === 0) {
    return deepFreeze({
      supportStatus: 'NOT_APPLICABLE',
      reasonCode: 'NO_ACTION_EXPECTED',
      matchedActionIds: [],
      forbiddenExpansionIds: [],
      specificity: null
    });
  }
  const text = normalizeMigrationActionText(instruction);
  const forbiddenExpansionIds = criteria.forbiddenExpansions
    .filter((item) => matchesPattern(text, item)).map((item) => item.id).sort(compareText);
  const forbiddenModalities = criteria.forbiddenModalities
    .filter((value) => includesPhrase(text, value)).sort(compareText);
  const observedVersions = [...new Set(
    String(instruction).match(/\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\b/g) ?? []
  )].sort(compareText);
  const unexpectedVersions = observedVersions.filter((value) => !criteria.allowedVersions.includes(value));
  if (forbiddenExpansionIds.length > 0 || forbiddenModalities.length > 0 || unexpectedVersions.length > 0) {
    return deepFreeze({
      supportStatus: 'UNSUPPORTED',
      reasonCode: forbiddenExpansionIds.length > 0 ? 'FORBIDDEN_EXPANSION'
        : forbiddenModalities.length > 0 ? 'MODALITY_EXPANSION' : 'WRONG_VERSION_SCOPE',
      matchedActionIds: [],
      forbiddenExpansionIds,
      forbiddenModalities,
      unexpectedVersions,
      specificity: null
    });
  }
  const matched = criteria.actions.filter((action) => (
    action.acceptablePatterns.some((pattern) => matchesPattern(text, pattern))
  ));
  if (matched.length === 0) {
    return deepFreeze({
      supportStatus: 'AMBIGUOUS',
      reasonCode: 'NO_ACCEPTABLE_ACTION_PATTERN',
      matchedActionIds: [],
      forbiddenExpansionIds: [],
      specificity: null
    });
  }
  const specificity = specificityFor(text, matched[0], criteria);
  return deepFreeze({
    supportStatus: 'SUPPORTED',
    reasonCode: 'ACCEPTABLE_ACTION_PATTERN',
    matchedActionIds: matched.map((item) => item.id).sort(compareText),
    forbiddenExpansionIds: [],
    specificity
  });
}

export function migrationActionEvaluationCriteriaIdentity() {
  return structuredClone(CRITERIA_IDENTITY);
}

export function migrationActionEvaluationCriteriaDigest() {
  return digest(CRITERIA_IDENTITY);
}
