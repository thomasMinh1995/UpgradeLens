import { loadImpactEvidenceInputs } from './input-loader.js';
import { buildRepositoryImpactEvidence } from './repository-impact-evidence.js';

export function generateRepositoryImpactEvidence({ repositoryImpact, usageIndex, input, clock }) {
  return buildRepositoryImpactEvidence({
    input,
    repositoryImpact,
    usageIndex,
    generatedAt: clock?.() ?? new Date()
  });
}

export async function runImpactEvidenceGeneration({ sources, ...options }) {
  const artifacts = await loadImpactEvidenceInputs(sources, options);
  return generateRepositoryImpactEvidence({ ...artifacts, ...options });
}
