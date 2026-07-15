import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json');

export const PRODUCT_NAME = 'UpgradeLens';
export const PACKAGE_NAME = 'upgradelens';
export const CLI_NAME = 'upgradelens';
export const VERSION = packageMetadata.version;
export const USER_AGENT = `${PRODUCT_NAME}/${VERSION}`;
export const MANIFEST_SCHEMA_VERSION = '2.0.0';
export const DEFAULT_OUTPUT_DIRECTORY = '.upgradelens';
export const DEFAULT_MANIFEST_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/project-manifest.json`;
export const KNOWLEDGE_MANIFEST_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_KNOWLEDGE_MANIFEST_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/knowledge-manifest.json`;
export const VERSION_ANALYSIS_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_VERSION_ANALYSIS_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/version-analysis.json`;
export const DEFAULT_EVALUATION_REPORT_PATH = 'evaluation-report.json';
export const DEFAULT_METRICS_PATH = 'metrics.json';
export const DEFAULT_AI_SCORECARD_PATH = 'ai-scorecard.json';
export const DEFAULT_BENCHMARK_CONFIG_PATH = 'benchmark.json';
export const DEFAULT_BENCHMARK_REPORT_PATH = 'benchmark-report.json';

export const DEFAULT_IGNORED_DIRECTORIES = new Set([
  '.git',
  '.cache',
  '.gradle',
  '.hg',
  '.idea',
  '.mypy_cache',
  '.next',
  '.nuxt',
  '.pytest_cache',
  '.svn',
  '.tox',
  '.turbo',
  '.upgradelens',
  '.venv',
  '.yarn',
  '__pycache__',
  'bower_components',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'target',
  'vendor'
]);
