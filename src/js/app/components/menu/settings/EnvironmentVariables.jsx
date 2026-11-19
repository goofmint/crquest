import React from 'react';
import { withTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import ConcealedInputField from './ConcealedInputField';

class EnvironmentVariables extends React.Component {
  static propTypes = {
    env: PropTypes.object,
    onFocus: PropTypes.func,
    onBlur: PropTypes.func,
    onChange: PropTypes.func,
  };

  state = {
    envVarsLocked: true,
  };

  toggleEnvVarLock() {
    this.setState({ envVarsLocked: !this.state.envVarsLocked });
  }

  renderLockControl() {
    const { t } = this.props;
    return (
      <span key="envToggle"
        className="underline pointer"
        onClick={this.toggleEnvVarLock.bind(this)}
      >
        {this.state.envVarsLocked ? t('ui.variables.unlock') : t('ui.variables.lock')}
      </span>
    );
  }

  renderEmptyState() {
    const { t } = this.props;
    return (
      <h5>
        {t('ui.variables.empty')}
      </h5>
    );
  }

  render() {
    const { t } = this.props;
    const envKeys = Object.keys(this.props.env);

    return (
      <div>
        <h3 className="mb2" key="title">
          {t('ui.variables.title')}
        </h3>
        <p>
          {t('ui.variables.description')}
        </p>
        {!!envKeys.length ? this.renderLockControl() : this.renderEmptyState()}
        {envKeys
          .filter(key => this.props.env[key] !== undefined)
          .map(key => {
            const { value, concealed } = this.props.env[key];
            if (concealed) {
              return (
                <div key={key}>
                  <p className="mb2">{key}</p>
                  <ConcealedInputField
                    aria-label={key}
                    className="pa2 w-100 mw7"
                    onChange={value => this.props.onChange(key, value, 'env')}
                    type="text"
                    disabled={this.state.envVarsLocked}
                    onFocus={this.props.onFocus}
                    onBlur={this.props.onBlur}
                    value={'•'.repeat(value.length)}
                  />
                </div>
              );
            } else {
              return (
                <div key={key}>
                  <p className="mb2">{key}</p>
                  <input
                    aria-label={key}
                    className="pa2 w-100 mw7"
                    onChange={evt =>
                      this.props.onChange(key, evt.target.value, 'env')
                    }
                    type="text"
                    disabled={this.state.envVarsLocked}
                    onFocus={this.props.onFocus}
                    onBlur={this.props.onBlur}
                    value={value}
                  />
                </div>
              );
            }
          })}
      </div>
    );
  }
}

export default withTranslation()(EnvironmentVariables);
