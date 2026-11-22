const invoke = vi.fn();
const listen = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args) => invoke(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: (...args) => listen(...args) }));

import { getAuthStatus, startLogin, cancelLogin, logout, onAuthStatusChange } from '../../../../js/app/platform/auth';

describe('platform auth (Tauri)', () => {
  beforeEach(() => {
    invoke.mockReset();
    listen.mockReset();
  });

  test('wraps the four commands', async () => {
    invoke.mockResolvedValue({ state: 'signed_out' });
    await expect(getAuthStatus()).resolves.toEqual({ state: 'signed_out' });
    await startLogin('github');
    await cancelLogin();
    await logout();
    expect(invoke.mock.calls).toEqual([
      ['auth_status', undefined],
      ['auth_start_login', { provider: 'github' }],
      ['auth_cancel_login', undefined],
      ['auth_logout', undefined],
    ]);
  });

  test('rejections become Errors that keep the machine-readable code', async () => {
    invoke.mockRejectedValue('browser_open_failed');
    const error = await startLogin('google').catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.authCode).toBe('browser_open_failed');
  });

  test('a rejection with free text does not become a code', async () => {
    invoke.mockRejectedValue('Command auth_status not allowed by ACL');
    const error = await getAuthStatus().catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.authCode).toBeUndefined();
  });

  test('onAuthStatusChange passes the payload and resolves with the unlisten function', async () => {
    const unlisten = vi.fn();
    listen.mockResolvedValue(unlisten);
    const listener = vi.fn();
    await expect(onAuthStatusChange(listener)).resolves.toBe(unlisten);
    expect(listen).toHaveBeenCalledWith('auth://status-changed', expect.any(Function));
    listen.mock.calls[0][1]({ payload: { state: 'pending' } });
    expect(listener).toHaveBeenCalledWith({ state: 'pending' });
  });
});
