import React from 'react';
import { render } from '@testing-library/react';

vi.mock('../../../js/app/platform/fs', () => ({ remove: vi.fn() }));
vi.mock('../../../js/app/common/database', () => ({
  __esModule: true,
  default: { delete: vi.fn() },
}));
vi.mock('../../../js/app/platform/store', () => ({
  hasValue: vi.fn(),
  deleteValue: vi.fn(),
}));
vi.mock('../../../js/app/platform/dialog', () => ({ showConfirm: vi.fn() }));
vi.mock('../../../js/app/config/config', () => ({
  __esModule: true,
  default: { codeStoragePath: '/code' },
}));
vi.mock('../../../js/app/common/context/schema', () => ({
  describeSchema: vi.fn(() => ({ fields: { a: {}, b: { meta: { persistOnClearProgess: true } } } })),
}));

import { remove } from '../../../js/app/platform/fs';
import db from '../../../js/app/common/database';
import { hasValue, deleteValue } from '../../../js/app/platform/store';
import { showConfirm } from '../../../js/app/platform/dialog';
import ClearDataButton from '../../../js/app/components/ClearDataButton';

// jsdom's window.location.reload cannot be replaced, so the reload itself (which
// jsdom reports as a "not implemented: navigation" console error) is not asserted.
beforeEach(() => {
  vi.clearAllMocks();
  hasValue.mockReturnValue(true);
  db.delete.mockResolvedValue(undefined);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
  console.error.mockRestore();
});

function makeInstance() {
  const ref = React.createRef();
  render(<ClearDataButton ref={ref} />);
  return ref.current;
}

describe('ClearDataButton.clearUserData', () => {
  test('aborts without deleting anything when the first dialog is cancelled', async () => {
    showConfirm.mockResolvedValueOnce(false);
    await makeInstance().clearUserData();
    expect(showConfirm).toHaveBeenCalledTimes(1);
    expect(deleteValue).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  test('aborts without deleting anything when the second dialog is cancelled', async () => {
    showConfirm.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await makeInstance().clearUserData();
    expect(showConfirm).toHaveBeenCalledTimes(2);
    expect(deleteValue).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  test('does not delete when a dialog rejects, and propagates the error', async () => {
    showConfirm.mockRejectedValueOnce(new Error('boom'));
    await expect(makeInstance().clearUserData()).rejects.toThrow('boom');
    expect(deleteValue).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  test('deletes data and drops the database when both are confirmed', async () => {
    showConfirm.mockResolvedValue(true);
    await makeInstance().clearUserData();
    expect(showConfirm).toHaveBeenCalledTimes(2);
    expect(deleteValue).toHaveBeenCalledTimes(1);
    expect(deleteValue).toHaveBeenCalledWith('a');
    expect(remove).toHaveBeenCalledWith('/code');
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
