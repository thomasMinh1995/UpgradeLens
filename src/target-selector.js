import { createHash } from 'node:crypto';

import { canonicalJsonBytes } from './canonical-json.js';
import {
  createDefaultEcosystemVersionAdapterRegistry,
  getEcosystemVersionAdapter
} from './ecosystem-version-adapter.js';
import { compareText, isPortableRelativePath } from './portable.js';

const REQUIRED_KEYS = Object.freeze(['package', 'target']);
const OPTIONAL_KEYS = Object.freeze(['project', 'manifest', 'type', 'occurrence']);
const ALLOWED_KEYS = new Set([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
const OCCURRENCE_ID_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OCCURRENCE_ID_VERSION = 'target-occurrence.v1';

export class TargetSelectorError extends Error {
  constructor(code, message, candidates = []) {
    super(`${code}: ${message}`);
    this.name = 'TargetSelectorError';
    this.code = code;
    this.candidates = Object.freeze([...candidates]);
  }
}

function selectorError(code, message, candidates) {
  throw new TargetSelectorError(code, message, candidates);
}

function requireText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0 || /[\r\n\0]/.test(value)) {
    selectorError('TARGET_SELECTOR_INVALID', `${field} must be a non-empty single-line value.`);
  }
  return value.trim();
}

function canonicalPackageId(value) {
  const text = requireText(value, 'package');
  const separator = text.indexOf(':');
  if (separator <= 0 || separator === text.length - 1
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text.slice(0, separator))
      || /\s/.test(text.slice(separator + 1))) {
    selectorError(
      'TARGET_SELECTOR_INVALID',
      'package must be an exact canonical ID such as npm:react, npm:@scope/package, or pypi:langsmith.'
    );
  }
  return text;
}

export function parseTargetSelector(value) {
  const text = requireText(value, '--target');
  const fields = {};
  for (const segment of text.split(',')) {
    const separator = segment.indexOf('=');
    if (separator <= 0) {
      selectorError(
        'TARGET_SELECTOR_INVALID',
        'each --target field must use key=value syntax.'
      );
    }
    const key = segment.slice(0, separator).trim();
    const fieldValue = requireText(segment.slice(separator + 1), key || '--target field');
    if (!ALLOWED_KEYS.has(key)) {
      selectorError('TARGET_SELECTOR_INVALID', `unsupported --target field ${key}.`);
    }
    if (Object.hasOwn(fields, key)) {
      selectorError('TARGET_SELECTOR_INVALID', `duplicate --target field ${key}.`);
    }
    fields[key] = fieldValue;
  }
  for (const key of REQUIRED_KEYS) {
    if (!Object.hasOwn(fields, key)) {
      selectorError('TARGET_SELECTOR_INVALID', `--target requires ${key}=<value>.`);
    }
  }
  const selector = {
    packageId: canonicalPackageId(fields.package),
    targetVersion: fields.target
  };
  if (fields.project) selector.projectId = fields.project;
  if (fields.manifest) {
    if (!isPortableRelativePath(fields.manifest)) {
      selectorError('TARGET_SELECTOR_INVALID', 'manifest must be a portable repository-relative path.');
    }
    selector.manifest = fields.manifest;
  }
  if (fields.type) selector.dependencyType = fields.type;
  if (fields.occurrence) {
    if (!OCCURRENCE_ID_PATTERN.test(fields.occurrence)) {
      selectorError(
        'TARGET_SELECTOR_INVALID',
        'occurrence must be a stable sha256:<64 lowercase hexadecimal characters> identifier.'
      );
    }
    selector.occurrenceId = fields.occurrence;
  }
  return Object.freeze(selector);
}

function occurrenceIdentity(input) {
  return {
    schemaVersion: OCCURRENCE_ID_VERSION,
    projectId: input.project.id,
    packageId: input.packageRecord.id,
    manifest: input.dependency.manifest,
    dependencyType: input.dependency.type,
    declaredName: input.dependency.name,
    declaredVersion: input.dependency.declaredVersion ?? null
  };
}

export function targetOccurrenceId(input) {
  const digest = createHash('sha256')
    .update(canonicalJsonBytes(occurrenceIdentity(input)))
    .digest('hex');
  return `sha256:${digest}`;
}

export function targetOccurrenceKey(input) {
  return [
    input.project.id,
    input.packageRecord.id,
    input.dependency.manifest,
    input.dependency.type,
    input.dependency.name,
    input.dependency.declaredVersion ?? ''
  ].join('\0');
}

function matches(input, selector) {
  return input.packageRecord.id === selector.packageId
    && (!selector.projectId || input.project.id === selector.projectId)
    && (!selector.manifest || input.dependency.manifest === selector.manifest)
    && (!selector.dependencyType || input.dependency.type === selector.dependencyType);
}

function exactSelector(input, targetVersion) {
  return [
    `package=${input.packageRecord.id}`,
    `target=${targetVersion}`,
    `project=${input.project.id}`,
    `manifest=${input.dependency.manifest}`,
    `type=${input.dependency.type}`,
    `occurrence=${targetOccurrenceId(input)}`
  ].join(',');
}

function safeDeclaredVersion(value) {
  if (value === null || value === undefined || value === '') return '<unversioned>';
  const text = String(value).trim();
  if (
    text.length === 0
    || text.length > 240
    || /[\u0000-\u001f\u007f]/.test(text)
    || /(?:authorization|credential|password|secret|token)\s*=/i.test(text)
  ) {
    return '<redacted-declaration>';
  }
  if (/^(?:file:|link:|\.{1,2}[\\/]|[\\/]|~[\\/])/i.test(text)) {
    return '<local-path-reference>';
  }
  const prefix = text.startsWith('git+') ? 'git+' : '';
  const candidate = prefix ? text.slice(prefix.length) : text;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) return text;
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return `${prefix}${url.toString()}`;
  } catch {
    return text;
  }
}

function exactCandidate(input, targetVersion) {
  return {
    selector: exactSelector(input, targetVersion),
    projectId: input.project.id,
    manifest: input.dependency.manifest,
    dependencyType: input.dependency.type,
    declaredName: safeDeclaredVersion(input.dependency.name),
    declaredVersion: safeDeclaredVersion(input.dependency.declaredVersion)
  };
}

function candidateMessage(candidate) {
  return [
    `  --target '${candidate.selector}'`,
    `    project: ${candidate.projectId}`,
    `    manifest: ${candidate.manifest}`,
    `    type: ${candidate.dependencyType}`,
    `    declared name: ${candidate.declaredName}`,
    `    declared: ${candidate.declaredVersion}`
  ].join('\n');
}

function occurrenceIndex(inputs) {
  const indexed = new Map();
  for (const input of inputs) {
    const id = targetOccurrenceId(input);
    if (!indexed.has(id)) indexed.set(id, []);
    indexed.get(id).push(input);
  }
  for (const [id, matchesForId] of indexed) {
    if (matchesForId.length > 1) {
      selectorError(
        'TARGET_SELECTOR_CONFLICT',
        `dependency occurrence identity ${id} is duplicated; exact target selection is unsafe and no provider call was made.`
      );
    }
  }
  return indexed;
}

function matchesForSelector(inputs, selector, indexed) {
  if (!selector.occurrenceId) return inputs.filter((input) => matches(input, selector));
  const selected = indexed.get(selector.occurrenceId);
  if (!selected) {
    selectorError(
      'TARGET_SELECTOR_NOT_FOUND',
      `occurrence ${selector.occurrenceId} is stale or unknown; no provider call was made.`
    );
  }
  const input = selected[0];
  if (!matches(input, selector)) {
    selectorError(
      'TARGET_SELECTOR_CONFLICT',
      `occurrence ${selector.occurrenceId} conflicts with the supplied package/project/manifest/type fields; no provider call was made.`
    );
  }
  return selected;
}

function normalizeTarget(input, selector, adapterRegistry) {
  let adapter;
  try {
    adapter = getEcosystemVersionAdapter(input.project.ecosystem, adapterRegistry);
  } catch (error) {
    selectorError(
      'TARGET_VERSION_INVALID',
      `target ${selector.targetVersion} cannot be validated for ecosystem ${input.project.ecosystem}: ${error.message}`
    );
  }
  const normalized = adapter.normalizeVersion(selector.targetVersion);
  if (!normalized.ok) {
    selectorError(
      'TARGET_VERSION_INVALID',
      `target ${selector.targetVersion} is invalid for ${input.packageRecord.id}: ${normalized.reason}.`
    );
  }
  return normalized.value;
}

export function resolveTargetSelectors(inputs, selectors, {
  adapterRegistry = createDefaultEcosystemVersionAdapterRegistry()
} = {}) {
  const parsed = selectors.map((selector) => (
    typeof selector === 'string' ? parseTargetSelector(selector) : selector
  ));
  const indexed = occurrenceIndex(inputs);
  const selected = new Map();
  for (const selector of parsed) {
    const matchingInputs = matchesForSelector(inputs, selector, indexed);
    if (matchingInputs.length === 0) {
      selectorError(
        'TARGET_SELECTOR_NOT_FOUND',
        `no dependency occurrence matches ${selector.packageId}; no provider call was made.`
      );
    }
    if (matchingInputs.length > 1) {
      const exactCandidates = [...matchingInputs]
        .sort((left, right) => compareText(targetOccurrenceKey(left), targetOccurrenceKey(right)))
        .map((input) => exactCandidate(input, selector.targetVersion));
      const candidates = exactCandidates.map((candidate) => candidate.selector);
      selectorError(
        'TARGET_SELECTOR_AMBIGUOUS',
        `Target selector for ${selector.packageId} matches ${matchingInputs.length} dependency occurrences.\n`
        + 'Choose one of the following exact selectors:\n'
        + exactCandidates.map(candidateMessage).join('\n\n'),
        candidates
      );
    }
    const input = matchingInputs[0];
    const key = targetOccurrenceKey(input);
    const targetVersion = normalizeTarget(input, selector, adapterRegistry);
    if (selected.has(key)) {
      const prior = selected.get(key);
      selectorError(
        'TARGET_SELECTOR_CONFLICT',
        `dependency occurrence ${input.project.id} / ${input.dependency.manifest} / `
        + `${input.dependency.type} / ${input.packageRecord.id} was selected more than once `
        + `(${prior.targetVersion}, ${targetVersion}).`
      );
    }
    selected.set(key, Object.freeze({
      targetVersion,
      target: Object.freeze({ policy: 'explicit', version: targetVersion }),
      selector: Object.freeze({ ...selector })
    }));
  }
  return Object.freeze(new Map(
    [...selected.entries()].sort(([left], [right]) => compareText(left, right))
  ));
}
