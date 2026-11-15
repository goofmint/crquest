import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NodeWorker } from './nodeWorker';

const fixtureUrl = name =>
  pathToFileURL(path.resolve(__dirname, '..', 'fixtures', 'worker', name)).href;

// Resolves with the next message (or error event) the worker emits
const next = (worker, type = 'message') =>
  new Promise(resolve => worker.addEventListener(type, resolve));

describe('NodeWorker (the Web Worker stand-in used by the tests)', () => {
  let worker;
  afterEach(() => {
    if (worker) worker.terminate();
    worker = null;
  });

  test('delivers messages both ways with structured clone', async () => {
    worker = new NodeWorker(fixtureUrl('echo.js'));
    const reply = next(worker);
    const payload = { n: 1, nested: { list: [1, 2] }, when: new Date(0) };
    worker.postMessage(payload);
    const { data } = await reply;
    expect(data.echo).toEqual(payload);
    expect(data.echo).not.toBe(payload);
  });

  test('gives the script a worker-like global scope without require', async () => {
    worker = new NodeWorker(fixtureUrl('echo.js'));
    const reply = next(worker);
    worker.postMessage(1);
    const { data } = await reply;
    expect(data.hasSelf).toBe(true);
    expect(data.requireType).toBe('undefined');
  });

  test('forwards an uncaught error to the script listener', async () => {
    worker = new NodeWorker(fixtureUrl('throws-later.js'));
    const { data } = await next(worker);
    expect(data).toEqual({ caught: 'later' });
  });

  test('reports a script that cannot be loaded through the error event', async () => {
    worker = new NodeWorker(
      pathToFileURL(path.resolve(__dirname, 'does-not-exist.js')).href
    );
    const event = await next(worker, 'error');
    expect(event.message).toMatch(/ENOENT/);
  });

  test('reports a syntax error in the script through the error event', async () => {
    worker = new NodeWorker(fixtureUrl('syntax-error.js'));
    const event = await next(worker, 'error');
    expect(event.error).toBeInstanceOf(Error);
  });

  test('terminate() stops a script stuck in an infinite loop and silences it', async () => {
    worker = new NodeWorker(fixtureUrl('spin.js'));
    const first = await next(worker);
    expect(first.data).toBe('spinning');
    const events = [];
    worker.addEventListener('message', event => events.push(event));
    worker.terminate();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(events).toEqual([]);
  });

  test('rejects an unsupported event type', () => {
    worker = new NodeWorker(fixtureUrl('echo.js'));
    expect(() => worker.addEventListener('open', () => {})).toThrow(
      'NodeWorker does not support the "open" event'
    );
  });
});
