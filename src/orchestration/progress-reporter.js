const MODES = new Set(['auto', 'interactive', 'plain']);

export function selectProgressMode(stream, mode) {
  if (!MODES.has(mode)) throw new TypeError('Progress mode must be auto, interactive, or plain.');
  return mode === 'auto' ? (stream.isTTY ? 'interactive' : 'plain') : mode;
}

function elapsed(milliseconds) {
  return `${(Math.max(0, milliseconds) / 1000).toFixed(1)}s`;
}

function activityText(event) {
  const base = event.subject ?? event.activityKind?.toLowerCase().replaceAll('_', ' ') ?? null;
  const count = event.completed === null ? '' : ` (${event.completed}/${event.total})`;
  return base ? `${base}${count}` : count.trim();
}

function boundedLine(line, width) {
  if (!Number.isSafeInteger(width) || width < 24 || line.length <= width) return line;
  return `${line.slice(0, Math.max(1, width - 1))}…`;
}

function plainLine(event) {
  const prefix = `[${elapsed(event.elapsedMs)}]`;
  const activity = activityText(event);
  switch (event.type) {
    case 'RUN_STARTED':
      return `${prefix} RUN START stages=${event.total}`;
    case 'STAGE_STARTED':
      return `${prefix} STAGE START id=${event.stageId} label="${event.stageLabel}"`;
    case 'STAGE_ACTIVITY':
      return `${prefix} STAGE ACTIVITY id=${event.stageId} kind=${event.activityKind}${activity ? ` detail="${activity}"` : ''}`;
    case 'STAGE_HEARTBEAT':
      return `${prefix} STAGE HEARTBEAT id=${event.stageId}${activity ? ` detail="${activity}"` : ''}`;
    case 'STAGE_COMPLETED':
      return `${prefix} STAGE COMPLETE id=${event.stageId} label="${event.stageLabel}"`;
    case 'STAGE_FAILED':
      return `${prefix} STAGE FAILED id=${event.stageId} reason=${event.reasonCode}`;
    case 'STAGE_SKIPPED':
      return null;
    case 'STAGE_CANCELLED':
      return `${prefix} STAGE CANCELLED id=${event.stageId} reason=${event.reasonCode}`;
    case 'RUN_COMPLETED':
      return `${prefix} RUN COMPLETE completed=${event.completed}/${event.total} failed=0 skipped=0`;
    case 'RUN_FAILED':
      return `${prefix} RUN FAILED completed=${event.completed}/${event.total} next=REVIEW_FAILURE_DETAILS`;
    case 'RUN_CANCELLED':
      return `${prefix} RUN CANCELLED completed=${event.completed}/${event.total} next=RERUN_WHEN_READY`;
    default:
      return null;
  }
}

function interactiveLine(event, noColor) {
  const activity = activityText(event);
  const marker = noColor
    ? {
        STAGE_STARTED: 'START',
        STAGE_ACTIVITY: 'WORKING',
        STAGE_HEARTBEAT: 'WAITING',
        STAGE_COMPLETED: 'DONE',
        STAGE_FAILED: 'FAILED',
        STAGE_CANCELLED: 'CANCELLED'
      }[event.type]
    : {
        STAGE_STARTED: '●',
        STAGE_ACTIVITY: '  ↳',
        STAGE_HEARTBEAT: '  …',
        STAGE_COMPLETED: '✓',
        STAGE_FAILED: '✗',
        STAGE_CANCELLED: '■'
      }[event.type];
  switch (event.type) {
    case 'RUN_STARTED':
      return `Running UpgradeLens Analysis (${event.total} stages)...`;
    case 'STAGE_STARTED':
      return `${marker} ${event.stageLabel} [${elapsed(event.elapsedMs)}]`;
    case 'STAGE_ACTIVITY':
      return `${marker} ${event.stageLabel} — ${activity} [${elapsed(event.elapsedMs)}]`;
    case 'STAGE_HEARTBEAT':
      return `${marker} ${event.stageLabel} — ${activity || 'Still running'} [${elapsed(event.elapsedMs)}]`;
    case 'STAGE_COMPLETED':
      return `${marker} ${event.stageLabel} completed [${elapsed(event.elapsedMs)}]`;
    case 'STAGE_FAILED':
      return `${marker} ${event.stageLabel} failed [${elapsed(event.elapsedMs)}] reason=${event.reasonCode}`;
    case 'STAGE_CANCELLED':
      return `${marker} ${event.stageLabel} cancelled [${elapsed(event.elapsedMs)}]`;
    case 'RUN_COMPLETED':
      return `Analysis completed: ${event.completed}/${event.total} stages completed.`;
    case 'RUN_FAILED':
      return `Analysis stopped: ${event.completed}/${event.total} stages completed. Review failure details below.`;
    case 'RUN_CANCELLED':
      return `Analysis cancelled: ${event.completed}/${event.total} stages completed.`;
    default:
      return null;
  }
}

/**
 * Append-only renderer: interactive output is TTY-aware but never hides the cursor or
 * rewrites previous lines, so success, failure, and cancellation need no terminal repair.
 */
export function createProgressReporter(stream, {
  mode = 'auto',
  noColor = false,
  width = stream?.columns
} = {}) {
  if (!stream || typeof stream.write !== 'function') {
    throw new TypeError('Progress reporter requires a writable stream.');
  }
  const activeMode = selectProgressMode(stream, mode);
  let writable = true;
  return Object.freeze({
    mode: activeMode,
    handle(event) {
      if (!writable) return;
      const line = activeMode === 'plain'
        ? plainLine(event)
        : interactiveLine(event, noColor);
      if (!line) return;
      try {
        stream.write(`${boundedLine(line, width)}\n`);
      } catch {
        // Artifact and pipeline semantics remain authoritative if presentation fails.
        writable = false;
      }
    }
  });
}
