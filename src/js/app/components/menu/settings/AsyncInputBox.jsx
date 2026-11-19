import React from 'react';
import { withTranslation } from 'react-i18next';
import PropTypes from 'prop-types';
import { keypress } from 'keypress.js';
import InlineButton from './InlineButton';
import InputTextField from './InputTextField';
import { isComposingKeypress } from '../../../common/isComposingKeypress';

class AsyncInputBox extends React.Component {
  static propTypes = {
    onFocus: PropTypes.func,
    onBlur: PropTypes.func,
    autoFocus: PropTypes.bool,
    inputLabel: PropTypes.string,
    defaultButtonLabel: PropTypes.string,
    resolvingButtonLabel: PropTypes.string,
    enableSubmitHotkey: PropTypes.bool,
    onSuccess: PropTypes.func,
  };

  static defaultProps = {
    autoFocus: true,
    enableSubmitHotkey: true,
    onSuccess: () => {},
  };

  states = {
    RESOLVING: 'RESOLVING',
    INVALID: 'INVALID',
    VALID: 'VALID',
    DEFAULT: 'DEFAULT',
  };

  state = {
    currentState: this.states.DEFAULT,
    value: '',
    message: '',
  };

  buttonRef = React.createRef();

  attachSubmitHotkey() {
    this.keyPressListener = new keypress.Listener();

    this.keyPressListener.simple_combo('enter', event => {
      if (!isComposingKeypress(event)) {
        this.buttonRef.current.click();
      }
    });
  }

  deattachSubmitHotKey() {
    if (this.keyPressListener) {
      this.keyPressListener.stop_listening();
    }
  }

  componentDidMount() {
    const { enableSubmitHotkey } = this.props;

    if (enableSubmitHotkey) {
      this.attachSubmitHotkey();
    }
  }

  componentWillUnmount() {
    this.deattachSubmitHotKey();
  }

  componentDidUpdate(prevProps, prevState) {
    const { currentState } = this.state;
    const { enableSubmitHotkey } = this.props;

    if (prevProps.enableSubmitHotkey && !enableSubmitHotkey) {
      this.deattachSubmitHotKey();
    }

    if (!prevProps.enableSubmitHotkey && enableSubmitHotkey) {
      this.attachSubmitHotkey();
    }

    if (
      prevState.currentState !== this.states.VALID &&
      currentState === this.states.VALID
    ) {
      this.props.onSuccess();
    }
  }

  render() {
    const { t } = this.props;
    const { onFocus, onBlur, onSubmit, autoFocus } = this.props;
    const { currentState, value } = this.state;

    return (
      <>
        <InputTextField
          aria-label={this.props.inputLabel}
          onFocus={onFocus}
          onBlur={onBlur}
          onChange={evt => {
            if (currentState !== this.states.RESOLVING) {
              this.setState({
                value: evt.target.value,
                currentState: this.states.DEFAULT,
              });
            }
          }}
          value={value}
          invalid={currentState === this.states.INVALID}
          autoFocus={autoFocus}
        />
        <InlineButton
          label={this.getButtonLabel()}
          buttonRef={this.buttonRef}
          onClick={() => {
            // Only allow one code submission at once
            if (currentState === this.states.RESOLVING) {
              return;
            }

            // mark submission in progress
            this.setState({
              currentState: this.states.RESOLVING,
            });

            onSubmit(value).then(({ success, message }) => {
              if (success) {
                this.setState({
                  currentState: this.states.VALID,
                  value: '',
                  message: message || t('ui.asyncInput.success'),
                });
              } else {
                this.setState({
                  currentState: this.states.INVALID,
                  message: message || t('ui.asyncInput.error'),
                });
              }
            });
          }}
          disabled={currentState === this.states.RESOLVING}
        />
        <span
          style={{
            color: this.getMessageColor(),
            display: this.shouldShowMessage() ? 'inline-block' : 'none',
          }}
          className="f6 ml4 shake"
        >
          {this.state.message}
        </span>
      </>
    );
  }

  getButtonLabel() {
    switch (this.state.currentState) {
      case this.states.DEFAULT:
      case this.states.INVALID:
      case this.states.VALID:
      default:
        return this.props.defaultButtonLabel ?? this.props.t('ui.asyncInput.submit');
      case this.states.RESOLVING:
        return this.props.resolvingButtonLabel ?? this.props.t('ui.asyncInput.submitting');
    }
  }

  getMessageColor() {
    switch (this.state.currentState) {
      case this.states.INVALID:
        return '#ff0000';
      case this.states.VALID:
        return '#00ff00';
      default:
        return '#ffffff';
    }
  }

  shouldShowMessage() {
    switch (this.state.currentState) {
      case this.states.INVALID:
      case this.states.VALID:
        return true;
      default:
        return false;
    }
  }
}

export default withTranslation(undefined)(AsyncInputBox);
