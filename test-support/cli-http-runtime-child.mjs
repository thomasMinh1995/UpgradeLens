import { createServer } from 'node:http';
import { once } from 'node:events';
import * as fs from 'node:fs/promises';

import { runCli } from '../src/cli.js';
import { createCliHttpRuntime } from '../src/http/cli-http-runtime.js';

const root = process.argv[2];
const mode = process.argv[3];
const npmFixture = JSON.parse(await fs.readFile(new URL('../test/fixtures/npm/react-packument.json', import.meta.url), 'utf8'));
const reactBody = JSON.stringify(npmFixture);
const viteBody = JSON.stringify({ ...npmFixture, name: 'vite' });
const pypiBody = await fs.readFile(new URL('../test/fixtures/pypi/fastapi-project.json', import.meta.url), 'utf8');
let requestCount = 0;
const server = createServer((request, response) => {
  requestCount += 1;
  if (mode === 'statuses') {
    const status = request.url.includes('/react') ? 404 : request.url.includes('/vite') ? 429 : 503;
    response.writeHead(status, { 'content-type': 'application/json', connection: 'keep-alive' });
    response.end('{"ignored":true}');
    return;
  }
  if (mode === 'oversized') {
    const limit = request.url.startsWith('/npm/') ? 16 * 1024 * 1024 : 8 * 1024 * 1024;
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': String(limit + 1),
      connection: 'keep-alive'
    });
    response.end('{}');
    return;
  }
  const body = request.url === '/npm/vite' ? viteBody : request.url.startsWith('/npm/') ? reactBody : pypiBody;
  response.writeHead(200, {
    'content-type': 'application/json',
    'content-length': String(Buffer.byteLength(body)),
    connection: 'keep-alive'
  });
  response.end(body);
});
server.keepAliveTimeout = 60_000;
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const runtime = createCliHttpRuntime();
const code = await runCli(['research', root], {
  createHttpRuntime: () => ({
    fetch(url, options) {
      const requestUrl = new URL(url);
      const target = requestUrl.hostname === 'registry.npmjs.org'
        ? `${baseUrl}/npm${requestUrl.pathname}`
        : `${baseUrl}${requestUrl.pathname}`;
      return runtime.fetch(target, options);
    },
    close: () => runtime.close()
  })
});
await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
process.stderr.write(`CHILD_COMPLETE ${code} REQUESTS ${requestCount}\n`);
process.exitCode = code;
