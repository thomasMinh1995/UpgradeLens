import { createHash } from 'node:crypto';

import { canonicalJson } from './canonical-json.js';
import { fetchEvidenceDocument } from './http/bounded-fetch.js';
import { createCacheIdentity } from './knowledge-cache.js';
import { compareText } from './portable.js';
import { canonicalizeSourceUrl } from './source-url.js';

export const DEFAULT_EVIDENCE_SOURCE_LIMIT = 5;
export const DEFAULT_EVIDENCE_DOCUMENT_BYTES = 512 * 1024;
export const DEFAULT_EVIDENCE_CONTENT_CHARACTERS = 24_000;
export const DEFAULT_EVIDENCE_TTL_MS = 24 * 60 * 60 * 1_000;

const ROLE_PRIORITY = new Map([
  ['releaseNotes', 0],
  ['releases', 1],
  ['changelog', 2],
  ['migrationGuide', 3]
]);
const PRIMARY_KINDS = new Set([
  'releaseNotes', 'changelog', 'migrationGuide', 'breakingChanges', 'deprecations', 'compatibility'
]);

function digestText(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function digestJson(value) {
  return digestText(canonicalJson(value));
}

function sourceIdFor(packageId, group, url) {
  return `${packageId}:${group}:${createHash('sha256').update(url).digest('hex')}`;
}

function decodeHtmlEntities(value) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const number = entity[1].toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
      return Number.isSafeInteger(number) && number > 0 && number <= 0x10ffff
        ? String.fromCodePoint(number)
        : match;
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function htmlToText(value) {
  return decodeHtmlEntities(value
    .replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<h([1-6])\b[^>]*>/gi, (_match, level) => `\n${'#'.repeat(Number(level))} `)
    .replace(/<\/(?:h[1-6]|p|div|section|article|li|tr)>/gi, '\n')
    .replace(/<(?:p|div|section|article)\b[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' '));
}

export function normalizeEvidenceContent(value, {
  mediaType = 'text/plain',
  maxCharacters = DEFAULT_EVIDENCE_CONTENT_CHARACTERS
} = {}) {
  if (typeof value !== 'string') return '';
  const source = /(?:text\/html|application\/xhtml\+xml)/i.test(mediaType) ? htmlToText(value) : value;
  const normalized = source
    .normalize('NFC')
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s/?#]*@[^\s]+/gi, '[credentialed URL removed]')
    .replace(/\r\n?/g, '\n')
    .replace(/\u0000/g, '')
    .split('\n')
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (normalized.length <= maxCharacters) return normalized;
  const bounded = normalized.slice(0, maxCharacters);
  const boundary = Math.max(bounded.lastIndexOf('\n'), bounded.lastIndexOf(' '));
  return `${bounded.slice(0, boundary > maxCharacters * 0.8 ? boundary : maxCharacters).trimEnd()}\n[content truncated]`;
}

function portableDocument(request, response) {
  if (request.format !== 'githubReleases') {
    return {
      mediaType: 'text/plain',
      text: normalizeEvidenceContent(response.text, { mediaType: response.mediaType })
    };
  }
  let releases;
  try {
    releases = JSON.parse(response.text);
  } catch {
    return { mediaType: 'application/json', text: '[]' };
  }
  const portable = Array.isArray(releases) ? releases.filter((release) => release && typeof release === 'object')
    .map((release) => ({
      tag_name: typeof release.tag_name === 'string' ? release.tag_name : null,
      name: typeof release.name === 'string' ? normalizeEvidenceContent(release.name) : null,
      body: typeof release.body === 'string' ? normalizeEvidenceContent(release.body, { maxCharacters: 8_000 }) : null,
      draft: release.draft === true,
      published_at: typeof release.published_at === 'string' ? release.published_at : null
    })) : [];
  return { mediaType: 'application/json', text: JSON.stringify(portable) };
}

function primaryKindForRole(role) {
  if (role === 'releaseNotes' || role === 'releases') return 'releaseNotes';
  if (role === 'changelog') return 'changelog';
  if (role === 'migrationGuide') return 'migrationGuide';
  return null;
}

export function classifyEvidenceContent({ role, url = '', heading = '', content = '' } = {}) {
  const text = `${heading}\n${content.slice(0, 400)}`;
  if (/\b(?:breaking changes?|breaking)\b/i.test(heading)) return 'breakingChanges';
  if (/\b(?:deprecated|deprecations?)\b/i.test(heading)) return 'deprecations';
  if (/\b(?:compatibility|requirements?|supported (?:runtime|platform|python|node))\b/i.test(heading)) {
    return 'compatibility';
  }
  if (/\b(?:migration|migrating|upgrade guide)\b/i.test(heading)
    || /(?:^|\/)(?:migration|migrating|upgrade)(?:[-_.\/]|$)/i.test(new URL(url, 'https://invalid.example').pathname)) {
    return 'migrationGuide';
  }
  if (/^\s*#+\s*(?:breaking|deprecated|compatibility)/im.test(text)) return primaryKindForRole(role);
  return primaryKindForRole(role);
}

function githubRepositoryCoordinates(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.hostname !== 'github.com' || parts.length !== 2) return null;
    return { owner: parts[0], repository: parts[1] };
  } catch {
    return null;
  }
}

function derivedRequest(packageRecord, source, { role, group, url, format }) {
  const canonical = canonicalizeSourceUrl(url);
  if (!canonical) return null;
  return {
    packageId: packageRecord.id,
    ecosystem: packageRecord.ecosystem,
    sourceId: sourceIdFor(packageRecord.id, group, canonical),
    sourceKind: role === 'releases' ? 'releaseFeed' : 'officialDocumentation',
    role,
    url: canonical,
    format,
    discoveredFrom: source.id,
    trustEvidenceSourceIds: source.discoveredFrom ? [source.discoveredFrom] : [],
    authority: 'publisherProvided',
    trust: 'publisher',
    conflictsWith: []
  };
}

function directRequest(packageRecord, source, role) {
  const canonical = canonicalizeSourceUrl(source.url);
  if (!canonical) return null;
  return {
    packageId: packageRecord.id,
    ecosystem: packageRecord.ecosystem,
    sourceId: source.id,
    sourceKind: source.kind,
    role,
    url: canonical,
    format: 'document',
    discoveredFrom: source.discoveredFrom,
    trustEvidenceSourceIds: [...source.trustEvidenceSourceIds],
    authority: source.authority,
    trust: source.trust,
    conflictsWith: [...(source.conflictsWith ?? [])]
  };
}

/** Discover only registry-qualified direct documents and a bounded GitHub repository mapping. */
export function discoverEvidenceSourceRequests(packageRecord, sources, {
  maxCandidates = DEFAULT_EVIDENCE_SOURCE_LIMIT
} = {}) {
  const packageSources = sources.filter((source) => packageRecord.sourceIds.includes(source.id));
  const requests = [];
  for (const source of packageSources) {
    if (source.kind === 'registry') continue;
    for (const role of source.supports ?? []) {
      if (ROLE_PRIORITY.has(role)) requests.push(directRequest(packageRecord, source, role));
    }
  }
  for (const source of packageSources.filter((item) => item.supports?.includes('repository'))) {
    const repository = githubRepositoryCoordinates(source.url);
    if (!repository) continue;
    const base = `https://api.github.com/repos/${repository.owner}/${repository.repository}`;
    const raw = `https://raw.githubusercontent.com/${repository.owner}/${repository.repository}/HEAD`;
    requests.push(
      derivedRequest(packageRecord, source, {
        role: 'releases', group: 'releaseFeed', url: `${base}/releases`, format: 'githubReleases'
      }),
      derivedRequest(packageRecord, source, {
        role: 'changelog', group: 'changelog', url: `${raw}/CHANGELOG.md`, format: 'document'
      }),
      derivedRequest(packageRecord, source, {
        role: 'migrationGuide', group: 'migrationGuide', url: `${raw}/MIGRATION.md`, format: 'document'
      })
    );
  }
  const unique = new Map();
  for (const request of requests.filter(Boolean).sort((left, right) =>
    (ROLE_PRIORITY.get(left.role) ?? 99) - (ROLE_PRIORITY.get(right.role) ?? 99)
      || compareText(left.url, right.url))) {
    if (!unique.has(request.url)) unique.set(request.url, request);
  }
  return [...unique.values()].slice(0, maxCandidates);
}

function versionForTag(tag, packageRecord) {
  if (typeof tag !== 'string') return null;
  const versions = packageRecord.releaseIndex.map((release) => release.version).filter(Boolean)
    .sort((left, right) => right.length - left.length || compareText(left, right));
  return versions.find((version) => tag === version || tag === `v${version}`
    || tag.endsWith(`@${version}`) || tag.endsWith(`-${version}`)) ?? null;
}

function versionsForHeading(heading, packageRecord) {
  return packageRecord.releaseIndex.map((release) => release.version).filter((version) =>
    new RegExp(`(^|[^0-9A-Za-z])${version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^0-9A-Za-z]|$)`).test(heading)
  ).sort(compareText);
}

function splitMarkdownSections(content) {
  const lines = content.split('\n');
  const starts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index]);
    if (match) starts.push({ index, heading: match[2] });
  }
  if (starts.length === 0) return [{ heading: '', content }];
  return starts.map((start, index) => ({
    heading: start.heading,
    content: lines.slice(start.index, starts[index + 1]?.index ?? lines.length).join('\n').trim()
  })).filter((section) => section.content.length > 0);
}

function evidenceItem({ request, retrievedAt, kind, locator, releaseVersions, content }) {
  const contentDigest = digestText(content);
  const material = {
    packageId: request.packageId,
    sourceId: request.sourceId,
    kind,
    locator,
    releaseVersions,
    contentDigest
  };
  return {
    id: digestJson(material),
    packageId: request.packageId,
    sourceId: request.sourceId,
    kind,
    contentDigest,
    retrievedAt,
    mediaType: 'text/plain',
    locator,
    releaseVersions,
    content
  };
}

function evidenceFromDocument(request, packageRecord, document, retrievedAt) {
  const normalized = normalizeEvidenceContent(document.text, { mediaType: document.mediaType });
  if (!normalized) return [];
  const sections = splitMarkdownSections(normalized);
  const items = [];
  for (const [index, section] of sections.entries()) {
    const kind = classifyEvidenceContent({
      role: request.role,
      url: request.url,
      heading: section.heading,
      content: section.content
    });
    if (!PRIMARY_KINDS.has(kind)) continue;
    const releaseVersions = versionsForHeading(section.heading, packageRecord);
    items.push(evidenceItem({
      request,
      retrievedAt,
      kind,
      locator: section.heading ? `heading:${section.heading}` : `document:${index + 1}`,
      releaseVersions,
      content: section.content
    }));
  }
  return items.slice(0, 12);
}

function evidenceFromGithubReleases(request, packageRecord, document, retrievedAt) {
  let releases;
  try {
    releases = JSON.parse(document.text);
  } catch {
    return [];
  }
  if (!Array.isArray(releases)) return [];
  return releases.filter((release) => release && typeof release === 'object'
    && release.draft !== true && typeof release.tag_name === 'string')
    .flatMap((release) => {
      const version = versionForTag(release.tag_name, packageRecord);
      const content = normalizeEvidenceContent([
        release.name ? `# ${release.name}` : `# ${release.tag_name}`,
        `Tag: ${release.tag_name}`,
        release.published_at ? `Published: ${release.published_at}` : '',
        typeof release.body === 'string' ? release.body : ''
      ].filter(Boolean).join('\n\n'), { mediaType: 'text/markdown', maxCharacters: 8_000 });
      if (!content || !version) return [];
      const heading = release.name ?? release.tag_name;
      return [evidenceItem({
        request,
        retrievedAt,
        kind: classifyEvidenceContent({ role: 'releaseNotes', heading, content }) ?? 'releaseNotes',
        locator: `release:${release.tag_name}`,
        releaseVersions: [version],
        content
      })];
    }).slice(0, 12);
}

function requestIdentity(request) {
  return createCacheIdentity({
    adapter: 'official-evidence',
    resourceKind: 'evidence-document',
    packageId: request.packageId,
    resourceVariant: createHash('sha256').update(request.url).digest('hex'),
    adapterVersion: '1'
  });
}

function warning(request, code, message, retryable) {
  return { code, packageId: request.packageId, sourceId: request.sourceId, message, retryable };
}

function snapshot(content, mediaType, retrievedAt, freshness) {
  return { contentDigest: digestText(content), mediaType, retrievedAt, freshness };
}

function sourceRecord(request, status, sourceSnapshot) {
  return {
    id: request.sourceId,
    kind: request.sourceKind,
    authority: request.authority,
    trust: request.trust,
    url: request.url,
    status,
    supports: [request.role],
    discoveredFrom: request.discoveredFrom,
    trustEvidenceSourceIds: [...request.trustEvidenceSourceIds].sort(compareText),
    snapshot: sourceSnapshot,
    conflictsWith: [...request.conflictsWith].sort(compareText)
  };
}

async function mapBounded(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

/** Provider-neutral source adapter for bounded, official evidence documents. */
export function createEvidenceSourceAdapter({
  fetch: fetchImplementation = globalThis.fetch,
  cache,
  clock = () => new Date(),
  offline = false,
  timeoutMs = 10_000,
  maxResponseBytes = DEFAULT_EVIDENCE_DOCUMENT_BYTES,
  ttlMs = DEFAULT_EVIDENCE_TTL_MS,
  maxCandidatesPerPackage = DEFAULT_EVIDENCE_SOURCE_LIMIT,
  concurrency = 2
} = {}) {
  if (!cache || typeof cache.read !== 'function' || typeof cache.write !== 'function') {
    throw new Error('Evidence Source Adapter requires a Knowledge Store cache.');
  }
  return {
    async enrich({ packages, sources }) {
      const requests = packages.flatMap((packageRecord) =>
        discoverEvidenceSourceRequests(packageRecord, sources, { maxCandidates: maxCandidatesPerPackage })
          .map((request) => ({ request, packageRecord })));
      const outcomes = await mapBounded(requests, concurrency, async ({ request, packageRecord }) => {
        const identity = requestIdentity(request);
        const cached = await cache.read(identity);
        let document;
        let retrievedAt;
        let freshness = 'fresh';
        if (cached.status === 'fresh' || (offline && cached.status === 'expired')) {
          document = cached.body;
          retrievedAt = cached.storedAt;
          freshness = cached.status === 'fresh' ? 'fresh' : 'stale';
        } else if (offline) {
          return {
            packageId: request.packageId,
            source: sourceRecord(request, 'unavailable', null), evidence: [],
            warnings: [warning(request, 'EVIDENCE_SOURCE_UNAVAILABLE', 'Offline mode has no cached official evidence document.', false)]
          };
        } else {
          let response;
          try {
            response = await fetchEvidenceDocument(request.url, {
              fetchImplementation, timeoutMs, maxResponseBytes
            });
          } catch {
            return {
              packageId: request.packageId,
              source: sourceRecord(request, 'unavailable', null), evidence: [],
              warnings: [warning(request, 'EVIDENCE_SOURCE_UNAVAILABLE', 'Official evidence source could not be retrieved.', true)]
            };
          }
          if (response.status !== 200) {
            return {
              packageId: request.packageId,
              source: sourceRecord(request, response.status === 404 ? 'notFound' : 'unavailable', null), evidence: [],
              warnings: [warning(request, 'RELEASE_EVIDENCE_NOT_FOUND', 'Official release or migration evidence was not found at this source.', false)]
            };
          }
          document = portableDocument(request, response);
          const stored = await cache.write(identity, document, { ttlMs });
          retrievedAt = stored.storedAt;
        }
        const normalizedSnapshot = normalizeEvidenceContent(document.text, {
          mediaType: document.mediaType,
          maxCharacters: DEFAULT_EVIDENCE_CONTENT_CHARACTERS
        });
        const evidence = request.format === 'githubReleases'
          ? evidenceFromGithubReleases(request, packageRecord, document, retrievedAt)
          : evidenceFromDocument(request, packageRecord, document, retrievedAt);
        const warnings = evidence.length === 0
          ? [warning(request, 'RELEASE_EVIDENCE_NOT_FOUND', 'Official source contained no versioned release or migration evidence.', false)]
          : [];
        return {
          packageId: request.packageId,
          source: sourceRecord(
            request,
            freshness === 'stale' ? 'stale' : 'available',
            snapshot(normalizedSnapshot, document.mediaType, retrievedAt, freshness)
          ),
          evidence,
          warnings
        };
      });
      return {
        packageSources: [...new Set(outcomes.map((outcome) => outcome.packageId))].sort(compareText).map((packageId) => ({
          packageId,
          sourceIds: outcomes.filter((outcome) => outcome.packageId === packageId)
            .map((outcome) => outcome.source.id).sort(compareText)
        })),
        sources: outcomes.map((outcome) => outcome.source).sort((left, right) => compareText(left.id, right.id)),
        evidence: outcomes.flatMap((outcome) => outcome.evidence)
          .filter((item, index, items) => items.findIndex((other) =>
            other.packageId === item.packageId && other.contentDigest === item.contentDigest) === index)
          .sort((left, right) => compareText(left.id, right.id)),
        warnings: outcomes.flatMap((outcome) => outcome.warnings).sort((left, right) =>
          compareText(left.packageId, right.packageId) || compareText(left.sourceId, right.sourceId)
            || compareText(left.code, right.code) || compareText(left.message, right.message))
      };
    }
  };
}
