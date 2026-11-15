// Throws from a timer; the script's own error listener reports and swallows it.
self.addEventListener('error', event => {
  self.postMessage({ caught: event.error.message });
  event.preventDefault();
});
setTimeout(() => {
  throw new Error('later');
}, 10);
