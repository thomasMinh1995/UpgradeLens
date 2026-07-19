import path from 'node:path';

import { DEFAULT_UPGRADE_DECISION_PATH } from '../constants.js';
import { loadMigrationChecklistInputs } from '../migration-checklist/input-loader.js';
import { buildUpgradeDecision } from './upgrade-decision.js';
import { writeUpgradeDecision } from './writer.js';

export async function runUpgradeDecisionStage({
  repositoryRoot,
  artifactPath = DEFAULT_UPGRADE_DECISION_PATH,
  adapters,
  writeArtifact = writeUpgradeDecision
}) {
  const artifacts = await loadMigrationChecklistInputs(repositoryRoot);
  const decision = buildUpgradeDecision(artifacts, { adapters });
  await writeArtifact(path.resolve(repositoryRoot, artifactPath), decision);
  return decision;
}
