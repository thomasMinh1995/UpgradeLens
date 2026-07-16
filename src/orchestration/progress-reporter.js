export function createProgressReporter(stream) {
  if (!stream || typeof stream.write !== 'function') {
    throw new Error('Progress reporter requires a writable stream.');
  }
  return Object.freeze({
    start() {
      stream.write('Running UpgradeLens Analysis...\n\n');
    },
    success(stage) {
      stream.write(`✓ ${stage.label}\n`);
    },
    failure(stage) {
      stream.write(`✗ ${stage.label}\n`);
    },
    complete() {
      stream.write('\nAnalysis completed.\n\n');
    }
  });
}
