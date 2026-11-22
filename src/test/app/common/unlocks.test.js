const store = {};
vi.mock('../../../js/app/common/context', () => ({
  getContext: vi.fn(key => store[key]),
  updateContext: vi.fn(compute => {
    const update = compute(store);
    if (update && Object.keys(update).length) Object.assign(store, update);
  }),
}));
vi.mock('../../../js/app/platform/auth', () => ({ getAuthStatus: vi.fn() }));
vi.mock('../../../js/app/platform/unlocks', () => ({ redeemUnlockCode: vi.fn() }));

import { redeemCode, grantUnlockedItem, OUTCOME } from '../../../js/app/common/unlocks';
import { updateContext } from '../../../js/app/common/context';
import { getAuthStatus } from '../../../js/app/platform/auth';
import { redeemUnlockCode } from '../../../js/app/platform/unlocks';

const signedIn = { state: 'signed_in', account: 'acct' };
const rejection = cloudCode => Object.assign(new Error(cloudCode), { cloudCode });

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(store)) delete store[key];
  Object.assign(store, { inventory: ['tshirt'], unlockCodes: null, items: { tshirt: {}, wand: { displayName: 'Wand' } } });
  getAuthStatus.mockResolvedValue(signedIn);
});

describe('redeemCode', () => {
  test('a valid code grants the item and records the code in one update', async () => {
    redeemUnlockCode.mockResolvedValue({ account: 'acct', status: 'redeemed', itemKey: 'wand' });
    await expect(redeemCode('  CODE ')).resolves.toEqual({
      outcome: OUTCOME.REDEEMED,
      itemKey: 'wand',
      installed: true,
    });
    expect(redeemUnlockCode).toHaveBeenCalledWith('acct', 'CODE');
    expect(updateContext).toHaveBeenCalledTimes(1);
    expect(store.inventory).toEqual(['tshirt', 'wand']);
    expect(store.unlockCodes).toEqual(['CODE']);
  });

  test('an invalid code grants nothing', async () => {
    redeemUnlockCode.mockResolvedValue({ account: 'acct', status: 'invalid_code', itemKey: null });
    await expect(redeemCode('NOPE')).resolves.toEqual({ outcome: OUTCOME.INVALID });
    expect(updateContext).not.toHaveBeenCalled();
  });

  test('a resend does not add the item twice, and repairs a lost one', async () => {
    redeemUnlockCode.mockResolvedValue({ account: 'acct', status: 'already_redeemed', itemKey: 'wand' });
    // The local copy still has everything: nothing changes.
    store.inventory = ['tshirt', 'wand'];
    store.unlockCodes = ['CODE'];
    expect((await redeemCode('CODE')).outcome).toBe(OUTCOME.ALREADY_REDEEMED);
    // The update computes to nothing: the state is unchanged.
    expect(updateContext.mock.results).toHaveLength(1);
    expect(store.inventory).toEqual(['tshirt', 'wand']);
    // The item was lost (e.g. a restore of an older save) while the code is still listed.
    store.inventory = ['tshirt'];
    expect((await redeemCode('CODE')).outcome).toBe(OUTCOME.ALREADY_REDEEMED);
    expect(store.inventory).toEqual(['tshirt', 'wand']);
    expect(store.unlockCodes).toEqual(['CODE']);
  });

  test('the local used-code list never stops the request', async () => {
    store.unlockCodes = ['CODE'];
    redeemUnlockCode.mockResolvedValue({ account: 'acct', status: 'already_redeemed', itemKey: 'wand' });
    await redeemCode('CODE');
    expect(redeemUnlockCode).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['signed out', { state: 'signed_out' }],
    ['expired', { state: 'expired', account: 'acct' }],
    ['unconfigured', { state: 'unconfigured' }],
    ['restoring', { state: 'restoring' }],
    ['no account', { state: 'signed_in' }],
  ])('%s: nothing is sent or granted', async (_name, status) => {
    getAuthStatus.mockResolvedValue(status);
    await expect(redeemCode('CODE')).resolves.toEqual({ outcome: OUTCOME.LOGIN_REQUIRED });
    expect(redeemUnlockCode).not.toHaveBeenCalled();
    expect(updateContext).not.toHaveBeenCalled();
  });

  test.each(['offline', 'server', 'unauthorized', 'rejected'])('%s grants nothing and can be retried', async code => {
    redeemUnlockCode.mockRejectedValueOnce(rejection(code));
    await expect(redeemCode('CODE')).resolves.toEqual({ outcome: OUTCOME.UNAVAILABLE });
    expect(updateContext).not.toHaveBeenCalled();
    redeemUnlockCode.mockResolvedValueOnce({ account: 'acct', status: 'redeemed', itemKey: 'wand' });
    expect((await redeemCode('CODE')).outcome).toBe(OUTCOME.REDEEMED);
  });

  test('the sign-in changed while the request was in flight: nothing is granted', async () => {
    redeemUnlockCode.mockResolvedValue({ account: 'acct', status: 'redeemed', itemKey: 'wand' });
    getAuthStatus.mockResolvedValueOnce(signedIn).mockResolvedValueOnce({ state: 'signed_in', account: 'other' });
    await expect(redeemCode('CODE')).resolves.toEqual({ outcome: OUTCOME.LOGIN_REQUIRED });
    getAuthStatus.mockResolvedValueOnce(signedIn).mockResolvedValueOnce({ state: 'signed_out' });
    expect((await redeemCode('CODE')).outcome).toBe(OUTCOME.LOGIN_REQUIRED);
    getAuthStatus.mockResolvedValueOnce(signedIn).mockRejectedValueOnce(new Error('boom'));
    expect((await redeemCode('CODE')).outcome).toBe(OUTCOME.UNAVAILABLE);
    expect(updateContext).not.toHaveBeenCalled();
  });

  test('a changed sign-in asks to sign in again', async () => {
    redeemUnlockCode.mockRejectedValue(rejection('account_changed'));
    expect((await redeemCode('CODE')).outcome).toBe(OUTCOME.LOGIN_REQUIRED);
    redeemUnlockCode.mockRejectedValue(rejection('signed_out'));
    expect((await redeemCode('CODE')).outcome).toBe(OUTCOME.LOGIN_REQUIRED);
  });

  test('an unreadable auth status or a malformed answer is unavailable, not an exception', async () => {
    getAuthStatus.mockRejectedValueOnce(new Error('boom'));
    expect((await redeemCode('CODE')).outcome).toBe(OUTCOME.UNAVAILABLE);
    redeemUnlockCode.mockResolvedValueOnce({ account: 'acct', status: 'redeemed', itemKey: null });
    expect((await redeemCode('CODE')).outcome).toBe(OUTCOME.UNAVAILABLE);
    redeemUnlockCode.mockResolvedValueOnce({ account: 'acct', status: 'surprise' });
    expect((await redeemCode('CODE')).outcome).toBe(OUTCOME.UNAVAILABLE);
    expect(updateContext).not.toHaveBeenCalled();
  });

  test('an item that is not installed is still recorded, without reading its name', async () => {
    redeemUnlockCode.mockResolvedValue({ account: 'acct', status: 'redeemed', itemKey: 'ghost' });
    await expect(redeemCode('CODE')).resolves.toEqual({
      outcome: OUTCOME.REDEEMED,
      itemKey: 'ghost',
      installed: false,
    });
    expect(store.inventory).toEqual(['tshirt', 'ghost']);
  });
});

describe('grantUnlockedItem', () => {
  test('works from an empty save (unlockCodes null)', () => {
    store.inventory = [];
    grantUnlockedItem('C', 'wand');
    expect(store.inventory).toEqual(['wand']);
    expect(store.unlockCodes).toEqual(['C']);
  });
});
