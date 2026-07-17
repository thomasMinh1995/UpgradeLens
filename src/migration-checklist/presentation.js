import { compareText } from '../portable.js';
import { validateMigrationChecklist } from './migration-checklist.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function inlineCode(value) {
  return `\`${String(value).replaceAll('`', '\\`')}\``;
}

function headingText(value) {
  return String(value).replace(/[\r\n]+/g, ' ').replaceAll('\\', '\\\\').replaceAll('#', '\\#');
}

function qualificationState(checklist) {
  const codes = new Set(checklist.limitations.map((item) => item.code));
  if (codes.has('MIGRATION_PROVIDER_NOT_QUALIFIED')
      || codes.has('FAKE_QUALIFICATION_NOT_REAL_PROVIDER')
      || codes.has('MIGRATION_QUALIFICATION_IDENTITY_MISMATCH')
      || codes.has('MIGRATION_QUALIFICATION_INSUFFICIENT')
      || codes.has('MIGRATION_RUNTIME_IDENTITY_INCOMPLETE')) {
    return 'NOT_AVAILABLE';
  }
  return 'AVAILABLE_WITH_LIMITATIONS';
}

/** Map only validated artifact fields into stable presentation data. */
export function buildMigrationChecklistViewModel(checklist) {
  validateMigrationChecklist(checklist);
  const dependencies = checklist.dependencies.map((record) => ({
    analysisResultId: record.analysisResultId,
    packageId: record.dependency.packageId,
    name: record.dependency.declaredName,
    projectId: record.dependency.projectId,
    status: record.status,
    analysisStatus: record.analysisStatus,
    currentVersion: record.versions.currentVersion,
    currentVersionLabel: record.versions.currentVersion === null
      ? 'unknown current version' : record.versions.currentVersion,
    targetVersion: record.versions.targetVersion,
    targetVersionLabel: record.versions.targetPolicy === 'registryLatest'
      ? `${record.versions.targetVersion ?? 'unknown'} (registry latest fact)`
      : (record.versions.targetVersion ?? 'unknown target version'),
    targetPolicy: record.versions.targetPolicy,
    findings: record.findings.map((finding) => ({
      id: finding.id,
      summary: finding.summary,
      status: finding.status,
      eligibilityReasonCode: finding.eligibility.reasonCode,
      evidenceRefs: [...finding.evidenceRefs],
      items: finding.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        basis: item.basis,
        label: item.basis === 'AI_AUTHORED'
          ? 'AI-authored draft'
          : item.kind === 'REVIEW_CANDIDATE_USAGE'
            ? 'Candidate review location'
            : 'Manual-review item',
        instruction: item.instruction,
        evidenceRefs: [...item.evidenceRefs],
        candidateLocations: structuredClone(item.candidateLocations),
        requiresHumanReview: item.requiresHumanReview
      }))
    })),
    limitations: structuredClone(record.limitations)
  })).sort((left, right) => (
    compareText(left.projectId, right.projectId)
    || compareText(left.packageId, right.packageId)
    || compareText(left.analysisResultId, right.analysisResultId)
  ));
  return deepFreeze({
    repositoryName: checklist.repository.name,
    status: checklist.status,
    experimental: true,
    qualificationState: qualificationState(checklist),
    humanReviewRequired: true,
    summary: structuredClone(checklist.summary),
    dependencies,
    limitations: structuredClone(checklist.limitations)
  });
}

export function renderMigrationChecklistConsole({ viewModel, artifactPath }) {
  const summary = viewModel.summary;
  const heading = summary.groundedActionCount === 0
    ? '! Migration checklist contains no grounded action'
    : summary.limitationCount > 0
      ? '✓ Migration checklist created with limitations'
      : '✓ Migration checklist created';
  const lines = [
    heading,
    '',
    `  ${summary.findingCount} breaking findings represented`,
    `  ${summary.aiAuthoredItemCount} evidence-grounded AI-authored draft actions`,
    `  ${summary.candidateLocationCount} candidate review locations`,
    `  ${summary.requiresHumanReviewItemCount} checklist items require human review`,
    `  Provider qualification: ${viewModel.qualificationState}`,
    '  Human review required: YES'
  ];
  if (summary.groundedActionCount === 0) {
    lines.push(
      '',
      '  Selected official evidence did not yield an explicit grounded migration action.',
      '  Manual review is required.'
    );
  }
  lines.push('', `  Checklist  ${artifactPath}`, '');
  return lines.join('\n');
}

function renderItem(item) {
  const lines = [
    `- **${item.label} — requires human review:** ${item.instruction}`,
    `  - Evidence references: ${item.evidenceRefs.length > 0
      ? item.evidenceRefs.map(inlineCode).join(', ') : 'None'}`
  ];
  for (const location of item.candidateLocations) {
    lines.push(
      `  - Candidate review location: ${inlineCode(location.symbol)} in ${inlineCode(location.file)}; impact evidence ${inlineCode(location.impactEvidenceId)}`
    );
  }
  return lines;
}

function renderDependency(dependency) {
  const lines = [
    `### ${inlineCode(dependency.name)} (${inlineCode(dependency.packageId)})`,
    '',
    `- Checklist status: ${inlineCode(dependency.status)}`,
    `- Current version: ${dependency.currentVersionLabel}`,
    `- Target version: ${dependency.targetVersionLabel}`,
    ''
  ];
  if (dependency.findings.length === 0) lines.push('No grounded breaking-change record is available.', '');
  for (const finding of dependency.findings) {
    lines.push(
      `#### ${headingText(finding.summary)}`,
      '',
      `- Finding ID: ${inlineCode(finding.id)}`,
      `- Eligibility: ${inlineCode(finding.eligibilityReasonCode)}`,
      `- Evidence references: ${finding.evidenceRefs.length > 0
        ? finding.evidenceRefs.map(inlineCode).join(', ') : 'None'}`,
      ''
    );
    for (const item of finding.items) lines.push(...renderItem(item));
    lines.push('');
  }
  if (dependency.limitations.length > 0) {
    lines.push('Limitations:');
    for (const item of dependency.limitations) lines.push(`- ${inlineCode(item.code)}: ${item.message}`);
    lines.push('');
  }
  return lines;
}

export function renderMigrationChecklistMarkdownSection({ viewModel }) {
  const lines = [
    '## Migration Checklist',
    '',
    '> Experimental evidence-grounded checklist. Every AI-authored draft requires human review.',
    '>',
    '> Checklist coverage marked COMPLETE applies only to the grounded records represented here. It does not mean the upgrade is safe or the migration is complete.',
    '',
    `- Checklist status: ${inlineCode(viewModel.status)}`,
    `- Provider qualification: ${inlineCode(viewModel.qualificationState)}`,
    '- Human review required: **YES**',
    `- Evidence-grounded AI-authored drafts: ${viewModel.summary.aiAuthoredItemCount}`,
    `- Candidate review locations: ${viewModel.summary.candidateLocationCount}`,
    ''
  ];
  if (viewModel.dependencies.length === 0) lines.push('No migration checklist dependency records.', '');
  else for (const dependency of viewModel.dependencies) lines.push(...renderDependency(dependency));
  if (viewModel.limitations.length > 0) {
    lines.push('### Migration Checklist Limitations', '');
    for (const item of viewModel.limitations) {
      lines.push(`- ${inlineCode(item.code)}: ${item.message}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}
