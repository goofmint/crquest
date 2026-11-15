// Classic worker script used by src/test/utils/nodeWorker.test.js: echoes every
// message back, together with what the worker global scope looks like.
self.addEventListener('message', event => {
  self.postMessage({
    echo: event.data,
    hasSelf: self === globalThis,
    requireType: typeof require,
  });
});
