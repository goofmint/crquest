const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  message: vi.fn(),
  open: vi.fn(),
  openUrl: vi.fn(),
  openPath: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  confirm: mocks.confirm,
  message: mocks.message,
  open: mocks.open,
}));
vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: mocks.openUrl,
  openPath: mocks.openPath,
}));

import {
  showAlert,
  showConfirm,
  showDirectoryDialog,
} from '../../../../js/app/platform/tauri/dialog';
import { openExternal, openPath } from '../../../../js/app/platform/tauri/shell';

beforeEach(() => vi.resetAllMocks());

describe('showConfirm', () => {
  test('asks with OK / Cancel labels and resolves the boolean', async () => {
    mocks.confirm.mockResolvedValue(true);
    await expect(showConfirm('Sure?')).resolves.toBe(true);
    expect(mocks.confirm).toHaveBeenCalledWith('Sure?', {
      kind: 'info',
      okLabel: 'OK',
      cancelLabel: 'Cancel',
    });
  });

  test.each([[false, false], [undefined, false]])('%p resolves %p', async (value, expected) => {
    mocks.confirm.mockResolvedValue(value);
    await expect(showConfirm('m')).resolves.toBe(expected);
  });

  test('propagates a failure as an Error', async () => {
    mocks.confirm.mockRejectedValue('denied');
    await expect(showConfirm('m')).rejects.toThrow('denied');
  });
});

describe('showAlert', () => {
  test('shows a warning with an OK button and resolves undefined', async () => {
    mocks.message.mockResolvedValue(undefined);
    await expect(showAlert('Careful')).resolves.toBeUndefined();
    expect(mocks.message).toHaveBeenCalledWith('Careful', { kind: 'warning', okLabel: 'OK' });
  });
});

describe('showDirectoryDialog', () => {
  test('opens a recursive directory chooser and resolves the path', async () => {
    mocks.open.mockResolvedValue('/chosen');
    await expect(
      showDirectoryDialog({ title: 'Pick', buttonLabel: 'Select', defaultPath: '/start' })
    ).resolves.toBe('/chosen');
    expect(mocks.open).toHaveBeenCalledWith({
      title: 'Pick',
      directory: true,
      multiple: false,
      recursive: true,
      defaultPath: '/start',
    });
  });

  test('passes defaultPath only when truthy', async () => {
    mocks.open.mockResolvedValue('/chosen');
    await showDirectoryDialog({ title: 'Pick', buttonLabel: 'Select', defaultPath: '' });
    expect(mocks.open.mock.calls[0][0]).not.toHaveProperty('defaultPath');
  });

  test('resolves undefined when cancelled (null)', async () => {
    mocks.open.mockResolvedValue(null);
    await expect(
      showDirectoryDialog({ title: 'Pick', buttonLabel: 'Select' })
    ).resolves.toBeUndefined();
  });

  test('throws when the result is not a path', async () => {
    mocks.open.mockResolvedValue(['/a']);
    await expect(
      showDirectoryDialog({ title: 'Pick', buttonLabel: 'Select' })
    ).rejects.toThrow(/neither a path nor null/);
  });
});

describe('shell', () => {
  test('openExternal delegates to openUrl', async () => {
    mocks.openUrl.mockResolvedValue(undefined);
    await expect(openExternal('https://example.com')).resolves.toBeUndefined();
    expect(mocks.openUrl).toHaveBeenCalledWith('https://example.com');
  });

  test('openPath delegates to the opener and rejects with an Error on failure', async () => {
    mocks.openPath.mockResolvedValueOnce(undefined);
    await expect(openPath('/data')).resolves.toBeUndefined();
    expect(mocks.openPath).toHaveBeenCalledWith('/data');
    mocks.openPath.mockRejectedValueOnce('Not allowed to open path /etc');
    await expect(openPath('/etc')).rejects.toThrow('Not allowed to open path /etc');
  });
});
