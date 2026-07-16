export const ANALYSIS_PRESENTATION_STATUSES = Object.freeze(['COMPLETE', 'INCOMPLETE']);
export const DEPENDENCY_IMPACT_STATUSES = Object.freeze([
  'IMPACTED',
  'NOT_IMPACTED',
  'NOT_ANALYZED'
]);

const VERSION_ANALYSIS_STATUSES = new Set(['analyzed', 'skipped', 'failed']);

function inputError(message) {
  return new Error(`Impact presentation input error: ${message}`);
}

function requireInputs(projectManifest, versionAnalysis, repositoryImpact, impactEvidence) {
  if (!projectManifest?.repository?.name) throw inputError('Project Manifest repository is required.');
  if (!Array.isArray(versionAnalysis?.results) || !versionAnalysis?.summary) {
    throw inputError('Version Analysis results and summary are required.');
  }
  if (!Array.isArray(repositoryImpact?.dependencies) || !repositoryImpact?.summary) {
    throw inputError('Repository Impact dependencies and summary are required.');
  }
  if (!Array.isArray(impactEvidence?.dependencies) || !impactEvidence?.summary) {
    throw inputError('Repository Impact Evidence dependencies and summary are required.');
  }
}

function indexUnique(items, key, label) {
  const indexed = new Map();
  for (const item of items) {
    const value = item?.[key];
    if (typeof value !== 'string' || value.length === 0) throw inputError(`${label} has no ${key}.`);
    if (indexed.has(value)) throw inputError(`${label} has duplicate ${key} ${value}.`);
    indexed.set(value, item);
  }
  return indexed;
}

function requireCount(actual, expected, field) {
  if (actual !== expected) throw inputError(`${field} is ${actual}; expected ${expected}.`);
}

function validateVersionSummary(versionAnalysis, counts) {
  requireCount(versionAnalysis.summary.resultCount, counts.dependencyCount, 'Version Analysis summary.resultCount');
  requireCount(versionAnalysis.summary.analyzedCount, counts.analyzedCount, 'Version Analysis summary.analyzedCount');
  requireCount(versionAnalysis.summary.skippedCount, counts.skippedCount, 'Version Analysis summary.skippedCount');
  requireCount(versionAnalysis.summary.failedCount, counts.failedCount, 'Version Analysis summary.failedCount');
  requireCount(
    versionAnalysis.summary.requiresHumanReviewCount,
    counts.requiresHumanReviewCount,
    'Version Analysis summary.requiresHumanReviewCount'
  );
}

function validateDependencyIdentity(versionResult, impact, evidence) {
  const expected = {
    projectId: versionResult.dependency.projectId,
    packageId: versionResult.dependency.packageId,
    name: versionResult.dependency.declaredName
  };
  for (const [field, value] of Object.entries(expected)) {
    if (impact[field] !== value) {
      throw inputError(`Repository Impact ${impact.analysisResultId} ${field} does not match Version Analysis.`);
    }
    if (evidence[field] !== value) {
      throw inputError(`Impact Evidence ${evidence.analysisResultId} ${field} does not match Version Analysis.`);
    }
  }
  if (evidence.impacted !== impact.impacted) {
    throw inputError(`Impact Evidence ${evidence.analysisResultId} impacted state does not match Repository Impact.`);
  }
}

function validateFindingReferences(impact, evidence) {
  const impactFindings = indexUnique(impact.findings, 'id', `Repository Impact ${impact.analysisResultId} findings`);
  const evidenceFindings = indexUnique(
    evidence.findings,
    'findingId',
    `Impact Evidence ${evidence.analysisResultId} findings`
  );
  if (impactFindings.size !== evidenceFindings.size) {
    throw inputError(`finding count differs for analysis result ${impact.analysisResultId}.`);
  }
  for (const [findingId, findingEvidence] of evidenceFindings) {
    const finding = impactFindings.get(findingId);
    if (!finding) throw inputError(`Impact Evidence references missing finding ${findingId}.`);
    for (const field of ['kind', 'summary', 'impacted']) {
      if (findingEvidence[field] !== finding[field]) {
        throw inputError(`Impact Evidence finding ${findingId} ${field} does not match Repository Impact.`);
      }
    }
  }
}

function impactStatus(versionStatus, impacted) {
  if (versionStatus !== 'analyzed') return 'NOT_ANALYZED';
  return impacted ? 'IMPACTED' : 'NOT_IMPACTED';
}

function notAnalyzedMessage(versionStatus) {
  if (versionStatus === 'skipped') {
    return 'Impact could not be evaluated because Version Analysis was skipped.';
  }
  if (versionStatus === 'failed') {
    return 'Impact could not be evaluated because Version Analysis failed.';
  }
  return null;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function buildImpactPresentationViewModel({
  projectManifest,
  versionAnalysis,
  repositoryImpact,
  impactEvidence
}) {
  requireInputs(projectManifest, versionAnalysis, repositoryImpact, impactEvidence);
  const versionResults = indexUnique(versionAnalysis.results, 'id', 'Version Analysis results');
  const impacts = indexUnique(repositoryImpact.dependencies, 'analysisResultId', 'Repository Impact dependencies');
  const evidence = indexUnique(impactEvidence.dependencies, 'analysisResultId', 'Impact Evidence dependencies');
  const dependencyCount = versionResults.size;
  requireCount(impacts.size, dependencyCount, 'Repository Impact dependency count');
  requireCount(evidence.size, dependencyCount, 'Impact Evidence dependency count');

  const statusCounts = { analyzed: 0, skipped: 0, failed: 0 };
  let requiresHumanReviewCount = 0;
  for (const result of versionAnalysis.results) {
    if (!VERSION_ANALYSIS_STATUSES.has(result.status)) {
      throw inputError(`Version Analysis result ${result.id} has unsupported status ${result.status}.`);
    }
    if (!result.dependency || !Array.isArray(result.findings)) {
      throw inputError(`Version Analysis result ${result.id} is missing dependency facts or findings.`);
    }
    statusCounts[result.status] += 1;
    if (result.requiresHumanReview) requiresHumanReviewCount += 1;
    if (!impacts.has(result.id)) throw inputError(`Version Analysis result ${result.id} has no Repository Impact record.`);
    if (!evidence.has(result.id)) throw inputError(`Version Analysis result ${result.id} has no Impact Evidence record.`);
  }

  const counts = {
    dependencyCount,
    analyzedCount: statusCounts.analyzed,
    skippedCount: statusCounts.skipped,
    failedCount: statusCounts.failed,
    requiresHumanReviewCount
  };
  validateVersionSummary(versionAnalysis, counts);

  const dependencies = repositoryImpact.dependencies.map((impact) => {
    const versionResult = versionResults.get(impact.analysisResultId);
    const dependencyEvidence = evidence.get(impact.analysisResultId);
    if (!versionResult) throw inputError(`Repository Impact references missing result ${impact.analysisResultId}.`);
    if (!dependencyEvidence) throw inputError(`Repository Impact has no evidence for result ${impact.analysisResultId}.`);
    if (!Array.isArray(impact.findings) || !Array.isArray(dependencyEvidence.findings)) {
      throw inputError(`analysis result ${impact.analysisResultId} has invalid finding collections.`);
    }
    validateDependencyIdentity(versionResult, impact, dependencyEvidence);
    validateFindingReferences(impact, dependencyEvidence);
    const status = impactStatus(versionResult.status, impact.impacted);
    if (status === 'NOT_ANALYZED' && (impact.impacted || impact.findings.length > 0)) {
      throw inputError(`not-analyzed result ${impact.analysisResultId} contains an impact conclusion.`);
    }
    return {
      analysisResultId: impact.analysisResultId,
      projectId: impact.projectId,
      packageId: impact.packageId,
      name: impact.name,
      versionAnalysisStatus: versionResult.status,
      impactStatus: status,
      message: notAnalyzedMessage(versionResult.status),
      findings: structuredClone(dependencyEvidence.findings)
    };
  });

  const impactedCount = dependencies.filter((item) => item.impactStatus === 'IMPACTED').length;
  const notImpactedCount = dependencies.filter((item) => item.impactStatus === 'NOT_IMPACTED').length;
  const notAnalyzedCount = dependencies.filter((item) => item.impactStatus === 'NOT_ANALYZED').length;
  const impactFindingCount = repositoryImpact.dependencies
    .reduce((count, item) => count + item.findings.length, 0);
  const impactedFindingCount = repositoryImpact.dependencies
    .reduce((count, item) => count + item.findings.filter((finding) => finding.impacted).length, 0);
  const evidenceRecordCount = impactEvidence.dependencies
    .reduce((count, item) => count + item.findings.length, 0);
  requireCount(
    impactedCount + notImpactedCount + notAnalyzedCount,
    dependencyCount,
    'presentation impact status count'
  );
  requireCount(
    repositoryImpact.summary.dependencyCount,
    dependencyCount,
    'Repository Impact summary.dependencyCount'
  );
  requireCount(
    repositoryImpact.summary.impactedDependencyCount,
    impactedCount,
    'Repository Impact summary.impactedDependencyCount'
  );
  requireCount(
    repositoryImpact.summary.findingCount,
    impactFindingCount,
    'Repository Impact summary.findingCount'
  );
  requireCount(
    repositoryImpact.summary.impactedFindingCount,
    impactedFindingCount,
    'Repository Impact summary.impactedFindingCount'
  );
  requireCount(
    impactEvidence.summary.dependencyCount,
    dependencyCount,
    'Impact Evidence summary.dependencyCount'
  );
  requireCount(
    impactEvidence.summary.findingCount,
    evidenceRecordCount,
    'Impact Evidence summary.findingCount'
  );
  requireCount(
    impactEvidence.summary.impactedFindingCount,
    impactedFindingCount,
    'Impact Evidence summary.impactedFindingCount'
  );

  return deepFreeze({
    repositoryName: projectManifest.repository.name,
    analysisStatus: notAnalyzedCount > 0 ? 'INCOMPLETE' : 'COMPLETE',
    summary: {
      ...counts,
      impactedCount,
      notImpactedCount,
      notAnalyzedCount,
      breakingFindingCount: impactFindingCount,
      impactedFindingCount,
      evidenceRecordCount,
      affectedFileCount: impactEvidence.summary.affectedFileCount
    },
    dependencies
  });
}
