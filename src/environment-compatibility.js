const SUFFIXES = Object.freeze([
  'AI_PROVIDER',
  'AI_ENDPOINT',
  'AI_MODEL',
  'AI_AUTHORIZATION',
  'AI_TIMEOUT_MS',
  'AI_TIMEOUT_SECONDS',
  'AI_MAX_RESPONSE_BYTES',
  'AI_DEBUG'
]);

export const ENVIRONMENT_IDENTITY_MAP = Object.freeze(SUFFIXES.map((suffix) => Object.freeze({
  canonical: `DEPVERDICT_${suffix}`,
  legacy: `UPGRADELENS_${suffix}`,
  secret: suffix === 'AI_AUTHORIZATION'
})));

function configured(value) {
  return value !== undefined && value !== '';
}

/**
 * Resolve the supported identity-prefixed environment without exposing values.
 * The returned object retains unrelated environment keys for callers such as
 * NO_COLOR, and adds only the selected canonical identity keys.
 */
export function resolveIdentityEnvironment(env = {}, options = {}) {
  const source = env ?? {};
  const overrides = options.overrides ?? {};
  const diagnostics = options.diagnosticState ?? new Set();
  const resolved = { ...source };
  for (const key of Object.keys(resolved)) {
    if (key.startsWith('DEPVERDICT_') || key.startsWith('UPGRADELENS_')) {
      delete resolved[key];
    }
  }

  for (const mapping of ENVIRONMENT_IDENTITY_MAP) {
    const explicit = overrides[mapping.canonical];
    const canonical = source[mapping.canonical];
    const legacy = source[mapping.legacy];
    let value;

    if (configured(explicit)) {
      value = explicit;
    } else if (configured(canonical)) {
      value = canonical;
      if (configured(legacy)) {
        const key = `conflict:${mapping.canonical}`;
        if (!diagnostics.has(key)) {
          diagnostics.add(key);
          options.onDiagnostic?.(
            `ENVIRONMENT_IDENTITY_CONFLICT: ${mapping.canonical} overrides deprecated ${mapping.legacy}.`
          );
        }
      }
    } else if (configured(legacy)) {
      value = legacy;
      const key = `legacy:${mapping.canonical}`;
      if (!diagnostics.has(key)) {
        diagnostics.add(key);
        options.onDiagnostic?.(
          `LEGACY_ENVIRONMENT_USED: ${mapping.legacy} is deprecated; use ${mapping.canonical}.`
        );
      }
    }

    if (configured(value)) resolved[mapping.canonical] = value;
    else delete resolved[mapping.canonical];
  }

  return Object.freeze(resolved);
}

export function legacyEnvironmentKey(canonicalKey) {
  return ENVIRONMENT_IDENTITY_MAP.find(({ canonical }) => canonical === canonicalKey)?.legacy;
}
