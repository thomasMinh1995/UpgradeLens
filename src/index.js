export {
  CLI_NAME,
  CAPABILITY_PROFILE_FILENAME,
  DEFAULT_ANALYSIS_LOG_PATH,
  DEFAULT_AI_SCORECARD_PATH,
  DEFAULT_BENCHMARK_CONFIG_PATH,
  DEFAULT_BENCHMARK_REPORT_PATH,
  DEFAULT_CAPABILITY_PROFILE_PATH,
  DEFAULT_CONFORMANCE_REPORT_PATH,
  DEPLOYMENT_PROFILE_FILENAME,
  DEFAULT_DEPLOYMENT_PROFILE_PATH,
  DEFAULT_EVALUATION_REPORT_PATH,
  DEFAULT_MANIFEST_PATH,
  DEFAULT_METRICS_PATH,
  DEFAULT_OUTPUT_DIRECTORY,
  DEFAULT_GOVERNANCE_DIRECTORY,
  DEFAULT_QUALIFICATION_RECORD_PATH,
  QUALIFICATION_RECORD_FILENAME,
  DEFAULT_VERSION_ANALYSIS_PATH,
  DEFAULT_USAGE_INDEX_PATH,
  DEFAULT_REPOSITORY_IMPACT_PATH,
  DEFAULT_REPOSITORY_IMPACT_EVIDENCE_PATH,
  DEFAULT_REPOSITORY_IMPACT_REPORT_PATH,
  DEFAULT_MIGRATION_CHECKLIST_PATH,
  DEFAULT_MIGRATION_PLANNING_QUALIFICATION_PATH,
  MANIFEST_SCHEMA_VERSION,
  MIGRATION_CHECKLIST_SCHEMA_VERSION,
  PACKAGE_NAME,
  PRODUCT_NAME,
  VERSION_ANALYSIS_SCHEMA_VERSION,
  USAGE_INDEX_SCHEMA_VERSION,
  REPOSITORY_IMPACT_SCHEMA_VERSION,
  REPOSITORY_IMPACT_EVIDENCE_SCHEMA_VERSION,
  VERSION
} from './constants.js';
export { discoverProject } from './discovery.js';
export { loadProjectManifestInput } from './project-manifest-input.js';
export { createUsageAnalyzerRegistry } from './usage/analyzer-registry.js';
export { UsageDiscoveryInputError, loadUsageDiscoveryInputs } from './usage/input-loader.js';
export {
  JAVASCRIPT_SOURCE_EXTENSIONS,
  JAVASCRIPT_USAGE_ANALYZER_ID,
  JAVASCRIPT_USAGE_ANALYZER_VERSION,
  analyzeJavaScriptUsage,
  createJavaScriptUsageAnalyzer,
  npmPackageName
} from './usage/js/analyzer.js';
export { parseJavaScriptModule, parseJavaScriptSource } from './usage/js/parser.js';
export { createDefaultUsageAnalyzerRegistry, discoverRepositoryUsage, runUsageDiscovery } from './usage/runtime.js';
export { collectRepositorySourceFiles, collectUsageSourceFiles } from './usage/source-files.js';
export { buildUsageIndex, validateUsageIndex, validateUsageIndexInvariants } from './usage/usage-index.js';
export { serializeUsageIndex, writeUsageIndex } from './usage/writer.js';
export { ImpactAnalysisInputError, loadImpactAnalysisInputs } from './impact/input-loader.js';
export {
  EXACT_SYMBOL_MATCHER_ID,
  EXACT_SYMBOL_MATCHER_VERSION,
  createExactSymbolImpactMatcher,
  isMatchableUsageSymbol,
  matchFindingToUsage,
  summaryContainsExactSymbol
} from './impact/matcher.js';
export {
  buildRepositoryImpact,
  validateRepositoryImpact,
  validateRepositoryImpactInvariants
} from './impact/repository-impact.js';
export { analyzeRepositoryImpact, runImpactAnalysis } from './impact/runtime.js';
export { serializeRepositoryImpact, writeRepositoryImpact } from './impact/writer.js';
export { ImpactEvidenceInputError, loadImpactEvidenceInputs } from './impact-evidence/input-loader.js';
export {
  IMPACT_EVIDENCE_GENERATOR_ID,
  IMPACT_EVIDENCE_GENERATOR_VERSION,
  IMPACT_EVIDENCE_REASON_CODES,
  buildRepositoryImpactEvidence,
  validateRepositoryImpactEvidence,
  validateRepositoryImpactEvidenceInvariants
} from './impact-evidence/repository-impact-evidence.js';
export {
  generateRepositoryImpactEvidence,
  runImpactEvidenceGeneration
} from './impact-evidence/runtime.js';
export {
  serializeRepositoryImpactEvidence,
  writeRepositoryImpactEvidence
} from './impact-evidence/writer.js';
export {
  MIGRATION_CHECKLIST_ELIGIBILITY_REASON_CODES,
  MIGRATION_CHECKLIST_ELIGIBILITY_STATUSES,
  MIGRATION_CHECKLIST_ITEM_BASES,
  MIGRATION_CHECKLIST_ITEM_KINDS,
  MIGRATION_CHECKLIST_PROHIBITED_CAPABILITIES,
  MIGRATION_CHECKLIST_STATUSES,
  isActionableMigrationChecklistItem,
  migrationChecklistEligibility,
  migrationChecklistStatusForEligibility,
  validateMigrationChecklistInstructionContent
} from './migration-checklist/grounding-policy.js';
export {
  buildMigrationChecklist,
  migrationChecklistItemId,
  serializeMigrationChecklist,
  validateMigrationChecklist,
  validateMigrationChecklistInvariants
} from './migration-checklist/migration-checklist.js';
export {
  MigrationChecklistInputError,
  loadMigrationChecklistInputs,
  validateMigrationChecklistInputLineage,
  validateMigrationChecklistInputReferences
} from './migration-checklist/input-loader.js';
export {
  DEFAULT_MIGRATION_CONTEXT_MAX_EVIDENCE_CHARACTERS,
  DEFAULT_MIGRATION_CONTEXT_MAX_EVIDENCE_ITEMS,
  DEFAULT_MIGRATION_CONTEXT_MAX_FINDING_SUMMARY_CHARACTERS,
  MIGRATION_LOCATION_REASON_CODES,
  MIGRATION_TASK_CONTEXT_VERSION,
  buildMigrationTaskContexts,
  classifyMigrationEligibility,
  prepareMigrationChecklistContexts
} from './migration-checklist/context-runtime.js';
export {
  MIGRATION_CANDIDATE_ABSTENTION_REASONS,
  MIGRATION_CANDIDATE_STATUSES,
  MIGRATION_CHECKLIST_CANDIDATE_ERROR_CODES,
  MIGRATION_CHECKLIST_CANDIDATE_SCHEMA,
  MIGRATION_CHECKLIST_TRUST_ERROR_CODES,
  MigrationChecklistCandidateError,
  MigrationChecklistTrustError,
  isMigrationChecklistCandidateError,
  isMigrationChecklistTrustError,
  trustValidateMigrationChecklistCandidate,
  validateMigrationChecklistCandidate
} from './migration-checklist/ai-candidate.js';
export {
  MIGRATION_PLANNING_PROMPT_VERSION,
  MIGRATION_PLANNING_SCHEMA_NAME,
  MIGRATION_PLANNING_TASK,
  buildMigrationChecklistPrompt,
  buildMigrationChecklistPromptContext
} from './migration-checklist/prompt.js';
export {
  MIGRATION_GENERATION_RESULT_VERSION,
  MIGRATION_EXTRACTIVE_GENERATION_RESULT_VERSION,
  MIGRATION_GENERATION_WARNING_CODES,
  generateMigrationExtractiveChecklistDrafts,
  generateMigrationExtractiveChecklistForContext,
  generateMigrationChecklistDrafts,
  generateMigrationChecklistForContext
} from './migration-checklist/generator.js';
export {
  MIGRATION_EXTRACTIVE_CANDIDATE_CONTRACT,
  MIGRATION_EXTRACTIVE_CANDIDATE_ERROR_CODES,
  MIGRATION_EXTRACTIVE_CANDIDATE_SCHEMA,
  MIGRATION_EXTRACTIVE_PRESENTATION,
  MIGRATION_EXTRACTIVE_PRESENTATION_PREFIX,
  MIGRATION_EXTRACTIVE_TRUST_POLICY,
  MigrationExtractiveCandidateError,
  isMigrationExtractiveCandidateError,
  migrationExtractiveCandidateSchemaDigest,
  trustValidateMigrationExtractiveCandidate,
  validateMigrationExtractiveCandidate
} from './migration-checklist/extractive-candidate.js';
export {
  MIGRATION_EXTRACTIVE_PLANNING_TASK,
  MIGRATION_EXTRACTIVE_PROMPT_VERSION,
  MIGRATION_EXTRACTIVE_SCHEMA_NAME,
  buildMigrationExtractivePrompt,
  migrationExtractivePromptDigest
} from './migration-checklist/extractive-prompt.js';
export { assembleMigrationChecklist } from './migration-checklist/assembler.js';
export {
  MIGRATION_QUALIFICATION_STATES,
  MigrationQualificationError,
  createMigrationQualificationSourceFailureDecision,
  decideMigrationQualification,
  migrationQualificationErrorForDecision,
  migrationQualificationIdentityDigest,
  normalizedMigrationRuntimeMetadata,
  evaluateMigrationQualification
} from './migration-checklist/qualification-guard.js';
export {
  MIGRATION_PLANNING_QUALIFICATION_RECORD_SCHEMA_VERSION,
  MigrationQualificationStoreError,
  buildMigrationPlanningQualificationRecord,
  loadMigrationPlanningQualificationRecord,
  serializeMigrationPlanningQualificationRecord,
  validateMigrationPlanningQualificationRecord,
  validateMigrationPlanningQualificationRecordSchema,
  writeMigrationPlanningQualificationRecord
} from './migration-checklist/qualification-store.js';
export {
  resolveMigrationQualification
} from './migration-checklist/qualification-resolution.js';
export {
  MigrationChecklistWriterError,
  writeMigrationChecklist
} from './migration-checklist/writer.js';
export {
  MIGRATION_PROGRESS_EVENTS,
  createMigrationProgressReporter
} from './migration-checklist/progress.js';
export {
  buildMigrationChecklistViewModel,
  renderMigrationChecklistConsole,
  renderMigrationChecklistMarkdownSection
} from './migration-checklist/presentation.js';
export {
  MIGRATION_CHECKLIST_STAGE_ID,
  MIGRATION_CHECKLIST_STAGE_LABEL,
  runMigrationChecklistStage
} from './migration-checklist/runtime.js';
export {
  DEFAULT_MIGRATION_EVALUATION_DATASET_PATH,
  MIGRATION_EVALUATION_DATASET_ID,
  MIGRATION_EVALUATION_DATASET_VERSION,
  buildMigrationEvaluationContext,
  buildMigrationEvaluationPrepared,
  buildMigrationPolicyProbeCandidate,
  createMigrationGoldenFakeRuntime,
  loadMigrationEvaluationDataset,
  migrationEvaluationDatasetDigest,
  validateMigrationEvaluationDataset
} from './migration-checklist/evaluation/dataset.js';
export {
  compareMigrationEvaluationCase,
  evaluateMigrationPolicyProbes
} from './migration-checklist/evaluation/comparator.js';
export {
  MIGRATION_EVALUATION_METRICS_VERSION,
  computeMigrationEvaluationMetrics
} from './migration-checklist/evaluation/metrics.js';
export {
  MIGRATION_GENERATOR_TRUST_SOURCE_IDENTITY,
  MIGRATION_QUALIFICATION_POLICY,
  MIGRATION_QUALIFICATION_POLICY_VERSION,
  MIGRATION_QUALIFICATION_VERDICTS,
  migrationCandidateSchemaDigest,
  migrationQualificationPolicyDigest,
  qualifyMigrationPlanningRuntime
} from './migration-checklist/evaluation/qualification.js';
export {
  MIGRATION_EVALUATION_REPORT_VERSION,
  runMigrationEvaluation
} from './migration-checklist/evaluation/runner.js';
export {
  buildMigrationEvaluationScorecard,
  renderMigrationEvaluationScorecard
} from './migration-checklist/evaluation/scorecard.js';
export {
  MIGRATION_ACTION_COMPARATOR_VERSION,
  MIGRATION_ACTION_EVALUATION_CRITERIA_ID,
  MIGRATION_ACTION_EVALUATION_CRITERIA_VERSION,
  MIGRATION_ACTION_NORMALIZATION_VERSION,
  MIGRATION_ACTION_SUPPORT_STATUSES,
  evaluateMigrationActionInstruction,
  migrationActionEvaluationCriteriaDigest,
  migrationActionEvaluationCriteriaIdentity,
  normalizeMigrationActionText,
  validateMigrationActionCriteria
} from './migration-checklist/evaluation/action-criteria.js';
export {
  DEFAULT_MIGRATION_EVALUATION_DATASET_V2_PATH,
  MIGRATION_EVALUATION_DATASET_V2_VERSION,
  MIGRATION_EVALUATION_FIXTURE_ROLES,
  loadMigrationEvaluationDatasetV2,
  loadVersionedMigrationEvaluationDataset,
  migrationEvaluationDatasetV2Digest,
  resolveMigrationEvaluationV2Case,
  validateMigrationEvaluationDatasetV2
} from './migration-checklist/evaluation/dataset-v2.js';
export { compareMigrationEvaluationCaseV2 } from './migration-checklist/evaluation/comparator-v2.js';
export {
  MIGRATION_EVALUATION_METRICS_V2_VERSION,
  computeMigrationEvaluationMetricsV2
} from './migration-checklist/evaluation/metrics-v2.js';
export {
  MIGRATION_EXTRACTIVE_GENERATOR_TRUST_SOURCE_IDENTITY,
  MIGRATION_EXTRACTIVE_QUALIFICATION_POLICY_V2,
  MIGRATION_EXTRACTIVE_QUALIFICATION_POLICY_V2_VERSION,
  MIGRATION_QUALIFICATION_POLICY_V2,
  MIGRATION_QUALIFICATION_POLICY_V2_VERSION,
  migrationExtractiveQualificationPolicyV2Digest,
  migrationQualificationPolicyV2Digest,
  qualifyMigrationExtractiveRuntimeV2,
  qualifyMigrationPlanningRuntimeV2
} from './migration-checklist/evaluation/qualification-v2.js';
export {
  MIGRATION_EXTRACTIVE_EVALUATION_REPORT_V2_VERSION,
  MIGRATION_EVALUATION_REPORT_V2_VERSION,
  runMigrationExtractiveEvaluationV2,
  runMigrationEvaluationV2
} from './migration-checklist/evaluation/runner-v2.js';
export {
  buildMigrationEvaluationScorecardV2,
  renderMigrationEvaluationScorecardV2
} from './migration-checklist/evaluation/scorecard-v2.js';
export {
  ANALYSIS_STAGES,
  MIGRATION_CHECKLIST_ANALYSIS_STAGE,
  PipelineStageError,
  createAnalysisStages,
  runAnalysisPipeline
} from './orchestration/pipeline.js';
export { createProgressReporter } from './orchestration/progress-reporter.js';
export { renderAnalysisFailureLog, writeAnalysisFailureLog } from './orchestration/failure-log.js';
export { writeTextArtifact } from './orchestration/text-writer.js';
export { renderConsoleSummary } from './renderers/console.js';
export {
  ANALYSIS_PRESENTATION_STATUSES,
  DEPENDENCY_IMPACT_STATUSES,
  buildImpactPresentationViewModel
} from './renderers/impact-presentation.js';
export { renderMarkdownReport } from './renderers/markdown.js';
export { createResearchPlan, validateResearchPlan } from './research-plan.js';
export {
  AI_RUNTIME_CONTRACT_VERSION,
  createHttpJsonAiProvider,
  createProviderAiRuntime,
  validateAiRuntime
} from './ai-runtime.js';
export {
  AI_RUNTIME_ERROR_CODES,
  AiRuntimeError,
  isAiRuntimeError
} from './ai-runtime-error.js';
export {
  buildErrorDebugRecord,
  buildRequestDebugRecord,
  buildResponseDebugRecord,
  buildSchemaDiagnostics,
  isAiRuntimeDebugEnabled,
  parseProviderErrorDescriptor,
  sanitizeDebugText,
  writeAiRuntimeDebugRecord
} from './ai-runtime-debug.js';
export {
  DEFAULT_AI_MAX_RESPONSE_BYTES,
  DEFAULT_AI_TIMEOUT_MS,
  createOpenAiCompatibleProvider,
  validateOpenAiCompatibleEndpoint
} from './openai-compatible-provider.js';
export {
  AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA,
  AI_VERSION_ANALYSIS_RESULT_VERSION,
  VERSION_ANALYSIS_PROMPT_VERSION,
  VERSION_ANALYSIS_SCHEMA_NAME,
  VERSION_ANALYSIS_TASK,
  analyzeDependencyAiContext,
  buildVersionAnalysisPrompt,
  humanReviewPolicy,
  trustValidateAiVersionAnalysisCandidate
} from './ai-version-analysis.js';
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
  DEFAULT_EVIDENCE_CONTENT_CHARACTERS,
  DEFAULT_EVIDENCE_DOCUMENT_BYTES,
  DEFAULT_EVIDENCE_SOURCE_LIMIT,
  DEFAULT_EVIDENCE_TTL_MS,
  classifyEvidenceContent,
  createEvidenceSourceAdapter,
  discoverEvidenceSourceRequests,
  normalizeEvidenceContent
} from './evidence-source-adapter.js';
export {
  createDefaultEcosystemVersionAdapterRegistry,
  getEcosystemVersionAdapter
} from './ecosystem-version-adapter.js';
export {
  KNOWLEDGE_EVIDENCE_BUNDLE_SCHEMA_VERSION,
  validateKnowledgeEvidenceBundle,
  validateKnowledgeEvidenceBundleInvariants
} from './knowledge-evidence-bundle.js';
export {
  buildKnowledgeEvidenceBundle,
  serializeKnowledgeEvidenceBundle,
  writeKnowledgeEvidenceBundle
} from './knowledge-evidence-producer.js';
export {
  DEFAULT_KNOWLEDGE_EVIDENCE_BUNDLE_PATH,
  loadKnowledgeEvidenceBundleInput,
  loadKnowledgeManifestInput,
  loadVersionAnalysisArtifacts
} from './version-analysis-loader.js';
export {
  VERSION_ANALYSIS_SCHEMA_VERSION as VERSION_ANALYSIS_MANIFEST_SCHEMA_VERSION,
  buildVersionAnalysisManifest,
  validateVersionAnalysisManifest,
  validateVersionAnalysisManifestInvariants,
  versionAnalysisManifestDigest
} from './version-analysis-manifest.js';
export {
  serializeVersionAnalysisManifest,
  writeVersionAnalysisManifest
} from './version-analysis-writer.js';
export {
  compareEvaluationResult
} from './evaluation-comparator.js';
export {
  EVALUATION_REPORT_SCHEMA_VERSION,
  buildEvaluationReport,
  serializeEvaluationReport,
  validateEvaluationReport
} from './evaluation-report.js';
export {
  DEFAULT_EVALUATION_DATASET_PATH,
  DEFAULT_EVALUATION_REPORT_PATH as DEFAULT_EVALUATION_RUNNER_REPORT_PATH,
  createGoldenFakeRuntime,
  loadGoldenDataset,
  runEvaluation,
  writeEvaluationReport
} from './evaluation-runner.js';
export {
  DEFAULT_METRICS_PATH as DEFAULT_METRICS_ENGINE_PATH,
  METRICS_SCHEMA_VERSION,
  buildMetrics,
  loadEvaluationReportForMetrics,
  metricsDigest,
  serializeMetrics,
  validateMetrics,
  writeMetrics
} from './metrics-engine.js';
export {
  AI_SCORECARD_SCHEMA_VERSION,
  DEFAULT_AI_SCORECARD_PATH as DEFAULT_AI_SCORECARD_ARTIFACT_PATH,
  buildAiScorecard,
  serializeAiScorecard,
  validateAiScorecard,
  writeAiScorecard
} from './ai-scorecard.js';
export {
  BENCHMARK_SCHEMA_VERSION,
  DEFAULT_BENCHMARK_CONFIG_PATH as DEFAULT_BENCHMARK_RUNNER_CONFIG_PATH,
  loadBenchmarkConfig,
  runBenchmark,
  validateBenchmarkConfig
} from './benchmark-runner.js';
export {
  BENCHMARK_REPORT_SCHEMA_VERSION,
  DEFAULT_BENCHMARK_REPORT_PATH as DEFAULT_BENCHMARK_RUNNER_REPORT_PATH,
  buildBenchmarkReport,
  serializeBenchmarkReport,
  validateBenchmarkReport,
  writeBenchmarkReport
} from './benchmark-report.js';
export {
  RUNTIME_CONFORMANCE_CAPABILITIES,
  RUNTIME_CONFORMANCE_CASES,
  RUNTIME_CONFORMANCE_OUTPUT_SCHEMA,
  RuntimeConformanceValidationError,
  normalizeConformanceError,
  validateRuntimeConformanceOutput
} from './runtime-conformance.js';
export {
  createOfflineConformanceExecutor,
  runConformance
} from './conformance-runner.js';
export {
  CONFORMANCE_REPORT_SCHEMA_VERSION,
  buildConformanceReport,
  conformanceReportDigest,
  serializeConformanceReport,
  validateConformanceReport,
  writeConformanceReport
} from './conformance-report.js';
export {
  GOVERNANCE_SCHEMA_VERSION,
  OFFLINE_CONFORMANCE_ENDPOINT,
  buildCapabilityProfile,
  buildDeploymentProfile,
  buildQualificationRecord,
  assertNoGovernanceSecrets,
  capabilityProfileDigest,
  createDefaultGovernanceArtifacts,
  deploymentProfileDigest,
  qualificationRecordDigest,
  serializeCapabilityProfile,
  serializeDeploymentProfile,
  serializeGovernanceArtifacts,
  serializeQualificationRecord,
  validateCapabilityProfile,
  validateCapabilityProfileSchema,
  validateDeploymentProfile,
  validateDeploymentProfileSchema,
  validateQualificationRecord,
  validateQualificationRecordSchema,
  writeCapabilityProfile,
  writeDeploymentProfile,
  writeGovernanceArtifacts,
  writeQualificationRecord
} from './governance-metadata.js';
export {
  GOVERNANCE_DIAGNOSTIC_CODES,
  GOVERNANCE_VALIDATION_STAGES,
  createGovernanceDiagnostic,
  sortGovernanceDiagnostics
} from './governance-diagnostics.js';
export { validateGovernanceArtifacts } from './governance-validator.js';
export { loadGovernanceBundle } from './governance-loader.js';
