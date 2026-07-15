import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const evalDirectory = new URL('../eval/', import.meta.url);
const datasetDirectory = new URL('../eval/datasets/', import.meta.url);

async function json(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

async function datasetFiles(directory = datasetDirectory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) files.push(...await datasetFiles(child));
    else if (entry.name.endsWith('.json')) files.push(child);
  }
  return files.sort((left, right) => left.pathname.localeCompare(right.pathname));
}

test('Golden evaluation dataset schemas validate every case and required coverage', async (t) => {
  const expectedResultSchema = await json(new URL('schemas/expected-result.schema.json', evalDirectory));
  const caseSchema = await json(new URL('schemas/golden-case.schema.json', evalDirectory));
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  ajv.addSchema(expectedResultSchema);
  const validate = ajv.compile(caseSchema);
  const files = await datasetFiles();

  assert.equal(files.length, 10);
  const cases = [];
  for (const file of files) {
    await t.test(path.relative(new URL('../', import.meta.url).pathname, file.pathname), async () => {
      const value = await json(file);
      cases.push(value);
      assert.equal(validate(value), true, JSON.stringify(validate.errors, null, 2));
    });
  }

  assert.deepEqual(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.ok(cases.some((item) => item.dependency.ecosystem === 'node'));
  assert.ok(cases.some((item) => item.dependency.ecosystem === 'python'));
  assert.ok(cases.some((item) => item.expectedResult.riskLevel === 'high'));
  assert.ok(cases.some((item) => item.expectedResult.riskLevel === 'medium'));
  assert.ok(cases.some((item) => item.expectedResult.riskLevel === 'low'));
  assert.ok(cases.some((item) => item.expectedResult.riskLevel === 'unknown'));
  assert.ok(cases.some((item) => item.versions.analysisMode === 'declaredConstraint'));
  assert.ok(cases.some((item) => item.selectedEvidence.length === 0));
  assert.ok(cases.some((item) => item.category === 'conflict'));
});
