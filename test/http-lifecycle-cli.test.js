import assert from 'node:assert/strict';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { runCli } from '../src/cli.js';
import { createSanitizedTestEnvironment } from '../test-support/environment.mjs';

const childEntry = new URL('../test-support/http-lifecycle-cli.mjs', import.meta.url);

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

test('the real CLI exits naturally after normal and oversized injected registry responses', async (t) => {
  assert.doesNotMatch(await fs.readFile(new URL('../bin/upgradelens.js', import.meta.url), 'utf8'), /process\.exit\s*\(/);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-http-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'http-lifecycle-fixture', version: '1.0.0', dependencies: { react: '^19.0.0' }
  }));
  assert.equal(await runCli(['discover', root], { stdout: capture(), stderr: capture() }), 0);

  for (const mode of ['normal', 'oversized']) {
    if (mode === 'oversized') await fs.rm(path.join(root, '.upgradelens', 'cache'), { recursive: true, force: true });
    const result = await runChild(root, mode);
    assert.equal(result.signal, null);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stderr, /CHILD_COMPLETE 0/);
    assert.ok(result.elapsedMs < 3_000, `CLI exceeded natural-exit budget: ${result.elapsedMs}ms`);
    const manifest = JSON.parse(await fs.readFile(path.join(root, '.upgradelens', 'knowledge-manifest.json'), 'utf8'));
    assert.equal(manifest.schemaVersion, '1.0.0');
    assert.equal(manifest.packages[0].status, mode === 'normal' ? 'resolved' : 'unavailable');
  }
});
