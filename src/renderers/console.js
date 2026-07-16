function requireViewModel(viewModel) {
  if (!viewModel?.summary || !Array.isArray(viewModel?.dependencies)) {
    throw new Error('Console renderer requires an Impact Presentation View Model.');
  }
}

export function renderConsoleSummary({ viewModel, reportPath }) {
  requireViewModel(viewModel);
  const summary = viewModel.summary;
  const lines = [
    'Repository',
    '',
    viewModel.repositoryName,
    '',
    `Analysis status: ${viewModel.analysisStatus}`,
    '',
    `Dependencies: ${summary.dependencyCount}`,
    `Analyzed: ${summary.analyzedCount}`,
    `Skipped: ${summary.skippedCount}`,
    `Failed: ${summary.failedCount}`,
    `Requires human review: ${summary.requiresHumanReviewCount}`,
    '',
    `Impacted: ${summary.impactedCount}`,
    `Not impacted: ${summary.notImpactedCount}`,
    `Not analyzed: ${summary.notAnalyzedCount}`
  ];
  if (viewModel.analysisStatus === 'INCOMPLETE') {
    lines.push('', 'Impact conclusions are incomplete because some dependencies were not analyzed.');
  }
  lines.push(
    '',
    `Breaking findings: ${summary.breakingFindingCount}`,
    `Evidence records: ${summary.evidenceRecordCount}`,
    '',
    'Markdown Report',
    '',
    reportPath,
    ''
  );
  return lines.join('\n');
}
