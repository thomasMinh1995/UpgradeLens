import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const canonicalRepository = 'https://github.com/thomasMinh1995/DepVerdict';
const legacyRepository = 'https://github.com/thomasMinh1995/UpgradeLens';

async function text(file) {
  return readFile(path.join(root, file), 'utf8');
}

test('README presents the canonical DepVerdict preview and decision contract', async () => {
  const readme = await text('README.md');
  assert.match(readme, /^# DepVerdict$/m);
  assert.match(readme, /Public Technical Preview \/ Alpha/);
  assert.match(
    readme,
    /DepVerdict is a decision-first CLI for evidence-bounded dependency upgrade\s+analysis\./
  );
  assert.match(readme, /npm install -g @thomasminh1995\/depverdict@preview/);
  assert.match(readme, /has not yet passed its distribution gate/);
  for (const command of [
    'depverdict analyze .',
    'depverdict analyze . --offline',
    'depverdict analyze . --fail-on-incomplete'
  ]) {
    assert.ok(readme.includes(command), command);
  }
  for (const boundary of [
    'Registry latest is candidate discovery, not a recommendation',
    'Deterministic Upgrade Decision',
    'Coverage-aware impact semantics',
    'Experimental · Opt-in · Human-reviewed',
    'does not modify manifests'
  ]) {
    assert.ok(readme.includes(boundary), boundary);
  }
  assert.match(readme, /DepVerdict does not\s+execute them/);
  assert.doesNotMatch(readme, /npm install(?: -g)? upgradelens(?:@|\s|$)/);
  assert.match(readme, new RegExp(`git clone ${canonicalRepository}\\.git`));
  assert.match(readme, /^cd DepVerdict$/m);
});

test('legacy migration guide documents every bounded compatibility surface', async () => {
  const guide = await text('docs/migrations/upgradelens-to-depverdict.md');
  for (const identity of [
    '@thomasminh1995/depverdict',
    '`upgradelens` CLI',
    '`depverdict`',
    '`.upgradelens/`',
    '`.depverdict/`',
    '`UPGRADELENS_*`',
    '`DEPVERDICT_*`',
    'old npm package was never successfully published',
    'does not automatically move',
    'Do not combine files from the two roots',
    'Never print an authorization value',
    'preview-bounded'
  ]) {
    assert.ok(guide.includes(identity), identity);
  }
});

test('current architecture overview separates product and protocol identities', async () => {
  const architecture = await text('docs/architecture-overview.md');
  assert.match(architecture, /^# DepVerdict architecture overview$/m);
  assert.match(architecture, /Registry latest is discovery data, not caller intent/);
  assert.match(architecture, /deterministic Upgrade Decision/);
  assert.match(architecture, /analyzer coverage remains explicit and fails\s+closed/);
  assert.match(architecture, /does not:\n\n- modify manifests or source/);
  assert.match(architecture, /historical or versioned architecture records/);
});

test('community policies use DepVerdict and canonical private routes', async () => {
  for (const file of [
    'CONTRIBUTING.md',
    'SECURITY.md',
    'SUPPORT.md',
    'docs/architecture-overview.md',
    '.github/ISSUE_TEMPLATE/bug_report.yml',
    '.github/ISSUE_TEMPLATE/feature_request.yml',
    '.github/pull_request_template.md'
  ]) {
    assert.match(await text(file), /DepVerdict/, file);
  }

  const security = await text('SECURITY.md');
  const bug = await text('.github/ISSUE_TEMPLATE/bug_report.yml');
  const config = await text('.github/ISSUE_TEMPLATE/config.yml');
  const advisory = `${canonicalRepository}/security/advisories/new`;
  assert.ok(security.includes(advisory));
  assert.ok(bug.includes(advisory));
  assert.ok(config.includes(advisory));

  const conduct = await text('CODE_OF_CONDUCT.md');
  assert.match(conduct, /verified private conduct channel for the DepVerdict/);
  assert.match(conduct, /upgradelens\.conduct@gmail\.com/);
  assert.doesNotMatch(conduct, /depverdict\.conduct@gmail\.com/);
});

test('current release draft is exact and historical v0.5.0 release is unchanged', async () => {
  const draft = await text('docs/releases/v0.6.0-alpha.1-depverdict-preview.md');
  assert.match(draft, /^# DepVerdict v0\.6\.0-alpha\.1 — Technical Preview \/ Alpha$/m);
  assert.match(draft, /Release draft — not yet published/);
  assert.match(draft, /one `0\.6\.x` preview window/);
  assert.match(draft, /does not claim that the preview package is currently available/);
  assert.match(draft, /does not modify manifests/);
  assert.match(draft, /repository rename is complete/);
  assert.match(draft, /thomasMinh1995\/DepVerdict/);

  const historical = await readFile(
    path.join(root, 'docs/releases/v0.5.0-technical-preview.md')
  );
  assert.equal(
    createHash('sha256').update(historical).digest('hex'),
    '4a7a4b21f7867530a2dfd02b931dd85fd91a10bfb01ecc949640949ae5a2bd2a'
  );
});

test('DIFF-03 report records the bounded verdict, gate, and exact inventory', async () => {
  const report = await text('docs/reviews/diff-03-repository-docs-community-migration.md');
  assert.match(report, /Verdict: DEPVERDICT_DOCS_READY_WITH_CONTACT_OR_RENAME_GAPS/);
  assert.match(report, /Gate: PROCEED_TO_HOSTED_CI_CHECKPOINT/);
  assert.match(report, /Total DIFF-03 files: 28\./);
  assert.match(report, /Real provider calls: 0/);
  assert.match(report, /248 files, zero suspicious artifacts, 30 required assets/);
});

test('current operational surfaces use the canonical repository after rename', async () => {
  const operationalFiles = [
    'README.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'SUPPORT.md',
    'docs/releases/v0.6.0-alpha.1-depverdict-preview.md',
    '.github/ISSUE_TEMPLATE/bug_report.yml',
    '.github/ISSUE_TEMPLATE/config.yml'
  ];
  for (const file of operationalFiles) {
    const contents = await text(file);
    assert.doesNotMatch(contents, new RegExp(legacyRepository, 'u'), file);
  }

  const packageJson = JSON.parse(await text('package.json'));
  assert.equal(packageJson.repository.url, `git+${canonicalRepository}.git`);
  assert.equal(packageJson.homepage, `${canonicalRepository}#readme`);
  assert.equal(packageJson.bugs.url, `${canonicalRepository}/issues`);

  const contributing = await text('CONTRIBUTING.md');
  assert.match(contributing, new RegExp(`git clone ${canonicalRepository}\\.git`));
  assert.match(contributing, /^cd DepVerdict$/m);

  const guide = await text('docs/migrations/upgradelens-to-depverdict.md');
  assert.match(guide, /repository rename is complete/i);
  assert.ok(guide.includes(legacyRepository));
  assert.match(guide, /redirect compatibility aid|redirects for\s+continuity/);
});

test('legacy repository URL remains bounded to migration or historical status records', async () => {
  const guide = await text('docs/migrations/upgradelens-to-depverdict.md');
  assert.ok(guide.includes(legacyRepository));
  assert.match(guide, /migration|former|redirect/iu);
});

test('relative links and Markdown fences resolve in current normative documents', async () => {
  const files = [
    'README.md',
    'CONTRIBUTING.md',
    'SECURITY.md',
    'CODE_OF_CONDUCT.md',
    'SUPPORT.md',
    'docs/decisions/diff-03-repository-docs-community-migration.md',
    'docs/migrations/upgradelens-to-depverdict.md',
    'docs/releases/v0.6.0-alpha.1-depverdict-preview.md',
    'docs/reviews/diff-03-repository-docs-community-migration.md',
    'examples/technical-preview-node/README.md'
  ];

  for (const file of files) {
    const contents = await text(file);
    assert.equal((contents.match(/^```/gm) ?? []).length % 2, 0, `${file}: fences`);
    assert.doesNotMatch(contents, /\/Users\/|\/home\/|[A-Za-z]:\\Users\\/, file);
    for (const match of contents.matchAll(/\[[^\]]+\]\((?!https?:|mailto:|#)([^)#]+)(?:#[^)]+)?\)/g)) {
      const target = path.resolve(root, path.dirname(file), match[1]);
      await access(target);
    }
  }
});
