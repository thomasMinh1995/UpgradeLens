import { createHash } from 'node:crypto';

import { canonicalJsonBytes } from '../canonical-json.js';
import {
  MIGRATION_EXTRACTIVE_CANDIDATE_SCHEMA
} from './extractive-candidate.js';
import { buildMigrationChecklistPromptContext } from './prompt.js';

export const MIGRATION_EXTRACTIVE_PLANNING_TASK = 'migration-planning.v2';
export const MIGRATION_EXTRACTIVE_PROMPT_VERSION = '2';
export const MIGRATION_EXTRACTIVE_SCHEMA_NAME =
  'upgradelens_migration_checklist_extractive_candidate_v2';

const PROMPT_IDENTITY = Object.freeze({
  promptVersion: MIGRATION_EXTRACTIVE_PROMPT_VERSION,
  role: 'bounded-evidence-span-selector',
  output: 'strict-extractive-candidate-v2',
  rulesVersion: '1'
});

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

export function migrationExtractivePromptDigest() {
  return digest(PROMPT_IDENTITY);
}

export function buildMigrationExtractivePrompt({
  context,
  outputSchema = MIGRATION_EXTRACTIVE_CANDIDATE_SCHEMA,
  promptVersion = MIGRATION_EXTRACTIVE_PROMPT_VERSION
}) {
  const modelContext = buildMigrationChecklistPromptContext(context);
  return {
    promptVersion,
    system: [
      'You are the UpgradeLens bounded evidence-span selector for a human-review migration checklist.',
      'Select only verbatim migration guidance that exists in the supplied selected evidence.',
      'Do not write a final checklist instruction, explanation, or reasoning.',
      'Return only strict JSON that satisfies the structured output schema.'
    ].join('\n'),
    user: [
      'Rules:',
      '- Copy each actionExcerpt verbatim from the same evidence record identified by evidenceRef.',
      '- Use only refs in evidenceAllowlist. Never paraphrase or merge two spans into new text.',
      '- Select multiple spans only when each span independently states explicit migration guidance.',
      '- Return ABSTAIN for change descriptions, announcements, ambiguous text, or unclear version scope.',
      '- Do not add action verbs, identifiers, config, flags, URLs, commands, code, patches, locations, prerequisites, order, rollback, effort, confidence, safety, approval, completion, or reasoning.',
      '- Do not emit item, package, finding, version, status, review-state, or repository identity.',
      '- Unknown currentVersion remains unknown. registryLatest is a registry fact, not a recommendation.',
      '- Unsupported usage coverage does not mean unused, not impacted, or safe.',
      '- Use no knowledge outside selected evidence.',
      '',
      'Structured output schema:',
      JSON.stringify(outputSchema),
      '',
      'Migration Checklist Context:',
      JSON.stringify(modelContext)
    ].join('\n')
  };
}
