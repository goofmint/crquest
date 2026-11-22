import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react';

vi.mock('../../../js/app/platform/auth', () => ({
  getAuthStatus: vi.fn(),
  onAuthStatusChange: vi.fn(),
}));
vi.mock('../../../js/app/platform/liveEvents', () => ({
  listLiveEvents: vi.fn(),
  getLiveEventRanking: vi.fn(),
  getLiveEventTeamRanking: vi.fn(),
  joinLiveEvent: vi.fn(),
  updateLiveEventParticipation: vi.fn(),
  getMyLiveEventStatus: vi.fn(),
}));

import LiveEventsSettings from '../../../js/app/components/menu/settings/LiveEventsSettings';
import { getAuthStatus, onAuthStatusChange } from '../../../js/app/platform/auth';
import {
  listLiveEvents,
  getLiveEventRanking,
  getLiveEventTeamRanking,
  joinLiveEvent,
  updateLiveEventParticipation,
  getMyLiveEventStatus,
} from '../../../js/app/platform/liveEvents';

const flush = () => new Promise(resolve => setImmediate(resolve));
const event = { eventId: 'e1', title: 'Spring Cup', startsAt: '2026-03-01T00:00:00Z', endsAt: '2026-03-02T00:00:00Z', phase: 'active', isOpen: true };
const signedIn = account => ({ state: 'signed_in', provider: 'github', account });
const signedOut = { state: 'signed_out', account: null };
const row = (rank, displayName, score) => ({ rank, displayName, score, achievementCount: 1 });
const notJoined = { joined: false, displayName: null, showInRanking: null, score: 0, achievementCount: 0, rank: null };

let emit;
async function mount(status, props = {}) {
  getAuthStatus.mockResolvedValue(status);
  const view = render(<LiveEventsSettings name="Player One" {...props} />);
  await act(flush);
  return view;
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.resetAllMocks();
  onAuthStatusChange.mockImplementation(listener => {
    emit = next => act(() => listener(next));
    return Promise.resolve(() => {});
  });
  listLiveEvents.mockResolvedValue([event]);
  getLiveEventRanking.mockResolvedValue({ rows: [row(1, 'Alice', 50), row(1, 'Bob', 50), row(3, 'Cy', 10)], total: 3 });
  getLiveEventTeamRanking.mockResolvedValue({ rows: [{ ...row(1, 'Team Alpha', 99), contributorCount: 4 }], total: 1 });
  getMyLiveEventStatus.mockResolvedValue(notJoined);
});

describe('LiveEventsSettings', () => {
  test('signed out: shows the event and the public ranking, asks to sign in, offers no form', async () => {
    await mount(signedOut);
    expect(screen.getByText('Spring Cup')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText(/Sign in on the Account tab to join/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Public display name')).toBeNull();
    expect(getMyLiveEventStatus).not.toHaveBeenCalled();
    // The public rankings are requested without any account argument.
    expect(getLiveEventRanking).toHaveBeenCalledWith('e1', { limit: 20, offset: 0 });
  });

  test('shows a loading line, then an error with a retry for the event list', async () => {
    const pending = deferred();
    listLiveEvents.mockReturnValueOnce(pending.promise);
    getAuthStatus.mockResolvedValue(signedOut);
    render(<LiveEventsSettings name="P" />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    await act(async () => pending.reject(Object.assign(new Error('offline'), { liveEventCode: 'offline' })));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })));
    expect(screen.getByText('Spring Cup')).toBeInTheDocument();
  });

  test('says so when there are no events', async () => {
    listLiveEvents.mockResolvedValue([]);
    await mount(signedOut);
    expect(screen.getByText('There are no live events right now.')).toBeInTheDocument();
  });

  test('joins with the player name only as the suggested display name, and the explicit choices are sent', async () => {
    await mount(signedIn('acct-a'));
    const input = screen.getByLabelText('Public display name');
    expect(input.value).toBe('Player One');
    expect(screen.getByText(/Your save, email address and sign-in details are never shown/)).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Ace' } });
    fireEvent.click(screen.getByLabelText('Show me in the individual ranking'));
    joinLiveEvent.mockResolvedValue({ account: 'acct-a', eventId: 'e1', displayName: 'Ace', showInRanking: false });
    getMyLiveEventStatus.mockResolvedValue({ joined: true, displayName: 'Ace', showInRanking: false, score: 0, achievementCount: 0, rank: null });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Join' })));
    expect(joinLiveEvent).toHaveBeenCalledWith('acct-a', 'e1', 'Ace', false);
    expect(screen.getByText('You joined the event.')).toBeInTheDocument();
    expect(screen.getByText('You are not listed in the ranking. Your score is 0 points.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test.each([
    ['event_closed', 'This event has ended'],
    ['not_eligible', 'You are not eligible'],
    ['invalid_display_name', 'Enter a display name'],
    ['already_participant', 'You have already joined'],
    ['account_changed', 'Another account is signed in'],
    [undefined, 'Something went wrong with live events.'],
  ])('a join refusal %s is shown as a readable alert', async (liveEventCode, text) => {
    await mount(signedIn('acct-a'));
    joinLiveEvent.mockRejectedValue(Object.assign(new Error('x'), { liveEventCode }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Join' })));
    expect(screen.getByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: 'Join' })).toBeEnabled();
  });

  test('disables the button while joining and while the name is blank', async () => {
    await mount(signedIn('acct-a'));
    const pending = deferred();
    joinLiveEvent.mockReturnValue(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled();
    await act(async () => pending.reject(new Error('x')));
    fireEvent.change(screen.getByLabelText('Public display name'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Join' })).toBeDisabled();
  });

  test('a participant sees the rank and can change the settings', async () => {
    getMyLiveEventStatus.mockResolvedValue({ joined: true, displayName: 'Ace', showInRanking: true, score: 50, achievementCount: 2, rank: 1 });
    await mount(signedIn('acct-a'));
    expect(screen.getByText('You are ranked 1 with 50 points.')).toBeInTheDocument();
    expect(screen.getByLabelText('Public display name').value).toBe('Ace');
    updateLiveEventParticipation.mockResolvedValue({ account: 'acct-a', eventId: 'e1', displayName: 'Ace', showInRanking: false });
    fireEvent.click(screen.getByLabelText('Show me in the individual ranking'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Save' })));
    expect(updateLiveEventParticipation).toHaveBeenCalledWith('acct-a', 'e1', { displayName: 'Ace', showInRanking: false });
    expect(screen.getByText('Your settings were saved.')).toBeInTheDocument();
  });

  test('switches to the team ranking and pages with previous and next', async () => {
    getLiveEventRanking.mockImplementation((id, { offset }) =>
      Promise.resolve({ rows: [row(offset + 1, `P${offset}`, 1)], total: 45 })
    );
    await mount(signedOut);
    expect(screen.getByText('P0')).toBeInTheDocument();
    expect(screen.getByText('1-20 of 45')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Next' })));
    expect(getLiveEventRanking).toHaveBeenLastCalledWith('e1', { limit: 20, offset: 20 });
    expect(screen.getByText('21-40 of 45')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Next' })));
    expect(screen.getByText('41-45 of 45')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Teams' })));
    expect(getLiveEventTeamRanking).toHaveBeenLastCalledWith('e1', { limit: 20, offset: 0 });
    expect(screen.getByText('Team Alpha')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Contributors' })).toBeInTheDocument();
  });

  test('a ranking error is announced with a retry', async () => {
    getLiveEventRanking.mockRejectedValueOnce(Object.assign(new Error('x'), { liveEventCode: 'server' }));
    await mount(signedOut);
    expect(screen.getByRole('alert')).toHaveTextContent('The server is busy');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })));
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  test('on an account change the previous status is dropped and its late answer is ignored', async () => {
    const lateA = deferred();
    getMyLiveEventStatus.mockImplementation(account =>
      account === 'acct-a'
        ? lateA.promise
        : Promise.resolve({ joined: true, displayName: 'Bee', showInRanking: true, score: 7, achievementCount: 1, rank: 2 })
    );
    await mount(signedIn('acct-a'));
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    await emit(signedIn('acct-b'));
    await act(flush);
    expect(getMyLiveEventStatus).toHaveBeenLastCalledWith('acct-b', 'e1');
    expect(screen.getByText('You are ranked 2 with 7 points.')).toBeInTheDocument();

    // The answer for the first account arrives late and must not replace it.
    await act(async () =>
      lateA.resolve({ joined: true, displayName: 'Aye', showInRanking: true, score: 999, achievementCount: 9, rank: 1 })
    );
    expect(screen.queryByText(/999/)).toBeNull();
    expect(screen.getByText('You are ranked 2 with 7 points.')).toBeInTheDocument();

    // Signing out drops the status and the form.
    await emit(signedOut);
    expect(screen.queryByText(/You are ranked/)).toBeNull();
    expect(screen.queryByLabelText('Public display name')).toBeNull();
  });

  test('a late ranking answer for a previous page is ignored', async () => {
    const first = deferred();
    getLiveEventRanking.mockReturnValueOnce(first.promise).mockResolvedValue({ rows: [row(1, 'Fresh', 5)], total: 1 });
    await mount(signedOut);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Teams' })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Players' })));
    await act(async () => first.resolve({ rows: [row(1, 'Stale', 1)], total: 1 }));
    expect(screen.queryByText('Stale')).toBeNull();
    expect(screen.getByText('Fresh')).toBeInTheDocument();
  });

  test('the name input stops the game hotkeys while focused', async () => {
    const onFocus = vi.fn();
    const onBlur = vi.fn();
    await mount(signedIn('acct-a'), { onFocus, onBlur });
    const input = screen.getByLabelText('Public display name');
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(onFocus).toHaveBeenCalledOnce();
    expect(onBlur).toHaveBeenCalledOnce();
  });

  test('a ranking retry does not refetch the participation or overwrite unsaved edits', async () => {
    getLiveEventRanking.mockRejectedValueOnce(Object.assign(new Error('x'), { liveEventCode: 'server' }));
    getMyLiveEventStatus.mockResolvedValue({ joined: true, displayName: 'Ace', showInRanking: true, score: 1, achievementCount: 1, rank: 1 });
    await mount(signedIn('acct-a'));
    fireEvent.change(screen.getByLabelText('Public display name'), { target: { value: 'Edited' } });
    expect(getMyLiveEventStatus).toHaveBeenCalledTimes(1);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })));
    expect(getMyLiveEventStatus).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Public display name').value).toBe('Edited');
  });

  test('Previous stays available on an empty page past the end', async () => {
    getLiveEventRanking.mockImplementation((id, { offset }) =>
      Promise.resolve(offset === 0 ? { rows: [row(1, 'A', 1)], total: 45 } : { rows: [], total: 0 })
    );
    await mount(signedOut);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Next' })));
    expect(screen.getByText('There are no entries yet.')).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Previous' })));
    expect(getLiveEventRanking).toHaveBeenLastCalledWith('e1', { limit: 20, offset: 0 });
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  test('the form is reset to defaults when another, not joined account signs in', async () => {
    getMyLiveEventStatus.mockImplementation(account =>
      Promise.resolve(
        account === 'acct-a'
          ? { joined: true, displayName: 'Ace', showInRanking: false, score: 1, achievementCount: 1, rank: null }
          : notJoined
      )
    );
    await mount(signedIn('acct-a'));
    expect(screen.getByLabelText('Public display name').value).toBe('Ace');
    await emit(signedIn('acct-b'));
    await act(flush);
    expect(screen.getByLabelText('Public display name').value).toBe('Player One');
    expect(screen.getByLabelText('Show me in the individual ranking')).toBeChecked();
  });
});
