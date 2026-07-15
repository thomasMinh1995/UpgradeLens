import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CLI_NAME,
  DEFAULT_KNOWLEDGE_MANIFEST_PATH,
  DEFAULT_MANIFEST_PATH,
  DEFAULT_EVALUATION_REPORT_PATH,
  DEFAULT_VERSION_ANALYSIS_PATH,
  PRODUCT_NAME,
  VERSION
} from './constants.js';
import {
  analyzeDependencyAiContext,
  buildVersionAnalysisPrompt
} from './ai-version-analysis.js';
import {
  createHttpJsonAiProvider,
  createProviderAiRuntime
} from './ai-runtime.js';
import {
  buildDependencyAiContext,
  resolveDependencyAnalysisInputs
} from './dependency-ai-context.js';
import { discoverProject } from './discovery.js';
import {
  DEFAULT_EVALUATION_DATASET_PATH,
  runEvaluation,
  writeEvaluationReport
} from './evaluation-runner.js';
import { serializeEvaluationReport } from './evaluation-report.js';
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
import {
  DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH,
  loadVersionAnalysisArtifacts
} from './version-analysis-loader.js';
import { buildVersionAnalysisManifest } from './version-analysis-manifest.js';
import { serializeVersionAnalysisManifest, writeVersionAnalysisManifest } from './version-analysis-writer.js';

const HELP = `${PRODUCT_NAME} ${VERSION}

Discover repository structure or research declared public packages.

Usage:
  ${CLI_NAME} discover [path] [options]
  ${CLI_NAME} research [path] [options]
  ${CLI_NAME} analyze-version [path] [options]
  ${CLI_NAME} eval [options]
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

Analyze-version options:
  -o, --output <path>   Version Analysis artifact path relative to the project root
                        (default: ${DEFAULT_VERSION_ANALYSIS_PATH})
      --stdout          Print only the Version Analysis JSON

Eval options:
      --dataset <path>  Golden Dataset file or directory
                        (default: ${DEFAULT_EVALUATION_DATASET_PATH})
  -o, --output <path>   Evaluation report path
                        (default: ${DEFAULT_EVALUATION_REPORT_PATH})
      --stdout          Print only the Evaluation Report JSON
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
  const command = ['discover', 'research', 'analyze-version', 'eval'].includes(args[0]) ? args.shift() : 'discover';
  const options = {
    command,
    root: '.',
    output: command === 'research'
      ? DEFAULT_KNOWLEDGE_MANIFEST_PATH
      : command === 'analyze-version'
        ? DEFAULT_VERSION_ANALYSIS_PATH
        : command === 'eval'
          ? DEFAULT_EVALUATION_REPORT_PATH
        : DEFAULT_MANIFEST_PATH,
    dataset: DEFAULT_EVALUATION_DATASET_PATH,
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
    } else if (argument === '--dataset') {
      options.dataset = takeValue(args, index, argument);
      index += 1;
    } else if (argument === '--max-depth') {
      const raw = takeValue(args, index, argument);
      const depth = Number(raw);
      if (!Number.isInteger(depth) || depth < 0) throw new Error('--max-depth must be a non-negative integer');
      options.maxDepth = depth;
      index += 1;
    } else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else if (!rootSet && command !== 'eval') {
      options.root = argument;
      rootSet = true;
    } else if (!rootSet && command === 'eval') {
      options.dataset = argument;
      rootSet = true;
    } else throw new Error(`Unexpected argument: ${argument}`);
  }
  if (command === 'discover' && options.offline) throw new Error('--offline is only supported by research');
  if (command !== 'research' && options.offline) throw new Error('--offline is only supported by research');
  if (command !== 'discover' && options.maxDepth !== undefined) throw new Error('--max-depth is only supported by discover');
  if (command !== 'discover' && options.failOnWarning) throw new Error('--fail-on-warning is only supported by discover');
  if (command !== 'discover' && !options.pretty) throw new Error('--no-pretty is only supported by discover');
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

function createDefaultAiRuntime(io) {
  const env = io.env ?? process.env;
  if (!env.UPGRADELENS_AI_ENDPOINT) {
    throw new Error('AI runtime is not configured. Set UPGRADELENS_AI_ENDPOINT or provide an AiRuntime.');
  }
  const headers = {};
  if (env.UPGRADELENS_AI_AUTHORIZATION) headers.authorization = env.UPGRADELENS_AI_AUTHORIZATION;
  const provider = createHttpJsonAiProvider({
    endpoint: env.UPGRADELENS_AI_ENDPOINT,
    fetchImplementation: io.fetch,
    headers,
    provider: env.UPGRADELENS_AI_PROVIDER ?? 'http-json',
    model: env.UPGRADELENS_AI_MODEL ?? 'unknown'
  });
  return createProviderAiRuntime({
    provider,
    promptBuilder: buildVersionAnalysisPrompt
  });
}

async function executeAnalyzeVersion(options, io) {
  const root = path.resolve(options.root);
  const artifacts = await loadVersionAnalysisArtifacts({
    projectManifest: path.join(root, DEFAULT_MANIFEST_PATH),
    knowledgeManifest: path.join(root, DEFAULT_KNOWLEDGE_MANIFEST_PATH),
    evidenceBundle: path.join(root, DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH)
  });
  const inputs = resolveDependencyAnalysisInputs(artifacts);
  const contexts = inputs.map((input) => buildDependencyAiContext(artifacts, {
    input,
    target: { policy: 'registryLatest' }
  }));
  const needsRuntime = contexts.some((context) => context.knowledge.evidence.length > 0);
  const runtime = io.aiRuntime ?? (needsRuntime ? createDefaultAiRuntime(io) : null);
  const results = [];
  for (const context of contexts) {
    results.push(await analyzeDependencyAiContext(context, { runtime }));
  }
  const manifest = (io.buildVersionAnalysisManifest ?? buildVersionAnalysisManifest)({
    input: artifacts.input,
    contexts,
    results,
    generatedAt: io.clock ? io.clock() : new Date()
  });
  const contents = serializeVersionAnalysisManifest(manifest);
  if (options.stdout) {
    io.stdout.write(contents);
    return 0;
  }
  const target = await (io.writeVersionAnalysisManifest ?? writeVersionAnalysisManifest)(outputPath(root, options.output), manifest);
  io.stderr.write('✓ Loaded Project, Knowledge, and Evidence artifacts\n');
  io.stderr.write(`✓ Built AI contexts (${contexts.length} dependencies)\n`);
  io.stderr.write('✓ AI Version Analysis complete\n');
  io.stderr.write('✓ Version Analysis artifact validated\n');
  io.stderr.write(`✓ Wrote:\n${target}\n`);
  return 0;
}

function evaluationRuntime(options, io) {
  if (io.aiRuntime) return {
    runtime: io.aiRuntime,
    model: io.model ?? { provider: 'injected', name: 'injected' }
  };
  const env = io.env ?? process.env;
  if (env.UPGRADELENS_AI_ENDPOINT) {
    return {
      runtime: createDefaultAiRuntime(io),
      model: {
        provider: env.UPGRADELENS_AI_PROVIDER ?? 'http-json',
        name: env.UPGRADELENS_AI_MODEL ?? 'unknown'
      }
    };
  }
  return {
    runtime: null,
    model: { provider: 'golden-fake', name: 'golden-fake' }
  };
}

async function executeEval(options, io) {
  const selected = evaluationRuntime(options, io);
  const report = await (io.runEvaluation ?? runEvaluation)({
    datasetPath: options.dataset,
    runtime: selected.runtime,
    model: selected.model,
    generatedAt: io.clock ? io.clock() : new Date()
  });
  const contents = serializeEvaluationReport(report);
  if (options.stdout) {
    io.stdout.write(contents);
    return report.summary.failed > 0 ? 2 : 0;
  }
  const target = await (io.writeEvaluationReport ?? writeEvaluationReport)(outputPath('.', options.output), report);
  io.stderr.write(`✓ Loaded Golden Dataset (${report.summary.totalCases} cases)\n`);
  io.stderr.write('✓ Evaluation complete\n');
  io.stderr.write(`✓ Passed: ${report.summary.passed}; Failed: ${report.summary.failed}\n`);
  io.stderr.write(`✓ Wrote:\n${target}\n`);
  return report.summary.failed > 0 ? 2 : 0;
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
    if (options.command === 'analyze-version') return await executeAnalyzeVersion(options, { ...io, stdout, stderr });
    if (options.command === 'eval') return await executeEval(options, { ...io, stdout, stderr });

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
