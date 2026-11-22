const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => invoke(...args) }));

import {
  listLiveEvents,
  getLiveEventRanking,
  getLiveEventTeamRanking,
  joinLiveEvent,
  updateLiveEventParticipation,
  getMyLiveEventStatus,
} from '../../../../js/app/platform/liveEvents';

describe('platform live events (Tauri)', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
  });

  test('public reads name no account and carry no token', async () => {
    await listLiveEvents();
    await getLiveEventRanking('e1');
    await getLiveEventTeamRanking('e1', { limit: 10, offset: 20 });
    expect(invoke.mock.calls).toEqual([
      ['live_events_list', undefined],
      ['live_events_ranking', { eventId: 'e1', limit: 50, offset: 0 }],
      ['live_events_team_ranking', { eventId: 'e1', limit: 10, offset: 20 }],
    ]);
  });

  test('participation calls name the expected account and the chosen public values only', async () => {
    await joinLiveEvent('acct', 'e1', 'Alice', true);
    await updateLiveEventParticipation('acct', 'e1', { showInRanking: false });
    await getMyLiveEventStatus('acct', 'e1');
    expect(invoke.mock.calls).toEqual([
      ['live_events_join', { expectedAccount: 'acct', eventId: 'e1', displayName: 'Alice', showInRanking: true }],
      ['live_events_update', { expectedAccount: 'acct', eventId: 'e1', displayName: null, showInRanking: false }],
      ['live_events_status', { expectedAccount: 'acct', eventId: 'e1' }],
    ]);
  });

  test.each([
    'offline',
    'account_changed',
    'signed_out',
    'server',
    'unauthorized',
    'rejected',
    'event_not_found',
    'event_closed',
    'not_eligible',
    'invalid_display_name',
    'already_participant',
    'not_participant',
  ])('a rejection %s keeps its machine-readable code', async liveEventCode => {
    invoke.mockRejectedValue(liveEventCode);
    const error = await joinLiveEvent('acct', 'e1', 'A', true).catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.liveEventCode).toBe(liveEventCode);
  });

  test('a rejection with free text does not become a code', async () => {
    invoke.mockRejectedValue('Command live_events_list not allowed by ACL');
    const error = await listLiveEvents().catch(e => e);
    expect(error.liveEventCode).toBeUndefined();
  });
});
