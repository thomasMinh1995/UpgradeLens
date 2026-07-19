import { performance } from 'node:perf_hooks';

export const PROGRESS_EVENT_VERSION = '1.0.0';

export const PROGRESS_EVENT_TYPES = Object.freeze([
  'RUN_STARTED',
  'STAGE_SCHEDULED',
  'STAGE_STARTED',
  'STAGE_ACTIVITY',
  'STAGE_HEARTBEAT',
  'STAGE_COMPLETED',
  'STAGE_FAILED',
  'STAGE_SKIPPED',
  'STAGE_CANCELLED',
  'RUN_COMPLETED',
  'RUN_FAILED',
  'RUN_CANCELLED'
]);

export const PROGRESS_STAGE_STATUSES = Object.freeze([
  'SCHEDULED',
  'STARTED',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
  'CANCELLED'
]);

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
export const MAX_PROGRESS_SUBJECT_LENGTH = 120;

const EVENT_TYPE_SET = new Set(PROGRESS_EVENT_TYPES);
const TERMINAL_STATUSES = new Set(['COMPLETED', 'FAILED', 'SKIPPED', 'CANCELLED']);
const REASON_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;
const ACTIVITY_KIND_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

function defaultScheduler() {
  return Object.freeze({
    setTimeout(callback, delay) {
      return setTimeout(callback, delay);
    },
    clearTimeout(timer) {
      clearTimeout(timer);
    }
  });
}

function cloneAndFreeze(value) {
  return Object.freeze(structuredClone(value));
}

export function sanitizeProgressSubject(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/["\\]/g, "'")
    .replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/\b(authorization|api[_-]?key|access[_-]?token|secret)\s*[:=]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/\bhttps?:\/\/[^\s/]+(?:\/[^\s?#]*)?[?#]\S*/gi, '[REDACTED_URL]')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, MAX_PROGRESS_SUBJECT_LENGTH);
}

function constrainedCode(value, pattern, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new TypeError(`${field} must be a constrained uppercase code.`);
  }
  return value;
}

function normalizeCount(completed, total) {
  if ((completed === undefined || completed === null) !== (total === undefined || total === null)) {
    throw new TypeError('Progress completed and total must be supplied together.');
  }
  if (completed === undefined || completed === null) return { completed: null, total: null };
  if (!Number.isSafeInteger(completed) || !Number.isSafeInteger(total)
      || completed < 0 || total < 0 || completed > total) {
    throw new TypeError('Progress counts must be non-negative integers with completed <= total.');
  }
  return { completed, total };
}

function safeNotify(listener, event) {
  if (!listener) return;
  try {
    const result = typeof listener === 'function' ? listener(event) : listener.handle?.(event);
    result?.catch?.(() => {});
  } catch {
    // Progress is presentation-only and must not affect pipeline semantics.
  }
}

function validateStages(stages) {
  const ids = new Set();
  for (const stage of stages) {
    if (!stage || typeof stage.id !== 'string' || typeof stage.label !== 'string'
        || stage.id.length === 0 || stage.label.length === 0 || ids.has(stage.id)) {
      throw new TypeError('Progress stages require unique non-empty ids and labels.');
    }
    ids.add(stage.id);
  }
}

/**
 * Owns normalized lifecycle state and heartbeat timing for the sequential pipeline.
 * Stage adapters may only contribute bounded activity metadata.
 */
export function createProgressEventRuntime({
  stages,
  listener,
  monotonicClock = () => performance.now(),
  wallClock = () => new Date(),
  scheduler = defaultScheduler(),
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS
}) {
  validateStages(stages);
  if (!Number.isSafeInteger(heartbeatIntervalMs) || heartbeatIntervalMs <= 0) {
    throw new TypeError('heartbeatIntervalMs must be a positive integer.');
  }
  if (typeof monotonicClock !== 'function' || typeof wallClock !== 'function'
      || typeof scheduler?.setTimeout !== 'function' || typeof scheduler?.clearTimeout !== 'function') {
    throw new TypeError('Progress runtime requires clock and scheduler functions.');
  }

  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const stateById = new Map(stages.map((stage) => [stage.id, {
    status: null,
    startedAt: null,
    activityKind: null,
    subject: null,
    completed: null,
    total: null
  }]));
  let sequence = 0;
  let runStartedAt = null;
  let runTerminal = false;
  let activeStageId = null;
  let heartbeatTimer = null;
  let heartbeatToken = 0;

  function timestamp() {
    const value = wallClock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new TypeError('Progress wall clock returned an invalid date.');
    return date.toISOString();
  }

  function elapsedSince(startedAt) {
    if (startedAt === null) return 0;
    return Math.max(0, Math.round(monotonicClock() - startedAt));
  }

  function emit(type, {
    stage = null,
    state = null,
    status = null,
    reasonCode = null,
    completed,
    total
  } = {}) {
    if (!EVENT_TYPE_SET.has(type)) throw new TypeError(`Unknown progress event type ${type}.`);
    const counts = normalizeCount(
      completed === undefined ? state?.completed : completed,
      total === undefined ? state?.total : total
    );
    const event = cloneAndFreeze({
      eventVersion: PROGRESS_EVENT_VERSION,
      sequence: ++sequence,
      type,
      stageId: stage?.id ?? null,
      stageLabel: stage?.label ?? null,
      activityKind: state?.activityKind ?? null,
      subject: state?.subject ?? null,
      completed: counts.completed,
      total: counts.total,
      elapsedMs: elapsedSince(stage ? state?.startedAt : runStartedAt),
      status,
      reasonCode: constrainedCode(reasonCode, REASON_CODE_PATTERN, 'reasonCode'),
      timestamp: timestamp()
    });
    safeNotify(listener, event);
    return event;
  }

  function clearHeartbeat() {
    heartbeatToken += 1;
    if (heartbeatTimer !== null) {
      scheduler.clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function scheduleHeartbeat(stageId) {
    clearHeartbeat();
    const token = heartbeatToken;
    heartbeatTimer = scheduler.setTimeout(() => {
      heartbeatTimer = null;
      if (token !== heartbeatToken || activeStageId !== stageId || runTerminal) return;
      const stage = stageById.get(stageId);
      const state = stateById.get(stageId);
      if (state.status !== 'STARTED') return;
      emit('STAGE_HEARTBEAT', { stage, state, status: 'STARTED' });
      scheduleHeartbeat(stageId);
    }, heartbeatIntervalMs);
    heartbeatTimer?.unref?.();
  }

  function requireStage(stageId) {
    const stage = stageById.get(stageId);
    if (!stage) throw new TypeError(`Unknown progress stage ${stageId}.`);
    return { stage, state: stateById.get(stageId) };
  }

  function requireActive(stageId) {
    const pair = requireStage(stageId);
    if (activeStageId !== stageId || pair.state.status !== 'STARTED') {
      throw new Error(`Progress stage ${stageId} is not active.`);
    }
    return pair;
  }

  function terminal(stageId, status, type, reasonCode = null) {
    const { stage, state } = requireActive(stageId);
    if (TERMINAL_STATUSES.has(state.status)) {
      throw new Error(`Progress stage ${stageId} already has a terminal event.`);
    }
    clearHeartbeat();
    state.status = status;
    activeStageId = null;
    return emit(type, { stage, state, status, reasonCode });
  }

  return Object.freeze({
    startRun() {
      if (runStartedAt !== null) throw new Error('Progress run has already started.');
      runStartedAt = monotonicClock();
      emit('RUN_STARTED', { status: 'STARTED', completed: 0, total: stages.length });
      for (const stage of stages) {
        const state = stateById.get(stage.id);
        state.status = 'SCHEDULED';
        emit('STAGE_SCHEDULED', {
          stage,
          state,
          status: 'SCHEDULED',
          completed: null,
          total: null
        });
      }
    },
    startStage(stageId) {
      if (runStartedAt === null || runTerminal) throw new Error('Progress run is not active.');
      if (activeStageId !== null) throw new Error(`Progress stage ${activeStageId} is already active.`);
      const { stage, state } = requireStage(stageId);
      if (state.status !== 'SCHEDULED') throw new Error(`Progress stage ${stageId} is not scheduled.`);
      state.status = 'STARTED';
      state.startedAt = monotonicClock();
      activeStageId = stageId;
      const event = emit('STAGE_STARTED', { stage, state, status: 'STARTED' });
      scheduleHeartbeat(stageId);
      return event;
    },
    activity(stageId, {
      activityKind,
      subject = null,
      completed,
      total
    }) {
      const { stage, state } = requireActive(stageId);
      const normalizedKind = constrainedCode(activityKind, ACTIVITY_KIND_PATTERN, 'activityKind');
      if (normalizedKind === null) throw new TypeError('activityKind is required.');
      const normalizedSubject = sanitizeProgressSubject(subject);
      const counts = normalizeCount(completed, total);
      state.activityKind = normalizedKind;
      state.subject = normalizedSubject;
      state.completed = counts.completed;
      state.total = counts.total;
      const event = emit('STAGE_ACTIVITY', { stage, state, status: 'STARTED' });
      scheduleHeartbeat(stageId);
      return event;
    },
    completeStage(stageId) {
      return terminal(stageId, 'COMPLETED', 'STAGE_COMPLETED');
    },
    failStage(stageId, reasonCode = 'STAGE_FAILED') {
      return terminal(stageId, 'FAILED', 'STAGE_FAILED', reasonCode);
    },
    cancelStage(stageId, reasonCode = 'USER_CANCELLED') {
      return terminal(stageId, 'CANCELLED', 'STAGE_CANCELLED', reasonCode);
    },
    skipStage(stageId, reasonCode) {
      const { stage, state } = requireStage(stageId);
      if (state.status !== 'SCHEDULED') throw new Error(`Progress stage ${stageId} is not scheduled.`);
      state.status = 'SKIPPED';
      return emit('STAGE_SKIPPED', { stage, state, status: 'SKIPPED', reasonCode });
    },
    completeRun() {
      if (activeStageId !== null || runTerminal) throw new Error('Progress run cannot complete.');
      runTerminal = true;
      clearHeartbeat();
      return emit('RUN_COMPLETED', {
        status: 'COMPLETED',
        completed: stages.length,
        total: stages.length
      });
    },
    failRun() {
      if (activeStageId !== null || runTerminal) throw new Error('Progress run cannot fail.');
      runTerminal = true;
      clearHeartbeat();
      const completed = [...stateById.values()].filter((state) => state.status === 'COMPLETED').length;
      return emit('RUN_FAILED', { status: 'FAILED', completed, total: stages.length });
    },
    cancelRun() {
      if (activeStageId !== null || runTerminal) throw new Error('Progress run cannot cancel.');
      runTerminal = true;
      clearHeartbeat();
      const completed = [...stateById.values()].filter((state) => state.status === 'COMPLETED').length;
      return emit('RUN_CANCELLED', { status: 'CANCELLED', completed, total: stages.length });
    },
    snapshot() {
      return cloneAndFreeze({
        activeStageId,
        runTerminal,
        stages: stages.map((stage) => ({
          id: stage.id,
          status: stateById.get(stage.id).status
        }))
      });
    },
    dispose() {
      clearHeartbeat();
    }
  });
}
