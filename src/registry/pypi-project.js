import { normalizePythonPackageName } from '../python-requirements.js';
import { compareText } from '../portable.js';

const PYPI_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_URL_ROLES = {
  documentationUrl: ['documentation', 'docs'],
  repositoryUrl: ['source', 'repository', 'code'],
  issueUrl: ['issues', 'tracker', 'bug tracker'],
  homepageUrl: ['homepage', 'home']
};
const SOURCE_CANDIDATE_ROLES = {
  changelog: ['changelog', 'changes'],
  releaseNotes: ['release notes'],
  releases: ['releases'],
  migrationGuide: ['migration', 'migration guide', 'upgrade guide']
};

export class PypiProjectError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PypiProjectError';
    this.code = 'PYPI_PROJECT_INVALID';
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
  const normalized = normalizedHttpsUrl(raw.startsWith('git+') ? raw.slice(4) : raw);
  if (!normalized) return null;
  const url = new URL(normalized);
  if (url.hostname.toLowerCase() === 'github.com') {
    url.pathname = url.pathname.replace(/\.git$/i, '');
    return url.pathname === '/' ? `${url.protocol}//${url.host}` : url.toString();
  }
  return normalized;
}

function normalizedLabel(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/\s+/g, ' ')
    : '';
}

function classifiedProjectUrls(projectUrls) {
  const entries = plainObject(projectUrls)
    ? Object.entries(projectUrls)
      .map(([label, url]) => ({ label: normalizedLabel(label), url }))
      .sort((left, right) => compareText(left.label, right.label) || compareText(String(left.url), String(right.url)))
    : [];
  const result = {};
  for (const [field, labels] of Object.entries(PROJECT_URL_ROLES)) {
    for (const label of labels) {
      const match = entries.find((entry) => entry.label === label);
      if (match) {
        const normalized = field === 'repositoryUrl'
          ? repositoryUrl(match.url)
          : normalizedHttpsUrl(match.url);
        if (normalized) {
          result[field] = normalized;
          break;
        }
      }
    }
  }
  return result;
}

function sourceCandidates(projectUrls) {
  const entries = plainObject(projectUrls)
    ? Object.entries(projectUrls)
      .map(([label, url]) => ({ label: normalizedLabel(label), originalLabel: String(label), url }))
      .sort((left, right) => compareText(left.label, right.label) || compareText(left.originalLabel, right.originalLabel))
    : [];
  return Object.entries(SOURCE_CANDIDATE_ROLES).flatMap(([role, labels]) => entries
    .filter((entry) => labels.includes(entry.label))
    .flatMap((entry) => {
      const url = normalizedHttpsUrl(entry.url);
      return url ? [{
        role,
        url,
        discoveredFromField: `info.project_urls.${entry.originalLabel}`
      }] : [];
    }))
    .sort((left, right) => compareText(left.role, right.role)
      || compareText(left.url, right.url)
      || compareText(left.discoveredFromField, right.discoveredFromField));
}

function normalizedDate(value) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function filesFor(value) {
  return Array.isArray(value) ? value.filter(plainObject) : [];
}

function earliestUpload(files) {
  return files
    .flatMap((file) => [normalizedDate(file.upload_time_iso_8601), normalizedDate(file.upload_time)])
    .filter(Boolean)
    .sort(compareText)[0] ?? null;
}

function yankedState(files) {
  if (files.some((file) => file.yanked === false)) return false;
  return files.length > 0 && files.every((file) => file.yanked === true) ? true : null;
}

function sortedStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))]
    .sort(compareText);
}

function projectStatus(classifiers) {
  if (!Array.isArray(classifiers)) return null;
  return classifiers
    .filter((item) => typeof item === 'string' && item.startsWith('Development Status :: '))
    .sort(compareText)[0] ?? null;
}

function pypiProjectUrl(base, name, version = null) {
  const suffix = version === null ? '' : `${encodeURIComponent(version)}/`;
  return `${base}/project/${encodeURIComponent(name)}/${suffix}`;
}

export function normalizePypiRegistryBaseUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PypiProjectError('PyPI registry base URL must be a non-empty HTTPS URL.');
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new PypiProjectError('PyPI registry base URL must be a valid HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new PypiProjectError('PyPI registry base URL must be HTTPS and must not contain credentials or query data.');
  }
  url.pathname = url.pathname.replace(/\/$/, '');
  return url.toString().replace(/\/$/, '');
}

export function validatePypiResearchPackage(researchPackage) {
  if (!plainObject(researchPackage)) throw new PypiProjectError('PyPI research package must be an object.');
  const normalizedName = normalizePythonPackageName(researchPackage.normalizedName ?? '');
  if (!PYPI_NAME.test(normalizedName)
    || researchPackage.id !== `pypi:${normalizedName}`
    || researchPackage.registry !== 'pypi'
    || researchPackage.ecosystem !== 'python') {
    throw new PypiProjectError('Research package is not a valid PyPI registry identity.');
  }
  return {
    id: researchPackage.id,
    registry: 'pypi',
    ecosystem: 'python',
    normalizedName,
    observedDeclaredNames: sortedStrings(researchPackage.observedDeclaredNames ?? [normalizedName]),
    occurrences: structuredClone(researchPackage.occurrences ?? [])
  };
}

export function pypiRegistryUrls(registryBaseUrl, normalizedName) {
  const base = normalizePypiRegistryBaseUrl(registryBaseUrl);
  return {
    registryBaseUrl: base,
    packageUrl: pypiProjectUrl(base, normalizedName),
    apiUrl: `${base}/pypi/${encodeURIComponent(normalizedName)}/json`
  };
}

/** Validate the stable subset of PyPI project JSON used by this MVP. */
export function validatePypiProject(project, requestedNormalizedName) {
  if (!plainObject(project) || !plainObject(project.info)
    || typeof project.info.name !== 'string'
    || normalizePythonPackageName(project.info.name) !== requestedNormalizedName) {
    throw new PypiProjectError('PyPI project metadata has an unsupported shape.');
  }
  if (project.releases !== undefined && !plainObject(project.releases)) {
    throw new PypiProjectError('PyPI project releases must be an object when present.');
  }
  if (project.urls !== undefined && !Array.isArray(project.urls)) {
    throw new PypiProjectError('PyPI project URLs must be an array when present.');
  }
  return project;
}

function metadata(info) {
  const classified = classifiedProjectUrls(info.project_urls);
  return {
    description: nullableString(info.summary) ?? nullableString(info.description),
    license: nullableString(info.license_expression) ?? nullableString(info.license),
    homepageUrl: classified.homepageUrl ?? normalizedHttpsUrl(info.home_page),
    documentationUrl: classified.documentationUrl ?? null,
    repositoryUrl: classified.repositoryUrl ?? null,
    issueUrl: classified.issueUrl ?? null,
    deprecationMessage: null,
    projectStatus: projectStatus(info.classifiers)
  };
}

/**
 * Translate validated PyPI project JSON into package and registry-source
 * records compatible with later Knowledge Manifest assembly.
 */
export function normalizePypiProject(researchPackage, project, { snapshot, registryBaseUrl }) {
  const input = validatePypiResearchPackage(researchPackage);
  validatePypiProject(project, input.normalizedName);
  const urls = pypiRegistryUrls(registryBaseUrl, input.normalizedName);
  const sourceId = `${input.id}:registry`;
  const releases = plainObject(project.releases) ? project.releases : {};
  const latestVersion = nullableString(project.info.version);
  const latestFiles = latestVersion && Object.hasOwn(releases, latestVersion)
    ? filesFor(releases[latestVersion])
    : latestVersion ? filesFor(project.urls) : [];
  const releaseIndex = Object.keys(releases).sort(compareText).map((version) => {
    const files = filesFor(releases[version]);
    return {
      version,
      publishedAt: earliestUpload(files),
      url: pypiProjectUrl(urls.registryBaseUrl, input.normalizedName, version),
      prerelease: null,
      yanked: yankedState(files),
      deprecated: null,
      sourceIds: [sourceId]
    };
  });
  const latest = latestVersion === null ? null : {
    version: latestVersion,
    selection: 'project-info-version',
    publishedAt: earliestUpload(latestFiles),
    releaseUrl: pypiProjectUrl(urls.registryBaseUrl, input.normalizedName, latestVersion),
    prerelease: null,
    yanked: yankedState(latestFiles),
    deprecated: null,
    sourceId
  };

  return {
    package: {
      id: input.id,
      ecosystem: 'python',
      status: latest ? 'resolved' : 'partial',
      identity: {
        observedDeclaredNames: input.observedDeclaredNames,
        normalizedName: input.normalizedName,
        registry: 'pypi',
        ...urls
      },
      occurrences: input.occurrences,
      metadata: metadata(project.info),
      latest,
      releaseIndex,
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
    },
    // Internal only: the public metadata contract intentionally has no
    // changelog/release-note fields. MVP-02-06 resolves these candidates.
    sourceCandidates: sourceCandidates(project.info.project_urls)
  };
}
