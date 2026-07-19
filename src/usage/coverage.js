import { compareText } from '../portable.js';

export const USAGE_COVERAGE_STATUSES = Object.freeze([
  'complete',
  'partial',
  'unavailable',
  'failed'
]);

export const USAGE_COVERAGE_REASON_CODES = Object.freeze([
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

export const compareCoverage = (left, right) => (
  compareText(left.projectId, right.projectId)
  || compareText(left.ecosystem, right.ecosystem)
  || compareText(left.projectPath, right.projectPath)
);

function failureReason(counts) {
  const failures = [
    counts.scanFailureCount > 0 ? 'SOURCE_SCAN_INCOMPLETE' : null,
    counts.parseFailureCount > 0 ? 'SOURCE_PARSE_FAILED' : null,
    counts.unreadableFileCount > 0 ? 'FILE_UNREADABLE' : null,
    counts.analyzerFailureCount > 0 ? 'ANALYZER_FAILED' : null
  ].filter(Boolean);
  return failures.length === 1 ? failures[0] : 'MULTIPLE_ANALYSIS_FAILURES';
}

export function buildProjectUsageCoverage({
  projectId,
  projectPath,
  ecosystem,
  analyzers,
  scannedFileCount = 0,
  analyzedFileCount = 0,
  parseFailureCount = 0,
  analyzerFailureCount = 0,
  unreadableFileCount = 0,
  scanFailureCount = 0
}) {
  const candidates = [...new Map(
    analyzers.map((analyzer) => [`${analyzer.id}\0${analyzer.version}`, analyzer])
  ).values()];
  const counts = {
    scannedFileCount,
    analyzedFileCount,
    parseFailureCount,
    analyzerFailureCount,
    unreadableFileCount,
    scanFailureCount
  };
  let status;
  let reasonCode;
  let analyzer = null;
  if (candidates.length === 0) {
    status = 'unavailable';
    reasonCode = 'ANALYZER_UNAVAILABLE';
  } else if (candidates.length > 1) {
    status = 'unavailable';
    reasonCode = 'ANALYZER_AMBIGUOUS';
  } else {
    analyzer = { id: candidates[0].id, version: candidates[0].version };
    const failureCount = parseFailureCount + analyzerFailureCount
      + unreadableFileCount + scanFailureCount;
    if (failureCount === 0) {
      status = 'complete';
      reasonCode = 'COVERAGE_COMPLETE';
    } else if (analyzerFailureCount > 0 && analyzedFileCount === 0 && parseFailureCount === 0) {
      status = 'failed';
      reasonCode = failureReason(counts);
    } else {
      status = 'partial';
      reasonCode = failureReason(counts);
    }
  }
  return {
    projectId,
    projectPath,
    ecosystem,
    status,
    analyzer,
    ...counts,
    reasonCode
  };
}

export function unavailableLegacyCoverage(projectId, ecosystem = null) {
  return {
    projectId,
    projectPath: null,
    ecosystem,
    status: 'unavailable',
    analyzer: null,
    scannedFileCount: 0,
    analyzedFileCount: 0,
    parseFailureCount: 0,
    analyzerFailureCount: 0,
    unreadableFileCount: 0,
    scanFailureCount: 0,
    reasonCode: 'COVERAGE_METADATA_MISSING'
  };
}

export function coverageForProject(usageIndex, projectId, ecosystem = null) {
  return usageIndex?.analysis?.coverage?.find((item) => item.projectId === projectId)
    ?? unavailableLegacyCoverage(projectId, ecosystem);
}
