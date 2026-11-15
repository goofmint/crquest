// Announces itself, then blocks forever (only terminate() can stop it).
self.postMessage('spinning');
while (true) {}
