import { performance } from 'node:perf_hooks';

export const DEFAULT_COOPERATIVE_BATCH_SIZE = 64;
export const DEFAULT_COOPERATIVE_MAX_INTERVAL_MS = 50;

function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

function cancellationError(signal) {
  const error = new Error('Repository scan was cancelled.', { cause: signal?.reason });
  error.name = 'AbortError';
  error.code = 'ANALYSIS_CANCELLED';
  return error;
}

function requireMonotonicTime(clock) {
  const value = clock();
  if (!Number.isFinite(value)) {
    throw new TypeError('Cooperative scheduler monotonic clock must return a finite number.');
  }
  return value;
}

/**
 * Creates operation-local cooperative scheduling state for sequential scanners.
 * A boundary represents one fully completed unit; it never exposes partial work.
 */
export function createCooperativeScheduler({
  signal,
  enabled = true,
  batchSize = DEFAULT_COOPERATIVE_BATCH_SIZE,
  maxIntervalMs = DEFAULT_COOPERATIVE_MAX_INTERVAL_MS,
  monotonicClock = () => performance.now(),
  yieldImplementation = yieldToEventLoop
} = {}) {
  if (typeof enabled !== 'boolean') throw new TypeError('Cooperative scheduler enabled must be boolean.');
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new TypeError('Cooperative scheduler batchSize must be a positive integer.');
  }
  if (!Number.isFinite(maxIntervalMs) || maxIntervalMs <= 0) {
    throw new TypeError('Cooperative scheduler maxIntervalMs must be positive.');
  }
  if (typeof monotonicClock !== 'function' || typeof yieldImplementation !== 'function') {
    throw new TypeError('Cooperative scheduler requires clock and yield functions.');
  }

  let completedUnits = 0;
  let unitsSinceYield = 0;
  let yieldCount = 0;
  let lastYieldAt = requireMonotonicTime(monotonicClock);

  function throwIfAborted() {
    if (signal?.aborted) throw cancellationError(signal);
  }

  return Object.freeze({
    checkpoint: throwIfAborted,
    async boundary() {
      throwIfAborted();
      completedUnits += 1;
      unitsSinceYield += 1;
      if (!enabled) return false;

      const now = requireMonotonicTime(monotonicClock);
      if (unitsSinceYield < batchSize && now - lastYieldAt < maxIntervalMs) return false;

      await yieldImplementation();
      yieldCount += 1;
      unitsSinceYield = 0;
      lastYieldAt = requireMonotonicTime(monotonicClock);
      throwIfAborted();
      return true;
    },
    snapshot() {
      return Object.freeze({ completedUnits, yieldCount, unitsSinceYield });
    }
  });
}
