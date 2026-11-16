import { initializeSystemInfo } from '../../../../js/app/components/context_provider/system';
import { getPlatform } from '../../../../js/app/platform/env';
import { readFile } from '../../../../js/app/platform/fs';

vi.mock('../../../../js/app/platform/env', () => ({ getPlatform: vi.fn() }));
vi.mock('../../../../js/app/platform/fs', () => ({ readFile: vi.fn() }));

const cpuInfo = hardware =>
  `processor\t: 0\nmodel name\t: ARMv7\nHardware\t: ${hardware}\nRevision\t: a02082\n`;

async function piFor(contents) {
  readFile.mockResolvedValue(contents);
  const result = await initializeSystemInfo({ systemInfo: {} });
  return result.systemInfo.pi;
}

beforeEach(() => {
  readFile.mockReset();
  getPlatform.mockReset();
  getPlatform.mockReturnValue('linux');
});

describe('initializeSystemInfo', () => {
  test.each(['darwin', 'win32', 'linux'])('records the platform/env value (%s)', async value => {
    getPlatform.mockReturnValue(value);
    readFile.mockResolvedValue('');
    const result = await initializeSystemInfo({ systemInfo: {} });
    expect(result.systemInfo.os).toBe(value);
  });

  test('keeps an already recorded os and does not detect again', async () => {
    const result = await initializeSystemInfo({ systemInfo: { os: 'darwin', pi: false } });
    expect(result.systemInfo).toEqual({ os: 'darwin', pi: false });
    expect(readFile).not.toHaveBeenCalled();
  });

  test('overwrites pi when os is falsy', async () => {
    readFile.mockResolvedValue(cpuInfo('BCM2835'));
    const result = await initializeSystemInfo({ systemInfo: { os: '', pi: false, extra: 1 } });
    expect(result.systemInfo).toEqual({ os: 'linux', pi: true, extra: 1 });
  });

  test('does not mutate the original state', async () => {
    readFile.mockResolvedValue(cpuInfo('BCM2835'));
    const state = { systemInfo: {}, other: { a: 1 } };
    const result = await initializeSystemInfo(state);
    expect(state).toEqual({ systemInfo: {}, other: { a: 1 } });
    expect(result).not.toBe(state);
    expect(result.other).toEqual({ a: 1 });
  });

  test.each([
    'BCM2708',
    'BCM2709',
    'BCM2710',
    'BCM2835',
    'BCM2836',
    'BCM2837',
    'BCM2837B0',
    'BCM2711',
  ])('%s is a Raspberry Pi', async model => {
    expect(await piFor(cpuInfo(model))).toBe(true);
  });

  test('reads /proc/cpuinfo as UTF-8', async () => {
    await piFor(cpuInfo('BCM2835'));
    expect(readFile.mock.calls[0][0]).toBe('/proc/cpuinfo');
    expect(readFile.mock.calls[0][1]).toEqual({ encoding: 'utf8' });
  });

  test.each([
    ['ENOENT', Object.assign(new Error('ENOENT'), { code: 'ENOENT' })],
    ['a permission error', new Error('forbidden path: /proc/cpuinfo')],
  ])('is not a Pi when reading fails (%s), without rejecting', async (_, error) => {
    readFile.mockRejectedValue(error);
    const result = await initializeSystemInfo({ systemInfo: {} });
    expect(result.systemInfo).toEqual({ os: 'linux', pi: false });
  });

  test.each([
    ['an unlisted model', cpuInfo('BCM9999')],
    ['a partial match', cpuInfo('BCM2835x')],
    ['no Hardware line', 'processor\t: 0\nmodel name\t: x86\n'],
    ['empty contents', ''],
  ])('is not a Pi for %s', async (_, contents) => {
    expect(await piFor(contents)).toBe(false);
  });
});
