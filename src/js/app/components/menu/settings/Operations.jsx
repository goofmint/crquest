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
  state = { message: null, leaving: false };

  leave = async operation => {
    if (this.state.leaving) {
      return;
    }
    this.setState({ leaving: true, message: null });
    const result = await disconnectOperation(operation);
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
                  onClick={() => this.leave(operation)}>
                    {t('ui.operations.leave')}
                </span>
              </div>
            </Fragment>
          )
          ) : (
          <p>{t('ui.operations.empty')}</p>
        )}
        {this.state.message && <p className="red">{this.state.message}</p>}
      </>
    );
  }
}

export const JoinOperation = withTranslation()(JoinOperationView);

export const CurrentOperation = withTranslation()(CurrentOperationView);
