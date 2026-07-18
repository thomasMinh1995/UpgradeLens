import { renderMigrationChecklistConsole } from '../migration-checklist/presentation.js';

function requireViewModel(viewModel) {
  if (!viewModel?.summary || !Array.isArray(viewModel?.dependencies)) {
    throw new Error('Console renderer requires an Impact Presentation View Model.');
  }
}

export function renderConsoleSummary({
  viewModel,
  reportPath,
  migrationChecklistViewModel,
  migrationChecklistPath
}) {
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
    `Usage not found: ${summary.usageNotFoundCount}`,
    `Coverage unavailable: ${summary.coverageUnavailableCount}`,
    `Not analyzed: ${summary.notAnalyzedCount}`
  ];
  if (viewModel.analysisStatus === 'INCOMPLETE') {
    lines.push(
      '',
      'Impact conclusions are incomplete because usage coverage is unavailable or some dependencies were not analyzed.'
    );
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
  let output = lines.join('\n');
  if (migrationChecklistViewModel) {
    output += `\n${renderMigrationChecklistConsole({
      viewModel: migrationChecklistViewModel,
      artifactPath: migrationChecklistPath
    })}`;
  }
  return output;
}
