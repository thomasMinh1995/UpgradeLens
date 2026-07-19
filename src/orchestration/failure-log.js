import path from 'node:path';

import { DEFAULT_ANALYSIS_LOG_PATH, PRODUCT_NAME } from '../constants.js';
import { writeTextArtifact } from './text-writer.js';

export function renderAnalysisFailureLog(error) {
  const message = error.cause?.message ?? error.message;
  const lines = [
    `${PRODUCT_NAME} analysis failure`,
    `Stage: ${error.stage.label}`,
    `Message: ${message}`
  ];
  if (error.cause?.decision) {
    lines.push(
      `Qualification status: ${error.cause.decision.status}`,
      `Reason: ${error.cause.decision.reasonCode}`,
      `Source: ${error.cause.decision.sourceKind}`,
      `Next action: ${error.cause.decision.nextAction}`
    );
  } else if (typeof error.cause?.code === 'string') {
    lines.push(`Reason: ${error.cause.code}`);
  }
  lines.push('');
  return lines.join('\n');
}

export async function writeAnalysisFailureLog(repositoryRoot, error) {
  return writeTextArtifact(
    path.join(repositoryRoot, DEFAULT_ANALYSIS_LOG_PATH),
    renderAnalysisFailureLog(error)
  );
}
