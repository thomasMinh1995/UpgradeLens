import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../src/canonical-json.js';
import {
  createCacheIdentity,
  createKnowledgeCache,
  KnowledgeCacheError
} from '../src/knowledge-cache.js';

const fixtureDirectory = new URL('./fixtures/knowledge-cache/', import.meta.url);

function identity(overrides = {}) {
  return createCacheIdentity({
    adapter: 'npm',
    resourceKind: 'registry-package',
    packageId: 'npm:react',
    resourceVariant: 'full-metadata',
    adapterVersion: '1',
    ...overrides
  });
}

async function temporaryRoot() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'upgradelens-knowledge-cache-'));
}

async function entryFile(root) {
  const entries = (await fs.readdir(root)).filter((entry) => entry.endsWith('.json'));
  assert.equal(entries.length, 1);
  return path.join(root, entries[0]);
}

function fakeClock(initial = '2026-07-14T00:00:00.000Z') {
  let now = new Date(initial).getTime();
  return {
    clock: () => new Date(now),
    advance(milliseconds) { now += milliseconds; }
  };
}

async function withRoot(run) {
  const root = await temporaryRoot();
  try {
    await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

test('missing cache entries return a structured missing result', async () => {
  await withRoot(async (root) => {
    const cache = createKnowledgeCache({ rootDirectory: root });
    assert.deepEqual(await cache.read(identity()), { status: 'missing' });
  });
});

test('writes and reads a fresh cache envelope with automatically created directories', async () => {
  await withRoot(async (parent) => {
    const root = path.join(parent, 'nested', 'knowledge', 'v1');
    const time = fakeClock();
    const cache = createKnowledgeCache({ rootDirectory: root, clock: time.clock });
    const write = await cache.write(identity(), { versions: ['19.2.0'] }, { ttlMs: 1_000 });

    assert.match(write.bodyDigest, /^sha256:[a-f0-9]{64}$/);
    assert.deepEqual(await cache.read(identity()), {
      status: 'fresh',
      body: { versions: ['19.2.0'] },
      storedAt: '2026-07-14T00:00:00.000Z',
      expiresAt: '2026-07-14T00:00:01.000Z',
      bodyDigest: write.bodyDigest
    });
    await fs.access(root);
  });
});

test('expiry is deterministic and the exact boundary is expired', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const cache = createKnowledgeCache({ rootDirectory: root, clock: time.clock });
    await cache.write(identity(), { name: 'react' }, { ttlMs: 10 });
    assert.equal((await cache.read(identity())).status, 'fresh');
    time.advance(10);
    const result = await cache.read(identity());
    assert.equal(result.status, 'expired');
    assert.deepEqual(result.body, { name: 'react' });
  });
});

test('canonical identities are stable, distinct, and safe for scoped npm package names', async () => {
  await withRoot(async (root) => {
    const first = identity();
    const equivalent = createCacheIdentity({
      resourceVariant: 'full-metadata',
      packageId: 'npm:react',
      adapterVersion: '1',
      adapter: 'npm',
      resourceKind: 'registry-package'
    });
    const scoped = identity({ packageId: 'npm:@vitejs/plugin-react' });
    const pypi = identity({ adapter: 'pypi', packageId: 'pypi:react' });
    assert.deepEqual(first, equivalent);
    assert.notDeepEqual(first, pypi);

    const cache = createKnowledgeCache({ rootDirectory: root });
    await cache.write(scoped, { name: '@vitejs/plugin-react' }, { ttlMs: 1 });
    const filename = path.basename(await entryFile(root));
    assert.match(filename, /^[a-f0-9]{64}\.json$/);
    assert.equal(filename.includes('@'), false);
    assert.equal(filename.includes('/'), false);
  });
});

test('canonical body digest ignores object property order but preserves array order', async () => {
  await withRoot(async (root) => {
    const cache = createKnowledgeCache({ rootDirectory: root });
    const first = await cache.write(identity(), { b: 2, a: { z: 1, y: 0 }, values: ['a', 'b'] }, { ttlMs: 1 });
    const second = await cache.write(identity(), { values: ['a', 'b'], a: { y: 0, z: 1 }, b: 2 }, { ttlMs: 1 });
    const reversed = await cache.write(identity(), { values: ['b', 'a'], a: { y: 0, z: 1 }, b: 2 }, { ttlMs: 1 });

    assert.equal(first.bodyDigest, second.bodyDigest);
    assert.notEqual(second.bodyDigest, reversed.bodyDigest);
  });
});

test('invalid JSON, malformed envelopes, and digest or identity changes are corrupted rather than thrown', async () => {
  await withRoot(async (root) => {
    const time = fakeClock();
    const cache = createKnowledgeCache({ rootDirectory: root, clock: time.clock });
    const cacheIdentity = identity();
    await cache.write(cacheIdentity, { name: 'react' }, { ttlMs: 1 });
    const file = await entryFile(root);

    const invalid = await fs.readFile(new URL('invalid.json', fixtureDirectory), 'utf8');
    await fs.writeFile(file, invalid);
    assert.deepEqual(await cache.read(cacheIdentity), { status: 'corrupted', reason: 'invalid-json' });

    await cache.write(cacheIdentity, { name: 'react' }, { ttlMs: 1 });
    const envelope = JSON.parse(await fs.readFile(file, 'utf8'));
    envelope.body.name = 'vue';
    await fs.writeFile(file, JSON.stringify(envelope));
    assert.equal((await cache.read(cacheIdentity)).reason, 'body-digest-mismatch');

    await cache.write(cacheIdentity, { name: 'react' }, { ttlMs: 1 });
    const identityMismatch = JSON.parse(await fs.readFile(file, 'utf8'));
    identityMismatch.identity.packageId = 'npm:vue';
    await fs.writeFile(file, JSON.stringify(identityMismatch));
    assert.equal((await cache.read(cacheIdentity)).reason, 'identity-mismatch');

    await cache.write(cacheIdentity, { name: 'react' }, { ttlMs: 1 });
    const unknownVersion = JSON.parse(await fs.readFile(file, 'utf8'));
    unknownVersion.envelopeVersion = '2';
    await fs.writeFile(file, JSON.stringify(unknownVersion));
    assert.equal((await cache.read(cacheIdentity)).reason, 'unsupported-envelope-version');

    await cache.write(cacheIdentity, { name: 'react' }, { ttlMs: 1 });
    const invalidDates = JSON.parse(await fs.readFile(file, 'utf8'));
    invalidDates.storedAt = 'not-a-date';
    await fs.writeFile(file, JSON.stringify(invalidDates));
    assert.equal((await cache.read(cacheIdentity)).reason, 'invalid-timestamps');

    await cache.write(cacheIdentity, { name: 'react' }, { ttlMs: 1 });
    const reversedDates = JSON.parse(await fs.readFile(file, 'utf8'));
    reversedDates.expiresAt = '2026-07-13T00:00:00.000Z';
    await fs.writeFile(file, JSON.stringify(reversedDates));
    assert.equal((await cache.read(cacheIdentity)).reason, 'invalid-timestamps');
  });
});

test('cache bodies reject unsupported JSON values and private cache or request data', async () => {
  await withRoot(async (root) => {
    const cache = createKnowledgeCache({ rootDirectory: root });
    await assert.rejects(
      cache.write(identity(), { unresolved: undefined }, { ttlMs: 1 }),
      (error) => error instanceof KnowledgeCacheError && error.code === 'KNOWLEDGE_CACHE_INVALID_BODY'
    );
    await assert.rejects(
      cache.write(identity(), { ETag: 'abc' }, { ttlMs: 1 }),
      (error) => error instanceof KnowledgeCacheError && error.code === 'KNOWLEDGE_CACHE_INVALID_BODY'
    );
    await assert.rejects(
      cache.write(identity(), { accessToken: 'secret' }, { ttlMs: 1 }),
      (error) => error instanceof KnowledgeCacheError && error.code === 'KNOWLEDGE_CACHE_INVALID_BODY'
    );
    await assert.rejects(
      cache.write(identity(), { source: '/private/tmp/response.json' }, { ttlMs: 1 }),
      (error) => error instanceof KnowledgeCacheError && error.code === 'KNOWLEDGE_CACHE_INVALID_BODY'
    );
  });
});

test('negative or invalid TTL values are rejected', async () => {
  await withRoot(async (root) => {
    const cache = createKnowledgeCache({ rootDirectory: root });
    for (const ttlMs of [-1, 1.5, Number.NaN, undefined]) {
      await assert.rejects(
        cache.write(identity(), { name: 'react' }, { ttlMs }),
        (error) => error instanceof KnowledgeCacheError && error.code === 'KNOWLEDGE_CACHE_INVALID_TTL'
      );
    }
  });
});

test('a failed atomic rename preserves an existing final entry and cleans the temporary attempt', async () => {
  await withRoot(async (root) => {
    const cache = createKnowledgeCache({ rootDirectory: root });
    const cacheIdentity = identity();
    await cache.write(cacheIdentity, { name: 'react', version: '19.2.0' }, { ttlMs: 1_000 });

    const failingCache = createKnowledgeCache({
      rootDirectory: root,
      fileSystem: {
        mkdir: fs.mkdir,
        open: fs.open,
        readFile: fs.readFile,
        rm: fs.rm,
        rename: async () => { throw Object.assign(new Error('simulated rename failure'), { code: 'EIO' }); }
      }
    });
    await assert.rejects(
      failingCache.write(cacheIdentity, { name: 'react', version: '20.0.0' }, { ttlMs: 1_000 }),
      (error) => error instanceof KnowledgeCacheError && error.code === 'KNOWLEDGE_CACHE_WRITE_FAILED'
    );
    assert.deepEqual((await cache.read(cacheIdentity)).body, { name: 'react', version: '19.2.0' });
    const leftovers = await fs.readdir(root);
    assert.equal(leftovers.some((entry) => entry.endsWith('.tmp')), false);
  });
});

test('cache envelopes omit absolute paths, cache keys, validators, headers, and credentials', async () => {
  await withRoot(async (root) => {
    const cache = createKnowledgeCache({ rootDirectory: root });
    await cache.write(identity(), { name: 'react', homepage: 'https://react.dev/' }, { ttlMs: 1 });
    const envelopeText = await fs.readFile(await entryFile(root), 'utf8');
    const envelope = JSON.parse(envelopeText);
    assert.equal(envelopeText.includes(root), false);
    assert.equal('cacheKey' in envelope, false);
    assert.equal(/etag|last-modified|authorization|headers|credentials/i.test(envelopeText), false);
    assert.deepEqual(Object.keys(envelope).sort(), [
      'body', 'bodyDigest', 'envelopeVersion', 'expiresAt', 'identity', 'storedAt'
    ]);
  });
});

test('concurrent completion order does not change generated cache identities', async () => {
  const inputs = [
    identity({ packageId: 'npm:react' }),
    identity({ packageId: 'npm:vite' }),
    identity({ adapter: 'pypi', packageId: 'pypi:fastapi' })
  ];
  const expected = inputs.map((item) => createHash('sha256').update(canonicalJson(item), 'utf8').digest('hex'));
  const actual = await Promise.all([...inputs].reverse().map(async (item) => {
    await Promise.resolve();
    return createHash('sha256').update(canonicalJson(item), 'utf8').digest('hex');
  }));
  assert.deepEqual(actual.sort(), expected.sort());
});
