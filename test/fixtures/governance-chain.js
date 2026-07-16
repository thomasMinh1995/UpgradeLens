import {
  buildCapabilityProfile,
  buildDeploymentProfile,
  buildQualificationRecord,
  capabilityProfileDigest,
  deploymentProfileDigest
} from '../../src/governance-metadata.js';
import { conformanceReportDigest } from '../../src/conformance-report.js';
import { runConformance } from '../../src/conformance-runner.js';

export async function buildGovernanceChain({
  status = 'EXPERIMENTAL',
  model = 'qwen3:8b',
  modelRevision,
  recommendation = 'CONFORMANT',
  qualifiedFor = ['MVP-03']
} = {}) {
  const capabilityProfile = buildCapabilityProfile({
    capabilityId: 'openai-compatible-v1',
    protocol: 'chat-completions',
    structuredOutput: 'jsonSchema',
    jsonMode: false,
    streaming: false,
    toolCalling: false,
    responsesApi: false,
    usageMetadata: true,
    identityVerification: true,
    timeoutSupported: true
  });
  const capabilityDigest = capabilityProfileDigest(capabilityProfile);
  const deploymentProfile = buildDeploymentProfile({
    deploymentId: 'local-qwen3',
    provider: 'openai-compatible',
    endpoint: 'http://localhost:11434/v1/chat/completions',
    model,
    capabilityProfile: capabilityProfile.capabilityId,
    capabilityProfileDigest: capabilityDigest,
    ...(modelRevision === undefined ? {} : { modelRevision }),
    timeoutSeconds: 180,
    maxResponseBytes: 1_048_576
  });
  const deploymentDigest = deploymentProfileDigest(deploymentProfile);
  const generatedReport = await runConformance({
    runtime: { provider: deploymentProfile.provider, model: deploymentProfile.model },
    capabilityProfileDigest: capabilityDigest,
    deploymentProfileDigest: deploymentDigest,
    generatedAt: '2026-07-15T00:00:00.000Z'
  });
  const conformanceReport = recommendation === generatedReport.recommendation
    ? generatedReport
    : { ...generatedReport, recommendation };
  const qualificationRecord = buildQualificationRecord({
    qualificationId: 'local-qwen3-mvp-03',
    deploymentProfileDigest: deploymentDigest,
    capabilityProfileDigest: capabilityDigest,
    conformanceReportDigest: conformanceReportDigest(conformanceReport),
    status,
    qualifiedFor
  });
  return { capabilityProfile, deploymentProfile, conformanceReport, qualificationRecord };
}
