import React, { Fragment } from 'react';
import { withTranslation } from 'react-i18next';
import { getContext } from '../../../common/context';
import { redeemCode, OUTCOME } from '../../../common/unlocks';
import AsyncInputBox from './AsyncInputBox';

class UnlocksTab extends React.Component {
  // Resolves { success, message } for AsyncInputBox. The server decides whether
  // the code is valid and whether this account has used it (see common/unlocks).
  async validateCode(code) {
    const { t } = this.props;
    const result = await redeemCode(code);

    switch (result.outcome) {
      case OUTCOME.REDEEMED: {
        const item = (getContext('items') || {})[result.itemKey];
        if (!result.installed || !item) {
          return { success: true, message: t('ui.unlocks.itemUnavailable') };
        }
        return {
          success: true,
          message: t('ui.unlocks.redeemed', { item: item.displayName }),
        };
      }
      // The item was granted again if the local copy had lost it.
      case OUTCOME.ALREADY_REDEEMED:
        return { success: false, message: t('ui.unlocks.alreadyUsed') };
      case OUTCOME.INVALID:
        return { success: false, message: t('ui.unlocks.invalid') };
      case OUTCOME.LOGIN_REQUIRED:
        return { success: false, message: t('ui.unlocks.loginRequired') };
      default:
        return { success: false, message: t('ui.unlocks.networkError') };
    }
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
