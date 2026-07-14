import { isIP } from 'node:net';

function unsafeIpLiteral(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const type = isIP(host);
  if (type === 4) {
    const [first, second] = host.split('.').map(Number);
    return first === 0 || first === 10 || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }
  if (type === 6) {
    return host === '::1' || host.startsWith('fc') || host.startsWith('fd')
      || /^fe[89ab]/.test(host) || host.startsWith('::ffff:');
  }
  return false;
}

function publicHostname(hostname) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host !== 'localhost' && !host.endsWith('.localhost') && !unsafeIpLiteral(host);
}

function normalizedPath(url) {
  let pathname = url.pathname.replace(/\/+$/g, '') || '/';
  if (url.hostname.toLowerCase() === 'github.com') {
    pathname = pathname.replace(/\.git$/i, '').replace(/\/+$/g, '') || '/';
  }
  return pathname;
}

/**
 * Convert a publisher-provided public URL into its portable form. This helper
 * performs no DNS lookup, redirect handling, or network access.
 */
export function canonicalizeSourceUrl(value, { role = null } = {}) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const raw = value.trim();
  const gitHttps = /^git\+https:/i.test(raw);
  if (gitHttps && role !== 'repository') return null;
  const candidate = gitHttps ? raw.replace(/^git\+/i, '') : raw;

  let url;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || !publicHostname(url.hostname)) {
    return null;
  }

  url.hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  url.hash = '';
  const pathname = normalizedPath(url);
  return `${url.protocol}//${url.host}${pathname === '/' ? '' : pathname}`;
}

export function isCanonicalPublicSourceUrl(value) {
  return canonicalizeSourceUrl(value) === value;
}
