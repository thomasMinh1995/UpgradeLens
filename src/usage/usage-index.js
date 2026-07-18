import { readFile } from 'node:fs/promises';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { PRODUCT_NAME, USAGE_INDEX_SCHEMA_VERSION, VERSION } from '../constants.js';
import { compareText, isSorted } from '../portable.js';
import {
  USAGE_COVERAGE_REASON_CODES,
  USAGE_COVERAGE_STATUSES,
  compareCoverage
} from './coverage.js';

const schema = JSON.parse(await readFile(
  new URL('../../schemas/usage-index.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

const compareDependencies = (left, right) => (
  compareText(left.projectId, right.projectId) || compareText(left.packageId, right.packageId)
);
const compareSymbols = (left, right) => compareText(left.name, right.name);
const compareWarnings = (left, right) => (
  compareText(left.path, right.path) || compareText(left.code, right.code) || compareText(left.message, right.message)
);
const compareAnalyzers = (left, right) => compareText(left.id, right.id) || compareText(left.version, right.version);

function indexUsages(usages) {
  const dependencies = new Map();
  for (const usage of usages) {
    const dependencyKey = `${usage.projectId}\0${usage.packageId}`;
    if (!dependencies.has(dependencyKey)) {
      dependencies.set(dependencyKey, {
        projectId: usage.projectId,
        packageId: usage.packageId,
        name: usage.dependency,
        files: new Set(),
        symbols: new Map()
      });
    }
    const dependency = dependencies.get(dependencyKey);
    dependency.files.add(usage.file);
    if (usage.symbol === null) continue;
    if (!dependency.symbols.has(usage.symbol)) dependency.symbols.set(usage.symbol, new Set());
    dependency.symbols.get(usage.symbol).add(usage.file);
  }

  return [...dependencies.values()].map((dependency) => ({
    projectId: dependency.projectId,
    packageId: dependency.packageId,
    name: dependency.name,
    files: [...dependency.files].sort(compareText),
    symbols: [...dependency.symbols].map(([name, files]) => ({
      name,
      files: [...files].sort(compareText)
    })).sort(compareSymbols)
  })).sort(compareDependencies);
}

function summary(dependencies, warningCount) {
  const files = new Set(dependencies.flatMap((dependency) => dependency.files));
  return {
    dependencyCount: dependencies.length,
    symbolCount: dependencies.reduce((count, dependency) => count + dependency.symbols.length, 0),
    fileCount: files.size,
    warningCount
  };
}

export function validateUsageIndexInvariants(index) {
  const errors = [];
  if (!isSorted(index.dependencies, compareDependencies)) errors.push('dependencies must be sorted.');
  if (!isSorted(index.analysis.analyzers, compareAnalyzers)) errors.push('analyzers must be sorted.');
  if (index.analysis.coverage && !isSorted(index.analysis.coverage, compareCoverage)) {
    errors.push('analysis.coverage must be sorted.');
  }
  if (new Set(index.analysis.analyzers.map((analyzer) => analyzer.id)).size !== index.analysis.analyzers.length) {
    errors.push('analyzer ids must be unique.');
  }
  if (index.analysis.analyzedFileCount > index.analysis.scannedFileCount) {
    errors.push('analysis.analyzedFileCount cannot exceed scannedFileCount.');
  }
  const coverageProjects = new Set();
  let coverageScannedFileCount = 0;
  let coverageAnalyzedFileCount = 0;
  for (const coverage of index.analysis.coverage ?? []) {
    if (coverageProjects.has(coverage.projectId)) {
      errors.push(`duplicate coverage project ${coverage.projectId}.`);
    }
    coverageProjects.add(coverage.projectId);
    if (!USAGE_COVERAGE_STATUSES.includes(coverage.status)) {
      errors.push(`coverage ${coverage.projectId} has unsupported status.`);
    }
    if (!USAGE_COVERAGE_REASON_CODES.includes(coverage.reasonCode)) {
      errors.push(`coverage ${coverage.projectId} has unsupported reasonCode.`);
    }
    if (coverage.analyzedFileCount > coverage.scannedFileCount) {
      errors.push(`coverage ${coverage.projectId} analyzedFileCount cannot exceed scannedFileCount.`);
    }
    coverageScannedFileCount += coverage.scannedFileCount;
    coverageAnalyzedFileCount += coverage.analyzedFileCount;
    const processedFileCount = coverage.analyzedFileCount + coverage.parseFailureCount
      + coverage.analyzerFailureCount + coverage.unreadableFileCount;
    if (processedFileCount !== coverage.scannedFileCount) {
      errors.push(`coverage ${coverage.projectId} file counts are inconsistent.`);
    }
    if ((coverage.status === 'unavailable') !== (coverage.analyzer === null)) {
      errors.push(`coverage ${coverage.projectId} analyzer availability is inconsistent.`);
    }
    const failures = coverage.parseFailureCount + coverage.analyzerFailureCount
      + coverage.unreadableFileCount + coverage.scanFailureCount;
    if (coverage.status === 'complete' && failures !== 0) {
      errors.push(`coverage ${coverage.projectId} complete status has failures.`);
    }
    if (coverage.status === 'complete' && coverage.reasonCode !== 'COVERAGE_COMPLETE') {
      errors.push(`coverage ${coverage.projectId} complete reasonCode is inconsistent.`);
    }
    if (coverage.analyzer
        && !index.analysis.analyzers.some((analyzer) => (
          analyzer.id === coverage.analyzer.id && analyzer.version === coverage.analyzer.version
        ))) {
      errors.push(`coverage ${coverage.projectId} analyzer is not declared by analysis.`);
    }
  }
  if ((index.analysis.coverage?.length ?? 0) > 0) {
    if (coverageScannedFileCount !== index.analysis.scannedFileCount) {
      errors.push('analysis.scannedFileCount does not equal project coverage total.');
    }
    if (coverageAnalyzedFileCount !== index.analysis.analyzedFileCount) {
      errors.push('analysis.analyzedFileCount does not equal project coverage total.');
    }
  }
  if (!isSorted(index.warnings, compareWarnings)) errors.push('warnings must be sorted.');
  const identities = new Set();
  for (const dependency of index.dependencies) {
    const identity = `${dependency.projectId}\0${dependency.packageId}`;
    if (identities.has(identity)) errors.push(`duplicate dependency ${dependency.packageId} in ${dependency.projectId}.`);
    identities.add(identity);
    if (!isSorted(dependency.files, compareText)) errors.push(`files for ${dependency.packageId} must be sorted.`);
    if (new Set(dependency.files).size !== dependency.files.length) {
      errors.push(`files for ${dependency.packageId} must be unique.`);
    }
    if (!isSorted(dependency.symbols, compareSymbols)) {
      errors.push(`symbols for ${dependency.packageId} must be sorted.`);
    }
    if (new Set(dependency.symbols.map((symbol) => symbol.name)).size !== dependency.symbols.length) {
      errors.push(`symbols for ${dependency.packageId} must be unique.`);
    }
    const dependencyFiles = new Set(dependency.files);
    for (const symbol of dependency.symbols) {
      if (!isSorted(symbol.files, compareText)) {
        errors.push(`files for ${dependency.packageId}/${symbol.name} must be sorted.`);
      }
      if (new Set(symbol.files).size !== symbol.files.length) {
        errors.push(`files for ${dependency.packageId}/${symbol.name} must be unique.`);
      }
      for (const file of symbol.files) {
        if (!dependencyFiles.has(file)) {
          errors.push(`file ${file} for ${dependency.packageId}/${symbol.name} is missing from dependency files.`);
        }
      }
    }
  }
  const expected = summary(index.dependencies, index.warnings.length);
  for (const [field, value] of Object.entries(expected)) {
    if (index.summary[field] !== value) {
      errors.push(`summary.${field} is ${index.summary[field]}; expected ${value}.`);
    }
  }
  return errors.sort(compareText);
}

export function validateUsageIndex(index) {
  if (!validateSchema(index)) {
    throw new Error(`Usage Index validation error: ${ajv.errorsText(validateSchema.errors, { separator: '; ' })}`);
  }
  const errors = validateUsageIndexInvariants(index);
  if (errors.length > 0) throw new Error(`Usage Index invariant error: ${errors.join(' ')}`);
  return index;
}

export function buildUsageIndex({
  input,
  usages,
  scannedFileCount,
  analyzedFileCount,
  analyzers,
  coverage = [],
  warnings,
  generatedAt = new Date()
}) {
  const dependencies = indexUsages(usages);
  const sortedWarnings = structuredClone(warnings).sort(compareWarnings);
  const sortedAnalyzers = analyzers.map(({ id, version }) => ({ id, version })).sort(compareAnalyzers);
  return validateUsageIndex({
    schemaVersion: USAGE_INDEX_SCHEMA_VERSION,
    generatedAt: generatedAt instanceof Date ? generatedAt.toISOString() : generatedAt,
    generator: { name: PRODUCT_NAME, version: VERSION },
    input: structuredClone(input),
    analysis: {
      analyzers: sortedAnalyzers,
      scannedFileCount,
      analyzedFileCount,
      coverage: structuredClone(coverage).sort(compareCoverage)
    },
    summary: summary(dependencies, sortedWarnings.length),
    dependencies,
    warnings: sortedWarnings
  });
}
