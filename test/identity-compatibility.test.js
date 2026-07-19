import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ArtifactRootConflictError,
  resolveArtifactRootChain
} from '../src/artifact-root-compatibility.js';
import { runCli } from '../src/cli.js';
import { resolveIdentityEnvironment } from '../src/environment-compatibility.js';

function capture() {
  let contents = '';
  return {
    stream: { write(chunk) { contents += chunk; } },
    value() { return contents; }
  };
}

async function temporaryRoot(prefix) {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

async function write(root, artifact, contents = '{}\n') {
  const target = path.join(root, artifact);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

test('environment identity precedence is explicit, canonical, legacy, default', () => {
  const diagnostics = [];
  const env = resolveIdentityEnvironment({
    DEPVERDICT_AI_MODEL: 'canonical-model',
    UPGRADELENS_AI_MODEL: 'legacy-model',
    UPGRADELENS_AI_ENDPOINT: 'https://legacy.example.test',
    UPGRADELENS_AI_AUTHORIZATION: 'Bearer must-never-appear',
    DEPVERDICT_UNKNOWN: 'ignored-by-contract'
  }, {
    overrides: { DEPVERDICT_AI_PROVIDER: 'explicit-provider' },
    onDiagnostic: (message) => diagnostics.push(message)
  });

  assert.equal(env.DEPVERDICT_AI_PROVIDER, 'explicit-provider');
  assert.equal(env.DEPVERDICT_AI_MODEL, 'canonical-model');
  assert.equal(env.DEPVERDICT_AI_ENDPOINT, 'https://legacy.example.test');
  assert.equal(env.DEPVERDICT_AI_AUTHORIZATION, 'Bearer must-never-appear');
  assert.equal(env.DEPVERDICT_UNKNOWN, undefined);
  assert.ok(diagnostics.some((item) => item.includes('ENVIRONMENT_IDENTITY_CONFLICT')
    && item.includes('DEPVERDICT_AI_MODEL')
    && item.includes('UPGRADELENS_AI_MODEL')));
  assert.ok(diagnostics.some((item) => item.includes('LEGACY_ENVIRONMENT_USED')
    && item.includes('UPGRADELENS_AI_ENDPOINT')));
  assert.doesNotMatch(diagnostics.join('\n'), /canonical-model|legacy-model|legacy\.example|Bearer|must-never/);
  assert.equal(resolveIdentityEnvironment({}).DEPVERDICT_AI_PROVIDER, undefined);
});

test('environment compatibility diagnostics are bounded once per key', () => {
  const diagnostics = [];
  const state = new Set();
  const source = { UPGRADELENS_AI_MODEL: 'legacy-model' };
  const options = {
    diagnosticState: state,
    onDiagnostic: (message) => diagnostics.push(message)
  };
  resolveIdentityEnvironment(source, options);
  resolveIdentityEnvironment(source, options);
  assert.equal(diagnostics.length, 1);
});

test('artifact root resolver selects one complete chain and never merges roots', async (t) => {
  const root = await temporaryRoot('depverdict-artifact-roots-');
  t.after(() => rm(root, { recursive: true, force: true }));
  const artifacts = [
    '.depverdict/project-manifest.json',
    '.depverdict/knowledge-manifest.json'
  ];
  const diagnostics = [];

  assert.deepEqual(
    (await resolveArtifactRootChain(root, artifacts)).artifacts,
    artifacts
  );

  await write(root, '.upgradelens/project-manifest.json', '{"legacy":1}\n');
  await write(root, '.upgradelens/knowledge-manifest.json', '{"legacy":2}\n');
  const legacy = await resolveArtifactRootChain(root, artifacts, {
    onDiagnostic: (message) => diagnostics.push(message)
  });
  assert.deepEqual(legacy.artifacts, [
    '.upgradelens/project-manifest.json',
    '.upgradelens/knowledge-manifest.json'
  ]);
  assert.match(diagnostics.at(-1), /LEGACY_ARTIFACT_ROOT_USED/);

  await write(root, '.depverdict/project-manifest.json', '{"canonical":1}\n');
  await assert.rejects(
    resolveArtifactRootChain(root, artifacts),
    (error) => error instanceof ArtifactRootConflictError
      && error.code === 'ARTIFACT_ROOT_CONFLICT'
  );
  await assert.rejects(access(path.join(root, '.depverdict/knowledge-manifest.json')));

  await write(root, '.depverdict/knowledge-manifest.json', '{"canonical":2}\n');
  const canonical = await resolveArtifactRootChain(root, artifacts, {
    onDiagnostic: (message) => diagnostics.push(message)
  });
  assert.deepEqual(canonical.artifacts, artifacts);
  assert.match(diagnostics.at(-1), /LEGACY_ARTIFACT_ROOT_IGNORED/);
});

test('canonical and deprecated CLI identities write equivalent canonical artifacts', async (t) => {
  const root = await temporaryRoot('depverdict-cli-identity-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'identity-fixture',
    version: '1.0.0',
    dependencies: { react: '^19.0.0' }
  }));

  const canonicalError = capture();
  const canonicalCode = await runCli(['discover', root], {
    invocationName: 'depverdict',
    stdout: capture().stream,
    stderr: canonicalError.stream
  });
  const canonical = JSON.parse(
    await readFile(path.join(root, '.depverdict/project-manifest.json'), 'utf8')
  );

  const legacyError = capture();
  const legacyState = new Set();
  const legacyCode = await runCli(['discover', root], {
    invocationName: 'upgradelens',
    deprecationState: legacyState,
    stdout: capture().stream,
    stderr: legacyError.stream
  });
  const legacy = JSON.parse(
    await readFile(path.join(root, '.depverdict/project-manifest.json'), 'utf8')
  );

  assert.equal(canonicalCode, 0);
  assert.equal(legacyCode, 0);
  assert.deepEqual(
    { ...legacy, generatedAt: canonical.generatedAt },
    canonical
  );
  assert.equal(canonical.generator.name, 'UpgradeLens');
  assert.doesNotMatch(canonicalError.value(), /deprecated/);
  assert.match(legacyError.value(), /deprecated.*depverdict/is);
  await assert.rejects(access(path.join(root, '.upgradelens')));
});

test('legacy executable warning is stderr-only and emitted once per process state', async () => {
  const stdout = capture();
  const stderr = capture();
  const state = new Set();
  assert.equal(await runCli(['--version'], {
    invocationName: 'upgradelens',
    deprecationState: state,
    stdout: stdout.stream,
    stderr: stderr.stream
  }), 0);
  assert.equal(await runCli(['--version'], {
    invocationName: 'upgradelens',
    deprecationState: state,
    stdout: stdout.stream,
    stderr: stderr.stream
  }), 0);
  assert.equal(stdout.value(), '0.6.0-alpha.1\n0.6.0-alpha.1\n');
  assert.equal(stderr.value().match(/deprecated/g)?.length, 1);

  const help = capture();
  const canonicalError = capture();
  assert.equal(await runCli(['--help'], {
    invocationName: 'depverdict',
    stdout: help.stream,
    stderr: canonicalError.stream
  }), 0);
  assert.match(help.value(), /^DepVerdict 0\.6\.0-alpha\.1/m);
  assert.match(help.value(), /depverdict analyze/);
  assert.doesNotMatch(help.value(), /Usage:\n  upgradelens/);
  assert.equal(canonicalError.value(), '');
});

test('legacy --stdout stays JSON-only and explicit legacy output remains authoritative', async (t) => {
  const root = await temporaryRoot('depverdict-explicit-output-');
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'explicit-output-fixture',
    version: '1.0.0'
  }));

  const stdout = capture();
  const stderr = capture();
  assert.equal(await runCli(['discover', root, '--stdout'], {
    invocationName: 'upgradelens',
    deprecationState: new Set(),
    stdout: stdout.stream,
    stderr: stderr.stream
  }), 0);
  assert.equal(JSON.parse(stdout.value()).projects[0].name, 'explicit-output-fixture');
  assert.match(stderr.value(), /deprecated.*depverdict/is);
  await assert.rejects(access(path.join(root, '.depverdict')));

  assert.equal(await runCli([
    'discover',
    root,
    '--output',
    '.upgradelens/explicit-project-manifest.json'
  ], {
    invocationName: 'depverdict',
    stdout: capture().stream,
    stderr: capture().stream
  }), 0);
  const explicit = JSON.parse(await readFile(
    path.join(root, '.upgradelens/explicit-project-manifest.json'),
    'utf8'
  ));
  assert.equal(explicit.schemaVersion, '2.0.0');
  await assert.rejects(access(path.join(root, '.depverdict')));
});
