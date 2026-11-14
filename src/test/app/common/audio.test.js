import audioManager from '../../../js/app/common/audio/index';
import { listAsync } from '../../../js/app/platform/fs';

jest.mock('../../../js/app/platform/fs', () => ({ listAsync: jest.fn() }));
jest.mock('../../../js/app/platform/store', () => ({
  getValue: jest.fn(),
  setValue: jest.fn(),
}));
jest.mock('../../../js/app/common/fs_utils', () => ({
  staticFilePath: jest.fn(p => `/static/${p}`),
  staticFileUrl: jest.fn(p => `file://${p}`),
}));
jest.mock('../../../js/app/common/assetLoader', () => ({
  readDirectory: jest.fn(),
  resolveAbsolutePath: jest.fn(),
}));
jest.mock('../../../js/app/common/levelLoader', () => ({}));

const players = [
  ['loadSfx', 'sfx', '/static/levels/common/sfx'],
  ['loadMusic', 'music', '/static/levels/common/music'],
];

describe.each(players)('AudioManager.%s', (method, key, dirPath) => {
  let player;
  let calls;

  beforeEach(() => {
    jest.clearAllMocks();
    player = audioManager[key];
    calls = [];
    player.register = jest.fn((name, urls) =>
      calls.push(['register', name, urls])
    );
    player.load = jest.fn(() => calls.push(['load']));
  });

  it('registers grouped supported files in order, then calls load() after the listing resolves', async () => {
    let resolveList;
    listAsync.mockReturnValue(new Promise(resolve => (resolveList = resolve)));

    const promise = audioManager[method]();
    expect(listAsync).toHaveBeenCalledWith(dirPath);
    expect(calls).toEqual([]);

    resolveList(['a.mp3', 'a.ogg', 'b.wav', 'readme.txt']);
    await promise;

    expect(calls).toEqual([
      ['register', 'a', [`file://${dirPath}/a.mp3`, `file://${dirPath}/a.ogg`]],
      ['register', 'b', [`file://${dirPath}/b.wav`]],
      ['load'],
    ]);
  });

  it('calls load() with no registrations for an empty directory', async () => {
    listAsync.mockResolvedValue([]);
    await audioManager[method]();
    expect(calls).toEqual([['load']]);
  });

  it('rejects with the path when the directory does not exist', async () => {
    listAsync.mockResolvedValue(undefined);
    await expect(audioManager[method]()).rejects.toThrow(dirPath);
    expect(player.load).not.toHaveBeenCalled();
  });

  it('propagates listing errors without registering or loading', async () => {
    const error = new Error('EACCES');
    listAsync.mockRejectedValue(error);
    await expect(audioManager[method]()).rejects.toBe(error);
    expect(player.register).not.toHaveBeenCalled();
    expect(player.load).not.toHaveBeenCalled();
  });
});
