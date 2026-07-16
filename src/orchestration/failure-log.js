import path from 'node:path';

import { DEFAULT_ANALYSIS_LOG_PATH } from '../constants.js';
import { writeTextArtifact } from './text-writer.js';

export function renderAnalysisFailureLog(error) {
  const message = error.cause?.message ?? error.message;
  return [
    'UpgradeLens analysis failure',
    `Stage: ${error.stage.label}`,
    `Message: ${message}`,
    ''
  ].join('\n');
}

export async function writeAnalysisFailureLog(repositoryRoot, error) {
  return writeTextArtifact(
    path.join(repositoryRoot, DEFAULT_ANALYSIS_LOG_PATH),
    renderAnalysisFailureLog(error)
  );
}
