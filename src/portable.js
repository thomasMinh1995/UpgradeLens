export function compareText(left = '', right = '') {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isPortableRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) return false;
  if (value.startsWith('/') || /^[A-Za-z]:/.test(value)) return false;
  return !value.split('/').includes('..');
}

export function isSorted(items, comparator) {
  return items.every((item, index) => index === 0 || comparator(items[index - 1], item) <= 0);
}
