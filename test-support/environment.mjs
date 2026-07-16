export const UPGRADELENS_AI_ENV_KEYS = Object.freeze([
  'UPGRADELENS_AI_PROVIDER',
  'UPGRADELENS_AI_ENDPOINT',
  'UPGRADELENS_AI_MODEL',
  'UPGRADELENS_AI_AUTHORIZATION',
  'UPGRADELENS_AI_TIMEOUT_MS',
  'UPGRADELENS_AI_DEBUG'
]);

const PLATFORM_ENV_KEYS = Object.freeze([
  'PATH',
  'HOME',
  'TMPDIR',
  'TMP',
  'TEMP',
  'SystemRoot',
  'ComSpec',
  'PATHEXT',
  'LANG',
  'LC_ALL',
  'LC_CTYPE'
]);

/** Build the minimal platform environment used by spawned CLI test processes. */
export function createSanitizedTestEnvironment(parent = process.env, overrides = {}) {
  const env = {};
  for (const key of PLATFORM_ENV_KEYS) {
    if (parent[key] !== undefined) env[key] = String(parent[key]);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) env[key] = String(value);
  }
  return env;
}
