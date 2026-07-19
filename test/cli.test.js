import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCli } from '../src/cli.js';

function capture() {
  let value = '';
  return {
    stream: { write(chunk) { value += chunk; } },
    value() { return value; }
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-cli-'));
  await mkdir(path.join(root, 'src'));
  await writeFile(path.join(root, 'package.json'), '{"name":"cli-fixture","version":"1.0.0"}');
  return root;
}

test('writes the manifest to the required default location', async () => {
  const root = await fixture();
  const stdout = capture();
  const stderr = capture();
  try {
    const code = await runCli(['discover', root], { stdout: stdout.stream, stderr: stderr.stream });
    const output = path.join(root, '.depverdict/project-manifest.json');
    const manifest = JSON.parse(await readFile(output, 'utf8'));

    assert.equal(code, 0);
    assert.equal(stdout.value(), '');
    assert.equal(manifest.projects[0].name, 'cli-fixture');
    assert.match(stderr.value(), /Discovered 1 project/);
    assert.match(stderr.value(), /\.depverdict\/project-manifest\.json/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('--stdout emits JSON without creating the output directory', async () => {
  const root = await fixture();
  const stdout = capture();
  const stderr = capture();
  try {
    const code = await runCli([root, '--stdout', '--no-pretty'], { stdout: stdout.stream, stderr: stderr.stream });

    assert.equal(code, 0);
    assert.equal(JSON.parse(stdout.value()).summary.projectCount, 1);
    assert.equal(stderr.value(), '');
    await assert.rejects(access(path.join(root, '.depverdict')));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('returns code 2 for warnings when requested', async () => {
  const root = await fixture();
  await writeFile(path.join(root, 'package.json'), '{broken');
  try {
    const code = await runCli(['discover', root, '--stdout', '--fail-on-warning'], {
      stdout: capture().stream,
      stderr: capture().stream
    });
    assert.equal(code, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reports invalid arguments without throwing', async () => {
  const stderr = capture();
  const code = await runCli(['--max-depth', '-1'], { stdout: capture().stream, stderr: stderr.stream });

  assert.equal(code, 1);
  assert.match(stderr.value(), /--max-depth requires a value/);
});
