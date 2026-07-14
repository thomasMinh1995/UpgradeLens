import { Agent, fetch as undiciFetch } from 'undici';

const DEFAULT_AGENT_OPTIONS = Object.freeze({
  connections: 4,
  keepAliveTimeout: 1_000,
  keepAliveMaxTimeout: 1_000
});

export class CliHttpRuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliHttpRuntimeError';
  }
}

/**
 * Create the short-lived HTTP runtime owned by one online CLI research run.
 * It deliberately does not mutate Undici's process-wide global dispatcher.
 */
export function createCliHttpRuntime({
  createAgent = (options) => new Agent(options),
  fetchImplementation = undiciFetch,
  agentOptions = {}
} = {}) {
  if (typeof createAgent !== 'function' || typeof fetchImplementation !== 'function') {
    throw new CliHttpRuntimeError('Unable to create the CLI HTTP runtime.');
  }
  const dispatcher = createAgent({ ...DEFAULT_AGENT_OPTIONS, ...agentOptions });
  if (!dispatcher || typeof dispatcher.close !== 'function') {
    throw new CliHttpRuntimeError('Unable to create the CLI HTTP runtime.');
  }

  let closePromise = null;
  const close = async () => {
    if (!closePromise) closePromise = Promise.resolve().then(() => dispatcher.close());
    return closePromise;
  };
  const fetch = async (input, init = {}) => {
    if (closePromise) throw new CliHttpRuntimeError('The CLI HTTP runtime is closed.');
    return fetchImplementation(input, { ...init, dispatcher });
  };

  return Object.freeze({ fetch, close });
}
