import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { discoverProject } from '../src/index.js';

test('generated manifests validate against the JSON Schema dependency contract', async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-schema-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'schema-fixture',
    dependencies: { react: '^19.0.0' },
    devDependencies: { react: '^19.1.0', vite: '^7.0.0' }
  }));

  const schema = JSON.parse(await readFile(
    new URL('../schemas/project-manifest.schema.json', import.meta.url),
    'utf8'
  ));
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const manifest = await discoverProject(root);

  assert.equal(validate(manifest), true, JSON.stringify(validate.errors, null, 2));

  const invalidUnsupported = structuredClone(manifest);
  invalidUnsupported.projects[0].dependencySummary.status = 'unsupported';
  assert.equal(validate(invalidUnsupported), false);

  const invalidParsed = structuredClone(manifest);
  delete invalidParsed.projects[0].dependencySummary.uniqueCount;
  assert.equal(validate(invalidParsed), false);
});
