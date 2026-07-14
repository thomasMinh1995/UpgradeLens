import * as fs from 'node:fs/promises';

import { runCli } from '../src/cli.js';

const root = process.argv[2];
const oversized = process.argv[3] === 'oversized';
const fixture = JSON.parse(await fs.readFile(new URL('../test/fixtures/npm/react-packument.json', import.meta.url), 'utf8'));
if (oversized) fixture._testPadding = 'x'.repeat((16 * 1024 * 1024) + 1);
const body = JSON.stringify(fixture);
const code = await runCli(['research', root], {
  fetch: async () => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })
});
process.stderr.write(`CHILD_COMPLETE ${code}\n`);
process.exitCode = code;
