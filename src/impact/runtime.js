import { loadImpactAnalysisInputs } from './input-loader.js';
import { createExactSymbolImpactMatcher } from './matcher.js';
import { buildRepositoryImpact } from './repository-impact.js';

export function analyzeRepositoryImpact({
  versionAnalysis,
  usageIndex,
  input,
  matcher = createExactSymbolImpactMatcher(),
  clock
}) {
  return buildRepositoryImpact({
    input,
    versionAnalysis,
    usageIndex,
    matcher,
    generatedAt: clock?.() ?? new Date()
  });
}

export async function runImpactAnalysis({ sources, ...options }) {
  const artifacts = await loadImpactAnalysisInputs(sources, options);
  return analyzeRepositoryImpact({ ...artifacts, ...options });
}
