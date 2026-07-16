import { compareText } from '../portable.js';

export const EXACT_SYMBOL_MATCHER_ID = 'exact-symbol';
export const EXACT_SYMBOL_MATCHER_VERSION = '1.0.0';

const SYNTHETIC_SYMBOLS = new Set(['*', 'default']);
const IDENTIFIER_CHARACTER = '\\p{L}\\p{N}\\p{M}\\p{Pc}$\\u200C\\u200D';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function isMatchableUsageSymbol(symbol) {
  return typeof symbol === 'string' && symbol.length > 0 && !SYNTHETIC_SYMBOLS.has(symbol);
}

export function summaryContainsExactSymbol(summary, symbol) {
  if (typeof summary !== 'string' || !isMatchableUsageSymbol(symbol)) return false;
  const expression = new RegExp(
    `(?:^|[^${IDENTIFIER_CHARACTER}])${escapeRegExp(symbol)}(?=$|[^${IDENTIFIER_CHARACTER}])`,
    'u'
  );
  return expression.test(summary);
}

export function matchFindingToUsage(finding, dependencyUsage) {
  if (finding?.kind !== 'breakingChange' || !dependencyUsage) return [];
  return dependencyUsage.symbols
    .filter((usage) => summaryContainsExactSymbol(finding.summary, usage.name))
    .map((usage) => ({ symbol: usage.name, files: [...usage.files].sort(compareText) }))
    .sort((left, right) => compareText(left.symbol, right.symbol));
}

export function createExactSymbolImpactMatcher() {
  return Object.freeze({
    id: EXACT_SYMBOL_MATCHER_ID,
    version: EXACT_SYMBOL_MATCHER_VERSION,
    match: matchFindingToUsage
  });
}
