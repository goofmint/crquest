function loadEnv(value) {
  let mod;
  jest.isolateModules(() => {
    jest.doMock('electron-is-dev', () => value);
    mod = require('../../../js/app/platform/env');
  });
  return mod;
}

describe('isDev', () => {
  test.each([true, false])('returns the electron-is-dev value (%s)', value => {
    const { isDev } = loadEnv(value);
    expect(typeof isDev).toBe('function');
    expect(isDev()).toBe(value);
    expect(isDev()).toBe(value);
  });

  test('does not recompute after load', () => {
    let current = true;
    let mod;
    jest.isolateModules(() => {
      jest.doMock('electron-is-dev', () => current);
      mod = require('../../../js/app/platform/env');
    });
    current = false;
    expect(mod.isDev()).toBe(true);
  });
});
