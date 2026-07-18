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
export const USAGE_INDEX_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_USAGE_INDEX_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/usage-index.json`;
export const REPOSITORY_IMPACT_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_REPOSITORY_IMPACT_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/repository-impact.json`;
export const REPOSITORY_IMPACT_EVIDENCE_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_REPOSITORY_IMPACT_EVIDENCE_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/repository-impact-evidence.json`;
export const UPGRADE_DECISION_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_UPGRADE_DECISION_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/upgrade-decision.json`;
export const MIGRATION_CHECKLIST_SCHEMA_VERSION = '1.0.0';
export const DEFAULT_MIGRATION_CHECKLIST_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/migration-checklist.json`;
export const DEFAULT_MIGRATION_PLANNING_QUALIFICATION_PATH =
  `${DEFAULT_OUTPUT_DIRECTORY}/migration-planning-qualification.json`;
export const DEFAULT_REPOSITORY_IMPACT_REPORT_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/repository-impact.md`;
export const DEFAULT_ANALYSIS_LOG_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/logs/analyze.log`;
export const DEFAULT_EVALUATION_REPORT_PATH = 'evaluation-report.json';
export const DEFAULT_METRICS_PATH = 'metrics.json';
export const DEFAULT_AI_SCORECARD_PATH = 'ai-scorecard.json';
export const DEFAULT_BENCHMARK_CONFIG_PATH = 'benchmark.json';
export const DEFAULT_BENCHMARK_REPORT_PATH = 'benchmark-report.json';
export const DEFAULT_CONFORMANCE_REPORT_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/conformance-report.json`;
export const DEFAULT_GOVERNANCE_DIRECTORY = DEFAULT_OUTPUT_DIRECTORY;
export const CAPABILITY_PROFILE_FILENAME = 'capability-profile.json';
export const DEPLOYMENT_PROFILE_FILENAME = 'deployment-profile.json';
export const QUALIFICATION_RECORD_FILENAME = 'qualification-record.json';
export const DEFAULT_CAPABILITY_PROFILE_PATH = `${DEFAULT_GOVERNANCE_DIRECTORY}/${CAPABILITY_PROFILE_FILENAME}`;
export const DEFAULT_DEPLOYMENT_PROFILE_PATH = `${DEFAULT_GOVERNANCE_DIRECTORY}/${DEPLOYMENT_PROFILE_FILENAME}`;
export const DEFAULT_QUALIFICATION_RECORD_PATH = `${DEFAULT_GOVERNANCE_DIRECTORY}/${QUALIFICATION_RECORD_FILENAME}`;

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
