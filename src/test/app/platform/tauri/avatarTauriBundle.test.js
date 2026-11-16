// Custom avatar creation in the Tauri build (W9, #140). The real Tauri build
// configuration (vite.config.mjs --mode tauri) bundles avatarRenderer.js with
// the platform/tauri assets module and jimp's browser bundle; the output is
// evaluated in a jsdom window without Node globals (no require, process,
// Buffer). Part images are requested as URLs, which a stand-in XMLHttpRequest
// serves from the real files of public/avatars/parts (the webview serves them
// from frontendDist). The resulting PNG data URI is compared pixel by pixel
// with what the Electron build's jimp (Node entry, file paths) composites.
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import Jimp from 'jimp';
import { pathToFileURL } from 'node:url';
import { generateDataURI } from '../../../../js/app/common/avatarRenderer';

const root = path.resolve(__dirname, '../../../../..');
const partsDir = path.join(root, 'public', 'avatars', 'parts');
const RESOURCE = '/opt/TerminalQuest';
const PAGE = 'tauri://localhost/index.html';

describe('avatar creation in the Tauri build (browser jimp)', () => {
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
            this.response = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
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
    return { window, requested };
  }

  test('the context has none of the Node globals the Node entry of jimp needs', () => {
    const { window } = createWindow();
    for (const name of ['require', 'process', 'Buffer', 'module', 'global']) {
      expect(window[name]).toBeUndefined();
    }
  });

  const bitmapOf = async uri => {
    const png = Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64');
    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    return Jimp.read(png);
  };

  const electronUri = options =>
    new Promise(resolve => {
      const base = document.createElement('base');
      base.href = pathToFileURL(`${path.join(root, 'public')}/index.html`).href;
      document.head.appendChild(base);
      generateDataURI(options, uri => {
        base.remove();
        resolve(uri);
      });
    });

  const cases = [
    { ec: 0, hs: 0, sc: 1, hc: 2 },
    { ec: 6, hs: 3, sc: 0, hc: 6 },
    { ec: 6, hs: 6, sc: 4, hc: 0 },
    { ec: 1, hs: 2, sc: 2, hc: 3 },
    { ec: 5, hs: 5, sc: 3, hc: 5 },
  ];

  test('jimp of this build rejects an image that is not served (HTTP 404); it does not hang', async () => {
    const { window } = createWindow();
    window.eval(code);
    await expect(
      window.avatarEntry.Jimp.read('tauri://localhost/avatars/parts/missing.png')
    ).rejects.toThrow(/HTTP Status 404/);
  }, 20000);

  test.each(cases)('composites %o to the same PNG as the Electron build', async options => {
    const { window, requested } = createWindow();
    window.eval(code);
    window.avatarEntry.setPlatformState({
      appDataPath: '/home/u/.config',
      resourceDirPath: RESOURCE,
      appVersion: '1.0.0',
      isDev: false,
      platform: 'linux',
    });
    const uri = await new Promise((resolve, reject) => {
      window.avatarEntry.generateDataURI(options, resolve);
      setTimeout(() => reject(new Error(`no data URI; requested ${JSON.stringify(requested)}`)), 20000);
    });
    expect(uri).toMatch(/^data:image\/png;base64,/);
    // URLs relative to the page, in the order of the Electron paths
    const names = ['body', 'face', 'onesie', options.ec === 6 ? 'glasses' : 'eyes'];
    if (options.hs !== 6) {
      names.push(`hair${options.hs}`);
      if ([2, 3, 4, 5].includes(options.hs)) names.push(`hair${options.hs}_overlay`);
    }
    expect(requested).toEqual(names.map(n => `tauri://localhost/avatars/parts/${n}.png`));

    const tauri = await bitmapOf(uri);
    const electron = await bitmapOf(await electronUri(options));
    expect(tauri.bitmap.width).toBe(electron.bitmap.width);
    expect(tauri.bitmap.height).toBe(electron.bitmap.height);
    expect(Buffer.compare(tauri.bitmap.data, electron.bitmap.data)).toBe(0);
    // not an empty image
    expect(tauri.bitmap.data.some(byte => byte !== 0)).toBe(true);
  }, 60000);
});
