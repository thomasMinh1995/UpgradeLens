import { compareText } from './portable.js';

export class CanonicalJsonError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CanonicalJsonError';
    this.code = 'KNOWLEDGE_CACHE_INVALID_BODY';
  }
}

function fail(path, message) {
  throw new CanonicalJsonError(`Invalid JSON value at ${path}: ${message}`);
}

/**
 * Serialize a JSON-compatible value with code-unit-sorted object keys. Arrays
 * retain their order, so their order remains part of the content digest.
 */
export function canonicalJson(value) {
  const ancestors = new Set();

  function serialize(current, currentPath) {
    if (current === null) return 'null';

    switch (typeof current) {
      case 'string':
        return JSON.stringify(current);
      case 'boolean':
        return current ? 'true' : 'false';
      case 'number':
        if (!Number.isFinite(current)) fail(currentPath, 'numbers must be finite.');
        return JSON.stringify(current);
      case 'undefined':
      case 'function':
      case 'symbol':
      case 'bigint':
        fail(currentPath, `${typeof current} values are not JSON-compatible.`);
      case 'object':
        break;
      default:
        fail(currentPath, 'unsupported value type.');
    }

    if (ancestors.has(current)) fail(currentPath, 'circular references are not supported.');
    ancestors.add(current);
    try {
      if (Array.isArray(current)) {
        return `[${current.map((item, index) => serialize(item, `${currentPath}[${index}]`)).join(',')}]`;
      }

      const prototype = Object.getPrototypeOf(current);
      if (prototype !== Object.prototype && prototype !== null) {
        fail(currentPath, 'objects must be plain JSON objects.');
      }
      const entries = Object.keys(current)
        .sort(compareText)
        .map((key) => `${JSON.stringify(key)}:${serialize(current[key], `${currentPath}.${key}`)}`);
      return `{${entries.join(',')}}`;
    } finally {
      ancestors.delete(current);
    }
  }

  return serialize(value, '$');
}

export function canonicalJsonBytes(value) {
  return Buffer.from(canonicalJson(value), 'utf8');
}
