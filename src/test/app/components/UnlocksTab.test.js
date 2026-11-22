import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react';

const store = {};
vi.mock('../../../js/app/common/context', () => ({
  getContext: vi.fn(key => store[key]),
  setContext: vi.fn(update => Object.assign(store, update)),
}));
vi.mock('../../../js/app/platform/auth', () => ({ getAuthStatus: vi.fn() }));
vi.mock('../../../js/app/platform/unlocks', () => ({ redeemUnlockCode: vi.fn() }));
vi.mock('keypress.js', () => ({
  keypress: { Listener: class { simple_combo() {} stop_listening() {} } },
}));

import UnlocksTab from '../../../js/app/components/menu/settings/UnlocksTab';
import { getAuthStatus } from '../../../js/app/platform/auth';
import { redeemUnlockCode } from '../../../js/app/platform/unlocks';

const rejection = cloudCode => Object.assign(new Error(cloudCode), { cloudCode });

async function redeem(code) {
  fireEvent.change(screen.getByLabelText('Unlock Code'), { target: { value: code } });
  await act(async () => fireEvent.click(screen.getByText('Redeem')));
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(store)) delete store[key];
  Object.assign(store, {
    inventory: ['tshirt'],
    unlockCodes: null,
    items: { tshirt: { displayName: 'T-Shirt' }, wand: { displayName: 'Wand' } },
  });
  getAuthStatus.mockResolvedValue({ state: 'signed_in', account: 'acct' });
  render(<UnlocksTab />);
});

describe('UnlocksTab', () => {
  test('a valid code grants the item and says so', async () => {
    redeemUnlockCode.mockResolvedValue({ account: 'acct', status: 'redeemed', itemKey: 'wand' });
    await redeem('GOOD');
    expect(screen.getByText('Redeemed: "Wand"!')).toBeInTheDocument();
    expect(store.inventory).toEqual(['tshirt', 'wand']);
    expect(store.unlockCodes).toEqual(['GOOD']);
  });

  test('an invalid code says so and grants nothing', async () => {
    redeemUnlockCode.mockResolvedValue({ account: 'acct', status: 'invalid_code', itemKey: null });
    await redeem('BAD');
    expect(screen.getByText('Invalid Code!')).toBeInTheDocument();
    expect(store.inventory).toEqual(['tshirt']);
  });

  test('an already redeemed code is reported, does not duplicate the item, and repairs a lost one', async () => {
    redeemUnlockCode.mockResolvedValue({ account: 'acct', status: 'already_redeemed', itemKey: 'wand' });
    store.unlockCodes = ['GOOD'];
    await redeem('GOOD');
    expect(screen.getByText('Code already redeemed!')).toBeInTheDocument();
    expect(store.inventory).toEqual(['tshirt', 'wand']);
    await redeem('GOOD');
    expect(store.inventory).toEqual(['tshirt', 'wand']);
  });

  test('signed out: asks to sign in and sends nothing', async () => {
    getAuthStatus.mockResolvedValue({ state: 'signed_out' });
    await redeem('GOOD');
    expect(screen.getByText(/Sign in/)).toBeInTheDocument();
    expect(redeemUnlockCode).not.toHaveBeenCalled();
  });

  test.each(['offline', 'server', 'unauthorized'])('%s: shows a connection message and can be retried', async code => {
    redeemUnlockCode.mockRejectedValueOnce(rejection(code));
    await redeem('GOOD');
    expect(screen.getByText(/Could not reach the server/)).toBeInTheDocument();
    expect(store.inventory).toEqual(['tshirt']);
    redeemUnlockCode.mockResolvedValueOnce({ account: 'acct', status: 'redeemed', itemKey: 'wand' });
    await act(async () => fireEvent.click(screen.getByText('Redeem')));
    expect(screen.getByText('Redeemed: "Wand"!')).toBeInTheDocument();
  });

  test('an item that is not installed does not throw', async () => {
    redeemUnlockCode.mockResolvedValue({ account: 'acct', status: 'redeemed', itemKey: 'ghost' });
    await redeem('GHOST');
    expect(screen.getByText(/not available in your installed content/)).toBeInTheDocument();
    expect(store.inventory).toEqual(['tshirt', 'ghost']);
  });

  test('repeated clicks send one request', async () => {
    let resolve;
    redeemUnlockCode.mockReturnValue(new Promise(r => { resolve = r; }));
    fireEvent.change(screen.getByLabelText('Unlock Code'), { target: { value: 'GOOD' } });
    const button = screen.getByText('Redeem');
    await act(async () => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(redeemUnlockCode).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ account: 'acct', status: 'redeemed', itemKey: 'wand' }));
    expect(store.inventory).toEqual(['tshirt', 'wand']);
  });
});
