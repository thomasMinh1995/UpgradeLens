import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CLI_NAME,
  CAPABILITY_PROFILE_FILENAME,
  DEFAULT_ANALYSIS_LOG_PATH,
  DEFAULT_AI_SCORECARD_PATH,
  DEFAULT_BENCHMARK_CONFIG_PATH,
  DEFAULT_BENCHMARK_REPORT_PATH,
  DEFAULT_CONFORMANCE_REPORT_PATH,
  DEPLOYMENT_PROFILE_FILENAME,
  DEFAULT_GOVERNANCE_DIRECTORY,
  DEFAULT_KNOWLEDGE_MANIFEST_PATH,
  DEFAULT_MANIFEST_PATH,
  DEFAULT_EVALUATION_REPORT_PATH,
  DEFAULT_METRICS_PATH,
  QUALIFICATION_RECORD_FILENAME,
  DEFAULT_VERSION_ANALYSIS_PATH,
  DEFAULT_REPOSITORY_IMPACT_EVIDENCE_PATH,
  DEFAULT_REPOSITORY_IMPACT_PATH,
  DEFAULT_REPOSITORY_IMPACT_REPORT_PATH,
  DEFAULT_MIGRATION_CHECKLIST_PATH,
  DEFAULT_MIGRATION_PLANNING_QUALIFICATION_PATH,
  DEFAULT_USAGE_INDEX_PATH,
  PRODUCT_NAME,
  VERSION
} from './constants.js';
import {
  buildAiScorecard,
  serializeAiScorecard,
  writeAiScorecard
} from './ai-scorecard.js';
import {
  analyzeDependencyAiContext,
  buildVersionAnalysisPrompt
} from './ai-version-analysis.js';
import {
  createHttpJsonAiProvider,
  createProviderAiRuntime
} from './ai-runtime.js';
import {
  DEFAULT_AI_TIMEOUT_MS,
  createOpenAiCompatibleProvider
} from './openai-compatible-provider.js';
import { isAiRuntimeDebugEnabled } from './ai-runtime-debug.js';
import {
  buildDependencyAiContext,
  resolveDependencyAnalysisInputs
} from './dependency-ai-context.js';
import { createEvidenceSourceAdapter } from './evidence-source-adapter.js';
import { discoverProject } from './discovery.js';
import {
  DEFAULT_EVALUATION_DATASET_PATH,
  runEvaluation,
  writeEvaluationReport
} from './evaluation-runner.js';
import { serializeEvaluationReport } from './evaluation-report.js';
import {
  loadBenchmarkConfig,
  runBenchmark,
  serializeBenchmarkReport,
  writeBenchmarkReport
} from './benchmark-runner.js';
import { runConformance } from './conformance-runner.js';
import {
  serializeConformanceReport,
  writeConformanceReport
} from './conformance-report.js';
import {
  createDefaultGovernanceArtifacts,
  serializeGovernanceArtifacts,
  writeGovernanceArtifacts
} from './governance-metadata.js';
import {
  buildMetrics,
  loadEvaluationReportForMetrics,
  writeMetrics
} from './metrics-engine.js';
import { createCliHttpRuntime } from './http/cli-http-runtime.js';
import { createKnowledgeCache } from './knowledge-cache.js';
import {
  buildKnowledgeEvidenceBundle,
  writeKnowledgeEvidenceBundle
} from './knowledge-evidence-producer.js';
import { buildKnowledgeManifest } from './knowledge-manifest-builder.js';
import { serializeKnowledgeManifest, writeKnowledgeManifest } from './knowledge-manifest-writer.js';
import { createKnowledgeResearchOrchestrator } from './knowledge-research.js';
import { runImpactEvidenceGeneration } from './impact-evidence/runtime.js';
import { writeRepositoryImpactEvidence } from './impact-evidence/writer.js';
import { runImpactAnalysis } from './impact/runtime.js';
import { writeRepositoryImpact } from './impact/writer.js';
import {
  PipelineStageError,
  createAnalysisStages,
  runAnalysisPipeline
} from './orchestration/pipeline.js';
import { writeAnalysisFailureLog } from './orchestration/failure-log.js';
import { createProgressReporter } from './orchestration/progress-reporter.js';
import { writeTextArtifact } from './orchestration/text-writer.js';
import { loadProjectManifestInput } from './project-manifest-input.js';
import { createResearchPlan } from './research-plan.js';
import { createNpmRegistryAdapter } from './registry/npm-registry-adapter.js';
import { createPypiRegistryAdapter } from './registry/pypi-registry-adapter.js';
import { renderConsoleSummary } from './renderers/console.js';
import { buildImpactPresentationViewModel } from './renderers/impact-presentation.js';
import { renderMarkdownReport } from './renderers/markdown.js';
import { isPortableRelativePath } from './portable.js';
import {
  DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH,
  loadVersionAnalysisArtifacts
} from './version-analysis-loader.js';
import { buildVersionAnalysisManifest } from './version-analysis-manifest.js';
import { serializeVersionAnalysisManifest, writeVersionAnalysisManifest } from './version-analysis-writer.js';
import { runUsageDiscovery } from './usage/runtime.js';
import { writeUsageIndex } from './usage/writer.js';
import { createMigrationProgressReporter } from './migration-checklist/progress.js';
import { runMigrationChecklistStage } from './migration-checklist/runtime.js';
import { resolveMigrationQualification } from './migration-checklist/qualification-resolution.js';

const HELP = `${PRODUCT_NAME} ${VERSION}

Analyze a repository or run an individual UpgradeLens stage.

Usage:
  ${CLI_NAME} analyze <repository> [options]
  ${CLI_NAME} discover [path] [options]
  ${CLI_NAME} research [path] [options]
  ${CLI_NAME} analyze-version [path] [options]
  ${CLI_NAME} eval [options]
  ${CLI_NAME} scorecard [options]
  ${CLI_NAME} benchmark [options]
  ${CLI_NAME} conformance [options]
  ${CLI_NAME} governance [options]
  ${CLI_NAME} [path] [options]

Analyze options:
      --offline         Use fresh research cache entries only; never request registries
      --max-depth <n>   Maximum directory depth for discovery and usage scanning
      --experimental-migration-checklist
                        Generate an evidence-grounded migration checklist.
                        Experimental. Requires human review.
      --migration-qualification <path>
                        Migration Planning v2 qualification record relative to the
                        repository (default: ${DEFAULT_MIGRATION_PLANNING_QUALIFICATION_PATH})
      --progress <mode> Control migration progress: auto, interactive, or plain
                        (default: auto)

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
      --package <id>    Analyze one exact canonical package ID (for example, pypi:langsmith)
      --stdout          Print only the Version Analysis JSON

Eval options:
      --dataset <path>  Golden Dataset file or directory
                        (default: ${DEFAULT_EVALUATION_DATASET_PATH})
  -o, --output <path>   Evaluation report path
                        (default: ${DEFAULT_EVALUATION_REPORT_PATH})
      --stdout          Print only the Evaluation Report JSON

Scorecard options:
      --report <path>   Evaluation Report path
                        (default: ${DEFAULT_EVALUATION_REPORT_PATH})
      --metrics-output <path>
                        Metrics artifact path
                        (default: ${DEFAULT_METRICS_PATH})
  -o, --output <path>   AI Scorecard path
                        (default: ${DEFAULT_AI_SCORECARD_PATH})
      --stdout          Print only the AI Scorecard JSON

Benchmark options:
      --config <path>   Benchmark config path
                        (default: ${DEFAULT_BENCHMARK_CONFIG_PATH})
  -o, --output <path>   Benchmark Report path
                        (default: ${DEFAULT_BENCHMARK_REPORT_PATH})
      --stdout          Print only the Benchmark Report JSON

Conformance options:
  -o, --output <path>   Offline Conformance Report path
                        (default: ${DEFAULT_CONFORMANCE_REPORT_PATH})
      --stdout          Print only the Offline Conformance Report JSON

Governance options:
  -o, --output <path>   Directory for portable governance artifacts
                        (default: ${DEFAULT_GOVERNANCE_DIRECTORY})
      --stdout          Print a bundle containing the three governance artifacts
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
  const command = ['analyze', 'discover', 'research', 'analyze-version', 'eval', 'scorecard', 'benchmark', 'conformance', 'governance'].includes(args[0])
    ? args.shift()
    : 'discover';
  const options = {
    command,
    root: '.',
    output: command === 'analyze'
      ? DEFAULT_REPOSITORY_IMPACT_REPORT_PATH
      : command === 'research'
      ? DEFAULT_KNOWLEDGE_MANIFEST_PATH
      : command === 'analyze-version'
        ? DEFAULT_VERSION_ANALYSIS_PATH
        : command === 'eval'
          ? DEFAULT_EVALUATION_REPORT_PATH
        : command === 'scorecard'
          ? DEFAULT_AI_SCORECARD_PATH
        : command === 'benchmark'
          ? DEFAULT_BENCHMARK_REPORT_PATH
        : command === 'conformance'
          ? DEFAULT_CONFORMANCE_REPORT_PATH
        : command === 'governance'
          ? DEFAULT_GOVERNANCE_DIRECTORY
        : DEFAULT_MANIFEST_PATH,
    dataset: DEFAULT_EVALUATION_DATASET_PATH,
    report: DEFAULT_EVALUATION_REPORT_PATH,
    metricsOutput: DEFAULT_METRICS_PATH,
    config: DEFAULT_BENCHMARK_CONFIG_PATH,
    pretty: true,
    stdout: false,
    failOnWarning: false,
    offline: false,
    experimentalMigrationChecklist: false,
    progress: 'auto'
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
    else if (argument === '--experimental-migration-checklist') {
      options.experimentalMigrationChecklist = true;
    } else if (argument === '--progress') {
      options.progress = takeValue(args, index, argument);
      index += 1;
    } else if (argument === '--migration-qualification') {
      options.migrationQualificationPath = takeValue(args, index, argument);
      index += 1;
    }
    else if (argument === '--output' || argument === '-o') {
      options.output = takeValue(args, index, argument);
      index += 1;
    } else if (argument === '--dataset') {
      options.dataset = takeValue(args, index, argument);
      index += 1;
    } else if (argument === '--report') {
      options.report = takeValue(args, index, argument);
      index += 1;
    } else if (argument === '--metrics-output') {
      options.metricsOutput = takeValue(args, index, argument);
      index += 1;
    } else if (argument === '--config') {
      options.config = takeValue(args, index, argument);
      index += 1;
    } else if (argument === '--package') {
      if (options.packageId !== undefined) {
        throw new Error('--package accepts exactly one canonical package ID.');
      }
      options.packageId = takeValue(args, index, argument);
      index += 1;
    } else if (argument === '--max-depth') {
      const raw = takeValue(args, index, argument);
      const depth = Number(raw);
      if (!Number.isInteger(depth) || depth < 0) throw new Error('--max-depth must be a non-negative integer');
      options.maxDepth = depth;
      index += 1;
    } else if (argument.startsWith('-')) throw new Error(`Unknown option: ${argument}`);
    else if (!rootSet && command !== 'eval' && command !== 'scorecard' && command !== 'benchmark'
      && command !== 'conformance' && command !== 'governance') {
      options.root = argument;
      rootSet = true;
    } else if (!rootSet && command === 'eval') {
      options.dataset = argument;
      rootSet = true;
    } else if (!rootSet && command === 'scorecard') {
      options.report = argument;
      rootSet = true;
    } else if (!rootSet && command === 'benchmark') {
      options.config = argument;
      rootSet = true;
    } else if (!rootSet && command === 'conformance') {
      throw new Error(`Unexpected argument: ${argument}`);
    } else if (!rootSet && command === 'governance') {
      throw new Error(`Unexpected argument: ${argument}`);
    } else throw new Error(`Unexpected argument: ${argument}`);
  }
  if (!['research', 'analyze'].includes(command) && options.offline) {
    throw new Error('--offline is only supported by research and analyze');
  }
  if (command !== 'analyze' && options.experimentalMigrationChecklist) {
    throw new Error('--experimental-migration-checklist is only supported by analyze');
  }
  if (options.migrationQualificationPath !== undefined) {
    if (command !== 'analyze' || !options.experimentalMigrationChecklist) {
      throw new Error('--migration-qualification requires analyze with --experimental-migration-checklist');
    }
    if (!isPortableRelativePath(options.migrationQualificationPath)) {
      throw new Error('--migration-qualification must be a portable path relative to the repository root');
    }
  }
  if (command !== 'analyze' && options.progress !== 'auto') {
    throw new Error('--progress is only supported by analyze');
  }
  if (!['auto', 'interactive', 'plain'].includes(options.progress)) {
    throw new Error('--progress must be auto, interactive, or plain');
  }
  if (!['discover', 'analyze'].includes(command) && options.maxDepth !== undefined) {
    throw new Error('--max-depth is only supported by discover and analyze');
  }
  if (command !== 'discover' && options.failOnWarning) throw new Error('--fail-on-warning is only supported by discover');
  if (command !== 'discover' && !options.pretty) throw new Error('--no-pretty is only supported by discover');
  if (command !== 'eval' && options.dataset !== DEFAULT_EVALUATION_DATASET_PATH) throw new Error('--dataset is only supported by eval');
  if (command !== 'scorecard' && options.report !== DEFAULT_EVALUATION_REPORT_PATH) throw new Error('--report is only supported by scorecard');
  if (command !== 'scorecard' && options.metricsOutput !== DEFAULT_METRICS_PATH) {
    throw new Error('--metrics-output is only supported by scorecard');
  }
  if (command !== 'benchmark' && options.config !== DEFAULT_BENCHMARK_CONFIG_PATH) throw new Error('--config is only supported by benchmark');
  if (command !== 'analyze-version' && options.packageId !== undefined) {
    throw new Error('--package is only supported by analyze-version');
  }
  if (options.packageId !== undefined) {
    const separator = options.packageId.indexOf(':');
    const ecosystem = options.packageId.slice(0, separator);
    const name = options.packageId.slice(separator + 1);
    if (separator <= 0 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ecosystem) || name.length === 0 || /\s/.test(name)) {
      throw new Error('--package must be an exact canonical package ID such as npm:react or pypi:langsmith.');
    }
  }
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

function researchComponents(root, options, io) {
  if (io.adapters) {
    return {
      adapters: io.adapters,
      evidenceSourceAdapter: io.evidenceSourceAdapter ?? null
    };
  }
  const clock = io.clock ?? (() => new Date());
  const cache = createKnowledgeCache({
    rootDirectory: path.join(root, '.upgradelens/cache/knowledge/v1'),
    clock
  });
  const adapterOptions = { cache, clock, fetch: io.fetch, offline: options.offline };
  return {
    adapters: {
      npm: createNpmRegistryAdapter(adapterOptions),
      pypi: createPypiRegistryAdapter(adapterOptions)
    },
    evidenceSourceAdapter: io.evidenceSourceAdapter !== undefined
      ? io.evidenceSourceAdapter
      : io.defaultEvidenceEnrichment === false
        ? null
        : createEvidenceSourceAdapter({
            cache,
            clock,
            fetch: io.fetch,
            offline: options.offline
          })
  };
}

async function runResearch(options, io) {
  const defaultEvidenceEnrichment = io.evidenceSourceAdapter !== undefined
    || (!io.adapters && !io.fetch);
  const runtime = options.offline || io.fetch
    ? null
    : (io.createHttpRuntime ?? createCliHttpRuntime)();
  let result;
  let primaryError;
  try {
    result = await executeResearch(options, {
      ...io,
      fetch: runtime?.fetch ?? io.fetch,
      defaultEvidenceEnrichment
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
  const components = researchComponents(root, options, io);
  const orchestrator = createKnowledgeResearchOrchestrator({
    adapters: components.adapters,
    evidenceSourceAdapter: components.evidenceSourceAdapter,
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
  const manifestBytes = Buffer.from(contents, 'utf8');
  const evidenceBundle = (io.buildKnowledgeEvidenceBundle ?? buildKnowledgeEvidenceBundle)(manifest, {
    knowledgeManifestArtifact: options.output,
    knowledgeManifestBytes: manifestBytes,
    generatedAt: manifest.generatedAt,
    enrichedEvidence: result.evidence
  });
  const target = await (io.writeKnowledgeManifest ?? writeKnowledgeManifest)(outputPath(root, options.output), manifest);
  const evidenceTarget = await (io.writeKnowledgeEvidenceBundle ?? writeKnowledgeEvidenceBundle)(
    outputPath(root, DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH),
    evidenceBundle
  );
  io.stderr.write('✓ Loaded Project Manifest\n');
  io.stderr.write(`✓ Planned research (${plan.packages.length} packages)\n`);
  io.stderr.write('✓ Research complete\n');
  io.stderr.write('✓ Knowledge Manifest validated\n');
  io.stderr.write(`✓ Wrote:\n${target}\n`);
  io.stderr.write(`✓ Knowledge Evidence Bundle validated\n`);
  io.stderr.write(`✓ Wrote:\n${evidenceTarget}\n`);
  return 0;
}

function createDefaultAiRuntime(io) {
  const env = io.env ?? process.env;
  const providerName = env.UPGRADELENS_AI_PROVIDER ?? 'http-json';
  if (!env.UPGRADELENS_AI_ENDPOINT) {
    throw new Error('AI runtime is not configured. Set UPGRADELENS_AI_ENDPOINT or provide an AiRuntime.');
  }
  if (providerName === 'openai-compatible') {
    const provider = createOpenAiCompatibleProvider({
      endpoint: env.UPGRADELENS_AI_ENDPOINT,
      model: env.UPGRADELENS_AI_MODEL,
      authorization: env.UPGRADELENS_AI_AUTHORIZATION,
      fetchImplementation: io.fetch,
      timeoutMs: configuredAiTimeoutMs(env),
      debug: isAiRuntimeDebugEnabled(env),
      debugWriter: io.aiDebugWriter ?? io.stderr ?? process.stderr
    });
    return createProviderAiRuntime({ provider });
  }
  const headers = {};
  if (env.UPGRADELENS_AI_AUTHORIZATION) headers.authorization = env.UPGRADELENS_AI_AUTHORIZATION;
  const provider = createHttpJsonAiProvider({
    endpoint: env.UPGRADELENS_AI_ENDPOINT,
    fetchImplementation: io.fetch,
    headers,
    provider: providerName,
    model: env.UPGRADELENS_AI_MODEL ?? 'unknown'
  });
  return createProviderAiRuntime({
    provider,
    promptBuilder: buildVersionAnalysisPrompt
  });
}

function configuredAiTimeoutMs(env) {
  const raw = env.UPGRADELENS_AI_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_AI_TIMEOUT_MS;
  const timeoutMs = Number(raw);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error('UPGRADELENS_AI_TIMEOUT_MS must be a positive integer.');
  }
  return timeoutMs;
}

async function executeAnalyzeVersion(options, io) {
  const root = path.resolve(options.root);
  const artifacts = await loadVersionAnalysisArtifacts({
    projectManifest: path.join(root, DEFAULT_MANIFEST_PATH),
    knowledgeManifest: path.join(root, DEFAULT_KNOWLEDGE_MANIFEST_PATH),
    evidenceBundle: path.join(root, DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH)
  });
  const allInputs = resolveDependencyAnalysisInputs(artifacts);
  let inputs = allInputs;
  if (options.packageId !== undefined) {
    const packageExists = artifacts.knowledgeManifest.packages.some((item) => item.id === options.packageId);
    if (!packageExists) {
      throw new Error(`Selected package ${options.packageId} was not found in the Knowledge Manifest; no runtime call was made.`);
    }
    inputs = allInputs.filter((input) => input.packageRecord.id === options.packageId);
    if (inputs.length === 0) {
      throw new Error(`Selected package ${options.packageId} is not eligible for Version Analysis because it has no parsed dependency occurrence; no runtime call was made.`);
    }
    if (inputs.length > 1) {
      throw new Error(`Selected package ${options.packageId} matches ${inputs.length} dependency occurrences; one-dependency selection is ambiguous and no runtime call was made.`);
    }
  }
  const contexts = inputs.map((input) => buildDependencyAiContext(artifacts, {
    input,
    target: { policy: 'registryLatest' }
  }));
  const needsRuntime = contexts.some((context) => context.knowledge.evidence.length > 0
    && context.versions.analysisMode !== 'unsupportedBaseline'
    && context.versions.targetVersion !== null);
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
    return manifest;
  }
  const target = await (io.writeVersionAnalysisManifest ?? writeVersionAnalysisManifest)(outputPath(root, options.output), manifest);
  io.stderr.write('✓ Loaded Project, Knowledge, and Evidence artifacts\n');
  io.stderr.write(`✓ Built AI contexts (${contexts.length} dependencies)\n`);
  io.stderr.write('✓ AI Version Analysis complete\n');
  io.stderr.write('✓ Version Analysis artifact validated\n');
  io.stderr.write(`✓ Wrote:\n${target}\n`);
  return manifest;
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

async function executeScorecard(options, io) {
  const report = await (io.loadEvaluationReportForMetrics ?? loadEvaluationReportForMetrics)(path.resolve(options.report));
  const metrics = (io.buildMetrics ?? buildMetrics)(report, {
    generatedAt: io.clock ? io.clock() : new Date()
  });
  const scorecard = (io.buildAiScorecard ?? buildAiScorecard)(metrics, {
    generatedAt: io.clock ? io.clock() : new Date()
  });
  if (options.stdout) {
    io.stdout.write(serializeAiScorecard(scorecard));
    return 0;
  }
  const metricsTarget = await (io.writeMetrics ?? writeMetrics)(path.resolve(options.metricsOutput), metrics);
  const scorecardTarget = await (io.writeAiScorecard ?? writeAiScorecard)(outputPath('.', options.output), scorecard);
  io.stderr.write(`✓ Loaded Evaluation Report (${report.summary.totalCases} cases)\n`);
  io.stderr.write('✓ Metrics complete\n');
  io.stderr.write(`✓ Scorecard: ${scorecard.overallScore}/100\n`);
  io.stderr.write(`✓ Wrote metrics:\n${metricsTarget}\n`);
  io.stderr.write(`✓ Wrote scorecard:\n${scorecardTarget}\n`);
  return 0;
}

function benchmarkRuntimeFactory(io) {
  return async (run, config) => {
    if (io.benchmarkRuntimeFactory) return io.benchmarkRuntimeFactory(run, config);
    if (run.runtime.type === 'goldenFake') return null;
    if (run.runtime.type === 'environment') return createDefaultAiRuntime(io);
    throw new Error(`Benchmark runtime ${run.runtime.type} is not supported by the CLI.`);
  };
}

async function executeBenchmark(options, io) {
  const configPath = path.resolve(options.config);
  const config = await (io.loadBenchmarkConfig ?? loadBenchmarkConfig)(configPath);
  const report = await (io.runBenchmark ?? runBenchmark)(config, {
    configPath,
    runtimeFactory: benchmarkRuntimeFactory(io),
    generatedAt: io.clock ? io.clock() : new Date()
  });
  const contents = serializeBenchmarkReport(report);
  if (options.stdout) {
    io.stdout.write(contents);
    return 0;
  }
  const target = await (io.writeBenchmarkReport ?? writeBenchmarkReport)(outputPath('.', options.output), report);
  io.stderr.write(`✓ Loaded Benchmark Config (${report.benchmark.runCount} runs)\n`);
  io.stderr.write('✓ Benchmark complete\n');
  io.stderr.write(`✓ Top run: ${report.ranking[0]?.runId ?? 'none'}\n`);
  io.stderr.write(`✓ Wrote:\n${target}\n`);
  return 0;
}

async function executeConformance(options, io) {
  const env = io.env ?? process.env;
  const report = await (io.runConformance ?? runConformance)({
    runtime: {
      provider: env.UPGRADELENS_AI_PROVIDER ?? 'openai-compatible',
      model: env.UPGRADELENS_AI_MODEL ?? 'offline-fixture'
    },
    generatedAt: io.clock ? io.clock() : new Date()
  });
  const contents = serializeConformanceReport(report);
  if (options.stdout) {
    io.stdout.write(contents);
    return report.summary.failed > 0 ? 2 : 0;
  }
  const target = await (io.writeConformanceReport ?? writeConformanceReport)(
    outputPath('.', options.output),
    report
  );
  io.stderr.write(`✓ Offline conformance complete (${report.summary.total} cases)\n`);
  io.stderr.write(`✓ Passed: ${report.summary.passed}; Failed: ${report.summary.failed}\n`);
  io.stderr.write(`✓ Recommendation: ${report.recommendation}\n`);
  io.stderr.write(`✓ Wrote:\n${target}\n`);
  return report.summary.failed > 0 ? 2 : 0;
}

function governancePositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return number;
}

async function executeGovernance(options, io) {
  const env = io.env ?? process.env;
  const artifacts = (io.createDefaultGovernanceArtifacts ?? createDefaultGovernanceArtifacts)({
    provider: env.UPGRADELENS_AI_PROVIDER ?? 'openai-compatible',
    endpoint: env.UPGRADELENS_AI_ENDPOINT,
    model: env.UPGRADELENS_AI_MODEL ?? 'offline-fixture',
    timeoutSeconds: governancePositiveInteger(
      env.UPGRADELENS_AI_TIMEOUT_SECONDS,
      180,
      'UPGRADELENS_AI_TIMEOUT_SECONDS'
    ),
    maxResponseBytes: governancePositiveInteger(
      env.UPGRADELENS_AI_MAX_RESPONSE_BYTES,
      1_048_576,
      'UPGRADELENS_AI_MAX_RESPONSE_BYTES'
    )
  });
  if (options.stdout) {
    io.stdout.write(serializeGovernanceArtifacts(artifacts));
    return 0;
  }
  const targets = await (io.writeGovernanceArtifacts ?? writeGovernanceArtifacts)(
    outputPath('.', options.output),
    artifacts
  );
  io.stderr.write('✓ Governance metadata validated\n');
  io.stderr.write(`✓ Wrote ${CAPABILITY_PROFILE_FILENAME}:\n${targets.capabilityProfile}\n`);
  io.stderr.write(`✓ Wrote ${DEPLOYMENT_PROFILE_FILENAME}:\n${targets.deploymentProfile}\n`);
  io.stderr.write(`✓ Wrote ${QUALIFICATION_RECORD_FILENAME}:\n${targets.qualificationRecord}\n`);
  return 0;
}

function silentStream() {
  return Object.freeze({ write: () => true });
}

function migrationRuntimeMetadata(io) {
  if (io.migrationRuntimeMetadata) return io.migrationRuntimeMetadata;
  const env = io.env ?? process.env;
  const provider = env.UPGRADELENS_AI_PROVIDER ?? 'unknown';
  return {
    provider,
    model: env.UPGRADELENS_AI_MODEL ?? 'unknown',
    adapter: provider === 'openai-compatible' ? 'openai-compatible' : provider
  };
}

function migrationEventListener(options, io) {
  if (!options.experimentalMigrationChecklist) return undefined;
  const clock = io.progressClock ?? (() => Date.now());
  const reporter = io.migrationProgressReporter ?? createMigrationProgressReporter(io.stderr, {
    mode: options.progress,
    clock
  });
  return (event) => {
    reporter.handle?.(event);
    if (typeof io.migrationProgressListener === 'function') io.migrationProgressListener(event);
  };
}

export function createCliAnalysisStageRunners(options, io) {
  const root = path.resolve(options.root);
  const quiet = silentStream();
  const clockOptions = io.clock ? { clock: io.clock } : {};
  const onMigrationEvent = migrationEventListener(options, io);
  return {
    async projectDiscovery() {
      const manifest = await discoverProject(root, { maxDepth: options.maxDepth });
      await writeProjectManifest(root, DEFAULT_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
      return manifest;
    },
    async knowledgeResearch() {
      await runResearch({
        ...options,
        command: 'research',
        root,
        output: DEFAULT_KNOWLEDGE_MANIFEST_PATH,
        stdout: false
      }, { ...io, stdout: quiet, stderr: quiet });
      return DEFAULT_KNOWLEDGE_MANIFEST_PATH;
    },
    async versionAnalysis() {
      return executeAnalyzeVersion({
        ...options,
        command: 'analyze-version',
        root,
        output: DEFAULT_VERSION_ANALYSIS_PATH,
        stdout: false,
        packageId: undefined
      }, { ...io, stdout: quiet, stderr: quiet });
    },
    async usageDiscovery() {
      const usageIndex = await runUsageDiscovery({
        repositoryRoot: root,
        maxDepth: options.maxDepth,
        ...clockOptions
      });
      await writeUsageIndex(path.join(root, DEFAULT_USAGE_INDEX_PATH), usageIndex);
      return usageIndex;
    },
    async impactAnalysis() {
      const repositoryImpact = await runImpactAnalysis({
        sources: {
          projectManifest: path.join(root, DEFAULT_MANIFEST_PATH),
          versionAnalysis: path.join(root, DEFAULT_VERSION_ANALYSIS_PATH),
          usageIndex: path.join(root, DEFAULT_USAGE_INDEX_PATH)
        },
        ...clockOptions
      });
      await writeRepositoryImpact(path.join(root, DEFAULT_REPOSITORY_IMPACT_PATH), repositoryImpact);
      return repositoryImpact;
    },
    async impactEvidence() {
      const impactEvidence = await runImpactEvidenceGeneration({
        sources: {
          projectManifest: path.join(root, DEFAULT_MANIFEST_PATH),
          versionAnalysis: path.join(root, DEFAULT_VERSION_ANALYSIS_PATH),
          usageIndex: path.join(root, DEFAULT_USAGE_INDEX_PATH),
          repositoryImpact: path.join(root, DEFAULT_REPOSITORY_IMPACT_PATH)
        },
        ...clockOptions
      });
      await writeRepositoryImpactEvidence(
        path.join(root, DEFAULT_REPOSITORY_IMPACT_EVIDENCE_PATH),
        impactEvidence
      );
      return impactEvidence;
    },
    async migrationChecklist() {
      const runtimeMetadata = migrationRuntimeMetadata(io);
      const resolver = io.resolveMigrationQualification ?? resolveMigrationQualification;
      const qualificationOptions = {
        repositoryRoot: root,
        runtimeMetadata,
        allowExperimental: true,
        qualificationPath: options.migrationQualificationPath
      };
      if (Object.hasOwn(io, 'migrationQualification')) {
        qualificationOptions.qualification = io.migrationQualification;
      }
      const qualificationDecision = await resolver(qualificationOptions);
      return (io.runMigrationChecklistStage ?? runMigrationChecklistStage)({
        repositoryRoot: root,
        aiRuntime: io.migrationAiRuntime ?? io.aiRuntime ?? null,
        createAiRuntime: () => createDefaultAiRuntime(io),
        runtimeMetadata,
        qualificationDecision,
        allowExperimental: true,
        generatedAt: io.clock ? io.clock() : new Date(),
        artifactPath: DEFAULT_MIGRATION_CHECKLIST_PATH,
        onEvent: onMigrationEvent
      });
    },
    async markdownReport({ artifacts }) {
      const viewModel = buildImpactPresentationViewModel({
        projectManifest: artifacts.projectDiscovery,
        versionAnalysis: artifacts.versionAnalysis,
        repositoryImpact: artifacts.impactAnalysis,
        impactEvidence: artifacts.impactEvidence
      });
      const contents = renderMarkdownReport({
        viewModel,
        migrationChecklistViewModel: artifacts.migrationChecklist?.viewModel
      });
      const target = await (io.writeMarkdownReport ?? writeTextArtifact)(
        outputPath(root, options.output),
        contents
      );
      return Object.freeze({
        target,
        viewModel,
        migrationChecklistViewModel: artifacts.migrationChecklist?.viewModel ?? null
      });
    }
  };
}

export async function executeAnalyze(options, io) {
  const root = path.resolve(options.root);
  const runners = {
    ...createCliAnalysisStageRunners(options, io),
    ...io.analysisStageRunners
  };
  const progressReporter = io.progressReporter ?? createProgressReporter(io.stderr);
  let result;
  try {
    result = await (io.runAnalysisPipeline ?? runAnalysisPipeline)({
      repositoryRoot: root,
      runners,
      progressReporter,
      stages: createAnalysisStages({
        migrationChecklist: options.experimentalMigrationChecklist
      })
    });
  } catch (error) {
    if (!(error instanceof PipelineStageError)) throw error;
    let logTarget;
    try {
      logTarget = await (io.writeAnalysisFailureLog ?? writeAnalysisFailureLog)(root, error);
    } catch {
      io.stderr.write(`\n${error.stage.label} failed.\n\nUnable to write analysis log.\n`);
      return 1;
    }
    const displayLog = path.relative(root, logTarget).split(path.sep).join('/');
    const decision = error.cause?.decision;
    if (decision) {
      const lines = [
        '',
        `${error.stage.label} failed.`,
        '',
        `Qualification status: ${decision.status}`,
        `Reason: ${decision.reasonCode}`,
        `Qualification source: ${decision.sourceKind}`,
        `Expected runtime: ${decision.runtimeIdentity.provider} / ${decision.runtimeIdentity.model} / ${decision.runtimeIdentity.adapter}`
      ];
      if (decision.sourcePath) lines.push(`Qualification path: ${decision.sourcePath}`);
      if (decision.recordRuntimeIdentity) {
        lines.push(
          `Record runtime: ${decision.recordRuntimeIdentity.provider} / ${decision.recordRuntimeIdentity.model} / ${decision.recordRuntimeIdentity.adapter}`
        );
      }
      lines.push(`Next action: ${decision.nextAction}`, '', 'See:', displayLog || DEFAULT_ANALYSIS_LOG_PATH);
      io.stderr.write(`${lines.join('\n')}\n`);
    } else {
      io.stderr.write(`\n${error.stage.label} failed.\n\nSee:\n${displayLog || DEFAULT_ANALYSIS_LOG_PATH}\n`);
    }
    return 1;
  }

  io.stdout.write(renderConsoleSummary({
    viewModel: result.artifacts.markdownReport.viewModel,
    reportPath: options.output,
    migrationChecklistViewModel: result.artifacts.migrationChecklist?.viewModel,
    migrationChecklistPath: result.artifacts.migrationChecklist?.artifactPath
  }));
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
    if (options.command === 'analyze') return await executeAnalyze(options, { ...io, stdout, stderr });
    if (options.command === 'research') return await runResearch(options, { ...io, stdout, stderr });
    if (options.command === 'analyze-version') {
      await executeAnalyzeVersion(options, { ...io, stdout, stderr });
      return 0;
    }
    if (options.command === 'eval') return await executeEval(options, { ...io, stdout, stderr });
    if (options.command === 'scorecard') return await executeScorecard(options, { ...io, stdout, stderr });
    if (options.command === 'benchmark') return await executeBenchmark(options, { ...io, stdout, stderr });
    if (options.command === 'conformance') return await executeConformance(options, { ...io, stdout, stderr });
    if (options.command === 'governance') return await executeGovernance(options, { ...io, stdout, stderr });

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
