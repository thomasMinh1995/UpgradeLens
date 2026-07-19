import { isMatchableUsageSymbol } from './matcher.js';

export const REPOSITORY_IMPACT_STATUSES = Object.freeze([
  'IMPACTED',
  'NOT_IMPACTED',
  'USAGE_NOT_FOUND',
  'COVERAGE_UNAVAILABLE',
  'NOT_ANALYZED'
]);

export const REPOSITORY_IMPACT_REASON_CODES = Object.freeze([
  'EXACT_SYMBOL_USAGE_FOUND',
  'NO_EXACT_SYMBOL_USAGE_FOUND',
  'NO_MATCHABLE_SYMBOL_FOUND',
  'USAGE_NOT_FOUND',
  'VERSION_ANALYSIS_SKIPPED',
  'VERSION_ANALYSIS_FAILED',
  'COVERAGE_COMPLETE',
  'ANALYZER_UNAVAILABLE',
  'ANALYZER_AMBIGUOUS',
  'SOURCE_SCAN_INCOMPLETE',
  'SOURCE_PARSE_FAILED',
  'FILE_UNREADABLE',
  'ANALYZER_FAILED',
  'MULTIPLE_ANALYSIS_FAILURES',
  'COVERAGE_METADATA_MISSING'
]);

function notAnalyzedReason(status) {
  return status === 'failed' ? 'VERSION_ANALYSIS_FAILED' : 'VERSION_ANALYSIS_SKIPPED';
}

export function classifyFindingImpact({ versionStatus = 'analyzed', coverage, usage, matches }) {
  if (versionStatus !== 'analyzed') {
    return { status: 'NOT_ANALYZED', reasonCode: notAnalyzedReason(versionStatus) };
  }
  if (matches.length > 0) {
    return { status: 'IMPACTED', reasonCode: 'EXACT_SYMBOL_USAGE_FOUND' };
  }
  if (coverage.status !== 'complete') {
    return { status: 'COVERAGE_UNAVAILABLE', reasonCode: coverage.reasonCode };
  }
  if (!usage) return { status: 'USAGE_NOT_FOUND', reasonCode: 'USAGE_NOT_FOUND' };
  if (!usage.symbols.some((symbol) => isMatchableUsageSymbol(symbol.name))) {
    return { status: 'NOT_IMPACTED', reasonCode: 'NO_MATCHABLE_SYMBOL_FOUND' };
  }
  return { status: 'NOT_IMPACTED', reasonCode: 'NO_EXACT_SYMBOL_USAGE_FOUND' };
}

export function classifyDependencyImpact({ versionStatus = 'analyzed', coverage, usage, findings }) {
  if (versionStatus !== 'analyzed') {
    return { status: 'NOT_ANALYZED', reasonCode: notAnalyzedReason(versionStatus) };
  }
  if (findings.some((finding) => finding.status === 'IMPACTED')) {
    return { status: 'IMPACTED', reasonCode: 'EXACT_SYMBOL_USAGE_FOUND' };
  }
  if (coverage.status !== 'complete') {
    return { status: 'COVERAGE_UNAVAILABLE', reasonCode: coverage.reasonCode };
  }
  if (!usage) return { status: 'USAGE_NOT_FOUND', reasonCode: 'USAGE_NOT_FOUND' };
  return { status: 'NOT_IMPACTED', reasonCode: 'NO_EXACT_SYMBOL_USAGE_FOUND' };
}
