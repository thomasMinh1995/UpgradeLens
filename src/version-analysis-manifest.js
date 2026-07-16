import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalJsonBytes } from './canonical-json.js';
import { PRODUCT_NAME, VERSION } from './constants.js';
import { DEPENDENCY_AI_CONTEXT_VERSION } from './dependency-ai-context.js';
import { VERSION_ANALYSIS_PROMPT_VERSION } from './ai-version-analysis.js';
import { compareText } from './portable.js';

export const VERSION_ANALYSIS_SCHEMA_VERSION = '1.0.0';

const schema = JSON.parse(await readFile(
  new URL('../schemas/version-analysis.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

function digest(value) {
  const bytes = value instanceof Uint8Array ? value : canonicalJsonBytes(value);
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function compareBy(...selectors) {
  return (left, right) => {
    for (const selector of selectors) {
      const result = compareText(selector(left), selector(right));
      if (result !== 0) return result;
    }
    return 0;
  };
}

const compareResults = compareBy(
  (item) => item.dependency.projectId,
  (item) => item.dependency.manifest,
  (item) => item.dependency.dependencyType,
  (item) => item.dependency.packageId,
  (item) => item.versions.declaredVersion ?? '',
  (item) => item.versions.targetVersion ?? '',
  (item) => item.contextId
);
const compareEvidence = compareBy((item) => item.id);
const compareFindings = compareBy((item) => item.id);

function sorted(values) {
  return [...values].sort(compareText);
}

function isSorted(items, comparator) {
  return items.every((item, index) => index === 0 || comparator(items[index - 1], item) <= 0);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort(compareText);
}

function addMismatch(errors, field, actual, expected) {
  if (actual !== expected) errors.push(`${field} is ${actual}; expected ${expected}.`);
}

function resultIdentity(result) {
  return [
    result.dependency.projectId,
    result.dependency.manifest,
    result.dependency.dependencyType,
    result.dependency.packageId,
    result.versions.declaredVersion ?? '',
    result.versions.targetVersion ?? ''
  ].join('\0');
}

function resultIdMaterial(result) {
  return {
    contextId: result.contextId,
    dependency: result.dependency,
    versions: result.versions
  };
}

function refsFor(result) {
  return [
    ...result.summaryEvidenceRefs,
    ...result.riskEvidenceRefs,
    ...result.findings.flatMap((finding) => finding.evidenceRefs)
  ];
}

function manifestSummary(results) {
  return {
    resultCount: results.length,
    analyzedCount: results.filter((item) => item.status === 'analyzed').length,
    skippedCount: results.filter((item) => item.status === 'skipped').length,
    failedCount: results.filter((item) => item.status === 'failed').length,
    requiresHumanReviewCount: results.filter((item) => item.requiresHumanReview).length,
    riskCounts: {
      low: results.filter((item) => item.riskLevel === 'low').length,
      medium: results.filter((item) => item.riskLevel === 'medium').length,
      high: results.filter((item) => item.riskLevel === 'high').length,
      unknown: results.filter((item) => item.riskLevel === 'unknown').length
    }
  };
}

function evidenceFromContext(context) {
  return context.knowledge.evidence
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      sourceId: item.sourceId,
      sourceUrl: item.sourceUrl,
      authority: item.authority,
      trust: item.trust,
      retrievedAt: item.retrievedAt,
      contentDigest: item.contentDigest,
      locator: item.locator,
      releaseVersions: sorted(item.releaseVersions)
    }))
    .sort(compareEvidence);
}

function buildResult(context, analysisResult) {
  const result = {
    id: digest(resultIdMaterial(analysisResult)),
    status: analysisResult.status,
    contextId: analysisResult.contextId,
    dependency: structuredClone(analysisResult.dependency),
    versions: structuredClone(analysisResult.versions),
    summary: analysisResult.summary,
    summaryEvidenceRefs: sorted(analysisResult.summaryEvidenceRefs),
    riskLevel: analysisResult.riskLevel,
    riskEvidenceRefs: sorted(analysisResult.riskEvidenceRefs),
    findings: structuredClone(analysisResult.findings)
      .map((finding) => ({
        ...finding,
        appliesToVersions: sorted(finding.appliesToVersions),
        evidenceRefs: sorted(finding.evidenceRefs)
      }))
      .sort(compareFindings),
    evidence: evidenceFromContext(context),
    evidenceCoverage: analysisResult.evidenceCoverage,
    confidence: analysisResult.confidence ?? {
      evidenceCoverage: analysisResult.evidenceCoverage,
      validationStatus: analysisResult.validation.status,
      requiresHumanReview: analysisResult.requiresHumanReview
    },
    validation: {
      status: analysisResult.validation.status,
      warningCodes: sorted(analysisResult.validation.warningCodes)
    },
    requiresHumanReview: analysisResult.requiresHumanReview,
    humanReviewReasons: sorted(analysisResult.humanReviewReasons),
    nextAction: analysisResult.nextAction,
    limitations: structuredClone(analysisResult.limitations)
      .sort(compareBy((item) => item.code, (item) => item.message))
  };
  return result;
}

function validatePair(context, analysisResult) {
  if (context.contextId !== analysisResult.contextId) {
    throw new Error(`Version Analysis Manifest input error: context/result mismatch for ${analysisResult.contextId}.`);
  }
  const deterministicFields = ['dependency', 'versions'];
  for (const field of deterministicFields) {
    if (JSON.stringify(context[field]) !== JSON.stringify(analysisResult[field])) {
      throw new Error(`Version Analysis Manifest input error: result ${analysisResult.contextId} changed deterministic ${field}.`);
    }
  }
}

export function validateVersionAnalysisManifestInvariants(manifest) {
  const errors = [];
  const results = manifest.results ?? [];
  if (!isSorted(results, compareResults)) errors.push('results must be sorted by dependency and target.');

  for (const duplicate of duplicateValues(results.map((item) => item.id))) {
    errors.push(`Duplicate result id ${duplicate}.`);
  }
  for (const duplicate of duplicateValues(results.map(resultIdentity))) {
    errors.push(`Duplicate dependency analysis result ${duplicate.replaceAll('\0', ' / ')}.`);
  }

  for (const result of results) {
    const expectedId = digest(resultIdMaterial(result));
    if (result.id !== expectedId) errors.push(`Result ${result.id} id is not stable for its context/dependency/version facts.`);
    if (!isSorted(result.evidence, compareEvidence)) errors.push(`Result ${result.id} evidence must be sorted by id.`);
    if (!isSorted(result.findings, compareFindings)) errors.push(`Result ${result.id} findings must be sorted by id.`);
    const evidenceIds = new Set(result.evidence.map((item) => item.id));
    for (const duplicate of duplicateValues(result.evidence.map((item) => item.id))) {
      errors.push(`Result ${result.id} has duplicate evidence ${duplicate}.`);
    }
    for (const ref of refsFor(result)) {
      if (!evidenceIds.has(ref)) errors.push(`Result ${result.id} references unknown evidence ${ref}.`);
    }
    if (result.confidence.evidenceCoverage !== result.evidenceCoverage) {
      errors.push(`Result ${result.id} confidence.evidenceCoverage does not match evidenceCoverage.`);
    }
    if (result.confidence.validationStatus !== result.validation.status) {
      errors.push(`Result ${result.id} confidence.validationStatus does not match validation.status.`);
    }
    if (result.confidence.requiresHumanReview !== result.requiresHumanReview) {
      errors.push(`Result ${result.id} confidence.requiresHumanReview does not match requiresHumanReview.`);
    }
  }

  addMismatch(errors, 'analysis.resultCount', manifest.analysis?.resultCount, results.length);
  const summary = manifestSummary(results);
  addMismatch(errors, 'summary.resultCount', manifest.summary?.resultCount, summary.resultCount);
  addMismatch(errors, 'summary.analyzedCount', manifest.summary?.analyzedCount, summary.analyzedCount);
  addMismatch(errors, 'summary.skippedCount', manifest.summary?.skippedCount, summary.skippedCount);
  addMismatch(errors, 'summary.failedCount', manifest.summary?.failedCount, summary.failedCount);
  addMismatch(
    errors,
    'summary.requiresHumanReviewCount',
    manifest.summary?.requiresHumanReviewCount,
    summary.requiresHumanReviewCount
  );
  for (const level of ['low', 'medium', 'high', 'unknown']) {
    addMismatch(errors, `summary.riskCounts.${level}`, manifest.summary?.riskCounts?.[level], summary.riskCounts[level]);
  }

  return errors.sort(compareText);
}

export function validateVersionAnalysisManifest(manifest) {
  if (manifest?.schemaVersion !== VERSION_ANALYSIS_SCHEMA_VERSION) {
    throw new Error(`Version Analysis Manifest validation error: unsupported schema version; expected ${VERSION_ANALYSIS_SCHEMA_VERSION}.`);
  }
  if (!validateSchema(manifest)) {
    throw new Error(`Version Analysis Manifest validation error: schema validation failed: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  const invariantErrors = validateVersionAnalysisManifestInvariants(manifest);
  if (invariantErrors.length > 0) {
    throw new Error(`Version Analysis Manifest validation error: runtime invariants failed: ${invariantErrors.join(' ')}`);
  }
  return manifest;
}

export function buildVersionAnalysisManifest({
  input,
  contexts,
  results,
  generatedAt = new Date(),
  promptVersion = VERSION_ANALYSIS_PROMPT_VERSION,
  contextVersion = DEPENDENCY_AI_CONTEXT_VERSION
}) {
  if (!Array.isArray(contexts) || !Array.isArray(results) || contexts.length !== results.length) {
    throw new Error('Version Analysis Manifest input error: contexts and results must be arrays of the same length.');
  }
  const records = contexts.map((context, index) => {
    const result = results[index];
    validatePair(context, result);
    return buildResult(context, result);
  }).sort(compareResults);

  const manifest = {
    schemaVersion: VERSION_ANALYSIS_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    generator: { name: PRODUCT_NAME, version: VERSION },
    input: structuredClone(input),
    analysis: {
      promptVersion,
      contextVersion,
      resultCount: records.length
    },
    summary: manifestSummary(records),
    results: records
  };
  return validateVersionAnalysisManifest(manifest);
}

export function versionAnalysisManifestDigest(manifest) {
  return digest(manifest);
}
