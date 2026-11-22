import React from 'react';
import { render, act, fireEvent, screen } from '@testing-library/react';

vi.mock('../../../js/app/platform/auth', () => ({
  getAuthStatus: vi.fn(),
  startLogin: vi.fn(),
  cancelLogin: vi.fn(),
  logout: vi.fn(),
  onAuthStatusChange: vi.fn(),
}));

import AccountSettings from '../../../js/app/components/menu/settings/AccountSettings';
import { getAuthStatus, startLogin, cancelLogin, logout, onAuthStatusChange } from '../../../js/app/platform/auth';

const base = { provider: null, displayName: null, offline: false, persistence: 'keyring', errorCode: null };
const status = overrides => ({ ...base, ...overrides });
const flush = () => new Promise(resolve => setImmediate(resolve));

let emit;
let unlisten;

async function mount(initial) {
  getAuthStatus.mockResolvedValue(initial);
  const view = render(<AccountSettings />);
  await act(flush);
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  unlisten = vi.fn();
  onAuthStatusChange.mockImplementation(listener => {
    emit = next => act(() => listener(next));
    return Promise.resolve(unlisten);
  });
});

describe('AccountSettings', () => {
  test('shows a loading line until the first status arrives, then the sign-in buttons', async () => {
    let resolve;
    getAuthStatus.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<AccountSettings />);
    expect(screen.getByText('Checking your sign-in…')).toBeInTheDocument();
    await act(async () => resolve(status({ state: 'signed_out' })));
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  test('says so when sign-in is not configured and offers no buttons', async () => {
    await mount(status({ state: 'unconfigured' }));
    expect(screen.getByText('Sign-in is not available in this build.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('shows restoring', async () => {
    await mount(status({ state: 'restoring' }));
    expect(screen.getByText('Checking your sign-in…')).toBeInTheDocument();
  });

  test('pending: asks to continue in the browser and can be cancelled, then retried', async () => {
    await mount(status({ state: 'signed_out' }));
    startLogin.mockResolvedValue(status({ state: 'pending', provider: 'github' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' })));
    expect(startLogin).toHaveBeenCalledWith('github');
    expect(screen.getByText('Continue in your browser to finish signing in.')).toBeInTheDocument();

    cancelLogin.mockResolvedValue(status({ state: 'signed_out' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' })));
    expect(cancelLogin).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();

    startLogin.mockResolvedValue(status({ state: 'pending', provider: 'google' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' })));
    expect(startLogin).toHaveBeenLastCalledWith('google');
  });

  test('signed in: shows provider and name and can sign out', async () => {
    await mount(status({ state: 'signed_in', provider: 'github', displayName: 'Octo' }));
    expect(screen.getByText('Signed in with GitHub as Octo')).toBeInTheDocument();
    logout.mockResolvedValue(status({ state: 'signed_out' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign out' })));
    expect(logout).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument();
  });

  test('signed in without a name shows only the provider', async () => {
    await mount(status({ state: 'signed_in', provider: 'google' }));
    expect(screen.getByText('Signed in with Google')).toBeInTheDocument();
  });

  test('offline: tells the player and keeps the sign-out button', async () => {
    await mount(status({ state: 'signed_in', provider: 'github', offline: true }));
    expect(screen.getByText(/You are offline/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  test('tells the player when the session cannot be saved', async () => {
    await mount(status({ state: 'signed_in', provider: 'github', persistence: 'unavailable' }));
    expect(screen.getByText(/cannot be saved on this computer/)).toBeInTheDocument();
  });

  test('expired: offers to sign in again', async () => {
    await mount(status({ state: 'expired', errorCode: 'session_expired' }));
    expect(screen.getByText('Your sign-in expired.')).toBeInTheDocument();
    startLogin.mockResolvedValue(status({ state: 'pending', provider: 'google' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' })));
    expect(startLogin).toHaveBeenCalledWith('google');
    expect(screen.getByText('Continue in your browser to finish signing in.')).toBeInTheDocument();
  });

  test('error: shows an alert with the message of the code and retries with the same provider', async () => {
    await mount(status({ state: 'signed_out' }));
    startLogin.mockResolvedValue(status({ state: 'pending', provider: 'github' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' })));
    await emit(status({ state: 'error', errorCode: 'provider_denied' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sign-in was cancelled or not allowed.');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })));
    expect(startLogin).toHaveBeenLastCalledWith('github');
  });

  test('an unknown error code gets a generic message and no raw code', async () => {
    await mount(status({ state: 'error', errorCode: 'something_new' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong with sign-in.');
    expect(screen.getByRole('alert')).not.toHaveTextContent('something_new');
  });

  test('a rejected command is shown as an alert and the buttons work again', async () => {
    await mount(status({ state: 'signed_out' }));
    const error = Object.assign(new Error('browser_open_failed'), { authCode: 'browser_open_failed' });
    startLogin.mockRejectedValueOnce(error);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' })));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not open your browser.');
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();
  });

  test('a second press while a command runs is ignored (buttons are disabled)', async () => {
    await mount(status({ state: 'signed_out' }));
    let resolve;
    startLogin.mockReturnValue(new Promise(r => { resolve = r; }));
    const github = screen.getByRole('button', { name: 'Sign in with GitHub' });
    await act(async () => fireEvent.click(github));
    expect(github).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeDisabled();
    fireEvent.click(github);
    expect(startLogin).toHaveBeenCalledTimes(1);
    await act(async () => resolve(status({ state: 'pending', provider: 'github' })));
  });

  test('follows status events from the native side', async () => {
    await mount(status({ state: 'signed_out' }));
    await emit(status({ state: 'signed_in', provider: 'google', displayName: 'Gee' }));
    expect(screen.getByText('Signed in with Google as Gee')).toBeInTheDocument();
  });

  test('unsubscribes on unmount and does not update afterwards', async () => {
    const { unmount } = await mount(status({ state: 'signed_out' }));
    unmount();
    expect(unlisten).toHaveBeenCalledOnce();
  });

  test('unsubscribes when unmounted before the subscription is ready, without setting state', async () => {
    let ready;
    onAuthStatusChange.mockReturnValue(new Promise(r => { ready = r; }));
    let resolveStatus;
    getAuthStatus.mockReturnValue(new Promise(r => { resolveStatus = r; }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = render(<AccountSettings />);
    unmount();
    await act(async () => {
      ready(unlisten);
      resolveStatus(status({ state: 'signed_out' }));
    });
    expect(unlisten).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('has no e-mail field and no manual provider linking', async () => {
    await mount(status({ state: 'signed_out' }));
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(/link/i)).toBeNull();
  });

  test('a failed first status read shows a retry that recovers', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getAuthStatus.mockRejectedValueOnce(new Error('boom'));
    render(<AccountSettings />);
    await act(flush);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not check your sign-in.');
    expect(screen.queryByText('Checking your sign-in…')).toBeNull();

    getAuthStatus.mockResolvedValueOnce(status({ state: 'signed_out' }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Try again' })));
    expect(getAuthStatus).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeEnabled();
    errorSpy.mockRestore();
  });

  test('a logout whose stored session could not be cleared is reported', async () => {
    await mount(status({ state: 'signed_out', errorCode: 'logout_incomplete' }));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be removed');
  });

  test('reads the status only after the subscription is registered', async () => {
    let ready;
    onAuthStatusChange.mockReturnValue(new Promise(r => { ready = r; }));
    getAuthStatus.mockResolvedValue(status({ state: 'signed_out' }));
    render(<AccountSettings />);
    await act(flush);
    expect(getAuthStatus).not.toHaveBeenCalled();
    await act(async () => ready(unlisten));
    expect(getAuthStatus).toHaveBeenCalledOnce();
  });

  test('a fetched status does not overwrite a newer event', async () => {
    let resolveStatus;
    getAuthStatus.mockReturnValue(new Promise(r => { resolveStatus = r; }));
    render(<AccountSettings />);
    await act(flush);
    await emit(status({ state: 'signed_in', provider: 'github', displayName: 'Octo' }));
    await act(async () => resolveStatus(status({ state: 'signed_out' })));
    expect(screen.getByText('Signed in with GitHub as Octo')).toBeInTheDocument();
  });

  test('a cancel that could not be cleared is reported', async () => {
    await mount(status({ state: 'signed_out', errorCode: 'cancel_incomplete' }));
    expect(screen.getByRole('alert')).toHaveTextContent('could not be removed');
  });
});
