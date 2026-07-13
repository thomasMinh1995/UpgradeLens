import path from 'node:path';

import {
  duplicateDependencyWarnings,
  sortDependencies,
  summarizeDependencies
} from './dependencies.js';
import { readJson, readText, relativePath } from './files.js';
import { parseRequirementsTxt } from './python-requirements.js';

const DEFINITIONS = [
  { ecosystem: 'node', languages: ['JavaScript', 'TypeScript'], names: ['package.json'] },
  { ecosystem: 'python', languages: ['Python'], names: ['pyproject.toml', 'requirements.txt'] },
  { ecosystem: 'java', languages: ['Java', 'Kotlin'], names: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'] },
  { ecosystem: 'dotnet', languages: ['C#', 'F#', 'Visual Basic'], extensions: ['.csproj', '.fsproj', '.vbproj', '.sln'] },
  { ecosystem: 'go', languages: ['Go'], names: ['go.mod'] },
  { ecosystem: 'rust', languages: ['Rust'], names: ['Cargo.toml'] },
  { ecosystem: 'ruby', languages: ['Ruby'], names: ['Gemfile'] },
  { ecosystem: 'php', languages: ['PHP'], names: ['composer.json'] },
  { ecosystem: 'al', languages: ['AL'], names: ['app.json'] }
];

export function definitionForFile(filePath) {
  const name = path.basename(filePath);
  return DEFINITIONS.find((definition) =>
    definition.names?.includes(name) || definition.extensions?.some((extension) => name.endsWith(extension))
  );
}

function firstMatch(text, expressions) {
  for (const expression of expressions) {
    const value = text.match(expression)?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function packageManagerFromNode(data, fileNames) {
  if (typeof data.packageManager === 'string') {
    const [name, ...versionParts] = data.packageManager.split('@');
    return { name, ...(versionParts.length ? { version: versionParts.join('@') } : {}) };
  }
  if (fileNames.has('pnpm-lock.yaml')) return { name: 'pnpm' };
  if (fileNames.has('yarn.lock')) return { name: 'yarn' };
  if (fileNames.has('bun.lock') || fileNames.has('bun.lockb')) return { name: 'bun' };
  if (fileNames.has('package-lock.json') || fileNames.has('npm-shrinkwrap.json')) return { name: 'npm' };
  return undefined;
}

const NODE_DEPENDENCY_SECTIONS = [
  ['dependencies', 'dependency'],
  ['devDependencies', 'devDependency'],
  ['peerDependencies', 'peerDependency'],
  ['optionalDependencies', 'optionalDependency']
];

function parseNodeDependencies(data, manifest) {
  const dependencies = [];
  const byType = {
    dependencies: 0,
    devDependencies: 0,
    peerDependencies: 0,
    optionalDependencies: 0
  };
  let invalid = false;

  for (const [section, type] of NODE_DEPENDENCY_SECTIONS) {
    const declarations = data[section];
    if (declarations === undefined) continue;
    if (!declarations || typeof declarations !== 'object' || Array.isArray(declarations)) {
      invalid = true;
      continue;
    }
    for (const [name, declaredVersion] of Object.entries(declarations)) {
      if (typeof declaredVersion !== 'string') {
        invalid = true;
        continue;
      }
      byType[section] += 1;
      dependencies.push({
        name,
        normalizedName: name.toLowerCase(),
        declaredVersion,
        type,
        manifest
      });
    }
  }

  if (invalid) {
    return {
      dependencySummary: { status: 'failed' },
      dependencies: [],
      warnings: [{
        code: 'DEPENDENCY_PARSE_FAILED',
        path: manifest,
        message: 'Unable to parse dependency declarations in package.json.'
      }]
    };
  }

  const sortedDependencies = sortDependencies(dependencies);
  return {
    dependencySummary: summarizeDependencies(sortedDependencies, byType),
    dependencies: sortedDependencies,
    warnings: duplicateDependencyWarnings(sortedDependencies, manifest)
  };
}

async function nodeMetadata(root, files, directoryEntries) {
  const packageFile = files.find((file) => path.basename(file) === 'package.json');
  if (!packageFile) return {};
  const data = await readJson(packageFile);
  const workspaces = Array.isArray(data.workspaces) ? data.workspaces : data.workspaces?.packages;
  const dependencyMetadata = parseNodeDependencies(data, relativePath(root, packageFile));
  return {
    name: typeof data.name === 'string' ? data.name : undefined,
    version: typeof data.version === 'string' ? data.version : undefined,
    private: typeof data.private === 'boolean' ? data.private : undefined,
    packageManager: packageManagerFromNode(data, directoryEntries),
    ...dependencyMetadata,
    workspacePatterns: Array.isArray(workspaces) ? workspaces.filter((item) => typeof item === 'string') : []
  };
}

async function pythonMetadata(root, files) {
  const fallbackName = path.basename(path.dirname(files[0]));
  const pyprojectFile = files.find((file) => path.basename(file) === 'pyproject.toml');
  const requirementsFile = files.find((file) => path.basename(file) === 'requirements.txt');
  const warnings = [];
  let name = fallbackName;

  if (pyprojectFile) {
    try {
      const contents = await readText(pyprojectFile);
      name = firstMatch(contents, [/^\s*name\s*=\s*["']([^"']+)["']/m]) ?? fallbackName;
    } catch (error) {
      warnings.push({
        code: 'MANIFEST_UNREADABLE',
        path: relativePath(root, pyprojectFile),
        message: `Unable to read manifest (${error.code ?? 'unknown error'})`
      });
    }
  }

  if (!requirementsFile) {
    return { name, dependencySummary: { status: 'unsupported' }, dependencies: [], warnings };
  }

  try {
    const parsed = parseRequirementsTxt(await readText(requirementsFile));
    if (parsed.issues.length > 0) {
      const lines = parsed.issues.map((issue) => issue.line).join(', ');
      warnings.push({
        code: 'DEPENDENCY_PARSE_FAILED',
        path: relativePath(root, requirementsFile),
        message: `Unable to parse ${parsed.issues.length} requirement line(s): ${lines}`
      });
      return { name, dependencySummary: { status: 'failed' }, dependencies: [], warnings };
    }
    const manifest = relativePath(root, requirementsFile);
    const dependencies = sortDependencies(parsed.dependencies.map((dependencyRecord) => ({
      ...dependencyRecord,
      manifest
    })));
    warnings.push(...duplicateDependencyWarnings(dependencies, manifest));
    return {
      name,
      dependencySummary: summarizeDependencies(dependencies),
      dependencies,
      warnings
    };
  } catch (error) {
    warnings.push({
      code: 'DEPENDENCY_PARSE_FAILED',
      path: relativePath(root, requirementsFile),
      message: `Unable to read or parse requirements (${error.code ?? 'unknown error'})`
    });
    return { name, dependencySummary: { status: 'failed' }, dependencies: [], warnings };
  }
}

async function alMetadata(files) {
  const data = await readJson(files[0]);
  const looksLikeAl = typeof data.id === 'string' && typeof data.name === 'string' && typeof data.publisher === 'string';
  if (!looksLikeAl) return { skip: true };
  return {
    name: data.name,
    version: typeof data.version === 'string' ? data.version : undefined
  };
}

async function jsonMetadata(files, ecosystem) {
  const data = await readJson(files[0]);
  if (ecosystem === 'php') {
    return {
      name: typeof data.name === 'string' ? data.name : undefined,
      version: typeof data.version === 'string' ? data.version : undefined
    };
  }
  return {};
}

async function textMetadata(files, ecosystem) {
  const contents = await Promise.all(files.map(readText));
  const text = contents.join('\n');
  const fallbackName = path.basename(path.dirname(files[0]));

  switch (ecosystem) {
    case 'java':
      return { name: firstMatch(text, [/<artifactId>([^<]+)<\/artifactId>/, /rootProject\.name\s*=\s*["']([^"']+)["']/]) ?? fallbackName };
    case 'dotnet':
      return { name: firstMatch(text, [/<AssemblyName>([^<]+)<\/AssemblyName>/, /<RootNamespace>([^<]+)<\/RootNamespace>/]) ?? path.parse(files[0]).name };
    case 'go':
      return { name: firstMatch(text, [/^module\s+(.+)$/m]) ?? fallbackName };
    case 'rust':
      return { name: firstMatch(text, [/^\s*name\s*=\s*["']([^"']+)["']/m]), version: firstMatch(text, [/^\s*version\s*=\s*["']([^"']+)["']/m]) };
    default:
      return { name: fallbackName };
  }
}

export async function inspectProjectGroup(root, group, directoryEntries) {
  const { definition, directory, files } = group;
  let metadata;

  if (definition.ecosystem === 'node') metadata = await nodeMetadata(root, files, directoryEntries);
  else if (definition.ecosystem === 'python') metadata = await pythonMetadata(root, files);
  else if (definition.ecosystem === 'al') metadata = await alMetadata(files);
  else if (definition.ecosystem === 'php') metadata = await jsonMetadata(files, definition.ecosystem);
  else metadata = await textMetadata(files, definition.ecosystem);

  if (metadata.skip) return undefined;
  const projectPath = relativePath(root, directory);
  const manifests = files.map((file) => relativePath(root, file)).sort();
  const name = metadata.name || path.basename(directory);

  const project = {
    id: `${definition.ecosystem}:${projectPath}`,
    name,
    path: projectPath,
    ecosystem: definition.ecosystem,
    languages: definition.languages,
    manifests,
    ...(metadata.version ? { version: metadata.version } : {}),
    ...(metadata.private !== undefined ? { private: metadata.private } : {}),
    ...(metadata.packageManager ? { packageManager: metadata.packageManager } : {}),
    dependencySummary: metadata.dependencySummary ?? { status: 'unsupported' },
    dependencies: metadata.dependencies ?? [],
    _workspacePatterns: metadata.workspacePatterns ?? []
  };
  return { project, warnings: metadata.warnings ?? [] };
}
