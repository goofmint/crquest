// Pins the compositing contract of generateDataURI (Electron): which part
// images are read (and with which input, in which order), the color
// parameters, the composite order, and the PNG output. The platform is the
// Electron one (the real staticFilePath on a file: page); jimp is a recording
// mock, so the test fixes the calls and not the pixels.
import { pathToFileURL } from 'node:url';

const calls = vi.hoisted(() => []);

vi.mock('jimp', () => {
  const makeImage = name => ({
    name,
    color: params => {
      calls.push(['color', name, params]);
      return undefined;
    },
    composite(other, x, y) {
      calls.push(['composite', name, other.name, x, y]);
      return this;
    },
    getBase64Async: async mime => {
      calls.push(['getBase64Async', name, mime]);
      return `data:${mime};base64,${name}`;
    },
  });
  return {
    default: {
      MIME_PNG: 'image/png',
      read: input => {
        calls.push(['read', input]);
        return Promise.resolve(makeImage(input.split('/').pop()));
      },
    },
  };
});

import {
  generateDataURI,
  NUM_FEATURES,
} from '../../../js/app/common/avatarRenderer';

const ROOT = '/opt/game/public';
const parts = name => `${ROOT}/avatars/parts/${name}`;
const mix = rgb => [{ apply: 'mix', params: [rgb, 100] }];

const render = options =>
  new Promise(resolve => generateDataURI(options, resolve));

beforeEach(() => {
  calls.length = 0;
  document.head.querySelectorAll('base').forEach(el => el.remove());
  const base = document.createElement('base');
  base.href = pathToFileURL(`${ROOT}/index.html`).href;
  document.head.appendChild(base);
});
afterEach(() =>
  document.head.querySelectorAll('base').forEach(el => el.remove())
);

const reads = () => calls.filter(c => c[0] === 'read').map(c => c[1]);
const colors = () =>
  calls.filter(c => c[0] === 'color').map(c => [c[1], c[2]]);
const composites = () =>
  calls.filter(c => c[0] === 'composite').map(c => c.slice(1));

describe('generateDataURI (Electron contract)', () => {
  test('feature counts', () => {
    expect(NUM_FEATURES).toEqual({ sc: 5, ec: 7, hc: 7, hs: 7 });
  });

  test('ec=0, hs=0: eyes and hair0 (no overlay)', async () => {
    const uri = await render({ ec: 0, hs: 0, sc: 1, hc: 2 });
    expect(reads()).toEqual([
      parts('body.png'),
      parts('face.png'),
      parts('onesie.png'),
      parts('eyes.png'),
      parts('hair0.png'),
    ]);
    expect(colors()).toEqual([
      ['body.png', mix({ r: 196, g: 145, b: 53 })],
      ['hair0.png', mix({ r: 173, g: 133, b: 86 })],
      ['eyes.png', mix({ r: 33, g: 33, b: 33 })],
    ]);
    expect(composites()).toEqual([
      ['body.png', 'face.png', 0, 0],
      ['body.png', 'onesie.png', 0, 0],
      ['body.png', 'eyes.png', 0, 0],
      ['body.png', 'hair0.png', 0, 0],
    ]);
    expect(calls.at(-1)).toEqual(['getBase64Async', 'body.png', 'image/png']);
    expect(uri).toBe('data:image/png;base64,body.png');
  });

  test('ec=6 (glasses), hs=3: glasses, hair3 and its overlay; glasses and overlay not colored', async () => {
    await render({ ec: 6, hs: 3, sc: 0, hc: 6 });
    expect(reads()).toEqual([
      parts('body.png'),
      parts('face.png'),
      parts('onesie.png'),
      parts('glasses.png'),
      parts('hair3.png'),
      parts('hair3_overlay.png'),
    ]);
    expect(colors()).toEqual([
      ['body.png', mix({ r: 123, g: 67, b: 2 })],
      ['hair3.png', mix({ r: 39, g: 17, b: 1 })],
    ]);
    expect(composites()).toEqual([
      ['body.png', 'face.png', 0, 0],
      ['body.png', 'onesie.png', 0, 0],
      ['body.png', 'glasses.png', 0, 0],
      ['body.png', 'hair3.png', 0, 0],
      ['body.png', 'hair3_overlay.png', 0, 0],
    ]);
  });

  test('ec=6 (glasses), hs=6 (no hair): only glasses are added', async () => {
    await render({ ec: 6, hs: 6, sc: 4, hc: 0 });
    expect(reads()).toEqual([
      parts('body.png'),
      parts('face.png'),
      parts('onesie.png'),
      parts('glasses.png'),
    ]);
    expect(colors()).toEqual([['body.png', mix({ r: 255, g: 228, b: 172 })]]);
    expect(composites()).toEqual([
      ['body.png', 'face.png', 0, 0],
      ['body.png', 'onesie.png', 0, 0],
      ['body.png', 'glasses.png', 0, 0],
    ]);
  });

  test('ec=1, hs=2: eyes, hair2 and overlay, colored in body, hair, eyes order', async () => {
    await render({ ec: 1, hs: 2, sc: 2, hc: 3 });
    expect(reads()).toEqual([
      parts('body.png'),
      parts('face.png'),
      parts('onesie.png'),
      parts('eyes.png'),
      parts('hair2.png'),
      parts('hair2_overlay.png'),
    ]);
    expect(colors()).toEqual([
      ['body.png', mix({ r: 230, g: 198, b: 131 })],
      ['hair2.png', mix({ r: 6, g: 2, b: 255 })],
      ['eyes.png', mix({ r: 5, g: 132, b: 255 })],
    ]);
    expect(composites().map(c => c[1])).toEqual([
      'face.png',
      'onesie.png',
      'eyes.png',
      'hair2.png',
      'hair2_overlay.png',
    ]);
  });

  test('read inputs are absolute disk paths, not URLs', async () => {
    await render({ ec: 0, hs: 1, sc: 0, hc: 0 });
    reads().forEach(input => {
      expect(input.startsWith('/')).toBe(true);
      expect(input).not.toMatch(/^file:/);
    });
  });
});
