import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  ANALYSIS_STAGES,
  createUsageAnalyzerRegistry,
  discoverProject,
  discoverRepositoryUsage,
  runAnalysisPipeline
} from '../src/index.js';
import { createCooperativeScheduler } from '../src/cooperative-scheduler.js';

const temporaryDirectories = [];
const USAGE_STAGE = Object.freeze([ANALYSIS_STAGES.find((stage) => stage.id === 'usageDiscovery')]);

async function temporaryRepository() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'upgradelens-cooperative-'));
  temporaryDirectories.push(root);
  return root;
}

async function write(root, relative, contents) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents);
}

function usageInputs() {
  return {
    projectManifest: {
      projects: [{
        id: 'node:.',
        path: '.',
        ecosystem: 'node',
        dependencies: [{
          name: 'fixture-dependency',
          normalizedName: 'fixture-dependency',
          type: 'dependency',
          manifest: 'package.json'
        }]
      }]
    },
    versionAnalysis: {
      results: [{
        dependency: {
          projectId: 'node:.',
          packageId: 'npm:fixture-dependency',
          declaredName: 'fixture-dependency',
          normalizedName: 'fixture-dependency',
          ecosystem: 'node',
          dependencyType: 'dependency',
          manifest: 'package.json'
        }
      }]
    },
    input: {
      projectManifest: {
        schemaVersion: '2.0.0',
        artifact: '.upgradelens/project-manifest.json',
        artifactDigest: `sha256:${'1'.repeat(64)}`,
        repository: { name: 'fixture', root: '.' }
      },
      versionAnalysis: {
        schemaVersion: '1.0.0',
        artifact: '.upgradelens/version-analysis.json',
        artifactDigest: `sha256:${'2'.repeat(64)}`
      }
    }
  };
}

test.after(async () => {
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

test('production cooperative yield admits another real Node event-loop callback', async () => {
  let eventLoopCallbackRan = false;
  setImmediate(() => {
    eventLoopCallbackRan = true;
  });
  const scheduler = createCooperativeScheduler({ batchSize: 1 });
  await scheduler.boundary();
  assert.equal(eventLoopCallbackRan, true);
  assert.deepEqual(scheduler.snapshot(), {
    completedUnits: 1,
    yieldCount: 1,
    unitsSinceYield: 0
  });
});

test('injected scheduler is deterministic and operation-local', async () => {
  let now = 0;
  const firstYields = [];
  const first = createCooperativeScheduler({
    batchSize: 3,
    maxIntervalMs: 100,
    monotonicClock: () => now,
    yieldImplementation: async () => firstYields.push(now)
  });
  const second = createCooperativeScheduler({
    batchSize: 2,
    maxIntervalMs: 100,
    monotonicClock: () => now,
    yieldImplementation: async () => {}
  });

  await first.boundary();
  now += 101;
  await first.boundary();
  await first.boundary();
  await second.boundary();
  await second.boundary();

  assert.deepEqual(firstYields, [101]);
  assert.deepEqual(first.snapshot(), {
    completedUnits: 3,
    yieldCount: 1,
    unitsSinceYield: 1
  });
  assert.deepEqual(second.snapshot(), {
    completedUnits: 2,
    yieldCount: 1,
    unitsSinceYield: 1
  });
});

test('cooperative scheduler observes abort before and after yield and propagates scheduler errors', async () => {
  const before = new AbortController();
  before.abort(new Error('before boundary'));
  await assert.rejects(
    createCooperativeScheduler({ signal: before.signal }).boundary(),
    (error) => error.name === 'AbortError' && error.code === 'ANALYSIS_CANCELLED'
  );

  const after = new AbortController();
  const afterScheduler = createCooperativeScheduler({
    signal: after.signal,
    batchSize: 1,
    yieldImplementation: async () => after.abort(new Error('during yield'))
  });
  await assert.rejects(
    afterScheduler.boundary(),
    (error) => error.name === 'AbortError' && error.code === 'ANALYSIS_CANCELLED'
  );

  const schedulerFailure = new Error('fixture scheduler failure');
  await assert.rejects(
    createCooperativeScheduler({
      batchSize: 1,
      yieldImplementation: async () => { throw schedulerFailure; }
    }).boundary(),
    (error) => error === schedulerFailure
  );
});

test('real Node heartbeat runs during an event-loop-safe synchronous multi-file workload', async () => {
  const events = [];
  const scheduler = createCooperativeScheduler({ batchSize: 1 });

  await runAnalysisPipeline({
    repositoryRoot: '.',
    stages: USAGE_STAGE,
    progressOptions: { heartbeatIntervalMs: 10 },
    progressListener: (event) => events.push(event),
    runners: {
      async usageDiscovery() {
        for (let index = 0; index < 24; index += 1) {
          pbkdf2Sync('fixture', 'upgradelens', 5_000, 32, 'sha256');
          await scheduler.boundary();
        }
        return { files: 24 };
      }
    }
  });

  const heartbeatIndex = events.findIndex((event) => event.type === 'STAGE_HEARTBEAT');
  const completedIndex = events.findIndex((event) => event.type === 'STAGE_COMPLETED');
  assert.notEqual(heartbeatIndex, -1);
  assert.ok(heartbeatIndex < completedIndex);
  assert.ok(events.filter((event) => event.type === 'STAGE_COMPLETED').length === 1);
});

test('real Node heartbeat runs during a synchronous multi-file Usage workload', async () => {
  const root = await temporaryRepository();
  for (let index = 0; index < 24; index += 1) {
    await write(root, `src/file-${String(index).padStart(2, '0')}.slow`, 'fixture');
  }
  const analyzer = Object.freeze({
    id: 'synchronous-cpu-fixture',
    version: '1.0.0',
    ecosystems: Object.freeze(['node']),
    extensions: Object.freeze(['.slow']),
    analyze() {
      pbkdf2Sync('fixture', 'upgradelens', 5_000, 32, 'sha256');
      return [];
    }
  });
  const events = [];
  let analyzedFiles = 0;
  const countingRegistry = createUsageAnalyzerRegistry([Object.freeze({
    ...analyzer,
    analyze(input) {
      analyzedFiles += 1;
      return analyzer.analyze(input);
    }
  })]);

  const result = await runAnalysisPipeline({
    repositoryRoot: root,
    stages: USAGE_STAGE,
    progressOptions: { heartbeatIntervalMs: 10 },
    progressListener: (event) => events.push(event),
    runners: {
      async usageDiscovery({ signal }) {
        return discoverRepositoryUsage({
          repositoryRoot: root,
          registry: countingRegistry,
          signal,
          ...usageInputs()
        });
      }
    }
  });

  const heartbeatIndex = events.findIndex((event) => event.type === 'STAGE_HEARTBEAT');
  const completedIndex = events.findIndex((event) => event.type === 'STAGE_COMPLETED');
  assert.notEqual(heartbeatIndex, -1);
  assert.ok(heartbeatIndex < completedIndex);
  assert.equal(analyzedFiles, 24);
  assert.equal(result.artifacts.usageDiscovery.analysis.analyzedFileCount, 24);
});

test('Discovery and Usage artifacts are byte-equivalent across cooperative policies', async () => {
  const root = await temporaryRepository();
  await write(root, 'package.json', JSON.stringify({
    name: 'fixture',
    dependencies: { 'fixture-dependency': '1.0.0' }
  }));
  await write(
    root,
    'src/App.js',
    "import fixture from 'fixture-dependency';\nfixture.run();\n"
  );
  await write(
    root,
    'packages/member/package.json',
    JSON.stringify({ name: 'member', dependencies: { other: '1.0.0' } })
  );
  const generatedAt = () => new Date('2026-07-17T00:00:00.000Z');

  const discoveryDisabledScheduler = createCooperativeScheduler({ enabled: false });
  const discoveryEnabledScheduler = createCooperativeScheduler({ batchSize: 1 });
  const discoveryOtherBatchScheduler = createCooperativeScheduler({ batchSize: 7 });
  const discoveryDisabled = await discoverProject(root, {
    clock: generatedAt,
    cooperativeScheduler: discoveryDisabledScheduler
  });
  const discoveryEnabled = await discoverProject(root, {
    clock: generatedAt,
    cooperativeScheduler: discoveryEnabledScheduler
  });
  const discoveryOtherBatch = await discoverProject(root, {
    clock: generatedAt,
    cooperativeScheduler: discoveryOtherBatchScheduler
  });

  assert.equal(JSON.stringify(discoveryEnabled), JSON.stringify(discoveryDisabled));
  assert.equal(JSON.stringify(discoveryOtherBatch), JSON.stringify(discoveryDisabled));
  assert.ok(discoveryEnabledScheduler.snapshot().yieldCount > 0);

  const manifest = {
    projects: [{
      id: 'node:.',
      path: '.',
      ecosystem: 'node',
      dependencies: [{
        name: 'fixture-dependency',
        normalizedName: 'fixture-dependency',
        type: 'dependency',
        manifest: 'package.json'
      }]
    }]
  };
  const usageOptions = {
    repositoryRoot: root,
    projectManifest: manifest,
    versionAnalysis: usageInputs().versionAnalysis,
    input: usageInputs().input,
    clock: generatedAt
  };
  const usageDisabledScheduler = createCooperativeScheduler({ enabled: false });
  const usageEnabledScheduler = createCooperativeScheduler({ batchSize: 1 });
  const usageOtherBatchScheduler = createCooperativeScheduler({ batchSize: 5 });
  const usageDisabled = await discoverRepositoryUsage({
    ...usageOptions,
    cooperativeScheduler: usageDisabledScheduler
  });
  const usageEnabled = await discoverRepositoryUsage({
    ...usageOptions,
    cooperativeScheduler: usageEnabledScheduler
  });
  const usageOtherBatch = await discoverRepositoryUsage({
    ...usageOptions,
    cooperativeScheduler: usageOtherBatchScheduler
  });

  assert.equal(JSON.stringify(usageEnabled), JSON.stringify(usageDisabled));
  assert.equal(JSON.stringify(usageOtherBatch), JSON.stringify(usageDisabled));
  assert.ok(usageEnabledScheduler.snapshot().yieldCount > 0);
});

test('Usage cancellation is observed between files without returning a partial artifact', async () => {
  const root = await temporaryRepository();
  for (let index = 0; index < 40; index += 1) {
    await write(root, `src/file-${String(index).padStart(2, '0')}.slow`, 'fixture');
  }
  let analyzedFiles = 0;
  const controller = new AbortController();
  const analyzer = Object.freeze({
    id: 'cancellable-cpu-fixture',
    version: '1.0.0',
    ecosystems: Object.freeze(['node']),
    extensions: Object.freeze(['.slow']),
    analyze() {
      analyzedFiles += 1;
      if (analyzedFiles === 5) {
        setImmediate(() => controller.abort(new Error('fixture cancellation')));
      }
      pbkdf2Sync('fixture', 'upgradelens', 5_000, 32, 'sha256');
      return [];
    }
  });

  await assert.rejects(
    discoverRepositoryUsage({
      repositoryRoot: root,
      registry: createUsageAnalyzerRegistry([analyzer]),
      signal: controller.signal,
      cooperativeBatchSize: 1,
      ...usageInputs()
    }),
    (error) => error.name === 'AbortError' && error.code === 'ANALYSIS_CANCELLED'
  );
  assert.equal(analyzedFiles, 5);
});

test('Project Discovery cancellation is observed between completed scan units', async () => {
  const root = await temporaryRepository();
  for (let index = 0; index < 40; index += 1) {
    await write(
      root,
      `packages/member-${String(index).padStart(2, '0')}/package.json`,
      JSON.stringify({ name: `member-${index}`, dependencies: {} })
    );
  }
  const controller = new AbortController();
  const cancellation = setTimeout(() => controller.abort(new Error('fixture cancellation')), 1);

  await assert.rejects(
    discoverProject(root, {
      signal: controller.signal,
      cooperativeBatchSize: 1
    }),
    (error) => error.name === 'AbortError' && error.code === 'ANALYSIS_CANCELLED'
  );
  clearTimeout(cancellation);
});
