function loadDialog(remote) {
  let mod;
  jest.isolateModules(() => {
    jest.doMock('electron', () => ({ remote }));
    mod = require('../../../js/app/platform/dialog');
  });
  return mod;
}

function makeRemote() {
  return {
    dialog: {
      showMessageBoxSync: jest.fn(),
      showOpenDialog: jest.fn(),
    },
  };
}

describe('showConfirmSync', () => {
  test('calls showMessageBoxSync with the question options and null window', () => {
    const remote = makeRemote();
    remote.dialog.showMessageBoxSync.mockReturnValue(0);
    loadDialog(remote).showConfirmSync('Sure?');
    expect(remote.dialog.showMessageBoxSync).toHaveBeenCalledTimes(1);
    expect(remote.dialog.showMessageBoxSync).toHaveBeenCalledWith(null, {
      type: 'question',
      buttons: ['OK', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      detail: 'Sure?',
      message: '',
    });
  });

  test.each([
    [0, true],
    [1, false],
    [2, false],
    [undefined, false],
  ])('button index %p returns %p', (idx, expected) => {
    const remote = makeRemote();
    remote.dialog.showMessageBoxSync.mockReturnValue(idx);
    expect(loadDialog(remote).showConfirmSync('m')).toBe(expected);
  });

  test('propagates thrown errors', () => {
    const remote = makeRemote();
    remote.dialog.showMessageBoxSync.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => loadDialog(remote).showConfirmSync('m')).toThrow('boom');
  });
});

describe('showAlertSync', () => {
  test('calls showMessageBoxSync with the warning options and returns undefined', () => {
    const remote = makeRemote();
    remote.dialog.showMessageBoxSync.mockReturnValue(0);
    expect(loadDialog(remote).showAlertSync('Careful')).toBeUndefined();
    expect(remote.dialog.showMessageBoxSync).toHaveBeenCalledWith(null, {
      type: 'warning',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      detail: 'Careful',
      message: '',
    });
  });
});

describe('showDirectoryDialog', () => {
  const params = { title: 'T', buttonLabel: 'Choose', defaultPath: '/tmp/x' };

  test('includes defaultPath when truthy and passes no window argument', async () => {
    const remote = makeRemote();
    remote.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/a'] });
    await loadDialog(remote).showDirectoryDialog(params);
    expect(remote.dialog.showOpenDialog).toHaveBeenCalledTimes(1);
    expect(remote.dialog.showOpenDialog.mock.calls[0]).toEqual([
      {
        title: 'T',
        message: 'T',
        buttonLabel: 'Choose',
        properties: ['openDirectory'],
        defaultPath: '/tmp/x',
      },
    ]);
  });

  test('omits defaultPath when falsy', async () => {
    const remote = makeRemote();
    remote.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/a'] });
    await loadDialog(remote).showDirectoryDialog({ ...params, defaultPath: '' });
    const options = remote.dialog.showOpenDialog.mock.calls[0][0];
    expect(options).not.toHaveProperty('defaultPath');
  });

  test('returns the first path', async () => {
    const remote = makeRemote();
    remote.dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/a', '/b'] });
    await expect(loadDialog(remote).showDirectoryDialog(params)).resolves.toBe('/a');
  });

  test('returns undefined for an empty array', async () => {
    const remote = makeRemote();
    remote.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(loadDialog(remote).showDirectoryDialog(params)).resolves.toBeUndefined();
  });

  test('returns the path even when canceled is true', async () => {
    const remote = makeRemote();
    remote.dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: ['/a'] });
    await expect(loadDialog(remote).showDirectoryDialog(params)).resolves.toBe('/a');
  });

  test('propagates rejections', async () => {
    const remote = makeRemote();
    remote.dialog.showOpenDialog.mockRejectedValue(new Error('nope'));
    await expect(loadDialog(remote).showDirectoryDialog(params)).rejects.toThrow('nope');
  });

  test('throws when filePaths is missing', async () => {
    const remote = makeRemote();
    remote.dialog.showOpenDialog.mockResolvedValue({ canceled: true });
    await expect(loadDialog(remote).showDirectoryDialog(params)).rejects.toThrow(/filePaths/);
  });
});

describe('unavailable remote', () => {
  test('does not access electron at import time', () => {
    expect(() => loadDialog(undefined)).not.toThrow();
  });

  test('throws explicit errors when remote is undefined', async () => {
    const mod = loadDialog(undefined);
    expect(() => mod.showConfirmSync('m')).toThrow(/remote\.dialog/);
    expect(() => mod.showAlertSync('m')).toThrow(/remote\.dialog/);
    await expect(mod.showDirectoryDialog({ title: 'T', buttonLabel: 'B' })).rejects.toThrow(
      /remote\.dialog/
    );
  });

  test('throws when remote.dialog is missing', () => {
    expect(() => loadDialog({}).showConfirmSync('m')).toThrow(/remote\.dialog/);
  });
});
