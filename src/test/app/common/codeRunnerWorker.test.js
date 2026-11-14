import { createCodeRunnerWorker } from '../../../js/app/common/codeRunnerWorker';

// Fake Worker recording what the host does with it
function createFakeWorkerFactory() {
  const workers = [];
  const factory = jest.fn(url => {
    const listeners = {};
    const worker = {
      url,
      postMessage: jest.fn(),
      terminate: jest.fn(),
      addEventListener: (type, handler) => {
        listeners[type] = handler;
      },
      emit: (type, event) => listeners[type](event),
    };
    workers.push(worker);
    return worker;
  });
  return { factory, workers };
}

function setup() {
  const { factory, workers } = createFakeWorkerFactory();
  const runner = createCodeRunnerWorker({
    workerUrl: 'file:///static/code_runner/worker.js',
    createWorker: factory,
  });
  const logs = [];
  runner.on('log', payload => logs.push(payload));
  return { runner, factory, workers, logs };
}

describe('createCodeRunnerWorker', () => {
  describe('construction', () => {
    it.each([undefined, '', 5])('requires a workerUrl (%p)', workerUrl => {
      expect(() => createCodeRunnerWorker({ workerUrl })).toThrow(
        'workerUrl is required'
      );
    });

    it('requires options', () => {
      expect(() => createCodeRunnerWorker()).toThrow('workerUrl is required');
    });

    it('does not create a worker until runCode is called', () => {
      const { factory } = setup();
      expect(factory).not.toHaveBeenCalled();
    });
  });

  describe('runCode', () => {
    it('creates a worker for the url and posts a single run message', () => {
      const { runner, factory, workers } = setup();
      const env = { TQ_A: '1', TQ_B: 'two' };

      runner.runCode('console.log(1)', env);

      expect(factory).toHaveBeenCalledTimes(1);
      expect(factory).toHaveBeenCalledWith('file:///static/code_runner/worker.js');
      expect(workers[0].postMessage).toHaveBeenCalledTimes(1);
      expect(workers[0].postMessage).toHaveBeenCalledWith({
        type: 'run',
        code: 'console.log(1)',
        env,
      });
    });

    it('accepts an empty env and empty code', () => {
      const { runner, workers } = setup();
      runner.runCode('', {});
      expect(workers[0].postMessage).toHaveBeenCalledWith({
        type: 'run',
        code: '',
        env: {},
      });
    });

    it.each([
      ['non-string code', [123, {}], 'code must be a string'],
      ['undefined code', [undefined, {}], 'code must be a string'],
      ['null env', ['x', null], 'env must be a plain object'],
      ['array env', ['x', []], 'env must be a plain object'],
      ['string env', ['x', 'A=1'], 'env must be a plain object'],
      ['undefined env', ['x', undefined], 'env must be a plain object'],
      ['class instance env', ['x', new Map()], 'env must be a plain object'],
      ['non-string env value', ['x', { A: 1 }], 'env.A must be a string'],
      ['undefined env value', ['x', { A: undefined }], 'env.A must be a string'],
    ])('throws a TypeError for %s without creating a worker', (_, args, message) => {
      const { runner, factory } = setup();
      expect(() => runner.runCode(...args)).toThrow(TypeError);
      expect(() => runner.runCode(...args)).toThrow(message);
      expect(factory).not.toHaveBeenCalled();
    });

    it('does not stop the running worker when the arguments are invalid', () => {
      const { runner, workers } = setup();
      runner.runCode('a', {});
      expect(() => runner.runCode(1, {})).toThrow(TypeError);
      expect(workers[0].terminate).not.toHaveBeenCalled();
    });

    it('propagates a synchronous worker creation failure unchanged', () => {
      const failure = new Error('cannot create');
      const runner = createCodeRunnerWorker({
        workerUrl: 'file:///w.js',
        createWorker: () => {
          throw failure;
        },
      });
      expect(() => runner.runCode('x', {})).toThrow(failure);
    });

    it('terminates the worker and rethrows when postMessage throws', () => {
      const { runner, workers, factory } = setup();
      factory.mockImplementationOnce(() => {
        const worker = {
          postMessage: () => {
            throw new Error('clone failed');
          },
          terminate: jest.fn(),
          addEventListener: jest.fn(),
        };
        workers.push(worker);
        return worker;
      });

      expect(() => runner.runCode('x', {})).toThrow('clone failed');
      expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    });

    it('stops the previous worker silently and discards its late messages', () => {
      const { runner, workers, logs } = setup();
      runner.runCode('first', {});
      runner.runCode('second', {});

      expect(workers).toHaveLength(2);
      expect(workers[0].terminate).toHaveBeenCalledTimes(1);
      expect(workers[1].terminate).not.toHaveBeenCalled();
      expect(logs).toEqual([]); // no "Terminated." on replacement

      workers[0].emit('message', {
        data: { type: 'log', logLevel: 'log', arguments: ['stale'] },
      });
      workers[0].emit('error', { message: 'stale error' });
      workers[0].emit('messageerror', {});
      expect(logs).toEqual([]);

      workers[1].emit('message', {
        data: { type: 'log', logLevel: 'log', arguments: ['fresh'] },
      });
      expect(logs).toEqual([{ logLevel: 'log', arguments: ['fresh'] }]);
    });
  });

  describe('messages from the worker', () => {
    it.each(['log', 'info', 'warn', 'error'])('re-emits %s as a log event', level => {
      const { runner, workers, logs } = setup();
      runner.runCode('x', {});
      workers[0].emit('message', {
        data: { type: 'log', logLevel: level, arguments: ['a', 1, { b: 2 }] },
      });
      expect(logs).toEqual([{ logLevel: level, arguments: ['a', 1, { b: 2 }] }]);
    });

    it.each([
      ['null data', null],
      ['a string', 'hi'],
      ['an unknown type', { type: 'done', logLevel: 'log', arguments: [] }],
      ['an unknown level', { type: 'log', logLevel: 'debug', arguments: [] }],
      ['non-array arguments', { type: 'log', logLevel: 'log', arguments: 'x' }],
    ])('reports %s as an error log instead of dropping it', (_, data) => {
      const { runner, workers, logs } = setup();
      runner.runCode('x', {});
      workers[0].emit('message', { data });
      expect(logs).toHaveLength(1);
      expect(logs[0].logLevel).toBe('error');
      expect(logs[0].arguments[0].message).toMatch(/unexpected message/);
    });

    it('reports an error event as an error log and stops that worker', () => {
      const { runner, workers, logs } = setup();
      runner.runCode('x', {});
      workers[0].emit('error', {
        message: 'Script error',
        filename: 'file:///w.js',
        lineno: 3,
        colno: 4,
      });

      expect(logs).toHaveLength(1);
      expect(logs[0].logLevel).toBe('error');
      expect(logs[0].arguments[0].message).toBe(
        'Code runner worker failed: Script error (file:///w.js:3:4)'
      );
      expect(workers[0].terminate).toHaveBeenCalledTimes(1);

      // Nothing more is delivered from the stopped worker
      workers[0].emit('message', {
        data: { type: 'log', logLevel: 'log', arguments: ['late'] },
      });
      expect(logs).toHaveLength(1);
    });

    it('reports an error event without details', () => {
      const { runner, workers, logs } = setup();
      runner.runCode('x', {});
      workers[0].emit('error', {});
      expect(logs[0].arguments[0].message).toBe(
        'Code runner worker failed: unknown error'
      );
    });

    it('reports messageerror as an error log and keeps the worker', () => {
      const { runner, workers, logs } = setup();
      runner.runCode('x', {});
      workers[0].emit('messageerror', {});
      expect(logs).toHaveLength(1);
      expect(logs[0].logLevel).toBe('error');
      expect(logs[0].arguments[0].message).toMatch(/deserialize/);
      expect(workers[0].terminate).not.toHaveBeenCalled();
    });
  });

  describe('terminate', () => {
    it('terminates the worker and emits "Terminated."', () => {
      const { runner, workers, logs } = setup();
      runner.runCode('x', {});
      runner.terminate();

      expect(workers[0].terminate).toHaveBeenCalledTimes(1);
      expect(logs).toEqual([{ logLevel: 'log', arguments: ['Terminated.'] }]);

      workers[0].emit('message', {
        data: { type: 'log', logLevel: 'log', arguments: ['late'] },
      });
      expect(logs).toHaveLength(1);
    });

    it('emits "Terminated." even when nothing is running, like the old runner', () => {
      const { runner, logs } = setup();
      runner.terminate();
      expect(logs).toEqual([{ logLevel: 'log', arguments: ['Terminated.'] }]);
    });

    it('does not terminate the same worker twice', () => {
      const { runner, workers } = setup();
      runner.runCode('x', {});
      runner.terminate();
      runner.terminate();
      expect(workers[0].terminate).toHaveBeenCalledTimes(1);
    });

    it('allows running again after terminate', () => {
      const { runner, workers, logs } = setup();
      runner.runCode('a', {});
      runner.terminate();
      runner.runCode('b', {});
      expect(workers).toHaveLength(2);
      workers[1].emit('message', {
        data: { type: 'log', logLevel: 'info', arguments: ['ok'] },
      });
      expect(logs[logs.length - 1]).toEqual({ logLevel: 'info', arguments: ['ok'] });
    });
  });

  describe('default worker factory', () => {
    const originalWorker = global.Worker;
    afterEach(() => {
      global.Worker = originalWorker;
    });

    it('uses the global Worker constructor with the url', () => {
      const instances = [];
      global.Worker = function(url) {
        instances.push(url);
        this.addEventListener = jest.fn();
        this.postMessage = jest.fn();
        this.terminate = jest.fn();
      };
      const runner = createCodeRunnerWorker({ workerUrl: 'file:///w.js' });
      runner.runCode('x', {});
      expect(instances).toEqual(['file:///w.js']);
    });

    it('throws explicitly when Worker is unavailable', () => {
      delete global.Worker;
      const runner = createCodeRunnerWorker({ workerUrl: 'file:///w.js' });
      expect(() => runner.runCode('x', {})).toThrow(
        'Web Workers are not available'
      );
    });
  });
});
