import React from 'react';
import { withTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import cx from 'classnames';

class ItemTabs extends React.Component {
  static propTypes = {
    tabs: PropTypes.array.isRequired,
    selectedTab: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
  };
  static defaultProps = {};

  render() {
    const { t } = this.props;
    const allTabClass = cx('bw1 pa2 bl bt br', {
      'bb pointer': this.props.selectedTab !== 'all',
    });

    const getTabClass = name => {
      return cx('bw1 pa2 bt br', {
        'bb pointer': this.props.selectedTab !== name,
      });
    };

    return (
      <div className="item-tabs flex flex-no-shrink ttc">
        <div
          className={allTabClass}
          onClick={this.props.onClick.bind(null, 'all')}
        >
          {t('ui.inventory.all')}
        </div>

        {this.props.tabs.map(tab => {
          return (
            <div
              className={getTabClass(tab.name)}
              onClick={this.props.onClick.bind(null, tab.name)}
              key={tab.name}
            >
              {t(`ui.inventory.${tab.name}`, { defaultValue: tab.name })}
            </div>
          );
        })}

        <div className="flex-auto bw1 bb" />
      </div>
    );
  }
}

export default withTranslation()(ItemTabs);
