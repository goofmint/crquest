import path from 'node:path';
import jetpack from 'fs-jetpack';
import '@testing-library/jest-dom/vitest';

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
