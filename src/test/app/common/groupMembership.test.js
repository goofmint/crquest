const store = {};
vi.mock('../../../js/app/common/context', () => ({
  getContext: vi.fn(key => store[key]),
  updateContext: vi.fn(compute => {
    const update = compute(store);
    if (update && Object.keys(update).length) Object.assign(store, update);
  }),
}));
vi.mock('../../../js/app/platform/auth', () => ({ getAuthStatus: vi.fn() }));
vi.mock('../../../js/app/platform/groups', () => ({
  joinGroup: vi.fn(),
  leaveGroup: vi.fn(),
  listGroups: vi.fn(),
}));
vi.mock('../../../js/app/i18n', () => ({ t: key => key }));

import { joinByCode, leaveGroupEntry, OUTCOME } from '../../../js/app/common/groupMembership';
import { joinTeam, disconnectTeam } from '../../../js/app/common/teams';
import { joinOperation } from '../../../js/app/common/operations';
import { getAuthStatus } from '../../../js/app/platform/auth';
import { joinGroup, leaveGroup, listGroups } from '../../../js/app/platform/groups';

const GID = '123e4567-e89b-12d3-a456-426614174000';
const signedIn = { state: 'signed_in', account: 'acct' };
const rejection = groupCode => Object.assign(new Error(groupCode), { groupCode });
const joined = { account: 'acct', groupId: GID, displayName: 'Owls', joinCode: 'OWL123' };

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(store)) delete store[key];
  Object.assign(store, { teams: { joined: [] }, operations: { joined: [] } });
  getAuthStatus.mockResolvedValue(signedIn);
});

describe('joinByCode', () => {
  test('joins through the server and saves the entry locally', async () => {
    joinGroup.mockResolvedValue(joined);
    await expect(joinByCode('team', '  owl123 ')).resolves.toEqual({
      outcome: OUTCOME.JOINED,
      displayName: 'Owls',
    });
    expect(joinGroup).toHaveBeenCalledWith('acct', 'team', 'owl123');
    expect(store.teams.joined).toEqual([{ id: GID, joinCode: 'OWL123', displayName: 'Owls' }]);
    expect(store.operations.joined).toEqual([]);
  });

  test('signed out: nothing is sent and nothing is joined', async () => {
    getAuthStatus.mockResolvedValue({ state: 'signed_out' });
    await expect(joinByCode('team', 'OWL123')).resolves.toEqual({ outcome: OUTCOME.LOGIN_REQUIRED });
    expect(joinGroup).not.toHaveBeenCalled();
    expect(store.teams.joined).toEqual([]);
  });

  test('a local entry is not trusted: the server is asked, and already_member reports already joined', async () => {
    store.teams.joined = [{ id: GID, joinCode: 'OWL123', displayName: 'Owls' }];
    joinGroup.mockRejectedValue(rejection('already_member'));
    listGroups.mockResolvedValue({ account: 'acct', groups: [{ groupId: GID, displayName: 'Owls', joinCode: 'OWL123' }] });
    await expect(joinByCode('team', 'owl123')).resolves.toEqual({ outcome: OUTCOME.ALREADY_JOINED });
    expect(joinGroup).toHaveBeenCalled();
  });

  test('a legacy entry with the same normalized code is replaced by the server record', async () => {
    store.teams.joined = [
      { id: 'other', joinCode: 'ZZZ', displayName: 'Other' },
      { id: 'legacy-id', joinCode: 'owl123', displayName: 'Old' },
    ];
    joinGroup.mockResolvedValue(joined);
    await joinByCode('team', 'OWL123');
    expect(store.teams.joined).toEqual([
      { id: 'other', joinCode: 'ZZZ', displayName: 'Other' },
      { id: GID, joinCode: 'OWL123', displayName: 'Owls' },
    ]);
  });

  test('the already_member restore also replaces a legacy entry with the same code', async () => {
    store.teams.joined = [{ id: 'legacy-id', joinCode: 'OWL123', displayName: 'Old' }];
    joinGroup.mockRejectedValue(rejection('already_member'));
    listGroups.mockResolvedValue({ account: 'acct', groups: [{ groupId: GID, displayName: 'Owls', joinCode: 'OWL123' }] });
    await joinByCode('team', 'OWL123');
    expect(store.teams.joined).toEqual([{ id: GID, joinCode: 'OWL123', displayName: 'Owls' }]);
  });

  test('an entry left by another account does not stop the current account from joining', async () => {
    store.teams.joined = [{ id: GID, joinCode: 'OWL123', displayName: 'Owls' }];
    joinGroup.mockResolvedValue(joined);
    expect((await joinByCode('team', 'OWL123')).outcome).toBe(OUTCOME.JOINED);
    expect(joinGroup).toHaveBeenCalledWith('acct', 'team', 'OWL123');
    expect(store.teams.joined).toHaveLength(1);
  });

  test('server refusals and failures join nothing', async () => {
    joinGroup.mockRejectedValueOnce(rejection('invalid_join_code'));
    expect((await joinByCode('team', 'NOPE12')).outcome).toBe(OUTCOME.INVALID_CODE);
    joinGroup.mockRejectedValueOnce(rejection('offline'));
    expect((await joinByCode('team', 'OWL123')).outcome).toBe(OUTCOME.UNAVAILABLE);
    joinGroup.mockRejectedValueOnce(rejection('account_changed'));
    expect((await joinByCode('team', 'OWL123')).outcome).toBe(OUTCOME.LOGIN_REQUIRED);
    expect(store.teams.joined).toEqual([]);
  });

  test('an answer for another account than the current one is not saved', async () => {
    joinGroup.mockResolvedValue({ ...joined, account: 'other' });
    expect((await joinByCode('team', 'OWL123')).outcome).toBe(OUTCOME.LOGIN_REQUIRED);
    expect(store.teams.joined).toEqual([]);
  });

  test('a malformed answer joins nothing', async () => {
    joinGroup.mockResolvedValue({ account: 'acct' });
    expect((await joinByCode('team', 'OWL123')).outcome).toBe(OUTCOME.UNAVAILABLE);
  });

  test('already a member on the server: the lost local entry is restored from the list', async () => {
    joinGroup.mockRejectedValue(rejection('already_member'));
    listGroups.mockResolvedValue({
      account: 'acct',
      groups: [{ groupId: GID, displayName: 'Owls', joinCode: 'OWL123' }],
    });
    await expect(joinByCode('team', 'owl123')).resolves.toEqual({
      outcome: OUTCOME.JOINED,
      displayName: 'Owls',
    });
    expect(listGroups).toHaveBeenCalledWith('acct', 'team');
    expect(store.teams.joined).toHaveLength(1);
  });
});

describe('leaveGroupEntry', () => {
  const entry = { id: GID, joinCode: 'OWL123', displayName: 'Owls' };

  test('removes the local entry after the server confirmed', async () => {
    store.teams.joined = [entry];
    leaveGroup.mockResolvedValue({ account: 'acct' });
    await expect(leaveGroupEntry('team', entry)).resolves.toEqual({ outcome: OUTCOME.LEFT });
    expect(leaveGroup).toHaveBeenCalledWith('acct', GID);
    expect(store.teams.joined).toEqual([]);
  });

  test('an account switch during the leave keeps the shared list unchanged', async () => {
    store.teams.joined = [entry];
    leaveGroup.mockResolvedValue({ account: 'acct' });
    getAuthStatus.mockResolvedValueOnce(signedIn).mockResolvedValue({ state: 'signed_in', account: 'other' });
    expect((await leaveGroupEntry('team', entry)).outcome).toBe(OUTCOME.LOGIN_REQUIRED);
    expect(store.teams.joined).toEqual([entry]);
  });

  test('not a member on the server: only the local entry is left, and it is removed', async () => {
    store.teams.joined = [entry];
    leaveGroup.mockRejectedValue(rejection('not_member'));
    expect((await leaveGroupEntry('team', entry)).outcome).toBe(OUTCOME.LEFT);
    expect(store.teams.joined).toEqual([]);
  });

  test('signed out or offline keeps the entry so that no server membership is orphaned', async () => {
    store.teams.joined = [entry];
    getAuthStatus.mockResolvedValue({ state: 'signed_out' });
    expect((await leaveGroupEntry('team', entry)).outcome).toBe(OUTCOME.LOGIN_REQUIRED);
    getAuthStatus.mockResolvedValue(signedIn);
    leaveGroup.mockRejectedValue(rejection('offline'));
    expect((await leaveGroupEntry('team', entry)).outcome).toBe(OUTCOME.UNAVAILABLE);
    expect(store.teams.joined).toEqual([entry]);
  });

  test('an entry of the former backend never was a server membership: removed locally', async () => {
    const legacy = { id: 'legacy-id', joinCode: 'OLD', displayName: 'Old' };
    store.teams.joined = [legacy];
    getAuthStatus.mockResolvedValue({ state: 'signed_out' });
    expect((await leaveGroupEntry('team', legacy)).outcome).toBe(OUTCOME.REMOVED_LOCALLY);
    expect(leaveGroup).not.toHaveBeenCalled();
    expect(store.teams.joined).toEqual([]);
  });
});

describe('the settings screens adapters', () => {
  test('joinTeam / joinOperation answer with a message and keep the success flag', async () => {
    expect(await joinTeam('')).toEqual({ success: false, message: 'ui.membership.codeRequired' });
    joinGroup.mockResolvedValue(joined);
    expect(await joinTeam('OWL123')).toEqual({ success: true, message: 'ui.membership.joined' });
    joinGroup.mockRejectedValueOnce(rejection('already_member'));
    listGroups.mockResolvedValueOnce({ account: 'acct', groups: [{ groupId: GID, displayName: 'Owls', joinCode: 'OWL123' }] });
    expect(await joinTeam('OWL123')).toEqual({ success: false, message: 'ui.teams.already' });
    joinGroup.mockRejectedValue(rejection('invalid_join_code'));
    expect(await joinOperation('ZZZ999')).toEqual({ success: false, message: 'ui.operations.missing' });
    getAuthStatus.mockResolvedValue({ state: 'signed_out' });
    expect(await joinOperation('ZZZ999')).toEqual({ success: false, message: 'ui.membership.loginRequired' });
  });

  test('disconnectTeam reports a failed leave with a message', async () => {
    store.teams.joined = [{ id: GID, joinCode: 'OWL123', displayName: 'Owls' }];
    leaveGroup.mockRejectedValue(rejection('server'));
    expect(await disconnectTeam({ id: GID })).toEqual({ success: false, message: 'ui.membership.leaveFailed' });
    getAuthStatus.mockResolvedValue({ state: 'signed_out' });
    expect(await disconnectTeam({ id: GID })).toEqual({
      success: false,
      message: 'ui.membership.leaveLoginRequired',
    });
  });
});
