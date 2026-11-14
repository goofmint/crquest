import { existsAsync } from '../../../js/app/platform/fs';
import { sfExists } from '../../../js/app/common/fs_utils';

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
