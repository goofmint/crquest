import path from 'path';
import { pathToFileURL } from 'url';
import { createCodeRunnerWorker } from '../../../js/app/common/codeRunnerWorker';

// Runs the real public/code_runner/worker.js in a real Web Worker. Jest runs in
// an Electron renderer (@jest-runner/electron), so `Worker` exists and a
// file: URL can be loaded. If this suite fails because the worker cannot be
// loaded, the launcher/Tauri asset setup needs attention: do not work around it
// with Blob URLs here.
const WORKER_URL = pathToFileURL(
  path.resolve(__dirname, '..', '..', '..', '..', 'public', 'code_runner', 'worker.js')
).href;
const WAIT_MS = 5000;

function start(url = WORKER_URL) {
  const runner = createCodeRunnerWorker({ workerUrl: url });
  const logs = [];
  const waiters = [];
  runner.on('log', payload => {
    logs.push(payload);
    waiters.slice().forEach(check => check());
  });

  // Resolves with the logs once `predicate()` is true, re-checked on every log
  const waitFor = predicate =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timed out waiting, got ${JSON.stringify(logs)}`)),
        WAIT_MS
      );
      const check = () => {
        if (predicate()) {
          clearTimeout(timer);
          waiters.splice(waiters.indexOf(check), 1);
          resolve(logs);
        }
      };
      waiters.push(check);
      check();
    });
  const waitForLogs = count => waitFor(() => logs.length >= count);

  return { runner, logs, waitForLogs, waitFor };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('code runner with a real Worker', () => {
  let current;
  afterEach(() => {
    if (current) {
      current.runner.terminate();
      current = null;
    }
  });

  it('forwards the four console levels', async () => {
    current = start();
    current.runner.runCode(
      `console.log('l', 1); console.info('i'); console.warn('w'); console.error('e')`,
      {}
    );
    const logs = await current.waitForLogs(4);
    expect(logs).toEqual([
      { logLevel: 'log', arguments: ['l', 1] },
      { logLevel: 'info', arguments: ['i'] },
      { logLevel: 'warn', arguments: ['w'] },
      { logLevel: 'error', arguments: ['e'] },
    ]);
  });

  it('exposes env as process.env', async () => {
    current = start();
    current.runner.runCode(`console.log(process.env.TQ_X, typeof require)`, {
      TQ_X: 'value',
    });
    const logs = await current.waitForLogs(1);
    expect(logs[0].arguments).toEqual(['value', 'undefined']);
  });

  it('serializes functions, errors and circular objects for real structured clone', async () => {
    current = start();
    current.runner.runCode(
      `const o = { name: 'o', f() {} }; o.self = o; console.log(o, new Error('boom'), () => 1)`,
      {}
    );
    const [log] = await current.waitForLogs(1);
    expect(log.logLevel).toBe('log');
    expect(log.arguments[0]).toEqual({ name: 'o', f: '[Function: f]', self: '[Circular]' });
    expect(log.arguments[1].message).toBe('boom');
    expect(log.arguments[1].stack).toMatch(/at script\.js:1:/);
    expect(log.arguments[2]).toBe('[Function (anonymous)]');
  });

  it('reports a synchronous error with the legacy prefix, message and script.js stack', async () => {
    current = start();
    current.runner.runCode(`function f() { throw new Error('sync'); }\nf();`, {});
    const [log] = await current.waitForLogs(1);
    expect(log.logLevel).toBe('error');
    expect(log.arguments[0]).toBe('There was a problem executing your code:');
    expect(log.arguments[1].message).toBe('sync');
    expect(log.arguments[1].stack).toMatch(/at f \(script\.js:1:/);
    expect(log.arguments[1].stack).toMatch(/at script\.js:2:1$/);
    expect(log.arguments[1].stack).not.toMatch(/worker\.js/);
  });

  it('reports an uncaught error thrown from a timer', async () => {
    current = start();
    current.runner.runCode(`setTimeout(() => { throw new Error('later'); }, 10)`, {});
    const [log] = await current.waitForLogs(1);
    expect(log.logLevel).toBe('error');
    expect(log.arguments[0].message).toBe('later');
    expect(log.arguments[0].stack).toMatch(/script\.js/);
  });

  it('reports an unhandled promise rejection', async () => {
    current = start();
    current.runner.runCode(`Promise.reject(new Error('rejected'))`, {});
    const [log] = await current.waitForLogs(1);
    expect(log.logLevel).toBe('error');
    expect(log.arguments[0].message).toBe('rejected');
  });

  it('reports a non-Error rejection reason', async () => {
    current = start();
    current.runner.runCode(`Promise.reject('just text')`, {});
    const [log] = await current.waitForLogs(1);
    expect(log.arguments[0]).toEqual({ message: 'just text', stack: '' });
  });

  it('runs async code that logs after awaiting', async () => {
    current = start();
    current.runner.runCode(
      `(async () => { await new Promise(r => setTimeout(r, 10)); console.log('after await'); })()`,
      {}
    );
    const [log] = await current.waitForLogs(1);
    expect(log.arguments).toEqual(['after await']);
  });

  it('terminate() stops pending timers and reports "Terminated."', async () => {
    current = start();
    current.runner.runCode(
      `console.log('started'); setInterval(() => console.log('tick'), 5)`,
      {}
    );
    await current.waitForLogs(2);
    current.runner.terminate();
    const countAfterTerminate = current.logs.length;
    expect(current.logs[countAfterTerminate - 1]).toEqual({
      logLevel: 'log',
      arguments: ['Terminated.'],
    });
    // Bounded negative check (nothing is awaitable for "no more messages"); the
    // interval fired every 5ms, so 100ms would have shown several ticks.
    await sleep(100);
    expect(current.logs).toHaveLength(countAfterTerminate);
  });

  it('terminate() stops a synchronous infinite loop', async () => {
    current = start();
    current.runner.runCode(`console.log('spinning'); while (true) {}`, {});
    await current.waitForLogs(1);
    current.runner.terminate();
    expect(current.logs[current.logs.length - 1].arguments).toEqual(['Terminated.']);
  });

  it('a new run replaces the previous one and starts from a clean global state', async () => {
    current = start();
    current.runner.runCode(`globalThis.leak = 1; setInterval(() => console.log('old'), 5)`, {});
    await current.waitForLogs(1); // the old worker is demonstrably running
    current.runner.runCode(`console.log('new', typeof leak)`, {});
    const newIndex = () => current.logs.findIndex(l => l.arguments[0] === 'new');
    await current.waitFor(() => newIndex() !== -1);
    const index = newIndex();
    expect(current.logs[index]).toEqual({ logLevel: 'log', arguments: ['new', 'undefined'] });
    // Once the new worker has spoken the old one is already terminated; a
    // short bounded check that nothing else arrives (old ticks were every 5ms).
    const countAfterNew = current.logs.length;
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(current.logs).toHaveLength(countAfterNew);
    expect(current.logs.slice(index)).toEqual([current.logs[index]]);
  });

  it('reports a worker that cannot be loaded', async () => {
    current = start(pathToFileURL(path.resolve(__dirname, 'does-not-exist.js')).href);
    current.runner.runCode(`console.log('never')`, {});
    const [log] = await current.waitForLogs(1);
    expect(log.logLevel).toBe('error');
    expect(log.arguments[0].message).toMatch(/Code runner worker failed/);
  });
});
