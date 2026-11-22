import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const setContext = vi.fn();
vi.mock('../../../../js/app/common/context', () => ({ setContext: (...a) => setContext(...a) }));
const store = new Map();
vi.mock('../../../../js/app/platform/store', () => ({
  getValueAsync: vi.fn(async key => store.get(key)),
  setValueAsync: vi.fn(async (key, value) => void store.set(key, value)),
  deleteValueAsync: vi.fn(async key => void store.delete(key)),
}));

import { requestChoice, submitChoice, dismissChoice, CHOICE_OVERLAY_KEY } from '../../../../js/app/common/cloudSave/choice';
import { loadSyncState, saveSyncState, clearSyncState, SYNC_STATE_KEY } from '../../../../js/app/common/cloudSave/syncState';
import { getSyncStatus, setSyncStatus, subscribeSyncStatus } from '../../../../js/app/common/cloudSave/statusStore';
import CloudSaveChoice from '../../../../js/app/components/CloudSaveChoice';

const summaries = { local: { xp: 10, objectives: 2 }, cloud: { xp: 99, objectives: 5, updatedAt: '2026-01-02T03:04:05Z' } };

beforeEach(() => {
  setContext.mockClear();
  store.clear();
});

describe('choice broker', () => {
  test('shows the overlay and resolves with the answer', async () => {
    const answer = requestChoice(summaries);
    expect(setContext).toHaveBeenCalledWith({ overlayComponent: { key: CHOICE_OVERLAY_KEY, props: summaries } });
    submitChoice('local');
    await expect(answer).resolves.toBe('local');
    submitChoice('cloud'); // a second answer is ignored
  });

  test('dismissing resolves "dismissed" and closes the overlay', async () => {
    const answer = requestChoice(summaries);
    setContext.mockClear();
    dismissChoice();
    await expect(answer).resolves.toBe('dismissed');
    expect(setContext).toHaveBeenCalledWith({ overlayComponent: '' });
    setContext.mockClear();
    dismissChoice(); // nothing open: nothing happens
    expect(setContext).not.toHaveBeenCalled();
  });

  test('a new question dismisses the previous one', async () => {
    const first = requestChoice(summaries);
    const second = requestChoice(summaries);
    await expect(first).resolves.toBe('dismissed');
    submitChoice('cloud');
    await expect(second).resolves.toBe('cloud');
  });
});

describe('CloudSaveChoice overlay', () => {
  test('shows both saves and answers with the three buttons', async () => {
    const hide = vi.fn();
    for (const [label, expected] of [
      ['Use the cloud save', 'cloud'],
      ["Use this computer's save", 'local'],
      ['Cancel and sign out', 'cancel'],
    ]) {
      const answer = requestChoice(summaries);
      const { unmount } = render(<CloudSaveChoice {...summaries} hide={hide} />);
      expect(screen.getByText('10 XP, 2 objectives completed')).toBeInTheDocument();
      expect(screen.getByText('99 XP, 5 objectives completed')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: label }));
      await expect(answer).resolves.toBe(expected);
      unmount();
    }
    expect(hide).toHaveBeenCalledTimes(3);
  });
});

describe('sync state', () => {
  test('defaults when nothing or garbage is stored', async () => {
    const empty = { boundAccount: null, ackRevision: 0, dirty: false, restoreInProgress: null };
    expect(await loadSyncState()).toEqual(empty);
    store.set(SYNC_STATE_KEY, 'garbage');
    expect(await loadSyncState()).toEqual(empty);
    store.set(SYNC_STATE_KEY, { boundAccount: 5, ackRevision: 'x', dirty: 'yes', restoreInProgress: { revision: 1 } });
    expect(await loadSyncState()).toEqual(empty);
  });

  test('round trips and is cleared', async () => {
    const state = { boundAccount: 'a', ackRevision: 3, dirty: true, restoreInProgress: { account: 'a', revision: 4 } };
    await saveSyncState(state);
    expect(await loadSyncState()).toEqual(state);
    await clearSyncState();
    expect(store.has(SYNC_STATE_KEY)).toBe(false);
  });
});

describe('status store', () => {
  test('notifies subscribers only on change', () => {
    const listener = vi.fn();
    const stop = subscribeSyncStatus(listener);
    setSyncStatus('syncing');
    setSyncStatus('syncing');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSyncStatus()).toBe('syncing');
    stop();
    setSyncStatus('synced');
    expect(listener).toHaveBeenCalledTimes(1);
    setSyncStatus('signed_out');
  });
});

describe('CloudSaveChoice display transitions', () => {
  test.each(['showing', 'hiding'])('calls finishTransition while %s', state => {
    const finishTransition = vi.fn();
    render(<CloudSaveChoice {...summaries} hide={vi.fn()} displayFsmState={state} finishTransition={finishTransition} />);
    expect(finishTransition).toHaveBeenCalledTimes(1);
  });

  test.each(['shown', 'hidden'])('does not call it when %s', state => {
    const finishTransition = vi.fn();
    render(<CloudSaveChoice {...summaries} hide={vi.fn()} displayFsmState={state} finishTransition={finishTransition} />);
    expect(finishTransition).not.toHaveBeenCalled();
  });
});
