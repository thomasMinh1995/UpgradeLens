import {
  fetchNpmJson,
  BoundedFetchError,
  validateRegistryResponseLimit
} from '../http/bounded-fetch.js';
import { createCacheIdentity, createKnowledgeCache } from '../knowledge-cache.js';
import {
  normalizeNpmPackument,
  normalizeNpmRegistryBaseUrl,
  npmRegistryUrls,
  sanitizeNpmPackumentForCache,
  validateNpmPackument,
  validateNpmResearchPackage
} from './npm-packument.js';

export const DEFAULT_NPM_REGISTRY_BASE_URL = 'https://registry.npmjs.org';
export const DEFAULT_NPM_METADATA_TTL_MS = 24 * 60 * 60 * 1_000;
export const DEFAULT_NPM_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;

function currentDate(clock) {
  const value = clock();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('npm Registry adapter clock returned an invalid time.');
  return date;
}

function cacheIdentityFor(input) {
  return createCacheIdentity({
    adapter: 'npm',
    resourceKind: 'registry-package',
    packageId: input.id,
    resourceVariant: 'full-packument',
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
  if (readResult.status === 'corrupted') {
    return { outcome: 'corrupted', reason: readResult.reason };
  }
  return { outcome: 'hit' };
}

function unavailableResult(input, registryBaseUrl, cache, {
  status = 'unavailable',
  warningCode,
  message,
  retryable,
  errorCode
}) {
  const urls = npmRegistryUrls(registryBaseUrl, input.normalizedName);
  const sourceId = `${input.id}:registry`;
  const warning = {
    code: warningCode,
    packageId: input.id,
    sourceId,
    message,
    retryable
  };
  return {
    package: {
      id: input.id,
      ecosystem: 'node',
      status,
      identity: {
        observedDeclaredNames: input.observedDeclaredNames,
        normalizedName: input.normalizedName,
        registry: 'npm',
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
  const normalized = normalizeNpmPackument(researchPackage, body, {
    registryBaseUrl,
    snapshot: snapshot(cacheRecord.bodyDigest, cacheRecord.storedAt)
  });
  return {
    ...normalized,
    cache,
    warnings: [],
    errorCode: null
  };
}

/**
 * Create the private npm-compatible Registry adapter. It resolves `npm:`
 * identities only; npm, Yarn, pnpm, and Bun are intentionally not inputs to
 * its request or cache behavior.
 */
export function createNpmRegistryAdapter({
  registryBaseUrl = DEFAULT_NPM_REGISTRY_BASE_URL,
  fetch: fetchImplementation = globalThis.fetch,
  cache,
  clock = () => new Date(),
  timeoutMs = 10_000,
  maxResponseBytes = DEFAULT_NPM_MAX_RESPONSE_BYTES,
  ttlMs = DEFAULT_NPM_METADATA_TTL_MS,
  offline = false,
  userAgent = 'UpgradeLens/0.1.1'
} = {}) {
  const normalizedRegistryBaseUrl = normalizeNpmRegistryBaseUrl(registryBaseUrl);
  validateRegistryResponseLimit(maxResponseBytes, { errorPrefix: 'NPM' });
  const knowledgeCache = cache ?? createKnowledgeCache({ clock });
  if (!knowledgeCache || typeof knowledgeCache.read !== 'function' || typeof knowledgeCache.write !== 'function') {
    throw new Error('npm Registry adapter requires a Knowledge Store cache.');
  }

  function requestFor(researchPackage) {
    const input = validateNpmResearchPackage(researchPackage);
    return npmRegistryUrls(normalizedRegistryBaseUrl, input.normalizedName).apiUrl;
  }

  return {
    requestFor,
    cacheIdentityFor(researchPackage) {
      return cacheIdentityFor(validateNpmResearchPackage(researchPackage));
    },
    async researchPackage(researchPackage) {
      const input = validateNpmResearchPackage(researchPackage);
      const identity = cacheIdentityFor(input);
      const cached = await knowledgeCache.read(identity);

      if (cached.status === 'fresh') {
        try {
          return normalizedResult(input, cached.body, normalizedRegistryBaseUrl, cacheOutcome(cached), cached);
        } catch {
          return unavailableResult(input, normalizedRegistryBaseUrl, cacheOutcome(cached), {
            warningCode: 'REGISTRY_RESPONSE_INVALID',
            message: 'npm Registry package metadata is invalid.',
            retryable: true,
            errorCode: 'NPM_PACKUMENT_INVALID'
          });
        }
      }

      const previousCacheOutcome = cacheOutcome(cached);
      if (offline) {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'OFFLINE_CACHE_MISS',
          message: 'Offline mode has no fresh npm Registry package metadata in cache.',
          retryable: false,
          errorCode: 'NPM_OFFLINE_CACHE_MISS'
        });
      }
      let response;
      try {
        response = await fetchNpmJson(requestFor(input), {
          fetchImplementation,
          timeoutMs,
          maxResponseBytes,
          userAgent
        });
      } catch (error) {
        if (error instanceof BoundedFetchError
          && ['NPM_RESPONSE_INVALID', 'NPM_RESPONSE_TOO_LARGE'].includes(error.code)) {
          return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
            warningCode: 'REGISTRY_RESPONSE_INVALID',
            message: 'npm Registry returned an invalid package metadata response.',
            retryable: true,
            errorCode: error.code
          });
        }
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'REGISTRY_UNAVAILABLE',
          message: 'npm Registry package metadata is unavailable.',
          retryable: true,
          errorCode: error instanceof BoundedFetchError ? error.code : 'NPM_TRANSPORT_FAILED'
        });
      }

      if (response.status === 404) {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          status: 'notFound',
          warningCode: 'PACKAGE_NOT_FOUND',
          message: 'Package was not found in the npm Registry.',
          retryable: false,
          errorCode: 'NPM_HTTP_404'
        });
      }
      if (response.status === 429) {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'REGISTRY_RATE_LIMITED',
          message: 'npm Registry rate limited package metadata retrieval.',
          retryable: true,
          errorCode: 'NPM_HTTP_429'
        });
      }
      if (response.status !== 200 && response.status >= 200 && response.status < 300) {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'REGISTRY_RESPONSE_INVALID',
          message: 'npm Registry returned an invalid package metadata response.',
          retryable: true,
          errorCode: `NPM_HTTP_${response.status}`
        });
      }
      if (response.status !== 200) {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'REGISTRY_UNAVAILABLE',
          message: 'npm Registry package metadata is unavailable.',
          retryable: response.status >= 500,
          errorCode: `NPM_HTTP_${response.status}`
        });
      }

      try {
        validateNpmPackument(response.body, input.normalizedName);
      } catch {
        return unavailableResult(input, normalizedRegistryBaseUrl, previousCacheOutcome, {
          warningCode: 'REGISTRY_RESPONSE_INVALID',
          message: 'npm Registry returned an invalid package metadata response.',
          retryable: true,
          errorCode: 'NPM_PACKUMENT_INVALID'
        });
      }

      const cacheBody = sanitizeNpmPackumentForCache(response.body);
      const stored = await knowledgeCache.write(identity, cacheBody, { ttlMs });
      const fetchedCache = {
        outcome: cached.status === 'expired' ? 'revalidated' : cached.status === 'corrupted' ? 'corrupted-replaced' : 'miss'
      };
      if (cached.status === 'corrupted') fetchedCache.reason = cached.reason;
      return normalizedResult(input, cacheBody, normalizedRegistryBaseUrl, fetchedCache, stored);
    }
  };
}
