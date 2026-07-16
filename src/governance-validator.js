import { createHash } from 'node:crypto';

import { canonicalJsonBytes } from './canonical-json.js';
import { validateConformanceReport } from './conformance-report.js';
import {
  assertNoGovernanceSecrets,
  validateCapabilityProfileSchema,
  validateDeploymentProfileSchema,
  validateQualificationRecordSchema
} from './governance-metadata.js';
import {
  GOVERNANCE_VALIDATION_STAGES,
  createGovernanceDiagnostic,
  sortGovernanceDiagnostics
} from './governance-diagnostics.js';
import { compareText } from './portable.js';

const ARTIFACTS = Object.freeze([
  {
    key: 'capabilityProfile',
    unknownCode: 'UNKNOWN_CAPABILITY',
    validateSchema: validateCapabilityProfileSchema
  },
  {
    key: 'deploymentProfile',
    unknownCode: 'UNKNOWN_DEPLOYMENT',
    validateSchema: validateDeploymentProfileSchema
  },
  {
    key: 'conformanceReport',
    unknownCode: 'UNKNOWN_CONFORMANCE',
    validateSchema: validateConformanceReport
  },
  {
    key: 'qualificationRecord',
    unknownCode: 'UNKNOWN_QUALIFICATION',
    validateSchema: validateQualificationRecordSchema
  }
]);

function digest(value) {
  return `sha256:${createHash('sha256').update(canonicalJsonBytes(value)).digest('hex')}`;
}

function addDiagnostic(diagnostics, diagnostic) {
  diagnostics.push(createGovernanceDiagnostic(diagnostic));
}

function hasInitialDiagnostic(initialDiagnostics, artifact) {
  return initialDiagnostics.some((diagnostic) => diagnostic.artifact === artifact);
}

function validateSchemas(artifacts, initialDiagnostics, diagnostics) {
  const valid = {};
  for (const definition of ARTIFACTS) {
    const value = artifacts?.[definition.key];
    if (value === undefined) {
      if (!hasInitialDiagnostic(initialDiagnostics, definition.key)) {
        addDiagnostic(diagnostics, {
          stage: GOVERNANCE_VALIDATION_STAGES.LOAD_JSON,
          code: definition.unknownCode,
          artifact: definition.key,
          message: 'Required governance artifact is unavailable.'
        });
      }
      valid[definition.key] = false;
      continue;
    }
    try {
      definition.validateSchema(value);
      valid[definition.key] = true;
    } catch {
      addDiagnostic(diagnostics, {
        stage: GOVERNANCE_VALIDATION_STAGES.SCHEMA_VALIDATION,
        code: 'INVALID_SCHEMA',
        artifact: definition.key,
        message: 'Governance artifact failed schema or intrinsic invariant validation.'
      });
      valid[definition.key] = false;
    }
  }
  return valid;
}

function calculateDigests(artifacts, valid, diagnostics) {
  const digests = {};
  for (const definition of ARTIFACTS) {
    if (!valid[definition.key]) continue;
    try {
      digests[definition.key] = digest(artifacts[definition.key]);
    } catch {
      addDiagnostic(diagnostics, {
        stage: GOVERNANCE_VALIDATION_STAGES.DIGEST_VERIFICATION,
        code: 'DIGEST_MISMATCH',
        artifact: definition.key,
        message: 'Canonical SHA-256 digest could not be calculated.'
      });
      valid[definition.key] = false;
    }
  }
  return digests;
}

function compareDigest(diagnostics, artifact, path, actual, referenced) {
  if (actual === referenced) return;
  addDiagnostic(diagnostics, {
    stage: GOVERNANCE_VALIDATION_STAGES.CROSS_ARTIFACT_VALIDATION,
    code: 'DIGEST_MISMATCH',
    artifact,
    path,
    message: 'Referenced digest does not match the canonical upstream artifact digest.'
  });
}

function validateCrossArtifactLinks(artifacts, valid, digests, diagnostics) {
  const capability = artifacts.capabilityProfile;
  const deployment = artifacts.deploymentProfile;
  const conformance = artifacts.conformanceReport;
  const qualification = artifacts.qualificationRecord;

  if (valid.capabilityProfile && valid.deploymentProfile) {
    if (deployment.capabilityProfile !== capability.capabilityId) {
      addDiagnostic(diagnostics, {
        stage: GOVERNANCE_VALIDATION_STAGES.CROSS_ARTIFACT_VALIDATION,
        code: 'UNKNOWN_CAPABILITY',
        artifact: 'deploymentProfile',
        path: '$.capabilityProfile',
        message: 'Deployment Profile references a different Capability Profile ID.'
      });
    }
    compareDigest(
      diagnostics,
      'deploymentProfile',
      '$.capabilityProfileDigest',
      digests.capabilityProfile,
      deployment.capabilityProfileDigest
    );
  }

  if (valid.capabilityProfile && valid.conformanceReport) {
    compareDigest(
      diagnostics,
      'conformanceReport',
      '$.capabilityProfileDigest',
      digests.capabilityProfile,
      conformance.capabilityProfileDigest
    );
  }
  if (valid.capabilityProfile && valid.qualificationRecord) {
    compareDigest(
      diagnostics,
      'qualificationRecord',
      '$.capabilityProfileDigest',
      digests.capabilityProfile,
      qualification.capabilityProfileDigest
    );
  }

  if (valid.deploymentProfile && valid.conformanceReport) {
    compareDigest(
      diagnostics,
      'conformanceReport',
      '$.deploymentProfileDigest',
      digests.deploymentProfile,
      conformance.deploymentProfileDigest
    );
    if (conformance.runtime.provider !== deployment.provider
      || conformance.runtime.model !== deployment.model) {
      addDiagnostic(diagnostics, {
        stage: GOVERNANCE_VALIDATION_STAGES.CROSS_ARTIFACT_VALIDATION,
        code: 'UNKNOWN_DEPLOYMENT',
        artifact: 'conformanceReport',
        path: '$.runtime',
        message: 'Conformance runtime identity does not match the Deployment Profile.'
      });
    }
  }
  if (valid.deploymentProfile && valid.qualificationRecord) {
    compareDigest(
      diagnostics,
      'qualificationRecord',
      '$.deploymentProfileDigest',
      digests.deploymentProfile,
      qualification.deploymentProfileDigest
    );
  }

  if (valid.conformanceReport && valid.qualificationRecord) {
    if (qualification.conformanceReportDigest === null) {
      addDiagnostic(diagnostics, {
        stage: GOVERNANCE_VALIDATION_STAGES.CROSS_ARTIFACT_VALIDATION,
        code: 'UNKNOWN_CONFORMANCE',
        artifact: 'qualificationRecord',
        path: '$.conformanceReportDigest',
        message: 'Qualification Record does not reference the loaded Conformance Report.'
      });
    } else {
      compareDigest(
        diagnostics,
        'qualificationRecord',
        '$.conformanceReportDigest',
        digests.conformanceReport,
        qualification.conformanceReportDigest
      );
    }
  }
}

function mutableModelAlias(model) {
  return /(?:^|[:/@._-])(?:latest|main|master|stable|current)(?:$|[:/@._-])/i.test(model);
}

function validatePolicy(artifacts, valid, diagnostics) {
  for (const definition of ARTIFACTS.filter((entry) => entry.key !== 'conformanceReport')) {
    if (!valid[definition.key]) continue;
    try {
      assertNoGovernanceSecrets(artifacts[definition.key]);
    } catch {
      addDiagnostic(diagnostics, {
        stage: GOVERNANCE_VALIDATION_STAGES.GOVERNANCE_POLICY_VALIDATION,
        code: 'GOVERNANCE_POLICY_VIOLATION',
        artifact: definition.key,
        message: 'Governance artifact contains a forbidden field or secret-like value.'
      });
    }
  }

  const capability = artifacts.capabilityProfile;
  if (valid.capabilityProfile && capability.structuredOutput === 'jsonMode' && !capability.jsonMode) {
    addDiagnostic(diagnostics, {
      stage: GOVERNANCE_VALIDATION_STAGES.GOVERNANCE_POLICY_VALIDATION,
      code: 'GOVERNANCE_POLICY_VIOLATION',
      artifact: 'capabilityProfile',
      path: '$.jsonMode',
      message: 'jsonMode must be true when it is the declared structured output mode.'
    });
  }

  const deployment = artifacts.deploymentProfile;
  if (valid.deploymentProfile) {
    const endpoint = new URL(deployment.endpoint);
    if (!['http:', 'https:'].includes(endpoint.protocol)
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
      addDiagnostic(diagnostics, {
        stage: GOVERNANCE_VALIDATION_STAGES.GOVERNANCE_POLICY_VALIDATION,
        code: 'GOVERNANCE_POLICY_VIOLATION',
        artifact: 'deploymentProfile',
        path: '$.endpoint',
        message: 'Deployment endpoint violates portable credential-free URL policy.'
      });
    }
  }

  const qualification = artifacts.qualificationRecord;
  const conformance = artifacts.conformanceReport;
  if (valid.qualificationRecord) {
    if (!qualification.qualifiedFor.every((task, index, tasks) => (
      index === 0 || compareText(tasks[index - 1], task) < 0
    ))) {
      addDiagnostic(diagnostics, {
        stage: GOVERNANCE_VALIDATION_STAGES.GOVERNANCE_POLICY_VALIDATION,
        code: 'GOVERNANCE_POLICY_VIOLATION',
        artifact: 'qualificationRecord',
        path: '$.qualifiedFor',
        message: 'Qualification task scope must be unique and lexically ordered.'
      });
    }
    if (['SUPPORTED', 'CERTIFIED'].includes(qualification.status)
      && qualification.conformanceReportDigest === null) {
      addDiagnostic(diagnostics, {
        stage: GOVERNANCE_VALIDATION_STAGES.GOVERNANCE_POLICY_VALIDATION,
        code: 'INVALID_CERTIFICATION_STATE',
        artifact: 'qualificationRecord',
        path: '$.status',
        message: 'SUPPORTED and CERTIFIED require a Conformance Report digest.'
      });
    }
  }

  if (valid.qualificationRecord && valid.conformanceReport
    && ['SUPPORTED', 'CERTIFIED'].includes(qualification.status)
    && conformance.recommendation !== 'CONFORMANT') {
    addDiagnostic(diagnostics, {
      stage: GOVERNANCE_VALIDATION_STAGES.GOVERNANCE_POLICY_VALIDATION,
      code: 'INVALID_CERTIFICATION_STATE',
      artifact: 'qualificationRecord',
      path: '$.status',
      message: 'SUPPORTED and CERTIFIED require a CONFORMANT Conformance Report.'
    });
  }

  if (valid.qualificationRecord && valid.deploymentProfile
    && qualification.status === 'CERTIFIED'
    && mutableModelAlias(deployment.model)
    && (typeof deployment.modelRevision !== 'string'
      || mutableModelAlias(deployment.modelRevision))) {
    addDiagnostic(diagnostics, {
      stage: GOVERNANCE_VALIDATION_STAGES.GOVERNANCE_POLICY_VALIDATION,
      code: 'INVALID_CERTIFICATION_STATE',
      artifact: 'qualificationRecord',
      path: '$.status',
      message: 'CERTIFIED is not allowed for a mutable model alias without modelRevision pinning.'
    });
  }
}

function requestedTasks(options) {
  const tasks = [
    ...(typeof options.task === 'string' ? [options.task] : []),
    ...(Array.isArray(options.tasks) ? options.tasks : [])
  ];
  return [...new Set(tasks.filter((task) => typeof task === 'string' && task.length > 0))].sort(compareText);
}

function validateTaskScope(artifacts, valid, options, diagnostics) {
  if (!valid.qualificationRecord) return;
  const qualified = new Set(artifacts.qualificationRecord.qualifiedFor);
  for (const [index, task] of requestedTasks(options).entries()) {
    if (qualified.has(task)) continue;
    addDiagnostic(diagnostics, {
      stage: GOVERNANCE_VALIDATION_STAGES.TASK_SCOPE_VALIDATION,
      code: 'TASK_SCOPE_MISMATCH',
      artifact: 'qualificationRecord',
      path: `$.requestedTasks[${index}]`,
      message: 'Qualification Record does not explicitly cover the requested task.'
    });
  }
}

export function validateGovernanceArtifacts(artifacts, options = {}) {
  const initialDiagnostics = Array.isArray(options.initialDiagnostics)
    ? options.initialDiagnostics
    : [];
  const diagnostics = [...initialDiagnostics];
  const validArtifacts = validateSchemas(artifacts, initialDiagnostics, diagnostics);
  const digests = calculateDigests(artifacts, validArtifacts, diagnostics);
  validateCrossArtifactLinks(artifacts, validArtifacts, digests, diagnostics);
  validatePolicy(artifacts, validArtifacts, diagnostics);
  validateTaskScope(artifacts, validArtifacts, options, diagnostics);
  const sortedDiagnostics = sortGovernanceDiagnostics(diagnostics);
  const valid = sortedDiagnostics.length === 0;
  return {
    valid,
    diagnostics: sortedDiagnostics,
    bundle: valid
      ? {
          capabilityProfile: artifacts.capabilityProfile,
          deploymentProfile: artifacts.deploymentProfile,
          conformanceReport: artifacts.conformanceReport,
          qualificationRecord: artifacts.qualificationRecord,
          digests: {
            capabilityProfile: digests.capabilityProfile,
            deploymentProfile: digests.deploymentProfile,
            conformanceReport: digests.conformanceReport,
            qualificationRecord: digests.qualificationRecord
          }
        }
      : null
  };
}
