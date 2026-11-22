import React, { useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { getAuthStatus, onAuthStatusChange } from '../../../platform/auth';
import {
  listLiveEvents,
  getLiveEventRanking,
  getLiveEventTeamRanking,
  joinLiveEvent,
  updateLiveEventParticipation,
  getMyLiveEventStatus,
} from '../../../platform/liveEvents';
import { getLanguage, t } from '../../../i18n';

const PAGE_SIZE = 20;
const MAX_NAME_LENGTH = 32;
const ERROR_CODES = [
  'signed_out',
  'account_changed',
  'offline',
  'server',
  'unauthorized',
  'rejected',
  'event_not_found',
  'event_closed',
  'not_eligible',
  'invalid_display_name',
  'already_participant',
  'not_participant',
];

function errorText(error) {
  const code = error && error.liveEventCode;
  return t(`settings.liveEvents.errors.${ERROR_CODES.includes(code) ? code : 'unknown'}`);
}

function formatDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return date.toLocaleString(getLanguage());
  } catch (error) {
    return date.toLocaleString();
  }
}

/**
 * Live events: join with a public display name, and the public individual and
 * team rankings. The server is the only source of truth: nothing here is kept
 * in the game context or the cloud save, and every score comes from the
 * certified achievements on the server. Reading works signed out; joining needs
 * the optional sign-in (Account tab).
 */
export default function LiveEventsSettings({ name, onFocus, onBlur }) {
  const [authStatus, setAuthStatus] = useState(null);
  const [events, setEvents] = useState(null);
  const [eventsError, setEventsError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState('individual');
  const [offset, setOffset] = useState(0);
  const [ranking, setRanking] = useState({ state: 'loading', rows: [], total: 0 });
  const [mine, setMine] = useState({ state: 'idle', value: null });
  const [form, setForm] = useState({ displayName: name || '', show: true });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);
  // Separate triggers: a ranking retry must not refetch (and overwrite) the participation form.
  const [listReload, setListReload] = useState(0);
  const [rankingReload, setRankingReload] = useState(0);
  const [statusReload, setStatusReload] = useState(0);
  const mounted = useRef(true);
  // The current target, read when an async call finishes.
  const target = useRef({ account: null, selectedId: null });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Sign-in status (secret-free). A change of account discards the own status.
  useEffect(() => {
    let unlisten = null;
    let eventSeen = false;
    let cancelled = false;
    onAuthStatusChange(next => {
      if (!cancelled) {
        eventSeen = true;
        setAuthStatus(next);
      }
    }).then(
      stop => {
        if (cancelled) {
          stop();
          return;
        }
        unlisten = stop;
        getAuthStatus().then(
          next => {
            if (!cancelled && !eventSeen) setAuthStatus(next);
          },
          () => {}
        );
      },
      () => {
        getAuthStatus().then(
          next => {
            if (!cancelled && !eventSeen) setAuthStatus(next);
          },
          () => {}
        );
      }
    );
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  const account = authStatus && authStatus.state === 'signed_in' && authStatus.account ? authStatus.account : null;

  target.current = { account, selectedId };

  // The event list.
  useEffect(() => {
    let cancelled = false;
    setEventsError(null);
    listLiveEvents().then(
      list => {
        if (cancelled) return;
        setEvents(list);
        setSelectedId(current =>
          current && list.some(e => e.eventId === current) ? current : list.length ? list[0].eventId : null
        );
      },
      error => {
        if (!cancelled) setEventsError(error);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [listReload]);

  // The ranking page. A response that arrives after the selection changed is ignored.
  useEffect(() => {
    if (!selectedId) return undefined;
    let cancelled = false;
    setRanking(current => ({ ...current, state: 'loading' }));
    const fetchPage = view === 'team' ? getLiveEventTeamRanking : getLiveEventRanking;
    fetchPage(selectedId, { limit: PAGE_SIZE, offset }).then(
      page => {
        if (!cancelled) setRanking({ state: 'ready', rows: page.rows, total: page.total });
      },
      error => {
        if (!cancelled) setRanking({ state: 'error', rows: [], total: 0, error });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [selectedId, view, offset, rankingReload]);

  // The own status. Dropped at once when the account or the event changes,
  // and a late answer for the previous account or event is ignored.
  useEffect(() => {
    // Nothing of the previous account or event is carried over: back to the defaults.
    setFormError(null);
    setNotice(null);
    setForm({ displayName: name || '', show: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the target resets the form
  }, [account, selectedId]);

  useEffect(() => {
    setMine({ state: 'idle', value: null });
    if (!account || !selectedId) return undefined;
    let cancelled = false;
    setMine({ state: 'loading', value: null });
    getMyLiveEventStatus(account, selectedId).then(
      value => {
        if (cancelled) return;
        setMine({ state: 'ready', value });
        if (value.joined) setForm({ displayName: value.displayName || '', show: value.showInRanking !== false });
      },
      error => {
        if (!cancelled) setMine({ state: 'error', value: null, error });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [account, selectedId, statusReload]);

  const selectEvent = useCallback(id => {
    setSelectedId(id);
    setOffset(0);
  }, []);

  const submit = async event => {
    event.preventDefault();
    if (busy || !account || !selectedId || mine.state !== 'ready') return;
    const joined = mine.value.joined;
    const submittedAccount = account;
    const submittedEvent = selectedId;
    const stillCurrent = () =>
      mounted.current && target.current.account === submittedAccount && target.current.selectedId === submittedEvent;
    setBusy(true);
    setFormError(null);
    setNotice(null);
    try {
      if (joined) {
        await updateLiveEventParticipation(account, selectedId, {
          displayName: form.displayName,
          showInRanking: form.show,
        });
      } else {
        await joinLiveEvent(account, selectedId, form.displayName, form.show);
      }
      if (stillCurrent()) {
        setNotice(joined ? 'updated' : 'joined');
        setStatusReload(n => n + 1);
        setRankingReload(n => n + 1);
      }
    } catch (error) {
      if (stillCurrent()) setFormError(error);
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const selected = events && events.find(e => e.eventId === selectedId);
  const joined = mine.state === 'ready' && mine.value.joined;
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < ranking.total;
  const trimmedLength = form.displayName.trim().length;

  return (
    <div className="LiveEventsSettings">
      <h3>{t('settings.liveEvents.title')}</h3>
      <p>{t('settings.liveEvents.intro')}</p>

      <div aria-live="polite" aria-busy={events === null && !eventsError}>
        {eventsError && (
          <>
            <p role="alert">{errorText(eventsError)}</p>
            <button type="button" className="pa2 mr2 mv1 pointer" onClick={() => setListReload(n => n + 1)}>
              {t('settings.liveEvents.retry')}
            </button>
          </>
        )}
        {!eventsError && events === null && <p>{t('settings.liveEvents.loading')}</p>}
        {!eventsError && events && events.length === 0 && <p>{t('settings.liveEvents.none')}</p>}
      </div>

      {events && events.length > 0 && (
        <>
          <label htmlFor="live-event-select" className="db mv2 b">
            {t('settings.liveEvents.event')}
          </label>
          <select
            id="live-event-select"
            className="pa2"
            value={selectedId || ''}
            onChange={e => selectEvent(e.target.value)}
          >
            {events.map(e => (
              <option key={e.eventId} value={e.eventId}>
                {e.title}
              </option>
            ))}
          </select>
          {selected && (
            <p>
              {t(`settings.liveEvents.phase.${selected.phase}`, { defaultValue: '' })}{' '}
              {t('settings.liveEvents.period', { start: formatDate(selected.startsAt), end: formatDate(selected.endsAt) })}
            </p>
          )}

          <h4 className="mv2">{t('settings.liveEvents.participation')}</h4>
          <p>{t('settings.liveEvents.publicNotice')}</p>
          <div aria-live="polite" aria-busy={mine.state === 'loading' || busy}>
            {!account && <p>{t('settings.liveEvents.signInRequired')}</p>}
            {account && mine.state === 'loading' && <p>{t('settings.liveEvents.loading')}</p>}
            {account && mine.state === 'error' && (
              <>
                <p role="alert">{errorText(mine.error)}</p>
                <button type="button" className="pa2 mr2 mv1 pointer" onClick={() => setStatusReload(n => n + 1)}>
                  {t('settings.liveEvents.retry')}
                </button>
              </>
            )}
            {account && joined && (
              <p>
                {mine.value.rank === null || mine.value.rank === undefined
                  ? t('settings.liveEvents.statusHidden', { score: mine.value.score })
                  : t('settings.liveEvents.status', { rank: mine.value.rank, score: mine.value.score })}
              </p>
            )}
            {notice && <p>{t(`settings.liveEvents.notice.${notice}`)}</p>}
          </div>
          {formError && <p role="alert">{errorText(formError)}</p>}
          {account && mine.state === 'ready' && (
            <form onSubmit={submit}>
              <label htmlFor="live-event-name" className="db mv2 b">
                {t('settings.liveEvents.displayName')}
              </label>
              <input
                id="live-event-name"
                type="text"
                className="pa2 w-100 mw7"
                maxLength={MAX_NAME_LENGTH}
                value={form.displayName}
                disabled={busy}
                onFocus={onFocus}
                onBlur={onBlur}
                onChange={e => setForm({ ...form, displayName: e.target.value })}
              />
              <label className="db mv2">
                <input
                  type="checkbox"
                  checked={form.show}
                  disabled={busy}
                  onChange={e => setForm({ ...form, show: e.target.checked })}
                />{' '}
                {t('settings.liveEvents.showInRanking')}
              </label>
              <button
                type="submit"
                className="pa2 mr2 mv1 pointer"
                disabled={busy || trimmedLength === 0 || (!joined && selected && !selected.isOpen)}
              >
                {busy
                  ? t('settings.liveEvents.working')
                  : joined
                    ? t('settings.liveEvents.save')
                    : t('settings.liveEvents.join')}
              </button>
            </form>
          )}

          <h4 className="mt4 mb2">{t('settings.liveEvents.rankings')}</h4>
          <div>
            {['individual', 'team'].map(kind => (
              <button
                key={kind}
                type="button"
                className={`pa2 mr2 mv1 ${view === kind ? 'selected' : 'pointer'}`}
                aria-pressed={view === kind}
                onClick={() => {
                  setView(kind);
                  setOffset(0);
                }}
              >
                {t(`settings.liveEvents.view.${kind}`)}
              </button>
            ))}
          </div>
          <div aria-live="polite" aria-busy={ranking.state === 'loading'}>
            {ranking.state === 'error' && (
              <>
                <p role="alert">{errorText(ranking.error)}</p>
                <button type="button" className="pa2 mr2 mv1 pointer" onClick={() => setRankingReload(n => n + 1)}>
                  {t('settings.liveEvents.retry')}
                </button>
              </>
            )}
            {ranking.state === 'loading' && <p>{t('settings.liveEvents.loading')}</p>}
            {ranking.state === 'ready' && ranking.rows.length === 0 && <p>{t('settings.liveEvents.empty')}</p>}
          </div>
          {ranking.state === 'ready' && ranking.rows.length > 0 && (
            <table className="LiveEventsRanking">
              <thead>
                <tr>
                  <th scope="col">{t('settings.liveEvents.columns.rank')}</th>
                  <th scope="col">
                    {t(view === 'team' ? 'settings.liveEvents.columns.team' : 'settings.liveEvents.columns.player')}
                  </th>
                  <th scope="col">{t('settings.liveEvents.columns.score')}</th>
                  <th scope="col">{t('settings.liveEvents.columns.achievements')}</th>
                  {view === 'team' && <th scope="col">{t('settings.liveEvents.columns.contributors')}</th>}
                </tr>
              </thead>
              <tbody>
                {ranking.rows.map((row, index) => (
                  <tr key={`${offset + index}`}>
                    <td>{row.rank}</td>
                    <td>{row.displayName}</td>
                    <td>{row.score}</td>
                    <td>{row.achievementCount}</td>
                    {view === 'team' && <td>{row.contributorCount}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {ranking.state === 'ready' && (ranking.total > PAGE_SIZE || offset > 0) && (
            <div className="mt2">
              <button
                type="button"
                className="pa2 mr2 pointer"
                disabled={!hasPrev}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              >
                {t('settings.liveEvents.previous')}
              </button>
              <button
                type="button"
                className="pa2 mr2 pointer"
                disabled={!hasNext}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                {t('settings.liveEvents.next')}
              </button>
              {ranking.rows.length > 0 && (
                <span>
                  {t('settings.liveEvents.pageRange', {
                    from: offset + 1,
                    to: Math.min(offset + PAGE_SIZE, ranking.total),
                    total: ranking.total,
                  })}
                </span>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

LiveEventsSettings.propTypes = {
  /** The game's player name: only suggested as the initial public display name. */
  name: PropTypes.string,
  onFocus: PropTypes.func,
  onBlur: PropTypes.func,
};
