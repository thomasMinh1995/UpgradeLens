import { compareText } from './portable.js';

export class EcosystemVersionError extends Error {
  constructor(message, code = 'VERSION_UNSUPPORTED') {
    super(message);
    this.name = 'EcosystemVersionError';
    this.code = code;
  }
}

function ok(value) {
  return { ok: true, value };
}

function fail(reason) {
  return { ok: false, reason };
}

function trim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function compareNumericParts(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index] ?? 0;
    const rightPart = right[index] ?? 0;
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parseSemver(value) {
  const match = SEMVER_RE.exec(trim(value));
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ?? null
  };
}

function normalizeSemver(value) {
  const parsed = parseSemver(value);
  if (!parsed) return null;
  const base = `${parsed.major}.${parsed.minor}.${parsed.patch}`;
  return parsed.prerelease ? `${base}-${parsed.prerelease}` : base;
}

function comparePrerelease(left, right) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const leftParts = left.split('.');
  const rightParts = right.split('.');
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric && Number(leftPart) !== Number(rightPart)) {
      return Number(leftPart) < Number(rightPart) ? -1 : 1;
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    const text = compareText(leftPart, rightPart);
    if (text !== 0) return text;
  }
  return 0;
}

function compareSemver(left, right) {
  const parsedLeft = parseSemver(left);
  const parsedRight = parseSemver(right);
  if (!parsedLeft || !parsedRight) return null;
  const numeric = compareNumericParts(
    [parsedLeft.major, parsedLeft.minor, parsedLeft.patch],
    [parsedRight.major, parsedRight.minor, parsedRight.patch]
  );
  if (numeric !== 0) return numeric;
  return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
}

function semverClassification(current, target) {
  const left = parseSemver(current);
  const right = parseSemver(target);
  if (!left || !right) return 'unknown';
  if (left.major !== right.major) return 'major';
  if (left.minor !== right.minor) return 'minor';
  if (left.patch !== right.patch) return 'patch';
  if (left.prerelease !== right.prerelease) return 'prerelease';
  return 'other';
}

function isSemverConstraint(value) {
  const text = trim(value);
  if (!text) return false;
  if (/^(?:workspace:|file:|link:|npm:|git\+|git:|https?:|ssh:|github:|gitlab:|bitbucket:)/i.test(text)) {
    return false;
  }
  return /(?:[\s,|]|[~^<>=*xX])/.test(text) && /\d|[*xX]/.test(text);
}

function compareReleaseVersions(adapter, left, right) {
  const compared = adapter.compareVersionOrder(left.version, right.version);
  return compared === 0 ? compareText(left.version ?? left.tag ?? '', right.version ?? right.tag ?? '') : compared;
}

function versionedReleases(releases, adapter) {
  return releases
    .filter((release) => typeof release.version === 'string' && adapter.normalizeVersion(release.version).ok)
    .map((release) => ({ ...release, version: adapter.normalizeVersion(release.version).value }));
}

function selectExactReleases(releases, adapter, current, target) {
  const direction = adapter.compareVersions(current, target).direction;
  const normalizedCurrent = adapter.normalizeVersion(current).value;
  const normalizedTarget = adapter.normalizeVersion(target).value;
  return versionedReleases(releases, adapter)
    .filter((release) => {
      const afterCurrent = adapter.compareVersionOrder(release.version, normalizedCurrent);
      const beforeTarget = adapter.compareVersionOrder(release.version, normalizedTarget);
      if (direction === 'upgrade') return afterCurrent > 0 && beforeTarget <= 0;
      if (direction === 'downgrade') return afterCurrent < 0 && beforeTarget >= 0;
      return beforeTarget === 0;
    })
    .sort((left, right) => compareReleaseVersions(adapter, left, right));
}

function selectTargetRelease(releases, adapter, target) {
  const normalizedTarget = adapter.normalizeVersion(target).value;
  return versionedReleases(releases, adapter)
    .filter((release) => adapter.compareVersionOrder(release.version, normalizedTarget) === 0)
    .sort((left, right) => compareReleaseVersions(adapter, left, right));
}

function createNodeSemverAdapter() {
  return {
    ecosystem: 'node',
    registries: ['npm'],
    normalizeVersion(value) {
      const normalized = normalizeSemver(value);
      return normalized ? ok(normalized) : fail('invalid-semver');
    },
    resolveDeclaredBaseline(declaredVersion) {
      const value = trim(declaredVersion);
      if (!value) return { kind: 'unsupported', reason: 'missing-declared-version' };
      const exact = value.startsWith('=') ? value.slice(1).trim() : value;
      const normalized = normalizeSemver(exact);
      if (normalized) return { kind: 'exactVersion', version: normalized };
      if (isSemverConstraint(value)) return { kind: 'declaredConstraint', constraint: value };
      return { kind: 'unsupported', reason: 'unsupported-semver-declaration' };
    },
    targetSatisfiesDeclaration(declaredVersion, target) {
      const baseline = this.resolveDeclaredBaseline(declaredVersion);
      const normalizedTarget = this.normalizeVersion(target);
      if (!normalizedTarget.ok) return 'unknown';
      if (baseline.kind === 'exactVersion') return baseline.version === normalizedTarget.value ? 'yes' : 'no';
      if (baseline.kind !== 'declaredConstraint') return 'unknown';
      const text = baseline.constraint.trim();
      const caret = /^\^(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(text);
      if (caret) {
        const parsed = parseSemver(normalizedTarget.value);
        return parsed && parsed.major === Number(caret[1]) ? 'yes' : 'no';
      }
      return 'unknown';
    },
    compareVersionOrder(left, right) {
      const result = compareSemver(left, right);
      if (result === null) throw new EcosystemVersionError('Cannot compare invalid SemVer values.');
      return result;
    },
    compareVersions(current, target) {
      const result = compareSemver(current, target);
      if (result === null) return { direction: 'unknown', classification: 'unknown' };
      return {
        direction: result < 0 ? 'upgrade' : result > 0 ? 'downgrade' : 'same',
        classification: result === 0 ? 'other' : semverClassification(current, target)
      };
    },
    selectRelevantReleases(releases, input) {
      if (input.mode === 'declaredConstraint') return selectTargetRelease(releases, this, input.target);
      return selectExactReleases(releases, this, input.current, input.target);
    }
  };
}

const PEP440_RE = /^v?(\d+(?:\.\d+)*)(?:(a|b|rc)(\d+))?$/i;

function parsePep440(value) {
  const match = PEP440_RE.exec(trim(value));
  if (!match) return null;
  return {
    release: match[1].split('.').map((part) => Number(part)),
    prerelease: match[2] ? `${match[2].toLowerCase()}${Number(match[3])}` : null
  };
}

function normalizePep440(value) {
  const parsed = parsePep440(value);
  if (!parsed) return null;
  const release = parsed.release.join('.');
  return parsed.prerelease ? `${release}${parsed.prerelease}` : release;
}

function comparePep440(left, right) {
  const parsedLeft = parsePep440(left);
  const parsedRight = parsePep440(right);
  if (!parsedLeft || !parsedRight) return null;
  const release = compareNumericParts(parsedLeft.release, parsedRight.release);
  if (release !== 0) return release;
  return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
}

function pep440Classification(current, target) {
  const left = parsePep440(current);
  const right = parsePep440(target);
  if (!left || !right) return 'unknown';
  const leftParts = [left.release[0] ?? 0, left.release[1] ?? 0, left.release[2] ?? 0];
  const rightParts = [right.release[0] ?? 0, right.release[1] ?? 0, right.release[2] ?? 0];
  if (leftParts[0] !== rightParts[0]) return 'major';
  if (leftParts[1] !== rightParts[1]) return 'minor';
  if (leftParts[2] !== rightParts[2]) return 'patch';
  if (left.prerelease !== right.prerelease) return 'prerelease';
  return 'other';
}

function isPep440Constraint(value) {
  const text = trim(value);
  return /^(?:~=|==|!=|<=|>=|<|>)/.test(text) || text.includes(',');
}

function createPythonPep440Adapter() {
  return {
    ecosystem: 'python',
    registries: ['pypi'],
    normalizeVersion(value) {
      const normalized = normalizePep440(value);
      return normalized ? ok(normalized) : fail('invalid-pep440-version');
    },
    resolveDeclaredBaseline(declaredVersion) {
      const value = trim(declaredVersion);
      if (!value) return { kind: 'unsupported', reason: 'missing-declared-version' };
      const exactMatch = /^==\s*(.+)$/.exec(value);
      const exact = exactMatch ? exactMatch[1].trim() : value;
      const normalized = normalizePep440(exact);
      if (normalized) return { kind: 'exactVersion', version: normalized };
      if (isPep440Constraint(value)) return { kind: 'declaredConstraint', constraint: value };
      return { kind: 'unsupported', reason: 'unsupported-pep440-declaration' };
    },
    targetSatisfiesDeclaration(declaredVersion, target) {
      const baseline = this.resolveDeclaredBaseline(declaredVersion);
      const normalizedTarget = this.normalizeVersion(target);
      if (!normalizedTarget.ok) return 'unknown';
      if (baseline.kind === 'exactVersion') return baseline.version === normalizedTarget.value ? 'yes' : 'no';
      return 'unknown';
    },
    compareVersionOrder(left, right) {
      const result = comparePep440(left, right);
      if (result === null) throw new EcosystemVersionError('Cannot compare invalid PEP 440 values.');
      return result;
    },
    compareVersions(current, target) {
      const result = comparePep440(current, target);
      if (result === null) return { direction: 'unknown', classification: 'unknown' };
      return {
        direction: result < 0 ? 'upgrade' : result > 0 ? 'downgrade' : 'same',
        classification: result === 0 ? 'other' : pep440Classification(current, target)
      };
    },
    selectRelevantReleases(releases, input) {
      if (input.mode === 'declaredConstraint') return selectTargetRelease(releases, this, input.target);
      return selectExactReleases(releases, this, input.current, input.target);
    }
  };
}

export function createDefaultEcosystemVersionAdapterRegistry() {
  return new Map([
    ['node', createNodeSemverAdapter()],
    ['python', createPythonPep440Adapter()]
  ]);
}

export function getEcosystemVersionAdapter(ecosystem, registry = createDefaultEcosystemVersionAdapterRegistry()) {
  const adapter = registry.get(ecosystem);
  if (!adapter) throw new EcosystemVersionError(`Unsupported ecosystem ${ecosystem}.`, 'UNSUPPORTED_ECOSYSTEM');
  return adapter;
}
