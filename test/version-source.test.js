import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import test from 'node:test';

import { PRODUCT_NAME, USER_AGENT, VERSION } from '../src/constants.js';
import { fetchRegistryJson } from '../src/http/bounded-fetch.js';
import { runCli } from '../src/cli.js';

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json');

function capture() {
  let value = '';
  return { stream: { write(chunk) { value += chunk; } }, value: () => value };
}

test('package.json is the single runtime version source for CLI output and User-Agent', async () => {
  assert.equal(VERSION, packageMetadata.version);
  assert.equal(USER_AGENT, `${PRODUCT_NAME}/${packageMetadata.version}`);

  const stdout = capture();
  assert.equal(await runCli(['--version'], { stdout: stdout.stream, stderr: capture().stream }), 0);
  assert.equal(stdout.value(), `${packageMetadata.version}\n`);

  let userAgent;
  await fetchRegistryJson('https://registry.example.test/package', {
    fetchImplementation: async (_url, options) => {
      userAgent = options.headers['User-Agent'];
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    },
    maxResponseBytes: 1_024,
    errorPrefix: 'TEST',
    serviceName: 'test Registry'
  });
  assert.equal(userAgent, USER_AGENT);
});

test('the executable CLI reports the package.json version', async () => {
  const child = spawn(process.execPath, ['bin/depverdict.js', '--version'], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const [code, signal] = await once(child, 'close');
  assert.equal(signal, null);
  assert.equal(code, 0, stderr);
  assert.equal(stdout, `${packageMetadata.version}\n`);
});
