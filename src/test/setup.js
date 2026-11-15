import os from 'node:os';
import path from 'node:path';
import jetpack from 'fs-jetpack';
import '@testing-library/jest-dom/vitest';

// The tests used to run inside a real Electron renderer, where `electron`
// (remote.app) and `electron-is-dev` work. Under Node they cannot (`require
// ('electron')` is only the path of the binary), so modules that read them at
// import time (platform/paths -> config.js) get these stand-ins. Test files
// that need specific values override them with their own vi.mock / vi.doMock.
vi.mock('electron', () => ({
  remote: {
    app: {
      getPath: name => path.join(os.tmpdir(), 'terminalquest-test', name),
      getVersion: () => '0.0.0-test',
    },
  },
}));
vi.mock('electron-is-dev', () => ({ default: true }));

// jsdom has no canvas implementation and reports every getContext() call as
// "not implemented"; Phaser only feature-detects it while being evaluated below.
HTMLCanvasElement.prototype.getContext = () => null;

// Bootstrap browser window environment, as we do in our HTML wrapper
[
  path.resolve(
    __dirname, '..', '..', 'public', 'lib', 'phaser-2.13.2.min.js'
  ),
  path.resolve(
    __dirname, '..', '..', 'public', 'lib', 'firebase', 'firebase-app.js'
  ),
  path.resolve(
    __dirname, '..', '..', 'public', 'lib', 'firebase', 'firebase-firestore.js'
  ),
].forEach(path => {
  const code = jetpack.read(path);
  window.eval(code);
});
