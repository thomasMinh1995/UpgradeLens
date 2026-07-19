import { renderMigrationChecklistMarkdownSection } from '../migration-checklist/presentation.js';
import { renderUpgradeDecisionMarkdownSection } from '../upgrade-decision/presentation.js';

function inlineCode(value) {
  return `\`${String(value).replaceAll('`', '\\`')}\``;
}

function headingText(value) {
  return String(value).replace(/[\r\n]+/g, ' ').replaceAll('\\', '\\\\').replaceAll('#', '\\#');
}

function tableText(value) {
  return String(value).replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ');
}

function renderProductCompletion(completion) {
  const labels = {
    KEEP_CURRENT: 'Keep current',
    UPGRADE_NOW: 'Upgrade now',
    PLAN_UPGRADE: 'Plan upgrade',
    INVESTIGATE: 'Investigate',
    INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
    NOT_ANALYZED: 'Not analyzed'
  };
  const lines = [
    '## Product Outcome',
    '',
    `- Overall: ${inlineCode(completion.status)}`,
    `- Next step: ${completion.nextStep}`,
    `- Human-review occurrences: ${completion.reviewRequiredCount}`,
    '',
    '## Dependency Decisions',
    '',
    '| Dependency occurrence | Installed → Target | Decision | Risk / coverage | Why / next step |',
    '| --- | --- | --- | --- | --- |'
  ];
  for (const decision of completion.decisions) {
    lines.push(
      `| ${inlineCode(`${decision.dependency} — ${decision.projectId}`)} | `
      + `${inlineCode(`${decision.installedVersion ?? 'unknown'} → ${decision.targetVersion ?? 'unknown'}`)} | `
      + `${tableText(labels[decision.decision])} | ${tableText(decision.coverage)} | `
      + `${tableText(decision.explanation)} Next: ${tableText(decision.nextStep)} |`
    );
  }
  if (completion.failedOccurrences.length > 0) {
    lines.push('', '## Failed Dependency Occurrences', '');
    for (const failure of completion.failedOccurrences) {
      lines.push(
        `- ${inlineCode(`${failure.dependency} — ${failure.projectId}`)}: `
        + `${failure.stage}. ${failure.recovery}`
      );
    }
  }
  lines.push('');
  return lines;
}

function requireViewModel(viewModel) {
  if (!viewModel?.summary || !Array.isArray(viewModel?.dependencies)) {
    throw new Error('Markdown renderer requires an Impact Presentation View Model.');
  }
}

function renderFinding(finding) {
  const lines = [
    `#### ${headingText(finding.summary)}`,
    '',
    `- Finding ID: ${inlineCode(finding.findingId)}`,
    `- Impact status: ${inlineCode(finding.status ?? (finding.impacted ? 'IMPACTED' : 'COVERAGE_UNAVAILABLE'))}`,
    `- Evidence reason: ${inlineCode(finding.reasonCode)}`
  ];
  if (finding.matchedSymbols.length === 0) {
    lines.push('- Matched symbols: None', '');
    return lines;
  }
  lines.push('- Matched symbols:');
  for (const match of finding.matchedSymbols) {
    lines.push(`  - ${inlineCode(match.symbol)}`);
    for (const usage of match.usages) lines.push(`    - ${inlineCode(usage.file)}`);
  }
  lines.push('');
  return lines;
}

function renderDependency(dependency) {
  const lines = [
    `### ${inlineCode(dependency.name)} (${inlineCode(dependency.packageId)})`,
    '',
    `- Impact status: ${inlineCode(dependency.impactStatus)}`,
    `- Impact reason: ${inlineCode(dependency.impactReasonCode ?? 'NONE')}`,
    `- Version Analysis status: ${inlineCode(dependency.versionAnalysisStatus)}`,
    ''
  ];
  if (['NOT_ANALYZED', 'COVERAGE_UNAVAILABLE', 'USAGE_NOT_FOUND'].includes(dependency.impactStatus)
      && dependency.message) {
    lines.push(dependency.message, '');
    if (dependency.impactStatus === 'NOT_ANALYZED') return lines;
  }
  if (dependency.findings.length === 0) {
    lines.push('No breaking findings.', '');
  } else {
    for (const finding of dependency.findings) lines.push(...renderFinding(finding));
  }
  return lines;
}

export function renderMarkdownReport({
  viewModel,
  upgradeDecision,
  migrationChecklistViewModel,
  completion
}) {
  requireViewModel(viewModel);
  const summary = viewModel.summary;
  const lines = [
    '# UpgradeLens Repository Impact Report',
    '',
    ...(completion ? renderProductCompletion(completion) : []),
    '## Repository',
    '',
    inlineCode(viewModel.repositoryName),
    '',
    '## Analysis Completeness',
    '',
    `- Status: ${viewModel.analysisStatus}`,
    `- Analyzed dependencies: ${summary.analyzedCount}`,
    `- Skipped dependencies: ${summary.skippedCount}`,
    `- Failed dependencies: ${summary.failedCount}`,
    `- Requires human review: ${summary.requiresHumanReviewCount}`,
    ''
  ];
  if (viewModel.analysisStatus === 'INCOMPLETE') {
    lines.push(
      '> Impact conclusions are incomplete because usage coverage is unavailable or some dependencies were not analyzed.',
      ''
    );
  }
  lines.push(
    '## Summary',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| Dependencies | ${summary.dependencyCount} |`,
    `| Analyzed | ${summary.analyzedCount} |`,
    `| Skipped | ${summary.skippedCount} |`,
    `| Failed | ${summary.failedCount} |`,
    `| Requires human review | ${summary.requiresHumanReviewCount} |`,
    `| Impacted | ${summary.impactedCount} |`,
    `| Not impacted | ${summary.notImpactedCount} |`,
    `| Usage not found | ${summary.usageNotFoundCount} |`,
    `| Coverage unavailable | ${summary.coverageUnavailableCount} |`,
    `| Not analyzed | ${summary.notAnalyzedCount} |`,
    `| Breaking findings | ${summary.breakingFindingCount} |`,
    `| Impacted findings | ${summary.impactedFindingCount} |`,
    `| Evidence records | ${summary.evidenceRecordCount} |`,
    `| Affected files | ${summary.affectedFileCount} |`,
    '',
    '## Dependencies',
    ''
  );
  if (viewModel.dependencies.length === 0) lines.push('No dependency impact records.', '');
  else for (const dependency of viewModel.dependencies) lines.push(...renderDependency(dependency));
  let output = `${lines.join('\n')}\n`;
  if (upgradeDecision) {
    output += `\n${renderUpgradeDecisionMarkdownSection(upgradeDecision)}`;
  }
  if (migrationChecklistViewModel) {
    output += `\n${renderMigrationChecklistMarkdownSection({ viewModel: migrationChecklistViewModel })}`;
  }
  return output;
}
