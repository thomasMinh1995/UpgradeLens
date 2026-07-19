export const AI_ENV_KEYS = Object.freeze([
  'DEPVERDICT_AI_PROVIDER',
  'DEPVERDICT_AI_ENDPOINT',
  'DEPVERDICT_AI_MODEL',
  'DEPVERDICT_AI_AUTHORIZATION',
  'DEPVERDICT_AI_TIMEOUT_MS',
  'DEPVERDICT_AI_TIMEOUT_SECONDS',
  'DEPVERDICT_AI_MAX_RESPONSE_BYTES',
  'DEPVERDICT_AI_DEBUG',
  'UPGRADELENS_AI_PROVIDER',
  'UPGRADELENS_AI_ENDPOINT',
  'UPGRADELENS_AI_MODEL',
  'UPGRADELENS_AI_AUTHORIZATION',
  'UPGRADELENS_AI_TIMEOUT_MS',
  'UPGRADELENS_AI_TIMEOUT_SECONDS',
  'UPGRADELENS_AI_MAX_RESPONSE_BYTES',
  'UPGRADELENS_AI_DEBUG'
]);

export const UPGRADELENS_AI_ENV_KEYS = AI_ENV_KEYS;

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
