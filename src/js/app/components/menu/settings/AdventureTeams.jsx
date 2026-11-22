import React, { Fragment } from 'react';
import { withTranslation } from 'react-i18next';
import AsyncInputBox from './AsyncInputBox';
import { joinTeam, getJoinedTeams, disconnectTeam } from '../../../common/teams';

class JoinTeamView extends React.Component {
  render() {
    const { t } = this.props;
    const { enableSubmitHotkey, onSuccess = () => {} } = this.props;
    return (
      <AsyncInputBox
        inputLabel={t('ui.membership.code')}
        onFocus={this.props.onFocus}
        onBlur={this.props.onBlur}
        defaultButtonLabel={t('ui.membership.join')}
        resolvingButtonLabel={t('ui.membership.joining')}
        onSubmit={joinTeam}
        onSuccess={onSuccess}
        enableSubmitHotkey={enableSubmitHotkey}
      />
    );
  }
}

class CurrentTeamView extends React.Component {
  state = { message: null, leaving: false };

  leave = async team => {
    if (this.state.leaving) {
      return;
    }
    this.setState({ leaving: true, message: null });
    const result = await disconnectTeam(team);
    if (this._unmounted) {
      return;
    }
    this.setState({ leaving: false, message: result.success ? null : result.message });
  };

  componentWillUnmount() {
    this._unmounted = true;
  }

  render() {
    const { t } = this.props;
    const teams = getJoinedTeams();
    
    return (
      <>
        <h4 className="mt4">{t('ui.teams.current')}</h4>
        {teams ? 
          teams.map(
            team => (
            <Fragment key={team.id}>
              <h5 className="mv2">{team.displayName}</h5>
              <div className={`mb3 red`}>
                <span className={`pb1 bb b--red pointer`}
                    onClick={() => this.leave(team)}>
                  {t('ui.teams.leave')}
                </span>
              </div>
            </Fragment>
          )
          ) : (
          <p>{t('ui.teams.empty')}</p>
        )}
        {this.state.message && <p className="red">{this.state.message}</p>}
      </>
    );
  }
}

export const JoinTeam = withTranslation()(JoinTeamView);

export const CurrentTeam = withTranslation()(CurrentTeamView);
