import { initializeSystemInfo } from '../../../../js/app/components/context_provider/system';
import { getPlatform } from '../../../../js/app/platform/env';

vi.mock('../../../../js/app/platform/env', () => ({ getPlatform: vi.fn() }));
vi.mock('../../../../js/app/platform/fs', () => ({ readFileSync: vi.fn(() => '') }));

describe('initializeSystemInfo', () => {
  test.each(['darwin', 'win32', 'linux'])('records the platform/env value (%s)', value => {
    getPlatform.mockReturnValue(value);
    const result = initializeSystemInfo({ systemInfo: {} });
    expect(result.systemInfo.os).toBe(value);
  });

  test('keeps an already recorded os', () => {
    getPlatform.mockReturnValue('linux');
    const result = initializeSystemInfo({ systemInfo: { os: 'darwin', pi: false } });
    expect(result.systemInfo.os).toBe('darwin');
  });
});
