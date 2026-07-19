import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

import { AI_RUNTIME_ERROR_CODES, AiRuntimeError } from '../../ai-runtime-error.js';
import { canonicalJson, canonicalJsonBytes } from '../../canonical-json.js';
import { compareText } from '../../portable.js';
import {
  isMigrationChecklistTrustError,
  trustValidateMigrationChecklistCandidate,
  validateMigrationChecklistCandidate
} from '../ai-candidate.js';
import { MIGRATION_PLANNING_TASK } from '../prompt.js';

export const MIGRATION_EVALUATION_DATASET_VERSION = '1.0.0';
export const MIGRATION_EVALUATION_DATASET_ID = 'migration-planning-golden';
export const DEFAULT_MIGRATION_EVALUATION_DATASET_PATH = 'eval/migration-planning/golden-dataset.json';
const BUNDLED_MIGRATION_EVALUATION_DATASET_PATH = fileURLToPath(
  new URL('../../../eval/migration-planning/golden-dataset.json', import.meta.url)
);

const schema = JSON.parse(await readFile(
  new URL('../../../schemas/migration-evaluation-dataset.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateSchema = ajv.compile(schema);

function digest(value) {
  const bytes = typeof value === 'string' ? value : canonicalJsonBytes(value);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function datasetError(message) {
  return new Error(`Migration Evaluation Dataset error: ${message}`);
}

function sorted(values = []) {
  return [...values].sort(compareText);
}

function duplicate(values) {
  return sorted([...new Set(values.filter((value, index) => values.indexOf(value) !== index))]);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function limitationInput() {
  const artifact = (name) => ({
    schemaVersion: '1.0.0',
    artifact: `.upgradelens/${name}.json`,
    artifactDigest: digest(name)
  });
  return {
    projectManifest: {
      schemaVersion: '2.0.0',
      artifact: '.upgradelens/project-manifest.json',
      artifactDigest: digest('project-manifest'),
      repository: { name: 'migration-evaluation', root: '.' }
    },
    knowledgeManifest: {
      ...artifact('knowledge-manifest'),
      researchId: digest('knowledge-research')
    },
    knowledgeEvidenceBundle: artifact('knowledge-evidence-bundle'),
    versionAnalysis: artifact('version-analysis'),
    usageIndex: artifact('usage-index'),
    repositoryImpact: artifact('repository-impact'),
    repositoryImpactEvidence: artifact('repository-impact-evidence')
  };
}

export function buildMigrationEvaluationContext(goldenCase) {
  const evidence = goldenCase.fixture.evidence.map((item) => ({
    id: item.id,
    sourceId: item.sourceId,
    sourceUrl: `https://evaluation.invalid/${goldenCase.id}`,
    kind: item.kind,
    authority: item.authority,
    trust: item.trust,
    retrievedAt: '2026-07-16T00:00:00.000Z',
    contentDigest: digest(item.content),
    locator: `case:${goldenCase.id}`,
    releaseVersions: sorted(item.releaseVersions),
    content: item.content
  })).sort((left, right) => compareText(left.id, right.id));
  const evidenceAllowlist = evidence.map((item) => item.id).sort(compareText);
  const dependency = {
    projectId: `${goldenCase.ecosystem}:${goldenCase.id}`,
    packageId: goldenCase.fixture.dependency.packageId,
    declaredName: goldenCase.fixture.dependency.declaredName,
    normalizedName: goldenCase.fixture.dependency.normalizedName,
    ecosystem: goldenCase.ecosystem,
    registry: goldenCase.fixture.dependency.registry,
    packageManager: goldenCase.fixture.dependency.packageManager,
    dependencyType: goldenCase.fixture.dependency.dependencyType,
    manifest: goldenCase.fixture.dependency.manifest
  };
  const payload = {
    dependency,
    versions: structuredClone(goldenCase.fixture.versions),
    analysisResultId: digest(`${goldenCase.id}:analysis`),
    finding: {
      id: goldenCase.fixture.findingId,
      kind: 'breakingChange',
      summary: goldenCase.fixture.findingSummary,
      appliesToVersions: [goldenCase.fixture.versions.targetVersion],
      evidenceRefs: evidenceAllowlist
    },
    evidence,
    evidenceAllowlist,
    positiveCandidateLocations: structuredClone(goldenCase.fixture.locations),
    eligibility: { status: 'ELIGIBLE', reasonCode: 'ELIGIBLE' },
    locationEligibility: structuredClone(goldenCase.fixture.locationEligibility),
    requiresHumanReview: true,
    humanReviewReasons: ['MIGRATION_CHECKLIST_DRAFT_REVIEW_REQUIRED'],
    limitations: structuredClone(goldenCase.fixture.limitations)
  };
  return deepFreeze({
    contextVersion: '1',
    contextId: digest({ caseId: goldenCase.id, payload }),
    ...payload
  });
}

export function buildMigrationEvaluationPrepared(goldenCase) {
  return deepFreeze({
    contextVersion: '1',
    input: limitationInput(),
    eligibleContexts: [buildMigrationEvaluationContext(goldenCase)],
    fallbackRecords: [],
    summary: {
      totalFindings: 1,
      eligible: 1,
      notAnalyzed: 0,
      noGroundedAction: 0,
      unsupportedUsageCoverage: goldenCase.fixture.locationEligibility.reasonCode
        === 'UNSUPPORTED_USAGE_COVERAGE' ? 1 : 0,
      conflictedEvidence: 0
    }
  });
}

export function buildMigrationPolicyProbeCandidate(probe) {
  return {
    status: 'ACTIONABLE',
    items: [{
      instruction: probe.instruction,
      evidenceRefs: [probe.evidenceRef],
      supportingExcerpts: [{ evidenceRef: probe.evidenceRef, text: probe.excerpt }]
    }],
    abstentionReason: null
  };
}

function expectedCandidateState(goldenCase, context) {
  const response = goldenCase.response;
  if (response.kind === 'runtimeError') {
    if (!AI_RUNTIME_ERROR_CODES.includes(response.code)) {
      throw datasetError(`${goldenCase.id} uses unknown runtime error code ${response.code}.`);
    }
    return { rawOutcome: 'RUNTIME_FAILURE', trustDecision: 'NOT_EVALUATED', detailCode: response.code };
  }
  if (response.kind === 'rawText') {
    try {
      validateMigrationChecklistCandidate(response.output);
    } catch (error) {
      return { rawOutcome: 'INVALID', trustDecision: 'NOT_EVALUATED', detailCode: error.code };
    }
    throw datasetError(`${goldenCase.id} rawText unexpectedly satisfies the candidate contract.`);
  }
  let candidate;
  try {
    candidate = validateMigrationChecklistCandidate(response.candidate);
  } catch (error) {
    return { rawOutcome: 'INVALID', trustDecision: 'NOT_EVALUATED', detailCode: error.code };
  }
  if (candidate.status === 'ABSTAIN') {
    return { rawOutcome: 'ABSTAIN', trustDecision: 'NOT_EVALUATED', detailCode: null };
  }
  try {
    trustValidateMigrationChecklistCandidate(candidate, context);
    return { rawOutcome: 'ACTIONABLE', trustDecision: 'ACCEPTED', detailCode: null };
  } catch (error) {
    if (!isMigrationChecklistTrustError(error)) throw error;
    return {
      rawOutcome: 'ACTIONABLE',
      trustDecision: 'REJECTED',
      detailCode: error.detailCode ?? error.code
    };
  }
}

function validateCaseInvariants(goldenCase) {
  const evidenceIds = goldenCase.fixture.evidence.map((item) => item.id);
  const evidenceSet = new Set(evidenceIds);
  if (duplicate(evidenceIds).length > 0) throw datasetError(`${goldenCase.id} has duplicate evidence ids.`);
  for (const evidence of goldenCase.fixture.evidence) {
    if (!evidence.releaseVersions.includes(goldenCase.fixture.versions.targetVersion)) {
      throw datasetError(`${goldenCase.id} evidence ${evidence.id} is not target scoped.`);
    }
  }
  for (const ref of goldenCase.expected.evidenceRefs) {
    if (!evidenceSet.has(ref)) throw datasetError(`${goldenCase.id} expects unknown evidence ref ${ref}.`);
  }
  if (!same(goldenCase.expected.locations, goldenCase.fixture.locations)) {
    throw datasetError(`${goldenCase.id} expected locations do not match deterministic fixture locations.`);
  }
  const locationPositive = goldenCase.fixture.locations.length > 0;
  if (locationPositive !== (goldenCase.fixture.locationEligibility.reasonCode === 'POSITIVE_USAGE_MATCH')) {
    throw datasetError(`${goldenCase.id} location eligibility is inconsistent.`);
  }
  const context = buildMigrationEvaluationContext(goldenCase);
  const actualState = expectedCandidateState(goldenCase, context);
  for (const field of ['rawOutcome', 'trustDecision']) {
    if (goldenCase.expected[field] !== actualState[field]) {
      throw datasetError(`${goldenCase.id} expected ${field} is inconsistent with its recorded response.`);
    }
  }
  if (goldenCase.expected.expectedTrustDetailCode !== actualState.detailCode) {
    throw datasetError(`${goldenCase.id} expected trust detail code is inconsistent.`);
  }
  const outcomeByState = {
    RUNTIME_FAILURE: 'failed',
    INVALID: 'rejected',
    ABSTAIN: 'abstained'
  };
  const expectedFinal = actualState.rawOutcome === 'ACTIONABLE'
    ? (actualState.trustDecision === 'ACCEPTED' ? 'generated' : 'rejected')
    : outcomeByState[actualState.rawOutcome];
  if (goldenCase.expected.finalOutcome !== expectedFinal) {
    throw datasetError(`${goldenCase.id} expected finalOutcome is inconsistent.`);
  }
  for (const probe of goldenCase.policyProbes) {
    const candidate = validateMigrationChecklistCandidate(buildMigrationPolicyProbeCandidate(probe));
    let decision = 'ACCEPTED';
    let detailCode = null;
    try {
      trustValidateMigrationChecklistCandidate(candidate, context);
    } catch (error) {
      if (!isMigrationChecklistTrustError(error)) throw error;
      decision = 'REJECTED';
      detailCode = error.detailCode ?? error.code;
    }
    if (decision !== probe.expectedDecision || detailCode !== probe.expectedDetailCode) {
      throw datasetError(`${goldenCase.id}/${probe.id} policy probe expectation is inconsistent.`);
    }
  }
}

export function validateMigrationEvaluationDataset(dataset) {
  if (dataset?.schemaVersion !== MIGRATION_EVALUATION_DATASET_VERSION) {
    throw datasetError(`unsupported schema version; expected ${MIGRATION_EVALUATION_DATASET_VERSION}.`);
  }
  if (!validateSchema(dataset)) {
    throw datasetError(`schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  const ids = dataset.cases.map((item) => item.id);
  const duplicates = duplicate(ids);
  if (duplicates.length > 0) throw datasetError(`duplicate case id ${duplicates[0]}.`);
  if (!same(ids, sorted(ids))) throw datasetError('cases must use stable lexical ordering by id.');
  const ecosystems = new Set(dataset.cases.map((item) => item.ecosystem));
  for (const ecosystem of ['generic', 'node', 'python']) {
    if (!ecosystems.has(ecosystem)) throw datasetError(`required ecosystem ${ecosystem} is missing.`);
  }
  const actionCases = dataset.cases.filter((item) => item.expected.actionExpected).length;
  const abstentionCases = dataset.cases.filter((item) => !item.expected.actionExpected).length;
  const probeCount = dataset.cases.reduce((count, item) => count + item.policyProbes.length, 0);
  if (actionCases < 3 || abstentionCases < 3 || probeCount < 10) {
    throw datasetError('dataset has insufficient action, abstention, or adversarial policy coverage.');
  }
  for (const goldenCase of dataset.cases) validateCaseInvariants(goldenCase);
  return dataset;
}

export function migrationEvaluationDatasetDigest(dataset) {
  validateMigrationEvaluationDataset(dataset);
  return digest(dataset);
}

export async function loadMigrationEvaluationDataset(
  datasetPath
) {
  const inputPath = datasetPath ?? BUNDLED_MIGRATION_EVALUATION_DATASET_PATH;
  let parsed;
  try {
    parsed = JSON.parse(await readFile(inputPath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw datasetError(`${inputPath} is not valid JSON.`);
    throw error;
  }
  validateMigrationEvaluationDataset(parsed);
  const value = structuredClone(parsed);
  return deepFreeze({
    datasetPath: path.resolve(inputPath),
    datasetDigest: migrationEvaluationDatasetDigest(value),
    ...value
  });
}

export function createMigrationGoldenFakeRuntime(dataset) {
  validateMigrationEvaluationDataset(dataset);
  const responseByContext = new Map(dataset.cases.map((goldenCase) => [
    buildMigrationEvaluationContext(goldenCase).contextId,
    goldenCase.response
  ]));
  return {
    async generateStructured(request) {
      if (request.task !== MIGRATION_PLANNING_TASK) {
        throw new TypeError(`Golden runtime received unexpected task ${request.task}.`);
      }
      const response = responseByContext.get(request.contextId);
      if (!response) throw new TypeError(`Golden runtime received unknown context ${request.contextId}.`);
      if (response.kind === 'runtimeError') {
        throw new AiRuntimeError(response.code, 'Golden runtime failure.', { retryable: false });
      }
      return {
        output: response.kind === 'candidate' ? structuredClone(response.candidate) : response.output,
        provider: 'migration-golden-fake',
        model: MIGRATION_EVALUATION_DATASET_VERSION,
        latencyMs: 0
      };
    }
  };
}
