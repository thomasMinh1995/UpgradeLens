export const MIGRATION_PROGRESS_EVENTS = Object.freeze([
  'stage:start',
  'stage:progress',
  'stage:complete',
  'stage:failed',
  'stage:cancelled',
  'migration:context-start',
  'migration:context-complete',
  'migration:abstained',
  'migration:trust-rejected',
  'migration:fallback',
  'migration:artifact-written'
]);

const EVENT_SET = new Set(MIGRATION_PROGRESS_EVENTS);
const MODES = new Set(['auto', 'interactive', 'plain']);

function elapsedSeconds(milliseconds) {
  return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`;
}

function selectedMode(stream, mode) {
  if (!MODES.has(mode)) throw new TypeError('Migration progress mode must be auto, interactive, or plain.');
  return mode === 'auto' ? (stream.isTTY ? 'interactive' : 'plain') : mode;
}

function plainLine(event) {
  if (event.type === 'stage:start') {
    return `[MIGRATION_CHECKLIST] START contexts=${event.total} qualification=${event.qualificationStatus} qualificationId=${event.qualificationId ?? 'none'} experimentalOverride=${event.experimentalOverrideUsed ? 'yes' : 'no'}`;
  }
  if (event.type === 'migration:context-start') {
    return `[MIGRATION_CHECKLIST] CONTEXT_START package=${event.packageName} processed=${event.processed}/${event.total}`;
  }
  if (['migration:context-complete', 'migration:abstained', 'migration:trust-rejected', 'migration:fallback'].includes(event.type)) {
    return `[MIGRATION_CHECKLIST] CONTEXT package=${event.packageName} status=${event.outcome} processed=${event.processed}/${event.total}${event.reasonCode ? ` reason=${event.reasonCode}` : ''}`;
  }
  if (event.type === 'migration:artifact-written') {
    return `[MIGRATION_CHECKLIST] ARTIFACT path=${event.artifactPath}`;
  }
  if (event.type === 'stage:complete') {
    return `[MIGRATION_CHECKLIST] COMPLETE generated=${event.generated} abstained=${event.abstained} rejected=${event.rejected} failed=${event.failed} qualification=${event.qualificationStatus} qualificationId=${event.qualificationId ?? 'none'} experimentalOverride=${event.experimentalOverrideUsed ? 'yes' : 'no'}`;
  }
  if (event.type === 'stage:failed') {
    return `[MIGRATION_CHECKLIST] FAILED reason=${event.reasonCode} qualification=${event.qualificationStatus} qualificationId=${event.qualificationId ?? 'none'} experimentalOverride=${event.experimentalOverrideUsed ? 'yes' : 'no'}`;
  }
  if (event.type === 'stage:cancelled') {
    return `[MIGRATION_CHECKLIST] CANCELLED reason=${event.reasonCode}`;
  }
  return null;
}

function interactiveLine(event, startedAt, now) {
  if (event.type === 'stage:start') {
    return `● Building migration checklist  ${elapsedSeconds(now - startedAt)}\n  0/${event.total} breaking findings processed\n  Provider qualification: ${event.qualificationStatus}\n  Qualification ID: ${event.qualificationId ?? 'none'}\n  Experimental override: ${event.experimentalOverrideUsed ? 'YES' : 'NO'}`;
  }
  if (['migration:context-complete', 'migration:abstained', 'migration:trust-rejected', 'migration:fallback'].includes(event.type)) {
    return `  ${event.processed}/${event.total} ${event.packageName}: ${event.outcome}`;
  }
  if (event.type === 'migration:artifact-written') return `  Checklist: ${event.artifactPath}`;
  if (event.type === 'stage:complete') {
    return `✓ Migration checklist completed  ${elapsedSeconds(now - startedAt)}\n  ${event.processed}/${event.total} breaking findings processed\n  ${event.generated} grounded actions; ${event.abstained} abstained; ${event.rejected + event.failed} fallbacks\n  Provider qualification: ${event.qualificationStatus}\n  Qualification ID: ${event.qualificationId ?? 'none'}\n  Experimental override: ${event.experimentalOverrideUsed ? 'YES' : 'NO'}`;
  }
  if (event.type === 'stage:failed') {
    return `✗ Migration checklist failed  ${elapsedSeconds(now - startedAt)}\n  Reason: ${event.reasonCode}\n  Provider qualification: ${event.qualificationStatus}\n  Qualification ID: ${event.qualificationId ?? 'none'}\n  Experimental override: ${event.experimentalOverrideUsed ? 'YES' : 'NO'}`;
  }
  if (event.type === 'stage:cancelled') {
    return `■ Migration checklist cancelled  ${elapsedSeconds(now - startedAt)}`;
  }
  return null;
}

/** Render stable line-oriented progress. Interactive mode intentionally uses no cursor control. */
export function createMigrationProgressReporter(stream, {
  mode = 'auto',
  clock = () => Date.now()
} = {}) {
  if (!stream || typeof stream.write !== 'function') {
    throw new TypeError('Migration progress reporter requires a writable stream.');
  }
  const activeMode = selectedMode(stream, mode);
  let startedAt = null;
  return Object.freeze({
    mode: activeMode,
    handle(event) {
      if (!event || !EVENT_SET.has(event.type)) {
        throw new TypeError('Unknown Migration Checklist progress event.');
      }
      const now = clock();
      if (event.type === 'stage:start') startedAt = now;
      const line = activeMode === 'plain'
        ? plainLine(event)
        : interactiveLine(event, startedAt ?? now, now);
      if (line) stream.write(`${line}\n`);
    }
  });
}
