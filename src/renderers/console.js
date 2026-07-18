import { renderMigrationChecklistConsole } from '../migration-checklist/presentation.js';
import { renderUpgradeDecisionConsole } from '../upgrade-decision/presentation.js';

function requireViewModel(viewModel) {
  if (!viewModel?.summary || !Array.isArray(viewModel?.dependencies)) {
    throw new Error('Console renderer requires an Impact Presentation View Model.');
  }
}

export function renderConsoleSummary({
  viewModel,
  completion,
  reportPath,
  upgradeDecision,
  upgradeDecisionPath,
  migrationChecklistViewModel,
  migrationChecklistPath
}) {
  requireViewModel(viewModel);
  const summary = viewModel.summary;
  if (completion) {
    const decisionLabels = {
      KEEP_CURRENT: 'Keep current',
      UPGRADE_NOW: 'Upgrade now',
      PLAN_UPGRADE: 'Plan upgrade',
      INVESTIGATE: 'Investigate',
      INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
      NOT_ANALYZED: 'Not analyzed'
    };
    const lines = [
      'UpgradeLens product outcome',
      '',
      `Overall: ${completion.status}`,
      `Next step: ${completion.nextStep}`,
      '',
      'Upgrade decisions',
      '',
      `Keep current: ${completion.decisionCounts.KEEP_CURRENT}`,
      `Plan upgrade: ${completion.decisionCounts.PLAN_UPGRADE}`,
      `Upgrade now: ${completion.decisionCounts.UPGRADE_NOW}`,
      `Investigate: ${completion.decisionCounts.INVESTIGATE}`,
      `Insufficient evidence: ${completion.decisionCounts.INSUFFICIENT_EVIDENCE}`,
      `Not analyzed: ${completion.decisionCounts.NOT_ANALYZED}`,
      '',
      'Dependency occurrence | Installed -> Target | Decision | Risk / coverage | Why / next step'
    ];
    for (const decision of completion.decisions) {
      lines.push(
        `${decision.dependency} [${decision.projectId}] | `
        + `${decision.installedVersion ?? 'unknown'} -> ${decision.targetVersion ?? 'unknown'} | `
        + `${decisionLabels[decision.decision]} | ${decision.coverage} | `
        + `${decision.explanation} Next: ${decision.nextStep}`
      );
    }
    if (migrationChecklistViewModel) {
      lines.push(
        '',
        'Migration handoff',
        '',
        `Actionable with review: ${completion.handoffCounts.ACTIONABLE_WITH_REVIEW}`,
        `No version change required: ${completion.handoffCounts.NO_VERSION_CHANGE_REQUIRED}`,
        `Investigation required: ${completion.handoffCounts.INVESTIGATION_REQUIRED}`,
        `Insufficient evidence: ${completion.handoffCounts.INSUFFICIENT_EVIDENCE}`,
        `Not analyzed: ${completion.handoffCounts.NOT_ANALYZED}`,
        `No grounded action: ${completion.handoffCounts.NO_GROUNDED_ACTION}`,
        `Action generation failed: ${completion.handoffCounts.ACTION_GENERATION_FAILED}`,
        `Provider qualification: ${migrationChecklistViewModel.qualification.status}`,
        `Qualification ID: ${migrationChecklistViewModel.qualification.qualificationId ?? 'none'}`,
        `Qualification source: ${migrationChecklistViewModel.qualification.sourceKind}`,
        `Experimental override: ${migrationChecklistViewModel.qualification.experimentalOverrideUsed ? 'YES' : 'NO'}`,
        `Runtime identity: ${migrationChecklistViewModel.qualification.runtimeIdentity.provider} / `
        + `${migrationChecklistViewModel.qualification.runtimeIdentity.model} / `
        + `${migrationChecklistViewModel.qualification.runtimeIdentity.adapter}`,
        'Migration Checklist remains experimental; every action requires human review.'
      );
    }
    if (completion.failedOccurrences.length > 0) {
      lines.push('', 'Failed dependency occurrences');
      for (const failure of completion.failedOccurrences) {
        lines.push(
          `${failure.dependency} [${failure.projectId}] — ${failure.stage}: `
          + `${failure.recovery}`
        );
      }
    }
    lines.push(
      '',
      'Artifacts',
      '',
      `Report: ${reportPath}`,
      `Upgrade Decision: ${upgradeDecisionPath}`
    );
    if (migrationChecklistPath) lines.push(`Migration Checklist: ${migrationChecklistPath}`);
    lines.push(
      '',
      'Analysis diagnostics',
      '',
      `Dependencies: ${summary.dependencyCount}`,
      `Analyzed: ${summary.analyzedCount}`,
      `Skipped: ${summary.skippedCount}`,
      `Failed: ${summary.failedCount}`,
      `Requires human review: ${summary.requiresHumanReviewCount}`,
      `Impacted: ${summary.impactedCount}`,
      `Coverage unavailable: ${summary.coverageUnavailableCount}`,
      `Not analyzed: ${summary.notAnalyzedCount}`,
      ''
    );
    return lines.join('\n');
  }
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
  if (upgradeDecision) {
    output += `\n${renderUpgradeDecisionConsole({
      artifact: upgradeDecision,
      artifactPath: upgradeDecisionPath
    })}`;
  }
  if (migrationChecklistViewModel) {
    output += `\n${renderMigrationChecklistConsole({
      viewModel: migrationChecklistViewModel,
      artifactPath: migrationChecklistPath
    })}`;
  }
  return output;
}
