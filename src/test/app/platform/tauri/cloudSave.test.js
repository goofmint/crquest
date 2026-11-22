const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => invoke(...args) }));

import { fetchCloudSave, uploadCloudSave } from '../../../../js/app/platform/cloudSave';

describe('platform cloud save (Tauri)', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  test('calls the two native commands with the expected account and nothing secret', async () => {
    invoke.mockResolvedValueOnce(null).mockResolvedValueOnce({ account: 'a', revision: 1, updatedAt: 't' });
    await expect(fetchCloudSave('acct')).resolves.toBeNull();
    await uploadCloudSave('acct', { xp: 1 }, 1);
    expect(invoke.mock.calls).toEqual([
      ['cloud_save_fetch', { expectedAccount: 'acct' }],
      ['cloud_save_upload', { expectedAccount: 'acct', data: { xp: 1 }, schemaVersion: 1 }],
    ]);
  });

  test.each(['offline', 'account_changed', 'signed_out', 'server', 'unauthorized', 'rejected', 'too_large'])(
    'a rejection %s keeps its machine-readable code',
    async cloudCode => {
      invoke.mockRejectedValue(cloudCode);
      const error = await fetchCloudSave('acct').catch(e => e);
      expect(error).toBeInstanceOf(Error);
      expect(error.cloudCode).toBe(cloudCode);
    }
  );

  test('a rejection with free text does not become a code', async () => {
    invoke.mockRejectedValue('Command cloud_save_fetch not allowed by ACL');
    const error = await uploadCloudSave('acct', {}, 1).catch(e => e);
    expect(error.cloudCode).toBeUndefined();
  });
});
