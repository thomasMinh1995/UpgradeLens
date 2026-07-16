import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  PRODUCT_NAME,
  REPOSITORY_IMPACT_SCHEMA_VERSION,
  VERSION
} from '../constants.js';
import { compareText, isSorted } from '../portable.js';

const schema = JSON.parse(await readFile(
  new URL('../../schemas/repository-impact.schema.json', import.meta.url),
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
const compareFindings = (left, right) => compareText(left.id, right.id);
const compareMatches = (left, right) => compareText(left.symbol, right.symbol);

function buildDependencies(versionAnalysis, usageIndex, matcher) {
  const usages = new Map(usageIndex.dependencies.map((usage) => (
    [`${usage.projectId}\0${usage.packageId}`, usage]
  )));
  return versionAnalysis.results.map((result) => {
    const key = `${result.dependency.projectId}\0${result.dependency.packageId}`;
    const usage = usages.get(key) ?? null;
    const findings = result.findings
      .filter((finding) => finding.kind === 'breakingChange')
      .map((finding) => {
        const matches = matcher.match(finding, usage);
        return {
          id: finding.id,
          kind: finding.kind,
          summary: finding.summary,
          impacted: matches.length > 0,
          matches
        };
      })
      .sort(compareFindings);
    return {
      analysisResultId: result.id,
      projectId: result.dependency.projectId,
      packageId: result.dependency.packageId,
      name: result.dependency.declaredName,
      impacted: findings.some((finding) => finding.impacted),
      findings
    };
  }).sort(compareDependencies);
}

function buildSummary(dependencies) {
  const findings = dependencies.flatMap((dependency) => dependency.findings);
  const matches = findings.flatMap((finding) => finding.matches);
  const affectedFiles = new Set(matches.flatMap((match) => match.files));
  return {
    impacted: dependencies.some((dependency) => dependency.impacted),
    dependencyCount: dependencies.length,
    impactedDependencyCount: dependencies.filter((dependency) => dependency.impacted).length,
    findingCount: findings.length,
    impactedFindingCount: findings.filter((finding) => finding.impacted).length,
    matchCount: matches.length,
    affectedFileCount: affectedFiles.size
  };
}

export function validateRepositoryImpactInvariants(impact) {
  const errors = [];
  if (!isSorted(impact.dependencies, compareDependencies)) errors.push('dependencies must be sorted.');
  if (impact.analysis.resultCount !== impact.dependencies.length) {
    errors.push('analysis.resultCount must equal dependencies length.');
  }
  const resultIds = new Set();
  for (const dependency of impact.dependencies) {
    if (resultIds.has(dependency.analysisResultId)) {
      errors.push(`duplicate analysis result ${dependency.analysisResultId}.`);
    }
    resultIds.add(dependency.analysisResultId);
    if (!isSorted(dependency.findings, compareFindings)) {
      errors.push(`findings for ${dependency.analysisResultId} must be sorted.`);
    }
    if (new Set(dependency.findings.map((finding) => finding.id)).size !== dependency.findings.length) {
      errors.push(`findings for ${dependency.analysisResultId} must be unique.`);
    }
    const expectedDependencyImpact = dependency.findings.some((finding) => finding.impacted);
    if (dependency.impacted !== expectedDependencyImpact) {
      errors.push(`dependency ${dependency.analysisResultId} impacted is inconsistent.`);
    }
    for (const finding of dependency.findings) {
      if (!isSorted(finding.matches, compareMatches)) errors.push(`matches for finding ${finding.id} must be sorted.`);
      if (new Set(finding.matches.map((match) => match.symbol)).size !== finding.matches.length) {
        errors.push(`matches for finding ${finding.id} must be unique.`);
      }
      if (finding.impacted !== (finding.matches.length > 0)) {
        errors.push(`finding ${finding.id} impacted is inconsistent.`);
      }
      for (const match of finding.matches) {
        if (!isSorted(match.files, compareText)) errors.push(`files for match ${match.symbol} must be sorted.`);
        if (new Set(match.files).size !== match.files.length) errors.push(`files for match ${match.symbol} must be unique.`);
      }
    }
  }
  const expected = buildSummary(impact.dependencies);
  for (const [field, value] of Object.entries(expected)) {
    if (impact.summary[field] !== value) errors.push(`summary.${field} is inconsistent.`);
  }
  return errors.sort(compareText);
}

export function validateRepositoryImpact(impact) {
  if (!validateSchema(impact)) {
    throw new Error(
      `Repository Impact validation error: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`
    );
  }
  const errors = validateRepositoryImpactInvariants(impact);
  if (errors.length > 0) throw new Error(`Repository Impact invariant error: ${errors.join(' ')}`);
  return impact;
}

export function buildRepositoryImpact({ input, versionAnalysis, usageIndex, matcher, generatedAt = new Date() }) {
  if (!matcher || typeof matcher.id !== 'string' || typeof matcher.version !== 'string'
      || typeof matcher.match !== 'function') {
    throw new Error('Repository Impact input error: matcher must expose id, version, and match().');
  }
  const dependencies = buildDependencies(versionAnalysis, usageIndex, matcher);
  return validateRepositoryImpact({
    schemaVersion: REPOSITORY_IMPACT_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    generator: { name: PRODUCT_NAME, version: VERSION },
    input: structuredClone(input),
    analysis: {
      matcher: { id: matcher.id, version: matcher.version },
      resultCount: dependencies.length
    },
    summary: buildSummary(dependencies),
    dependencies
  });
}
