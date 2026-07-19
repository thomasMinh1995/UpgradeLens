import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const addendumPath = path.join(
  root,
  'docs/decisions/diff-04-release-evidence-gap-acceptance.md'
);

test('release remediation records accepted approval and remains evidence-bounded', async () => {
  const addendum = await readFile(addendumPath, 'utf8');
  assert.match(addendum, /Status: `ACCEPTED`/);
  for (const classification of [
    'PROVEN',
    'SUPPORTED_BY_CURRENT_STATE_ONLY',
    'UNKNOWN_BEFORE_STATE'
  ]) {
    assert.ok(addendum.includes(`\`${classification}\``), classification);
  }
  assert.match(addendum, /does \*\*not\*\* claim that assets never existed/);
  assert.match(addendum, /All five approved edits completed/);
  assert.match(addendum, /API-managed `updated_at`/);
});

test('release remediation fixes exactly the five historical release identities', async () => {
  const addendum = await readFile(addendumPath, 'utf8');
  const releases = [
    ['353312307', 'v0.1.1', 'MVP-01 Project Discovery Foundation'],
    ['353747096', 'v0.2.0', 'Knowledge Research'],
    ['354822066', 'v0.3.0', 'AI Version Analysis'],
    ['355150303', 'v0.4.0', 'Repository Impact Analytics'],
    ['356244177', 'v0.5.0', 'Evidence-Bounded Migration Planning']
  ];
  for (const [id, version, scope] of releases) {
    assert.ok(addendum.includes(`\`${id}\` / \`${version}\``), id);
    assert.ok(addendum.includes(`UpgradeLens ${version} — ${scope}`), version);
  }
  assert.match(
    addendum,
    /> \*\*Project rename:\*\* This release was originally published under the/
  );
  assert.match(addendum, /https:\/\/github\.com\/thomasMinh1995\/DepVerdict/);
  assert.doesNotMatch(addendum, /v0\.6\.0-alpha\.1.*Approved candidate title/);
});
