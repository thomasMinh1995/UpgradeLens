function inlineCode(value) {
  return `\`${String(value).replaceAll('`', '\\`')}\``;
}

export function renderUpgradeDecisionConsole({ artifact, artifactPath }) {
  const lines = [
    'Upgrade Decisions',
    '',
    `Keep current: ${artifact.summary.KEEP_CURRENT}`,
    `Upgrade now: ${artifact.summary.UPGRADE_NOW}`,
    `Plan upgrade: ${artifact.summary.PLAN_UPGRADE}`,
    `Investigate: ${artifact.summary.INVESTIGATE}`,
    `Insufficient evidence: ${artifact.summary.INSUFFICIENT_EVIDENCE}`,
    `Not analyzed: ${artifact.summary.NOT_ANALYZED}`,
    `Artifact: ${artifactPath}`,
    ''
  ];
  for (const record of artifact.decisions) {
    lines.push(
      `${record.occurrence.declaredName}: ${record.decision} (${record.primaryReasonCode})`
    );
  }
  return `${lines.join('\n')}\n`;
}

export function renderUpgradeDecisionMarkdownSection(artifact) {
  const lines = [
    '## Upgrade Decisions',
    '',
    '| Dependency occurrence | Installed | Target | Decision | Reason |',
    '| --- | --- | --- | --- | --- |'
  ];
  for (const record of artifact.decisions) {
    const occurrence = `${record.occurrence.declaredName} — ${record.occurrence.manifest} (${record.occurrence.dependencyType})`;
    lines.push(
      `| ${inlineCode(occurrence)} | ${inlineCode(record.versions.installedVersion ?? 'unavailable')} | `
      + `${inlineCode(record.versions.targetVersion ?? 'unavailable')} | ${inlineCode(record.decision)} | `
      + `${inlineCode(record.primaryReasonCode)} |`
    );
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
