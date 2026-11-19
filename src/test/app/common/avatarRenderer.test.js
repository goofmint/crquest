import { decode, encode } from 'fast-png';
import {
  generateDataURI,
  NUM_FEATURES,
} from '../../../js/app/common/avatarRenderer';

const options = { ec: 6, hs: 6, sc: 1, hc: 0 };

function serveParts(parts) {
  vi.stubGlobal('XMLHttpRequest', class {
    listeners = {};
    open(_method, url) {
      this.name = new URL(url).pathname.split('/').at(-1);
    }
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    }
    send() {
      const part = parts[this.name];
      this.status = part ? 200 : 404;
      this.response = part?.slice().buffer;
      this.listeners.load();
    }
  });
}

function rgba(width = 1, alpha = 0) {
  const data = new Uint8Array(width * 4);
  for (let offset = 3; offset < data.length; offset += 4) data[offset] = alpha;
  return encode({ width, height: 1, data, channels: 4 });
}

function avatarParts() {
  return {
    'body.png': rgba(1, 255),
    'face.png': rgba(),
    'onesie.png': rgba(),
    'glasses.png': rgba(),
  };
}

beforeEach(() => {
  const base = document.createElement('base');
  base.href = 'file:///opt/game/public/index.html';
  document.head.appendChild(base);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.head.querySelector('base').remove();
});

test('preserves the avatar feature counts', () => {
  expect(NUM_FEATURES).toEqual({ sc: 5, ec: 7, hc: 7, hs: 7 });
});

test('delivers a PNG data URI through the existing callback', async () => {
  serveParts(avatarParts());
  const callback = vi.fn();

  const uri = await generateDataURI(options, callback);

  expect(callback).toHaveBeenCalledExactlyOnceWith(uri);
  expect(uri).toMatch(/^data:image\/png;base64,/);
  const image = decode(Buffer.from(uri.split(',')[1], 'base64'));
  expect(image.data).toEqual(Uint8Array.of(196, 145, 53, 255));
});

test('rejects mismatched part dimensions without delivering a partial avatar', async () => {
  serveParts({ ...avatarParts(), 'face.png': rgba(2) });
  const callback = vi.fn();

  await expect(generateDataURI(options, callback)).rejects.toThrow('identical dimensions');
  expect(callback).not.toHaveBeenCalled();
});
