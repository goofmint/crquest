// Worker start-up from the Tauri origin (W11, #142). `new Worker(url)` itself
// needs a webview (not testable here); this pins what it is given: a
// same-origin, page-relative URL of a classic script that frontendDist embeds
// (the embedding is checked by `cargo test`, src-tauri/src/lib.rs).
import fs from 'node:fs';
import path from 'node:path';
import { getStaticFileUrl } from '../../../../js/app/platform/tauri/assets';
import { WORKER_RELATIVE_PATH } from '../../../../js/app/common/codeRunnerWorker';

vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: vi.fn() }));
vi.mock('../../../../js/app/platform/tauri/paths', () => ({
  getResourceDirPath: () => '/res',
}));

const root = path.resolve(__dirname, '../../../../..');

function withBase(href) {
  const base = document.createElement('base');
  base.href = href;
  document.head.appendChild(base);
  return () => base.remove();
}

describe('the worker URL', () => {
  test.each([
    ['tauri://localhost/', 'tauri://localhost/code_runner/worker.js'],
    ['http://tauri.localhost/', 'http://tauri.localhost/code_runner/worker.js'],
    ['http://tauri.localhost/index.html', 'http://tauri.localhost/code_runner/worker.js'],
  ])('with the page at %s it is %s (same origin as the page)', (base, expected) => {
    const restore = withBase(base);
    try {
      const url = getStaticFileUrl(WORKER_RELATIVE_PATH);
      expect(url).toBe(expected);
      expect(new URL(url).origin).toBe(new URL(document.baseURI).origin);
    } finally {
      restore();
    }
  });

  test('worker.js is a classic script that needs no import, export or importScripts', () => {
    const source = fs.readFileSync(path.join(root, 'public', WORKER_RELATIVE_PATH), 'utf8');
    expect(source).not.toMatch(/^\s*(import|export)\s/m);
    expect(source).not.toMatch(/importScripts\s*\(/);
  });
});
