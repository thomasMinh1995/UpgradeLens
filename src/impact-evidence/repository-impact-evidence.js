import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalJsonBytes } from '../canonical-json.js';
import {
  PRODUCT_NAME,
  REPOSITORY_IMPACT_EVIDENCE_SCHEMA_VERSION,
  VERSION
} from '../constants.js';
import { isMatchableUsageSymbol } from '../impact/matcher.js';
import { compareText, isSorted } from '../portable.js';

export const IMPACT_EVIDENCE_GENERATOR_ID = 'repository-impact-evidence';
export const IMPACT_EVIDENCE_GENERATOR_VERSION = '1.0.0';
export const IMPACT_EVIDENCE_REASON_CODES = Object.freeze([
  'DEPENDENCY_NOT_USED',
  'EXACT_SYMBOL_USAGE_FOUND',
  'NO_EXACT_SYMBOL_USAGE_FOUND',
  'NO_MATCHABLE_SYMBOL_FOUND'
]);

const schema = JSON.parse(await readFile(
  new URL('../../schemas/repository-impact-evidence.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

const compareDependencies = (left, right) => (
  compareText(left.projectId, right.projectId)
  || compareText(left.packageId, right.packageId)
  || compareText(left.analysisResultId, right.analysisResultId)
);
const compareFindings = (left, right) => compareText(left.findingId, right.findingId);
const compareSymbols = (left, right) => compareText(left.symbol, right.symbol);
const compareUsages = (left, right) => compareText(left.file, right.file);

function evidenceId(analysisResultId, findingId) {
  const bytes = canonicalJsonBytes({ analysisResultId, findingId });
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function reasonCode(finding, dependencyUsage) {
  if (finding.impacted) return 'EXACT_SYMBOL_USAGE_FOUND';
  if (!dependencyUsage) return 'DEPENDENCY_NOT_USED';
  if (!dependencyUsage.symbols.some((usage) => isMatchableUsageSymbol(usage.name))) {
    return 'NO_MATCHABLE_SYMBOL_FOUND';
  }
  return 'NO_EXACT_SYMBOL_USAGE_FOUND';
}

function buildDependencies(repositoryImpact, usageIndex) {
  const usages = new Map(usageIndex.dependencies.map((usage) => (
    [`${usage.projectId}\0${usage.packageId}`, usage]
  )));
  return repositoryImpact.dependencies.map((dependency) => {
    const usage = usages.get(`${dependency.projectId}\0${dependency.packageId}`) ?? null;
    const findings = dependency.findings.map((finding) => ({
      id: evidenceId(dependency.analysisResultId, finding.id),
      findingId: finding.id,
      kind: finding.kind,
      summary: finding.summary,
      impacted: finding.impacted,
      reasonCode: reasonCode(finding, usage),
      matchedSymbols: finding.matches.map((match) => ({
        symbol: match.symbol,
        usages: match.files.map((file) => ({ file })).sort(compareUsages)
      })).sort(compareSymbols)
    })).sort(compareFindings);
    return {
      analysisResultId: dependency.analysisResultId,
      projectId: dependency.projectId,
      packageId: dependency.packageId,
      name: dependency.name,
      impacted: dependency.impacted,
      findings
    };
  }).sort(compareDependencies);
}

function buildSummary(dependencies) {
  const findings = dependencies.flatMap((dependency) => dependency.findings);
  const usages = findings.flatMap((finding) => (
    finding.matchedSymbols.flatMap((symbol) => symbol.usages)
  ));
  const reasonCounts = Object.fromEntries(IMPACT_EVIDENCE_REASON_CODES.map((code) => [
    code,
    findings.filter((finding) => finding.reasonCode === code).length
  ]));
  return {
    impacted: dependencies.some((dependency) => dependency.impacted),
    dependencyCount: dependencies.length,
    findingCount: findings.length,
    impactedFindingCount: findings.filter((finding) => finding.impacted).length,
    matchedSymbolCount: findings.reduce((count, finding) => count + finding.matchedSymbols.length, 0),
    usageRecordCount: usages.length,
    affectedFileCount: new Set(usages.map((usage) => usage.file)).size,
    reasonCounts
  };
}

export function validateRepositoryImpactEvidenceInvariants(evidence) {
  const errors = [];
  if (!isSorted(evidence.dependencies, compareDependencies)) errors.push('dependencies must be sorted.');
  if (evidence.analysis.resultCount !== evidence.dependencies.length) {
    errors.push('analysis.resultCount must equal dependencies length.');
  }
  const resultIds = new Set();
  const evidenceIds = new Set();
  for (const dependency of evidence.dependencies) {
    if (resultIds.has(dependency.analysisResultId)) {
      errors.push(`duplicate analysis result ${dependency.analysisResultId}.`);
    }
    resultIds.add(dependency.analysisResultId);
    if (!isSorted(dependency.findings, compareFindings)) {
      errors.push(`findings for ${dependency.analysisResultId} must be sorted.`);
    }
    if (dependency.impacted !== dependency.findings.some((finding) => finding.impacted)) {
      errors.push(`dependency ${dependency.analysisResultId} impacted is inconsistent.`);
    }
    for (const finding of dependency.findings) {
      const expectedId = evidenceId(dependency.analysisResultId, finding.findingId);
      if (finding.id !== expectedId) errors.push(`finding evidence ${finding.id} has an unstable id.`);
      if (evidenceIds.has(finding.id)) errors.push(`duplicate finding evidence ${finding.id}.`);
      evidenceIds.add(finding.id);
      if (!isSorted(finding.matchedSymbols, compareSymbols)) {
        errors.push(`matched symbols for ${finding.id} must be sorted.`);
      }
      if (finding.impacted !== (finding.matchedSymbols.length > 0)) {
        errors.push(`finding evidence ${finding.id} impacted is inconsistent.`);
      }
      if (finding.impacted !== (finding.reasonCode === 'EXACT_SYMBOL_USAGE_FOUND')) {
        errors.push(`finding evidence ${finding.id} reasonCode is inconsistent.`);
      }
      if (new Set(finding.matchedSymbols.map((match) => match.symbol)).size !== finding.matchedSymbols.length) {
        errors.push(`matched symbols for ${finding.id} must be unique.`);
      }
      for (const match of finding.matchedSymbols) {
        if (!isSorted(match.usages, compareUsages)) errors.push(`usages for ${finding.id}/${match.symbol} must be sorted.`);
        if (new Set(match.usages.map((usage) => usage.file)).size !== match.usages.length) {
          errors.push(`usages for ${finding.id}/${match.symbol} must be unique.`);
        }
      }
    }
  }
  const expected = buildSummary(evidence.dependencies);
  if (JSON.stringify(evidence.summary) !== JSON.stringify(expected)) errors.push('summary is inconsistent.');
  return errors.sort(compareText);
}

export function validateRepositoryImpactEvidence(evidence) {
  if (!validateSchema(evidence)) {
    throw new Error(
      `Repository Impact Evidence validation error: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`
    );
  }
  const errors = validateRepositoryImpactEvidenceInvariants(evidence);
  if (errors.length > 0) {
    throw new Error(`Repository Impact Evidence invariant error: ${errors.join(' ')}`);
  }
  return evidence;
}

export function buildRepositoryImpactEvidence({
  input,
  repositoryImpact,
  usageIndex,
  generatedAt = new Date()
}) {
  const dependencies = buildDependencies(repositoryImpact, usageIndex);
  return validateRepositoryImpactEvidence({
    schemaVersion: REPOSITORY_IMPACT_EVIDENCE_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    generator: { name: PRODUCT_NAME, version: VERSION },
    input: structuredClone(input),
    analysis: {
      evidenceGenerator: {
        id: IMPACT_EVIDENCE_GENERATOR_ID,
        version: IMPACT_EVIDENCE_GENERATOR_VERSION
      },
      resultCount: dependencies.length
    },
    summary: buildSummary(dependencies),
    dependencies
  });
}
