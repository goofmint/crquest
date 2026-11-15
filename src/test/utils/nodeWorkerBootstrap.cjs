// Runs inside a worker_threads Worker (see nodeWorker.js). Gives the thread the
// parts of the Web Worker global scope that public/code_runner/worker.js uses
// (self, postMessage, addEventListener for message / error /
// unhandledrejection), then evaluates that classic script in the global scope,
// like `new Worker(url)` does in a browser.
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const { fileURLToPath } = require('node:url');

const SUPPORTED_EVENTS = ['message', 'error', 'unhandledrejection'];
const listeners = Object.fromEntries(SUPPORTED_EVENTS.map(type => [type, []]));

// A browser worker's console is its own devtools console, not the test output
['log', 'info', 'warn', 'error'].forEach(level => {
  console[level] = () => {};
});

globalThis.self = globalThis;
globalThis.postMessage = data => parentPort.postMessage(data);
globalThis.addEventListener = (type, listener) => {
  if (!SUPPORTED_EVENTS.includes(type)) {
    throw new Error(`nodeWorker does not support the "${type}" event`);
  }
  listeners[type].push(listener);
};

// Returns true when a listener called preventDefault()
function dispatch(type, event) {
  let prevented = false;
  const full = { ...event, preventDefault: () => { prevented = true; } };
  listeners[type].forEach(listener => listener(full));
  return prevented;
}

process.on('uncaughtException', error => {
  const prevented = dispatch('error', { error, message: error.message });
  if (!prevented) throw error;
});
process.on('unhandledRejection', reason => {
  const prevented = dispatch('unhandledrejection', { reason });
  if (!prevented) throw reason;
});

const source = fs.readFileSync(fileURLToPath(workerData.url), 'utf8');
(0, eval)(source);

parentPort.on('message', data => dispatch('message', { data }));
