import { readFile } from 'node:fs/promises';

import {
  GOVERNANCE_VALIDATION_STAGES,
  createGovernanceDiagnostic
} from './governance-diagnostics.js';
import { validateGovernanceArtifacts } from './governance-validator.js';

const ARTIFACTS = Object.freeze([
  ['capabilityProfile', 'UNKNOWN_CAPABILITY'],
  ['deploymentProfile', 'UNKNOWN_DEPLOYMENT'],
  ['conformanceReport', 'UNKNOWN_CONFORMANCE'],
  ['qualificationRecord', 'UNKNOWN_QUALIFICATION']
]);

async function loadJsonArtifact(filePath, artifact, unknownCode) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return {
      diagnostic: createGovernanceDiagnostic({
        stage: GOVERNANCE_VALIDATION_STAGES.LOAD_JSON,
        code: unknownCode,
        artifact,
        message: 'Required governance artifact path is missing.'
      })
    };
  }
  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    return {
      diagnostic: createGovernanceDiagnostic({
        stage: GOVERNANCE_VALIDATION_STAGES.LOAD_JSON,
        code: unknownCode,
        artifact,
        message: 'Required governance artifact could not be loaded.'
      })
    };
  }
  try {
    return { value: JSON.parse(text) };
  } catch {
    return {
      diagnostic: createGovernanceDiagnostic({
        stage: GOVERNANCE_VALIDATION_STAGES.LOAD_JSON,
        code: 'INVALID_JSON',
        artifact,
        message: 'Governance artifact is not valid JSON.'
      })
    };
  }
}

export async function loadGovernanceBundle(paths, options = {}) {
  const artifacts = {};
  const initialDiagnostics = [];
  for (const [artifact, unknownCode] of ARTIFACTS) {
    const loaded = await loadJsonArtifact(paths?.[artifact], artifact, unknownCode);
    if (loaded.diagnostic) initialDiagnostics.push(loaded.diagnostic);
    else artifacts[artifact] = loaded.value;
  }
  return validateGovernanceArtifacts(artifacts, { ...options, initialDiagnostics });
}
