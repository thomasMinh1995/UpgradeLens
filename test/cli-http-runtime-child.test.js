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

const childEntry = new URL('../test-support/cli-http-runtime-child.mjs', import.meta.url);

function capture() {
  return { write() {} };
}

async function runChild(root, mode) {
  const startedAt = Date.now();
  const child = spawn(process.execPath, [fileURLToPath(childEntry), root, mode], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => child.kill('SIGKILL'), 3_000);
  const [code, signal] = await once(child, 'close');
  clearTimeout(timeout);
  return { code, signal, stderr, elapsedMs: Date.now() - startedAt };
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
    await fs.rm(path.join(root, '.upgradelens', 'cache'), { recursive: true, force: true });
    const result = await runChild(root, mode);
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /CHILD_COMPLETE 0 REQUESTS 3/);
    assert.ok(result.elapsedMs < 3_000, `CLI exceeded natural-exit budget: ${result.elapsedMs}ms`);
    const manifest = JSON.parse(await fs.readFile(path.join(root, '.upgradelens', 'knowledge-manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, '1.0.0');
    if (mode === 'normal') assert.deepEqual(manifest.packages.map((item) => item.status), ['resolved', 'resolved', 'resolved']);
    else assert.ok(manifest.packages.some((item) => item.status !== 'resolved'));
  }
});
