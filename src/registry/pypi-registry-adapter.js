import {
  fetchRegistryJson,
  BoundedFetchError,
  validateRegistryResponseLimit
} from '../http/bounded-fetch.js';
import { createCacheIdentity, createKnowledgeCache } from '../knowledge-cache.js';
import {
  normalizePypiProject,
  normalizePypiRegistryBaseUrl,
  pypiRegistryUrls,
  validatePypiProject,
  validatePypiResearchPackage
} from './pypi-project.js';
import { sanitizeRegistryBodyForCache } from './sanitize-registry-body.js';

export const DEFAULT_PYPI_REGISTRY_BASE_URL = 'https://pypi.org';
export const DEFAULT_PYPI_INDEX_BASE_URL = 'https://pypi.org/simple';
export const DEFAULT_PYPI_METADATA_TTL_MS = 24 * 60 * 60 * 1_000;
export const DEFAULT_PYPI_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

function cacheIdentityFor(input) {
  return createCacheIdentity({
    adapter: 'pypi',
    resourceKind: 'registry-package',
    packageId: input.id,
    resourceVariant: 'project-json',
    adapterVersion: '1'
  });
}

function snapshot(bodyDigest, retrievedAt) {
  return {
    contentDigest: bodyDigest,
    mediaType: 'application/json',
    retrievedAt,
    freshness: 'fresh'
  };
}

function cacheOutcome(readResult) {
  if (readResult.status === 'missing') return { outcome: 'miss' };
  if (readResult.status === 'expired') return { outcome: 'expired' };
  if (readResult.status === 'corrupted') return { outcome: 'corrupted', reason: readResult.reason };
  return { outcome: 'hit' };
}

function unavailableResult(input, registryBaseUrl, cache, {
  status = 'unavailable', warningCode, message, retryable, errorCode
}) {
  const urls = pypiRegistryUrls(registryBaseUrl, input.normalizedName);
  const sourceId = `${input.id}:registry`;
  const warning = { code: warningCode, packageId: input.id, sourceId, message, retryable };
  return {
    package: {
      id: input.id,
      ecosystem: 'python',
      status,
      identity: {
        observedDeclaredNames: input.observedDeclaredNames,
        normalizedName: input.normalizedName,
        registry: 'pypi',
        ...urls
      },
      occurrences: input.occurrences,
      metadata: {},
      latest: null,
      releaseIndex: [],
      sourceIds: [sourceId],
      warningCodes: [warningCode]
    },
    source: {
      id: sourceId,
      kind: 'registry',
      authority: 'registryAuthoritative',
      trust: 'publisher',
      url: urls.packageUrl,
      apiUrl: urls.apiUrl,
      status: status === 'notFound' ? 'notFound' : 'unavailable',
      supports: ['identity'],
      discoveredFrom: null,
      trustEvidenceSourceIds: [],
      snapshot: null
    },
    cache,
    warnings: [warning],
    errorCode
  };
}

function normalizedResult(researchPackage, body, registryBaseUrl, cache, cacheRecord) {
  return {
    ...normalizePypiProject(researchPackage, body, {
      registryBaseUrl,
      snapshot: snapshot(cacheRecord.bodyDigest, cacheRecord.storedAt)
    }),
    cache,
    warnings: [],
    errorCode: null
  };
}

/** Private adapter for public PyPI project JSON, independent of Python installers. */
export function createPypiRegistryAdapter({
  registryBaseUrl = DEFAULT_PYPI_REGISTRY_BASE_URL,
  indexBaseUrl = DEFAULT_PYPI_INDEX_BASE_URL,
  fetch: fetchImplementation = globalThis.fetch,
  cache,
  clock = () => new Date(),
  timeoutMs = 10_000,
  maxResponseBytes = DEFAULT_PYPI_MAX_RESPONSE_BYTES,
  ttlMs = DEFAULT_PYPI_METADATA_TTL_MS,
  offline = false,
  userAgent = 'UpgradeLens/0.1.1'
} = {}) {
  const normalizedRegistryBaseUrl = normalizePypiRegistryBaseUrl(registryBaseUrl);
  validateRegistryResponseLimit(maxResponseBytes, { errorPrefix: 'PYPI' });
  // Validate future JSON Index policy input even though MVP-02-05 makes no index request.
  normalizePypiRegistryBaseUrl(indexBaseUrl);
  const knowledgeCache = cache ?? createKnowledgeCache({ clock });
  if (!knowledgeCache || typeof knowledgeCache.read !== 'function' || typeof knowledgeCache.write !== 'function') {
    throw new Error('PyPI Registry adapter requires a Knowledge Store cache.');
  }

  function requestFor(researchPackage) {
    const input = validatePypiResearchPackage(researchPackage);
    return pypiRegistryUrls(normalizedRegistryBaseUrl, input.normalizedName).apiUrl;
  }

  return {
    requestFor,
    cacheIdentityFor(researchPackage) {
      return cacheIdentityFor(validatePypiResearchPackage(researchPackage));
    },
    async researchPackage(researchPackage) {
      const input = validatePypiResearchPackage(researchPackage);
      const identity = cacheIdentityFor(input);
      const cached = await knowledgeCache.read(identity);
      if (cached.status === 'fresh') {
        try {
          return normalizedResult(input, cached.body, normalizedRegistryBaseUrl, cacheOutcome(cached), cached);
        } catch {
          return unavailableResult(input, normalizedRegistryBaseUrl, cacheOutcome(cached), {
            warningCode: 'REGISTRY_RESPONSE_INVALID',
            message: 'PyPI project metadata is invalid.',
            retryable: true,
            errorCode: 'PYPI_PROJECT_INVALID'
          });
        }
      }

      const previousCacheOutcome = cacheOutcome(cached);
      if (offline) {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'OFFLINE_CACHE_MISS',
          message: 'Offline mode has no fresh PyPI project metadata in cache.',
          retryable: false,
          errorCode: 'PYPI_OFFLINE_CACHE_MISS'
        });
      }
      let response;
      try {
        response = await fetchRegistryJson(requestFor(input), {
          fetchImplementation,
          timeoutMs,
          maxResponseBytes,
          userAgent,
          errorPrefix: 'PYPI',
          serviceName: 'PyPI'
        });
      } catch (error) {
        if (error instanceof BoundedFetchError
          && ['PYPI_RESPONSE_INVALID', 'PYPI_RESPONSE_TOO_LARGE'].includes(error.code)) {
          return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
            warningCode: 'REGISTRY_RESPONSE_INVALID',
            message: 'PyPI returned an invalid project metadata response.',
            retryable: true,
            errorCode: error.code
          });
        }
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'REGISTRY_UNAVAILABLE',
          message: 'PyPI project metadata is unavailable.',
          retryable: true,
          errorCode: error instanceof BoundedFetchError ? error.code : 'PYPI_TRANSPORT_FAILED'
        });
      }

      if (response.status === 404) {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          status: 'notFound', warningCode: 'PACKAGE_NOT_FOUND',
          message: 'Package was not found in PyPI.', retryable: false, errorCode: 'PYPI_HTTP_404'
        });
      }
      if (response.status === 429) {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'REGISTRY_RATE_LIMITED',
          message: 'PyPI rate limited project metadata retrieval.', retryable: true, errorCode: 'PYPI_HTTP_429'
        });
      }
      if (response.status !== 200 && response.status >= 200 && response.status < 300) {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'REGISTRY_RESPONSE_INVALID',
          message: 'PyPI returned an invalid project metadata response.', retryable: true,
          errorCode: `PYPI_HTTP_${response.status}`
        });
      }
      if (response.status !== 200) {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'REGISTRY_UNAVAILABLE',
          message: 'PyPI project metadata is unavailable.', retryable: response.status >= 500,
          errorCode: `PYPI_HTTP_${response.status}`
        });
      }

      try {
        validatePypiProject(response.body, input.normalizedName);
      } catch {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'REGISTRY_RESPONSE_INVALID',
          message: 'PyPI returned an invalid project metadata response.', retryable: true,
          errorCode: 'PYPI_PROJECT_INVALID'
        });
      }

      const cacheBody = sanitizeRegistryBodyForCache(response.body);
      const stored = await knowledgeCache.write(identity, cacheBody, { ttlMs });
      const fetchedCache = {
        outcome: cached.status === 'expired' ? 'revalidated' : cached.status === 'corrupted' ? 'corrupted-replaced' : 'miss'
      };
      if (cached.status === 'corrupted') fetchedCache.reason = cached.reason;
      return normalizedResult(input, cacheBody, normalizedRegistryBaseUrl, fetchedCache, stored);
    }
  };
}
