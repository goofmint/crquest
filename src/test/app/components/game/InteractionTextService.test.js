import { readAsync } from '../../../../js/app/platform/fs';
import { overlayLocalizedJson } from '../../../../js/app/common/assetLoader';
import levelLoader from '../../../../js/app/common/levelLoader';
import TiledService from '../../../../js/app/common/tiled';
import InteractionTextService from '../../../../js/app/components/game/InteractionTextService';

vi.mock('../../../../js/app/platform/fs', () => ({
  readAsync: vi.fn(),
}));
vi.mock('../../../../js/app/common/assetLoader', () => ({
  overlayLocalizedJson: vi.fn(async (_, data) => data),
}));
vi.mock('../../../../js/app/common/fs_utils', () => ({
  staticFilePath: vi.fn(relativePath => `/static/${relativePath}`),
}));
vi.mock('../../../../js/app/common/levelLoader', () => ({
  default: { getLevel: vi.fn() },
}));
vi.mock('../../../../js/app/common/tiled', () => ({
  default: {
    getTilesetFromGid: vi.fn(),
    convertPhaserGidToTiledId: vi.fn(),
  },
}));

const FLAVOR_TEXT = {
  text: { sign: 'default sign', door: 'default door' },
  tiledIdMaps: { signs: { 3: 'sign' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  InteractionTextService.defaultTextList = [];
  InteractionTextService.tiledIdMaps = {};
  InteractionTextService.currentLevelTextList = [];
});

describe('InteractionTextService.load', () => {
  it('reads flavorText.json asynchronously and stores the data', async () => {
    readAsync.mockResolvedValue(FLAVOR_TEXT);

    await InteractionTextService.load('levels/common');

    expect(readAsync).toHaveBeenCalledWith(
      '/static/levels/common/flavorText.json',
      'json'
    );
    expect(InteractionTextService.getText({ key: 'sign' })).toBe(
      'default sign'
    );
  });

  it('rejects when the file is missing and keeps the previous data', async () => {
    readAsync.mockResolvedValueOnce(FLAVOR_TEXT);
    await InteractionTextService.load('levels/common');
    readAsync.mockResolvedValueOnce(undefined);

    await expect(InteractionTextService.load('levels/missing')).rejects.toThrow(
      'levels/missing/flavorText.json'
    );
    expect(InteractionTextService.getText({ key: 'door' })).toBe(
      'default door'
    );
  });

  it('loads translated text while preserving level overrides', async () => {
    readAsync.mockResolvedValueOnce(FLAVOR_TEXT);
    overlayLocalizedJson.mockResolvedValueOnce({
      ...FLAVOR_TEXT,
      text: { sign: '表示', door: '扉' },
    });
    await InteractionTextService.load('levels/common');
    levelLoader.getLevel.mockReturnValueOnce({
      flavorTextOverrides: { sign: 'レベルの表示' },
    });
    InteractionTextService.loadLevelOverrides('level1');
    expect(InteractionTextService.getText({ key: 'sign' })).toBe('レベルの表示');
    expect(InteractionTextService.getText({ key: 'door' })).toBe('扉');
  });

  it('propagates read errors', async () => {
    readAsync.mockRejectedValue(new Error('bad json'));

    await expect(InteractionTextService.load('levels/common')).rejects.toThrow(
      'bad json'
    );
  });
});

describe('InteractionTextService.getText', () => {
  beforeEach(async () => {
    readAsync.mockResolvedValue(FLAVOR_TEXT);
    await InteractionTextService.load('levels/common');
  });

  it('merges level overrides over the defaults', () => {
    levelLoader.getLevel.mockReturnValue({
      flavorTextOverrides: { sign: 'level sign' },
    });
    InteractionTextService.loadLevelOverrides('level1');

    expect(levelLoader.getLevel).toHaveBeenCalledWith('level1');
    expect(InteractionTextService.getText({ key: 'sign' })).toBe('level sign');
    expect(InteractionTextService.getText({ key: 'door' })).toBe(
      'default door'
    );
  });

  it('drops the previous level overrides when overrides are reloaded', () => {
    levelLoader.getLevel.mockReturnValueOnce({
      flavorTextOverrides: { sign: 'level sign' },
    });
    InteractionTextService.loadLevelOverrides('level1');
    levelLoader.getLevel.mockReturnValueOnce({});
    InteractionTextService.loadLevelOverrides('level2');

    expect(InteractionTextService.getText({ key: 'sign' })).toBe(
      'default sign'
    );
  });

  it('resolves the key from the gid when no key is given', () => {
    TiledService.getTilesetFromGid.mockReturnValue({ name: 'signs' });
    TiledService.convertPhaserGidToTiledId.mockReturnValue(3);

    expect(InteractionTextService.getText({ gid: 10 })).toBe('default sign');
  });

  it('returns undefined when no key can be resolved or no text exists', () => {
    TiledService.getTilesetFromGid.mockReturnValue(undefined);

    expect(InteractionTextService.getText({ gid: 10 })).toBeUndefined();
    expect(InteractionTextService.getText({ key: 'unknown' })).toBeUndefined();
  });
});
