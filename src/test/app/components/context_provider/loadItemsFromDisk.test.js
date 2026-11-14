import { existsAsync } from '../../../../js/app/platform/fs';
import {
  readDirectory,
  readFile,
  resolveAbsolutePath,
} from '../../../../js/app/common/assetLoader';
import loadItemsFromDisk from '../../../../js/app/components/context_provider/loadItemsFromDisk';

jest.mock('../../../../js/app/platform/fs', () => ({
  existsAsync: jest.fn(),
}));
jest.mock('../../../../js/app/common/assetLoader', () => ({
  readDirectory: jest.fn(),
  readFile: jest.fn(),
  resolveAbsolutePath: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  resolveAbsolutePath.mockImplementation(async p => `/abs/${p}`);
});

describe('loadItemsFromDisk', () => {
  it('loads item directories using existsAsync and skips non-directories', async () => {
    readDirectory.mockResolvedValue(['sword', 'readme.txt']);
    existsAsync.mockImplementation(async p =>
      p === '/abs/items/sword' ? 'dir' : 'file'
    );
    readFile.mockResolvedValue(JSON.stringify({ name: 'sword', power: 1 }));

    const items = await loadItemsFromDisk();

    expect(Object.keys(items)).toEqual(['sword']);
    expect(items.sword).toEqual({
      iconPath: '/abs/items/sword/icon.png',
      layerPath: '/abs/items/sword/layer.png',
      layerReversePath: '/abs/items/sword/layer_reverse.png',
      name: 'sword',
      power: 1,
    });
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('lets index.json values override the default paths', async () => {
    readDirectory.mockResolvedValue(['hat']);
    existsAsync.mockResolvedValue('dir');
    readFile.mockResolvedValue(
      JSON.stringify({ name: 'hat', iconPath: '/custom.png' })
    );

    const items = await loadItemsFromDisk();

    expect(items.hat.iconPath).toBe('/custom.png');
  });

  it('propagates existsAsync rejections', async () => {
    readDirectory.mockResolvedValue(['hat']);
    existsAsync.mockRejectedValue(new Error('EACCES'));

    await expect(loadItemsFromDisk()).rejects.toThrow('EACCES');
  });
});
