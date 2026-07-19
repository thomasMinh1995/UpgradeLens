import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const canonicalRepository = 'https://github.com/thomasMinh1995/DepVerdict';

async function text(file) {
  return readFile(path.join(root, file), 'utf8');
}

function issueFormItems(contents) {
  return contents.split(/\n(?=  - type: )/u)
    .filter((section) => section.startsWith('  - type: '))
    .map((section) => {
    const type = section.match(/^  - type: ([a-z]+)$/mu)?.[1] ?? null;
    const id = section.match(/^    id: ([A-Za-z0-9_-]+)$/mu)?.[1] ?? null;
    const keys = [...section.matchAll(/^    ([A-Za-z][A-Za-z0-9_-]*):/gmu)]
      .map((item) => item[1]);
    return { type, id, keys };
  });
}

test('README and release note describe the immutable public preview truthfully', async () => {
  const readme = await text('README.md');
  const release = await text('docs/releases/v0.6.0-alpha.1-depverdict-preview.md');
  for (const contents of [readme, release]) {
    assert.match(contents, /npm install -g @thomasminh1995\/depverdict@preview/);
    assert.match(contents, /Alpha|Technical Preview/);
    assert.match(contents, /latest/);
    assert.doesNotMatch(
      contents,
      /not yet published|publication pending|planned install command after publication|will be published shortly|currently waiting for release/i
    );
  }
  assert.match(readme, /depverdict analyze \./);
  assert.match(readme, /Technical Preview feedback guide/);
  assert.match(release, /@thomasminh1995\/depverdict@0\.6\.0-alpha\.1/);
  assert.match(release, /Release ID `356383051`/);
});

test('bug form has supported item structure and every required product context ID', async () => {
  const bug = await text('.github/ISSUE_TEMPLATE/bug_report.yml');
  const items = issueFormItems(bug);
  assert.ok(items.length > 0);
  const allowedTypes = new Set(['markdown', 'textarea', 'input', 'dropdown', 'checkboxes']);
  const allowedKeys = new Set(['id', 'attributes', 'validations']);
  for (const item of items) {
    assert.ok(allowedTypes.has(item.type), item.type);
    assert.ok(item.keys.every((key) => allowedKeys.has(key)), item.keys);
  }
  const ids = items.map((item) => item.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of [
    'version',
    'installation-source',
    'node-version',
    'npm-version',
    'operating-system',
    'execution-mode',
    'command',
    'exit-code',
    'completion-state',
    'upgrade-decision',
    'handoff-status',
    'dependency-occurrence',
    'provider-runtime',
    'repository-shape',
    'expected',
    'actual',
    'reproduction',
    'privacy'
  ]) {
    assert.ok(ids.includes(id), id);
  }
  for (const fallback of ['Not available', 'Not applicable']) {
    assert.ok(bug.includes(fallback), fallback);
  }
});

test('public forms prohibit sensitive data and preserve private reporting routes', async () => {
  for (const file of [
    '.github/ISSUE_TEMPLATE/bug_report.yml',
    '.github/ISSUE_TEMPLATE/feature_request.yml'
  ]) {
    const contents = await text(file);
    for (const boundary of [
      'API keys',
      'npm tokens',
      'PATs',
      '`.env`',
      'signed URLs',
      'private source',
      'unsanitized manifests',
      'provider requests/responses',
      'organization-confidential'
    ]) {
      assert.ok(contents.includes(boundary), `${file}: ${boundary}`);
    }
    assert.ok(contents.includes(`${canonicalRepository}/security/advisories/new`));
    assert.ok(contents.includes(`${canonicalRepository}/blob/main/CODE_OF_CONDUCT.md`));
    assert.doesNotMatch(contents, /thomasMinh1995\/UpgradeLens/);
  }
  const config = await text('.github/ISSUE_TEMPLATE/config.yml');
  assert.match(config, /blank_issues_enabled: false/);
});

test('package documentation policy is categorical and excludes operational-only paths', async () => {
  const decision = await text('docs/decisions/rel-03-package-documentation-policy.md');
  const policy = await text('docs/package-content-policy.md');
  for (const category of [
    'Runtime-required',
    'User-operational',
    'Trust/provenance evidence',
    'Maintainer review',
    'Announcement/promotional',
    'Capture/private/transient'
  ]) {
    assert.ok(`${decision}\n${policy}`.toLowerCase().includes(category.toLowerCase()), category);
  }
  const packageJson = JSON.parse(await text('package.json'));
  assert.ok(packageJson.files.includes('!docs/reviews/**'));
  assert.ok(packageJson.files.includes('!docs/announcements/**'));
});

test('qualification decision defers packaging and no live record is tracked', async () => {
  const decision = await text('docs/decisions/rel-03-packaged-qualification-evidence.md');
  assert.match(decision, /Decision: `DEFER_PENDING_PROVENANCE_CONTRACT`/);
  assert.match(decision, /do not authenticate an issuer/);
  assert.match(decision, /model\/provider non-generalization/i);
  await assert.rejects(
    access(path.join(root, '.depverdict/migration-planning-qualification.json')),
    { code: 'ENOENT' }
  );
});
