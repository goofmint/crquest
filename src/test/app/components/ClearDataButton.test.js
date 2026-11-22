import React from 'react';
import { render } from '@testing-library/react';

vi.mock('../../../js/app/platform/fs', () => ({ removeAsync: vi.fn() }));
vi.mock('../../../js/app/common/database', () => ({
  __esModule: true,
  default: { delete: vi.fn() },
}));
vi.mock('../../../js/app/platform/store', () => ({
  hasValueAsync: vi.fn(),
  deleteValueAsync: vi.fn(),
}));
vi.mock('../../../js/app/common/context', () => ({
  suppressPersistence: vi.fn(),
  resumePersistence: vi.fn(),
  flushPendingSaves: vi.fn(),
}));
vi.mock('../../../js/app/common/cloudSave', () => ({ stopCloudSync: vi.fn(), resumeCloudSync: vi.fn(), resetCloudSync: vi.fn() }));
vi.mock('../../../js/app/platform/dialog', () => ({ showConfirm: vi.fn(), showAlert: vi.fn() }));
vi.mock('../../../js/app/config/config', () => ({
  __esModule: true,
  default: { codeStoragePath: '/code' },
}));
vi.mock('../../../js/app/common/context/schema', () => ({
  describeSchema: vi.fn(() => ({ fields: { a: {}, b: { meta: { persistOnClearProgess: true } } } })),
}));

import { stopCloudSync, resumeCloudSync, resetCloudSync } from '../../../js/app/common/cloudSave';
import { removeAsync as remove } from '../../../js/app/platform/fs';
import db from '../../../js/app/common/database';
import { hasValueAsync as hasValue, deleteValueAsync as deleteValue } from '../../../js/app/platform/store';
import { suppressPersistence, resumePersistence, flushPendingSaves } from '../../../js/app/common/context';
import { showConfirm, showAlert } from '../../../js/app/platform/dialog';
import ClearDataButton from '../../../js/app/components/ClearDataButton';

// jsdom's window.location.reload cannot be replaced, so the reload itself (which
// jsdom reports as a "not implemented: navigation" console error) is not asserted.
beforeEach(() => {
  vi.clearAllMocks();
  flushPendingSaves.mockResolvedValue(undefined);
  remove.mockResolvedValue(undefined);
  resetCloudSync.mockResolvedValue(undefined);
  stopCloudSync.mockResolvedValue(undefined);
  resumeCloudSync.mockResolvedValue(undefined);
  hasValue.mockResolvedValue(true);
  deleteValue.mockResolvedValue(undefined);
  showAlert.mockResolvedValue(undefined);
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

  test('resets the cloud sync after the local data is gone, and never when it was not', async () => {
    showConfirm.mockResolvedValueOnce(false);
    await makeInstance().clearUserData();
    expect(resetCloudSync).not.toHaveBeenCalled();

    showConfirm.mockResolvedValue(true);
    const order = [];
    deleteValue.mockImplementation(async () => void order.push('deleted'));
    remove.mockImplementation(async () => void order.push('remove'));
    resetCloudSync.mockImplementation(async () => void order.push('reset'));
    await makeInstance().clearUserData();
    expect(order).toEqual(['deleted', 'remove', 'reset']);
  });

  test('stops the cloud sync before anything is deleted', async () => {
    showConfirm.mockResolvedValue(true);
    const order = [];
    stopCloudSync.mockImplementation(async () => void order.push('stop'));
    suppressPersistence.mockImplementation(() => void order.push('suppress'));
    deleteValue.mockImplementation(async () => void order.push('deleted'));
    await makeInstance().clearUserData();
    expect(order.slice(0, 3)).toEqual(['stop', 'suppress', 'deleted']);
  });

  test('a cloud sync that fails to stop does not block the erase', async () => {
    showConfirm.mockResolvedValue(true);
    stopCloudSync.mockRejectedValue(new Error('stuck'));
    await makeInstance().clearUserData();
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  test('when the sync state or sign-in cannot be cleared: reports, resumes persistence and does not restart', async () => {
    showConfirm.mockResolvedValue(true);
    const failure = new Error('logout incomplete');
    resetCloudSync.mockRejectedValue(failure);
    await expect(makeInstance().clearUserData()).rejects.toBe(failure);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(resumePersistence).toHaveBeenCalledTimes(1);
    expect(db.delete).not.toHaveBeenCalled();
  });

  test('when erasing the local data failed: the sync is resumed and not reset', async () => {
    showConfirm.mockResolvedValue(true);
    deleteValue.mockRejectedValue(new Error('disk full'));
    await expect(makeInstance().clearUserData()).rejects.toThrow('disk full');
    expect(resetCloudSync).not.toHaveBeenCalled();
    expect(resumeCloudSync).toHaveBeenCalledTimes(1);
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

  test('awaits each deletion before removing the code file and dropping the database', async () => {
    showConfirm.mockResolvedValue(true);
    const order = [];
    let finishDelete;
    deleteValue.mockImplementation(
      () => new Promise(resolve => { finishDelete = () => { order.push('deleted'); resolve(); }; })
    );
    remove.mockImplementation(async () => void order.push('remove'));
    const done = makeInstance().clearUserData();
    await vi.waitFor(() => expect(deleteValue).toHaveBeenCalled());
    expect(remove).not.toHaveBeenCalled();
    finishDelete();
    await done;
    expect(order).toEqual(['deleted', 'remove']);
  });

  test('reports a store failure, stops, and does not remove files or drop the database', async () => {
    showConfirm.mockResolvedValue(true);
    const failure = new Error('disk full');
    deleteValue.mockRejectedValue(failure);
    await expect(makeInstance().clearUserData()).rejects.toBe(failure);
    expect(console.error).toHaveBeenCalledWith(expect.any(String), failure);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert.mock.calls[0][0]).toContain('disk full');
    expect(remove).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  test('skips keys that are not stored', async () => {
    showConfirm.mockResolvedValue(true);
    hasValue.mockResolvedValue(false);
    await makeInstance().clearUserData();
    expect(deleteValue).not.toHaveBeenCalled();
  });

  test('suppresses persistence after confirmation, flushes queued saves before deleting', async () => {
    showConfirm.mockResolvedValue(true);
    const order = [];
    suppressPersistence.mockImplementation(() => order.push('suppress'));
    flushPendingSaves.mockImplementation(async () => void order.push('flush'));
    deleteValue.mockImplementation(async () => void order.push('delete'));
    await makeInstance().clearUserData();
    expect(order).toEqual(['suppress', 'flush', 'delete']);
    expect(resumePersistence).not.toHaveBeenCalled();
  });

  test('does not suppress persistence when the user cancels', async () => {
    showConfirm.mockResolvedValueOnce(false);
    await makeInstance().clearUserData();
    expect(suppressPersistence).not.toHaveBeenCalled();
  });

  test('resumes persistence when clearing fails', async () => {
    showConfirm.mockResolvedValue(true);
    deleteValue.mockRejectedValue(new Error('x'));
    await expect(makeInstance().clearUserData()).rejects.toThrow('x');
    expect(suppressPersistence).toHaveBeenCalledTimes(1);
    expect(resumePersistence).toHaveBeenCalledTimes(1);
  });

  test('ignores a re-click during the erase (after the dialogs closed)', async () => {
    showConfirm.mockResolvedValue(true);
    let finishDelete;
    deleteValue.mockReturnValue(new Promise(resolve => { finishDelete = resolve; }));
    const instance = makeInstance();
    const first = instance.clearUserData();
    await vi.waitFor(() => expect(deleteValue).toHaveBeenCalledTimes(1));
    await instance.clearUserData();
    expect(showConfirm).toHaveBeenCalledTimes(2);
    expect(suppressPersistence).toHaveBeenCalledTimes(1);
    expect(deleteValue).toHaveBeenCalledTimes(1);
    finishDelete();
    await first;
    // after a successful erase the guard stays set until the reload
    await instance.clearUserData();
    expect(showConfirm).toHaveBeenCalledTimes(2);
  });

  test('after a failed erase, persistence is resumed once and a retry can run', async () => {
    showConfirm.mockResolvedValue(true);
    deleteValue.mockRejectedValueOnce(new Error('first')).mockResolvedValue(undefined);
    const instance = makeInstance();
    await expect(instance.clearUserData()).rejects.toThrow('first');
    expect(resumePersistence).toHaveBeenCalledTimes(1);
    await instance.clearUserData();
    expect(suppressPersistence).toHaveBeenCalledTimes(2);
    expect(resumePersistence).toHaveBeenCalledTimes(1);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  test('a cancelled erase can be started again', async () => {
    showConfirm.mockResolvedValueOnce(false).mockResolvedValue(true);
    const instance = makeInstance();
    await instance.clearUserData();
    await instance.clearUserData();
    expect(db.delete).toHaveBeenCalledTimes(1);
  });

  test('a failing file removal resumes persistence, reports, skips the reload path and can be retried', async () => {
    showConfirm.mockResolvedValue(true);
    const failure = new Error('EACCES');
    remove.mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const instance = makeInstance();
    await expect(instance.clearUserData()).rejects.toBe(failure);
    expect(resumePersistence).toHaveBeenCalledTimes(1);
    expect(showAlert).toHaveBeenCalledTimes(1);
    expect(showAlert.mock.calls[0][0]).toContain('EACCES');
    expect(db.delete).not.toHaveBeenCalled();
    await instance.clearUserData();
    expect(suppressPersistence).toHaveBeenCalledTimes(2);
    expect(db.delete).toHaveBeenCalledTimes(1);
  });
});
