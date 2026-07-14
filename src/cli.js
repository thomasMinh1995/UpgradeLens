import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CLI_NAME,
  DEFAULT_KNOWLEDGE_MANIFEST_PATH,
  DEFAULT_MANIFEST_PATH,
  PRODUCT_NAME,
  VERSION
} from './constants.js';
import { discoverProject } from './discovery.js';
import { createCliHttpRuntime } from './http/cli-http-runtime.js';
import { createKnowledgeCache } from './knowledge-cache.js';
import { buildKnowledgeManifest } from './knowledge-manifest-builder.js';
import { serializeKnowledgeManifest, writeKnowledgeManifest } from './knowledge-manifest-writer.js';
import { createKnowledgeResearchOrchestrator } from './knowledge-research.js';
import { loadProjectManifestInput } from './project-manifest-input.js';
import { createResearchPlan } from './research-plan.js';
import { createNpmRegistryAdapter } from './registry/npm-registry-adapter.js';
import { createPypiRegistryAdapter } from './registry/pypi-registry-adapter.js';
import { isPortableRelativePath } from './portable.js';

const HELP = `${PRODUCT_NAME} ${VERSION}

Discover repository structure or research declared public packages.

Usage:
  ${CLI_NAME} discover [path] [options]
  ${CLI_NAME} research [path] [options]
  ${CLI_NAME} [path] [options]

Discover options:
  -o, --output <path>   Project Manifest path relative to the project root
                        (default: ${DEFAULT_MANIFEST_PATH})
      --stdout          Print the manifest instead of writing a file
      --no-pretty       Emit compact JSON
      --max-depth <n>   Maximum directory depth to scan
      --fail-on-warning Return exit code 2 when discovery has warnings

Research options:
  -o, --output <path>   Knowledge Manifest path relative to the project root
                        (default: ${DEFAULT_KNOWLEDGE_MANIFEST_PATH})
      --stdout          Print only the Knowledge Manifest JSON
      --offline         Use fresh cache entries only; never request registries
  -h, --help            Show help
  -v, --version         Show version
`;

function takeValue(args, index, option) {
  const value = args[index + 1];
  if (value === undefined || value.startsWith('-')) throw new Error(`${option} requires a value`);
  return value;
}

function outputPath(root, output) {
  if (!isPortableRelativePath(output)) throw new Error('--output must be a portable path relative to the repository root');
  return path.resolve(root, output);
}

export function parseArguments(argv) {
  const args = [...argv];
  const command = ['discover', 'research'].includes(args[0]) ? args.shift() : 'discover';
  const options = {
    command,
    root: '.',
    output: command === 'research' ? DEFAULT_KNOWLEDGE_MANIFEST_PATH : DEFAULT_MANIFEST_PATH,
    pretty: true,
    stdout: false,
    failOnWarning: false,
    offline: false
  };
  let rootSet = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help' || argument === '-h') options.help = true;
    else if (argument === '--version' || argument === '-v') options.version = true;
    else if (argument === '--stdout') options.stdout = true;
    else if (argument === '--no-pretty') options.pretty = false;
    else if (argument === '--fail-on-warning') options.failOnWarning = true;
    else if (argument === '--offline') options.offline = true;
    else if (argument === '--output' || argument === '-o') {
      options.output = takeValue(args, index, argument);
      index += 1;
    } else if (argument === '--max-depth') {
      const raw = takeValue(args, index, argument);
      const depth = Number(raw);
      if (!Number.isInteger(depth) || depth < 0) throw new Error('--max-depth must be a non-negative integer');
      options.maxDepth = depth;
      index += 1;
    } else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else if (!rootSet) {
      options.root = argument;
      rootSet = true;
    } else throw new Error(`Unexpected argument: ${argument}`);
  }
  if (command === 'discover' && options.offline) throw new Error('--offline is only supported by research');
  if (command === 'research' && options.maxDepth !== undefined) throw new Error('--max-depth is only supported by discover');
  if (command === 'research' && options.failOnWarning) throw new Error('--fail-on-warning is only supported by discover');
  if (command === 'research' && !options.pretty) throw new Error('--no-pretty is only supported by discover');
  return options;
}

async function writeProjectManifest(root, output, contents) {
  const target = outputPath(root, output);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, contents, 'utf8');
  await rename(temporary, target);
  return target;
}

function researchAdapters(root, options, io) {
  if (io.adapters) return io.adapters;
  const clock = io.clock ?? (() => new Date());
  const cache = createKnowledgeCache({
    rootDirectory: path.join(root, '.upgradelens/cache/knowledge/v1'),
    clock
  });
  const adapterOptions = { cache, clock, fetch: io.fetch, offline: options.offline };
  return {
    npm: createNpmRegistryAdapter(adapterOptions),
    pypi: createPypiRegistryAdapter(adapterOptions)
  };
}

async function runResearch(options, io) {
  const runtime = options.offline || io.fetch
    ? null
    : (io.createHttpRuntime ?? createCliHttpRuntime)();
  let result;
  let primaryError;
  try {
    result = await executeResearch(options, {
      ...io,
      fetch: runtime?.fetch ?? io.fetch
    });
  } catch (error) {
    primaryError = error;
  }
  if (runtime) {
    try {
      await runtime.close();
    } catch {
      if (!primaryError) throw new Error('Unable to close the CLI HTTP runtime.');
    }
  }
  if (primaryError) throw primaryError;
  return result;
}

async function executeResearch(options, io) {
  const root = path.resolve(options.root);
  const loaded = await loadProjectManifestInput(path.join(root, DEFAULT_MANIFEST_PATH), {
    artifact: DEFAULT_MANIFEST_PATH
  });
  const plan = createResearchPlan(loaded);
  const clock = io.clock ?? (() => new Date());
  const orchestrator = createKnowledgeResearchOrchestrator({
    adapters: researchAdapters(root, options, io),
    clock,
    concurrency: io.concurrency ?? 4
  });
  const result = await orchestrator.run(plan);
  const manifest = (io.buildKnowledgeManifest ?? buildKnowledgeManifest)(result, {
    policy: {
      mode: options.offline ? 'offline' : 'online',
      registryBases: { npm: 'https://registry.npmjs.org', pypi: 'https://pypi.org' }
    }
  });
  const contents = serializeKnowledgeManifest(manifest);
  if (options.stdout) {
    io.stdout.write(contents);
    return 0;
  }
  const target = await (io.writeKnowledgeManifest ?? writeKnowledgeManifest)(outputPath(root, options.output), manifest);
  io.stderr.write('✓ Loaded Project Manifest\n');
  io.stderr.write(`✓ Planned research (${plan.packages.length} packages)\n`);
  io.stderr.write('✓ Research complete\n');
  io.stderr.write('✓ Knowledge Manifest validated\n');
  io.stderr.write(`✓ Wrote:\n${target}\n`);
  return 0;
}

export async function runCli(argv, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  try {
    const options = parseArguments(argv);
    if (options.help) {
      stdout.write(HELP);
      return 0;
    }
    if (options.version) {
      stdout.write(`${VERSION}\n`);
      return 0;
    }
    if (options.command === 'research') return await runResearch(options, { ...io, stdout, stderr });

    const manifest = await discoverProject(options.root, { maxDepth: options.maxDepth });
    const contents = `${JSON.stringify(manifest, null, options.pretty ? 2 : 0)}\n`;
    if (options.stdout) stdout.write(contents);
    else {
      const target = await writeProjectManifest(options.root, options.output, contents);
      stderr.write(`Discovered ${manifest.summary.projectCount} project(s).\n`);
      stderr.write(`Manifest: ${target}\n`);
      if (manifest.warnings.length) stderr.write(`Warnings: ${manifest.warnings.length}\n`);
    }
    return options.failOnWarning && manifest.warnings.length > 0 ? 2 : 0;
  } catch (error) {
    stderr.write(`${CLI_NAME}: ${error.message}\n`);
    return 1;
  }
}

export { HELP };
