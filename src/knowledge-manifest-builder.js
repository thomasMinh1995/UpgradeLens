import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalJson } from './canonical-json.js';
import { KNOWLEDGE_MANIFEST_SCHEMA_VERSION, PRODUCT_NAME, VERSION } from './constants.js';
import { validateKnowledgeManifestInvariants } from './knowledge-manifest.js';

const schema = JSON.parse(await readFile(
  new URL('../schemas/knowledge-manifest.schema.json', import.meta.url), 'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

function clone(value) {
  return structuredClone(value);
}

function date(value, field) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Knowledge Manifest builder requires a valid ${field}.`);
  return parsed.toISOString();
}

function publicOccurrence(occurrence) {
  return {
    projectId: occurrence.projectId,
    projectPath: occurrence.projectPath,
    manifest: occurrence.manifest,
    dependencyType: occurrence.dependencyType,
    declaredName: occurrence.declaredName,
    declaredVersion: occurrence.declaredVersion
  };
}

function publicPackage(packageRecord) {
  return {
    id: packageRecord.id,
    ecosystem: packageRecord.ecosystem,
    status: packageRecord.status,
    identity: clone(packageRecord.identity),
    occurrences: packageRecord.occurrences.map(publicOccurrence),
    metadata: clone(packageRecord.metadata),
    latest: clone(packageRecord.latest),
    releaseIndex: clone(packageRecord.releaseIndex),
    sourceIds: clone(packageRecord.sourceIds),
    warningCodes: clone(packageRecord.warningCodes)
  };
}

function defaultPolicy(mode) {
  return {
    mode,
    policyVersion: '1',
    registryBases: { npm: 'https://registry.npmjs.org', pypi: 'https://pypi.org' },
    ttlPolicyVersion: '1',
    sourceAllowlistVersion: '1',
    includePrereleases: false
  };
}

function compareText(left = '', right = '') {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareWarnings(left, right) {
  return compareText(left.packageId ?? '', right.packageId ?? '')
    || compareText(left.code, right.code)
    || compareText(left.sourceId ?? '', right.sourceId ?? '')
    || compareText(left.message, right.message);
}

function policyFor(value, mode) {
  const policy = { ...defaultPolicy(mode), ...(value ?? {}) };
  policy.mode = mode;
  policy.registryBases = { ...defaultPolicy(mode).registryBases, ...(value?.registryBases ?? {}) };
  return policy;
}

function sourceDigest(source) {
  return source.snapshot?.contentDigest ?? digest({
    id: source.id,
    kind: source.kind,
    authority: source.authority,
    trust: source.trust,
    url: source.url,
    status: source.status,
    supports: source.supports,
    discoveredFrom: source.discoveredFrom,
    trustEvidenceSourceIds: source.trustEvidenceSourceIds,
    conflictsWith: source.conflictsWith ?? []
  });
}

/** Deterministic identity for one input lineage, policy, and source set. */
export function createResearchId(input, policy, sources) {
  return digest({
    projectManifestDigest: input.projectManifest.artifactDigest,
    policyFingerprint: digest(policy),
    sourceDigests: [...sources]
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      .map(sourceDigest)
  });
}

/** Schema and relational validation for the public Knowledge Manifest. */
export function validateKnowledgeManifest(manifest) {
  if (!validateSchema(manifest)) {
    throw new Error(`Knowledge Manifest schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  const invariantErrors = validateKnowledgeManifestInvariants(manifest);
  if (invariantErrors.length > 0) {
    throw new Error(`Knowledge Manifest runtime invariants failed: ${invariantErrors.join(' ')}`);
  }
  return manifest;
}

/** Convert one validated internal KnowledgeResearchResult into public schema 1.0.0. */
export function buildKnowledgeManifest(researchResult, { policy, generatedAt } = {}) {
  if (!researchResult || researchResult.resultVersion !== '1') {
    throw new Error('Knowledge Manifest builder requires KnowledgeResearchResult version 1.');
  }
  const mode = policy?.mode ?? 'online';
  const publicPolicy = policyFor(policy, mode);
  const packages = researchResult.packages.map(publicPackage).sort((left, right) => compareText(left.id, right.id));
  const sources = clone(researchResult.sources).sort((left, right) => compareText(left.id, right.id));
  const warnings = clone(researchResult.warnings).sort(compareWarnings);
  const completedAt = date(researchResult.execution.completedAt, 'execution completedAt');
  const manifest = {
    schemaVersion: KNOWLEDGE_MANIFEST_SCHEMA_VERSION,
    generatedAt: generatedAt ? date(generatedAt, 'generatedAt') : completedAt,
    generator: { name: PRODUCT_NAME, version: VERSION },
    input: { projectManifest: clone(researchResult.input.projectManifest) },
    policy: publicPolicy,
    research: {
      researchId: createResearchId({ projectManifest: researchResult.input.projectManifest }, publicPolicy, sources),
      startedAt: date(researchResult.execution.startedAt, 'execution startedAt'),
      completedAt,
      durationMs: researchResult.execution.durationMs,
      inputOccurrenceCount: researchResult.summary.inputOccurrenceCount,
      inputPackageCount: packages.length,
      researchedPackageCount: packages.filter((item) => item.status !== 'invalid').length,
      sourceCount: sources.length,
      cacheHitCount: researchResult.summary.cacheHitCount,
      cacheMissCount: researchResult.summary.cacheMissCount,
      cacheRevalidationCount: researchResult.summary.cacheRevalidationCount,
      retryCount: researchResult.summary.retryCount,
      partialFailureCount: researchResult.summary.partialFailureCount
    },
    summary: {
      inputOccurrenceCount: researchResult.summary.inputOccurrenceCount,
      packageCount: packages.length,
      resolvedPackageCount: researchResult.summary.resolvedPackageCount,
      partialPackageCount: researchResult.summary.partialPackageCount,
      notFoundPackageCount: researchResult.summary.notFoundPackageCount,
      invalidPackageCount: researchResult.summary.invalidPackageCount,
      unavailablePackageCount: researchResult.summary.unavailablePackageCount,
      sourceCount: sources.length,
      warningCount: warnings.length,
      cacheHitCount: researchResult.summary.cacheHitCount,
      cacheMissCount: researchResult.summary.cacheMissCount,
      staleSourceCount: sources.filter((source) => source.status === 'stale').length
    },
    packages,
    sources,
    cache: {
      mode: publicPolicy.mode,
      policyVersion: publicPolicy.ttlPolicyVersion,
      hitCount: researchResult.summary.cacheHitCount,
      missCount: researchResult.summary.cacheMissCount,
      revalidationCount: researchResult.summary.cacheRevalidationCount,
      staleEntryCount: sources.filter((source) => source.status === 'stale').length
    },
    warnings
  };
  return validateKnowledgeManifest(manifest);
}
