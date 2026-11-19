import React from 'react';
import { Trans, withTranslation } from 'react-i18next';
import ga from '../../common/analytics';

class Help extends React.Component {
  componentDidMount() {
    ga.pageview('/menu/help', 'Help Screen');
  }

  render() {
    const { t } = this.props;
    return (
      <div className="Help pv3">
        <h2>{t('ui.menu.help')}</h2>

        <h4>{t('ui.help.movement')}</h4>
        <p>
          <Trans i18nKey="ui.help.move" components={{ strong: <strong /> }} />
        </p>
        <p>
          <Trans i18nKey="ui.help.interact" components={{ strong: <strong /> }} />
        </p>

        <h4>{t('ui.help.assistance')}</h4>
        <p>
          <Trans i18nKey="ui.help.discord" components={{ discord: <a href="https://twil.io/tq-discord" /> }} />
        </p>
      </div>
    );
  }
}

export default withTranslation()(Help);
