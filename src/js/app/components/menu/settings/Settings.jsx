import React from 'react';
import PropTypes from 'prop-types';
import cx from 'classnames';
import update from 'immutability-helper';
import merge from 'lodash.merge';
import ClearDataButton from '../../ClearDataButton';
import ga from '../../../common/analytics';
import sharedListener from '../../../common/listener';
import AvatarSelector from '../../AvatarSelector';
import EnvironmentVariables from './EnvironmentVariables';
import { JoinTeam, CurrentTeam } from './AdventureTeams';
import { JoinOperation, CurrentOperation } from './Operations';
import { setContext, getContext, flushPendingSaves, saveLanguagePreference } from '../../../common/context';
import AudioTab from './AudioTab';
import UnlocksTab from './UnlocksTab';
import Credits from './Credits';
import AccountSettings from './AccountSettings';
import Extensions from './Extensions';
import { getGamePackageVersion } from '../../../platform/paths';
import { showConfirm } from '../../../platform/dialog';
import { getLanguage, isSupportedLanguage, LANGUAGES, t } from '../../../i18n';

const SUBNAV_SECTIONS = [
  'Audio',
  'User',
  'Variables',
  'Extensions',
  'Teams',
  'Operations',
  'Unlocks',
  'Account',
  'Credits',
];

export default class Settings extends React.Component {
  static propTypes = {
    subnav: PropTypes.string,
    env: PropTypes.object,
    name: PropTypes.string,
    avatar: PropTypes.number,
  };

  static defaultProps = {
    subnav: SUBNAV_SECTIONS[0],
  };

  state = {
    saved: false,
    changingLanguage: false,
    languageError: false,
    inputFocused: false,
    showGuid: false,
    gameVersion: undefined,
    gameVersionError: undefined,
  };

  componentDidMount() {
    this.isComponentMounted = true;
    getGamePackageVersion().then(
      (gameVersion) => {
        if (this.isComponentMounted) {
          this.setState({ gameVersion });
        }
      },
      (error) => {
        console.error('Failed to load game version', error);
        if (this.isComponentMounted) {
          this.setState({ gameVersionError: error.message });
        }
      }
    );
    ga.pageview(`/menu/settings/${this.props.subnav}`, `Settings: ${this.props.subnav}`);
  }

  componentWillUnmount() {
    this.isComponentMounted = false;
    window.clearTimeout(this.timeoutID);
    if (this.state.inputFocused) sharedListener.listen();
  }

  componentDidUpdate(prevProps) {
    if (this.props.subnav !== prevProps.subnav) {
      // We have changed our subnav location
      ga.pageview(`/menu/settings/${this.props.subnav}`, `Settings: ${this.props.subnav}`);    
    }
  }

  save(key, value, type = 'setting') {
    if (this.languageChangePending) return;
    if (type === 'setting') {
      setContext({ settings: { ...getContext('settings'), [key]: value } });
    } else if (type === 'env') {
      // Use update helper to set nested property
      setContext({
        env: update(getContext('env'), { [key]: { $merge: { value } } }),
      });
    } else if (type === 'context') {
      // handle other context updates
      setContext({
        [key]: merge({}, getContext(key), value)
      })
    }

    window.clearTimeout(this.timeoutID);
    this.setState({ saved: false });
    this.timeoutID = window.setTimeout(() => {
      this.setState({ saved: true });
    }, 500);
  }

  async changeLanguage(language) {
    if (this.languageChangePending || !isSupportedLanguage(language) || language === getLanguage()) {
      return;
    }

    this.languageChangePending = true;
    this.setState({ changingLanguage: true, languageError: false });
    try {
      if (!(await showConfirm(t('settings.confirmLanguageChange')))) return;
      if (!this.isComponentMounted) return;
      await saveLanguagePreference(language);
      await flushPendingSaves();
      window.location.reload();
    } catch (error) {
      console.error('Could not change language:', error);
      if (this.isComponentMounted) this.setState({ languageError: true });
    } finally {
      this.languageChangePending = false;
      if (this.isComponentMounted) this.setState({ changingLanguage: false });
    }
  }

  onFocus() {
    sharedListener.stop_listening();
    this.setState({ inputFocused: true });
  }

  onBlur() {
    sharedListener.listen();
    this.setState({ inputFocused: false });
  }

  onToggleGuid() {
    this.setState({
      showGuid: !this.state.showGuid
    });
  }

  render() {
    return (
      <div className="settings-menu pv3 overflow-y-scroll h-100">
        <ClearDataButton />
        <h2 className="mb1">{t('settings.title')}</h2>
        <p className="game-version gray">
          TerminalQuest
          {this.state.gameVersion !== undefined && ` v${this.state.gameVersion}`}
          {this.state.gameVersionError !== undefined &&
            ` (${t('settings.versionError', { error: this.state.gameVersionError })})`}
          {' '}|&nbsp;
          {
            (this.state.showGuid) ? 
              <span>
                {ga.analyticsId}
                &nbsp;<span style={{
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }} onClick={() => this.onToggleGuid()}>
                  {t('settings.hideGuid')}
                </span>
              </span>
              
            : 
              <span style={{
                textDecoration: 'underline',
                cursor: 'pointer'
              }} onClick={() => this.onToggleGuid()}>
                {t('settings.showGuid')}
              </span>
          }
        </p>

        <div className="flex mt1">
          <div className="w-25 contents">
            {SUBNAV_SECTIONS.map(section => (
              <h5 key={section} className="mr3 mv2">
                <button
                  type="button"
                  className={`subnav-button pa2 ${
                    this.props.subnav !== section ? 'pointer' : 'selected'
                  }`}
                  disabled={this.state.changingLanguage}
                  aria-current={this.props.subnav === section ? 'true' : undefined}
                  onClick={() => {
                    if (this.languageChangePending) return;
                    setContext({
                      currentMenu: { name: 'settings', subnav: section },
                    });
                  }}
                >
                  {t(`settings.tabs.${section}`)}
                </button>
              </h5>
            ))}
          </div>

          <div className="w-75">
            {this.props.subnav === 'User' && (
              <fieldset className="bn pa0 ma0" disabled={this.state.changingLanguage}>
                <h3>{t('settings.user')}</h3>
                <label htmlFor="settings-language" className="db mv2 b">
                  {t('settings.language')}
                </label>
                <select
                  id="settings-language"
                  className="pa2"
                  value={getLanguage()}
                  onFocus={this.onFocus.bind(this)}
                  onBlur={this.onBlur.bind(this)}
                  onChange={event => this.changeLanguage(event.target.value)}
                >
                  {Object.entries(LANGUAGES).map(([code, label]) => (
                    <option key={code} value={code} lang={code}>{label}</option>
                  ))}
                </select>
                {this.state.languageError && (
                  <p role="alert">{t('settings.languageError')}</p>
                )}
                <h4 className="mv2">{t('settings.name')}</h4>
                <input
                  autoFocus
                  className="pa2 w-100 mw7"
                  onChange={evt => this.save('name', evt.target.value)}
                  type="text"
                  onFocus={this.onFocus.bind(this)}
                  onBlur={this.onBlur.bind(this)}
                  value={this.props.name}
                />

                <h4 className="mb2 mt4">{t('settings.avatar')}</h4>
                <AvatarSelector
                  avatar={this.props.avatar}
                  hotkeysEnabled={!this.state.inputFocused && !this.state.changingLanguage}
                  selectAvatar={this.save.bind(this, 'avatar')}
                />
              </fieldset>
            )}

            {this.props.subnav === 'Variables' && (
              <EnvironmentVariables
                onFocus={this.onFocus.bind(this)}
                onBlur={this.onBlur.bind(this)}
                onChange={this.save.bind(this)}
                env={this.props.env}
              />
            )}

            {this.props.subnav === 'Extensions' && (
              <Extensions
                onFocus={this.onFocus.bind(this)}
                onBlur={this.onBlur.bind(this)}
                save={this.save.bind(this)}
              />
            )}

            {this.props.subnav === 'Audio' && <AudioTab />}

            {this.props.subnav === 'Account' && <AccountSettings />}

            {this.props.subnav === 'Credits' && <Credits />}

            {this.props.subnav === 'Teams' && (
              <div className="LiveEvents">
                <h3>{t('settings.teams')}</h3>
                <p>
                  {t('settings.teamsDescription')}
                </p>
                <h4 className="mv2">{t('settings.joinCode')}</h4>
                <JoinTeam
                  onFocus={this.onFocus.bind(this)}
                  onBlur={this.onBlur.bind(this)}
                />
                <CurrentTeam />
              </div>
            )}

            {this.props.subnav === 'Operations' && (
              <div className="LiveEvents">
                <h3>{t('settings.tabs.Operations')}</h3>
                <p>
                  {t('settings.operationsDescription')}
                </p>
                <h4 className="mv2">{t('settings.joinCode')}</h4>
                <JoinOperation
                  onFocus={this.onFocus.bind(this)}
                  onBlur={this.onBlur.bind(this)}
                />
                <CurrentOperation />
              </div>
            )}

            {this.props.subnav === 'Unlocks' && (
              <UnlocksTab
                onFocus={this.onFocus.bind(this)}
                onBlur={this.onBlur.bind(this)}
              />
            )}
          </div>
        </div>

        {this.state.saved && (
          <div
            className="tc gray absolute bottom-0 left-0 w-100 pt1 pb1"
            style={{ backgroundColor: '#1f243c' }}
          >
            {t('settings.saved')}
          </div>
        )}
      </div>
    );
  }
}
