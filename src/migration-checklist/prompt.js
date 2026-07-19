import { MIGRATION_CHECKLIST_CANDIDATE_SCHEMA } from './ai-candidate.js';

export const MIGRATION_PLANNING_TASK = 'migration-planning.v1';
export const MIGRATION_PLANNING_PROMPT_VERSION = '1';
export const MIGRATION_PLANNING_SCHEMA_NAME = 'upgradelens_migration_checklist_candidate';

function promptEvidence(evidence) {
  return {
    id: evidence.id,
    sourceId: evidence.sourceId,
    kind: evidence.kind,
    authority: evidence.authority,
    trust: evidence.trust,
    retrievedAt: evidence.retrievedAt,
    contentDigest: evidence.contentDigest,
    locator: evidence.locator,
    releaseVersions: [...evidence.releaseVersions],
    content: evidence.content
  };
}

/** Build the minimal model-visible projection. Locations and source URLs stay deterministic. */
export function buildMigrationChecklistPromptContext(context) {
  return {
    contextId: context.contextId,
    dependency: {
      packageId: context.dependency.packageId,
      declaredName: context.dependency.declaredName,
      normalizedName: context.dependency.normalizedName,
      ecosystem: context.dependency.ecosystem,
      registry: context.dependency.registry
    },
    versions: structuredClone(context.versions),
    analysisResultId: context.analysisResultId,
    finding: structuredClone(context.finding),
    evidence: context.evidence.map(promptEvidence),
    evidenceAllowlist: [...context.evidenceAllowlist],
    eligibility: structuredClone(context.eligibility),
    locationEligibility: structuredClone(context.locationEligibility),
    requiresHumanReview: true,
    humanReviewReasons: [...context.humanReviewReasons],
    limitations: structuredClone(context.limitations)
  };
}

export function buildMigrationChecklistPrompt({
  context,
  outputSchema = MIGRATION_CHECKLIST_CANDIDATE_SCHEMA,
  promptVersion = MIGRATION_PLANNING_PROMPT_VERSION
}) {
  const modelContext = buildMigrationChecklistPromptContext(context);
  return {
    promptVersion,
    system: [
      'You are the UpgradeLens evidence transformation component for a human-review migration checklist.',
      'Use only the bounded selected evidence in the supplied context; do not use outside knowledge.',
      'Identify only explicit migration actions and paraphrase them as short review drafts.',
      'This is not autonomous planning. Abstain when the evidence does not explicitly state an action.',
      'Return only JSON that satisfies the structured output schema.'
    ].join('\n'),
    user: [
      'Rules:',
      '- Keep the exact package and target-version scope supplied in the context.',
      '- Each instruction must cite selected evidence and include a short verbatim supporting excerpt copied from that same evidence record.',
      '- An exact excerpt is required; do not paraphrase the excerpt and do not cite an id outside evidenceAllowlist.',
      '- Return ABSTAIN when evidence only describes a change, is ambiguous, has unclear version scope, or gives no explicit migration action.',
      '- Do not create an action merely to complete the response.',
      '- Do not emit identity, status, eligibility, item id, finding id, package identity, approval, or completion state.',
      '- Do not create or mention URLs, repository files, symbols, locations, source snippets, code, patches, diffs, or commands.',
      '- Do not invent replacement APIs, packages, flags, config keys, prerequisites, or dependency ordering.',
      '- Do not create rollback plans, effort estimates, numeric confidence, or safety/ready/verified/complete claims.',
      '- Unknown currentVersion remains unknown. registryLatest is a registry fact, not a recommendation.',
      '- Unsupported or absent usage coverage does not mean unused, not impacted, or safe to upgrade.',
      '- All generated drafts require human review.',
      '',
      'Structured output schema:',
      JSON.stringify(outputSchema),
      '',
      'Migration Checklist Context:',
      JSON.stringify(modelContext)
    ].join('\n')
  };
}
