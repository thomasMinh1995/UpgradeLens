import { normalizePythonPackageName } from './python-requirements.js';
import { compareText, isPortableRelativePath, isSorted } from './portable.js';

const PLAN_VERSION = '1';
const SUPPORTED_ECOSYSTEMS = new Map([
  ['node', 'npm'],
  ['python', 'pypi']
]);
const INVALID_REASONS = new Set([
  'empty-name',
  'invalid-npm-name',
  'invalid-pypi-name',
  'unnamed-direct-reference',
  'local-path-reference',
  'unsupported-reference'
]);
const INVALID_WARNING = 'INVALID_PACKAGE_REFERENCE';
const UNSUPPORTED_WARNING = 'UNSUPPORTED_RESEARCH_ECOSYSTEM';

function compareBy(...selectors) {
  return (left, right) => {
    for (const selector of selectors) {
      const result = compareText(selector(left), selector(right));
      if (result !== 0) return result;
    }
    return 0;
  };
}

const compareOccurrences = compareBy(
  (item) => item.projectId,
  (item) => item.manifest,
  (item) => item.dependencyType,
  (item) => item.declaredName,
  (item) => item.declaredVersion ?? ''
);
const compareInvalidOccurrences = compareBy(
  (item) => item.projectId,
  (item) => item.manifest,
  (item) => item.dependencyType,
  (item) => item.declaredName,
  (item) => item.declaredVersion ?? '',
  (item) => item.reason
);
const compareWarnings = compareBy(
  (item) => item.ecosystem ?? '',
  (item) => item.projectId ?? '',
  (item) => item.manifest ?? '',
  (item) => item.dependencyType ?? '',
  (item) => item.declaredName ?? '',
  (item) => item.code,
  (item) => item.message
);

function isNpmPublicName(name) {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name);
}

function isPyPIName(name) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name);
}

function isLocalPathReference(value) {
  return typeof value === 'string'
    && /^(?:file:)?(?:\.{1,2}(?:[\\/]|$)|[\\/]|~[\\/])/i.test(value.trim());
}

function isRemoteReference(value) {
  return typeof value === 'string'
    && /^(?:git\+|git:|https?:|ssh:|github:|gitlab:|bitbucket:)/i.test(value.trim());
}

function isNodeUnresearchableReference(value) {
  return typeof value === 'string'
    && /^(?:workspace:|file:|link:|npm:|git\+|git:|https?:|ssh:|github:|gitlab:|bitbucket:|\.{1,2}[\\/]|[\\/]|~[\\/])/i.test(value.trim());
}

function sanitizeReference(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (isLocalPathReference(trimmed)) return '<local-path-reference>';

  const prefix = trimmed.startsWith('git+') ? 'git+' : '';
  const candidate = prefix ? trimmed.slice(prefix.length) : trimmed;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) return trimmed;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return `${prefix}${url.toString()}`;
  } catch {
    return trimmed;
  }
}

function sanitizedOccurrence(project, dependency) {
  return {
    projectId: project.id,
    projectPath: project.path,
    manifest: dependency.manifest,
    ecosystem: project.ecosystem,
    dependencyType: dependency.type,
    declaredName: sanitizeReference(dependency.name),
    normalizedName: sanitizeReference(dependency.normalizedName),
    declaredVersion: dependency.declaredVersion === null
      ? null
      : sanitizeReference(dependency.declaredVersion)
  };
}

function nodeEligibility(dependency) {
  const normalizedName = dependency.normalizedName.toLowerCase();
  if (!normalizedName) return { outcome: 'invalid', reason: 'empty-name' };
  if (!isNpmPublicName(normalizedName)) return { outcome: 'invalid', reason: 'invalid-npm-name' };
  if (isLocalPathReference(dependency.declaredVersion)) {
    return { outcome: 'invalid', reason: 'local-path-reference' };
  }
  if (isNodeUnresearchableReference(dependency.declaredVersion)) {
    return { outcome: 'invalid', reason: 'unsupported-reference' };
  }
  return { outcome: 'researchable', registry: 'npm', normalizedName };
}

function pythonEligibility(dependency) {
  const originalName = dependency.name ?? '';
  const normalizedName = normalizePythonPackageName(dependency.normalizedName ?? '');
  if (!normalizedName) return { outcome: 'invalid', reason: 'empty-name' };
  if (isLocalPathReference(originalName)) {
    return { outcome: 'invalid', reason: 'local-path-reference' };
  }
  if (isRemoteReference(originalName)) {
    return { outcome: 'invalid', reason: 'unnamed-direct-reference' };
  }
  if (!isPyPIName(normalizedName)) return { outcome: 'invalid', reason: 'invalid-pypi-name' };
  return { outcome: 'researchable', registry: 'pypi', normalizedName };
}

function eligibility(project, dependency) {
  if (project.ecosystem === 'node') return nodeEligibility(dependency);
  if (project.ecosystem === 'python') return pythonEligibility(dependency);
  return { outcome: 'unsupported' };
}

function invalidWarning(occurrence) {
  return {
    code: INVALID_WARNING,
    projectId: occurrence.projectId,
    manifest: occurrence.manifest,
    dependencyType: occurrence.dependencyType,
    declaredName: occurrence.declaredName,
    declaredVersion: occurrence.declaredVersion,
    message: `Dependency reference is not a supported public ${occurrence.ecosystem} package identity.`
  };
}

function unsupportedWarning(unsupported) {
  return {
    code: UNSUPPORTED_WARNING,
    ecosystem: unsupported.ecosystem,
    message: `Dependencies in ${unsupported.ecosystem} projects are not supported by MVP-02 research planning.`
  };
}

function unsupportedRecords(records) {
  return [...records.values()]
    .map((record) => ({
      ecosystem: record.ecosystem,
      projectIds: [...record.projectIds].sort(compareText),
      occurrenceCount: record.occurrenceCount
    }))
    .sort((left, right) => compareText(left.ecosystem, right.ecosystem));
}

function packageRecords(records) {
  return [...records.values()]
    .map((record) => ({
      id: `${record.registry}:${record.normalizedName}`,
      registry: record.registry,
      ecosystem: record.ecosystem,
      normalizedName: record.normalizedName,
      observedDeclaredNames: [...record.observedDeclaredNames].sort(compareText),
      occurrences: record.occurrences.sort(compareOccurrences)
    }))
    .sort((left, right) => compareText(left.id, right.id));
}

function hasCredentials(value) {
  return typeof value === 'string' && /[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(value);
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function checkOnlyKeys(errors, value, allowed, field) {
  if (!plainObject(value)) {
    errors.push(`${field} must be an object.`);
    return;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${field} contains unsupported field ${key}.`);
  }
}

function planError(errors) {
  throw new Error(`Research Plan invariant violation: ${errors.join(' ')}`);
}

function occurrenceKey(occurrence) {
  return [
    occurrence.projectId,
    occurrence.manifest,
    occurrence.dependencyType,
    occurrence.declaredName,
    occurrence.declaredVersion ?? ''
  ].join('\0');
}

/**
 * Validate a Research Plan's internal contract. It throws on implementation
 * bugs instead of converting invariant failures into repository warnings.
 */
export function validateResearchPlan(plan) {
  const errors = [];
  if (!plainObject(plan)) {
    throw new Error('Research Plan invariant violation: plan must be an object.');
  }
  checkOnlyKeys(errors, plan, new Set([
    'planVersion', 'input', 'summary', 'packages', 'invalidOccurrences', 'unsupported', 'warnings'
  ]), 'Research Plan');
  if (plan.planVersion !== PLAN_VERSION) errors.push(`planVersion must be ${PLAN_VERSION}.`);
  const lineage = plan.input?.projectManifest;
  checkOnlyKeys(errors, plan.input, new Set(['projectManifest']), 'Research Plan input');
  checkOnlyKeys(errors, lineage, new Set(['schemaVersion', 'artifact', 'artifactDigest', 'repository']), 'Project Manifest lineage');
  checkOnlyKeys(errors, lineage?.repository, new Set(['name', 'root']), 'Project Manifest lineage repository');
  checkOnlyKeys(errors, plan.summary, new Set([
    'inputProjectCount', 'inputOccurrenceCount', 'researchableOccurrenceCount', 'uniqueResearchPackageCount',
    'invalidOccurrenceCount', 'unsupportedOccurrenceCount'
  ]), 'Research Plan summary');
  if (!lineage || lineage.schemaVersion !== '2.0.0') errors.push('input Project Manifest schemaVersion must be 2.0.0.');
  if (!lineage || !isPortableRelativePath(lineage.artifact)) errors.push('input artifact must be portable.');
  if (!lineage || !/^sha256:[a-f0-9]{64}$/.test(lineage.artifactDigest)) errors.push('input artifact digest is invalid.');
  if (!lineage || lineage.repository?.root !== '.') errors.push('input repository root must be .');

  const packages = plan.packages ?? [];
  const invalidOccurrences = plan.invalidOccurrences ?? [];
  const unsupported = plan.unsupported ?? [];
  const warnings = plan.warnings ?? [];
  const summary = plan.summary ?? {};

  if (!isSorted(packages, (left, right) => compareText(left.id, right.id))) {
    errors.push('packages must be sorted by id.');
  }
  if (!isSorted(invalidOccurrences, compareInvalidOccurrences)) {
    errors.push('invalidOccurrences must be canonically sorted.');
  }
  if (!isSorted(unsupported, (left, right) => compareText(left.ecosystem, right.ecosystem))) {
    errors.push('unsupported must be sorted by ecosystem.');
  }
  if (!isSorted(warnings, compareWarnings)) errors.push('warnings must be canonically sorted.');

  const packageIds = new Set();
  let researchableOccurrenceCount = 0;
  for (const packageRecord of packages) {
    checkOnlyKeys(errors, packageRecord, new Set([
      'id', 'registry', 'ecosystem', 'normalizedName', 'observedDeclaredNames', 'occurrences'
    ]), 'Research Plan package');
    if (packageIds.has(packageRecord.id)) errors.push(`Duplicate research package ${packageRecord.id}.`);
    packageIds.add(packageRecord.id);
    const expectedId = `${packageRecord.registry}:${packageRecord.normalizedName}`;
    if (packageRecord.id !== expectedId) errors.push(`Package ${packageRecord.id} does not match its identity.`);
    if (!SUPPORTED_ECOSYSTEMS.has(packageRecord.ecosystem)) {
      errors.push(`Package ${packageRecord.id} has an unsupported ecosystem.`);
    }
    if (SUPPORTED_ECOSYSTEMS.get(packageRecord.ecosystem) !== packageRecord.registry) {
      errors.push(`Package ${packageRecord.id} registry does not match its ecosystem.`);
    }
    if (!isSorted(packageRecord.observedDeclaredNames, compareText)) {
      errors.push(`Package ${packageRecord.id} observedDeclaredNames must be sorted.`);
    }
    if (!isSorted(packageRecord.occurrences, compareOccurrences)) {
      errors.push(`Package ${packageRecord.id} occurrences must be canonically sorted.`);
    }
    for (const occurrence of packageRecord.occurrences) {
      checkOnlyKeys(errors, occurrence, new Set([
        'projectId', 'projectPath', 'manifest', 'ecosystem', 'dependencyType', 'declaredName', 'normalizedName', 'declaredVersion'
      ]), 'Research Plan occurrence');
      researchableOccurrenceCount += 1;
      if (occurrence.ecosystem !== packageRecord.ecosystem) {
        errors.push(`Package ${packageRecord.id} has an occurrence from a different ecosystem.`);
      }
      if (occurrence.normalizedName !== packageRecord.normalizedName) {
        errors.push(`Package ${packageRecord.id} has an occurrence with a different normalized name.`);
      }
      if (!isPortableRelativePath(occurrence.projectPath) || !isPortableRelativePath(occurrence.manifest)) {
        errors.push(`Package ${packageRecord.id} has a non-portable occurrence path.`);
      }
    }
  }

  for (const occurrence of invalidOccurrences) {
    checkOnlyKeys(errors, occurrence, new Set([
      'projectId', 'projectPath', 'manifest', 'ecosystem', 'dependencyType', 'declaredName', 'normalizedName', 'declaredVersion', 'reason'
    ]), 'Invalid occurrence');
    if (!INVALID_REASONS.has(occurrence.reason)) errors.push(`Invalid occurrence has an unknown reason ${occurrence.reason}.`);
    if (!SUPPORTED_ECOSYSTEMS.has(occurrence.ecosystem)) {
      errors.push('Invalid occurrence must come from a supported ecosystem.');
    }
    if (!isPortableRelativePath(occurrence.projectPath) || !isPortableRelativePath(occurrence.manifest)) {
      errors.push('Invalid occurrence has a non-portable path.');
    }
  }

  let unsupportedOccurrenceCount = 0;
  for (const record of unsupported) {
    checkOnlyKeys(errors, record, new Set(['ecosystem', 'projectIds', 'occurrenceCount']), 'Unsupported record');
    unsupportedOccurrenceCount += record.occurrenceCount;
    if (SUPPORTED_ECOSYSTEMS.has(record.ecosystem)) {
      errors.push(`Unsupported record ${record.ecosystem} is a supported ecosystem.`);
    }
    if (!isSorted(record.projectIds, compareText)) {
      errors.push(`Unsupported record ${record.ecosystem} projectIds must be sorted.`);
    }
  }

  const invalidKeys = new Set(invalidOccurrences.map(occurrenceKey));
  const unsupportedEcosystems = new Set(unsupported.map((record) => record.ecosystem));
  for (const warning of warnings) {
    checkOnlyKeys(errors, warning, warning.code === INVALID_WARNING
      ? new Set(['code', 'projectId', 'manifest', 'dependencyType', 'declaredName', 'declaredVersion', 'message'])
      : new Set(['code', 'ecosystem', 'message']), 'Research Plan warning');
    if (warning.code === INVALID_WARNING) {
      const key = occurrenceKey(warning);
      if (!invalidKeys.has(key)) errors.push('Invalid package warning does not reference an invalid occurrence.');
    } else if (warning.code === UNSUPPORTED_WARNING) {
      if (!unsupportedEcosystems.has(warning.ecosystem)) {
        errors.push('Unsupported ecosystem warning does not reference an unsupported record.');
      }
    } else {
      errors.push(`Unknown planning warning code ${warning.code}.`);
    }
  }

  const expectedWarningCount = invalidOccurrences.length + unsupported.length;
  if (warnings.length !== expectedWarningCount) errors.push('warnings do not match invalid and unsupported planning outcomes.');
  if (summary.uniqueResearchPackageCount !== packages.length) errors.push('summary uniqueResearchPackageCount is inconsistent.');
  if (summary.researchableOccurrenceCount !== researchableOccurrenceCount) {
    errors.push('summary researchableOccurrenceCount is inconsistent.');
  }
  if (summary.invalidOccurrenceCount !== invalidOccurrences.length) {
    errors.push('summary invalidOccurrenceCount is inconsistent.');
  }
  if (summary.unsupportedOccurrenceCount !== unsupportedOccurrenceCount) {
    errors.push('summary unsupportedOccurrenceCount is inconsistent.');
  }
  const plannedOccurrences = researchableOccurrenceCount + invalidOccurrences.length + unsupportedOccurrenceCount;
  if (summary.inputOccurrenceCount !== plannedOccurrences) {
    errors.push('summary inputOccurrenceCount is inconsistent.');
  }

  for (const value of JSON.stringify(plan).match(/"(?:[^"\\]|\\.)*"/g) ?? []) {
    const decoded = JSON.parse(value);
    if (hasCredentials(decoded)) errors.push('Research Plan must not contain URL credentials.');
  }

  if (errors.length > 0) planError([...new Set(errors)].sort(compareText));
  return plan;
}

/**
 * Convert a validated Project Manifest input into a deterministic, internal
 * Research Plan. Call loadProjectManifestInput before this function.
 */
export function createResearchPlan(loadedInput) {
  if (!loadedInput?.manifest || !loadedInput?.input?.projectManifest) {
    throw new Error('Research Plan requires a loaded Project Manifest input.');
  }

  const packageMap = new Map();
  const invalidOccurrences = [];
  const unsupportedMap = new Map();
  const inputProjectCount = loadedInput.manifest.projects.length;

  for (const project of loadedInput.manifest.projects) {
    for (const dependency of project.dependencies) {
      const occurrence = sanitizedOccurrence(project, dependency);
      const result = eligibility(project, dependency);

      if (result.outcome === 'unsupported') {
        const record = unsupportedMap.get(project.ecosystem) ?? {
          ecosystem: project.ecosystem,
          projectIds: new Set(),
          occurrenceCount: 0
        };
        record.projectIds.add(project.id);
        record.occurrenceCount += 1;
        unsupportedMap.set(project.ecosystem, record);
        continue;
      }

      if (result.outcome === 'invalid') {
        invalidOccurrences.push({ ...occurrence, reason: result.reason });
        continue;
      }

      const key = `${result.registry}:${result.normalizedName}`;
      const record = packageMap.get(key) ?? {
        registry: result.registry,
        ecosystem: project.ecosystem,
        normalizedName: result.normalizedName,
        observedDeclaredNames: new Set(),
        occurrences: []
      };
      record.observedDeclaredNames.add(occurrence.declaredName);
      record.occurrences.push({ ...occurrence, normalizedName: result.normalizedName });
      packageMap.set(key, record);
    }
  }

  const packages = packageRecords(packageMap);
  const sortedInvalidOccurrences = invalidOccurrences.sort(compareInvalidOccurrences);
  const unsupported = unsupportedRecords(unsupportedMap);
  const warnings = [
    ...sortedInvalidOccurrences.map(invalidWarning),
    ...unsupported.map(unsupportedWarning)
  ].sort(compareWarnings);
  const researchableOccurrenceCount = packages.reduce(
    (count, packageRecord) => count + packageRecord.occurrences.length,
    0
  );
  const unsupportedOccurrenceCount = unsupported.reduce((count, record) => count + record.occurrenceCount, 0);

  const plan = {
    planVersion: PLAN_VERSION,
    input: structuredClone(loadedInput.input),
    summary: {
      inputProjectCount,
      inputOccurrenceCount: researchableOccurrenceCount + sortedInvalidOccurrences.length + unsupportedOccurrenceCount,
      researchableOccurrenceCount,
      uniqueResearchPackageCount: packages.length,
      invalidOccurrenceCount: sortedInvalidOccurrences.length,
      unsupportedOccurrenceCount
    },
    packages,
    invalidOccurrences: sortedInvalidOccurrences,
    unsupported,
    warnings
  };

  return validateResearchPlan(plan);
}
