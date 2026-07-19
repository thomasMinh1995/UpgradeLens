import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runCli } from '../src/cli.js';
import { createSanitizedTestEnvironment } from '../test-support/environment.mjs';

const childEntry = new URL('../test-support/cli-http-runtime-child.mjs', import.meta.url);

function capture() {
  return { write() {} };
}

async function runChild(root, mode) {
  const startedAt = Date.now();
  const child = spawn(process.execPath, [fileURLToPath(childEntry), root, mode], {
    env: createSanitizedTestEnvironment(process.env),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 3_000);
  const [code, signal] = await once(child, 'close');
  clearTimeout(timeout);
  return { code, signal, stderr, elapsedMs: Date.now() - startedAt };
}

function childSummary(stderr) {
  const match = /CHILD_COMPLETE (\d+) REQUESTS (\d+) EXPECTED (\d+) REGISTRY (\d+)\/(\d+) EVIDENCE (\d+)\/(\d+) RETRIES (\d+) AI_ENV (\d+)/.exec(stderr);
  assert.ok(match, `Missing child completion summary:\n${stderr}`);
  const [code, requests, expected, registry, expectedRegistry, evidence, expectedEvidence, retries, aiEnv] = match
    .slice(1)
    .map(Number);
  return { code, requests, expected, registry, expectedRegistry, evidence, expectedEvidence, retries, aiEnv };
}

async function loopbackAvailable() {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    return true;
  } catch {
    return false;
  }
}

test('online CLI closes its scoped dispatcher after concurrent real keep-alive HTTP requests', async (t) => {
  if (!await loopbackAvailable()) {
    t.skip('local loopback listeners are unavailable in this execution sandbox');
    return;
  }
  assert.doesNotMatch(await fs.readFile(new URL('../bin/upgradelens.js', import.meta.url), 'utf8'), /process\.exit\s*\(/);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-cli-runtime-child-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'cli-runtime-child', version: '1.0.0', dependencies: { react: '^19.0.0', vite: '^6.0.0' }
  }));
  await fs.writeFile(path.join(root, 'requirements.txt'), 'fastapi>=0.100\n');
  assert.equal(await runCli(['discover', root], { stdout: capture(), stderr: capture() }), 0);

  for (const mode of ['normal', 'oversized', 'statuses']) {
    await fs.rm(path.join(root, '.depverdict', 'cache'), { recursive: true, force: true });
    const result = await runChild(root, mode);
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.code, 0, result.stderr);
    const summary = childSummary(result.stderr);
    assert.equal(summary.code, 0);
    assert.equal(summary.requests, summary.expected);
    assert.equal(summary.registry, summary.expectedRegistry);
    assert.equal(summary.evidence, summary.expectedEvidence);
    assert.equal(summary.retries, 0);
    assert.equal(summary.aiEnv, 0);
    assert.doesNotMatch(result.stderr, /must-not-leak|Bearer\s|Authorization/i);
    if (mode === 'normal') assert.ok(summary.evidence > 0, 'Normal mode must exercise evidence enrichment requests.');
    else assert.equal(summary.evidence, 0);
    t.diagnostic(
      `${mode}: requests=${summary.requests}, registry=${summary.registry}, evidence=${summary.evidence}, retries=${summary.retries}`
    );
    assert.ok(result.elapsedMs < 3_000, `CLI exceeded natural-exit budget: ${result.elapsedMs}ms`);
    const manifest = JSON.parse(await fs.readFile(path.join(root, '.depverdict', 'knowledge-manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, '1.0.0');
    if (mode === 'normal') assert.deepEqual(manifest.packages.map((item) => item.status), ['resolved', 'resolved', 'resolved']);
    else assert.ok(manifest.packages.some((item) => item.status !== 'resolved'));
  }
});
