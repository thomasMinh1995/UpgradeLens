import {
  duplicateDependencyNames,
  sortDependencies,
  summarizeDependencies
} from './dependencies.js';

const PACKAGE_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?/;
const EXTRAS = /^\[([A-Za-z0-9._-]+(?:\s*,\s*[A-Za-z0-9._-]+)*)\]/;
const VERSION_SPECIFIERS = /^(?:===|==|~=|!=|>=|<=|>|<)\s*[^\s,]+(?:\s*,\s*(?:===|==|~=|!=|>=|<=|>|<)\s*[^\s,]+)*$/;

export function normalizePythonPackageName(name) {
  return name.toLowerCase().replace(/[-_.]+/g, '-');
}

function stripInlineComment(line) {
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '#' && (index === 0 || /\s/.test(line[index - 1]))) {
      return line.slice(0, index).trim();
    }
  }
  return line.trim();
}

function packageNameFromEgg(reference) {
  const encoded = reference.match(/[#&]egg=([^&\s]+)/i)?.[1];
  if (!encoded) return undefined;
  let egg;
  try {
    egg = decodeURIComponent(encoded);
  } catch {
    egg = encoded;
  }
  return egg.match(PACKAGE_NAME)?.[0];
}

function isUnnamedReference(value) {
  return /^(?:[A-Za-z][A-Za-z0-9+.-]*:|git\+|\.\.?[/\\]|[/\\])/.test(value);
}

function dependency(name, declaredVersion, type, normalizeName = true) {
  return {
    name,
    normalizedName: normalizeName ? normalizePythonPackageName(name) : name,
    declaredVersion,
    type
  };
}

function parseNamedRequirement(value) {
  const nameMatch = value.match(PACKAGE_NAME);
  if (!nameMatch) return undefined;
  const name = nameMatch[0];
  let remainder = value.slice(name.length);

  if (remainder.startsWith('[')) {
    const extrasMatch = remainder.match(EXTRAS);
    if (!extrasMatch) return undefined;
    remainder = remainder.slice(extrasMatch[0].length);
  }

  remainder = remainder.trim();
  const markerIndex = remainder.indexOf(';');
  if (markerIndex >= 0) {
    const marker = remainder.slice(markerIndex + 1).trim();
    if (!marker) return undefined;
    remainder = remainder.slice(0, markerIndex).trim();
  }

  if (remainder.startsWith('@')) {
    const reference = remainder.slice(1).trim();
    return reference ? dependency(name, reference, 'directReference') : undefined;
  }
  if (!remainder || VERSION_SPECIFIERS.test(remainder)) {
    return dependency(name, remainder || null, 'runtime');
  }
  return undefined;
}

function parseRequirementLine(value) {
  if (/^(?:-r|--requirement)(?:\s+|=)(\S.*)$/.test(value)) return { kind: 'directive' };
  if (/^(?:-c|--constraint)(?:\s+|=)(\S.*)$/.test(value)) return { kind: 'directive' };
  if (/^(?:-r|--requirement|-c|--constraint)$/.test(value)) {
    return { kind: 'invalid', reason: 'include or constraint directive is missing a path' };
  }

  const editable = value.match(/^(?:-e|--editable)(?:\s+|=)(\S.*)$/);
  if (editable) {
    const target = editable[1];
    const named = packageNameFromEgg(target) ?? parseNamedRequirement(target)?.name;
    return {
      kind: 'dependency',
      dependency: dependency(named ?? target, target, 'editable', named !== undefined)
    };
  }
  if (/^(?:-e|--editable)$/.test(value)) {
    return { kind: 'invalid', reason: 'editable directive is missing a target' };
  }

  if (/^--(?:index-url|extra-index-url)(?:\s+|=)/.test(value)) return { kind: 'option' };
  if (/^--[A-Za-z0-9-]+(?:\s|=|$)/.test(value)) return { kind: 'option' };
  if (/^-[A-Za-z]/.test(value)) return { kind: 'option' };

  if (isUnnamedReference(value)) {
    const name = packageNameFromEgg(value);
    return {
      kind: 'dependency',
      dependency: dependency(name ?? value, value, 'directReference', name !== undefined)
    };
  }

  const parsed = parseNamedRequirement(value);
  return parsed
    ? { kind: 'dependency', dependency: parsed }
    : { kind: 'invalid', reason: 'unsupported or malformed requirement' };
}

export function parseRequirementsTxt(contents) {
  const dependencies = [];
  const issues = [];
  const lines = contents.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const value = stripInlineComment(lines[index]);
    if (!value) continue;
    const result = parseRequirementLine(value);
    if (result.kind === 'dependency') dependencies.push(result.dependency);
    else if (result.kind === 'invalid') issues.push({ line: index + 1, reason: result.reason });
  }

  const sortedDependencies = sortDependencies(dependencies);
  return {
    dependencies: sortedDependencies,
    dependencySummary: summarizeDependencies(sortedDependencies),
    duplicateNames: duplicateDependencyNames(sortedDependencies),
    issues
  };
}
