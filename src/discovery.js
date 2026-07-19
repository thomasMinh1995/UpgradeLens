import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  MANIFEST_SCHEMA_VERSION,
  ARTIFACT_GENERATOR_NAME,
  VERSION
} from './constants.js';
import { createCooperativeScheduler } from './cooperative-scheduler.js';
import { definitionForFile, inspectProjectGroup } from './detectors.js';
import { collectCandidateFiles, relativePath } from './files.js';
import { attachInstalledVersionBaselines } from './installed-version-baseline.js';

async function assertDirectory(inputPath) {
  const absolutePath = path.resolve(inputPath);
  let details;
  try {
    details = await stat(absolutePath);
  } catch (error) {
    throw new Error(`Cannot access project root "${inputPath}": ${error.message}`);
  }
  if (!details.isDirectory()) throw new Error(`Project root is not a directory: ${inputPath}`);
  return realpath(absolutePath);
}

async function directoryEntryNames(directory) {
  try {
    return new Set(await readdir(directory));
  } catch {
    return new Set();
  }
}

function groupCandidateFiles(files) {
  const groups = new Map();
  for (const file of files) {
    const definition = definitionForFile(file);
    if (!definition) continue;
    const directory = path.dirname(file);
    const key = `${definition.ecosystem}\0${directory}`;
    if (!groups.has(key)) groups.set(key, { definition, directory, files: [] });
    groups.get(key).files.push(file);
  }
  return [...groups.values()].map((group) => ({ ...group, files: group.files.sort() }));
}

function globToRegExp(pattern) {
  const normalized = pattern.replace(/^\.\//, '').replace(/\/$/, '');
  let expression = '^';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '*' && normalized[index + 1] === '*') {
      expression += '.*';
      index += 1;
    } else if (character === '*') expression += '[^/]*';
    else if (character === '?') expression += '[^/]';
    else expression += character.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
  }
  return new RegExp(`${expression}$`);
}

function matchesWorkspace(patterns, projectPath) {
  const positive = patterns.filter((pattern) => !pattern.startsWith('!'));
  const negative = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => pattern.slice(1));
  return positive.some((pattern) => globToRegExp(pattern).test(projectPath))
    && !negative.some((pattern) => globToRegExp(pattern).test(projectPath));
}

function parsePnpmWorkspace(contents) {
  const patterns = [];
  let inPackages = false;
  for (const line of contents.split(/\r?\n/)) {
    if (/^packages:\s*(?:#.*)?$/.test(line)) {
      inPackages = true;
      continue;
    }
    if (inPackages && /^\S/.test(line)) break;
    if (!inPackages) continue;
    const pattern = line.match(/^\s*-\s*(['"]?)(.+?)\1\s*(?:#.*)?$/)?.[2]?.trim();
    if (pattern) patterns.push(pattern);
  }
  return patterns;
}

async function addPnpmWorkspacePatterns(root, files, projects, warnings, cooperativeScheduler) {
  for (const file of files.filter((candidate) => path.basename(candidate) === 'pnpm-workspace.yaml')) {
    try {
      const projectPath = relativePath(root, path.dirname(file));
      const project = projects.find((candidate) => candidate.ecosystem === 'node' && candidate.path === projectPath);
      if (!project) continue;
      try {
        const patterns = parsePnpmWorkspace(await readFile(file, 'utf8'));
        project._workspacePatterns = [...new Set([...project._workspacePatterns, ...patterns])];
      } catch (error) {
        warnings.push({
          code: 'MANIFEST_UNREADABLE',
          path: relativePath(root, file),
          message: `Unable to read workspace manifest (${error.code ?? 'unknown error'})`
        });
      }
    } finally {
      await cooperativeScheduler.boundary();
    }
  }
}

async function addWorkspaceRelationships(projects, cooperativeScheduler) {
  const roots = projects
    .filter((project) => project.ecosystem === 'node' && project._workspacePatterns.some((pattern) => !pattern.startsWith('!')))
    .sort((left, right) => right.path.length - left.path.length);

  for (const project of projects) {
    try {
      if (project.ecosystem !== 'node') continue;
      const workspaceRoot = roots.find((candidate) => {
        if (candidate.id === project.id) return false;
        const relative = path.posix.relative(candidate.path === '.' ? '' : candidate.path, project.path);
        return matchesWorkspace(candidate._workspacePatterns, relative);
      });
      if (workspaceRoot) {
        project.workspace = { root: workspaceRoot.path, role: 'member' };
        if (!project.packageManager && workspaceRoot.packageManager) {
          project.packageManager = { ...workspaceRoot.packageManager };
        }
      } else if (project._workspacePatterns.some((pattern) => !pattern.startsWith('!'))) {
        project.workspace = { root: project.path, role: 'root' };
      }
    } finally {
      await cooperativeScheduler.boundary();
    }
  }

  for (const project of projects) {
    delete project._workspacePatterns;
    await cooperativeScheduler.boundary();
  }
}

async function gitMetadata(root) {
  const gitPath = path.join(root, '.git');
  let gitDirectory = gitPath;
  try {
    const details = await stat(gitPath);
    if (details.isFile()) {
      const pointer = await readFile(gitPath, 'utf8');
      const target = pointer.match(/^gitdir:\s*(.+)$/m)?.[1];
      if (!target) return undefined;
      gitDirectory = path.resolve(root, target);
    }
    const head = (await readFile(path.join(gitDirectory, 'HEAD'), 'utf8')).trim();
    const branch = head.startsWith('ref: refs/heads/') ? head.slice('ref: refs/heads/'.length) : undefined;
    return { type: 'git', ...(branch ? { branch } : {}) };
  } catch {
    return undefined;
  }
}

function summarize(projects) {
  const ecosystems = {};
  for (const project of projects) ecosystems[project.ecosystem] = (ecosystems[project.ecosystem] ?? 0) + 1;
  return {
    projectCount: projects.length,
    ecosystems: Object.fromEntries(Object.entries(ecosystems).sort(([left], [right]) => left.localeCompare(right))),
    workspaceCount: projects.filter((project) => project.workspace?.role === 'root').length
  };
}

function warningFor(error, root, group) {
  const firstFile = group.files[0];
  const isSyntax = error instanceof SyntaxError;
  return {
    code: isSyntax ? 'MANIFEST_INVALID' : 'MANIFEST_UNREADABLE',
    path: relativePath(root, firstFile),
    message: isSyntax ? error.message : `Unable to read manifest (${error.code ?? 'unknown error'})`
  };
}

export async function discoverProject(inputPath = '.', options = {}) {
  const cooperativeScheduler = options.cooperativeScheduler ?? createCooperativeScheduler({
    signal: options.signal,
    enabled: options.cooperativeScheduling !== false,
    batchSize: options.cooperativeBatchSize,
    maxIntervalMs: options.cooperativeMaxIntervalMs,
    monotonicClock: options.monotonicClock
  });
  cooperativeScheduler.checkpoint();
  const root = await assertDirectory(inputPath);
  const { files, warnings } = await collectCandidateFiles(root, {
    maxDepth: options.maxDepth,
    cooperativeScheduler
  });
  const projects = [];

  for (const group of groupCandidateFiles(files)) {
    try {
      const entries = await directoryEntryNames(group.directory);
      const result = await inspectProjectGroup(root, group, entries);
      if (result) {
        projects.push(result.project);
        warnings.push(...result.warnings);
      }
    } catch (error) {
      warnings.push(warningFor(error, root, group));
    } finally {
      await cooperativeScheduler.boundary();
    }
  }

  projects.sort((left, right) => left.id.localeCompare(right.id));
  await addPnpmWorkspacePatterns(root, files, projects, warnings, cooperativeScheduler);
  await addWorkspaceRelationships(projects, cooperativeScheduler);
  await attachInstalledVersionBaselines(root, projects, {
    ...options,
    cooperativeScheduler
  });
  warnings.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code));

  cooperativeScheduler.checkpoint();
  const now = options.clock?.() ?? new Date();
  const vcs = await gitMetadata(root);
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    generator: { name: ARTIFACT_GENERATOR_NAME, version: VERSION },
    repository: {
      name: path.basename(root),
      root: '.',
      ...(vcs ? { vcs } : {})
    },
    summary: summarize(projects),
    projects,
    warnings
  };
}
