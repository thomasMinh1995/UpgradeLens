import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA,
  analyzeDependencyAiContext,
  buildVersionAnalysisPrompt,
  createHttpJsonAiProvider,
  createProviderAiRuntime,
  trustValidateAiVersionAnalysisCandidate
} from '../src/index.js';

function digest(seed) {
  return `sha256:${createHash('sha256').update(seed).digest('hex')}`;
}

function evidence(seed, overrides = {}) {
  return {
    id: digest(`evidence:${seed}`),
    kind: 'releaseNotes',
    sourceId: 'npm:react:docs',
    sourceUrl: 'https://example.com/releases',
    authority: 'officialProject',
    trust: 'official',
    retrievedAt: '2026-07-14T00:00:03.000Z',
    contentDigest: digest(`content:${seed}`),
    locator: 'heading:2.0.0',
    releaseVersions: ['2.0.0'],
    content: 'Version 2.0.0 documents a breaking behavior change.',
    ...overrides
  };
}

function context({ mode = 'exactBaseline', evidenceItems = [evidence('primary')], warnings = [] } = {}) {
  const selectedEvidenceIds = evidenceItems.map((item) => item.id).sort();
  return {
    contextVersion: '1',
    contextId: digest(`context:${mode}:${selectedEvidenceIds.join(',')}`),
    lineage: {
      projectManifestDigest: digest('project'),
      knowledgeManifestDigest: digest('knowledge'),
      knowledgeResearchId: digest('research'),
      evidenceArtifactDigest: digest('bundle')
    },
    dependency: {
      projectId: 'node:.',
      packageId: 'npm:react',
      declaredName: 'react',
      normalizedName: 'react',
      ecosystem: 'node',
      registry: 'npm',
      packageManager: 'npm',
      dependencyType: 'dependency',
      manifest: 'package.json'
    },
    versions: {
      analysisMode: mode,
      declaredVersion: mode === 'declaredConstraint' ? '^1.0.0' : '1.0.0',
      currentVersion: mode === 'declaredConstraint' ? null : '1.0.0',
      currentVersionSource: mode === 'declaredConstraint' ? null : 'exactDeclaration',
      targetVersion: '2.0.0',
      targetPolicy: 'explicit',
      delta: mode === 'declaredConstraint'
        ? { direction: 'unknown', classification: 'unknown' }
        : { direction: 'upgrade', classification: 'major' }
    },
    knowledge: {
      relevantReleases: ['2.0.0'],
      evidence: evidenceItems
    },
    metadata: {
      selectedEvidenceIds,
      missingInformation: evidenceItems.length === 0 ? ['evidence'] : [],
      warnings,
      size: {
        characters: 1000,
        evidenceItems: evidenceItems.length
      }
    }
  };
}

function candidate(ctx = context(), overrides = {}) {
  const evidenceId = ctx.metadata.selectedEvidenceIds[0];
  return {
    summary: 'React 2.0.0 includes a documented breaking behavior change.',
    summaryEvidenceRefs: [evidenceId],
    riskLevel: 'high',
    riskEvidenceRefs: [evidenceId],
    findings: [
      {
        id: 'finding-1',
        kind: 'breakingChange',
        summary: 'A documented behavior changed in the target release.',
        appliesToVersions: ['2.0.0'],
        evidenceRefs: [evidenceId]
      }
    ],
    ...overrides
  };
}

function fakeRuntime(output) {
  const calls = [];
  return {
    calls,
    async generateStructured(request) {
      calls.push(request);
      return {
        output,
        provider: 'fake',
        model: 'fake-model',
        latencyMs: 0
      };
    }
  };
}

test('valid AI output becomes an analyzed AI Version Analysis Result', async () => {
  const ctx = context();
  const runtime = fakeRuntime(candidate(ctx));
  const result = await analyzeDependencyAiContext(ctx, { runtime });

  assert.equal(runtime.calls.length, 1);
  assert.equal(result.status, 'analyzed');
  assert.equal(result.contextId, ctx.contextId);
  assert.deepEqual(result.dependency, ctx.dependency);
  assert.deepEqual(result.versions, ctx.versions);
  assert.equal(result.riskLevel, 'high');
  assert.equal(result.validation.status, 'valid');
  assert.deepEqual(result.humanReviewReasons, ['HIGH_RISK']);
  assert.equal(result.nextAction, 'reviewBeforeImpactAnalysis');
});

test('invalid JSON from runtime fails structured analysis without publishing claims', async () => {
  const ctx = context();
  const result = await analyzeDependencyAiContext(ctx, { runtime: fakeRuntime('{not json') });

  assert.equal(result.status, 'failed');
  assert.equal(result.riskLevel, 'unknown');
  assert.deepEqual(result.findings, []);
  assert.deepEqual(result.validation.warningCodes, ['OUTPUT_JSON_INVALID']);
  assert.deepEqual(result.humanReviewReasons, ['UNKNOWN_RISK', 'EVIDENCE_PARTIAL', 'ANALYSIS_FAILED']);
});

test('invalid schema fails without regex parsing or deterministic field mutation', async () => {
  const ctx = context();
  const invalid = {
    ...candidate(ctx),
    riskLevel: 'critical',
    dependency: { packageId: 'npm:invented' },
    versions: { currentVersion: '9.9.9' }
  };
  const result = await analyzeDependencyAiContext(ctx, { runtime: fakeRuntime(invalid) });

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.dependency, ctx.dependency);
  assert.deepEqual(result.versions, ctx.versions);
  assert.deepEqual(result.validation.warningCodes, ['OUTPUT_SCHEMA_INVALID']);
});

test('invented evidence refs are removed and risk is downgraded to unknown', async () => {
  const ctx = context();
  const invented = digest('invented-evidence');
  const result = await analyzeDependencyAiContext(ctx, {
    runtime: fakeRuntime(candidate(ctx, {
      summaryEvidenceRefs: [invented],
      riskEvidenceRefs: [invented],
      findings: [
        {
          id: 'finding-1',
          kind: 'breakingChange',
          summary: 'Unsupported claim.',
          appliesToVersions: ['2.0.0'],
          evidenceRefs: [invented]
        }
      ]
    }))
  });

  assert.equal(result.status, 'analyzed');
  assert.equal(result.riskLevel, 'unknown');
  assert.deepEqual(result.summaryEvidenceRefs, []);
  assert.deepEqual(result.riskEvidenceRefs, []);
  assert.deepEqual(result.findings, []);
  assert.equal(result.validation.status, 'validWithWarnings');
  assert.deepEqual(result.validation.warningCodes, ['CLAIMS_DROPPED', 'EVIDENCE_REFERENCE_INVALID']);
  assert.deepEqual(result.humanReviewReasons, ['UNKNOWN_RISK', 'EVIDENCE_PARTIAL', 'CLAIMS_DROPPED']);
});

test('invented URLs are treated as unsupported claims', async () => {
  const ctx = context();
  const result = trustValidateAiVersionAnalysisCandidate(candidate(ctx, {
    summary: 'See https://invented.example.com for the breaking change.'
  }), ctx);

  assert.equal(result.riskLevel, 'unknown');
  assert.deepEqual(result.findings, []);
  assert.ok(result.validation.warningCodes.includes('INVENTED_URL'));
  assert.ok(result.humanReviewReasons.includes('CLAIMS_DROPPED'));
});

test('missing evidence skips runtime and requires human review', async () => {
  const ctx = context({ evidenceItems: [] });
  const runtime = fakeRuntime(candidate(context()));
  const result = await analyzeDependencyAiContext(ctx, { runtime });

  assert.equal(runtime.calls.length, 0);
  assert.equal(result.status, 'skipped');
  assert.equal(result.evidenceCoverage, 'none');
  assert.deepEqual(result.humanReviewReasons, ['UNKNOWN_RISK', 'EVIDENCE_NONE', 'ANALYSIS_FAILED']);
  assert.equal(result.nextAction, 'collectEvidence');
});

test('declaredConstraint mode is always marked for human review and never gains exact delta facts', async () => {
  const ctx = context({ mode: 'declaredConstraint' });
  const result = await analyzeDependencyAiContext(ctx, {
    runtime: fakeRuntime(candidate(ctx, { riskLevel: 'medium' }))
  });

  assert.equal(result.status, 'analyzed');
  assert.equal(result.versions.currentVersion, null);
  assert.deepEqual(result.versions.delta, { direction: 'unknown', classification: 'unknown' });
  assert.deepEqual(result.humanReviewReasons, ['VERSION_UNCERTAIN']);
});

test('human review policy covers stale evidence, unknown risk, and high risk deterministically', async () => {
  const stale = context({ warnings: [{ code: 'SOURCE_STALE', sourceId: 'npm:react:docs', message: 'stale' }] });
  const high = await analyzeDependencyAiContext(stale, { runtime: fakeRuntime(candidate(stale)) });
  const unknown = await analyzeDependencyAiContext(stale, {
    runtime: fakeRuntime(candidate(stale, { riskLevel: 'unknown', riskEvidenceRefs: [] }))
  });

  assert.deepEqual(high.humanReviewReasons, ['HIGH_RISK', 'EVIDENCE_PARTIAL', 'SOURCE_STALE']);
  assert.deepEqual(unknown.humanReviewReasons, ['UNKNOWN_RISK', 'EVIDENCE_PARTIAL', 'SOURCE_STALE']);
});

test('prompt builder is generic and explicitly forbids unsupported reasoning', () => {
  const prompt = buildVersionAnalysisPrompt({
    context: context(),
    outputSchema: AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA
  });
  const text = `${prompt.system}\n${prompt.user}`;

  assert.match(text, /Use only evidence/);
  assert.match(text, /Do not guess currentVersion/);
  assert.match(text, /Do not create URLs/);
  assert.match(text, /Do not analyze source code/);
  assert.match(text, /do not propose a migration plan/i);
  assert.match(text, /generic across package ecosystems/);
});

test('provider AI runtime builds prompts and delegates to a provider abstraction', async () => {
  const ctx = context();
  const providerCalls = [];
  const runtime = createProviderAiRuntime({
    promptBuilder: buildVersionAnalysisPrompt,
    clock: { now: () => 1000 },
    provider: {
      name: 'fixture-provider',
      model: 'fixture-model',
      async generateStructured(request) {
        providerCalls.push(request);
        return { output: candidate(ctx), provider: 'fixture-provider', model: 'fixture-model', latencyMs: 7 };
      }
    }
  });
  const response = await runtime.generateStructured({
    runId: 'run-1',
    contextId: ctx.contextId,
    promptVersion: '1',
    context: ctx,
    outputSchema: AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA
  });

  assert.equal(response.provider, 'fixture-provider');
  assert.equal(response.model, 'fixture-model');
  assert.equal(response.latencyMs, 7);
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].prompt.promptVersion, '1');
});

test('generic HTTP provider is configurable and not tied to OpenAI request shape', async () => {
  const ctx = context();
  const requests = [];
  const provider = createHttpJsonAiProvider({
    endpoint: 'https://provider.example.test/analyze',
    provider: 'example-provider',
    model: 'example-model',
    fetchImplementation: async (url, request) => {
      requests.push({ url, request });
      return new Response(JSON.stringify({ custom: candidate(ctx) }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    },
    buildRequestBody: ({ prompt }) => ({ messages: [prompt.system, prompt.user] }),
    extractOutput: (body) => body.custom
  });
  const output = await provider.generateStructured({
    prompt: buildVersionAnalysisPrompt({ context: ctx }),
    outputSchema: AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA
  });

  assert.equal(requests[0].url, 'https://provider.example.test/analyze');
  assert.equal(JSON.parse(requests[0].request.body).messages.length, 2);
  assert.equal(output.provider, 'example-provider');
  assert.equal(output.model, 'example-model');
  assert.deepEqual(output.output, candidate(ctx));
});
