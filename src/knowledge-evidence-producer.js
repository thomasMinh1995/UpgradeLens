import { createHash } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import { canonicalJson } from './canonical-json.js';
import { PRODUCT_NAME, VERSION } from './constants.js';
import {
  KNOWLEDGE_EVIDENCE_BUNDLE_SCHEMA_VERSION,
  validateKnowledgeEvidenceBundle
} from './knowledge-evidence-bundle.js';
import { validateKnowledgeManifest } from './knowledge-manifest-builder.js';
import { compareText } from './portable.js';

function digestBytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function digestText(value) {
  return digestBytes(Buffer.from(value, 'utf8'));
}

function digestJson(value) {
  return digestText(canonicalJson(value));
}

function textValue(value) {
  if (value === null || value === undefined) return 'unknown';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function sourceFor(manifest, sourceId) {
  return manifest.sources.find((source) => source.id === sourceId) ?? null;
}

function retrievedAtFor(manifest, source) {
  return source?.snapshot?.retrievedAt ?? manifest.generatedAt;
}

function latestEvidenceContent(packageRecord) {
  return [
    `Package: ${packageRecord.id}`,
    `Ecosystem: ${packageRecord.ecosystem}`,
    `Registry: ${packageRecord.identity.registry}`,
    `Normalized name: ${packageRecord.identity.normalizedName}`,
    `Latest version: ${packageRecord.latest.version}`,
    `Latest selection: ${packageRecord.latest.selection}`,
    `Published at: ${textValue(packageRecord.latest.publishedAt)}`,
    `Release URL: ${textValue(packageRecord.latest.releaseUrl)}`,
    `Prerelease: ${textValue(packageRecord.latest.prerelease)}`,
    `Yanked: ${textValue(packageRecord.latest.yanked)}`,
    `Deprecated: ${textValue(packageRecord.latest.deprecated)}`,
    `Package description: ${textValue(packageRecord.metadata.description)}`,
    `License: ${textValue(packageRecord.metadata.license)}`,
    `Deprecation message: ${textValue(packageRecord.metadata.deprecationMessage)}`,
    `Project status: ${textValue(packageRecord.metadata.projectStatus)}`
  ].join('\n');
}

function evidenceId(material) {
  return digestJson(material);
}

function buildLatestEvidence(manifest, packageRecord) {
  if (!packageRecord.latest?.version || !packageRecord.latest?.sourceId) return null;
  const source = sourceFor(manifest, packageRecord.latest.sourceId);
  if (!source || !['available', 'stale'].includes(source.status)) return null;
  const content = latestEvidenceContent(packageRecord);
  const contentDigest = digestText(content);
  const releaseVersions = [packageRecord.latest.version].sort(compareText);
  const locator = `registry-latest:${packageRecord.latest.version}`;
  const material = {
    packageId: packageRecord.id,
    sourceId: packageRecord.latest.sourceId,
    kind: 'registryFact',
    locator,
    releaseVersions,
    contentDigest
  };
  return {
    id: evidenceId(material),
    packageId: packageRecord.id,
    sourceId: packageRecord.latest.sourceId,
    kind: 'registryFact',
    contentDigest,
    retrievedAt: retrievedAtFor(manifest, source),
    mediaType: 'text/plain',
    locator,
    releaseVersions,
    content
  };
}

function compareEvidence(left, right) {
  return compareText(left.id, right.id);
}

function compareWarnings(left, right) {
  return compareText(left.packageId ?? '', right.packageId ?? '')
    || compareText(left.sourceId ?? '', right.sourceId ?? '')
    || compareText(left.code, right.code)
    || compareText(left.message, right.message);
}

function bundleWarningFromManifest(warning) {
  return {
    code: warning.code,
    ...(warning.packageId ? { packageId: warning.packageId } : {}),
    ...(warning.sourceId ? { sourceId: warning.sourceId } : {}),
    message: warning.message
  };
}

function evidenceMissingWarning(packageRecord) {
  return {
    code: 'EVIDENCE_MISSING',
    packageId: packageRecord.id,
    message: `No portable evidence could be produced for ${packageRecord.id}.`
  };
}

function sortedUniqueWarnings(warnings) {
  const seen = new Set();
  const unique = [];
  for (const warning of warnings.sort(compareWarnings)) {
    const key = [
      warning.packageId ?? '',
      warning.sourceId ?? '',
      warning.code,
      warning.message
    ].join('\0');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(warning);
    }
  }
  return unique;
}

function summaryFor(evidence, warnings) {
  return {
    evidenceCount: evidence.length,
    packageCount: new Set(evidence.map((item) => item.packageId)).size,
    sourceCount: new Set(evidence.map((item) => item.sourceId)).size,
    warningCount: warnings.length
  };
}

export function buildKnowledgeEvidenceBundle(manifest, {
  knowledgeManifestArtifact,
  knowledgeManifestBytes,
  generatedAt
}) {
  validateKnowledgeManifest(manifest);
  if (!(knowledgeManifestBytes instanceof Uint8Array)) {
    throw new Error('Knowledge Evidence Bundle producer requires Knowledge Manifest bytes.');
  }
  if (!knowledgeManifestArtifact) {
    throw new Error('Knowledge Evidence Bundle producer requires Knowledge Manifest artifact path.');
  }

  const evidence = [];
  const warnings = (manifest.warnings ?? []).map(bundleWarningFromManifest);
  for (const packageRecord of manifest.packages) {
    const item = buildLatestEvidence(manifest, packageRecord);
    if (item) evidence.push(item);
    else if (!['invalid', 'notFound'].includes(packageRecord.status)) warnings.push(evidenceMissingWarning(packageRecord));
  }

  evidence.sort(compareEvidence);
  const sortedWarnings = sortedUniqueWarnings(warnings);
  const bundle = {
    schemaVersion: KNOWLEDGE_EVIDENCE_BUNDLE_SCHEMA_VERSION,
    generatedAt: generatedAt ?? manifest.generatedAt,
    generator: { name: PRODUCT_NAME, version: VERSION },
    input: {
      knowledgeManifest: {
        schemaVersion: manifest.schemaVersion,
        artifact: knowledgeManifestArtifact,
        artifactDigest: digestBytes(Buffer.from(knowledgeManifestBytes)),
        researchId: manifest.research.researchId
      }
    },
    summary: summaryFor(evidence, sortedWarnings),
    evidence,
    warnings: sortedWarnings
  };
  return validateKnowledgeEvidenceBundle(bundle);
}

export function serializeKnowledgeEvidenceBundle(bundle) {
  validateKnowledgeEvidenceBundle(bundle);
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export async function writeKnowledgeEvidenceBundle(outputPath, bundle) {
  validateKnowledgeEvidenceBundle(bundle);
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  const contents = serializeKnowledgeEvidenceBundle(bundle);
  await mkdir(path.dirname(target), { recursive: true });
  let handle;
  try {
    handle = await open(temporary, 'w', 0o600);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return target;
}
