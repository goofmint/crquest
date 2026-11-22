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

  // Set synchronously on submit: `currentState` only changes after React
  // re-renders, so a second click in between would otherwise submit twice.
  submitting = false;
  unmounted = false;

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
    this.unmounted = false;
    const { enableSubmitHotkey } = this.props;

    if (enableSubmitHotkey) {
      this.attachSubmitHotkey();
    }
  }

  componentWillUnmount() {
    this.unmounted = true;
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

  // One submission at a time. A rejected `onSubmit` is an error result (the
  // input never stays stuck in RESOLVING), and nothing is set after unmount.
  async submit(value) {
    const { t, onSubmit } = this.props;

    if (this.submitting) {
      return;
    }
    this.submitting = true;
    this.setState({ currentState: this.states.RESOLVING });

    let outcome;
    try {
      outcome = await onSubmit(value);
    } catch (error) {
      console.error('AsyncInputBox: the submission failed', error);
      outcome = { success: false };
    }
    this.submitting = false;

    if (this.unmounted) {
      return;
    }
    const { success, message } = outcome || { success: false };
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
  }

  render() {
    const { t } = this.props;
    const { onFocus, onBlur, autoFocus } = this.props;
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
          onClick={() => this.submit(value)}
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
