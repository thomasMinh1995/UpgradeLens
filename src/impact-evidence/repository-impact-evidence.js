import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { canonicalJsonBytes } from '../canonical-json.js';
import {
  ARTIFACT_GENERATOR_NAME,
  REPOSITORY_IMPACT_EVIDENCE_SCHEMA_VERSION,
  VERSION
} from '../constants.js';
import { isMatchableUsageSymbol } from '../impact/matcher.js';
import {
  classifyDependencyImpact,
  classifyFindingImpact
} from '../impact/status.js';
import { compareText, isSorted } from '../portable.js';
import { coverageForProject } from '../usage/coverage.js';

export const IMPACT_EVIDENCE_GENERATOR_ID = 'repository-impact-evidence';
export const IMPACT_EVIDENCE_GENERATOR_VERSION = '1.0.0';
export const IMPACT_EVIDENCE_REASON_CODES = Object.freeze([
  'DEPENDENCY_NOT_USED',
  'EXACT_SYMBOL_USAGE_FOUND',
  'NO_EXACT_SYMBOL_USAGE_FOUND',
  'NO_MATCHABLE_SYMBOL_FOUND',
  'USAGE_NOT_FOUND',
  'COVERAGE_UNAVAILABLE',
  'NOT_ANALYZED'
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

function legacyFindingState(finding, dependencyUsage, coverage) {
  const state = classifyFindingImpact({
    coverage,
    usage: dependencyUsage,
    matches: finding.matches
  });
  if (state.status === 'NOT_IMPACTED'
      && dependencyUsage
      && !dependencyUsage.symbols.some((usage) => isMatchableUsageSymbol(usage.name))) {
    return { ...state, reasonCode: 'NO_MATCHABLE_SYMBOL_FOUND' };
  }
  return state;
}

function evidenceFindingState(state) {
  if (state.status === 'COVERAGE_UNAVAILABLE') {
    return { ...state, reasonCode: 'COVERAGE_UNAVAILABLE' };
  }
  if (state.status === 'NOT_ANALYZED') return { ...state, reasonCode: 'NOT_ANALYZED' };
  if (state.status === 'USAGE_NOT_FOUND') return { ...state, reasonCode: 'USAGE_NOT_FOUND' };
  return state;
}

function buildDependencies(repositoryImpact, usageIndex) {
  const usages = new Map(usageIndex.dependencies.map((usage) => (
    [`${usage.projectId}\0${usage.packageId}`, usage]
  )));
  return repositoryImpact.dependencies.map((dependency) => {
    const usage = usages.get(`${dependency.projectId}\0${dependency.packageId}`) ?? null;
    const coverage = dependency.coverage ?? coverageForProject(usageIndex, dependency.projectId);
    const findings = dependency.findings.map((finding) => {
      const state = evidenceFindingState(finding.status
        ? { status: finding.status, reasonCode: finding.reasonCode }
        : legacyFindingState(finding, usage, coverage));
      return {
        id: evidenceId(dependency.analysisResultId, finding.id),
        findingId: finding.id,
        kind: finding.kind,
        summary: finding.summary,
        impacted: finding.impacted,
        ...state,
        matchedSymbols: finding.matches.map((match) => ({
          symbol: match.symbol,
          usages: match.files.map((file) => ({ file })).sort(compareUsages)
        })).sort(compareSymbols)
      };
    }).sort(compareFindings);
    const state = dependency.status
      ? { status: dependency.status, reasonCode: dependency.reasonCode }
      : classifyDependencyImpact({ coverage, usage, findings });
    return {
      analysisResultId: dependency.analysisResultId,
      projectId: dependency.projectId,
      packageId: dependency.packageId,
      name: dependency.name,
      impacted: dependency.impacted,
      ...state,
      coverage: structuredClone(coverage),
      findings
    };
  }).sort(compareDependencies);
}

function buildSummary(dependencies, reasonCodes = IMPACT_EVIDENCE_REASON_CODES) {
  const findings = dependencies.flatMap((dependency) => dependency.findings);
  const usages = findings.flatMap((finding) => (
    finding.matchedSymbols.flatMap((symbol) => symbol.usages)
  ));
  const reasonCounts = Object.fromEntries(reasonCodes.map((code) => [
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
    if (dependency.status !== undefined) {
      if ((dependency.status === 'IMPACTED') !== dependency.impacted) {
        errors.push(`dependency ${dependency.analysisResultId} status is inconsistent.`);
      }
      if (!dependency.coverage || typeof dependency.reasonCode !== 'string') {
        errors.push(`dependency ${dependency.analysisResultId} status metadata is incomplete.`);
      }
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
      if (finding.status !== undefined && (finding.status === 'IMPACTED') !== finding.impacted) {
        errors.push(`finding evidence ${finding.id} status is inconsistent.`);
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
  const expected = buildSummary(evidence.dependencies, Object.keys(evidence.summary.reasonCounts));
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
    generator: { name: ARTIFACT_GENERATOR_NAME, version: VERSION },
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
