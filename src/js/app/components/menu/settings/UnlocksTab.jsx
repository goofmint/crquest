import React, { Fragment } from 'react';
import { withTranslation } from 'react-i18next';
import { Firestore } from '../../../common/firebase.js';
import { addItems } from '../../context_provider/itemsHelper';
import { getContext, setContext } from '../../../common/context';
import ga from '../../../common/analytics';
import AsyncInputBox from './AsyncInputBox';

function isCodeUsed(code) {
  const unlockCodes = getContext('unlockCodes');

  if (unlockCodes === null) {
    return false;
  }

  return unlockCodes.includes(code);
}

function markCodeUsed(code) {
  let unlockCodes = getContext('unlockCodes');

  if (unlockCodes === null) {
    unlockCodes = [];
  }

  setContext({ unlockCodes: [...unlockCodes, code] });
}

function getItem(itemKey) {
  const items = getContext('items');

  return items[itemKey];
}

class UnlocksTab extends React.Component {
  validateCode(code) {
    const { t } = this.props;
    return new Promise(resolve => {
      if (isCodeUsed(code)) {
        return resolve({ success: false, message: t('ui.unlocks.alreadyUsed') });
      }

      Firestore.collection('unlockCodes')
        .where('codeValue', '==', code)
        .get()
        .then(({ docs }) => {
          if (docs.length === 0) {
            // Code is not registered in Firebase
            return resolve({
              success: false,
              message: t('ui.unlocks.invalid'),
            });
          }

          if (docs.length > 1) {
            console.warn(
              `More than one unlock code in Firebase matches this code, "${code}".`
            );
          }

          const [unlockCodeDoc] = docs;
          const response = unlockCodeDoc.data();

          addItems([response.unlockItemName]);
          markCodeUsed(response.codeValue);

          ga.event(
            'Promotions',
            'Unlock Code Redeemed',
            response.codeValue,
            null,
            'Settings > Unlocks',
            '/menu/settings'
          );

          const redeemedReward = getItem(response.unlockItemName).displayName;

          return resolve({
            success: true,
            message: t('ui.unlocks.redeemed', { item: redeemedReward }),
          });
        });
    });
  }

  render() {
    const { t } = this.props;
    return (
      <Fragment>
        <h3>{t('ui.unlocks.title')}</h3>
        <p>
          {t('ui.unlocks.description')}
        </p>
        <h4 className="mv2">{t('ui.unlocks.code')}</h4>
        <AsyncInputBox
          inputLabel={t('ui.unlocks.code')}
          onFocus={this.props.onFocus}
          onBlur={this.props.onBlur}
          defaultButtonLabel={t('ui.unlocks.redeem')}
          resolvingButtonLabel={t('ui.unlocks.redeeming')}
          onSubmit={code => this.validateCode(code)}
        />
      </Fragment>
    );
  }
}

export default withTranslation()(UnlocksTab);
