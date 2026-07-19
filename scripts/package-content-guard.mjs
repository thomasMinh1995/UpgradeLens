import { spawn } from 'node:child_process';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FORBIDDEN_CAPTURE_PREFIXES = Object.freeze([
  'package/docs/rr-02-cli-captures/',
  'package/docs/rr02-fix-01-cli-captures/',
  'package/docs/rr02-fix-02-cli-captures/',
  'package/docs/rr02-rerun-cli-captures/',
  'package/docs/rr02-fix-03-cli-captures/',
  'package/docs/rr02-fix-03a-cli-captures/'
]);

export const REQUIRED_PACKAGE_PATHS = Object.freeze([
  'package/LICENSE',
  'package/README.md',
  'package/bin/depverdict.js',
  'package/bin/upgradelens.js',
  'package/docs/architecture-overview.md',
  'package/docs/decisions/diff-02-identity-compatibility-contract.md',
  'package/docs/decisions/diff-03-repository-docs-community-migration.md',
  'package/docs/IA-04-CLI-Orchestration.md',
  'package/docs/cli-progress.md',
  'package/docs/migrations/upgradelens-to-depverdict.md',
  'package/docs/migration-planning-qualification-resolution.md',
  'package/docs/package-content-policy.md',
  'package/docs/releases/v0.6.0-alpha.1-depverdict-preview.md',
  'package/docs/reviews/diff-02-identity-contract-compatibility.md',
  'package/docs/reviews/diff-03-repository-docs-community-migration.md',
  'package/eval/migration-planning/golden-dataset-v2.json',
  'package/eval/migration-planning/golden-dataset.json',
  'package/package.json',
  'package/schemas/migration-checklist.schema.json',
  'package/schemas/migration-checklist-extractive-candidate.schema.json',
  'package/schemas/migration-planning-qualification-record.schema.json',
  'package/schemas/upgrade-decision.schema.json',
  'package/src/artifact-root-compatibility.js',
  'package/src/cli.js',
  'package/src/environment-compatibility.js',
  'package/src/index.js',
  'package/src/migration-checklist/verification.js',
  'package/src/orchestration/progress-events.js',
  'package/src/product-completion.js',
  'package/src/target-selector.js'
]);

export const PROTECTED_PACKAGE_PREFIXES = Object.freeze([
  'package/bin/',
  'package/eval/datasets/',
  'package/eval/migration-planning/',
  'package/eval/schemas/',
  'package/schemas/',
  'package/src/'
]);

export const PACKAGE_GUARD_REASON_CODES = Object.freeze({
  DUPLICATE_NORMALIZED_PACKAGE_ENTRY: 'DUPLICATE_NORMALIZED_PACKAGE_ENTRY',
  FORBIDDEN_CAPTURE_EVIDENCE: 'FORBIDDEN_CAPTURE_EVIDENCE',
  FORBIDDEN_CREDENTIAL_FILE: 'FORBIDDEN_CREDENTIAL_FILE',
  FORBIDDEN_ENV_FILE: 'FORBIDDEN_ENV_FILE',
  FORBIDDEN_LOCAL_ARTIFACT: 'FORBIDDEN_LOCAL_ARTIFACT',
  FORBIDDEN_QUALIFICATION_ARTIFACT: 'FORBIDDEN_QUALIFICATION_ARTIFACT',
  INVALID_PACKAGE_ENTRY_PATH: 'INVALID_PACKAGE_ENTRY_PATH',
  MISSING_REQUIRED_PACKAGE_ASSET: 'MISSING_REQUIRED_PACKAGE_ASSET',
  SUSPICIOUS_BACKUP_SUFFIX: 'SUSPICIOUS_BACKUP_SUFFIX',
  SUSPICIOUS_COPY_NAME: 'SUSPICIOUS_COPY_NAME',
  SUSPICIOUS_NUMERIC_COPY_SUFFIX: 'SUSPICIOUS_NUMERIC_COPY_SUFFIX',
  SUSPICIOUS_PARENTHESIZED_COPY_SUFFIX: 'SUSPICIOUS_PARENTHESIZED_COPY_SUFFIX',
  UNEXPECTED_PACKAGED_UNTRACKED_IMPLEMENTATION_FILE:
    'UNEXPECTED_PACKAGED_UNTRACKED_IMPLEMENTATION_FILE'
});

const CAPTURE_DIRECTORY_PATTERN = /^package\/docs\/[^/]*-cli-captures(?:\/|$)/i;
const CAPTURE_HELPER_PATTERN =
  /^package\/(?:scripts|tools)\/(?=[^/]*(?:rr|cli))(?=[^/]*capture)[^/]*\.(?:[cm]?js|py|sh)$/i;
const ENV_FILE_PATTERN = /(?:^|\/)\.env(?:\.[^/]*)?$/i;
const CREDENTIAL_FILE_PATTERN =
  /(?:^|\/)(?:credentials?|authorization|auth-token|access-token)(?:\.[^/]*)?$/i;
const LOCAL_ARTIFACT_PATTERN =
  /(?:^|\/)(?:\.DS_Store|\.git|node_modules)(?:\/|$)|\.(?:tgz|tar|tar\.gz)$/i;
const QUALIFICATION_ARTIFACT_PATTERN =
  /(?:^|\/)(?:migration-planning-)?qualification(?:-input|-record)?\.json$/i;
const RUNTIME_OUTPUT_PATTERN = /(?:^|\/)\.(?:depverdict|upgradelens)(?:\/|$)/i;
const NUMERIC_COPY_PATTERN = / \d+(?=\.[^.]+(?:\.[^.]+)*$)/u;
const PARENTHESIZED_COPY_PATTERN = / \(\d+\)(?=\.[^.]+(?:\.[^.]+)*$)/u;
const COPY_NAME_PATTERN = /(?:[ _-])(?:copy|duplicate)(?=\.[^.]+(?:\.[^.]+)*$)/iu;
const BACKUP_SUFFIX_PATTERN = /(?:~|\.(?:bak|orig|save|tmp|swp|swo))$/iu;
const MAX_REPORTED_PATHS_PER_REASON = 10;

export class PackageContentGuardError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'PackageContentGuardError';
    this.code = 'PACKAGE_CONTENT_GUARD_FAILED';
    this.details = details;
  }
}

function compareText(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareViolation(left, right) {
  return compareText(left.code, right.code)
    || compareText(left.path, right.path)
    || compareText(left.detail ?? '', right.detail ?? '');
}

export function normalizeTarPath(value) {
  const portable = String(value).replaceAll('\\', '/').replace(/^\.\/+/, '');
  return path.posix.normalize(`/${portable}`).slice(1).replace(/\/+$/, '');
}

export function stablePackagePaths(values) {
  return [...new Set(values.map(normalizeTarPath).filter(Boolean))].sort(compareText);
}

function invalidPathReason(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    return 'entry is empty, non-text, or contains a NUL byte';
  }
  const portable = value.replaceAll('\\', '/');
  if (portable.startsWith('/') || portable.startsWith('//') || /^[a-z]:\//iu.test(portable)) {
    return 'entry is absolute';
  }
  const withoutLeadingDot = portable.replace(/^\.\/+/, '');
  const segments = withoutLeadingDot.split('/');
  if (segments.includes('..')) return 'entry contains parent traversal';
  if (segments.some((segment) => segment === '' || segment === '.')) {
    return 'entry contains an empty or dot segment';
  }
  if (!withoutLeadingDot.startsWith('package/')) return 'entry is outside the package root';
  const normalized = normalizeTarPath(value);
  if (!normalized || normalized === 'package') return 'entry does not name a package file';
  return null;
}

function invalidPathLabel(reason) {
  if (reason === 'entry is absolute') return '<absolute-package-entry>';
  if (reason === 'entry contains parent traversal') return '<traversal-package-entry>';
  if (reason === 'entry is outside the package root') return '<outside-package-entry>';
  return '<invalid-package-entry>';
}

export function isProtectedPackagePath(value) {
  const packagePath = normalizeTarPath(value);
  return PROTECTED_PACKAGE_PREFIXES.some((prefix) => packagePath.startsWith(prefix));
}

export function isForbiddenPackagePath(value) {
  const packagePath = normalizeTarPath(value);
  return CAPTURE_DIRECTORY_PATTERN.test(packagePath)
    || CAPTURE_HELPER_PATTERN.test(packagePath);
}

export function forbiddenPackageReason(value) {
  const packagePath = normalizeTarPath(value);
  if (isForbiddenPackagePath(packagePath)) {
    return PACKAGE_GUARD_REASON_CODES.FORBIDDEN_CAPTURE_EVIDENCE;
  }
  if (ENV_FILE_PATTERN.test(packagePath)) {
    return PACKAGE_GUARD_REASON_CODES.FORBIDDEN_ENV_FILE;
  }
  if (CREDENTIAL_FILE_PATTERN.test(packagePath)) {
    return PACKAGE_GUARD_REASON_CODES.FORBIDDEN_CREDENTIAL_FILE;
  }
  if (LOCAL_ARTIFACT_PATTERN.test(packagePath)) {
    return PACKAGE_GUARD_REASON_CODES.FORBIDDEN_LOCAL_ARTIFACT;
  }
  if (!packagePath.includes('/schemas/')
      && QUALIFICATION_ARTIFACT_PATTERN.test(packagePath)) {
    return PACKAGE_GUARD_REASON_CODES.FORBIDDEN_QUALIFICATION_ARTIFACT;
  }
  if (RUNTIME_OUTPUT_PATTERN.test(packagePath)) {
    return PACKAGE_GUARD_REASON_CODES.FORBIDDEN_LOCAL_ARTIFACT;
  }
  return null;
}

export function suspiciousPackageFilenameReason(value) {
  const packagePath = normalizeTarPath(value);
  if (!isProtectedPackagePath(packagePath)) return null;
  const basename = path.posix.basename(packagePath);
  if (PARENTHESIZED_COPY_PATTERN.test(basename)) {
    return PACKAGE_GUARD_REASON_CODES.SUSPICIOUS_PARENTHESIZED_COPY_SUFFIX;
  }
  if (NUMERIC_COPY_PATTERN.test(basename)) {
    return PACKAGE_GUARD_REASON_CODES.SUSPICIOUS_NUMERIC_COPY_SUFFIX;
  }
  if (COPY_NAME_PATTERN.test(basename)) {
    return PACKAGE_GUARD_REASON_CODES.SUSPICIOUS_COPY_NAME;
  }
  if (BACKUP_SUFFIX_PATTERN.test(basename)) {
    return PACKAGE_GUARD_REASON_CODES.SUSPICIOUS_BACKUP_SUFFIX;
  }
  return null;
}

function tarText(buffer, start, length) {
  const end = buffer.indexOf(0, start);
  const boundedEnd = end === -1 || end > start + length ? start + length : end;
  return buffer.subarray(start, boundedEnd).toString('utf8').trim();
}

function tarSize(buffer, offset) {
  const value = tarText(buffer, offset + 124, 12).replace(/\0/g, '').trim();
  if (value.length === 0) return 0;
  const parsed = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new PackageContentGuardError('npm tarball contains an invalid entry size.', {
      violations: []
    });
  }
  return parsed;
}

export function readTarGzipEntries(bytes) {
  const archive = gunzipSync(bytes);
  const entries = [];
  for (let offset = 0; offset + 512 <= archive.length;) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = tarText(header, 0, 100);
    const prefix = tarText(header, 345, 155);
    const entryPath = prefix ? `${prefix}/${name}` : name;
    if (entryPath) entries.push(entryPath);
    const size = tarSize(archive, offset);
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries.sort(compareText);
}

function violation(code, packagePath, detail) {
  return Object.freeze({
    code,
    path: packagePath,
    ...(detail ? { detail } : {})
  });
}

function normalizeGitState(gitState) {
  if (!gitState || gitState.status === 'unavailable') {
    return Object.freeze({
      status: 'unavailable',
      reason: gitState?.reason ?? 'GIT_METADATA_UNAVAILABLE',
      trackedPaths: new Set(),
      untrackedPaths: new Set()
    });
  }
  return Object.freeze({
    status: 'available',
    reason: null,
    trackedPaths: new Set(gitState.trackedPaths ?? []),
    untrackedPaths: new Set(gitState.untrackedPaths ?? [])
  });
}

export function validatePackageEntries(entries, {
  requiredPaths = REQUIRED_PACKAGE_PATHS,
  gitState = { status: 'unavailable', reason: 'GIT_METADATA_UNAVAILABLE' },
  strictUntracked = true
} = {}) {
  const violations = [];
  const normalizedEntries = [];
  for (const entry of entries) {
    const reason = invalidPathReason(entry);
    if (reason) {
      violations.push(violation(
        PACKAGE_GUARD_REASON_CODES.INVALID_PACKAGE_ENTRY_PATH,
        invalidPathLabel(reason),
        reason
      ));
      continue;
    }
    normalizedEntries.push(normalizeTarPath(entry));
  }
  normalizedEntries.sort(compareText);

  for (let index = 1; index < normalizedEntries.length; index += 1) {
    if (normalizedEntries[index] === normalizedEntries[index - 1]) {
      violations.push(violation(
        PACKAGE_GUARD_REASON_CODES.DUPLICATE_NORMALIZED_PACKAGE_ENTRY,
        normalizedEntries[index]
      ));
    }
  }

  const normalized = [...new Set(normalizedEntries)];
  const available = new Set(normalized);
  const normalizedRequired = stablePackagePaths(requiredPaths);
  const normalizedGit = normalizeGitState(gitState);
  const forbidden = [];
  const missing = [];

  for (const packagePath of normalized) {
    const forbiddenReason = forbiddenPackageReason(packagePath);
    if (forbiddenReason) {
      forbidden.push(packagePath);
      violations.push(violation(forbiddenReason, packagePath));
    }
    const suspiciousReason = suspiciousPackageFilenameReason(packagePath);
    if (suspiciousReason) violations.push(violation(suspiciousReason, packagePath));

    if (strictUntracked && normalizedGit.status === 'available'
        && isProtectedPackagePath(packagePath)) {
      const repositoryPath = packagePath.slice('package/'.length);
      if (
        !normalizedGit.trackedPaths.has(repositoryPath)
        && !normalizedRequired.includes(packagePath)
      ) {
        violations.push(violation(
          PACKAGE_GUARD_REASON_CODES.UNEXPECTED_PACKAGED_UNTRACKED_IMPLEMENTATION_FILE,
          packagePath
        ));
      }
    }
  }

  for (const requiredPath of normalizedRequired) {
    if (!available.has(requiredPath)) {
      missing.push(requiredPath);
      violations.push(violation(
        PACKAGE_GUARD_REASON_CODES.MISSING_REQUIRED_PACKAGE_ASSET,
        requiredPath
      ));
    }
  }

  violations.sort(compareViolation);
  const suspiciousArtifactCodes = new Set([
    PACKAGE_GUARD_REASON_CODES.SUSPICIOUS_BACKUP_SUFFIX,
    PACKAGE_GUARD_REASON_CODES.SUSPICIOUS_COPY_NAME,
    PACKAGE_GUARD_REASON_CODES.SUSPICIOUS_NUMERIC_COPY_SUFFIX,
    PACKAGE_GUARD_REASON_CODES.SUSPICIOUS_PARENTHESIZED_COPY_SUFFIX
  ]);
  const result = {
    status: violations.length === 0 ? 'pass' : 'fail',
    entries: Object.freeze(normalized),
    forbidden: Object.freeze(forbidden.sort(compareText)),
    missing: Object.freeze(missing.sort(compareText)),
    git: Object.freeze({
      status: normalizedGit.status,
      reason: normalizedGit.reason
    }),
    summary: Object.freeze({
      packageFileCount: normalizedEntries.length,
      requiredAssetCount: normalizedRequired.length,
      violationCount: violations.length,
      suspiciousArtifactCount: violations.filter(
        (item) => suspiciousArtifactCodes.has(item.code)
      ).length
    }),
    violations: Object.freeze(violations)
  };
  return Object.freeze(result);
}

function boundedViolationPaths(values) {
  const shown = values.slice(0, MAX_REPORTED_PATHS_PER_REASON)
    .map((item) => `- ${item.path}`);
  if (values.length > MAX_REPORTED_PATHS_PER_REASON) {
    shown.push(`- ... and ${values.length - MAX_REPORTED_PATHS_PER_REASON} more`);
  }
  return shown.join('\n');
}

export function renderPackageGuardFailure(result) {
  const groups = new Map();
  for (const item of result.violations) {
    const existing = groups.get(item.code) ?? [];
    existing.push(item);
    groups.set(item.code, existing);
  }
  const sections = ['Package guard failed.'];
  for (const code of [...groups.keys()].sort(compareText)) {
    const items = groups.get(code).sort(compareViolation);
    sections.push(`${code} (${items.length})`, boundedViolationPaths(items));
  }
  return `${sections.join('\n\n')}\n`;
}

export function assertPackageEntries(entries, options) {
  const result = validatePackageEntries(entries, options);
  if (result.status === 'pass') return result;
  throw new PackageContentGuardError(
    renderPackageGuardFailure(result).trimEnd(),
    result
  );
}

function runCapture(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      ...options,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8')
      });
    });
  });
}

async function runChecked(command, args, options) {
  const result = await runCapture(command, args, options);
  if (result.code === 0) return result;
  const detail = result.stderr.trim().split('\n').slice(-3).join(' ');
  throw new Error(
    `${command} exited with code ${result.code ?? 'null'} (${result.signal ?? 'no signal'}).`
    + (detail ? ` ${detail}` : '')
  );
}

function nulPaths(value) {
  return value.split('\0').filter(Boolean).map((item) => normalizeTarPath(item));
}

export async function resolveGitPackageState({
  repositoryRoot,
  gitCommand = 'git'
}) {
  let probe;
  try {
    probe = await runCapture(gitCommand, ['rev-parse', '--is-inside-work-tree'], {
      cwd: repositoryRoot
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return Object.freeze({
        status: 'unavailable',
        reason: 'GIT_COMMAND_UNAVAILABLE',
        trackedPaths: Object.freeze([]),
        untrackedPaths: Object.freeze([])
      });
    }
    throw error;
  }
  if (probe.code !== 0 || probe.stdout.trim() !== 'true') {
    const expectedAbsence = /not a git repository/iu.test(probe.stderr);
    if (!expectedAbsence && probe.code !== 0) {
      throw new Error(`git metadata probe failed with code ${probe.code}.`);
    }
    return Object.freeze({
      status: 'unavailable',
      reason: 'GIT_METADATA_UNAVAILABLE',
      trackedPaths: Object.freeze([]),
      untrackedPaths: Object.freeze([])
    });
  }

  const [tracked, untracked] = await Promise.all([
    runChecked(gitCommand, ['ls-files', '-z'], { cwd: repositoryRoot }),
    runChecked(gitCommand, ['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: repositoryRoot
    })
  ]);
  return Object.freeze({
    status: 'available',
    reason: null,
    trackedPaths: Object.freeze(nulPaths(tracked.stdout).sort(compareText)),
    untrackedPaths: Object.freeze(nulPaths(untracked.stdout).sort(compareText))
  });
}

export async function inspectNpmPackage({
  repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url))),
  npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm',
  gitCommand = 'git',
  temporaryRoot,
  strictUntracked = true,
  requiredPaths = REQUIRED_PACKAGE_PATHS
} = {}) {
  const workRoot = temporaryRoot
    ?? await mkdtemp(path.join(os.tmpdir(), 'upgradelens-package-content-'));
  const packRoot = path.join(workRoot, 'pack');
  const cacheRoot = path.join(workRoot, 'npm-cache');
  try {
    await mkdir(packRoot, { recursive: true });
    const [packResult, gitState] = await Promise.all([
      runChecked(npmCommand, [
        'pack',
        '--json',
        '--ignore-scripts',
        '--pack-destination',
        packRoot
      ], {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          npm_config_cache: cacheRoot
        }
      }),
      resolveGitPackageState({ repositoryRoot, gitCommand })
    ]);
    let metadata;
    try {
      metadata = JSON.parse(packResult.stdout)?.[0];
    } catch {
      throw new Error('npm pack did not return valid JSON metadata.');
    }
    if (!metadata?.filename) throw new Error('npm pack metadata did not contain a filename.');
    const tarball = await readFile(path.join(packRoot, metadata.filename));
    const entries = readTarGzipEntries(tarball);
    const validation = assertPackageEntries(entries, {
      gitState,
      strictUntracked,
      requiredPaths
    });
    return Object.freeze({
      name: metadata.name,
      version: metadata.version,
      filename: metadata.filename,
      size: metadata.size,
      unpackedSize: metadata.unpackedSize,
      shasum: metadata.shasum,
      integrity: metadata.integrity,
      entryCount: entries.length,
      validation
    });
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

export async function runPackageGuardCli({
  inspect = inspectNpmPackage,
  stdout = process.stdout,
  stderr = process.stderr
} = {}) {
  try {
    const result = await inspect();
    stdout.write(
      `Package guard passed: ${result.name}@${result.version}, `
      + `${result.entryCount} files, 0 suspicious artifacts, `
      + `${REQUIRED_PACKAGE_PATHS.length} required assets present.\n`
    );
    return 0;
  } catch (error) {
    stderr.write(`${error.message}\n`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = await runPackageGuardCli();
}
