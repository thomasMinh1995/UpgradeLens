import { canonicalJson } from '../canonical-json.js';
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

function qualificationPresentation(decision, checklist) {
  if (!decision || typeof decision.status !== 'string'
      || typeof decision.executionAllowed !== 'boolean'
      || !Array.isArray(decision.limitations)) {
    throw new TypeError('Migration Checklist presentation requires a normalized qualification decision.');
  }
  if (!decision.executionAllowed) {
    throw new TypeError('Migration Checklist presentation cannot render a blocked qualification decision.');
  }
  if (canonicalJson(decision.limitations) !== canonicalJson(checklist.limitations)) {
    throw new TypeError('Migration Checklist qualification decision and artifact limitations do not match.');
  }
  return {
    status: decision.status,
    qualificationId: decision.qualificationId,
    sourceKind: decision.sourceKind,
    sourcePath: decision.sourcePath,
    runtimeIdentity: structuredClone(decision.runtimeIdentity),
    experimentalOverrideUsed: decision.experimentalOverrideUsed,
    limitations: structuredClone(decision.limitations),
    nextAction: decision.nextAction
  };
}

/** Map only validated artifact fields into stable presentation data. */
export function buildMigrationChecklistViewModel(checklist, { qualificationDecision } = {}) {
  validateMigrationChecklist(checklist);
  const dependencies = checklist.dependencies.map((record) => ({
    analysisResultId: record.analysisResultId,
    packageId: record.dependency.packageId,
    name: record.dependency.declaredName,
    projectId: record.dependency.projectId,
    manifest: record.dependency.manifest,
    status: record.status,
    handoffStatus: record.handoff.status,
    decisionStatus: record.decision.status,
    decisionId: record.decisionId,
    targetOrigin: record.decision.targetOrigin,
    recommendationDriver: record.decision.recommendationDriver,
    decisionReasonCodes: [...record.decision.reasonCodes],
    analysisStatus: record.analysisStatus,
    installedVersion: record.versions.installedVersion ?? record.versions.currentVersion,
    currentVersion: record.versions.currentVersion,
    currentVersionLabel: record.versions.currentVersion === null
      ? 'unknown current version' : record.versions.currentVersion,
    targetVersion: record.versions.targetVersion,
    targetVersionLabel: record.versions.targetPolicy === 'registryLatest'
      ? `${record.versions.targetVersion ?? 'unknown'} (registry latest fact)`
      : (record.versions.targetVersion ?? 'unknown target version'),
    targetPolicy: record.versions.targetPolicy,
    affectedAreas: structuredClone(record.handoff.affectedAreas),
    coverage: structuredClone(record.handoff.coverage),
    verification: structuredClone(record.handoff.verification),
    officialEvidence: structuredClone(record.handoff.officialEvidence),
    preconditions: structuredClone(record.handoff.preconditions),
    recovery: structuredClone(record.handoff.recovery),
    reviewQuestions: [...record.handoff.reviewQuestions],
    missingInformation: structuredClone(record.handoff.missingInformation),
    nextStep: structuredClone(record.handoff.nextStep),
    humanReviewRequired: record.handoff.humanReviewRequired,
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
          ? 'AI-selected official guidance'
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
    qualification: qualificationPresentation(qualificationDecision, checklist),
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
    `  ${summary.aiAuthoredItemCount} AI-selected official guidance items`,
    `  ${summary.candidateLocationCount} candidate review locations`,
    `  ${summary.handoffStatusCounts.ACTIONABLE_WITH_REVIEW} actionable handoffs require review`,
    `  ${summary.handoffStatusCounts.INVESTIGATION_REQUIRED} investigation handoffs`,
    `  ${summary.requiresHumanReviewItemCount} checklist items require human review`,
    `  Provider qualification: ${viewModel.qualification.status}`,
    `  Qualification ID: ${viewModel.qualification.qualificationId ?? 'none'}`,
    `  Qualification source: ${viewModel.qualification.sourceKind}`,
    `  Experimental override: ${viewModel.qualification.experimentalOverrideUsed ? 'YES' : 'NO'}`,
    `  Runtime identity: ${viewModel.qualification.runtimeIdentity.provider} / ${viewModel.qualification.runtimeIdentity.model} / ${viewModel.qualification.runtimeIdentity.adapter}`,
    '  Human review required: YES'
  ];
  if (viewModel.qualification.sourcePath) {
    lines.splice(9, 0, `  Qualification path: ${viewModel.qualification.sourcePath}`);
  }
  if (viewModel.qualification.nextAction !== 'NONE') {
    lines.push(`  Next action: ${viewModel.qualification.nextAction}`);
  }
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
    `- Handoff status: ${inlineCode(dependency.handoffStatus)}`,
    `- Upgrade decision: ${inlineCode(dependency.decisionStatus)}`,
    `- Decision ID: ${inlineCode(dependency.decisionId)}`,
    `- Target origin: ${inlineCode(dependency.targetOrigin)}`,
    `- Recommendation driver: ${inlineCode(dependency.recommendationDriver ?? 'none')}`,
    `- Manifest: ${inlineCode(dependency.manifest)}`,
    `- Installed version: ${dependency.installedVersion ?? 'unknown'}`,
    `- Current version: ${dependency.currentVersionLabel}`,
    `- Target version: ${dependency.targetVersionLabel}`,
    `- Usage coverage: ${inlineCode(`${dependency.coverage.status} / ${dependency.coverage.reasonCode ?? 'none'}`)}`,
    `- Next step: ${inlineCode(dependency.nextStep.code)} — ${dependency.nextStep.message}`,
    ''
  ];
  if (dependency.affectedAreas.length === 0) {
    lines.push('Affected areas: none verified. This is not proof that source adaptation is unnecessary.', '');
  } else {
    lines.push('Affected areas to inspect before proposing a patch:');
    for (const area of dependency.affectedAreas) {
      lines.push(
        `- ${inlineCode(area.file)} — symbol ${inlineCode(area.symbol)}; finding ${inlineCode(area.findingId)}; impact evidence ${inlineCode(area.impactEvidenceId)}`
      );
    }
    lines.push('');
  }
  if (dependency.verification.status === 'AVAILABLE') {
    lines.push('Project-derived verification commands:');
    for (const command of dependency.verification.commands) {
      lines.push(
        `- ${inlineCode(command.command)} from ${inlineCode(command.source.path)}; run in ${inlineCode(command.workingDirectory)}`
      );
    }
    lines.push('');
  } else if (dependency.verification.status !== 'NOT_APPLICABLE') {
    lines.push(`${inlineCode('VERIFICATION_COMMAND_UNAVAILABLE')}: no supported project-derived verification command is available.`, '');
  }
  if (dependency.officialEvidence.length > 0) {
    lines.push('Official evidence metadata:');
    for (const evidence of dependency.officialEvidence) {
      lines.push(
        `- ${inlineCode(evidence.id)} — ${evidence.kind}; `
        + `${evidence.authority}/${evidence.trust}; `
        + `releases ${evidence.releaseVersions.join(', ')}; locator ${inlineCode(evidence.locator)}`
      );
    }
    lines.push('');
  }
  if (dependency.reviewQuestions.length > 0) {
    lines.push('Investigation questions:');
    for (const question of dependency.reviewQuestions) lines.push(`- ${question}`);
    lines.push('');
  }
  if (dependency.missingInformation.length > 0) {
    lines.push('Missing information:');
    for (const item of dependency.missingInformation) {
      lines.push(`- ${inlineCode(item.code)}: ${item.message}`);
    }
    lines.push('');
  }
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
    '> Experimental evidence-grounded checklist. Every AI-selected official guidance item requires human review.',
    '>',
    '> Checklist coverage marked COMPLETE applies only to the grounded records represented here. It does not mean the upgrade is safe or the migration is complete.',
    '>',
    '> Coding Agents must inspect every listed affected source area before designing or applying a patch.',
    '',
    `- Checklist status: ${inlineCode(viewModel.status)}`,
    `- Provider qualification: ${inlineCode(viewModel.qualification.status)}`,
    `- Qualification ID: ${inlineCode(viewModel.qualification.qualificationId ?? 'none')}`,
    `- Qualification source: ${inlineCode(viewModel.qualification.sourceKind)}`,
    `- Qualification path: ${inlineCode(viewModel.qualification.sourcePath ?? 'none')}`,
    `- Experimental override: **${viewModel.qualification.experimentalOverrideUsed ? 'YES' : 'NO'}**`,
    `- Runtime identity: ${inlineCode(`${viewModel.qualification.runtimeIdentity.provider} / ${viewModel.qualification.runtimeIdentity.model} / ${viewModel.qualification.runtimeIdentity.adapter}`)}`,
    '- Human review required: **YES**',
    `- AI-selected official guidance items: ${viewModel.summary.aiAuthoredItemCount}`,
    `- Candidate review locations: ${viewModel.summary.candidateLocationCount}`,
    ''
  ];
  if (viewModel.qualification.nextAction !== 'NONE') {
    lines.splice(11, 0, `- Next action: ${inlineCode(viewModel.qualification.nextAction)}`);
  }
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
