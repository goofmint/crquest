import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthStatus, startLogin, cancelLogin, logout, onAuthStatusChange } from '../../../platform/auth';
import { getSyncStatus, subscribeSyncStatus } from '../../../common/cloudSave/statusStore';
import { t } from '../../../i18n';

const SYNC_STATUSES = ['synced', 'syncing', 'offline', 'error', 'choosing', 'unsupported'];
const PROVIDERS = ['github', 'google'];
const ERROR_CODES = [
  'provider_denied',
  'provider_error',
  'login_timed_out',
  'network',
  'session_expired',
  'exchange_failed',
  'browser_open_failed',
  'keyring_unavailable',
  'logout_incomplete',
  'cancel_incomplete',
];

function errorMessage(code) {
  return t(`settings.account.errors.${ERROR_CODES.includes(code) ? code : 'unknown'}`);
}

/**
 * Optional sign-in. Holds only the secret-free status from the native side;
 * nothing here touches the game context or the saved game data, and the
 * game never waits for it.
 */
export default function AccountSettings() {
  // null until the first status arrives
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [commandError, setCommandError] = useState(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [lastProvider, setLastProvider] = useState(null);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());
  const mounted = useRef(true);
  // Set once an event arrived: a status fetched earlier must not overwrite it.
  const eventSeen = useRef(false);

  // Initial read of the status. A failure here (nothing to show yet) is not
  // a command error: it gets its own message and a retry.
  const loadStatus = useCallback(() => {
    setLoadFailed(false);
    getAuthStatus().then(
      next => {
        if (mounted.current && !eventSeen.current) setStatus(next);
      },
      error => {
        console.error('Could not read the sign-in status', error);
        if (mounted.current && !eventSeen.current) setLoadFailed(true);
      }
    );
  }, []);

  useEffect(() => {
    // Subscribe first, then read: a change in between is not missed.
    const unsubscribe = subscribeSyncStatus(setSyncStatus);
    setSyncStatus(getSyncStatus());
    return unsubscribe;
  }, []);

  useEffect(() => {
    mounted.current = true;
    let unlisten = null;
    eventSeen.current = false;
    // Subscribe first, read the status once the subscription is registered:
    // nothing that changes in between is missed.
    onAuthStatusChange(next => {
      if (mounted.current) {
        eventSeen.current = true;
        setStatus(next);
        setLoadFailed(false);
        setCommandError(null);
      }
    }).then(
      stop => {
        // Unmounted before the subscription was ready: stop it right away.
        if (mounted.current) {
          unlisten = stop;
          loadStatus();
        } else {
          stop();
        }
      },
      error => {
        console.error('Could not subscribe to sign-in changes', error);
        if (mounted.current) loadStatus();
      }
    );
    return () => {
      mounted.current = false;
      if (unlisten) unlisten();
    };
  }, [loadStatus]);

  // One action at a time: the buttons are disabled while a command runs.
  const run = useCallback(async action => {
    setBusy(true);
    setCommandError(null);
    try {
      const next = await action();
      if (mounted.current && next) setStatus(next);
    } catch (error) {
      if (mounted.current) setCommandError(error.authCode ?? 'unknown');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const login = provider => {
    setLastProvider(provider);
    return run(() => startLogin(provider));
  };

  const providerButtons = () =>
    PROVIDERS.map(provider => (
      <button
        key={provider}
        type="button"
        className="pa2 mr2 mv1 pointer"
        disabled={busy}
        onClick={() => login(provider)}
      >
        {t(provider === 'github' ? 'settings.account.loginGithub' : 'settings.account.loginGoogle')}
      </button>
    ));

  const state = status?.state;
  const providerName = status?.provider ? t(`settings.account.providers.${status.provider}`) : '';
  const alertCode = commandError ?? (state === 'error' || state === 'signed_out' ? status.errorCode : null);

  let body;
  if ((state === undefined || state === null) && loadFailed) {
    body = (
      <>
        <p role="alert">{t('settings.account.statusLoadFailed')}</p>
        <button type="button" className="pa2 mr2 mv1 pointer" onClick={loadStatus}>
          {t('settings.account.retry')}
        </button>
      </>
    );
  } else if (state === undefined || state === null) {
    body = <p>{t('settings.account.restoring')}</p>;
  } else if (state === 'unconfigured') {
    body = <p>{t('settings.account.unconfigured')}</p>;
  } else if (state === 'restoring') {
    body = <p>{t('settings.account.restoring')}</p>;
  } else if (state === 'pending') {
    body = (
      <>
        <p>{t('settings.account.pending')}</p>
        <button type="button" className="pa2 mr2 mv1 pointer" disabled={busy} onClick={() => run(cancelLogin)}>
          {t('settings.account.cancel')}
        </button>
      </>
    );
  } else if (state === 'signed_in') {
    body = (
      <>
        <p>
          {status.displayName
            ? t('settings.account.signedInAs', { provider: providerName, name: status.displayName })
            : t('settings.account.signedIn', { provider: providerName })}
        </p>
        {status.offline && <p>{t('settings.account.offline')}</p>}
        {SYNC_STATUSES.includes(syncStatus) && (
          <p>
            {t('settings.account.sync.title')}: {t(`settings.account.sync.${syncStatus}`)}
          </p>
        )}
        <button type="button" className="pa2 mr2 mv1 pointer" disabled={busy} onClick={() => run(logout)}>
          {t('settings.account.logout')}
        </button>
      </>
    );
  } else if (state === 'expired') {
    body = (
      <>
        <p>{t('settings.account.expired')}</p>
        <p>{t('settings.account.signInAgain')}</p>
        {providerButtons()}
      </>
    );
  } else if (state === 'error') {
    body = (
      <>
        {lastProvider && (
          <button type="button" className="pa2 mr2 mv1 pointer" disabled={busy} onClick={() => login(lastProvider)}>
            {t('settings.account.retry')}
          </button>
        )}
        <div>{providerButtons()}</div>
      </>
    );
  } else {
    // signed_out
    body = (
      <>
        <p>{t('settings.account.signedOut')}</p>
        {providerButtons()}
      </>
    );
  }

  return (
    <div className="AccountSettings">
      <h3>{t('settings.account.title')}</h3>
      <p>{t('settings.account.intro')}</p>
      {alertCode && <p role="alert">{errorMessage(alertCode)}</p>}
      <div aria-live="polite" aria-busy={busy}>
        {body}
        {status?.persistence === 'unavailable' && state !== 'unconfigured' && (
          <p>{t('settings.account.persistenceUnavailable')}</p>
        )}
      </div>
    </div>
  );
}
