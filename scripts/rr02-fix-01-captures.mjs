import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { writeMigrationPlanningQualificationRecord } from '../src/index.js';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const captureRoot = path.join(root, 'docs/rr02-fix-01-cli-captures');
const sourcePath = process.env.RR02_QUALIFICATION_REPORT;
const renderer = process.env.CAPTURE_PYTHON;

if (!sourcePath) throw new Error('RR02_QUALIFICATION_REPORT is required.');
if (!renderer) throw new Error('CAPTURE_PYTHON is required.');

const source = JSON.parse(await readFile(sourcePath, 'utf8'));
const qualified = source.report?.qualification ?? source.qualification;
if (!qualified) throw new Error('Qualification report does not contain a qualification.');

const runtime = {
  provider: qualified.identity.runtime.provider,
  model: qualified.identity.runtime.model,
  adapter: qualified.identity.runtime.adapter
};
const fixtures = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-rr02-fix-01-'));
const scenarios = [
  {
    id: 'DEFAULT-NO-QUALIFICATION',
    purpose: 'default-analyze-does-not-resolve-qualification',
    experimental: false,
    expectedExitCode: 0,
    qualification: 'absent'
  },
  {
    id: 'PERSISTED-QUALIFIED',
    purpose: 'experimental-analyze-loads-default-qualified-record',
    experimental: true,
    expectedExitCode: 0,
    qualification: 'qualified'
  },
  {
    id: 'MISSING-OVERRIDE',
    purpose: 'experimental-analyze-surfaces-missing-override',
    experimental: true,
    expectedExitCode: 0,
    qualification: 'absent'
  },
  {
    id: 'IDENTITY-MISMATCH',
    purpose: 'identity-mismatch-blocks-before-provider',
    experimental: true,
    expectedExitCode: 1,
    qualification: 'qualified',
    runtime: { ...runtime, model: `${runtime.model}-mismatch` }
  },
  {
    id: 'CORRUPTED',
    purpose: 'corrupted-record-fails-closed',
    experimental: true,
    expectedExitCode: 1,
    qualification: 'corrupted'
  },
  {
    id: 'NOT-QUALIFIED',
    purpose: 'matching-not-qualified-record-blocks',
    experimental: true,
    expectedExitCode: 1,
    qualification: 'notQualified'
  },
  {
    id: 'ZERO-ELIGIBLE-LAZY',
    purpose: 'qualified-zero-context-run-keeps-runtime-lazy',
    experimental: true,
    expectedExitCode: 0,
    qualification: 'qualified',
    explicitPath: true
  }
];

function cleanAnsi(value) {
  return value.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]+)*)?\u0007)|(?:(?:\d{1,4}(?:[;:]\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
    ''
  );
}

function childEnvironment(metadata) {
  return {
    PATH: process.env.PATH ?? '',
    LANG: 'C.UTF-8',
    NO_COLOR: '1',
    UPGRADELENS_AI_PROVIDER: metadata.provider,
    UPGRADELENS_AI_MODEL: metadata.model
  };
}

async function invoke(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode, signal) => resolve({
      exitCode,
      signal,
      transcript: Buffer.concat(chunks).toString('utf8')
    }));
  });
}

async function renderScreenshot(transcript, target) {
  const child = spawn(renderer, [
    path.join(root, 'scripts/render-cli-transcript.py'),
    transcript,
    target
  ], { cwd: root, stdio: 'inherit' });
  await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => (
      code === 0 ? resolve() : reject(new Error(`Transcript renderer exited ${code}.`))
    ));
  });
}

const manifestEntries = [];
try {
  await rm(captureRoot, { recursive: true, force: true });
  await mkdir(captureRoot, { recursive: true });

  for (const [index, scenario] of scenarios.entries()) {
    const sequence = index + 1;
    const slug = `${String(sequence).padStart(3, '0')}-${scenario.id.toLowerCase()}`;
    const scenarioRoot = path.join(fixtures, slug);
    const bundle = path.join(captureRoot, slug);
    await mkdir(scenarioRoot, { recursive: true });
    await mkdir(bundle, { recursive: true });
    await writeFile(path.join(scenarioRoot, 'package.json'), `${JSON.stringify({
      name: `rr02-fix-01-${sequence}`,
      version: '1.0.0',
      dependencies: {}
    }, null, 2)}\n`);

    if (scenario.qualification === 'qualified') {
      await writeMigrationPlanningQualificationRecord(scenarioRoot, qualified);
    } else if (scenario.qualification === 'notQualified') {
      const rejected = structuredClone(qualified);
      rejected.verdict = 'NOT_QUALIFIED';
      rejected.criticalGates[0].passed = false;
      rejected.criticalGates[0].violations = ['controlled-capture-critical-failure'];
      await writeMigrationPlanningQualificationRecord(scenarioRoot, rejected);
    } else if (scenario.qualification === 'corrupted') {
      await mkdir(path.join(scenarioRoot, '.upgradelens'), { recursive: true });
      await writeFile(
        path.join(scenarioRoot, '.upgradelens/migration-planning-qualification.json'),
        '{invalid\n'
      );
    }

    const args = [
      path.join(root, 'bin/upgradelens.js'),
      'analyze',
      scenarioRoot,
      '--offline'
    ];
    if (scenario.experimental) {
      args.push('--experimental-migration-checklist', '--progress', 'plain');
    }
    if (scenario.explicitPath) {
      args.push(
        '--migration-qualification',
        '.upgradelens/migration-planning-qualification.json'
      );
    }
    const activeRuntime = scenario.runtime ?? runtime;
    const startedAt = new Date();
    const result = await invoke(args, childEnvironment(activeRuntime));
    const completedAt = new Date();
    if (result.exitCode !== scenario.expectedExitCode) {
      throw new Error(`${scenario.id} exited ${result.exitCode}; expected ${scenario.expectedExitCode}.`);
    }
    const raw = result.transcript;
    const clean = cleanAnsi(raw);
    const command = [
      'upgradelens analyze <fixture> --offline',
      ...(scenario.experimental
        ? [' --experimental-migration-checklist --progress plain'] : []),
      ...(scenario.explicitPath
        ? [' --migration-qualification .upgradelens/migration-planning-qualification.json'] : [])
    ].join('');
    const environment = {
      offline: true,
      tty: false,
      progressMode: scenario.experimental ? 'plain' : 'auto',
      provider: activeRuntime.provider,
      model: activeRuntime.model,
      adapter: activeRuntime.adapter,
      endpointConfigured: false,
      qualificationFixture: scenario.qualification
    };
    const metadata = {
      scenarioId: scenario.id,
      sequence,
      purpose: scenario.purpose,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      exitCode: result.exitCode,
      signal: result.signal,
      tty: false,
      progressMode: environment.progressMode,
      captureMethod: 'rendered-non-tty-transcript',
      rawHasAnsi: raw !== clean,
      cleanHasAnsi: false,
      sanitizationPassed: !clean.includes(fixtures) && !clean.includes(sourcePath),
      captureComplete: true,
      screenshots: ['final-screen.png']
    };
    if (!metadata.sanitizationPassed) throw new Error(`${scenario.id} transcript was not sanitized.`);

    await writeFile(path.join(bundle, 'command.txt'), `${command}\n`);
    await writeFile(path.join(bundle, 'environment.json'), `${JSON.stringify(environment, null, 2)}\n`);
    await writeFile(path.join(bundle, 'transcript.raw.txt'), raw);
    await writeFile(path.join(bundle, 'transcript.clean.txt'), clean);
    await writeFile(path.join(bundle, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    await renderScreenshot(
      path.join(bundle, 'transcript.clean.txt'),
      path.join(bundle, 'final-screen.png')
    );

    manifestEntries.push({
      scenarioId: scenario.id,
      sequence,
      purpose: scenario.purpose,
      resolvedSource: scenario.qualification === 'absent'
        ? (scenario.experimental ? 'defaultPath (missing)' : 'not resolved')
        : (scenario.explicitPath ? 'explicitPath' : 'defaultPath'),
      expectedQualificationStatus: {
        absent: scenario.experimental ? 'MISSING' : 'NOT_APPLICABLE',
        qualified: 'QUALIFIED',
        corrupted: 'CORRUPTED',
        notQualified: 'NOT_QUALIFIED'
      }[scenario.qualification],
      commandFile: `${slug}/command.txt`,
      environmentFile: `${slug}/environment.json`,
      rawTranscript: `${slug}/transcript.raw.txt`,
      cleanTranscript: `${slug}/transcript.clean.txt`,
      metadataFile: `${slug}/metadata.json`,
      screenshots: [`${slug}/final-screen.png`],
      exitCode: result.exitCode,
      sanitizationPassed: true,
      captureComplete: true
    });
    if (scenario.id === 'IDENTITY-MISMATCH') {
      manifestEntries.at(-1).expectedQualificationStatus = 'IDENTITY_MISMATCH';
    }
  }

  const manifest = {
    schemaVersion: 'rr02-fix-01-cli-captures.v1',
    generatedAt: new Date().toISOString(),
    cliInvocationsRepresented: manifestEntries.length,
    captureType: 'rendered-non-tty-transcript',
    entries: manifestEntries
  };
  await writeFile(path.join(captureRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
} finally {
  await rm(fixtures, { recursive: true, force: true });
}
