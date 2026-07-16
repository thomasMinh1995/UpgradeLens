const PROVIDER_UNSUPPORTED_GENERATION_KEYWORDS = new Set(['uniqueItems']);
const MAX_SCHEMA_DEPTH = 256;
const MAX_SCHEMA_NODES = 100_000;

function projectionError(message) {
  return new TypeError(`Provider-facing structured output schema projection failed: ${message}`);
}

/**
 * Provider structured-output implementations may support only a JSON Schema
 * subset. Real conformance probes rejected uniqueItems, so generation omits it
 * while the unchanged exact local schema remains the validation authority.
 */
export function projectStructuredOutputSchemaForProvider(schema) {
  const active = new WeakSet();
  let visitedNodes = 0;

  function project(value, depth) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw projectionError('numbers must be finite JSON values.');
      return value;
    }
    if (['undefined', 'bigint', 'function', 'symbol'].includes(typeof value)) {
      throw projectionError('schema must contain only JSON values.');
    }
    if (depth > MAX_SCHEMA_DEPTH) throw projectionError('schema nesting is too deep.');
    if (active.has(value)) throw projectionError('circular schema input is not supported.');
    visitedNodes += 1;
    if (visitedNodes > MAX_SCHEMA_NODES) throw projectionError('schema is too large.');

    active.add(value);
    try {
      if (Array.isArray(value)) {
        const output = [];
        for (let index = 0; index < value.length; index += 1) {
          if (!Object.hasOwn(value, index)) throw projectionError('sparse arrays are not JSON-safe.');
          output.push(project(value[index], depth + 1));
        }
        return output;
      }

      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw projectionError('schema objects must be plain JSON objects.');
      }
      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw projectionError('symbol properties are not JSON-safe.');
      }
      const entries = [];
      for (const key of Object.keys(value)) {
        if (PROVIDER_UNSUPPORTED_GENERATION_KEYWORDS.has(key)) continue;
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
          throw projectionError('schema accessors are not supported.');
        }
        entries.push([key, project(descriptor.value, depth + 1)]);
      }
      return Object.fromEntries(entries);
    } finally {
      active.delete(value);
    }
  }

  return project(schema, 0);
}
