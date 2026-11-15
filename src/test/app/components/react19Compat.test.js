import React from 'react';
import { render, screen, act } from '@testing-library/react';

vi.mock('../../../js/app/common/context', () => ({
  context: require('react').createContext({}),
  setContext: vi.fn(),
}));

import { context } from '../../../js/app/common/context';
import FogOwlFlying from '../../../js/app/components/FogOwlFlying';
import NameStep from '../../../js/app/components/onboarding_interface/NameStep';

// React 19 removed findDOMNode (used by react-transition-group's Transition
// unless nodeRef is given) and treats a value returned from a callback ref as
// a cleanup function. These tests fail on React 19 if either comes back.
// Jest's fake timers are not supported by the Electron test environment, so
// capture the timers the component and Transition schedule and fire them by hand.
let timers;
function runTimers(ms) {
  const due = timers.filter(timer => timer.ms === ms);
  timers = timers.filter(timer => timer.ms !== ms);
  act(() => due.forEach(timer => timer.fn()));
}

describe('React 19 compatibility', () => {
  let setTimeoutSpy;
  beforeEach(() => {
    timers = [];
    setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation((fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    });
  });
  afterEach(() => {
    setTimeoutSpy.mockRestore();
  });

  test('FogOwlFlying runs its Transition through to onExited', () => {
    const hide = vi.fn();
    const finishTransition = vi.fn();
    const { container } = render(
      <FogOwlFlying
        hide={hide}
        displayFsmState="showing"
        finishTransition={finishTransition}
      />
    );
    expect(container.firstChild).toHaveClass('animate__animated');
    expect(finishTransition).toHaveBeenCalledTimes(1);

    runTimers(5000);
    expect(container.firstChild).toHaveClass('animate__fadeOut');
    expect(hide).not.toHaveBeenCalled();

    runTimers(500);
    expect(hide).toHaveBeenCalledTimes(1);
  });

  test('NameStep keeps its callback ref and focuses the input when activated', () => {
    const props = { onClick: vi.fn(), setValid: vi.fn() };
    const wrap = isActive => (
      <context.Provider value={{ settings: { name: 'Ada' } }}>
        <NameStep {...props} isActive={isActive} />
      </context.Provider>
    );
    const { rerender } = render(wrap(false));
    const input = screen.getByRole('textbox');
    input.blur();
    expect(input).not.toHaveFocus();

    rerender(wrap(true));
    expect(input).toHaveFocus();
    expect(props.setValid).toHaveBeenCalledWith(true);
  });
});
