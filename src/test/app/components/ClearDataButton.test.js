import React from 'react';
import { shallow } from 'enzyme';

jest.mock('fs-jetpack', () => ({ remove: jest.fn() }));
jest.mock('../../../js/app/common/database', () => ({
  __esModule: true,
  default: { delete: jest.fn() },
}));
jest.mock('../../../js/app/platform/store', () => ({
  hasValue: jest.fn(),
  deleteValue: jest.fn(),
}));
jest.mock('../../../js/app/platform/dialog', () => ({ showConfirm: jest.fn() }));
jest.mock('../../../js/app/config/config', () => ({
  __esModule: true,
  default: { codeStoragePath: '/code' },
}));
jest.mock('../../../js/app/common/context/schema', () => ({
  describeSchema: jest.fn(() => ({ fields: { a: {}, b: { meta: { persistOnClearProgess: true } } } })),
}));

const jetpack = require('fs-jetpack');
const db = require('../../../js/app/common/database').default;
const { hasValue, deleteValue } = require('../../../js/app/platform/store');
const { showConfirm } = require('../../../js/app/platform/dialog');
const ClearDataButton = require('../../../js/app/components/ClearDataButton').default;

// jsdom's window.location.reload cannot be replaced, so the reload itself (which
// jsdom reports as a "not implemented: navigation" console error) is not asserted.
beforeEach(() => {
  jest.clearAllMocks();
  hasValue.mockReturnValue(true);
  db.delete.mockResolvedValue(undefined);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
  console.error.mockRestore();
});

function makeInstance() {
  return shallow(<ClearDataButton />).instance();
}

describe('ClearDataButton.clearUserData', () => {
  test('aborts without deleting anything when the first dialog is cancelled', async () => {
    showConfirm.mockResolvedValueOnce(false);
    await makeInstance().clearUserData();
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(deleteValue).not.toHaveBeenCalled();
    expect(jetpack.remove).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  test('aborts without deleting anything when the second dialog is cancelled', async () => {
    showConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await makeInstance().clearUserData();
    expect(showConfirm).toHaveBeenCalledTimes(2);
    expect(deleteValue).not.toHaveBeenCalled();
    expect(jetpack.remove).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  test('does not delete when a dialog rejects, and propagates the error', async () => {
    showConfirm.mockRejectedValueOnce(new Error('boom'));
    await expect(makeInstance().clearUserData()).rejects.toThrow('boom');
    expect(deleteValue).not.toHaveBeenCalled();
    expect(jetpack.remove).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  test('deletes data and drops the database when both are confirmed', async () => {
    showConfirm.mockResolvedValue(true);
    await makeInstance().clearUserData();
    expect(showConfirm).toHaveBeenCalledTimes(2);
    expect(deleteValue).toHaveBeenCalledTimes(1);
    expect(deleteValue).toHaveBeenCalledWith('a');
    expect(jetpack.remove).toHaveBeenCalledWith('/code');
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  test('ignores a second click while the dialogs are open', async () => {
    let resolveFirst;
    showConfirm.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; }));
    const instance = makeInstance();
    const first = instance.clearUserData();
    await instance.clearUserData();
    expect(showConfirm).toHaveBeenCalledTimes(1);
    resolveFirst(false);
    await first;
    expect(deleteValue).not.toHaveBeenCalled();
  });
});
