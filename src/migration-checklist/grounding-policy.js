export const MIGRATION_CHECKLIST_STATUSES = Object.freeze([
  'COMPLETE',
  'INCOMPLETE',
  'NO_GROUNDED_ACTION',
  'NOT_ANALYZED'
]);

export const MIGRATION_CHECKLIST_ELIGIBILITY_STATUSES = Object.freeze([
  'ELIGIBLE',
  'INELIGIBLE',
  'REVIEW_REQUIRED'
]);

export const MIGRATION_CHECKLIST_ELIGIBILITY_REASON_CODES = Object.freeze([
  'ELIGIBLE',
  'NOT_ANALYZED',
  'NO_GROUNDED_ACTION',
  'UNSUPPORTED_USAGE_COVERAGE',
  'INVALID_OR_CONFLICTED_EVIDENCE',
  'MANUAL_REVIEW_REQUIRED'
]);

export const MIGRATION_CHECKLIST_ITEM_KINDS = Object.freeze([
  'REVIEW_MIGRATION_INSTRUCTION',
  'REVIEW_CANDIDATE_USAGE',
  'VERIFY_OFFICIAL_REQUIREMENT',
  'MANUAL_REVIEW_REQUIRED'
]);

export const MIGRATION_CHECKLIST_ITEM_BASES = Object.freeze([
  'DETERMINISTIC',
  'AI_AUTHORED'
]);

export const MIGRATION_CHECKLIST_PROHIBITED_CAPABILITIES = Object.freeze([
  'DEPENDENCY_UPGRADE_ORDERING',
  'INFERRED_PREREQUISITE',
  'GENERATED_CODE',
  'PATCH_OR_AUTO_FIX',
  'GENERATED_COMMAND',
  'ROLLBACK_PLAN',
  'EFFORT_ESTIMATE',
  'NUMERIC_CONFIDENCE',
  'MIGRATION_EXECUTION',
  'SAFETY_CERTIFICATION',
  'TRANSITIVE_DEPENDENCY_COMPLETENESS'
]);

const ACTIONABLE_KINDS = new Set([
  'REVIEW_MIGRATION_INSTRUCTION',
  'REVIEW_CANDIDATE_USAGE',
  'VERIFY_OFFICIAL_REQUIREMENT'
]);

const ELIGIBILITY_STATUS_BY_REASON = Object.freeze({
  ELIGIBLE: 'ELIGIBLE',
  NOT_ANALYZED: 'INELIGIBLE',
  NO_GROUNDED_ACTION: 'INELIGIBLE',
  UNSUPPORTED_USAGE_COVERAGE: 'INELIGIBLE',
  INVALID_OR_CONFLICTED_EVIDENCE: 'INELIGIBLE',
  MANUAL_REVIEW_REQUIRED: 'REVIEW_REQUIRED'
});

const CHECKLIST_STATUS_BY_REASON = Object.freeze({
  ELIGIBLE: 'COMPLETE',
  NOT_ANALYZED: 'NOT_ANALYZED',
  NO_GROUNDED_ACTION: 'NO_GROUNDED_ACTION',
  UNSUPPORTED_USAGE_COVERAGE: 'INCOMPLETE',
  INVALID_OR_CONFLICTED_EVIDENCE: 'INCOMPLETE',
  MANUAL_REVIEW_REQUIRED: 'INCOMPLETE'
});

const PROHIBITED_INSTRUCTION_PATTERNS = Object.freeze([
  Object.freeze({
    code: 'URL_NOT_ALLOWED',
    expression: /https?:\/\//i,
    message: 'instruction text must not contain URLs; evidence references carry provenance.'
  }),
  Object.freeze({
    code: 'CODE_OR_PATCH_NOT_ALLOWED',
    expression: /```|(?:^|\n)\s*(?:diff --git|@@|--- a\/|\+\+\+ b\/)/i,
    message: 'instruction text must not contain generated code or patch material.'
  }),
  Object.freeze({
    code: 'COMMAND_NOT_ALLOWED',
    expression: /(?:^|\n)\s*\$\s+\S|\b(?:npm|pnpm|yarn|npx|pip3?|poetry|uv|cargo|mvn|gradle|go)\s+(?:install|add|remove|update|upgrade|run|test|build|check|sync)\b/i,
    message: 'instruction text must not contain shell or package-manager commands.'
  }),
  Object.freeze({
    code: 'SAFETY_CLAIM_NOT_ALLOWED',
    expression: /\b(?:safe[- ]to[- ]upgrade|safe to upgrade|auto[- ]?approved|ready[- ]to[- ]autofix)\b/i,
    message: 'instruction text must not claim upgrade safety or automatic approval.'
  })
]);

export function migrationChecklistEligibility(reasonCode) {
  const status = ELIGIBILITY_STATUS_BY_REASON[reasonCode];
  if (!status) throw new Error(`Unknown Migration Checklist eligibility reason code: ${reasonCode}.`);
  return { status, reasonCode };
}

export function migrationChecklistStatusForEligibility(reasonCode) {
  const status = CHECKLIST_STATUS_BY_REASON[reasonCode];
  if (!status) throw new Error(`Unknown Migration Checklist eligibility reason code: ${reasonCode}.`);
  return status;
}

export function isActionableMigrationChecklistItem(kind) {
  return ACTIONABLE_KINDS.has(kind);
}

export function validateMigrationChecklistInstructionContent(instruction) {
  if (typeof instruction !== 'string') return [];
  return PROHIBITED_INSTRUCTION_PATTERNS
    .filter((policy) => policy.expression.test(instruction))
    .map(({ code, message }) => ({ code, message }));
}
