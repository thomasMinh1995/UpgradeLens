import { createHash } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA,
  VERSION_ANALYSIS_PROMPT_VERSION,
  analyzeDependencyAiContext
} from './ai-version-analysis.js';
import { compareEvaluationResult } from './evaluation-comparator.js';
import {
  buildEvaluationReport,
  serializeEvaluationReport
} from './evaluation-report.js';
import { compareText } from './portable.js';

export const DEFAULT_EVALUATION_DATASET_PATH = 'eval/datasets';
export const DEFAULT_EVALUATION_REPORT_PATH = 'evaluation-report.json';

const expectedResultSchema = JSON.parse(await readFile(
  new URL('../eval/schemas/expected-result.schema.json', import.meta.url),
  'utf8'
));
const goldenCaseSchema = JSON.parse(await readFile(
  new URL('../eval/schemas/golden-case.schema.json', import.meta.url),
  'utf8'
));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
ajv.addSchema(expectedResultSchema);
const validateGoldenCaseSchema = ajv.compile(goldenCaseSchema);

function digest(value) {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function datasetError(message) {
  return new Error(`Evaluation Dataset error: ${message}`);
}

async function jsonFile(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) throw datasetError(`${file} is not valid JSON.`);
    throw error;
  }
}

async function collectJsonFiles(inputPath) {
  const stats = await readdir(inputPath, { withFileTypes: true }).catch(async (error) => {
    if (error.code === 'ENOTDIR') return null;
    throw error;
  });
  if (stats === null) return inputPath.endsWith('.json') ? [inputPath] : [];
  const files = [];
  for (const entry of stats) {
    const child = path.join(inputPath, entry.name);
    if (entry.isDirectory()) files.push(...await collectJsonFiles(child));
    else if (entry.name.endsWith('.json')) files.push(child);
  }
  return files.sort(compareText);
}

export async function loadGoldenDataset(datasetPath = DEFAULT_EVALUATION_DATASET_PATH) {
  const root = path.resolve(datasetPath);
  const files = await collectJsonFiles(root);
  if (files.length === 0) throw datasetError(`no JSON golden cases found at ${datasetPath}.`);
  const cases = [];
  for (const file of files) {
    const value = await jsonFile(file);
    if (!validateGoldenCaseSchema(value)) {
      throw datasetError(`${file} failed schema validation: ${ajv.errorsText(validateGoldenCaseSchema.errors, { separator: '; ' })}`);
    }
    cases.push(value);
  }
  const ids = cases.map((item) => item.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index).sort(compareText);
  if (duplicates.length > 0) throw datasetError(`duplicate case id ${duplicates[0]}.`);
  return {
    datasetPath: root,
    datasetVersion: cases[0]?.schemaVersion ?? '1.0.0',
    cases: cases.sort((left, right) => compareText(left.id, right.id))
  };
}

function contextFromGoldenCase(goldenCase) {
  const selectedEvidenceIds = goldenCase.selectedEvidence.map((item) => item.id).sort(compareText);
  const warnings = [];
  if (goldenCase.selectedEvidence.length === 0) {
    warnings.push({
      code: 'EVIDENCE_MISSING',
      packageId: goldenCase.dependency.packageId,
      message: `No selected evidence for ${goldenCase.dependency.packageId}.`
    });
  }
  if (goldenCase.selectedEvidence.some((item) => item.conflictsWith?.length > 0)) {
    warnings.push({
      code: 'SOURCE_CONFLICT',
      packageId: goldenCase.dependency.packageId,
      message: `Selected evidence has a conflict for ${goldenCase.dependency.packageId}.`
    });
  }
  const material = `${goldenCase.id}:${JSON.stringify(goldenCase.dependency)}:${JSON.stringify(goldenCase.versions)}:${selectedEvidenceIds.join(',')}`;
  return {
    contextVersion: '1',
    contextId: digest(material),
    lineage: {
      projectManifestDigest: digest(`${goldenCase.id}:project`),
      knowledgeManifestDigest: digest(`${goldenCase.id}:knowledge`),
      knowledgeResearchId: digest(`${goldenCase.id}:research`),
      evidenceArtifactDigest: digest(`${goldenCase.id}:evidence`)
    },
    dependency: {
      projectId: `${goldenCase.dependency.ecosystem}:${goldenCase.repository.name}`,
      packageId: goldenCase.dependency.packageId,
      declaredName: goldenCase.dependency.declaredName,
      normalizedName: goldenCase.dependency.normalizedName,
      ecosystem: goldenCase.dependency.ecosystem,
      registry: goldenCase.dependency.registry,
      packageManager: goldenCase.repository.packageManager,
      dependencyType: goldenCase.dependency.dependencyType,
      manifest: goldenCase.dependency.manifest
    },
    versions: {
      analysisMode: goldenCase.versions.analysisMode,
      declaredVersion: goldenCase.versions.declaredVersion,
      currentVersion: goldenCase.versions.currentVersion,
      currentVersionSource: goldenCase.versions.currentVersion === null ? null : 'exactDeclaration',
      targetVersion: goldenCase.versions.targetVersion,
      targetPolicy: goldenCase.versions.targetPolicy,
      delta: goldenCase.versions.delta
    },
    knowledge: {
      relevantReleases: [goldenCase.versions.targetVersion],
      evidence: goldenCase.selectedEvidence.map((item) => ({
        id: item.id,
        kind: item.kind,
        sourceId: item.sourceId,
        sourceUrl: item.sourceUrl,
        authority: item.authority,
        trust: item.trust,
        retrievedAt: '2026-07-15T00:00:00.000Z',
        contentDigest: item.contentDigest,
        locator: item.locator,
        releaseVersions: [...item.releaseVersions].sort(compareText),
        content: item.content
      })).sort((left, right) => compareText(left.id, right.id))
    },
    metadata: {
      selectedEvidenceIds,
      missingInformation: goldenCase.selectedEvidence.length === 0 ? ['evidence'] : [],
      warnings: warnings.sort((left, right) => compareText(left.code, right.code)),
      size: {
        characters: JSON.stringify(goldenCase.selectedEvidence).length,
        evidenceItems: goldenCase.selectedEvidence.length
      }
    }
  };
}

export function createGoldenFakeRuntime(expectedByContextId = new Map()) {
  return {
    async generateStructured(request) {
      const expected = expectedByContextId.get(request.contextId);
      if (!expected) throw new Error(`Missing golden expected result for ${request.contextId}.`);
      const evidenceRefs = expected.expectedEvidenceRefs;
      return {
        output: {
          summary: `Expected ${expected.riskLevel} dependency release risk.`,
          summaryEvidenceRefs: evidenceRefs.summary,
          riskLevel: expected.riskLevel,
          riskEvidenceRefs: evidenceRefs.risk,
          findings: expected.expectedFindings.map((finding, index) => ({
            id: `finding-${index + 1}`,
            kind: finding.kind,
            summary: `${finding.kind} finding ${[...(finding.requiredKeywords ?? [])].join(' ')}`.trim(),
            appliesToVersions: finding.appliesToVersions,
            evidenceRefs: finding.evidenceRefs
          }))
        },
        provider: 'golden-fake',
        model: 'golden-fake',
        latencyMs: 0
      };
    }
  };
}

export async function runEvaluation({
  datasetPath = DEFAULT_EVALUATION_DATASET_PATH,
  runtime,
  model = { provider: 'fake', name: 'fake' },
  generatedAt = new Date(),
  promptVersion = VERSION_ANALYSIS_PROMPT_VERSION
} = {}) {
  const dataset = await loadGoldenDataset(datasetPath);
  const contexts = dataset.cases.map((goldenCase) => ({
    goldenCase,
    context: contextFromGoldenCase(goldenCase)
  }));
  const expectedByContextId = new Map(contexts.map(({ goldenCase, context }) => [
    context.contextId,
    goldenCase.expectedResult
  ]));
  const activeRuntime = runtime ?? createGoldenFakeRuntime(expectedByContextId);
  const caseResults = [];
  for (const { goldenCase, context } of contexts) {
    const result = await analyzeDependencyAiContext(context, {
      runtime: activeRuntime,
      promptVersion,
      outputSchema: AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA
    });
    caseResults.push(compareEvaluationResult(goldenCase, result));
  }
  return buildEvaluationReport({
    datasetPath: dataset.datasetPath,
    datasetVersion: dataset.datasetVersion,
    promptVersion,
    model,
    caseResults,
    generatedAt
  });
}

export async function writeEvaluationReport(outputPath, report) {
  const target = path.resolve(outputPath);
  const temporary = `${target}.${process.pid}.tmp`;
  const contents = serializeEvaluationReport(report);
  await mkdir(path.dirname(target), { recursive: true });
  let handle;
  try {
    handle = await open(temporary, 'w', 0o600);
    await handle.writeFile(contents, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, target);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return target;
}
