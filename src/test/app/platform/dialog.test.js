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
      showMessageBox: jest.fn(),
      showOpenDialog: jest.fn(),
    },
  };
}

describe('showConfirm', () => {
  test('calls showMessageBox with the question options and null window', async () => {
    const remote = makeRemote();
    remote.dialog.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false });
    await loadDialog(remote).showConfirm('Sure?');
    expect(remote.dialog.showMessageBox).toHaveBeenCalledTimes(1);
    expect(remote.dialog.showMessageBox).toHaveBeenCalledWith(null, {
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
  ])('button index %p resolves %p', async (response, expected) => {
    const remote = makeRemote();
    remote.dialog.showMessageBox.mockResolvedValue({ response, checkboxChecked: false });
    await expect(loadDialog(remote).showConfirm('m')).resolves.toBe(expected);
  });

  test('propagates rejections', async () => {
    const remote = makeRemote();
    remote.dialog.showMessageBox.mockRejectedValue(new Error('boom'));
    await expect(loadDialog(remote).showConfirm('m')).rejects.toThrow('boom');
  });

  test('propagates synchronous throws as rejections', async () => {
    const remote = makeRemote();
    remote.dialog.showMessageBox.mockImplementation(() => {
      throw new Error('boom');
    });
    await expect(loadDialog(remote).showConfirm('m')).rejects.toThrow('boom');
  });
});

describe('showAlert', () => {
  test('calls showMessageBox with the warning options and resolves undefined', async () => {
    const remote = makeRemote();
    remote.dialog.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false });
    await expect(loadDialog(remote).showAlert('Careful')).resolves.toBeUndefined();
    expect(remote.dialog.showMessageBox).toHaveBeenCalledWith(null, {
      type: 'warning',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      detail: 'Careful',
      message: '',
    });
  });

  test('propagates rejections', async () => {
    const remote = makeRemote();
    remote.dialog.showMessageBox.mockRejectedValue(new Error('boom'));
    await expect(loadDialog(remote).showAlert('m')).rejects.toThrow('boom');
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
    await expect(mod.showConfirm('m')).rejects.toThrow(/remote\.dialog/);
    await expect(mod.showAlert('m')).rejects.toThrow(/remote\.dialog/);
    await expect(mod.showDirectoryDialog({ title: 'T', buttonLabel: 'B' })).rejects.toThrow(
      /remote\.dialog/
    );
  });

  test('rejects when remote.dialog is missing', async () => {
    await expect(loadDialog({}).showConfirm('m')).rejects.toThrow(/remote\.dialog/);
  });
});
