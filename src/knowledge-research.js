import { compareText, isPortableRelativePath, isSorted } from './portable.js';
import { validateResearchPlan } from './research-plan.js';
import { resolveSourceProvenance, validateSourceGraph } from './source-provenance.js';

const RESULT_VERSION = '1';
const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 32;
const PACKAGE_STATUSES = new Set(['resolved', 'partial', 'notFound', 'invalid', 'unavailable']);
const CACHE_OUTCOMES = new Set(['hit', 'miss', 'revalidated', 'corrupted-replaced', 'corrupted', 'expired']);

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
  (item) => item.packageId ?? '',
  (item) => item.code,
  (item) => item.sourceId ?? '',
  (item) => item.message
);
const comparePackageOutcomes = compareBy((item) => item.packageId);

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function clone(value) {
  return structuredClone(value);
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function dateFromClock(clock) {
  const value = clock();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Knowledge Research clock returned an invalid time.');
  return date;
}

function validateConcurrency(value) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_CONCURRENCY) {
    throw new Error(`Knowledge Research concurrency must be an integer from 1 to ${MAX_CONCURRENCY}.`);
  }
  return value;
}

async function mapBounded(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runWorker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, runWorker));
  return results;
}

function fallbackUrls(researchPackage) {
  if (researchPackage.registry === 'npm') {
    return {
      registryBaseUrl: 'https://registry.npmjs.org',
      packageUrl: `https://www.npmjs.com/package/${researchPackage.normalizedName}`,
      apiUrl: `https://registry.npmjs.org/${encodeURIComponent(researchPackage.normalizedName)}`
    };
  }
  return {
    registryBaseUrl: 'https://pypi.org',
    packageUrl: `https://pypi.org/project/${encodeURIComponent(researchPackage.normalizedName)}/`,
    apiUrl: `https://pypi.org/pypi/${encodeURIComponent(researchPackage.normalizedName)}/json`
  };
}

function unavailableResult(researchPackage, message, retryable) {
  const sourceId = `${researchPackage.id}:registry`;
  const urls = fallbackUrls(researchPackage);
  const warning = {
    code: 'REGISTRY_UNAVAILABLE',
    packageId: researchPackage.id,
    sourceId,
    message,
    retryable
  };
  return {
    package: {
      id: researchPackage.id,
      ecosystem: researchPackage.ecosystem,
      status: 'unavailable',
      identity: {
        observedDeclaredNames: clone(researchPackage.observedDeclaredNames),
        normalizedName: researchPackage.normalizedName,
        registry: researchPackage.registry,
        ...urls
      },
      occurrences: clone(researchPackage.occurrences),
      metadata: {},
      latest: null,
      releaseIndex: [],
      sourceIds: [sourceId],
      warningCodes: ['REGISTRY_UNAVAILABLE']
    },
    source: {
      id: sourceId,
      kind: 'registry',
      authority: 'registryAuthoritative',
      trust: 'publisher',
      url: urls.packageUrl,
      apiUrl: urls.apiUrl,
      status: 'unavailable',
      supports: ['identity'],
      discoveredFrom: null,
      trustEvidenceSourceIds: [],
      snapshot: null
    },
    sourceCandidates: [],
    warnings: [warning],
    cache: null
  };
}

function adapterResultFor(researchPackage, result) {
  const packageRecord = result?.package;
  const source = result?.source;
  if (!packageRecord || packageRecord.id !== researchPackage.id
    || packageRecord.ecosystem !== researchPackage.ecosystem
    || !PACKAGE_STATUSES.has(packageRecord.status)
    || !source || source.id !== `${researchPackage.id}:registry` || source.kind !== 'registry') {
    throw new Error('adapter returned an incompatible normalized registry result.');
  }
  if (!plainObject(packageRecord.identity) || !plainObject(packageRecord.metadata)
    || !Array.isArray(packageRecord.releaseIndex) || !Array.isArray(packageRecord.sourceIds)
    || !Array.isArray(packageRecord.warningCodes) || !Array.isArray(result.sourceCandidates ?? [])
    || !Array.isArray(source.supports) || typeof source.url !== 'string'
    || typeof source.status !== 'string' || source.discoveredFrom !== null
    || !Array.isArray(source.trustEvidenceSourceIds)) {
    throw new Error('adapter returned an incomplete normalized registry result.');
  }
  const warnings = Array.isArray(result.warnings) ? result.warnings : [];
  if (!warnings.every((warning) => warning && typeof warning.code === 'string'
    && typeof warning.message === 'string' && typeof warning.retryable === 'boolean')) {
    throw new Error('adapter returned an invalid warning record.');
  }
  const outcome = result.cache?.outcome;
  if (outcome !== undefined && !CACHE_OUTCOMES.has(outcome)) {
    throw new Error('adapter returned an unknown cache outcome.');
  }
  return {
    package: {
      id: packageRecord.id,
      ecosystem: packageRecord.ecosystem,
      status: packageRecord.status,
      identity: clone(packageRecord.identity),
      occurrences: clone(researchPackage.occurrences),
      metadata: clone(packageRecord.metadata),
      latest: clone(packageRecord.latest),
      releaseIndex: clone(packageRecord.releaseIndex),
      sourceIds: clone(packageRecord.sourceIds),
      warningCodes: sortedUnique(packageRecord.warningCodes ?? [])
    },
    source: clone(source),
    sourceCandidates: clone(result.sourceCandidates ?? []),
    warnings: clone(warnings),
    cache: outcome ?? null
  };
}

function invalidWarnings(invalidOccurrences) {
  return invalidOccurrences.map((occurrence) => ({
    code: 'INVALID_PACKAGE_REFERENCE',
    message: `Dependency reference is not a supported public ${occurrence.ecosystem} package identity.`,
    retryable: false
  }));
}

function deduplicateWarnings(warnings) {
  const byKey = new Map();
  for (const warning of warnings) {
    const normalized = {
      code: warning.code,
      ...(warning.packageId ? { packageId: warning.packageId } : {}),
      ...(warning.sourceId ? { sourceId: warning.sourceId } : {}),
      message: warning.message,
      retryable: warning.retryable
    };
    const key = JSON.stringify(normalized);
    if (!byKey.has(key)) byKey.set(key, normalized);
  }
  return [...byKey.values()].sort(compareWarnings);
}

function cacheSummary(outcomes) {
  const summary = {
    cacheHitCount: 0,
    cacheMissCount: 0,
    cacheRevalidationCount: 0,
    cacheCorruptionReplacementCount: 0,
    cacheCorruptedCount: 0
  };
  for (const outcome of outcomes) {
    if (outcome.cacheOutcome === 'hit') summary.cacheHitCount += 1;
    if (outcome.cacheOutcome === 'miss') summary.cacheMissCount += 1;
    if (outcome.cacheOutcome === 'revalidated') summary.cacheRevalidationCount += 1;
    if (outcome.cacheOutcome === 'corrupted-replaced') summary.cacheCorruptionReplacementCount += 1;
    if (outcome.cacheOutcome === 'corrupted') summary.cacheCorruptedCount += 1;
  }
  return summary;
}

function statusSummary(packages) {
  const counts = {
    resolvedPackageCount: 0,
    partialPackageCount: 0,
    notFoundPackageCount: 0,
    invalidPackageCount: 0,
    unavailablePackageCount: 0
  };
  for (const packageRecord of packages) {
    if (packageRecord.status === 'resolved') counts.resolvedPackageCount += 1;
    if (packageRecord.status === 'partial') counts.partialPackageCount += 1;
    if (packageRecord.status === 'notFound') counts.notFoundPackageCount += 1;
    if (packageRecord.status === 'invalid') counts.invalidPackageCount += 1;
    if (packageRecord.status === 'unavailable') counts.unavailablePackageCount += 1;
  }
  return counts;
}

function adapterInvocationCounts(packageOutcomes, plannedPackages) {
  const counts = { npm: 0, pypi: 0 };
  for (const outcome of packageOutcomes) {
    if (!outcome.adapterInvoked) continue;
    const registry = plannedPackages.get(outcome.packageId)?.registry;
    if (registry === 'npm' || registry === 'pypi') counts[registry] += 1;
  }
  return counts;
}

function sourceIdsByPackage(graph) {
  return new Map(graph.packages.map((record) => [record.packageId, record.sourceIds]));
}

function sanitizeObjectErrors(value, path = '') {
  const errors = [];
  const forbiddenKeys = /(?:cachekey|rootdirectory|storepath|etag|lastmodified|headers|stack|responsebody|rawbody)/i;
  if (typeof value === 'string') {
    if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) errors.push(`${path} contains an absolute local path.`);
    if (/[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(value)) errors.push(`${path} contains URL credentials.`);
    if (/\?(?:[^\s]*)(?:token|secret|password|api[_-]?key|signature|auth)=/i.test(value)) {
      errors.push(`${path} contains a query token.`);
    }
    return errors;
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => sanitizeObjectErrors(item, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return errors;
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = path ? `${path}.${key}` : key;
    if (forbiddenKeys.test(key)) errors.push(`${nestedPath} exposes forbidden internal data.`);
    errors.push(...sanitizeObjectErrors(nested, nestedPath));
  }
  return errors;
}

function throwInvariant(errors) {
  if (errors.length > 0) {
    throw new Error(`Knowledge Research invariant violation: ${[...new Set(errors)].sort(compareText).join(' ')}`);
  }
}

/**
 * Validate the private, canonical research result before a future task turns
 * it into a public Knowledge Manifest.
 */
export function validateKnowledgeResearchResult(result, researchPlan) {
  validateResearchPlan(researchPlan);
  const errors = [];
  if (result?.resultVersion !== RESULT_VERSION) errors.push(`resultVersion must be ${RESULT_VERSION}.`);
  if (JSON.stringify(result?.input) !== JSON.stringify({
    projectManifest: researchPlan.input.projectManifest,
    researchPlanVersion: researchPlan.planVersion
  })) errors.push('input lineage must match the Research Plan.');

  const packages = result?.packages ?? [];
  const sources = result?.sources ?? [];
  const warnings = result?.warnings ?? [];
  const evidence = result?.evidence ?? [];
  const invalidOccurrences = result?.invalidOccurrences ?? [];
  const unsupported = result?.unsupported ?? [];
  const packageOutcomes = result?.execution?.packageOutcomes ?? [];
  const summary = result?.summary ?? {};
  const knownSourceIds = new Set(sources.map((source) => source.id));
  const plannedPackages = new Map(researchPlan.packages.map((item) => [item.id, item]));

  if (!isSorted(packages, (left, right) => compareText(left.id, right.id))) errors.push('packages must be sorted by id.');
  if (!isSorted(sources, (left, right) => compareText(left.id, right.id))) errors.push('sources must be sorted by id.');
  if (!isSorted(warnings, compareWarnings)) errors.push('warnings must be sorted canonically.');
  if (!isSorted(invalidOccurrences, compareInvalidOccurrences)) errors.push('invalidOccurrences must be canonically sorted.');
  if (!isSorted(unsupported, (left, right) => compareText(left.ecosystem, right.ecosystem))) errors.push('unsupported must be sorted by ecosystem.');
  if (!isSorted(packageOutcomes, comparePackageOutcomes)) errors.push('execution packageOutcomes must be sorted by packageId.');
  if (!Array.isArray(evidence)
    || !isSorted(evidence, (left, right) => compareText(left.id, right.id))) {
    errors.push('evidence must be an array sorted by id.');
  }
  for (const item of evidence) {
    if (!knownSourceIds.has(item.sourceId)) errors.push(`evidence ${item.id} references an unknown source.`);
    if (!plannedPackages.has(item.packageId)) errors.push(`evidence ${item.id} references an unknown package.`);
  }

  const packageIds = new Set();
  for (const packageRecord of packages) {
    if (!packageRecord || packageIds.has(packageRecord.id) || !plannedPackages.has(packageRecord.id)) {
      errors.push('packages must correspond one-to-one with planned packages.');
      continue;
    }
    packageIds.add(packageRecord.id);
    const planned = plannedPackages.get(packageRecord.id);
    if (packageRecord.ecosystem !== planned.ecosystem || packageRecord.identity?.registry !== planned.registry
      || packageRecord.identity?.normalizedName !== planned.normalizedName
      || JSON.stringify(packageRecord.occurrences) !== JSON.stringify(planned.occurrences)) {
      errors.push(`package ${packageRecord.id} does not preserve its Research Plan identity and occurrences.`);
    }
    if (!PACKAGE_STATUSES.has(packageRecord.status)) errors.push(`package ${packageRecord.id} has an invalid status.`);
    if (!isSorted(packageRecord.occurrences ?? [], compareOccurrences)) errors.push(`package ${packageRecord.id} occurrences must be sorted.`);
    if (!isSorted(packageRecord.sourceIds ?? [], compareText)
      || new Set(packageRecord.sourceIds ?? []).size !== (packageRecord.sourceIds ?? []).length) {
      errors.push(`package ${packageRecord.id} sourceIds must be sorted and unique.`);
    }
    if (!isSorted(packageRecord.warningCodes ?? [], compareText)) errors.push(`package ${packageRecord.id} warningCodes must be sorted.`);
    for (const sourceId of packageRecord.sourceIds ?? []) {
      if (!knownSourceIds.has(sourceId)) errors.push(`package ${packageRecord.id} references unknown source ${sourceId}.`);
    }
    if (packageRecord.latest?.sourceId && !knownSourceIds.has(packageRecord.latest.sourceId)) {
      errors.push(`package ${packageRecord.id} latest references an unknown source.`);
    }
    for (const release of packageRecord.releaseIndex ?? []) {
      if (!isSorted(release.sourceIds ?? [], compareText)) errors.push(`package ${packageRecord.id} release sourceIds must be sorted.`);
      for (const sourceId of release.sourceIds ?? []) {
        if (!knownSourceIds.has(sourceId)) errors.push(`package ${packageRecord.id} release references an unknown source.`);
      }
    }
    for (const code of packageRecord.warningCodes ?? []) {
      if (!warnings.some((warning) => warning.packageId === packageRecord.id && warning.code === code)) {
        errors.push(`package ${packageRecord.id} warning code has no warning.`);
      }
    }
  }
  if (packageIds.size !== plannedPackages.size) errors.push('every Research Plan package must have exactly one result.');
  if (new Set(sources.map((source) => source.id)).size !== sources.length) errors.push('source IDs must be unique.');

  for (const warning of warnings) {
    if (!warning || typeof warning.code !== 'string' || typeof warning.message !== 'string'
      || typeof warning.retryable !== 'boolean') errors.push('warnings must have a code, message, and retryable value.');
    if (warning.packageId && !packageIds.has(warning.packageId)) errors.push(`warning ${warning.code} references an unknown package.`);
    if (warning.sourceId && !knownSourceIds.has(warning.sourceId)) errors.push(`warning ${warning.code} references an unknown source.`);
  }

  if (JSON.stringify(invalidOccurrences) !== JSON.stringify(researchPlan.invalidOccurrences)) {
    errors.push('invalidOccurrences must match the Research Plan.');
  }
  if (JSON.stringify(unsupported) !== JSON.stringify(researchPlan.unsupported)) {
    errors.push('unsupported records must match the Research Plan.');
  }

  try {
    validateSourceGraph({
      packages: packages.map((item) => ({ packageId: item.id, sourceIds: item.sourceIds })),
      sources,
      warnings: warnings.filter((warning) => warning.code === 'SOURCE_CONFLICT')
    });
  } catch (error) {
    errors.push(error.message);
  }

  const cache = cacheSummary(packageOutcomes);
  const invocationCounts = adapterInvocationCounts(packageOutcomes, plannedPackages);
  const statuses = statusSummary(packages);
  const partialFailureCount = packages.filter((item) => item.status !== 'resolved').length;
  const outcomeIds = new Set();
  for (const outcome of packageOutcomes) {
    if (!plannedPackages.has(outcome.packageId) || outcomeIds.has(outcome.packageId)) {
      errors.push('execution packageOutcomes must correspond one-to-one with planned packages.');
      continue;
    }
    outcomeIds.add(outcome.packageId);
    if (typeof outcome.adapterInvoked !== 'boolean'
      || (outcome.cacheOutcome !== null && !CACHE_OUTCOMES.has(outcome.cacheOutcome))) {
      errors.push(`execution outcome for ${outcome.packageId} is invalid.`);
    }
  }
  if (outcomeIds.size !== plannedPackages.size) errors.push('execution packageOutcomes are incomplete.');
  const expectedSummary = {
    inputOccurrenceCount: researchPlan.summary.inputOccurrenceCount,
    packageCount: packages.length,
    ...statuses,
    invalidOccurrenceCount: invalidOccurrences.length,
    unsupportedOccurrenceCount: researchPlan.summary.unsupportedOccurrenceCount,
    sourceCount: sources.length,
    warningCount: warnings.length,
    ...cache,
    retryCount: 0,
    partialFailureCount
  };
  for (const [key, value] of Object.entries(expectedSummary)) {
    if (summary[key] !== value) errors.push(`summary.${key} is inconsistent.`);
  }

  const execution = result?.execution ?? {};
  const startedAt = Date.parse(execution.startedAt);
  const completedAt = Date.parse(execution.completedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || execution.durationMs !== completedAt - startedAt) {
    errors.push('execution timestamps and durationMs are inconsistent.');
  }
  try {
    if (execution.concurrency !== validateConcurrency(execution.concurrency)) errors.push('execution concurrency is invalid.');
  } catch {
    errors.push('execution concurrency is invalid.');
  }
  if (execution.inputPackageCount !== packages.length
    || execution.adapterInvocationCount !== packageOutcomes.filter((item) => item.adapterInvoked).length
    || JSON.stringify(execution.adapterInvocationCounts) !== JSON.stringify(invocationCounts)
    || execution.sourceCount !== sources.length || execution.warningCount !== warnings.length
    || execution.partialFailureCount !== partialFailureCount) {
    errors.push('execution counts are inconsistent.');
  }
  for (const [key, value] of Object.entries(cache)) {
    if (execution[key] !== value) errors.push(`execution.${key} is inconsistent.`);
  }

  errors.push(...sanitizeObjectErrors(result));
  throwInvariant(errors);
  return result;
}

/**
 * Create an explicit, private Knowledge Research orchestrator. It consumes a
 * prevalidated Research Plan; it does not read a repository or write an
 * artifact.
 */
export function createKnowledgeResearchOrchestrator({
  adapters = {},
  evidenceSourceAdapter = null,
  sourceProvenanceResolver = resolveSourceProvenance,
  clock = () => new Date(),
  concurrency = DEFAULT_CONCURRENCY
} = {}) {
  const configuredConcurrency = validateConcurrency(concurrency);
  if (typeof sourceProvenanceResolver !== 'function') {
    throw new Error('Knowledge Research requires a source provenance resolver function.');
  }
  if (evidenceSourceAdapter !== null && typeof evidenceSourceAdapter?.enrich !== 'function') {
    throw new Error('Knowledge Research evidence source adapter must provide enrich(input).');
  }
  return {
    async run(researchPlan, options = {}) {
      validateResearchPlan(researchPlan);
      const effectiveConcurrency = validateConcurrency(options.concurrency ?? configuredConcurrency);
      const started = dateFromClock(clock);
      const registryResults = await mapBounded(researchPlan.packages, effectiveConcurrency, async (researchPackage) => {
        const adapter = adapters[researchPackage.registry];
        if (!adapter || typeof adapter.researchPackage !== 'function') {
          return {
            result: unavailableResult(
              researchPackage,
              `No ${researchPackage.registry} registry adapter is configured for package research.`,
              false
            ),
            adapterInvoked: false
          };
        }
        try {
          return {
            result: adapterResultFor(researchPackage, await adapter.researchPackage(clone(researchPackage))),
            adapterInvoked: true
          };
        } catch {
          return {
            result: unavailableResult(
              researchPackage,
              `${researchPackage.registry} Registry package research failed.`,
              true
            ),
            adapterInvoked: true
          };
        }
      });

      const normalizedResults = registryResults.map((item) => item.result);
      const provenance = sourceProvenanceResolver(normalizedResults);
      const initialPackageSources = sourceIdsByPackage(provenance);
      const provisionalPackages = normalizedResults.map((item) => ({
        ...clone(item.package),
        sourceIds: clone(initialPackageSources.get(item.package.id) ?? [])
      }));
      const enrichment = evidenceSourceAdapter
        ? await evidenceSourceAdapter.enrich({ packages: provisionalPackages, sources: clone(provenance.sources) })
        : { packageSources: [], sources: [], evidence: [], warnings: [] };
      const sourcesById = new Map(provenance.sources.map((source) => [source.id, source]));
      for (const source of enrichment.sources ?? []) sourcesById.set(source.id, source);
      const sources = [...sourcesById.values()].sort((left, right) => compareText(left.id, right.id));
      const packageSources = new Map(initialPackageSources);
      for (const record of enrichment.packageSources ?? []) {
        packageSources.set(record.packageId, sortedUnique([
          ...(packageSources.get(record.packageId) ?? []),
          ...record.sourceIds
        ]));
      }
      const provenanceWarnings = provenance.warnings;
      const adapterWarnings = normalizedResults.flatMap((item) => item.warnings);
      const warnings = deduplicateWarnings([
        ...adapterWarnings,
        ...provenanceWarnings,
        ...(enrichment.warnings ?? []),
        ...invalidWarnings(researchPlan.invalidOccurrences)
      ]);
      const warningsByPackage = new Map();
      for (const warning of warnings) {
        if (!warning.packageId) continue;
        const codes = warningsByPackage.get(warning.packageId) ?? new Set();
        codes.add(warning.code);
        warningsByPackage.set(warning.packageId, codes);
      }
      const conflictPackages = new Set(provenanceWarnings.map((warning) => warning.packageId));
      const packages = normalizedResults.map((item) => {
        const packageRecord = clone(item.package);
        packageRecord.sourceIds = clone(packageSources.get(packageRecord.id) ?? []);
        packageRecord.warningCodes = sortedUnique([
          ...(packageRecord.warningCodes ?? []),
          ...(warningsByPackage.get(packageRecord.id) ?? [])
        ]);
        if (packageRecord.status === 'resolved' && conflictPackages.has(packageRecord.id)) {
          packageRecord.status = 'partial';
        }
        return packageRecord;
      }).sort((left, right) => compareText(left.id, right.id));
      const packageOutcomes = registryResults.map((item) => ({
        packageId: item.result.package.id,
        adapterInvoked: item.adapterInvoked,
        cacheOutcome: item.result.cache
      })).sort(comparePackageOutcomes);
      const completed = dateFromClock(clock);
      const cache = cacheSummary(packageOutcomes);
      const invocationCounts = adapterInvocationCounts(
        packageOutcomes,
        new Map(researchPlan.packages.map((item) => [item.id, item]))
      );
      const statuses = statusSummary(packages);
      const partialFailureCount = packages.filter((item) => item.status !== 'resolved').length;
      const result = {
        resultVersion: RESULT_VERSION,
        input: {
          projectManifest: clone(researchPlan.input.projectManifest),
          researchPlanVersion: researchPlan.planVersion
        },
        execution: {
          startedAt: started.toISOString(),
          completedAt: completed.toISOString(),
          durationMs: completed.getTime() - started.getTime(),
          concurrency: effectiveConcurrency,
          inputPackageCount: packages.length,
          adapterInvocationCount: packageOutcomes.filter((item) => item.adapterInvoked).length,
          adapterInvocationCounts: invocationCounts,
          sourceCount: sources.length,
          warningCount: warnings.length,
          partialFailureCount,
          ...cache,
          packageOutcomes
        },
        summary: {
          inputOccurrenceCount: researchPlan.summary.inputOccurrenceCount,
          packageCount: packages.length,
          ...statuses,
          invalidOccurrenceCount: researchPlan.invalidOccurrences.length,
          unsupportedOccurrenceCount: researchPlan.summary.unsupportedOccurrenceCount,
          sourceCount: sources.length,
          warningCount: warnings.length,
          ...cache,
          retryCount: 0,
          partialFailureCount
        },
        packages,
        sources,
        evidence: clone(enrichment.evidence ?? []),
        warnings,
        invalidOccurrences: clone(researchPlan.invalidOccurrences),
        unsupported: clone(researchPlan.unsupported)
      };
      return validateKnowledgeResearchResult(result, researchPlan);
    }
  };
}
