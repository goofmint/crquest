import audioManager from '../../../js/app/common/audio/index';
import TrackPlayer from '../../../js/app/common/audio/TrackPlayer';
import { listAsync } from '../../../js/app/platform/fs';
import { getValueAsync, setValueAsync } from '../../../js/app/platform/store';
import { showAlert } from '../../../js/app/platform/dialog';

vi.mock('../../../js/app/platform/fs', () => ({ listAsync: vi.fn() }));
vi.mock('../../../js/app/platform/store', () => ({
  getValueAsync: vi.fn(),
  setValueAsync: vi.fn(),
}));
vi.mock('../../../js/app/platform/dialog', () => ({ showAlert: vi.fn() }));
vi.mock('../../../js/app/common/fs_utils', () => ({
  staticFilePath: vi.fn(p => `/static/${p}`),
  staticFileUrl: vi.fn(p => `file://${p}`),
}));
vi.mock('../../../js/app/common/assetLoader', () => ({
  readDirectory: vi.fn(),
  resolveAbsolutePath: vi.fn(),
}));
vi.mock('../../../js/app/common/levelLoader', () => ({}));

const players = [
  ['loadSfx', 'sfx', '/static/levels/common/sfx'],
  ['loadMusic', 'music', '/static/levels/common/music'],
];

it('stops a fading track without changing which other tracks are playing', () => {
  const player = new TrackPlayer({ muted: false });
  const overture = { fadeOut: vi.fn(), stop: vi.fn() };
  player.tracks.overture = overture;
  player.tracks.level = { fadeIn: vi.fn(), stop: vi.fn() };
  player.tracks.ambient = { fadeIn: vi.fn(), stop: vi.fn() };
  player.currentlyPlayingTracks = ['overture'];

  player.fadeOutAll();
  player.fadeIn('level');
  player.fadeIn('ambient');
  player.stop('overture');

  expect(overture.stop).toHaveBeenCalledOnce();
  expect(player.currentlyPlayingTracks).toEqual(['level', 'ambient']);
  expect(player.tracks.level.stop).not.toHaveBeenCalled();
});

describe.each(players)('AudioManager.%s', (method, key, dirPath) => {
  let player;
  let calls;

  beforeEach(() => {
    vi.clearAllMocks();
    player = audioManager[key];
    calls = [];
    player.register = vi.fn((name, urls) =>
      calls.push(['register', name, urls])
    );
    player.load = vi.fn(() => calls.push(['load']));
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

describe('AudioManager saved state', () => {
  const channels = ['vo', 'sfx', 'music'];
  let order;

  beforeEach(() => {
    vi.clearAllMocks();
    order = [];
    audioManager.loaded = false;
    audioManager.sfx.loaded = true;
    audioManager.music.loaded = true;
    for (const channel of channels) {
      audioManager[channel].mute = vi.fn();
      audioManager[channel].unMute = vi.fn();
      audioManager[channel].setVolumeAll = vi.fn();
    }
    audioManager.master.mute = vi.fn();
    audioManager.master.unMute = vi.fn();
    audioManager.onload = vi.fn(() => order.push('onload'));
    showAlert.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => console.error.mockRestore());

  it('applies the saved state as is, then calls onload', async () => {
    getValueAsync.mockImplementation(async () => {
      order.push('read');
      return {
        master: { muted: true },
        vo: { volume: 0.1, muted: false },
        music: { volume: 0.2, muted: true },
        sfx: { volume: 0.3, muted: false },
      };
    });
    await audioManager.checkLoaded('music');
    expect(getValueAsync).toHaveBeenCalledWith('audio');
    expect(order).toEqual(['read', 'onload']);
    expect(audioManager.master.mute).toHaveBeenCalled();
    expect(audioManager.master.unMute).not.toHaveBeenCalled();
    expect(audioManager.vo.setVolumeAll).toHaveBeenCalledWith(0.1);
    expect(audioManager.music.mute).toHaveBeenCalled();
    expect(audioManager.music.setVolumeAll).toHaveBeenCalledWith(0.2);
    expect(audioManager.sfx.setVolumeAll).toHaveBeenCalledWith(0.3);
  });

  it('applies the defaults when nothing is saved (existing behaviour)', async () => {
    getValueAsync.mockResolvedValue(undefined);
    await audioManager.checkLoaded('sfx');
    expect(audioManager.master.unMute).toHaveBeenCalled();
    expect(audioManager.vo.setVolumeAll).toHaveBeenCalledWith(0.6);
    expect(audioManager.music.setVolumeAll).toHaveBeenCalledWith(0.15);
    expect(audioManager.sfx.setVolumeAll).toHaveBeenCalledWith(0.5);
    expect(audioManager.onload).toHaveBeenCalledTimes(1);
  });

  it('does not call onload before the saved state is read', async () => {
    let resolveRead;
    getValueAsync.mockReturnValue(new Promise(resolve => (resolveRead = resolve)));
    const pending = audioManager.checkLoaded('sfx');
    await Promise.resolve();
    expect(audioManager.onload).not.toHaveBeenCalled();
    resolveRead(undefined);
    await pending;
    expect(audioManager.onload).toHaveBeenCalledTimes(1);
  });

  it('does not call onload when players are not all loaded', async () => {
    audioManager.music.loaded = false;
    await audioManager.checkLoaded('sfx');
    expect(getValueAsync).not.toHaveBeenCalled();
    expect(audioManager.onload).not.toHaveBeenCalled();
  });

  it('reports a read failure and does not call onload', async () => {
    const failure = new Error('corrupt');
    getValueAsync.mockRejectedValue(failure);
    await audioManager.checkLoaded('sfx');
    expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(audioManager.onload).not.toHaveBeenCalled();
  });

  it('saveState writes the whole snapshot under "audio"', async () => {
    setValueAsync.mockResolvedValue(undefined);
    await audioManager.saveState();
    expect(setValueAsync).toHaveBeenCalledWith('audio', audioManager.getState());
  });

  it('saveState reports a write failure without throwing', async () => {
    const failure = new Error('readonly');
    setValueAsync.mockRejectedValue(failure);
    await expect(audioManager.saveState()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);
    expect(showAlert).toHaveBeenCalledTimes(1);
  });
});
