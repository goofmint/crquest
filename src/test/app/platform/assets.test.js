import path from 'path';
import fileUrl from 'file-url';
import { pathToFileURL } from 'url';
import {
  getStaticRootPath,
  getStaticFileUrl,
  toAssetSrc,
  toAssetUrl,
} from '../../../js/app/platform/assets';
import { staticFilePath, staticFileUrl } from '../../../js/app/common/fs_utils';

// Electron loaded the page from a file: URL; the tests set it through <base>.
const setBase = href => {
  document.head.querySelectorAll('base').forEach(el => el.remove());
  const base = document.createElement('base');
  base.href = href;
  document.head.appendChild(base);
};
const ROOT = '/opt/game/public';

beforeEach(() => setBase(pathToFileURL(`${ROOT}/index.html`).href));
afterEach(() =>
  document.head.querySelectorAll('base').forEach(el => el.remove())
);

describe('platform assets (Electron): same strings as the former inline code', () => {
  test('getStaticRootPath is the directory of the loaded page', () => {
    expect(getStaticRootPath()).toBe(`${ROOT}/`);
  });

  test('getStaticRootPath throws when the page is not a file: URL', () => {
    setBase('http://localhost/index.html');
    expect(() => getStaticRootPath()).toThrow();
  });

  test('toAssetUrl is file-url of the path', () => {
    const p = '/opt/my game/public/levels/a#b.mp3';
    expect(toAssetUrl(p)).toBe(fileUrl(p));
  });

  test('toAssetSrc returns the raw path unchanged (and undefined as is)', () => {
    expect(toAssetSrc('/x/y z/a.png')).toBe('/x/y z/a.png');
    expect(toAssetSrc(undefined)).toBeUndefined();
  });

  test('getStaticFileUrl is file-url of the resolved static path', () => {
    expect(getStaticFileUrl('avatars/avatar1.png')).toBe(
      fileUrl(path.resolve(ROOT, 'avatars/avatar1.png'))
    );
    expect(staticFileUrl('code_runner/worker.js')).toBe(
      pathToFileURL(path.resolve(ROOT, 'code_runner/worker.js')).href
    );
  });

  test('audio URL: the new call chain equals the former staticFileUrl(absolute path)', () => {
    const dir = staticFilePath('levels/common/sfx');
    const former = fileUrl(path.resolve(ROOT, `${dir}/click 1.mp3`));
    expect(toAssetUrl(staticFilePath('levels/common/sfx/click 1.mp3'))).toBe(
      former
    );
  });
});
