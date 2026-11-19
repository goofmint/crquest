import React, { Fragment } from 'react';
import { withTranslation } from 'react-i18next';
import AsyncInputBox from './AsyncInputBox';
import { joinOperation, getJoinedOperations, disconnectOperation } from '../../../common/operations';

class JoinOperationView extends React.Component {
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
        onSubmit={joinOperation}
        onSuccess={onSuccess}
        enableSubmitHotkey={enableSubmitHotkey}
      />
    );
  }
}

class CurrentOperationView extends React.Component {
  render() {
    const { t } = this.props;
    const operations = getJoinedOperations();
    
    return (
      <>
        <h4 className="mt4">{t('ui.operations.current')}</h4>
        {operations ? 
          operations.map(
            operation => (
            <Fragment key={operation.id}>
              <h5 className="mv2">{operation.displayName}</h5>
              <div className={`mb3 red`}>
                <span className={`pb1 bb b--red pointer`} 
                  onClick={() => disconnectOperation(operation)}>
                    {t('ui.operations.leave')}
                </span>
              </div>
            </Fragment>
          )
          ) : (
          <p>{t('ui.operations.empty')}</p>
        )}
      </>
    );
  }
}

export const JoinOperation = withTranslation()(JoinOperationView);

export const CurrentOperation = withTranslation()(CurrentOperationView);
