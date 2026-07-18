import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  createDefaultEcosystemVersionAdapterRegistry,
  getEcosystemVersionAdapter
} from './ecosystem-version-adapter.js';
import { toPosixPath } from './files.js';

const SUPPORTED_NPM_LOCKFILE_VERSIONS = new Set([1, 2, 3]);
const NON_REGISTRY_DECLARATION =
  /^(?:workspace:|file:|link:|git\+|git:|https?:|ssh:|github:|gitlab:|bitbucket:|\.{1,2}[\\/]|[\\/]|~[\\/])/i;

function unresolved(reason) {
  return {
    installedVersion: null,
    installedVersionStatus: 'unresolved',
    installedVersionSource: null,
    installedVersionReason: reason
  };
}

function resolved(version, source) {
  return {
    installedVersion: version,
    installedVersionStatus: 'resolved',
    installedVersionSource: source,
    installedVersionReason: null
  };
}

function repositoryPath(...parts) {
  const joined = path.posix.join(...parts.filter((part) => part && part !== '.'));
  return joined || '.';
}

function lockfileRoots(project) {
  if (project.workspace?.role === 'member') return [project.workspace.root];
  return [project.path];
}

async function loadNpmLockfile(repositoryRoot, lockfileRoot, cache) {
  const portablePath = repositoryPath(lockfileRoot, 'package-lock.json');
  if (!cache.has(portablePath)) {
    cache.set(portablePath, (async () => {
      let bytes;
      try {
        bytes = await readFile(path.resolve(repositoryRoot, portablePath));
      } catch (error) {
        if (error?.code === 'ENOENT') return { status: 'missing', path: portablePath };
        return { status: 'invalid', path: portablePath };
      }

      let lockfile;
      try {
        lockfile = JSON.parse(bytes.toString('utf8'));
      } catch {
        return { status: 'invalid', path: portablePath };
      }

      const lockfileVersion = lockfile?.lockfileVersion;
      if (!Number.isInteger(lockfileVersion) || !SUPPORTED_NPM_LOCKFILE_VERSIONS.has(lockfileVersion)) {
        return { status: 'unsupported', path: portablePath, lockfileVersion };
      }
      if (lockfileVersion === 1) {
        if (!lockfile.dependencies || typeof lockfile.dependencies !== 'object' || Array.isArray(lockfile.dependencies)) {
          return { status: 'invalid', path: portablePath, lockfileVersion };
        }
      } else if (!lockfile.packages || typeof lockfile.packages !== 'object' || Array.isArray(lockfile.packages)) {
        return { status: 'invalid', path: portablePath, lockfileVersion };
      }
      return { status: 'loaded', path: portablePath, lockfileVersion, lockfile };
    })());
  }
  return cache.get(portablePath);
}

function lockfileRelativeProjectPath(project, lockfileRoot) {
  const root = lockfileRoot === '.' ? '' : lockfileRoot;
  const projectPath = project.path === '.' ? '' : project.path;
  return toPosixPath(path.posix.relative(root, projectPath));
}

function packageEntryCandidates(project, lockfileRoot, dependencyName) {
  const relativeProject = lockfileRelativeProjectPath(project, lockfileRoot);
  return [...new Set([
    repositoryPath(relativeProject, 'node_modules', dependencyName),
    repositoryPath('node_modules', dependencyName)
  ])];
}

function ambiguousWorkspaceResolution(lockfile, project, dependencyName, candidates) {
  if (project.workspace?.role !== 'member') return false;
  const expected = new Set(candidates);
  const suffix = `/node_modules/${dependencyName}`;
  const otherMatches = Object.keys(lockfile.packages)
    .filter((entryPath) => !expected.has(entryPath) && entryPath.endsWith(suffix));
  return otherMatches.length > 1;
}

function exactInstalledVersion(adapter, value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const normalized = adapter.normalizeVersion(value);
  return normalized.ok ? normalized.value : null;
}

function resolveFromV1(lockfileRecord, project, dependency, adapter, lockfileRoot) {
  if (project.path !== lockfileRoot || project.workspace?.role === 'member') {
    return unresolved('LOCKFILE_UNSUPPORTED');
  }
  const entry = lockfileRecord.lockfile.dependencies[dependency.name];
  if (!entry) return unresolved('PACKAGE_NOT_RESOLVED');
  const version = exactInstalledVersion(adapter, entry.version);
  if (version === null) return unresolved('RESOLVED_VERSION_UNAVAILABLE');
  return resolved(version, {
    type: 'package-lock',
    path: lockfileRecord.path,
    lockfileVersion: lockfileRecord.lockfileVersion,
    packagePath: repositoryPath(lockfileRoot, 'node_modules', dependency.name)
  });
}

function resolveFromPackages(lockfileRecord, project, dependency, adapter, lockfileRoot) {
  const candidates = packageEntryCandidates(project, lockfileRoot, dependency.name);
  for (const candidate of candidates) {
    const entry = lockfileRecord.lockfile.packages[candidate];
    if (!entry) continue;
    const version = exactInstalledVersion(adapter, entry.version);
    if (version === null) return unresolved('RESOLVED_VERSION_UNAVAILABLE');
    return resolved(version, {
      type: 'package-lock',
      path: lockfileRecord.path,
      lockfileVersion: lockfileRecord.lockfileVersion,
      packagePath: repositoryPath(lockfileRoot, candidate)
    });
  }
  if (ambiguousWorkspaceResolution(lockfileRecord.lockfile, project, dependency.name, candidates)) {
    return unresolved('WORKSPACE_RESOLUTION_AMBIGUOUS');
  }
  return unresolved('PACKAGE_NOT_RESOLVED');
}

async function resolveNpmDependency(repositoryRoot, project, dependency, adapter, cache) {
  if (NON_REGISTRY_DECLARATION.test(dependency.declaredVersion ?? '')) {
    return unresolved('NON_REGISTRY_DEPENDENCY');
  }

  for (const lockfileRoot of lockfileRoots(project)) {
    const lockfileRecord = await loadNpmLockfile(repositoryRoot, lockfileRoot, cache);
    if (lockfileRecord.status === 'missing') continue;
    if (lockfileRecord.status === 'invalid') return unresolved('INVALID_LOCKFILE');
    if (lockfileRecord.status === 'unsupported') return unresolved('LOCKFILE_UNSUPPORTED');
    if (lockfileRecord.lockfileVersion === 1) {
      return resolveFromV1(lockfileRecord, project, dependency, adapter, lockfileRoot);
    }
    return resolveFromPackages(lockfileRecord, project, dependency, adapter, lockfileRoot);
  }
  return unresolved('LOCKFILE_NOT_FOUND');
}

/**
 * Attach deterministic installed-version facts after project/workspace
 * ownership has been established. Dependency array identity and ordering are
 * preserved; only additive baseline fields are written.
 */
export async function attachInstalledVersionBaselines(repositoryRoot, projects, options = {}) {
  const registry = options.adapterRegistry ?? createDefaultEcosystemVersionAdapterRegistry();
  const npmAdapter = getEcosystemVersionAdapter('node', registry);
  const lockfileCache = new Map();
  const cooperativeScheduler = options.cooperativeScheduler;

  for (const project of projects) {
    for (const dependency of project.dependencies) {
      try {
        let baseline;
        if (project.ecosystem !== 'node') {
          baseline = unresolved('RESOLVED_VERSION_UNAVAILABLE');
        } else if (project.packageManager?.name && project.packageManager.name !== 'npm') {
          baseline = unresolved('LOCKFILE_UNSUPPORTED');
        } else {
          baseline = await resolveNpmDependency(
            repositoryRoot,
            project,
            dependency,
            npmAdapter,
            lockfileCache
          );
        }
        Object.assign(dependency, baseline);
      } finally {
        await cooperativeScheduler?.boundary();
      }
    }
  }
  return projects;
}
