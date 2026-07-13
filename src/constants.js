export const PRODUCT_NAME = 'UpgradeLens';
export const PACKAGE_NAME = 'upgradelens';
export const CLI_NAME = 'upgradelens';
export const VERSION = '0.1.1';
export const MANIFEST_SCHEMA_VERSION = '2.0.0';
export const DEFAULT_OUTPUT_DIRECTORY = '.upgradelens';
export const DEFAULT_MANIFEST_PATH = `${DEFAULT_OUTPUT_DIRECTORY}/project-manifest.json`;

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
