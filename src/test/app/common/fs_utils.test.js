import path from 'path';
import { existsAsync } from '../../../js/app/platform/fs';
import {
  sfExists,
  staticFilePath,
  staticFileUrl,
} from '../../../js/app/common/fs_utils';

jest.mock('../../../js/app/platform/fs', () => ({
  existsAsync: jest.fn(),
}));

describe('sfExists', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['file', 'dir', false])('resolves %p from existsAsync', async v => {
    existsAsync.mockResolvedValue(v);

    const result = sfExists('levels/common');

    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(v);
    expect(existsAsync.mock.calls[0][0]).toMatch(/levels[\\/]common$/);
  });

  it('propagates rejections', async () => {
    existsAsync.mockRejectedValue(new Error('boom'));

    await expect(sfExists('x')).rejects.toThrow('boom');
  });
});

describe('staticFilePath / staticFileUrl', () => {
  const setBase = href => {
    document.head.querySelectorAll('base').forEach(el => el.remove());
    const base = document.createElement('base');
    base.href = href;
    document.head.appendChild(base);
  };

  afterEach(() => {
    document.head.querySelectorAll('base').forEach(el => el.remove());
  });

  it('resolves relative paths against the directory of the loaded page', () => {
    setBase('file:///opt/game/public/index.html');

    expect(staticFilePath('levels/common')).toBe(
      path.resolve('/opt/game/public', 'levels/common')
    );
  });

  it('does not depend on the location of the source file', () => {
    setBase('file:///elsewhere/public/index.html');

    expect(staticFilePath('package.json')).toBe(
      path.resolve('/elsewhere/public', 'package.json')
    );
  });

  it('keeps absolute paths as they are', () => {
    setBase('file:///opt/game/public/index.html');

    expect(staticFilePath('/abs/dir/file.mp3')).toBe(
      path.resolve('/abs/dir/file.mp3')
    );
  });

  it('decodes percent-encoded page directories', () => {
    setBase('file:///opt/my%20game/public/index.html');

    expect(staticFilePath('x.png')).toBe(
      path.resolve('/opt/my game/public', 'x.png')
    );
  });

  it('builds file URLs from the same base', () => {
    setBase('file:///opt/game/public/index.html');

    expect(staticFileUrl('avatars/a.png')).toBe(
      'file:///opt/game/public/avatars/a.png'
    );
  });

  it('throws when the page is not a file: URL', () => {
    setBase('http://localhost/index.html');

    expect(() => staticFilePath('x')).toThrow();
  });
});
