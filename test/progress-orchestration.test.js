import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';

import { executeAnalyze } from '../src/cli.js';
import {
  ANALYSIS_STAGES,
  MAX_PROGRESS_SUBJECT_LENGTH,
  PROGRESS_EVENT_VERSION,
  PipelineCancellationError,
  createProgressEventRuntime,
  createProgressReporter,
  runAnalysisPipeline,
  sanitizeProgressSubject,
  selectProgressMode
} from '../src/index.js';

function capture({ isTTY = false, columns = 120, throws = false } = {}) {
  let value = '';
  return {
    stream: {
      isTTY,
      columns,
      write(chunk) {
        if (throws) throw new Error('fixture output failure');
        value += chunk;
        return true;
      }
    },
    value: () => value
  };
}

function manualTime() {
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  return {
    monotonicClock: () => now,
    wallClock: () => new Date(Date.UTC(2026, 0, 1) + now),
    scheduler: {
      setTimeout(callback, delay) {
        const timer = {
          id: ++nextId,
          due: now + delay,
          callback,
          unrefCalled: false,
          unref() { this.unrefCalled = true; }
        };
        timers.set(timer.id, timer);
        return timer;
      },
      clearTimeout(timer) {
        timers.delete(timer.id);
      }
    },
    advance(milliseconds) {
      now += milliseconds;
      let due;
      do {
        due = [...timers.values()]
          .filter((timer) => timer.due <= now)
          .sort((left, right) => left.due - right.due || left.id - right.id);
        for (const timer of due) {
          timers.delete(timer.id);
          timer.callback();
        }
      } while (due.length > 0 && [...timers.values()].some((timer) => timer.due <= now));
    },
    timers
  };
}

const TWO_STAGES = Object.freeze(ANALYSIS_STAGES.slice(0, 2));

test('progress contract has stable stages, immutable allowlisted events, and valid lifecycle', () => {
  const time = manualTime();
  const events = [];
  const runtime = createProgressEventRuntime({
    stages: TWO_STAGES,
    listener: (event) => events.push(event),
    ...time,
    heartbeatIntervalMs: 5_000
  });
  runtime.startRun();
  runtime.startStage('projectDiscovery');
  runtime.activity('projectDiscovery', {
    activityKind: 'DISCOVER_PROJECT_MANIFESTS',
    subject: ' package\n"private"\\name ',
    completed: 0,
    total: 2
  });
  runtime.completeStage('projectDiscovery');
  runtime.skipStage('knowledgeResearch', 'PRIOR_STAGE_FAILED');
  runtime.failRun();

  assert.deepEqual(ANALYSIS_STAGES.map(({ id }) => id), [
    'projectDiscovery',
    'knowledgeResearch',
    'versionAnalysis',
    'usageDiscovery',
    'impactAnalysis',
    'impactEvidence',
    'upgradeDecision',
    'markdownReport'
  ]);
  assert.deepEqual(events.map((event) => event.type), [
    'RUN_STARTED',
    'STAGE_SCHEDULED',
    'STAGE_SCHEDULED',
    'STAGE_STARTED',
    'STAGE_ACTIVITY',
    'STAGE_COMPLETED',
    'STAGE_SKIPPED',
    'RUN_FAILED'
  ]);
  assert.deepEqual(events.map((event) => event.sequence), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(events.every((event) => event.eventVersion === PROGRESS_EVENT_VERSION));
  assert.ok(events.every(Object.isFrozen));
  assert.deepEqual(Object.keys(events[0]), [
    'eventVersion', 'sequence', 'type', 'stageId', 'stageLabel', 'activityKind',
    'subject', 'completed', 'total', 'elapsedMs', 'status', 'reasonCode', 'timestamp'
  ]);
  assert.equal(events[4].subject, "package 'private''name");
  assert.throws(() => { events[4].status = 'FAILED'; }, TypeError);
  assert.equal(runtime.snapshot().runTerminal, true);
  assert.equal(time.timers.size, 0);
});

test('activity validates known counts and sanitizes bounded labels without corrupting state', () => {
  assert.equal(sanitizeProgressSubject(`  ${'x'.repeat(200)}\n`), 'x'.repeat(MAX_PROGRESS_SUBJECT_LENGTH));
  assert.equal(
    sanitizeProgressSubject('Bearer private-token api_key=private https://private.example/path?token=x'),
    'Bearer [REDACTED] api_key=[REDACTED] [REDACTED_URL]'
  );
  const runtime = createProgressEventRuntime({ stages: TWO_STAGES });
  runtime.startRun();
  runtime.startStage('projectDiscovery');
  assert.throws(
    () => runtime.activity('projectDiscovery', { activityKind: 'WORK', completed: 2 }),
    /supplied together/
  );
  assert.throws(
    () => runtime.activity('projectDiscovery', { activityKind: 'WORK', completed: 3, total: 2 }),
    /completed <= total/
  );
  assert.throws(
    () => runtime.activity('projectDiscovery', { activityKind: 'not-valid' }),
    /uppercase code/
  );
  runtime.completeStage('projectDiscovery');
  assert.throws(() => runtime.completeStage('projectDiscovery'), /not active|terminal/);
  runtime.skipStage('knowledgeResearch', 'PRIOR_STAGE_FAILED');
  runtime.failRun();
});

test('heartbeat starts after quiet interval, activity resets it, and terminal events stop timers', () => {
  const time = manualTime();
  const events = [];
  const runtime = createProgressEventRuntime({
    stages: TWO_STAGES,
    listener: (event) => events.push(event),
    ...time,
    heartbeatIntervalMs: 5_000
  });
  runtime.startRun();
  runtime.startStage('projectDiscovery');
  runtime.activity('projectDiscovery', {
    activityKind: 'DISCOVER_PROJECT_MANIFESTS',
    subject: 'Discovering project manifests'
  });
  assert.equal([...time.timers.values()][0].unrefCalled, true);
  time.advance(4_999);
  assert.equal(events.some((event) => event.type === 'STAGE_HEARTBEAT'), false);
  runtime.activity('projectDiscovery', {
    activityKind: 'READ_PROJECT_MANIFEST',
    subject: 'Reading project manifests'
  });
  time.advance(4_999);
  assert.equal(events.some((event) => event.type === 'STAGE_HEARTBEAT'), false);
  time.advance(1);
  const heartbeat = events.find((event) => event.type === 'STAGE_HEARTBEAT');
  assert.equal(heartbeat.elapsedMs, 9_999);
  assert.equal(heartbeat.activityKind, 'READ_PROJECT_MANIFEST');
  runtime.completeStage('projectDiscovery');
  const terminalSequence = events.at(-1).sequence;
  time.advance(20_000);
  assert.equal(events.at(-1).sequence, terminalSequence);
  assert.equal(time.timers.size, 0);

  runtime.startStage('knowledgeResearch');
  time.advance(5_000);
  assert.equal(events.at(-1).stageId, 'knowledgeResearch');
  runtime.cancelStage('knowledgeResearch');
  runtime.cancelRun();
  time.advance(20_000);
  assert.equal(events.at(-1).type, 'RUN_CANCELLED');
  assert.equal(time.timers.size, 0);
});

test('plain, interactive, auto, narrow, and no-color render stable append-only output', () => {
  const event = Object.freeze({
    eventVersion: PROGRESS_EVENT_VERSION,
    sequence: 4,
    type: 'STAGE_HEARTBEAT',
    stageId: 'versionAnalysis',
    stageLabel: 'Version Analysis',
    activityKind: 'WAIT_FOR_ANALYSIS_RESPONSE',
    subject: 'Waiting for analysis response: package-name',
    completed: 2,
    total: 7,
    elapsedMs: 12_345,
    status: 'STARTED',
    reasonCode: null,
    timestamp: '2026-01-01T00:00:12.345Z'
  });
  const plain = capture({ isTTY: false });
  const plainReporter = createProgressReporter(plain.stream, { mode: 'auto' });
  plainReporter.handle(event);
  assert.equal(selectProgressMode(plain.stream, 'auto'), 'plain');
  assert.equal(
    plain.value(),
    '[12.3s] STAGE HEARTBEAT id=versionAnalysis detail="Waiting for analysis response: package-name (2/7)"\n'
  );
  assert.doesNotMatch(plain.value(), /\u001b|\r|%|\bETA\b/i);

  const interactive = capture({ isTTY: true });
  createProgressReporter(interactive.stream, { mode: 'auto' }).handle(event);
  assert.equal(selectProgressMode(interactive.stream, 'auto'), 'interactive');
  assert.equal(
    interactive.value(),
    '  … Version Analysis — Waiting for analysis response: package-name (2/7) [12.3s]\n'
  );

  const explicitPlain = capture({ isTTY: true });
  assert.equal(createProgressReporter(explicitPlain.stream, { mode: 'plain' }).mode, 'plain');
  const explicitInteractive = capture({ isTTY: false, columns: 50 });
  const reporter = createProgressReporter(explicitInteractive.stream, {
    mode: 'interactive',
    noColor: true
  });
  reporter.handle(event);
  assert.equal(reporter.mode, 'interactive');
  assert.match(explicitInteractive.value(), /^WAITING Version Analysis/);
  assert.ok(explicitInteractive.value().trimEnd().length <= 50);
  assert.doesNotMatch(explicitInteractive.value(), /\u001b|\r/);
});

test('progress listener and renderer failures do not change output or duplicate stage execution', async () => {
  const calls = [];
  const runners = Object.fromEntries(TWO_STAGES.map((stage) => [
    stage.id,
    async () => {
      calls.push(stage.id);
      return Object.freeze({ id: stage.id });
    }
  ]));
  const result = await runAnalysisPipeline({
    repositoryRoot: '/repository',
    runners,
    stages: TWO_STAGES,
    progressReporter: createProgressReporter(capture({ throws: true }).stream),
    progressListener(event) {
      assert.ok(Object.isFrozen(event));
      throw new Error('fixture callback failure');
    }
  });
  assert.deepEqual(calls, ['projectDiscovery', 'knowledgeResearch']);
  assert.deepEqual(Object.keys(result.artifacts), calls);
});

test('progress enabled and disabled produce identical business artifacts', async () => {
  const runners = Object.fromEntries(TWO_STAGES.map((stage) => [
    stage.id,
    async () => Object.freeze({ id: stage.id, value: 1 })
  ]));
  const disabled = await runAnalysisPipeline({
    repositoryRoot: '/repository',
    runners,
    stages: TWO_STAGES
  });
  const enabled = await runAnalysisPipeline({
    repositoryRoot: '/repository',
    runners,
    stages: TWO_STAGES,
    progressReporter: createProgressReporter(capture().stream)
  });
  assert.deepEqual(enabled.artifacts, disabled.artifacts);
});

test('pipeline cancellation emits one cancelled stage, skips remaining stages, and stops at exit boundary', async () => {
  const abortController = new AbortController();
  const events = [];
  let started = false;
  const runners = {
    projectDiscovery: async () => {
      started = true;
      return new Promise(() => {});
    },
    knowledgeResearch: async () => {
      assert.fail('A stage after cancellation must not start.');
    }
  };
  const promise = runAnalysisPipeline({
    repositoryRoot: '/repository',
    runners,
    stages: TWO_STAGES,
    signal: abortController.signal,
    progressListener: (event) => events.push(event)
  });
  while (!started) await Promise.resolve();
  abortController.abort(new Error('fixture interrupt'));
  await assert.rejects(promise, PipelineCancellationError);
  assert.equal(events.filter((event) => event.type === 'STAGE_CANCELLED').length, 1);
  assert.equal(events.find((event) => event.type === 'STAGE_CANCELLED').stageId, 'projectDiscovery');
  assert.equal(events.find((event) => event.type === 'STAGE_SKIPPED').stageId, 'knowledgeResearch');
  assert.equal(events.at(-1).type, 'RUN_CANCELLED');
  assert.equal(events.some((event) => event.type === 'RUN_COMPLETED'), false);
});

test('first CLI SIGINT performs controlled cancellation, removes its handler, and returns exit code 130', async () => {
  const signalHost = new EventEmitter();
  const stdout = capture();
  const stderr = capture();
  let started = false;
  const promise = executeAnalyze({
    root: '.',
    output: '.upgradelens/repository-impact.md',
    offline: true,
    progress: 'plain',
    experimentalMigrationChecklist: false
  }, {
    stdout: stdout.stream,
    stderr: stderr.stream,
    signalHost,
    analysisStageRunners: {
      projectDiscovery: async () => {
        started = true;
        return new Promise(() => {});
      }
    }
  });
  while (!started) await Promise.resolve();
  assert.equal(signalHost.listenerCount('SIGINT'), 1);
  signalHost.emit('SIGINT');
  assert.equal(await promise, 130);
  assert.equal(signalHost.listenerCount('SIGINT'), 0);
  assert.equal(stdout.value(), '');
  assert.match(stderr.value(), /STAGE CANCELLED id=projectDiscovery reason=USER_CANCELLED/);
  assert.match(stderr.value(), /RUN CANCELLED completed=0\/8 next=RERUN_WHEN_READY/);
  assert.doesNotMatch(stderr.value(), /RUN COMPLETE|Analysis status: COMPLETE|\bat\s+.*\.js:/);
});
