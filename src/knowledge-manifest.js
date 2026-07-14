function compareText(left = '', right = '') {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareBy(...selectors) {
  return (left, right) => {
    for (const selector of selectors) {
      const result = compareText(selector(left), selector(right));
      if (result !== 0) return result;
    }
    return 0;
  };
}

const comparePackages = compareBy((item) => item.id);
const compareOccurrences = compareBy(
  (item) => item.projectId,
  (item) => item.manifest,
  (item) => item.dependencyType,
  (item) => item.declaredName,
  (item) => item.declaredVersion ?? ''
);
const compareReleases = compareBy(
  (item) => item.version ?? item.tag,
  (item) => item.sourceIds.join('\0')
);
const compareSources = compareBy((item) => item.id);
const compareWarnings = compareBy(
  (item) => item.packageId ?? '',
  (item) => item.code,
  (item) => item.sourceId ?? '',
  (item) => item.message
);

function isSorted(items, comparator) {
  return items.every((item, index) => index === 0 || comparator(items[index - 1], item) <= 0);
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort(compareText);
}

function addMismatch(errors, field, actual, expected) {
  if (actual !== expected) errors.push(`${field} is ${actual}; expected ${expected}.`);
}

function checkSortedStrings(errors, values, field) {
  if (!isSorted(values, compareText)) errors.push(`${field} must be sorted lexically.`);
}

function checkSourceReferences(errors, values, knownSourceIds, field) {
  for (const sourceId of values) {
    if (!knownSourceIds.has(sourceId)) errors.push(`${field} references unknown source ${sourceId}.`);
  }
}

/**
 * Validate relational and canonical-ordering rules that JSON Schema cannot
 * express. The manifest must pass its JSON Schema before this function runs.
 * An empty returned array means that all invariants hold.
 */
export function validateKnowledgeManifestInvariants(manifest) {
  const errors = [];
  const packages = manifest.packages ?? [];
  const sources = manifest.sources ?? [];
  const warnings = manifest.warnings ?? [];
  const packageIds = packages.map((item) => item.id);
  const sourceIds = sources.map((item) => item.id);
  const knownPackageIds = new Set(packageIds);
  const knownSourceIds = new Set(sourceIds);

  if (!isSorted(packages, comparePackages)) errors.push('packages must be sorted by id.');
  if (!isSorted(sources, compareSources)) errors.push('sources must be sorted by id.');
  if (!isSorted(warnings, compareWarnings)) {
    errors.push('warnings must be sorted by packageId, code, sourceId, and message.');
  }

  for (const duplicate of duplicateValues(packageIds)) errors.push(`Duplicate package id ${duplicate}.`);
  for (const duplicate of duplicateValues(sourceIds)) errors.push(`Duplicate source id ${duplicate}.`);

  const statusCounts = {
    resolved: 0,
    partial: 0,
    notFound: 0,
    invalid: 0,
    unavailable: 0
  };
  let occurrenceCount = 0;

  for (const packageRecord of packages) {
    statusCounts[packageRecord.status] += 1;
    occurrenceCount += packageRecord.occurrences.length;

    const expectedId = `${packageRecord.identity.registry}:${packageRecord.identity.normalizedName}`;
    if (packageRecord.id !== expectedId) {
      errors.push(`Package ${packageRecord.id} does not match normalized identity ${expectedId}.`);
    }
    const expectedSelection = packageRecord.identity.registry === 'npm'
      ? 'dist-tag:latest'
      : 'project-info-version';
    if (packageRecord.latest && packageRecord.latest.selection !== expectedSelection) {
      errors.push(`Package ${packageRecord.id} latest selection must be ${expectedSelection}.`);
    }

    if (!isSorted(packageRecord.occurrences, compareOccurrences)) {
      errors.push(`Package ${packageRecord.id} occurrences are not canonically sorted.`);
    }
    if (!isSorted(packageRecord.releaseIndex, compareReleases)) {
      errors.push(`Package ${packageRecord.id} releases are not canonically sorted.`);
    }
    checkSortedStrings(
      errors,
      packageRecord.identity.observedDeclaredNames,
      `Package ${packageRecord.id} observedDeclaredNames`
    );
    checkSortedStrings(errors, packageRecord.sourceIds, `Package ${packageRecord.id} sourceIds`);
    checkSortedStrings(errors, packageRecord.warningCodes, `Package ${packageRecord.id} warningCodes`);
    checkSourceReferences(errors, packageRecord.sourceIds, knownSourceIds, `Package ${packageRecord.id}`);

    if (packageRecord.latest) {
      checkSourceReferences(
        errors,
        [packageRecord.latest.sourceId],
        knownSourceIds,
        `Package ${packageRecord.id} latest`
      );
      if (!packageRecord.sourceIds.includes(packageRecord.latest.sourceId)) {
        errors.push(`Package ${packageRecord.id} latest source is absent from package sourceIds.`);
      }
    }

    for (const release of packageRecord.releaseIndex) {
      checkSortedStrings(errors, release.sourceIds, `Package ${packageRecord.id} release sourceIds`);
      checkSourceReferences(
        errors,
        release.sourceIds,
        knownSourceIds,
        `Package ${packageRecord.id} release`
      );
      for (const sourceId of release.sourceIds) {
        if (!packageRecord.sourceIds.includes(sourceId)) {
          errors.push(`Package ${packageRecord.id} release source ${sourceId} is absent from package sourceIds.`);
        }
      }
    }

    for (const code of packageRecord.warningCodes) {
      if (!warnings.some((warning) => warning.packageId === packageRecord.id && warning.code === code)) {
        errors.push(`Package ${packageRecord.id} warning code ${code} has no top-level warning.`);
      }
    }
  }

  for (const source of sources) {
    checkSortedStrings(errors, source.supports, `Source ${source.id} supports`);
    checkSortedStrings(
      errors,
      source.trustEvidenceSourceIds,
      `Source ${source.id} trustEvidenceSourceIds`
    );
    checkSourceReferences(
      errors,
      source.trustEvidenceSourceIds,
      knownSourceIds,
      `Source ${source.id} trust evidence`
    );
    if (source.discoveredFrom !== null) {
      checkSourceReferences(errors, [source.discoveredFrom], knownSourceIds, `Source ${source.id}`);
    }
    if (source.conflictsWith) {
      checkSortedStrings(errors, source.conflictsWith, `Source ${source.id} conflictsWith`);
      checkSourceReferences(errors, source.conflictsWith, knownSourceIds, `Source ${source.id} conflict`);
      if (source.conflictsWith.includes(source.id)) {
        errors.push(`Source ${source.id} cannot conflict with itself.`);
      }
    }
  }

  for (const warning of warnings) {
    if (warning.packageId && !knownPackageIds.has(warning.packageId)) {
      errors.push(`Warning ${warning.code} references unknown package ${warning.packageId}.`);
    }
    if (warning.sourceId && !knownSourceIds.has(warning.sourceId)) {
      errors.push(`Warning ${warning.code} references unknown source ${warning.sourceId}.`);
    }
    if (warning.packageId) {
      const packageRecord = packages.find((item) => item.id === warning.packageId);
      if (packageRecord && !packageRecord.warningCodes.includes(warning.code)) {
        errors.push(`Warning ${warning.code} is absent from package ${warning.packageId} warningCodes.`);
      }
    }
  }

  const staleSourceCount = sources.filter((source) => source.status === 'stale').length;
  const partialFailureCount = packages.length - statusCounts.resolved;
  addMismatch(errors, 'summary.inputOccurrenceCount', manifest.summary.inputOccurrenceCount, occurrenceCount);
  addMismatch(errors, 'summary.packageCount', manifest.summary.packageCount, packages.length);
  addMismatch(errors, 'summary.resolvedPackageCount', manifest.summary.resolvedPackageCount, statusCounts.resolved);
  addMismatch(errors, 'summary.partialPackageCount', manifest.summary.partialPackageCount, statusCounts.partial);
  addMismatch(errors, 'summary.notFoundPackageCount', manifest.summary.notFoundPackageCount, statusCounts.notFound);
  addMismatch(errors, 'summary.invalidPackageCount', manifest.summary.invalidPackageCount, statusCounts.invalid);
  addMismatch(
    errors,
    'summary.unavailablePackageCount',
    manifest.summary.unavailablePackageCount,
    statusCounts.unavailable
  );
  addMismatch(errors, 'summary.sourceCount', manifest.summary.sourceCount, sources.length);
  addMismatch(errors, 'summary.warningCount', manifest.summary.warningCount, warnings.length);
  addMismatch(errors, 'summary.staleSourceCount', manifest.summary.staleSourceCount, staleSourceCount);

  addMismatch(errors, 'research.inputOccurrenceCount', manifest.research.inputOccurrenceCount, occurrenceCount);
  addMismatch(errors, 'research.inputPackageCount', manifest.research.inputPackageCount, packages.length);
  addMismatch(
    errors,
    'research.researchedPackageCount',
    manifest.research.researchedPackageCount,
    packages.length - statusCounts.invalid
  );
  addMismatch(errors, 'research.sourceCount', manifest.research.sourceCount, sources.length);
  addMismatch(errors, 'research.partialFailureCount', manifest.research.partialFailureCount, partialFailureCount);

  const startedAt = Date.parse(manifest.research.startedAt);
  const completedAt = Date.parse(manifest.research.completedAt);
  addMismatch(errors, 'research.durationMs', manifest.research.durationMs, completedAt - startedAt);

  addMismatch(errors, 'summary.cacheHitCount', manifest.summary.cacheHitCount, manifest.cache.hitCount);
  addMismatch(errors, 'summary.cacheMissCount', manifest.summary.cacheMissCount, manifest.cache.missCount);
  addMismatch(errors, 'research.cacheHitCount', manifest.research.cacheHitCount, manifest.cache.hitCount);
  addMismatch(errors, 'research.cacheMissCount', manifest.research.cacheMissCount, manifest.cache.missCount);
  addMismatch(
    errors,
    'research.cacheRevalidationCount',
    manifest.research.cacheRevalidationCount,
    manifest.cache.revalidationCount
  );
  addMismatch(errors, 'cache.staleEntryCount', manifest.cache.staleEntryCount, staleSourceCount);

  if (manifest.cache.mode !== manifest.policy.mode) {
    errors.push(`cache.mode is ${manifest.cache.mode}; expected policy mode ${manifest.policy.mode}.`);
  }
  if (manifest.cache.policyVersion !== manifest.policy.ttlPolicyVersion) {
    errors.push(
      `cache.policyVersion is ${manifest.cache.policyVersion}; expected TTL policy ${manifest.policy.ttlPolicyVersion}.`
    );
  }

  return errors.sort(compareText);
}
