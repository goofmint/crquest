import React from 'react';
import { Trans, withTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import ga from '../../../common/analytics';
import CharacterDiagram from './CharacterDiagram';
import ItemBrowser from './ItemBrowser';

class Inventory extends React.Component {
  componentDidMount() {
    ga.pageview('/menu/inventory', 'Inventory Screen');
  }

  render() {
    return (
      <div className="inventory-menu flex flex-column h-100">
        <div className="flex-auto flex">
          <CharacterDiagram />
          <ItemBrowser />
        </div>
        <div className="tc pt2">
          <Trans i18nKey="ui.inventory.equip" components={{ strong: <strong /> }} />
        </div>
      </div>
    );
  }
}

export default withTranslation()(Inventory);
