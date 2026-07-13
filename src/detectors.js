import path from 'node:path';

import { readJson, readText, relativePath } from './files.js';

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

function dependencyCount(data) {
  const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  return new Set(sections.flatMap((section) => Object.keys(data[section] ?? {}))).size;
}

async function nodeMetadata(files, directoryEntries) {
  const packageFile = files.find((file) => path.basename(file) === 'package.json');
  if (!packageFile) return {};
  const data = await readJson(packageFile);
  const workspaces = Array.isArray(data.workspaces) ? data.workspaces : data.workspaces?.packages;
  return {
    name: typeof data.name === 'string' ? data.name : undefined,
    version: typeof data.version === 'string' ? data.version : undefined,
    private: typeof data.private === 'boolean' ? data.private : undefined,
    packageManager: packageManagerFromNode(data, directoryEntries),
    dependencyCount: dependencyCount(data),
    workspacePatterns: Array.isArray(workspaces) ? workspaces.filter((item) => typeof item === 'string') : []
  };
}

async function alMetadata(files) {
  const data = await readJson(files[0]);
  const looksLikeAl = typeof data.id === 'string' && typeof data.name === 'string' && typeof data.publisher === 'string';
  if (!looksLikeAl) return { skip: true };
  return {
    name: data.name,
    version: typeof data.version === 'string' ? data.version : undefined,
    dependencyCount: Array.isArray(data.dependencies) ? data.dependencies.length : 0
  };
}

async function jsonMetadata(files, ecosystem) {
  const data = await readJson(files[0]);
  if (ecosystem === 'php') {
    return {
      name: typeof data.name === 'string' ? data.name : undefined,
      version: typeof data.version === 'string' ? data.version : undefined,
      dependencyCount: Object.keys({ ...(data.require ?? {}), ...(data['require-dev'] ?? {}) }).length
    };
  }
  return {};
}

async function textMetadata(files, ecosystem) {
  const contents = await Promise.all(files.map(readText));
  const text = contents.join('\n');
  const fallbackName = path.basename(path.dirname(files[0]));

  switch (ecosystem) {
    case 'python':
      return { name: firstMatch(text, [/^\s*name\s*=\s*["']([^"']+)["']/m]) ?? fallbackName };
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

  if (definition.ecosystem === 'node') metadata = await nodeMetadata(files, directoryEntries);
  else if (definition.ecosystem === 'al') metadata = await alMetadata(files);
  else if (definition.ecosystem === 'php') metadata = await jsonMetadata(files, definition.ecosystem);
  else metadata = await textMetadata(files, definition.ecosystem);

  if (metadata.skip) return undefined;
  const projectPath = relativePath(root, directory);
  const manifests = files.map((file) => relativePath(root, file)).sort();
  const name = metadata.name || path.basename(directory);

  return {
    id: `${definition.ecosystem}:${projectPath}`,
    name,
    path: projectPath,
    ecosystem: definition.ecosystem,
    languages: definition.languages,
    manifests,
    ...(metadata.version ? { version: metadata.version } : {}),
    ...(metadata.private !== undefined ? { private: metadata.private } : {}),
    ...(metadata.packageManager ? { packageManager: metadata.packageManager } : {}),
    metadata: { dependencyCount: metadata.dependencyCount ?? 0 },
    _workspacePatterns: metadata.workspacePatterns ?? []
  };
}
