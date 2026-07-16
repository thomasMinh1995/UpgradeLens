import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSchemaDiagnostics } from '../src/ai-runtime-debug.js';
import { AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA } from '../src/ai-version-analysis.js';
import { projectStructuredOutputSchemaForProvider } from '../src/structured-output-schema.js';

function countExactKey(value, key, active = new WeakSet()) {
  if (!value || typeof value !== 'object' || active.has(value)) return 0;
  active.add(value);
  try {
    if (Array.isArray(value)) {
      return value.reduce((total, item) => total + countExactKey(item, key, active), 0);
    }
    return Object.entries(value).reduce(
      (total, [entryKey, child]) => total + (entryKey === key ? 1 : 0) + countExactKey(child, key, active),
      0
    );
  } finally {
    active.delete(value);
  }
}

test('projection recursively removes only exact uniqueItems keys and preserves the remaining schema contract', () => {
  const schema = {
    type: 'array',
    uniqueItems: true,
    minItems: 1,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['values', 'choice'],
      properties: {
        values: {
          type: 'array',
          uniqueItems: false,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['nested'],
            properties: {
              nested: {
                type: 'array',
                uniqueItems: true,
                items: { type: 'string', pattern: '^[a-z]+$' }
              }
            }
          }
        },
        choice: { enum: ['a', 'b'] },
        uniqueItem: { type: 'boolean' }
      }
    },
    $ref: '#/$defs/not-resolved'
  };
  const before = structuredClone(schema);
  const projected = projectStructuredOutputSchemaForProvider(schema);

  assert.deepEqual(schema, before);
  assert.notEqual(projected, schema);
  assert.notEqual(projected.items, schema.items);
  assert.notEqual(projected.items.properties.values, schema.items.properties.values);
  assert.equal(countExactKey(schema, 'uniqueItems'), 3);
  assert.equal(countExactKey(projected, 'uniqueItems'), 0);
  assert.equal(projected.minItems, 1);
  assert.equal(projected.items.additionalProperties, false);
  assert.deepEqual(projected.items.required, ['values', 'choice']);
  assert.deepEqual(projected.items.properties.choice.enum, ['a', 'b']);
  assert.equal(projected.items.properties.values.items.properties.nested.items.pattern, '^[a-z]+$');
  assert.deepEqual(projected.items.properties.uniqueItem, { type: 'boolean' });
  assert.equal(projected.$ref, '#/$defs/not-resolved');
  assert.equal(Object.hasOwn(projected, 'default'), false);
  assert.doesNotMatch(JSON.stringify(projected), /"uniqueItems"/);
});

test('exact candidate projection is immutable, deterministic, serializable, and preserves supported keywords', () => {
  const exactBefore = structuredClone(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  const first = projectStructuredOutputSchemaForProvider(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  const second = projectStructuredOutputSchemaForProvider(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  const exactDiagnostics = buildSchemaDiagnostics(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA);
  const firstDiagnostics = buildSchemaDiagnostics(first);
  const secondDiagnostics = buildSchemaDiagnostics(second);

  assert.deepEqual(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA, exactBefore);
  assert.equal(countExactKey(AI_VERSION_ANALYSIS_CANDIDATE_SCHEMA, 'uniqueItems'), 4);
  assert.equal(countExactKey(first, 'uniqueItems'), 0);
  assert.deepEqual(first, second);
  assert.equal(firstDiagnostics.schemaDigest, secondDiagnostics.schemaDigest);
  assert.notEqual(firstDiagnostics.schemaDigest, exactDiagnostics.schemaDigest);
  assert.ok(firstDiagnostics.schemaBytes < exactDiagnostics.schemaBytes);
  assert.equal(firstDiagnostics.keywordCounts.pattern, exactDiagnostics.keywordCounts.pattern);
  assert.equal(firstDiagnostics.keywordCounts.minItems, exactDiagnostics.keywordCounts.minItems);
  assert.equal(firstDiagnostics.keywordCounts.items, exactDiagnostics.keywordCounts.items);
  assert.equal(firstDiagnostics.keywordCounts.required, exactDiagnostics.keywordCounts.required);
  assert.equal(firstDiagnostics.keywordCounts.additionalProperties, exactDiagnostics.keywordCounts.additionalProperties);
  assert.equal(firstDiagnostics.keywordCounts.enum, exactDiagnostics.keywordCounts.enum);
  assert.doesNotThrow(() => JSON.stringify(first));
  assert.equal(JSON.stringify(first).includes('uniqueItems'), false);
});

test('projection clones schema arrays and handles JSON primitives and null explicitly', () => {
  const enumValues = ['low', 'high'];
  const schema = { enum: enumValues, required: ['value'], type: ['string', 'null'] };
  const projected = projectStructuredOutputSchemaForProvider(schema);
  assert.deepEqual(projected, schema);
  assert.notEqual(projected.enum, enumValues);
  assert.notEqual(projected.required, schema.required);
  assert.notEqual(projected.type, schema.type);

  for (const value of [null, true, false, 'text', 0, 1.5]) {
    assert.equal(projectStructuredOutputSchemaForProvider(value), value);
  }
});

test('projection fails safely for circular, accessor, non-JSON, sparse, and non-plain inputs', () => {
  const circular = { type: 'object' };
  circular.self = circular;
  assert.throws(
    () => projectStructuredOutputSchemaForProvider(circular),
    /circular schema input is not supported/
  );
  assert.throws(
    () => projectStructuredOutputSchemaForProvider({ value: undefined }),
    /only JSON values/
  );
  assert.throws(
    () => projectStructuredOutputSchemaForProvider({ value: Number.NaN }),
    /numbers must be finite/
  );
  assert.throws(
    () => projectStructuredOutputSchemaForProvider(new Date()),
    /plain JSON objects/
  );
  assert.throws(
    () => projectStructuredOutputSchemaForProvider({ get value() { return 'unsafe'; } }),
    /accessors are not supported/
  );
  const sparse = [];
  sparse.length = 1;
  assert.throws(
    () => projectStructuredOutputSchemaForProvider(sparse),
    /sparse arrays are not JSON-safe/
  );
});

test('shared non-circular schema nodes are cloned independently', () => {
  const shared = { type: 'string', pattern: '^x$' };
  const schema = {
    type: 'object',
    properties: { left: shared, right: shared },
    required: ['left', 'right'],
    additionalProperties: false
  };
  const projected = projectStructuredOutputSchemaForProvider(schema);
  assert.deepEqual(projected, schema);
  assert.notEqual(projected.properties.left, shared);
  assert.notEqual(projected.properties.right, shared);
  assert.notEqual(projected.properties.left, projected.properties.right);
});
