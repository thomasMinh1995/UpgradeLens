import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';

import { DEFAULT_MANIFEST_PATH, DEFAULT_VERSION_ANALYSIS_PATH } from '../constants.js';
import { createCooperativeScheduler } from '../cooperative-scheduler.js';
import { relativePath } from '../files.js';
import { createUsageAnalyzerRegistry } from './analyzer-registry.js';
import { loadUsageDiscoveryInputs } from './input-loader.js';
import { createJavaScriptUsageAnalyzer } from './js/analyzer.js';
import { createUsageDiscoveryScope } from './scope.js';
import { collectUsageSourceFiles } from './source-files.js';
import { buildUsageIndex } from './usage-index.js';

async function repositoryDirectory(inputPath) {
  const resolved = path.resolve(inputPath);
  let details;
  try {
    details = await stat(resolved);
  } catch (error) {
    throw new Error(`Cannot access repository root "${inputPath}": ${error.message}`);
  }
  if (!details.isDirectory()) throw new Error(`Repository root is not a directory: ${inputPath}`);
  return realpath(resolved);
}

function pathBelongsToProject(file, projectPath) {
  if (projectPath === '.') return true;
  return file === projectPath || file.startsWith(`${projectPath}/`);
}

function owningProject(file, scopes, registry) {
  const candidates = scopes.filter((scope) => (
    pathBelongsToProject(file, scope.projectPath) && registry.find(scope.ecosystem, file)
  ));
  return candidates.sort((left, right) => (
    right.projectPath.split('/').length - left.projectPath.split('/').length
    || left.projectId.localeCompare(right.projectId)
  ))[0] ?? null;
}

export function createDefaultUsageAnalyzerRegistry() {
  return createUsageAnalyzerRegistry([createJavaScriptUsageAnalyzer()]);
}

export async function discoverRepositoryUsage({
  repositoryRoot,
  projectManifest,
  versionAnalysis,
  input,
  registry = createDefaultUsageAnalyzerRegistry(),
  clock,
  maxDepth,
  signal,
  cooperativeScheduler: injectedCooperativeScheduler,
  cooperativeScheduling = true,
  cooperativeBatchSize,
  cooperativeMaxIntervalMs,
  monotonicClock
}) {
  const cooperativeScheduler = injectedCooperativeScheduler ?? createCooperativeScheduler({
    signal,
    enabled: cooperativeScheduling,
    batchSize: cooperativeBatchSize,
    maxIntervalMs: cooperativeMaxIntervalMs,
    monotonicClock
  });
  cooperativeScheduler.checkpoint();
  const root = await repositoryDirectory(repositoryRoot);
  const scopes = createUsageDiscoveryScope(projectManifest, versionAnalysis);
  const projectScopes = projectManifest.projects.map((project) => ({
    projectId: project.id,
    projectPath: project.path,
    ecosystem: project.ecosystem
  }));
  const dependenciesByProject = new Map();
  for (const scope of scopes) {
    if (!dependenciesByProject.has(scope.projectId)) dependenciesByProject.set(scope.projectId, []);
    dependenciesByProject.get(scope.projectId).push(scope);
    await cooperativeScheduler.boundary();
  }
  const collected = await collectUsageSourceFiles(root, registry.extensions(), {
    maxDepth,
    cooperativeScheduler
  });
  const warnings = [...collected.warnings];
  const usages = [];
  let scannedFileCount = 0;
  let analyzedFileCount = 0;

  for (const absoluteFile of collected.files) {
    try {
      const file = relativePath(root, absoluteFile);
      const project = owningProject(file, projectScopes, registry);
      if (!project) continue;
      if (!dependenciesByProject.has(project.projectId)) continue;
      const analyzer = registry.find(project.ecosystem, file);
      if (!analyzer) continue;
      scannedFileCount += 1;
      let source;
      try {
        source = await readFile(absoluteFile, 'utf8');
      } catch (error) {
        warnings.push({
          code: 'FILE_UNREADABLE',
          path: file,
          message: `Unable to read source file (${error.code ?? 'unknown error'}).`
        });
        continue;
      }
      try {
        const discovered = await analyzer.analyze({
          source,
          file,
          projectId: project.projectId,
          dependencies: dependenciesByProject.get(project.projectId) ?? []
        });
        usages.push(...discovered.map((usage) => ({ ...usage, projectId: project.projectId })));
        analyzedFileCount += 1;
      } catch (error) {
        warnings.push({
          code: error instanceof SyntaxError ? 'SOURCE_PARSE_FAILED' : 'ANALYZER_FAILED',
          path: file,
          message: error instanceof SyntaxError
            ? 'Unable to parse source file.'
            : `Analyzer failed (${error.code ?? error.name ?? 'unknown error'}).`
        });
      }
    } finally {
      await cooperativeScheduler.boundary();
    }
  }

  cooperativeScheduler.checkpoint();
  return buildUsageIndex({
    input,
    usages,
    scannedFileCount,
    analyzedFileCount,
    analyzers: registry.analyzers(),
    warnings,
    generatedAt: clock?.() ?? new Date()
  });
}

export async function runUsageDiscovery({ repositoryRoot = '.', sources, ...options } = {}) {
  const root = path.resolve(repositoryRoot);
  const effectiveSources = sources ?? {
    projectManifest: path.join(root, DEFAULT_MANIFEST_PATH),
    versionAnalysis: path.join(root, DEFAULT_VERSION_ANALYSIS_PATH)
  };
  const artifacts = await loadUsageDiscoveryInputs(effectiveSources, options);
  return discoverRepositoryUsage({ repositoryRoot, ...artifacts, ...options });
}
