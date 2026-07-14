import { compareText } from '../portable.js';

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const PRIVATE_KEYS = new Set([
  'authorization', 'proxyauthorization', 'cookie', 'setcookie', 'etag',
  'lastmodified', 'headers', 'cachekey', 'stack', 'password', 'credential',
  'credentials', 'secret', 'token', 'accesstoken', 'apikey', 'clientsecret', 'privatekey'
]);

export class NpmPackumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NpmPackumentError';
    this.code = 'NPM_PACKUMENT_INVALID';
  }
}

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function nullableString(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function normalizedHttpsUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.search = '';
    url.hash = '';
    if (url.pathname === '/') return `${url.protocol}//${url.host}`;
    return url.toString();
  } catch {
    return null;
  }
}

function repositoryUrl(value) {
  const raw = typeof value === 'string' ? value : plainObject(value) ? value.url : null;
  if (typeof raw !== 'string') return null;
  const candidate = raw.startsWith('git+') ? raw.slice(4) : raw;
  const normalized = normalizedHttpsUrl(candidate);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (url.hostname.toLowerCase() === 'github.com') {
    url.pathname = url.pathname.replace(/\.git$/i, '');
    return url.pathname === '/' ? `${url.protocol}//${url.host}` : url.toString();
  }
  return normalized;
}

function issueUrl(value) {
  const raw = typeof value === 'string' ? value : plainObject(value) ? value.url : null;
  return normalizedHttpsUrl(raw);
}

function publishedAt(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function explicitDeprecated(value) {
  if (typeof value === 'string') return value.trim() === '' ? false : true;
  if (typeof value === 'boolean') return value;
  return null;
}

function npmPageUrl(name) {
  return `https://www.npmjs.com/package/${name}`;
}

function npmReleaseUrl(name, version) {
  return `${npmPageUrl(name)}/v/${encodeURIComponent(version)}`;
}

function sortedStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))]
    .sort(compareText);
}

function privateKey(key) {
  return PRIVATE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''));
}

function unsafeStoredString(value) {
  return value.startsWith('/')
    || /^[A-Za-z]:[\\/]/.test(value)
    || /[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(value);
}

/**
 * Keep cache envelopes portable even when publisher-controlled metadata
 * contains a credentialed URL or request-shaped property.
 */
export function sanitizeNpmPackumentForCache(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return unsafeStoredString(value) ? null : value;
  if (Array.isArray(value)) return value.map(sanitizeNpmPackumentForCache);
  if (!plainObject(value)) return null;
  return Object.fromEntries(Object.keys(value).sort(compareText).flatMap((key) => {
    if (privateKey(key)) return [];
    return [[key, sanitizeNpmPackumentForCache(value[key])]];
  }));
}

function packageMetadata(packument) {
  const deprecated = packument.deprecated;
  const deprecationMessage = nullableString(deprecated);
  return {
    description: nullableString(packument.description),
    license: nullableString(packument.license) ?? nullableString(packument.license?.type),
    homepageUrl: normalizedHttpsUrl(packument.homepage),
    documentationUrl: null,
    repositoryUrl: repositoryUrl(packument.repository),
    issueUrl: issueUrl(packument.bugs),
    deprecationMessage,
    projectStatus: deprecated === undefined || deprecated === false ? null : 'deprecated'
  };
}

export function normalizeNpmRegistryBaseUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new NpmPackumentError('npm Registry base URL must be a non-empty HTTPS URL.');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new NpmPackumentError('npm Registry base URL must be a valid HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new NpmPackumentError('npm Registry base URL must be HTTPS and must not contain credentials or query data.');
  }
  url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

export function validateNpmResearchPackage(researchPackage) {
  if (!plainObject(researchPackage)) {
    throw new NpmPackumentError('npm research package must be an object.');
  }
  const name = researchPackage.normalizedName;
  if (typeof name !== 'string' || !NPM_NAME.test(name)
    || researchPackage.id !== `npm:${name}`
    || researchPackage.registry !== 'npm'
    || researchPackage.ecosystem !== 'node') {
    throw new NpmPackumentError('Research package is not a valid npm registry identity.');
  }
  return {
    id: researchPackage.id,
    registry: 'npm',
    ecosystem: 'node',
    normalizedName: name,
    observedDeclaredNames: sortedStrings(researchPackage.observedDeclaredNames ?? [name]),
    occurrences: structuredClone(researchPackage.occurrences ?? [])
  };
}

export function npmRegistryUrls(registryBaseUrl, normalizedName) {
  const base = normalizeNpmRegistryBaseUrl(registryBaseUrl);
  return {
    registryBaseUrl: base,
    packageUrl: npmPageUrl(normalizedName),
    apiUrl: `${base}/${encodeURIComponent(normalizedName)}`
  };
}

/** Validate the minimum packument shape before the caller writes it to cache. */
export function validateNpmPackument(packument, normalizedName) {
  if (!plainObject(packument)
    || packument.name !== normalizedName
    || !plainObject(packument['dist-tags'])
    || !plainObject(packument.versions)
    || !plainObject(packument.time)) {
    throw new NpmPackumentError('npm Registry package metadata has an unsupported shape.');
  }
  if (Object.hasOwn(packument['dist-tags'], 'latest')
    && typeof packument['dist-tags'].latest !== 'string') {
    throw new NpmPackumentError('npm Registry latest distribution tag must be a string.');
  }
  return packument;
}

/**
 * Translate a valid full npm packument into records that match the package and
 * source shapes used by the Knowledge Manifest, without assembling a manifest.
 */
export function normalizeNpmPackument(researchPackage, packument, { snapshot, registryBaseUrl }) {
  const input = validateNpmResearchPackage(researchPackage);
  validateNpmPackument(packument, input.normalizedName);
  const urls = npmRegistryUrls(registryBaseUrl, input.normalizedName);
  const sourceId = `${input.id}:registry`;
  const versions = packument.versions;
  const time = packument.time;
  const releases = Object.keys(versions).sort(compareText).map((version) => ({
    version,
    publishedAt: publishedAt(time[version]),
    url: npmReleaseUrl(input.normalizedName, version),
    prerelease: null,
    yanked: null,
    deprecated: explicitDeprecated(versions[version]?.deprecated),
    sourceIds: [sourceId]
  }));
  const latestVersion = packument['dist-tags'].latest;
  const latestRecord = typeof latestVersion === 'string' && Object.hasOwn(versions, latestVersion)
    ? {
        version: latestVersion,
        selection: 'dist-tag:latest',
        publishedAt: publishedAt(time[latestVersion]),
        releaseUrl: npmReleaseUrl(input.normalizedName, latestVersion),
        prerelease: null,
        yanked: null,
        deprecated: explicitDeprecated(versions[latestVersion]?.deprecated),
        sourceId
      }
    : null;
  const status = latestRecord ? 'resolved' : 'partial';

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
      metadata: packageMetadata(packument),
      latest: latestRecord,
      releaseIndex: releases,
      sourceIds: [sourceId],
      warningCodes: []
    },
    source: {
      id: sourceId,
      kind: 'registry',
      authority: 'registryAuthoritative',
      trust: 'publisher',
      url: urls.packageUrl,
      apiUrl: urls.apiUrl,
      status: 'available',
      supports: ['identity', 'latest', 'metadata', 'releases'],
      discoveredFrom: null,
      trustEvidenceSourceIds: [],
      snapshot
    }
  };
}
