const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => invoke(...args) }));

import { redeemUnlockCode } from '../../../../js/app/platform/unlocks';
import { recordTreePlanting } from '../../../../js/app/platform/treePlanting';

describe('platform unlock codes and tree planting (Tauri)', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  test('redeems a code through the native command with the expected account only', async () => {
    invoke.mockResolvedValueOnce({ account: 'acct', status: 'redeemed', itemKey: 'wand' });
    await expect(redeemUnlockCode('acct', 'CODE')).resolves.toEqual({
      account: 'acct',
      status: 'redeemed',
      itemKey: 'wand',
    });
    expect(invoke.mock.calls).toEqual([['unlock_code_redeem', { expectedAccount: 'acct', code: 'CODE' }]]);
  });

  test('records a planting through the native command', async () => {
    invoke.mockResolvedValueOnce({ account: 'acct', status: 'recorded' });
    await expect(recordTreePlanting('acct', 'fog_owl', 'owl_plant_tree1')).resolves.toEqual({
      account: 'acct',
      status: 'recorded',
    });
    expect(invoke.mock.calls).toEqual([
      ['tree_planting_record', { expectedAccount: 'acct', missionId: 'fog_owl', targetId: 'owl_plant_tree1' }],
    ]);
  });

  test.each(['signed_out', 'account_changed', 'offline', 'server', 'unauthorized', 'rejected'])(
    'a rejection %s keeps its machine-readable code',
    async cloudCode => {
      invoke.mockRejectedValue(cloudCode);
      const redeem = await redeemUnlockCode('acct', 'CODE').catch(e => e);
      const plant = await recordTreePlanting('acct', 'm', 't').catch(e => e);
      for (const error of [redeem, plant]) {
        expect(error).toBeInstanceOf(Error);
        expect(error.cloudCode).toBe(cloudCode);
      }
    }
  );

  test('a rejection with free text does not become a code', async () => {
    invoke.mockRejectedValue('Command unlock_code_redeem not allowed by ACL');
    expect((await redeemUnlockCode('acct', 'CODE').catch(e => e)).cloudCode).toBeUndefined();
    expect((await recordTreePlanting('acct', 'm', 't').catch(e => e)).cloudCode).toBeUndefined();
  });
});
