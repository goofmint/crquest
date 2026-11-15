import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker as ThreadWorker } from 'node:worker_threads';

// A minimal Web Worker (`new Worker(url)`) for tests that run in Node/jsdom,
// which have no Worker. It is backed by a real worker_threads thread, so
// structured cloning, isolation of the global scope, terminate() of a
// synchronous infinite loop and load failures behave like a real worker.
// Supported: postMessage, terminate, addEventListener('message' | 'messageerror' | 'error').
const BOOTSTRAP = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'nodeWorkerBootstrap.cjs'
);

export function NodeWorker(url) {
  const listeners = { message: [], messageerror: [], error: [] };
  let terminated = false;
  const thread = new ThreadWorker(BOOTSTRAP, { workerData: { url } });

  const emit = (type, event) => {
    if (terminated) return;
    listeners[type].slice().forEach(listener => listener(event));
  };
  thread.on('message', data => emit('message', { data }));
  thread.on('messageerror', error => emit('messageerror', { error }));
  thread.on('error', error =>
    emit('error', {
      error,
      message: error.message,
      filename: '',
      lineno: 0,
      colno: 0,
    })
  );

  this.postMessage = data => thread.postMessage(data);
  this.addEventListener = (type, listener) => {
    if (!listeners[type]) {
      throw new Error(`NodeWorker does not support the "${type}" event`);
    }
    listeners[type].push(listener);
  };
  this.terminate = () => {
    terminated = true;
    thread.terminate();
  };
}
