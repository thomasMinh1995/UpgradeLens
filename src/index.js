export {
  CLI_NAME,
  DEFAULT_MANIFEST_PATH,
  DEFAULT_OUTPUT_DIRECTORY,
  MANIFEST_SCHEMA_VERSION,
  PACKAGE_NAME,
  PRODUCT_NAME,
  VERSION
} from './constants.js';
export { discoverProject } from './discovery.js';
export { loadProjectManifestInput } from './project-manifest-input.js';
export { createResearchPlan, validateResearchPlan } from './research-plan.js';
export {
  AI_RUNTIME_CONTRACT_VERSION,
  validateAiRuntime
} from './ai-runtime.js';
export {
  DEPENDENCY_AI_CONTEXT_VERSION,
  buildDependencyAiContext,
  dependencyAiContextDigest,
  dependencyAiContextsEqual,
  resolveDependencyAnalysisInput,
  resolveDependencyAnalysisInputs,
  resolveTargetVersion,
  resolveVersionBaseline,
  selectEvidence
} from './dependency-ai-context.js';
export {
  createDefaultEcosystemVersionAdapterRegistry,
  getEcosystemVersionAdapter
} from './ecosystem-version-adapter.js';
export {
  KNOWLEDGE_EVIDENCE_BUNDLE_SCHEMA_VERSION,
  validateKnowledgeEvidenceBundleInvariants
} from './knowledge-evidence-bundle.js';
export {
  DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH,
  loadKnowledgeEvidenceBundleInput,
  loadKnowledgeManifestInput,
  loadVersionAnalysisArtifacts
} from './version-analysis-loader.js';
