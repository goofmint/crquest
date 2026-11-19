// Custom avatar creation in the Tauri build (W9, #140). The real Tauri build
// configuration (vite.config.mjs --mode tauri) bundles avatarRenderer.js with
// the platform/tauri assets module and the PNG codec; the output is
// evaluated in a jsdom window without Node globals (no require, process,
// Buffer). Part images are requested as URLs, which a stand-in XMLHttpRequest
// serves from the real files of public/avatars/parts (the webview serves them
// from frontendDist). The resulting PNG data URI is compared pixel by pixel
// with the PNGs that the Electron build's jimp (Node entry, file paths)
// composited before it was removed (#65), recorded in src/test/fixtures/avatar/.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { decode } from 'fast-png';

const root = path.resolve(__dirname, '../../../../..');
const recordedDir = path.join(root, 'src', 'test', 'fixtures', 'avatar');
const partsDir = path.join(root, 'public', 'avatars', 'parts');
const PAGE = 'tauri://localhost/index.html';

describe('avatar creation in the Tauri build', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  let code;

  beforeAll(async () => {
    const result = await build({
      configFile: path.join(root, 'vite.config.mjs'),
      mode: 'tauri',
      logLevel: 'silent',
      build: {
        write: false,
        rolldownOptions: {
          input: path.join(root, 'src/test/utils/avatarTauriEntry.js'),
          output: { format: 'iife', name: 'avatarTauriEntry' },
        },
      },
    });
    const outputs = Array.isArray(result) ? result.flatMap(r => r.output) : result.output;
    const chunks = outputs.filter(o => o.type === 'chunk');
    expect(chunks).toHaveLength(1);
    code = chunks[0].code;
  }, 120000);

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  // A jsdom window context: no Node globals. XMLHttpRequest serves GETs of
  // tauri://localhost/avatars/parts/* from the real files; every request is
  // recorded.
  function createWindow() {
    const requested = [];
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      url: PAGE,
      runScripts: 'outside-only',
    });
    const { window } = dom;
    class FakeXHR {
      constructor() {
        this.readyState = 0;
        this.status = 0;
        this.listeners = {};
      }
      addEventListener(type, listener) {
        this.listeners[type] = listener;
      }
      open(method, url) {
        this.method = method;
        this.url = url;
        this.readyState = 1;
      }
      setRequestHeader() {}
      getAllResponseHeaders() {
        return 'content-type: image/png\r\n';
      }
      getResponseHeader(name) {
        return name.toLowerCase() === 'content-type' ? 'image/png' : null;
      }
      abort() {}
      send() {
        requested.push(this.url);
        setTimeout(() => {
          const url = new URL(this.url);
          const file = path.join(partsDir, path.basename(decodeURIComponent(url.pathname)));
          const ok =
            url.protocol === 'tauri:' && url.host === 'localhost' &&
            path.dirname(decodeURIComponent(url.pathname)) === '/avatars/parts' &&
            fs.existsSync(file);
          this.readyState = 4;
          if (ok) {
            const bytes = fs.readFileSync(file);
            this.status = 200;
            this.response = window.Uint8Array.from(bytes).buffer;
            this.responseText = '';
          } else {
            this.status = 404;
            this.response = new window.ArrayBuffer(0);
          }
          this.listeners.load.call(this);
        }, 0);
      }
    }
    window.XMLHttpRequest = FakeXHR;
    window.eval(code);
    window.avatarEntry.setPlatformState({
      appDataPath: '/home/u/.config',
      resourceDirPath: '/opt/TerminalQuest',
      appVersion: '1.0.0',
      isDev: false,
      platform: 'linux',
    });
    return { window, requested };
  }

  test('the context has no Node globals', () => {
    const { window } = createWindow();
    for (const name of ['require', 'process', 'Buffer', 'module', 'global']) {
      expect(window[name]).toBeUndefined();
    }
  });

  const bitmapOf = uri => {
    const png = Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64');
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    return decode(png);
  };

  const cases = [
    { ec: 0, hs: 0, sc: 1, hc: 2 },
    { ec: 6, hs: 3, sc: 0, hc: 6 },
    { ec: 6, hs: 6, sc: 4, hc: 0 },
    { ec: 1, hs: 2, sc: 2, hc: 3 },
    { ec: 5, hs: 5, sc: 3, hc: 5 },
  ];

  test('rejects a missing part without generating a partial avatar (HTTP 404)', async () => {
    const { window } = createWindow();
    const callback = vi.fn();

    await expect(window.avatarEntry.generateDataURI({ ec: 0, hs: 99, sc: 1, hc: 2 }, callback))
      .rejects.toThrow(/hair99.*HTTP status 404/);
    expect(callback).not.toHaveBeenCalled();
  }, 20000);

  test.each(cases)('composites %o to the same PNG as the recorded Electron build', async options => {
    const { window, requested } = createWindow();
    const callback = vi.fn();
    const uri = await window.avatarEntry.generateDataURI(options, callback);
    expect(callback).toHaveBeenCalledExactlyOnceWith(uri);
    expect(uri).toMatch(/^data:image\/png;base64,/);
    // URLs relative to the page, in the order of the Electron paths
    const names = ['body', 'face', 'onesie', options.ec === 6 ? 'glasses' : 'eyes'];
    if (options.hs !== 6) {
      names.push(`hair${options.hs}`);
      if ([2, 3, 4, 5].includes(options.hs)) names.push(`hair${options.hs}_overlay`);
    }
    expect(requested).toEqual(names.map(n => `tauri://localhost/avatars/parts/${n}.png`));

    const tauri = bitmapOf(uri);
    const recorded = fs.readFileSync(
      path.join(recordedDir, `ec${options.ec}-hs${options.hs}-sc${options.sc}-hc${options.hc}.png`)
    );
    const electron = decode(recorded);
    expect(tauri.width).toBe(electron.width);
    expect(tauri.height).toBe(electron.height);
    expect(tauri.data).toEqual(electron.data);
    // not an empty image
    expect(tauri.data.some(byte => byte !== 0)).toBe(true);
  }, 60000);
});
