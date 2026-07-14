import { compareText } from '../portable.js';

const PRIVATE_KEYS = new Set([
  'authorization', 'proxyauthorization', 'cookie', 'setcookie', 'etag',
  'lastmodified', 'headers', 'cachekey', 'stack', 'password', 'credential',
  'credentials', 'secret', 'token', 'accesstoken', 'apikey', 'clientsecret', 'privatekey'
]);

function plainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function privateKey(key) {
  return PRIVATE_KEYS.has(key.toLowerCase().replace(/[-_]/g, ''));
}

function unsafeStoredString(value) {
  return value.startsWith('/')
    || /^[A-Za-z]:[\\/]/.test(value)
    || /[a-z][a-z0-9+.-]*:\/\/[^/?#]*@/i.test(value);
}

function sanitizeStoredString(value) {
  if (unsafeStoredString(value)) return null;
  const prefix = value.startsWith('git+') ? 'git+' : '';
  const candidate = prefix ? value.slice(prefix.length) : value;
  try {
    const url = new URL(candidate);
    if (!['http:', 'https:', 'ssh:', 'git:'].includes(url.protocol)) return value;
    if (url.username || url.password) return null;
    url.search = '';
    url.hash = '';
    return `${prefix}${url.toString()}`;
  } catch {
    return value;
  }
}

/** Keep publisher-controlled response bodies safe for private cache storage. */
export function sanitizeRegistryBodyForCache(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return sanitizeStoredString(value);
  if (Array.isArray(value)) return value.map(sanitizeRegistryBodyForCache);
  if (!plainObject(value)) return null;
  return Object.fromEntries(Object.keys(value).sort(compareText).flatMap((key) => {
    if (privateKey(key)) return [];
    return [[key, sanitizeRegistryBodyForCache(value[key])]];
  }));
}
